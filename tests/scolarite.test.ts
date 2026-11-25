/**
 * End-to-end scenarios of the Scolarité module (spec §13).
 * Each suite starts the real server on a throwaway SQLite database.
 * Run with: npm test
 */
import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

interface TestServer {
  base: string;
  proc: ChildProcess;
  dir: string;
}

async function startServer(port: number, extraArgs: string[] = []): Promise<TestServer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uninotes-test-'));
  const proc = spawn(process.execPath, ['--import', 'tsx', 'server.ts', ...extraArgs], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'production',
      UNINOTES_DB_PATH: path.join(dir, 'test.db'),
      DEMO_MODE: '',
      ADMIN_PASSCODE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 20000);
    proc.stdout!.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on('exit', (code) => reject(new Error(`Server exited (${code})`)));
  });
  return { base: `http://127.0.0.1:${port}/api`, proc, dir };
}

function stopServer(server: TestServer) {
  server.proc.kill();
  fs.rmSync(server.dir, { recursive: true, force: true });
}

async function call(base: string, method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  return { status: res.status, body: json as any };
}

const STUDENT = { matricule: '2025-TST-001', nom: 'RAKOTO', prenom: 'Test', promotion: 'L3 Informatique' };
const ATTESTATION_DETAILS = { academicYear: '2025-2026', attestationType: 'SCOLARITE' };

describe('Module Scolarité — scénarios obligatoires', () => {
  let srv: TestServer;
  let api: (method: string, url: string, token?: string, body?: unknown) => ReturnType<typeof call>;
  let supToken: string;
  let agentToken: string;
  let agent2Token: string;
  let attestationId: string;
  let keySeq = 0;
  const newKey = () => `test-key-${Date.now()}-${++keySeq}`;

  function sellAttestation(token: string, overrides: Record<string, unknown> = {}) {
    return api('POST', '/scolarite/transactions', token, {
      serviceId: attestationId,
      idempotencyKey: newKey(),
      student: STUDENT,
      paymentConfirmed: true,
      amountReceived: 3000,
      expectedPrice: 3000,
      details: ATTESTATION_DETAILS,
      ...overrides,
    });
  }

  before(async () => {
    srv = await startServer(3901);
    api = (m, u, t, b) => call(srv.base, m, u, t, b);
    const setup = await api('POST', '/auth/setup', undefined, {
      fullName: 'Responsable Test',
      username: 'resp',
      password: 'secret123',
      agentFullName: 'Agent Un',
      agentUsername: 'agent1',
      agentPassword: 'secret123',
    });
    assert.equal(setup.status, 201);
    supToken = setup.body.token;
    await api('POST', '/users', supToken, { fullName: 'Agent Deux', username: 'agent2', role: 'AGENT', password: 'secret123' });
    agentToken = (await api('POST', '/auth/login', undefined, { username: 'agent1', password: 'secret123' })).body.token;
    agent2Token = (await api('POST', '/auth/login', undefined, { username: 'agent2', password: 'secret123' })).body.token;
    const services = (await api('GET', '/scolarite/services', agentToken)).body.services;
    attestationId = services.find((s: any) => s.code === 'ATTESTATION').id;
  });

  after(() => stopServer(srv));

  test('catalogue initial chargé depuis la base', async () => {
    const services = (await api('GET', '/scolarite/services', agentToken)).body.services;
    const prices = Object.fromEntries(services.map((s: any) => [s.code, s.price]));
    assert.deepEqual(prices, { RELEVE_NOTES: 2000, ATTESTATION: 3000, CERTIFICATION: 1000 });
  });

  test('1-4. vente d’attestation à 3 000 Ar, paiement cash, référence unique, production créée', async () => {
    const res = await sellAttestation(agentToken);
    assert.equal(res.status, 201);
    const tx = res.body.transaction;
    assert.equal(tx.priceAtTransaction, 3000);
    assert.equal(tx.paymentStatus, 'PAID');
    assert.equal(tx.paymentRecordStatus, 'PAYE');
    assert.equal(tx.paymentMethod, 'CASH');
    assert.match(tx.reference, /^SCOL-\d{8}-\d{4}$/);
    assert.equal(tx.productionStatus, 'A_PRODUIRE');

    const payment = await api('GET', `/scolarite/transactions/${tx.id}/payment`, agentToken);
    assert.equal(payment.body.payment.amount, 3000);
    assert.equal(payment.body.payment.status, 'PAYE');

    const second = await sellAttestation(agentToken);
    assert.notEqual(second.body.transaction.reference, tx.reference);
  });

  test('validation serveur : montant, champs obligatoires, tarif modifié', async () => {
    assert.equal((await sellAttestation(agentToken, { amountReceived: 2500 })).status, 400);
    assert.equal((await sellAttestation(agentToken, { details: { academicYear: '2025-2026' } })).status, 400);
    assert.equal((await sellAttestation(agentToken, { expectedPrice: 2000 })).status, 409);
  });

  test('5. production A_PRODUIRE → EN_PRODUCTION → PRET → REMIS, transitions incohérentes refusées', async () => {
    const tx = (await sellAttestation(agentToken)).body.transaction;
    const prId = tx.productionId;
    const move = (status: string, extra = {}) => api('POST', `/scolarite/production/${prId}/status`, agentToken, { status, ...extra });

    assert.equal((await move('PRET', { verified: true })).status, 409, 'saut de statut interdit');
    assert.equal((await api('GET', `/scolarite/production/${prId}/document`, agentToken)).status, 404, 'pas de document avant production');

    const started = await move('EN_PRODUCTION');
    assert.equal(started.status, 200);
    assert.equal(started.body.productionRequest.status, 'EN_PRODUCTION');
    assert.match(started.body.productionRequest.generatedDocumentReference, /^DOC-SCOL-.*-V1$/);

    const doc = await api('GET', `/scolarite/production/${prId}/document`, agentToken);
    assert.equal(doc.status, 200);
    assert.equal(doc.body.document.student.matricule, STUDENT.matricule);
    assert.equal(doc.body.document.details.academicYear, '2025-2026');

    assert.equal((await move('PRET')).status, 400, 'vérification obligatoire');
    assert.equal((await move('PRET', { verified: true })).body.productionRequest.status, 'PRET');
    const delivered = await move('REMIS', { deliveredTo: 'RAKOTO Test' });
    assert.equal(delivered.body.productionRequest.status, 'REMIS');
    assert.equal((await move('EN_PRODUCTION')).status, 409, 'aucun retour arrière après remise');

    const history = (await api('GET', `/scolarite/transactions/${tx.id}/history`, agentToken)).body.logs.map((l: any) => l.action);
    for (const action of [
      'TRANSACTION_CREATED',
      'PAYMENT_RECORDED',
      'TRANSACTION_PAYMENT_CONFIRMED',
      'PRODUCTION_REQUEST_CREATED',
      'PRODUCTION_STARTED',
      'PRODUCTION_VERIFIED',
      'PRODUCTION_DELIVERED',
    ]) {
      assert.ok(history.includes(action), `historique : ${action}`);
    }
  });

  test('6. le tableau de bord se met à jour (ventes et recettes)', async () => {
    const before = (await api('GET', '/scolarite/dashboard/summary', supToken)).body.summary;
    await sellAttestation(agentToken);
    const afterSale = (await api('GET', '/scolarite/dashboard/summary', supToken)).body.summary;
    assert.equal(afterSale.confirmedRevenue, before.confirmedRevenue + 3000);
    assert.equal(afterSale.totalTransactions, before.totalTransactions + 1);

    const byService = (await api('GET', '/scolarite/dashboard/by-service', supToken)).body.byService;
    assert.ok(byService.find((s: any) => s.serviceCode === 'ATTESTATION').confirmedRevenue >= 3000);
    const prod = (await api('GET', '/scolarite/dashboard/production-summary', supToken)).body.productionSummary;
    assert.ok(prod.toProduce >= 1);
  });

  test('7. le responsable consulte le détail d’une transaction', async () => {
    const tx = (await sellAttestation(agentToken)).body.transaction;
    const detail = await api('GET', `/scolarite/transactions/${tx.id}`, supToken);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.transaction.agentName, 'Agent Un');
    assert.equal(detail.body.transaction.details.attestationType, 'SCOLARITE');
  });

  test('8. un agent ne peut pas consulter le chiffre d’affaires global ni les ventes des autres', async () => {
    for (const url of [
      '/scolarite/dashboard/summary',
      '/scolarite/dashboard/by-service',
      '/scolarite/dashboard/by-agent',
      '/scolarite/dashboard/production-summary',
      '/scolarite/activity-logs',
    ]) {
      assert.equal((await api('GET', url, agentToken)).status, 403, url);
    }
    const tx = (await sellAttestation(agentToken)).body.transaction;
    assert.equal((await api('GET', `/scolarite/transactions/${tx.id}`, agent2Token)).status, 403);
    assert.equal(
      (await api('POST', `/scolarite/production/${tx.productionId}/status`, agent2Token, { status: 'EN_PRODUCTION' })).status,
      403
    );
    const list = (await api('GET', '/scolarite/transactions', agent2Token)).body.transactions;
    assert.ok(list.every((t: any) => t.agentUsername === 'agent2'));
    assert.equal((await api('PATCH', `/scolarite/services/${attestationId}/price`, agentToken, { price: 1 })).status, 403);
  });

  test('9. une double soumission ne crée pas deux ventes', async () => {
    const count = async () => (await api('GET', '/scolarite/transactions', supToken)).body.transactions.length;
    const before = await count();
    const payload = {
      serviceId: attestationId,
      idempotencyKey: newKey(),
      student: STUDENT,
      paymentConfirmed: true,
      amountReceived: 3000,
      details: ATTESTATION_DETAILS,
    };
    const [a, b] = await Promise.all([
      api('POST', '/scolarite/transactions', agentToken, payload),
      api('POST', '/scolarite/transactions', agentToken, payload),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
    const retry = await api('POST', '/scolarite/transactions', agentToken, payload);
    assert.equal(retry.status, 409);
    assert.equal(retry.body.duplicate, true);
    assert.equal(await count(), before + 1);
  });

  test('10. une annulation est tracée et ne supprime rien', async () => {
    const tx = (await sellAttestation(agentToken)).body.transaction;
    assert.equal((await api('POST', `/scolarite/transactions/${tx.id}/cancel`, agentToken, { reason: 'Erreur' })).status, 403);
    assert.equal((await api('POST', `/scolarite/transactions/${tx.id}/cancel`, supToken, { reason: '' })).status, 400);

    const cancelled = await api('POST', `/scolarite/transactions/${tx.id}/cancel`, supToken, { reason: 'Erreur de saisie' });
    assert.equal(cancelled.body.transaction.status, 'CANCELLED');
    assert.equal(cancelled.body.transaction.paymentRecordStatus, 'ANNULE');

    const still = await api('GET', `/scolarite/transactions/${tx.id}`, supToken);
    assert.equal(still.status, 200, 'la transaction est conservée');
    const history = (await api('GET', `/scolarite/transactions/${tx.id}/history`, supToken)).body.logs.map((l: any) => l.action);
    assert.ok(history.includes('TRANSACTION_CREATED'));
    assert.ok(history.includes('TRANSACTION_CANCELLED'));
    assert.ok(history.includes('PAYMENT_CANCELLED'));

    const move = await api('POST', `/scolarite/production/${tx.productionId}/status`, supToken, { status: 'EN_PRODUCTION' });
    assert.equal(move.status, 409, 'production gelée après annulation');
    assert.equal((await api('DELETE', `/scolarite/transactions/${tx.id}`, supToken)).status, 404, 'aucune route de suppression');
  });

  test('vente sans paiement : pas de production avant confirmation du cash', async () => {
    const res = await sellAttestation(agentToken, { paymentConfirmed: false, amountReceived: undefined });
    assert.equal(res.body.transaction.paymentStatus, 'UNPAID');
    assert.equal(res.body.transaction.productionId, null);
    const confirmed = await api('POST', `/scolarite/transactions/${res.body.transaction.id}/confirm-payment`, agentToken, {
      amountReceived: 3000,
    });
    assert.equal(confirmed.body.transaction.productionStatus, 'A_PRODUIRE');
    const again = await api('POST', `/scolarite/transactions/${res.body.transaction.id}/confirm-payment`, agentToken, {});
    assert.equal(again.status, 409);
  });

  test('modification de tarif historisée, prix des ventes passées conservé', async () => {
    const old = (await sellAttestation(agentToken)).body.transaction;
    assert.equal((await api('PATCH', `/scolarite/services/${attestationId}/price`, supToken, { price: 3500 })).status, 200);
    const logs = (await api('GET', '/scolarite/activity-logs?action=SERVICE_PRICE_CHANGED', supToken)).body.logs;
    assert.equal(logs[0].metadata.oldPrice, 3000);
    assert.equal(logs[0].metadata.newPrice, 3500);
    const reread = (await api('GET', `/scolarite/transactions/${old.id}`, supToken)).body.transaction;
    assert.equal(reread.priceAtTransaction, 3000);
    assert.equal((await api('POST', '/demo/reset', supToken)).status, 404, 'reset indisponible hors démo');
  });
});

describe('Mode démo', () => {
  let srv: TestServer;
  before(async () => {
    srv = await startServer(3902, ['--demo']);
  });
  after(() => stopServer(srv));

  test('comptes de démo, données fictives et réinitialisation', async () => {
    const status = await call(srv.base, 'GET', '/auth/status');
    assert.equal(status.body.demoMode, true);
    assert.equal(status.body.demoAccounts.length, 3);

    const login = await call(srv.base, 'POST', '/auth/login', undefined, { username: 'responsable', password: 'demo1234' });
    assert.equal(login.status, 200);
    const token = login.body.token;
    const summary = (await call(srv.base, 'GET', '/scolarite/dashboard/summary', token)).body.summary;
    assert.ok(summary.totalTransactions > 0);
    const prod = (await call(srv.base, 'GET', '/scolarite/dashboard/production-summary', token)).body.productionSummary;
    assert.ok(prod.toProduce > 0 && prod.inProduction > 0 && prod.ready > 0 && prod.delivered > 0);

    assert.equal((await call(srv.base, 'POST', '/demo/reset', token)).status, 200);
    const relog = await call(srv.base, 'POST', '/auth/login', undefined, { username: 'guichet1', password: 'demo1234' });
    assert.equal(relog.status, 200);
  });
});

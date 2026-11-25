import crypto from 'node:crypto';
import { Router } from 'express';
import { type AuthenticatedRequest, hashPassword, requireAuth, requireSupervisor } from './auth.ts';
import { isDemoMode } from './config.ts';
import { db, logActivity, runInTransaction, seedInitialData } from './db.ts';
import {
  createProductionRequest,
  generateTransactionReference,
  recordCashPayment,
  transitionProduction,
} from './scolarite-domain.ts';

/**
 * DEMO MODE ONLY — fictitious accounts and data, clearly identified as such.
 * Never loaded unless DEMO_MODE=true or --demo (see server/config.ts), and it
 * always runs against its own database file (data/uninotes-demo.db).
 */

export const DEMO_PASSWORD = 'demo1234';

export const DEMO_ACCOUNTS = [
  { id: 'demo-resp', username: 'responsable', fullName: 'Responsable Scolarité (démo)', role: 'SUPERVISOR' as const },
  { id: 'demo-agent-1', username: 'guichet1', fullName: 'Nomena Rabe (démo)', role: 'AGENT' as const },
  { id: 'demo-agent-2', username: 'guichet2', fullName: 'Tahiry Andria (démo)', role: 'AGENT' as const },
];

const DEMO_DETAILS: Record<string, Array<Record<string, string>>> = {
  'srv-attestation': [
    { academicYear: '2025-2026', attestationType: 'SCOLARITE', purpose: 'Dossier de bourse' },
    { academicYear: '2025-2026', attestationType: 'INSCRIPTION' },
    { academicYear: '2024-2025', attestationType: 'REUSSITE', purpose: 'Candidature master' },
  ],
  'srv-releve-notes': [
    { academicYear: '2025-2026', semester: 'S5' },
    { academicYear: '2024-2025', semester: 'S3' },
  ],
  'srv-certification': [
    { documentToCertify: 'Copie du diplôme de licence', copies: '2' },
    { documentToCertify: 'Copie du relevé de notes L2', copies: '1' },
  ],
};

type DemoFinalState = 'PENDING_PAYMENT' | 'A_PRODUIRE' | 'EN_PRODUCTION' | 'PRET' | 'REMIS' | 'CANCELLED';

function seedDemoUsers(): void {
  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO users (id, username, fullName, role, passwordHash, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  );
  for (const acc of DEMO_ACCOUNTS) {
    insert.run(acc.id, acc.username, acc.fullName, acc.role, hashPassword(DEMO_PASSWORD), now, now);
  }
}

/** Deterministic pseudo-random generator so the demo looks the same at each reset. */
function makeRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function seedDemoTransactions(): void {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM service_transactions').get() as { c: number }).c;
  if (count > 0) return;

  const students = db.prepare('SELECT id FROM students ORDER BY matricule').all() as Array<{ id: string }>;
  const services = db.prepare('SELECT id, code, name, price FROM services WHERE isActive = 1').all() as Array<{
    id: string;
    code: string;
    name: string;
    price: number;
  }>;
  if (students.length === 0 || services.length === 0) return;

  const rng = makeRng(42);
  const agents = ['demo-agent-1', 'demo-agent-2'];
  const supervisor = 'demo-resp';
  const DAY = 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  // ~28 sales spread over the last 35 days; older ones are further along.
  for (let i = 0; i < 28; i++) {
    const daysAgo = i < 4 ? 0 : Math.floor((i / 28) * 35);
    const created = new Date(nowMs - daysAgo * DAY - Math.floor(rng() * 6) * 60 * 60 * 1000 - 30 * 60 * 1000);
    const service = services[Math.floor(rng() * services.length)];
    const student = students[Math.floor(rng() * students.length)];
    const agent = agents[Math.floor(rng() * agents.length)];
    const variants = DEMO_DETAILS[service.id] ?? [{}];
    const details = variants[Math.floor(rng() * variants.length)];

    // The most recent sales cover every step of the workflow.
    const recentStates: DemoFinalState[] = [
      'PENDING_PAYMENT', 'A_PRODUIRE', 'EN_PRODUCTION', 'CANCELLED',
      'A_PRODUIRE', 'EN_PRODUCTION', 'PRET', 'PRET', 'A_PRODUIRE', 'PRET',
    ];
    const finalState: DemoFinalState = recentStates[i] ?? (daysAgo <= 10 && rng() < 0.3 ? 'PRET' : 'REMIS');

    const at = (offsetMinutes: number) => new Date(created.getTime() + offsetMinutes * 60 * 1000).toISOString();
    const createdIso = created.toISOString();
    const isPaid = finalState !== 'PENDING_PAYMENT';

    runInTransaction(() => {
      const txId = crypto.randomUUID();
      const reference = generateTransactionReference(created);
      db.prepare(
        `INSERT INTO service_transactions (
           id, reference, idempotencyKey, studentId, serviceId, performedByUserId,
           priceAtTransaction, status, paymentStatus, paymentConfirmedAt, paymentConfirmedByUserId,
           notes, details, createdAt, updatedAt
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        txId,
        reference,
        `demo-${i}`,
        student.id,
        service.id,
        agent,
        service.price,
        isPaid ? 'COMPLETED' : 'PENDING',
        isPaid ? 'PAID' : 'UNPAID',
        isPaid ? createdIso : null,
        isPaid ? agent : null,
        'Donnée de démonstration',
        JSON.stringify(details),
        createdIso,
        createdIso
      );
      logActivity(agent, 'TRANSACTION_CREATED', 'SERVICE_TRANSACTION', txId, {
        reference,
        serviceId: service.id,
        serviceName: service.name,
        priceAtTransaction: service.price,
        demo: true,
      }, createdIso);

      if (!isPaid) return;

      recordCashPayment(txId, service.price, agent, createdIso);
      logActivity(agent, 'TRANSACTION_PAYMENT_CONFIRMED', 'SERVICE_TRANSACTION', txId, {
        reference,
        amount: service.price,
        method: 'CASH',
        demo: true,
      }, createdIso);
      const prId = createProductionRequest(txId, agent, createdIso);

      if (finalState === 'CANCELLED') {
        const cancelAt = at(20);
        db.prepare(
          `UPDATE service_transactions SET status = 'CANCELLED', paymentStatus = 'REFUNDED',
             cancelReason = ?, cancelledByUserId = ?, cancelledAt = ?, updatedAt = ? WHERE id = ?`
        ).run('Erreur de prestation sélectionnée (démo)', supervisor, cancelAt, cancelAt, txId);
        db.prepare("UPDATE payments SET status = 'ANNULE', cancelledAt = ?, cancelledByUserId = ? WHERE transactionId = ?").run(
          cancelAt,
          supervisor,
          txId
        );
        logActivity(supervisor, 'TRANSACTION_CANCELLED', 'SERVICE_TRANSACTION', txId, {
          reference,
          reason: 'Erreur de prestation sélectionnée (démo)',
          amount: service.price,
          demo: true,
        }, cancelAt);
        return;
      }

      const steps: Array<{ status: 'EN_PRODUCTION' | 'PRET' | 'REMIS'; offset: number }> = [];
      if (['EN_PRODUCTION', 'PRET', 'REMIS'].includes(finalState)) steps.push({ status: 'EN_PRODUCTION', offset: 45 });
      if (['PRET', 'REMIS'].includes(finalState)) steps.push({ status: 'PRET', offset: 180 });
      if (finalState === 'REMIS') steps.push({ status: 'REMIS', offset: 60 * 24 });
      for (const step of steps) {
        transitionProduction(prId, step.status, agent, at(step.offset), {
          verified: true,
          deliveredTo: step.status === 'REMIS' ? 'L’étudiant en personne' : undefined,
        });
      }
    });
  }

  // One historised price change, to show the tariff history.
  logActivity(supervisor, 'SERVICE_PRICE_CHANGED', 'SERVICE', 'srv-certification', {
    serviceName: 'Certification',
    oldPrice: 800,
    newPrice: 1000,
    demo: true,
  }, new Date(nowMs - 40 * DAY).toISOString());
}

export function seedDemoData(): void {
  if (!isDemoMode()) return;
  seedDemoUsers();
  seedDemoTransactions();
}

/** Wipes the demo database and seeds it again. Demo mode only. */
export function resetDemoData(): void {
  if (!isDemoMode()) throw new Error('Réinitialisation disponible uniquement en mode démo.');
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec(`
      DELETE FROM production_requests;
      DELETE FROM payments;
      DELETE FROM activity_logs;
      DELETE FROM service_transactions;
      DELETE FROM grades;
      DELETE FROM students;
      DELETE FROM sessions;
      DELETE FROM users;
      DELETE FROM services;
    `);
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
  seedInitialData();
  seedDemoData();
}

export const demoRouter = Router();

demoRouter.post('/demo/reset', requireAuth, requireSupervisor, (_req: AuthenticatedRequest, res) => {
  if (!isDemoMode()) {
    res.status(404).json({ error: 'Mode démo inactif.' });
    return;
  }
  resetDemoData();
  res.json({ ok: true });
});

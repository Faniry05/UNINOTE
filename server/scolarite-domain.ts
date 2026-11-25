import crypto from 'node:crypto';
import { getInstitutionName } from './config.ts';
import { db, logActivity } from './db.ts';

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class DomainError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/* -------------------------------------------------------------------------- */
/* Transaction references                                                     */
/* -------------------------------------------------------------------------- */

export function generateTransactionReference(now: Date): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `SCOL-${yyyy}${mm}${dd}-`;

  const row = db
    .prepare('SELECT COUNT(*) AS count FROM service_transactions WHERE reference LIKE ?')
    .get(`${prefix}%`) as { count: number };

  let seq = row.count + 1;
  let candidate = `${prefix}${String(seq).padStart(4, '0')}`;
  while (db.prepare('SELECT 1 FROM service_transactions WHERE reference = ?').get(candidate)) {
    seq += 1;
    candidate = `${prefix}${String(seq).padStart(4, '0')}`;
  }
  return candidate;
}

/* -------------------------------------------------------------------------- */
/* Cash payment                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Records the cash payment confirmed by the agent. The application does not
 * (and cannot) verify the physical cash: it records the agent's confirmation.
 * Must be called inside a DB transaction.
 */
export function recordCashPayment(transactionId: string, amount: number, userId: string, now: string): string {
  const existing = db.prepare('SELECT id FROM payments WHERE transactionId = ?').get(transactionId);
  if (existing) {
    throw new DomainError('Un paiement est déjà enregistré pour cette transaction.', 409);
  }
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO payments (id, transactionId, amount, method, status, receivedByUserId, paidAt)
     VALUES (?, ?, ?, 'CASH', 'PAYE', ?, ?)`
  ).run(id, transactionId, amount, userId, now);

  logActivity(userId, 'PAYMENT_RECORDED', 'PAYMENT', id, { transactionId, amount, method: 'CASH' }, now);
  return id;
}

export function cancelPaymentForTransaction(transactionId: string, userId: string, now: string): void {
  const payment = db.prepare("SELECT id, amount FROM payments WHERE transactionId = ? AND status = 'PAYE'").get(transactionId) as
    | { id: string; amount: number }
    | undefined;
  if (!payment) return;
  db.prepare("UPDATE payments SET status = 'ANNULE', cancelledAt = ?, cancelledByUserId = ? WHERE id = ?").run(
    now,
    userId,
    payment.id
  );
  logActivity(userId, 'PAYMENT_CANCELLED', 'PAYMENT', payment.id, { transactionId, amount: payment.amount }, now);
}

/* -------------------------------------------------------------------------- */
/* Production requests                                                        */
/* -------------------------------------------------------------------------- */

export type ProductionStatus = 'A_PRODUIRE' | 'EN_PRODUCTION' | 'PRET' | 'REMIS';

/** Allowed forward-only transitions. */
export const PRODUCTION_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  A_PRODUIRE: ['EN_PRODUCTION'],
  EN_PRODUCTION: ['PRET'],
  PRET: ['REMIS'],
  REMIS: [],
};

export function isProductionStatus(value: unknown): value is ProductionStatus {
  return typeof value === 'string' && value in PRODUCTION_TRANSITIONS;
}

/** Creates the production request of a paid transaction. Must run inside a DB transaction. */
export function createProductionRequest(transactionId: string, userId: string, now: string): string {
  const tx = db
    .prepare(
      `SELECT t.id, t.reference, t.paymentStatus, sv.code AS serviceCode
       FROM service_transactions t JOIN services sv ON sv.id = t.serviceId WHERE t.id = ?`
    )
    .get(transactionId) as { id: string; reference: string; paymentStatus: string; serviceCode: string } | undefined;

  if (!tx) throw new DomainError('Transaction introuvable.', 404);
  if (tx.paymentStatus !== 'PAID') {
    throw new DomainError('La production ne peut être demandée qu’après confirmation du paiement.', 409);
  }
  const existing = db.prepare('SELECT id FROM production_requests WHERE transactionId = ?').get(transactionId) as
    | { id: string }
    | undefined;
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO production_requests (id, transactionId, documentType, status, requestedByUserId, createdAt, updatedAt)
     VALUES (?, ?, ?, 'A_PRODUIRE', ?, ?, ?)`
  ).run(id, transactionId, tx.serviceCode, userId, now, now);

  logActivity(
    userId,
    'PRODUCTION_REQUEST_CREATED',
    'PRODUCTION_REQUEST',
    id,
    { transactionId, reference: tx.reference, documentType: tx.serviceCode },
    now
  );
  return id;
}

/* -------------------------------------------------------------------------- */
/* Document generation (printable HTML document built from a data snapshot)   */
/* -------------------------------------------------------------------------- */

export interface GeneratedDocumentSnapshot {
  templateVersion: 1;
  documentReference: string;
  version: number;
  documentType: string;
  title: string;
  institutionName: string;
  generatedAt: string;
  transactionReference: string;
  student: { matricule: string; nom: string; prenom: string; promotion: string };
  details: Record<string, string>;
  grades: Array<{ semester: string; courseCode: string; courseName: string; credits: number; grade: number; status: string }>;
}

const DOCUMENT_TITLES: Record<string, string> = {
  RELEVE_NOTES: 'Relevé de notes',
  ATTESTATION: 'Attestation',
  CERTIFICATION: 'Certification conforme',
};

function buildDocumentSnapshot(productionId: string, now: string): GeneratedDocumentSnapshot {
  const row = db
    .prepare(
      `SELECT pr.id, pr.documentType, pr.documentVersion, t.reference, t.details, t.studentId,
              st.matricule, st.nom, st.prenom, st.promotion, sv.name AS serviceName
       FROM production_requests pr
       JOIN service_transactions t ON t.id = pr.transactionId
       JOIN students st ON st.id = t.studentId
       JOIN services sv ON sv.id = t.serviceId
       WHERE pr.id = ?`
    )
    .get(productionId) as
    | {
        id: string;
        documentType: string;
        documentVersion: number;
        reference: string;
        details: string;
        studentId: string;
        matricule: string;
        nom: string;
        prenom: string;
        promotion: string;
        serviceName: string;
      }
    | undefined;
  if (!row) throw new DomainError('Demande de production introuvable.', 404);

  let details: Record<string, string> = {};
  try {
    details = JSON.parse(row.details || '{}') as Record<string, string>;
  } catch {
    details = {};
  }

  // Academic data reused from UniNotes (grades) for the transcript.
  let grades: GeneratedDocumentSnapshot['grades'] = [];
  if (row.documentType === 'RELEVE_NOTES') {
    grades = db
      .prepare(
        `SELECT semester, courseCode, courseName, credits, grade, status
         FROM grades WHERE studentId = ? ORDER BY semester ASC, courseCode ASC`
      )
      .all(row.studentId) as GeneratedDocumentSnapshot['grades'];
    const wanted = (details.semester ?? '').toUpperCase();
    if (wanted) {
      const filtered = grades.filter((g) => wanted.includes(g.semester.toUpperCase()));
      if (filtered.length > 0) grades = filtered;
    }
  }

  const version = row.documentVersion + 1;
  return {
    templateVersion: 1,
    documentReference: `DOC-${row.reference}-V${version}`,
    version,
    documentType: row.documentType,
    title: DOCUMENT_TITLES[row.documentType] ?? row.serviceName,
    institutionName: getInstitutionName(),
    generatedAt: now,
    transactionReference: row.reference,
    student: { matricule: row.matricule, nom: row.nom, prenom: row.prenom, promotion: row.promotion },
    details,
    grades,
  };
}

interface ProductionTransitionOptions {
  verified?: boolean;
  deliveredTo?: string;
}

/**
 * Applies a production status transition after checking business rules.
 * Must run inside a DB transaction. Access rights are checked by the caller.
 */
export function transitionProduction(
  productionId: string,
  nextStatus: ProductionStatus,
  userId: string,
  now: string,
  options: ProductionTransitionOptions = {}
): void {
  const pr = db
    .prepare(
      `SELECT pr.id, pr.status, pr.documentSnapshot, pr.generatedDocumentReference, t.reference,
              t.status AS txStatus, t.paymentStatus
       FROM production_requests pr JOIN service_transactions t ON t.id = pr.transactionId
       WHERE pr.id = ?`
    )
    .get(productionId) as
    | {
        id: string;
        status: ProductionStatus;
        documentSnapshot: string | null;
        generatedDocumentReference: string | null;
        reference: string;
        txStatus: string;
        paymentStatus: string;
      }
    | undefined;

  if (!pr) throw new DomainError('Demande de production introuvable.', 404);
  if (pr.txStatus === 'CANCELLED') {
    throw new DomainError('La transaction associée est annulée : la production est gelée.', 409);
  }
  if (pr.paymentStatus !== 'PAID') {
    throw new DomainError('Paiement non confirmé : production impossible.', 409);
  }
  if (!PRODUCTION_TRANSITIONS[pr.status].includes(nextStatus)) {
    throw new DomainError(`Transition interdite : ${pr.status} → ${nextStatus}.`, 409);
  }

  if (nextStatus === 'EN_PRODUCTION') {
    const snapshot = buildDocumentSnapshot(productionId, now);
    db.prepare(
      `UPDATE production_requests
       SET status = 'EN_PRODUCTION', startedAt = ?, startedByUserId = ?, documentVersion = ?,
           generatedDocumentReference = ?, documentSnapshot = ?, updatedAt = ?
       WHERE id = ?`
    ).run(now, userId, snapshot.version, snapshot.documentReference, JSON.stringify(snapshot), now, productionId);
    logActivity(userId, 'PRODUCTION_STARTED', 'PRODUCTION_REQUEST', productionId, {
      reference: pr.reference,
      documentReference: snapshot.documentReference,
    }, now);
    return;
  }

  if (nextStatus === 'PRET') {
    if (!pr.documentSnapshot) throw new DomainError('Aucun document généré à vérifier.', 409);
    if (options.verified !== true) {
      throw new DomainError('La vérification du document doit être confirmée avant de le marquer prêt.', 400);
    }
    db.prepare(
      `UPDATE production_requests SET status = 'PRET', completedAt = ?, verifiedByUserId = ?, updatedAt = ? WHERE id = ?`
    ).run(now, userId, now, productionId);
    logActivity(userId, 'PRODUCTION_VERIFIED', 'PRODUCTION_REQUEST', productionId, {
      reference: pr.reference,
      documentReference: pr.generatedDocumentReference,
    }, now);
    return;
  }

  // REMIS
  const deliveredTo = (options.deliveredTo ?? '').trim().slice(0, 120) || null;
  db.prepare(
    `UPDATE production_requests
     SET status = 'REMIS', deliveredAt = ?, deliveredByUserId = ?, deliveredTo = ?, updatedAt = ?
     WHERE id = ?`
  ).run(now, userId, deliveredTo, now, productionId);
  logActivity(userId, 'PRODUCTION_DELIVERED', 'PRODUCTION_REQUEST', productionId, {
    reference: pr.reference,
    documentReference: pr.generatedDocumentReference,
    deliveredTo,
  }, now);
}

/** Regenerates the document (new version) while it is still in production. */
export function regenerateDocument(productionId: string, userId: string, now: string, reason: string): void {
  const pr = db
    .prepare(
      `SELECT pr.status, t.status AS txStatus, t.reference FROM production_requests pr
       JOIN service_transactions t ON t.id = pr.transactionId WHERE pr.id = ?`
    )
    .get(productionId) as { status: ProductionStatus; txStatus: string; reference: string } | undefined;
  if (!pr) throw new DomainError('Demande de production introuvable.', 404);
  if (pr.txStatus === 'CANCELLED') throw new DomainError('La transaction associée est annulée.', 409);
  if (pr.status !== 'EN_PRODUCTION') {
    throw new DomainError('Le document ne peut être régénéré que pendant la production.', 409);
  }
  const snapshot = buildDocumentSnapshot(productionId, now);
  db.prepare(
    `UPDATE production_requests SET documentVersion = ?, generatedDocumentReference = ?, documentSnapshot = ?, updatedAt = ?
     WHERE id = ?`
  ).run(snapshot.version, snapshot.documentReference, JSON.stringify(snapshot), now, productionId);
  logActivity(userId, 'DOCUMENT_REGENERATED', 'PRODUCTION_REQUEST', productionId, {
    reference: pr.reference,
    documentReference: snapshot.documentReference,
    reason,
  }, now);
}

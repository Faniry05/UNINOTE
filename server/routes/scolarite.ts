import crypto from 'node:crypto';
import { Router } from 'express';
import { type AuthenticatedRequest, type AuthenticatedUser, requireAuth, requireSupervisor } from '../auth.ts';
import { db, logActivity, runInTransaction } from '../db.ts';

export const scolariteRouter = Router();

interface FilterParams {
  period?: string;
  startDate?: string;
  endDate?: string;
  serviceId?: string;
  agentId?: string;
  status?: string;
  search?: string;
}

function resolveDateBounds(period?: string, startDate?: string, endDate?: string): { from?: string; to?: string } {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (period === 'week') {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (period === 'custom' || startDate || endDate) {
    const bounds: { from?: string; to?: string } = {};
    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      bounds.from = new Date(`${startDate}T00:00:00.000`).toISOString();
    }
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      bounds.to = new Date(`${endDate}T23:59:59.999`).toISOString();
    }
    return bounds;
  }
  return {};
}

function buildTransactionWhere(filters: FilterParams, user: AuthenticatedUser): { sql: string; params: Array<string | number> } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (user.role === 'AGENT') {
    clauses.push('t.performedByUserId = ?');
    params.push(user.id);
  } else if (filters.agentId && filters.agentId !== 'ALL') {
    clauses.push('t.performedByUserId = ?');
    params.push(filters.agentId);
  }

  if (filters.serviceId && filters.serviceId !== 'ALL') {
    clauses.push('t.serviceId = ?');
    params.push(filters.serviceId);
  }

  if (filters.status && ['PENDING', 'COMPLETED', 'CANCELLED'].includes(filters.status)) {
    clauses.push('t.status = ?');
    params.push(filters.status);
  }

  const { from, to } = resolveDateBounds(filters.period, filters.startDate, filters.endDate);
  if (from) {
    clauses.push('t.createdAt >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('t.createdAt <= ?');
    params.push(to);
  }

  if (filters.search && filters.search.trim().length > 0) {
    const pattern = `%${filters.search.trim()}%`;
    clauses.push('(t.reference LIKE ? OR st.matricule LIKE ? OR st.nom LIKE ? OR st.prenom LIKE ?)');
    params.push(pattern, pattern, pattern, pattern);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

function generateTransactionReference(now: Date): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const datePart = `${yyyy}${mm}${dd}`;
  const prefix = `SCOL-${datePart}-`;

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

function getHydratedTransactionById(id: string) {
  return db
    .prepare(
      `SELECT
         t.id,
         t.reference,
         t.studentId,
         t.serviceId,
         t.performedByUserId,
         t.priceAtTransaction,
         t.status,
         t.paymentStatus,
         t.paymentConfirmedAt,
         t.paymentConfirmedByUserId,
         t.notes,
         t.cancelReason,
         t.cancelledByUserId,
         t.cancelledAt,
         t.createdAt,
         t.updatedAt,
         st.matricule AS studentMatricule,
         st.nom AS studentNom,
         st.prenom AS studentPrenom,
         st.promotion AS studentPromotion,
         st.contact AS studentContact,
         sv.code AS serviceCode,
         sv.name AS serviceName,
         u.fullName AS agentName,
         u.username AS agentUsername,
         cu.fullName AS cancelledByName,
         pu.fullName AS paymentConfirmedByName
       FROM service_transactions t
       JOIN students st ON st.id = t.studentId
       JOIN services sv ON sv.id = t.serviceId
       JOIN users u ON u.id = t.performedByUserId
       LEFT JOIN users cu ON cu.id = t.cancelledByUserId
       LEFT JOIN users pu ON pu.id = t.paymentConfirmedByUserId
       WHERE t.id = ?`
    )
    .get(id);
}

/* -------------------------------------------------------------------------- */
/* SERVICE CATALOG                                                            */
/* -------------------------------------------------------------------------- */

scolariteRouter.get('/scolarite/services', requireAuth, (req: AuthenticatedRequest, res) => {
  const includeInactive = req.user!.role === 'SUPERVISOR' && req.query.includeInactive !== 'false';
  const rows = db
    .prepare(
      `SELECT id, code, name, description, price, isActive, createdAt, updatedAt
       FROM services
       ${includeInactive ? '' : 'WHERE isActive = 1'}
       ORDER BY createdAt ASC, name ASC`
    )
    .all() as Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    price: number;
    isActive: number;
    createdAt: string;
    updatedAt: string;
  }>;

  res.json({
    services: rows.map((s) => ({ ...s, isActive: s.isActive === 1 })),
  });
});

scolariteRouter.get('/scolarite/services/:id', requireAuth, (req, res) => {
  const row = db
    .prepare('SELECT id, code, name, description, price, isActive, createdAt, updatedAt FROM services WHERE id = ?')
    .get(req.params.id) as
    | {
        id: string;
        code: string;
        name: string;
        description: string;
        price: number;
        isActive: number;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;

  if (!row) {
    res.status(404).json({ error: 'Service introuvable.' });
    return;
  }

  res.json({ service: { ...row, isActive: row.isActive === 1 } });
});

scolariteRouter.post('/scolarite/services', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const { name, description, price, isActive } = req.body ?? {};
  if (typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ error: 'Le nom du service est requis.' });
    return;
  }
  if (typeof description !== 'string' || description.trim().length < 3) {
    res.status(400).json({ error: 'La description du service est requise.' });
    return;
  }
  const numPrice = Number(price);
  if (!Number.isInteger(numPrice) || numPrice < 0) {
    res.status(400).json({ error: 'Le tarif en Ariary doit être un entier positif ou nul.' });
    return;
  }

  const codeBase = name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const code = `${codeBase}_${Date.now().toString(36).toUpperCase()}`;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const activeFlag = isActive === false ? 0 : 1;

  runInTransaction(() => {
    db.prepare(
      `INSERT INTO services (id, code, name, description, price, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, code, name.trim(), description.trim(), numPrice, activeFlag, now, now);

    logActivity(
      req.user!.id,
      'SERVICE_CREATED',
      'SERVICE',
      id,
      { name: name.trim(), price: numPrice, isActive: activeFlag === 1 },
      now
    );
  });

  res.status(201).json({
    service: {
      id,
      code,
      name: name.trim(),
      description: description.trim(),
      price: numPrice,
      isActive: activeFlag === 1,
      createdAt: now,
      updatedAt: now,
    },
  });
});

scolariteRouter.patch('/scolarite/services/:id', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const existing = db
    .prepare('SELECT id, code, name, description, price, isActive, createdAt, updatedAt FROM services WHERE id = ?')
    .get(id) as
    | {
        id: string;
        code: string;
        name: string;
        description: string;
        price: number;
        isActive: number;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Service introuvable.' });
    return;
  }

  const { name, description, isActive } = req.body ?? {};
  const nextName = typeof name === 'string' && name.trim().length >= 2 ? name.trim() : existing.name;
  const nextDescription =
    typeof description === 'string' && description.trim().length >= 3 ? description.trim() : existing.description;
  const nextActive = typeof isActive === 'boolean' ? (isActive ? 1 : 0) : existing.isActive;
  const now = new Date().toISOString();

  runInTransaction(() => {
    db.prepare('UPDATE services SET name = ?, description = ?, isActive = ?, updatedAt = ? WHERE id = ?').run(
      nextName,
      nextDescription,
      nextActive,
      now,
      id
    );

    logActivity(
      req.user!.id,
      'SERVICE_UPDATED',
      'SERVICE',
      id,
      {
        name: nextName,
        previousActive: existing.isActive === 1,
        isActive: nextActive === 1,
      },
      now
    );
  });

  res.json({
    service: {
      ...existing,
      name: nextName,
      description: nextDescription,
      isActive: nextActive === 1,
      updatedAt: now,
    },
  });
});

scolariteRouter.patch('/scolarite/services/:id/price', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { price } = req.body ?? {};
  const numPrice = Number(price);

  if (!Number.isInteger(numPrice) || numPrice < 0) {
    res.status(400).json({ error: 'Le tarif en Ariary doit être un entier positif ou nul.' });
    return;
  }

  const existing = db
    .prepare('SELECT id, code, name, description, price, isActive, createdAt, updatedAt FROM services WHERE id = ?')
    .get(id) as
    | {
        id: string;
        code: string;
        name: string;
        description: string;
        price: number;
        isActive: number;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Service introuvable.' });
    return;
  }

  const now = new Date().toISOString();
  runInTransaction(() => {
    db.prepare('UPDATE services SET price = ?, updatedAt = ? WHERE id = ?').run(numPrice, now, id);
    logActivity(
      req.user!.id,
      'SERVICE_PRICE_CHANGED',
      'SERVICE',
      id,
      {
        serviceName: existing.name,
        oldPrice: existing.price,
        newPrice: numPrice,
      },
      now
    );
  });

  res.json({
    service: {
      ...existing,
      price: numPrice,
      isActive: existing.isActive === 1,
      updatedAt: now,
    },
  });
});

/* -------------------------------------------------------------------------- */
/* SERVICE TRANSACTIONS                                                       */
/* -------------------------------------------------------------------------- */

scolariteRouter.post('/scolarite/transactions', requireAuth, (req: AuthenticatedRequest, res) => {
  const { serviceId, idempotencyKey, student, paymentConfirmed, notes } = req.body ?? {};

  if (typeof serviceId !== 'string' || !serviceId.trim()) {
    res.status(400).json({ error: 'Le service sélectionné est requis.' });
    return;
  }

  if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
    res.status(400).json({ error: 'Clé d’idempotence requise pour éviter les doublons.' });
    return;
  }

  if (!student || typeof student !== 'object') {
    res.status(400).json({ error: 'Les informations de l’étudiant sont requises.' });
    return;
  }

  const rawMatricule = typeof student.matricule === 'string' ? student.matricule.trim().toUpperCase() : '';
  const rawNom = typeof student.nom === 'string' ? student.nom.trim().toUpperCase() : '';
  const rawPrenom = typeof student.prenom === 'string' ? student.prenom.trim() : '';
  const rawPromotion = typeof student.promotion === 'string' ? student.promotion.trim() : '';
  const rawContact = typeof student.contact === 'string' ? student.contact.trim() : '';

  if (rawMatricule.length < 2 || rawNom.length < 1 || rawPrenom.length < 1 || rawPromotion.length < 1) {
    res.status(400).json({ error: 'Matricule, nom, prénom et promotion de l’étudiant sont obligatoires.' });
    return;
  }

  const cleanKey = idempotencyKey.trim();
  const cleanNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : '';
  const isPaid = paymentConfirmed === true;

  try {
    const result = runInTransaction(() => {
      const duplicate = db
        .prepare('SELECT id, reference FROM service_transactions WHERE idempotencyKey = ?')
        .get(cleanKey) as { id: string; reference: string } | undefined;

      if (duplicate) {
        return { duplicate: true as const, existing: getHydratedTransactionById(duplicate.id) };
      }

      const service = db
        .prepare('SELECT id, name, price, isActive FROM services WHERE id = ?')
        .get(serviceId.trim()) as { id: string; name: string; price: number; isActive: number } | undefined;

      if (!service) {
        throw Object.assign(new Error('Service introuvable.'), { statusCode: 404 });
      }
      if (service.isActive !== 1) {
        throw Object.assign(new Error('Ce service est actuellement désactivé.'), { statusCode: 400 });
      }

      const nowDate = new Date();
      const now = nowDate.toISOString();

      let studentRow = db
        .prepare('SELECT id, matricule, nom, prenom, promotion, contact FROM students WHERE UPPER(TRIM(matricule)) = ?')
        .get(rawMatricule) as
        | { id: string; matricule: string; nom: string; prenom: string; promotion: string; contact: string }
        | undefined;

      let studentCreated = false;
      if (!studentRow) {
        const newStudentId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO students (id, matricule, nom, prenom, promotion, contact, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(newStudentId, rawMatricule, rawNom, rawPrenom, rawPromotion, rawContact, now, now);

        studentRow = {
          id: newStudentId,
          matricule: rawMatricule,
          nom: rawNom,
          prenom: rawPrenom,
          promotion: rawPromotion,
          contact: rawContact,
        };
        studentCreated = true;

        logActivity(
          req.user!.id,
          'STUDENT_CREATED',
          'STUDENT',
          newStudentId,
          { matricule: rawMatricule, nom: rawNom, prenom: rawPrenom, promotion: rawPromotion, source: 'COUNTER' },
          now
        );
      } else if (rawContact && !studentRow.contact) {
        db.prepare('UPDATE students SET contact = ?, updatedAt = ? WHERE id = ?').run(rawContact, now, studentRow.id);
      }

      const txId = crypto.randomUUID();
      const reference = generateTransactionReference(nowDate);
      const txStatus = isPaid ? 'COMPLETED' : 'PENDING';
      const payStatus = isPaid ? 'PAID' : 'UNPAID';

      db.prepare(
        `INSERT INTO service_transactions (
           id, reference, idempotencyKey, studentId, serviceId, performedByUserId,
           priceAtTransaction, status, paymentStatus, paymentConfirmedAt, paymentConfirmedByUserId,
           notes, createdAt, updatedAt
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        txId,
        reference,
        cleanKey,
        studentRow.id,
        service.id,
        req.user!.id,
        service.price,
        txStatus,
        payStatus,
        isPaid ? now : null,
        isPaid ? req.user!.id : null,
        cleanNotes,
        now,
        now
      );

      logActivity(
        req.user!.id,
        'TRANSACTION_CREATED',
        'SERVICE_TRANSACTION',
        txId,
        {
          reference,
          serviceId: service.id,
          serviceName: service.name,
          priceAtTransaction: service.price,
          studentMatricule: studentRow.matricule,
          status: txStatus,
          paymentStatus: payStatus,
          studentCreated,
        },
        now
      );

      return { duplicate: false as const, transaction: getHydratedTransactionById(txId), studentCreated };
    });

    if (result.duplicate) {
      res.status(409).json({
        error: 'Cette opération a déjà été soumise.',
        transaction: result.existing,
      });
      return;
    }

    res.status(201).json({
      transaction: result.transaction,
      studentCreated: result.studentCreated,
    });
  } catch (err) {
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err ? Number((err as { statusCode: number }).statusCode) : 500;
    res.status(statusCode).json({ error: err instanceof Error ? err.message : 'Erreur lors de la création.' });
  }
});

scolariteRouter.get('/scolarite/transactions', requireAuth, (req: AuthenticatedRequest, res) => {
  const filters: FilterParams = {
    period: typeof req.query.period === 'string' ? req.query.period : undefined,
    startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
    endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    serviceId: typeof req.query.serviceId === 'string' ? req.query.serviceId : undefined,
    agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
  };

  const where = buildTransactionWhere(filters, req.user!);
  const rows = db
    .prepare(
      `SELECT
         t.id,
         t.reference,
         t.studentId,
         t.serviceId,
         t.performedByUserId,
         t.priceAtTransaction,
         t.status,
         t.paymentStatus,
         t.paymentConfirmedAt,
         t.paymentConfirmedByUserId,
         t.notes,
         t.cancelReason,
         t.cancelledByUserId,
         t.cancelledAt,
         t.createdAt,
         t.updatedAt,
         st.matricule AS studentMatricule,
         st.nom AS studentNom,
         st.prenom AS studentPrenom,
         st.promotion AS studentPromotion,
         st.contact AS studentContact,
         sv.code AS serviceCode,
         sv.name AS serviceName,
         u.fullName AS agentName,
         u.username AS agentUsername,
         cu.fullName AS cancelledByName,
         pu.fullName AS paymentConfirmedByName
       FROM service_transactions t
       JOIN students st ON st.id = t.studentId
       JOIN services sv ON sv.id = t.serviceId
       JOIN users u ON u.id = t.performedByUserId
       LEFT JOIN users cu ON cu.id = t.cancelledByUserId
       LEFT JOIN users pu ON pu.id = t.paymentConfirmedByUserId
       ${where.sql}
       ORDER BY t.createdAt DESC
       LIMIT 250`
    )
    .all(...where.params);

  res.json({ transactions: rows });
});

scolariteRouter.get('/scolarite/transactions/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const tx = getHydratedTransactionById(req.params.id) as { performedByUserId: string } | undefined;
  if (!tx) {
    res.status(404).json({ error: 'Transaction introuvable.' });
    return;
  }

  if (req.user!.role === 'AGENT' && tx.performedByUserId !== req.user!.id) {
    res.status(403).json({ error: 'Accès refusé à cette transaction.' });
    return;
  }

  res.json({ transaction: tx });
});

scolariteRouter.post('/scolarite/transactions/:id/confirm-payment', requireAuth, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const existing = db
    .prepare('SELECT id, reference, performedByUserId, status, paymentStatus, priceAtTransaction FROM service_transactions WHERE id = ?')
    .get(id) as
    | {
        id: string;
        reference: string;
        performedByUserId: string;
        status: string;
        paymentStatus: string;
        priceAtTransaction: number;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Transaction introuvable.' });
    return;
  }

  if (req.user!.role === 'AGENT' && existing.performedByUserId !== req.user!.id) {
    res.status(403).json({ error: 'Vous ne pouvez confirmer que vos propres opérations.' });
    return;
  }

  if (existing.status === 'CANCELLED') {
    res.status(400).json({ error: 'Impossible de confirmer le paiement d’une transaction annulée.' });
    return;
  }
  if (existing.status === 'COMPLETED' && existing.paymentStatus === 'PAID') {
    res.status(400).json({ error: 'Le paiement de cette transaction est déjà confirmé.' });
    return;
  }

  const now = new Date().toISOString();
  runInTransaction(() => {
    db.prepare(
      `UPDATE service_transactions
       SET status = 'COMPLETED', paymentStatus = 'PAID', paymentConfirmedAt = ?, paymentConfirmedByUserId = ?, updatedAt = ?
       WHERE id = ?`
    ).run(now, req.user!.id, now, id);

    logActivity(
      req.user!.id,
      'TRANSACTION_PAYMENT_CONFIRMED',
      'SERVICE_TRANSACTION',
      id,
      { reference: existing.reference, amount: existing.priceAtTransaction },
      now
    );
  });

  res.json({ transaction: getHydratedTransactionById(id) });
});

scolariteRouter.post('/scolarite/transactions/:id/cancel', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { reason } = req.body ?? {};

  if (typeof reason !== 'string' || reason.trim().length < 3) {
    res.status(400).json({ error: 'Un motif d’annulation d’au moins 3 caractères est obligatoire.' });
    return;
  }

  const existing = db
    .prepare('SELECT id, reference, status, paymentStatus, priceAtTransaction FROM service_transactions WHERE id = ?')
    .get(id) as
    | { id: string; reference: string; status: string; paymentStatus: string; priceAtTransaction: number }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Transaction introuvable.' });
    return;
  }

  if (existing.status === 'CANCELLED') {
    res.status(400).json({ error: 'Cette transaction est déjà annulée.' });
    return;
  }

  const now = new Date().toISOString();
  const nextPaymentStatus = existing.paymentStatus === 'PAID' ? 'REFUNDED' : 'UNPAID';

  runInTransaction(() => {
    db.prepare(
      `UPDATE service_transactions
       SET status = 'CANCELLED', paymentStatus = ?, cancelReason = ?, cancelledByUserId = ?, cancelledAt = ?, updatedAt = ?
       WHERE id = ?`
    ).run(nextPaymentStatus, reason.trim(), req.user!.id, now, now, id);

    logActivity(
      req.user!.id,
      'TRANSACTION_CANCELLED',
      'SERVICE_TRANSACTION',
      id,
      {
        reference: existing.reference,
        reason: reason.trim(),
        previousStatus: existing.status,
        nextPaymentStatus,
        amount: existing.priceAtTransaction,
      },
      now
    );
  });

  res.json({ transaction: getHydratedTransactionById(id) });
});

scolariteRouter.post('/scolarite/transactions/:id/correct', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { reason, serviceId, paymentConfirmed, notes } = req.body ?? {};

  if (typeof reason !== 'string' || reason.trim().length < 3) {
    res.status(400).json({ error: 'Un motif de correction est obligatoire.' });
    return;
  }
  if (typeof serviceId !== 'string' || !serviceId.trim()) {
    res.status(400).json({ error: 'Le service corrigé est requis.' });
    return;
  }

  const original = db
    .prepare('SELECT id, reference, studentId, status, paymentStatus, priceAtTransaction FROM service_transactions WHERE id = ?')
    .get(id) as
    | {
        id: string;
        reference: string;
        studentId: string;
        status: string;
        paymentStatus: string;
        priceAtTransaction: number;
      }
    | undefined;

  if (!original) {
    res.status(404).json({ error: 'Transaction originale introuvable.' });
    return;
  }
  if (original.status === 'CANCELLED') {
    res.status(400).json({ error: 'Une transaction déjà annulée ne peut pas être corrigée.' });
    return;
  }

  const service = db
    .prepare('SELECT id, name, price, isActive FROM services WHERE id = ?')
    .get(serviceId.trim()) as { id: string; name: string; price: number; isActive: number } | undefined;

  if (!service || service.isActive !== 1) {
    res.status(400).json({ error: 'Le service de remplacement est invalide ou inactif.' });
    return;
  }

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const replacementId = crypto.randomUUID();
  const isPaid = paymentConfirmed === true;

  const replacement = runInTransaction(() => {
    const nextPayStatus = original.paymentStatus === 'PAID' ? 'REFUNDED' : 'UNPAID';
    db.prepare(
      `UPDATE service_transactions
       SET status = 'CANCELLED', paymentStatus = ?, cancelReason = ?, cancelledByUserId = ?, cancelledAt = ?, updatedAt = ?
       WHERE id = ?`
    ).run(nextPayStatus, `Correction: ${reason.trim()}`, req.user!.id, now, now, original.id);

    const replacementRef = generateTransactionReference(nowDate);
    db.prepare(
      `INSERT INTO service_transactions (
         id, reference, idempotencyKey, studentId, serviceId, performedByUserId,
         priceAtTransaction, status, paymentStatus, paymentConfirmedAt, paymentConfirmedByUserId,
         notes, createdAt, updatedAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      replacementId,
      replacementRef,
      `corr-${original.id}-${Date.now()}`,
      original.studentId,
      service.id,
      req.user!.id,
      service.price,
      isPaid ? 'COMPLETED' : 'PENDING',
      isPaid ? 'PAID' : 'UNPAID',
      isPaid ? now : null,
      isPaid ? req.user!.id : null,
      typeof notes === 'string' && notes.trim() ? notes.trim() : `Correction de ${original.reference}: ${reason.trim()}`,
      now,
      now
    );

    logActivity(
      req.user!.id,
      'TRANSACTION_CORRECTED',
      'SERVICE_TRANSACTION',
      replacementId,
      {
        originalTransactionId: original.id,
        originalReference: original.reference,
        newReference: replacementRef,
        reason: reason.trim(),
        newServiceName: service.name,
        newPrice: service.price,
      },
      now
    );

    return getHydratedTransactionById(replacementId);
  });

  res.status(201).json({ transaction: replacement });
});

/* -------------------------------------------------------------------------- */
/* SUPERVISOR DASHBOARD (STRICTLY SUPERVISOR-ONLY)                            */
/* -------------------------------------------------------------------------- */

scolariteRouter.get('/scolarite/dashboard/summary', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const filters: FilterParams = {
    period: typeof req.query.period === 'string' ? req.query.period : undefined,
    startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
    endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    serviceId: typeof req.query.serviceId === 'string' ? req.query.serviceId : undefined,
    agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
  };

  const where = buildTransactionWhere(filters, req.user!);
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN t.priceAtTransaction ELSE 0 END), 0) AS confirmedRevenue,
         COALESCE(SUM(CASE WHEN t.status = 'PENDING' THEN t.priceAtTransaction ELSE 0 END), 0) AS pendingAmount,
         COALESCE(SUM(CASE WHEN t.status = 'CANCELLED' THEN t.priceAtTransaction ELSE 0 END), 0) AS cancelledAmount,
         COUNT(CASE WHEN t.status != 'CANCELLED' THEN 1 END) AS totalTransactions,
         COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) AS completedCount,
         COUNT(CASE WHEN t.status = 'PENDING' THEN 1 END) AS pendingCount,
         COUNT(CASE WHEN t.status = 'CANCELLED' THEN 1 END) AS cancelledCount
       FROM service_transactions t
       JOIN students st ON st.id = t.studentId
       ${where.sql}`
    )
    .get(...where.params) as {
    confirmedRevenue: number;
    pendingAmount: number;
    cancelledAmount: number;
    totalTransactions: number;
    completedCount: number;
    pendingCount: number;
    cancelledCount: number;
  };

  res.json({ summary: row });
});

scolariteRouter.get('/scolarite/dashboard/by-service', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const filters: FilterParams = {
    period: typeof req.query.period === 'string' ? req.query.period : undefined,
    startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
    endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    serviceId: typeof req.query.serviceId === 'string' ? req.query.serviceId : undefined,
    agentId: typeof req.query.agentId === 'string' ? req.query.agentId : undefined,
  };

  const txClauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.agentId && filters.agentId !== 'ALL') {
    txClauses.push('t.performedByUserId = ?');
    params.push(filters.agentId);
  }
  const { from, to } = resolveDateBounds(filters.period, filters.startDate, filters.endDate);
  if (from) {
    txClauses.push('t.createdAt >= ?');
    params.push(from);
  }
  if (to) {
    txClauses.push('t.createdAt <= ?');
    params.push(to);
  }

  const joinFilter = txClauses.length > 0 ? `AND ${txClauses.join(' AND ')}` : '';
  const serviceWhere = filters.serviceId && filters.serviceId !== 'ALL' ? 'WHERE sv.id = ?' : '';
  if (serviceWhere) {
    params.push(filters.serviceId!);
  }

  const rows = db
    .prepare(
      `SELECT
         sv.id AS serviceId,
         sv.code AS serviceCode,
         sv.name AS serviceName,
         sv.description AS serviceDescription,
         sv.price AS currentPrice,
         sv.isActive AS isActive,
         COUNT(CASE WHEN t.status != 'CANCELLED' THEN 1 END) AS totalSalesCount,
         COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) AS completedCount,
         COUNT(CASE WHEN t.status = 'PENDING' THEN 1 END) AS pendingCount,
         COUNT(CASE WHEN t.status = 'CANCELLED' THEN 1 END) AS cancelledCount,
         COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN t.priceAtTransaction ELSE 0 END), 0) AS confirmedRevenue,
         COALESCE(SUM(CASE WHEN t.status = 'PENDING' THEN t.priceAtTransaction ELSE 0 END), 0) AS pendingAmount
       FROM services sv
       LEFT JOIN service_transactions t ON t.serviceId = sv.id ${joinFilter}
       ${serviceWhere}
       GROUP BY sv.id
       ORDER BY sv.createdAt ASC, sv.name ASC`
    )
    .all(...params) as Array<{
    serviceId: string;
    serviceCode: string;
    serviceName: string;
    serviceDescription: string;
    currentPrice: number;
    isActive: number;
    totalSalesCount: number;
    completedCount: number;
    pendingCount: number;
    cancelledCount: number;
    confirmedRevenue: number;
    pendingAmount: number;
  }>;

  res.json({
    byService: rows.map((r) => ({ ...r, isActive: r.isActive === 1 })),
  });
});

scolariteRouter.get('/scolarite/dashboard/by-agent', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const filters: FilterParams = {
    period: typeof req.query.period === 'string' ? req.query.period : undefined,
    startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
    endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    serviceId: typeof req.query.serviceId === 'string' ? req.query.serviceId : undefined,
  };

  const txClauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.serviceId && filters.serviceId !== 'ALL') {
    txClauses.push('t.serviceId = ?');
    params.push(filters.serviceId);
  }
  const { from, to } = resolveDateBounds(filters.period, filters.startDate, filters.endDate);
  if (from) {
    txClauses.push('t.createdAt >= ?');
    params.push(from);
  }
  if (to) {
    txClauses.push('t.createdAt <= ?');
    params.push(to);
  }

  const joinFilter = txClauses.length > 0 ? `AND ${txClauses.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT
         u.id AS agentId,
         u.fullName AS agentName,
         u.username AS agentUsername,
         u.role AS agentRole,
         COUNT(CASE WHEN t.status != 'CANCELLED' THEN 1 END) AS totalTransactions,
         COUNT(CASE WHEN t.status = 'COMPLETED' THEN 1 END) AS completedCount,
         COUNT(CASE WHEN t.status = 'PENDING' THEN 1 END) AS pendingCount,
         COUNT(CASE WHEN t.status = 'CANCELLED' THEN 1 END) AS cancelledCount,
         COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN t.priceAtTransaction ELSE 0 END), 0) AS confirmedRevenue,
         COALESCE(SUM(CASE WHEN t.status = 'PENDING' THEN t.priceAtTransaction ELSE 0 END), 0) AS pendingAmount
       FROM users u
       LEFT JOIN service_transactions t ON t.performedByUserId = u.id ${joinFilter}
       GROUP BY u.id
       ORDER BY confirmedRevenue DESC, totalTransactions DESC, u.fullName ASC`
    )
    .all(...params);

  res.json({ byAgent: rows });
});

/* -------------------------------------------------------------------------- */
/* ACTIVITY LOG / AUDIT TRAIL (STRICTLY SUPERVISOR-ONLY)                      */
/* -------------------------------------------------------------------------- */

scolariteRouter.get('/scolarite/activity-logs', requireAuth, requireSupervisor, (req, res) => {
  const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : undefined;
  const action = typeof req.query.action === 'string' ? req.query.action : undefined;
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  const limitRaw = Number(req.query.limit ?? 120);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 500 ? limitRaw : 120;

  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (entityType && entityType !== 'ALL') {
    clauses.push('a.entityType = ?');
    params.push(entityType);
  }
  if (action && action !== 'ALL') {
    clauses.push('a.action = ?');
    params.push(action);
  }
  if (userId && userId !== 'ALL') {
    clauses.push('a.userId = ?');
    params.push(userId);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT
         a.id,
         a.userId,
         a.action,
         a.entityType,
         a.entityId,
         a.metadata,
         a.createdAt,
         u.fullName AS actorName,
         u.username AS actorUsername,
         u.role AS actorRole
       FROM activity_logs a
       JOIN users u ON u.id = a.userId
       ${whereSql}
       ORDER BY a.createdAt DESC
       LIMIT ?`
    )
    .all(...params) as Array<{
    id: string;
    userId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: string;
    createdAt: string;
    actorName: string;
    actorUsername: string;
    actorRole: string;
  }>;

  res.json({
    logs: rows.map((r) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(r.metadata) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      return {
        ...r,
        metadata: parsed,
      };
    }),
  });
});

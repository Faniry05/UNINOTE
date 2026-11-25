import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isDemoMode } from './config.ts';

// The demo mode uses its own database file so that fictitious data never
// mixes with real data. UNINOTES_DB_PATH overrides both (used by the tests).
const defaultDbFile = isDemoMode() ? 'uninotes-demo.db' : 'uninotes.db';
export const dbPath = process.env.UNINOTES_DB_PATH
  ? path.resolve(process.env.UNINOTES_DB_PATH)
  : path.resolve(process.cwd(), 'data', defaultDbFile);

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      fullName TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('SUPERVISOR', 'AGENT')),
      passwordHash TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      tokenHash TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      matricule TEXT UNIQUE NOT NULL,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      promotion TEXT NOT NULL,
      contact TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grades (
      id TEXT PRIMARY KEY,
      studentId TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      semester TEXT NOT NULL,
      courseCode TEXT NOT NULL,
      courseName TEXT NOT NULL,
      credits INTEGER NOT NULL,
      grade REAL NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price INTEGER NOT NULL CHECK(price >= 0),
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_transactions (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      idempotencyKey TEXT UNIQUE,
      studentId TEXT NOT NULL REFERENCES students(id),
      serviceId TEXT NOT NULL REFERENCES services(id),
      performedByUserId TEXT NOT NULL REFERENCES users(id),
      priceAtTransaction INTEGER NOT NULL CHECK(priceAtTransaction >= 0),
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
      paymentStatus TEXT NOT NULL CHECK(paymentStatus IN ('UNPAID', 'PAID', 'REFUNDED')) DEFAULT 'UNPAID',
      paymentConfirmedAt TEXT DEFAULT NULL,
      paymentConfirmedByUserId TEXT REFERENCES users(id),
      notes TEXT NOT NULL DEFAULT '',
      cancelReason TEXT DEFAULT NULL,
      cancelledByUserId TEXT REFERENCES users(id),
      cancelledAt TEXT DEFAULT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      metadata TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      transactionId TEXT NOT NULL UNIQUE REFERENCES service_transactions(id),
      amount INTEGER NOT NULL CHECK(amount >= 0),
      method TEXT NOT NULL DEFAULT 'CASH' CHECK(method IN ('CASH')),
      status TEXT NOT NULL CHECK(status IN ('PAYE', 'ANNULE')),
      receivedByUserId TEXT NOT NULL REFERENCES users(id),
      paidAt TEXT NOT NULL,
      cancelledAt TEXT DEFAULT NULL,
      cancelledByUserId TEXT REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS production_requests (
      id TEXT PRIMARY KEY,
      transactionId TEXT NOT NULL UNIQUE REFERENCES service_transactions(id),
      documentType TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('A_PRODUIRE', 'EN_PRODUCTION', 'PRET', 'REMIS')),
      requestedByUserId TEXT NOT NULL REFERENCES users(id),
      generatedDocumentReference TEXT DEFAULT NULL,
      documentVersion INTEGER NOT NULL DEFAULT 0,
      documentSnapshot TEXT DEFAULT NULL,
      startedAt TEXT DEFAULT NULL,
      startedByUserId TEXT REFERENCES users(id),
      completedAt TEXT DEFAULT NULL,
      verifiedByUserId TEXT REFERENCES users(id),
      deliveredAt TEXT DEFAULT NULL,
      deliveredByUserId TEXT REFERENCES users(id),
      deliveredTo TEXT DEFAULT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_students_matricule ON students(matricule);
    CREATE INDEX IF NOT EXISTS idx_production_status ON production_requests(status);
    CREATE INDEX IF NOT EXISTS idx_tx_created_at ON service_transactions(createdAt);
    CREATE INDEX IF NOT EXISTS idx_tx_service_id ON service_transactions(serviceId);
    CREATE INDEX IF NOT EXISTS idx_tx_performed_by ON service_transactions(performedByUserId);
    CREATE INDEX IF NOT EXISTS idx_tx_status ON service_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON activity_logs(createdAt);
  `);

  migrateSchema();
  seedInitialData();
}

/** Additive, idempotent migrations for databases created by earlier versions. */
function migrateSchema(): void {
  const txColumns = db.prepare('PRAGMA table_info(service_transactions)').all() as Array<{ name: string }>;
  if (!txColumns.some((c) => c.name === 'details')) {
    db.exec(`ALTER TABLE service_transactions ADD COLUMN details TEXT NOT NULL DEFAULT '{}'`);
  }

  // Backfill: every paid transaction gets its cash payment record and its
  // production request, so older data follows the new workflow.
  db.exec(`
    INSERT INTO payments (id, transactionId, amount, method, status, receivedByUserId, paidAt, cancelledAt, cancelledByUserId)
    SELECT lower(hex(randomblob(16))), t.id, t.priceAtTransaction, 'CASH',
           CASE WHEN t.status = 'CANCELLED' THEN 'ANNULE' ELSE 'PAYE' END,
           COALESCE(t.paymentConfirmedByUserId, t.performedByUserId),
           COALESCE(t.paymentConfirmedAt, t.createdAt),
           t.cancelledAt, t.cancelledByUserId
    FROM service_transactions t
    WHERE t.paymentConfirmedAt IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.transactionId = t.id);

    INSERT INTO production_requests (id, transactionId, documentType, status, requestedByUserId, createdAt, updatedAt)
    SELECT lower(hex(randomblob(16))), t.id, sv.code, 'A_PRODUIRE', t.performedByUserId,
           COALESCE(t.paymentConfirmedAt, t.createdAt), COALESCE(t.paymentConfirmedAt, t.createdAt)
    FROM service_transactions t
    JOIN services sv ON sv.id = t.serviceId
    WHERE t.paymentStatus = 'PAID'
      AND NOT EXISTS (SELECT 1 FROM production_requests pr WHERE pr.transactionId = t.id);
  `);
}

export function runInTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
    } catch {
      // Ignore rollback failure if transaction was already closed
    }
    throw err;
  }
}

export function logActivity(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
  timestamp?: string
): void {
  const now = timestamp ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO activity_logs (id, userId, action, entityType, entityId, metadata, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(crypto.randomUUID(), userId, action, entityType, entityId, JSON.stringify(metadata), now);
}

export function seedInitialData(): void {
  const now = new Date().toISOString();

  const serviceCountRow = db.prepare('SELECT COUNT(*) AS count FROM services').get() as { count: number };
  if (serviceCountRow.count === 0) {
    const insertService = db.prepare(
      `INSERT INTO services (id, code, name, description, price, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const initialServices = [
      {
        id: 'srv-releve-notes',
        code: 'RELEVE_NOTES',
        name: 'Relevé de notes',
        description: 'Édition et délivrance officielle du relevé de notes académique semestriel ou annuel.',
        price: 2000,
      },
      {
        id: 'srv-attestation',
        code: 'ATTESTATION',
        name: 'Attestation',
        description: 'Attestation officielle de scolarité, d’inscription administrative ou de réussite.',
        price: 3000,
      },
      {
        id: 'srv-certification',
        code: 'CERTIFICATION',
        name: 'Certification',
        description: 'Certification conforme et authentification de documents et diplômes universitaires.',
        price: 1000,
      },
    ];

    for (const s of initialServices) {
      insertService.run(s.id, s.code, s.name, s.description, s.price, 1, now, now);
    }
  }

  // Fictitious students are only seeded in demo mode (see server/demo.ts).
  if (!isDemoMode()) return;

  const studentCountRow = db.prepare('SELECT COUNT(*) AS count FROM students').get() as { count: number };
  if (studentCountRow.count === 0) {
    const insertStudent = db.prepare(
      `INSERT INTO students (id, matricule, nom, prenom, promotion, contact, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertGrade = db.prepare(
      `INSERT INTO grades (id, studentId, semester, courseCode, courseName, credits, grade, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const seedStudents = [
      {
        id: 'stu-001',
        matricule: '2024-INF-001',
        nom: 'RAKOTOMALALA',
        prenom: 'Hery Tiana',
        promotion: 'L3 Informatique',
        contact: '034 12 458 90',
        grades: [
          { semester: 'S5', courseCode: 'INF301', courseName: 'Génie Logiciel & Architecture', credits: 6, grade: 15.5, status: 'Validé' },
          { semester: 'S5', courseCode: 'INF302', courseName: 'Bases de Données Avancées', credits: 5, grade: 14.25, status: 'Validé' },
          { semester: 'S5', courseCode: 'INF303', courseName: 'Réseaux & Sécurité', credits: 5, grade: 13.75, status: 'Validé' },
        ],
      },
      {
        id: 'stu-002',
        matricule: '2024-INF-002',
        nom: 'RANDRIANARISOA',
        prenom: 'Fanja Mireille',
        promotion: 'L3 Informatique',
        contact: '033 88 214 07',
        grades: [
          { semester: 'S5', courseCode: 'INF301', courseName: 'Génie Logiciel & Architecture', credits: 6, grade: 16.0, status: 'Validé' },
          { semester: 'S5', courseCode: 'INF302', courseName: 'Bases de Données Avancées', credits: 5, grade: 15.0, status: 'Validé' },
        ],
      },
      {
        id: 'stu-003',
        matricule: '2023-GES-014',
        nom: 'RASOANAIVO',
        prenom: 'Tojo Nirina',
        promotion: 'M1 Gestion Financière',
        contact: '032 45 901 33',
        grades: [
          { semester: 'S7', courseCode: 'GES401', courseName: 'Contrôle de Gestion', credits: 6, grade: 14.5, status: 'Validé' },
          { semester: 'S7', courseCode: 'GES402', courseName: 'Comptabilité Analytique', credits: 5, grade: 12.75, status: 'Validé' },
        ],
      },
      {
        id: 'stu-004',
        matricule: '2025-DRO-008',
        nom: 'ANDRIAMAMPIONONA',
        prenom: 'Ravo Sarobidy',
        promotion: 'L2 Droit Public',
        contact: '034 67 119 42',
        grades: [
          { semester: 'S3', courseCode: 'DRO201', courseName: 'Droit Administratif', credits: 6, grade: 13.5, status: 'Validé' },
          { semester: 'S3', courseCode: 'DRO202', courseName: 'Droit Constitutionnel', credits: 5, grade: 14.0, status: 'Validé' },
        ],
      },
      {
        id: 'stu-005',
        matricule: '2024-ECO-019',
        nom: 'RAZAFINDRAKOTO',
        prenom: 'Mamy Lalaina',
        promotion: 'L3 Économie',
        contact: '038 19 305 61',
        grades: [
          { semester: 'S5', courseCode: 'ECO301', courseName: 'Macroéconomie Appliquée', credits: 6, grade: 14.75, status: 'Validé' },
          { semester: 'S5', courseCode: 'ECO302', courseName: 'Économétrie', credits: 5, grade: 11.5, status: 'Validé' },
        ],
      },
    ];

    for (const st of seedStudents) {
      insertStudent.run(st.id, st.matricule, st.nom, st.prenom, st.promotion, st.contact, now, now);
      for (const g of st.grades) {
        insertGrade.run(crypto.randomUUID(), st.id, g.semester, g.courseCode, g.courseName, g.credits, g.grade, g.status);
      }
    }
  }
}

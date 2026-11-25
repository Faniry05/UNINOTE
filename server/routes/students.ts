import crypto from 'node:crypto';
import { Router } from 'express';
import { type AuthenticatedRequest, requireAuth, requireSupervisor } from '../auth.ts';
import { db, logActivity, runInTransaction } from '../db.ts';

export const studentsRouter = Router();

studentsRouter.get('/students', requireAuth, (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  if (q) {
    const pattern = `%${q}%`;
    const students = db
      .prepare(
        `SELECT id, matricule, nom, prenom, promotion, contact, createdAt, updatedAt
         FROM students
         WHERE matricule LIKE ? OR nom LIKE ? OR prenom LIKE ? OR promotion LIKE ?
         ORDER BY nom ASC, prenom ASC
         LIMIT 100`
      )
      .all(pattern, pattern, pattern, pattern);
    res.json({ students });
    return;
  }

  const students = db
    .prepare(
      `SELECT id, matricule, nom, prenom, promotion, contact, createdAt, updatedAt
       FROM students
       ORDER BY nom ASC, prenom ASC
       LIMIT 100`
    )
    .all();
  res.json({ students });
});

studentsRouter.get('/students/by-matricule/:matricule', requireAuth, (req, res) => {
  const rawMatricule = req.params.matricule;
  if (typeof rawMatricule !== 'string' || !rawMatricule.trim()) {
    res.status(400).json({ error: 'Matricule requis.' });
    return;
  }

  const normalized = rawMatricule.trim().toUpperCase();
  const student = db
    .prepare(
      `SELECT id, matricule, nom, prenom, promotion, contact, createdAt, updatedAt
       FROM students
       WHERE UPPER(TRIM(matricule)) = ?`
    )
    .get(normalized);

  if (!student) {
    res.status(404).json({ error: 'Aucun étudiant trouvé avec ce matricule.' });
    return;
  }

  res.json({ student });
});

studentsRouter.post('/students', requireAuth, (req: AuthenticatedRequest, res) => {
  const { matricule, nom, prenom, promotion, contact } = req.body ?? {};
  if (typeof matricule !== 'string' || matricule.trim().length < 2) {
    res.status(400).json({ error: 'Le matricule est requis.' });
    return;
  }
  if (typeof nom !== 'string' || nom.trim().length < 1) {
    res.status(400).json({ error: 'Le nom est requis.' });
    return;
  }
  if (typeof prenom !== 'string' || prenom.trim().length < 1) {
    res.status(400).json({ error: 'Le prénom est requis.' });
    return;
  }
  if (typeof promotion !== 'string' || promotion.trim().length < 1) {
    res.status(400).json({ error: 'La promotion est requise.' });
    return;
  }

  const normMatricule = matricule.trim().toUpperCase();
  const existing = db
    .prepare('SELECT id FROM students WHERE UPPER(TRIM(matricule)) = ?')
    .get(normMatricule);
  if (existing) {
    res.status(409).json({ error: 'Un étudiant avec ce matricule existe déjà.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const cleanNom = nom.trim().toUpperCase();
  const cleanPrenom = prenom.trim();
  const cleanPromotion = promotion.trim();
  const cleanContact = typeof contact === 'string' ? contact.trim() : '';

  runInTransaction(() => {
    db.prepare(
      `INSERT INTO students (id, matricule, nom, prenom, promotion, contact, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, normMatricule, cleanNom, cleanPrenom, cleanPromotion, cleanContact, now, now);

    logActivity(
      req.user!.id,
      'STUDENT_CREATED',
      'STUDENT',
      id,
      { matricule: normMatricule, nom: cleanNom, prenom: cleanPrenom, promotion: cleanPromotion },
      now
    );
  });

  res.status(201).json({
    student: {
      id,
      matricule: normMatricule,
      nom: cleanNom,
      prenom: cleanPrenom,
      promotion: cleanPromotion,
      contact: cleanContact,
      createdAt: now,
      updatedAt: now,
    },
  });
});

studentsRouter.get('/students/:id/grades', requireAuth, (req, res) => {
  const { id } = req.params;
  const student = db
    .prepare('SELECT id, matricule, nom, prenom, promotion, contact FROM students WHERE id = ?')
    .get(id);

  if (!student) {
    res.status(404).json({ error: 'Étudiant introuvable.' });
    return;
  }

  const grades = db
    .prepare(
      `SELECT id, studentId, semester, courseCode, courseName, credits, grade, status
       FROM grades WHERE studentId = ? ORDER BY semester ASC, courseCode ASC`
    )
    .all(id);

  res.json({ student, grades });
});

studentsRouter.post('/students/:id/grades', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { semester, courseCode, courseName, credits, grade } = req.body ?? {};

  const student = db.prepare('SELECT id, matricule FROM students WHERE id = ?').get(id) as
    | { id: string; matricule: string }
    | undefined;
  if (!student) {
    res.status(404).json({ error: 'Étudiant introuvable.' });
    return;
  }

  if (typeof semester !== 'string' || !semester.trim() || typeof courseCode !== 'string' || !courseCode.trim() || typeof courseName !== 'string' || !courseName.trim()) {
    res.status(400).json({ error: 'Semestre, code matière et intitulé sont requis.' });
    return;
  }
  const numCredits = Number(credits);
  const numGrade = Number(grade);
  if (!Number.isInteger(numCredits) || numCredits < 1 || numCredits > 30) {
    res.status(400).json({ error: 'Crédits invalides.' });
    return;
  }
  if (!Number.isFinite(numGrade) || numGrade < 0 || numGrade > 20) {
    res.status(400).json({ error: 'Note invalide (0 à 20).' });
    return;
  }

  const gradeId = crypto.randomUUID();
  const status = numGrade >= 10 ? 'Validé' : 'Ajourné';

  runInTransaction(() => {
    db.prepare(
      `INSERT INTO grades (id, studentId, semester, courseCode, courseName, credits, grade, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(gradeId, id, semester.trim(), courseCode.trim().toUpperCase(), courseName.trim(), numCredits, numGrade, status);

    logActivity(req.user!.id, 'GRADE_RECORDED', 'STUDENT', id, {
      matricule: student.matricule,
      courseCode: courseCode.trim().toUpperCase(),
      grade: numGrade,
    });
  });

  res.status(201).json({
    grade: {
      id: gradeId,
      studentId: id,
      semester: semester.trim(),
      courseCode: courseCode.trim().toUpperCase(),
      courseName: courseName.trim(),
      credits: numCredits,
      grade: numGrade,
      status,
    },
  });
});

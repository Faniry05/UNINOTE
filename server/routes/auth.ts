import crypto from 'node:crypto';
import { Router } from 'express';
import {
  type AuthenticatedRequest,
  type UserRole,
  createSession,
  deleteSession,
  hashPassword,
  requireAuth,
  requireSupervisor,
  verifyPassword,
} from '../auth.ts';
import { isDemoMode } from '../config.ts';
import { db, logActivity, runInTransaction } from '../db.ts';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../demo.ts';

export const authRouter = Router();

authRouter.get('/auth/status', (_req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  res.json({
    needsSetup: row.count === 0,
    hasEnvPasscode: Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0),
    demoMode: isDemoMode(),
    // Demo credentials are public by design, and only exposed in demo mode.
    demoAccounts: isDemoMode()
      ? DEMO_ACCOUNTS.map((a) => ({ username: a.username, fullName: a.fullName, role: a.role, password: DEMO_PASSWORD }))
      : [],
  });
});

authRouter.post('/auth/setup', (req, res) => {
  const { fullName, username, password, agentFullName, agentUsername, agentPassword, adminPasscode } = req.body ?? {};

  const existingCount = (db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
  const envPasscode = process.env.ADMIN_PASSCODE?.trim();

  if (existingCount > 0) {
    res.status(403).json({ error: 'L’initialisation initiale a déjà été effectuée.' });
    return;
  }

  if (envPasscode && adminPasscode !== envPasscode) {
    res.status(403).json({ error: 'Code administrateur invalide.' });
    return;
  }

  if (typeof fullName !== 'string' || fullName.trim().length < 2) {
    res.status(400).json({ error: 'Le nom complet du superviseur est requis.' });
    return;
  }
  if (typeof username !== 'string' || username.trim().length < 3) {
    res.status(400).json({ error: 'L’identifiant du superviseur doit contenir au moins 3 caractères.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    return;
  }

  const normalizedUsername = username.trim().toLowerCase();
  const hasAgentPayload =
    typeof agentUsername === 'string' &&
    agentUsername.trim().length > 0 &&
    typeof agentPassword === 'string' &&
    agentPassword.length > 0;

  if (hasAgentPayload) {
    if (typeof agentFullName !== 'string' || agentFullName.trim().length < 2) {
      res.status(400).json({ error: 'Le nom complet de l’agent de guichet est requis.' });
      return;
    }
    if (agentUsername.trim().toLowerCase() === normalizedUsername) {
      res.status(400).json({ error: 'L’identifiant de l’agent doit être différent de celui du superviseur.' });
      return;
    }
    if (agentPassword.length < 6) {
      res.status(400).json({ error: 'Le mot de passe de l’agent doit contenir au moins 6 caractères.' });
      return;
    }
  }

  const now = new Date().toISOString();
  const supervisorId = crypto.randomUUID();
  const supervisorHash = hashPassword(password);

  try {
    runInTransaction(() => {
      db.prepare(
        `INSERT INTO users (id, username, fullName, role, passwordHash, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, 'SUPERVISOR', ?, 1, ?, ?)`
      ).run(supervisorId, normalizedUsername, fullName.trim(), supervisorHash, now, now);

      logActivity(
        supervisorId,
        'USER_CREATED',
        'USER',
        supervisorId,
        { username: normalizedUsername, role: 'SUPERVISOR', initialSetup: true },
        now
      );

      if (hasAgentPayload) {
        const agentId = crypto.randomUUID();
        const agentHash = hashPassword(agentPassword);
        const normAgentUser = agentUsername.trim().toLowerCase();
        db.prepare(
          `INSERT INTO users (id, username, fullName, role, passwordHash, isActive, createdAt, updatedAt)
           VALUES (?, ?, ?, 'AGENT', ?, 1, ?, ?)`
        ).run(agentId, normAgentUser, agentFullName.trim(), agentHash, now, now);

        logActivity(
          supervisorId,
          'USER_CREATED',
          'USER',
          agentId,
          { username: normAgentUser, role: 'AGENT', initialSetup: true },
          now
        );
      }
    });

    const token = createSession(supervisorId);
    res.status(201).json({
      token,
      user: {
        id: supervisorId,
        username: normalizedUsername,
        fullName: fullName.trim(),
        role: 'SUPERVISOR',
        isActive: true,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erreur lors de la configuration initiale.' });
  }
});

authRouter.post('/auth/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
    return;
  }

  const normUsername = username.trim().toLowerCase();
  const userRow = db.prepare(
    `SELECT id, username, fullName, role, passwordHash, isActive
     FROM users WHERE username = ?`
  ).get(normUsername) as
    | {
        id: string;
        username: string;
        fullName: string;
        role: UserRole;
        passwordHash: string;
        isActive: number;
      }
    | undefined;

  if (!userRow || !verifyPassword(password, userRow.passwordHash)) {
    res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    return;
  }

  if (userRow.isActive !== 1) {
    res.status(403).json({ error: 'Ce compte utilisateur est désactivé.' });
    return;
  }

  const token = createSession(userRow.id);
  res.json({
    token,
    user: {
      id: userRow.id,
      username: userRow.username,
      fullName: userRow.fullName,
      role: userRow.role,
      isActive: true,
    },
  });
});

authRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.sessionTokenHash) {
    deleteSession(req.sessionTokenHash);
  }
  res.json({ ok: true });
});

authRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

authRouter.get('/users', requireAuth, requireSupervisor, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, username, fullName, role, isActive, createdAt, updatedAt
       FROM users ORDER BY role DESC, fullName ASC`
    )
    .all() as Array<{
    id: string;
    username: string;
    fullName: string;
    role: UserRole;
    isActive: number;
    createdAt: string;
    updatedAt: string;
  }>;

  res.json({
    users: rows.map((u) => ({
      ...u,
      isActive: u.isActive === 1,
    })),
  });
});

authRouter.post('/users', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const { username, fullName, role, password } = req.body ?? {};
  if (typeof fullName !== 'string' || fullName.trim().length < 2) {
    res.status(400).json({ error: 'Le nom complet est requis.' });
    return;
  }
  if (typeof username !== 'string' || username.trim().length < 3) {
    res.status(400).json({ error: 'L’identifiant doit contenir au moins 3 caractères.' });
    return;
  }
  if (role !== 'SUPERVISOR' && role !== 'AGENT') {
    res.status(400).json({ error: 'Rôle invalide. Valeurs autorisées : SUPERVISOR, AGENT.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    return;
  }

  const normUsername = username.trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(normUsername);
  if (existing) {
    res.status(409).json({ error: 'Cet identifiant est déjà utilisé.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  runInTransaction(() => {
    db.prepare(
      `INSERT INTO users (id, username, fullName, role, passwordHash, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(id, normUsername, fullName.trim(), role, passwordHash, now, now);

    logActivity(
      req.user!.id,
      'USER_CREATED',
      'USER',
      id,
      { username: normUsername, fullName: fullName.trim(), role },
      now
    );
  });

  res.status(201).json({
    user: {
      id,
      username: normUsername,
      fullName: fullName.trim(),
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  });
});

authRouter.patch('/users/:id', requireAuth, requireSupervisor, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { isActive } = req.body ?? {};

  if (typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'Le champ isActive (booléen) est requis.' });
    return;
  }

  if (id === req.user!.id && !isActive) {
    res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' });
    return;
  }

  const target = db.prepare('SELECT id, username, fullName, role, isActive FROM users WHERE id = ?').get(id) as
    | { id: string; username: string; fullName: string; role: UserRole; isActive: number }
    | undefined;

  if (!target) {
    res.status(404).json({ error: 'Utilisateur introuvable.' });
    return;
  }

  const now = new Date().toISOString();
  runInTransaction(() => {
    db.prepare('UPDATE users SET isActive = ?, updatedAt = ? WHERE id = ?').run(isActive ? 1 : 0, now, id);
    if (!isActive) {
      db.prepare('DELETE FROM sessions WHERE userId = ?').run(id);
    }
    logActivity(
      req.user!.id,
      'USER_STATUS_CHANGED',
      'USER',
      id,
      { username: target.username, isActive },
      now
    );
  });

  res.json({
    user: {
      id: target.id,
      username: target.username,
      fullName: target.fullName,
      role: target.role,
      isActive,
      updatedAt: now,
    },
  });
});

import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export type UserRole = 'SUPERVISOR' | 'AGENT';

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  sessionTokenHash?: string;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexHash] = parts;
  if (!salt || !hexHash) return false;
  const expectedBuf = Buffer.from(hexHash, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (expectedBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, derivedBuf);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: string): string {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO sessions (tokenHash, userId, expiresAt, createdAt)
     VALUES (?, ?, ?, ?)`
  ).run(tokenHash, userId, expiresAt, now.toISOString());

  return rawToken;
}

export function deleteSession(tokenHash: string): void {
  db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(tokenHash);
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) {
    res.status(401).json({ error: 'Jeton de session invalide.' });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const row = db.prepare(
    `SELECT s.tokenHash, s.expiresAt, u.id, u.username, u.fullName, u.role, u.isActive
     FROM sessions s
     JOIN users u ON u.id = s.userId
     WHERE s.tokenHash = ?`
  ).get(tokenHash) as
    | {
        tokenHash: string;
        expiresAt: string;
        id: string;
        username: string;
        fullName: string;
        role: UserRole;
        isActive: number;
      }
    | undefined;

  if (!row) {
    res.status(401).json({ error: 'Session expirée ou invalide.' });
    return;
  }

  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    deleteSession(tokenHash);
    res.status(401).json({ error: 'Votre session a expiré. Veuillez vous reconnecter.' });
    return;
  }

  if (row.isActive !== 1) {
    res.status(403).json({ error: 'Compte utilisateur désactivé.' });
    return;
  }

  req.user = {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    role: row.role,
    isActive: true,
  };
  req.sessionTokenHash = tokenHash;
  next();
}

export function requireSupervisor(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  if (req.user.role !== 'SUPERVISOR') {
    res.status(403).json({ error: 'Accès refusé : rôle Superviseur requis.' });
    return;
  }
  next();
}

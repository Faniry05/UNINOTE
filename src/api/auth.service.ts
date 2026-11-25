import type { User, UserRole } from '../types/scolarite';
import { apiClient } from './client';

export interface DemoAccount {
  username: string;
  fullName: string;
  role: UserRole;
  password: string;
}

export interface AuthStatusResponse {
  needsSetup: boolean;
  hasEnvPasscode: boolean;
  demoMode?: boolean;
  demoAccounts?: DemoAccount[];
}

export interface AuthSessionResponse {
  token: string;
  user: User;
}

export interface SetupPayload {
  fullName: string;
  username: string;
  password: string;
  agentFullName?: string;
  agentUsername?: string;
  agentPassword?: string;
  adminPasscode?: string;
}

export interface CreateUserPayload {
  fullName: string;
  username: string;
  role: UserRole;
  password: string;
}

export const authService = {
  getStatus(): Promise<AuthStatusResponse> {
    return apiClient.get<AuthStatusResponse>('/auth/status');
  },

  async setupInitialAdmin(payload: SetupPayload): Promise<AuthSessionResponse> {
    const res = await apiClient.post<AuthSessionResponse>('/auth/setup', payload);
    apiClient.setToken(res.token);
    return res;
  },

  async login(username: string, password: string): Promise<AuthSessionResponse> {
    const res = await apiClient.post<AuthSessionResponse>('/auth/login', { username, password });
    apiClient.setToken(res.token);
    return res;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post<{ ok: boolean }>('/auth/logout');
    } finally {
      apiClient.setToken(null);
    }
  },

  /** Demo mode only: wipes and re-seeds the demo database. */
  resetDemo(): Promise<{ ok: boolean }> {
    return apiClient.post<{ ok: boolean }>('/demo/reset');
  },

  getMe(): Promise<{ user: User }> {
    return apiClient.get<{ user: User }>('/auth/me');
  },

  async getUsers(): Promise<User[]> {
    const res = await apiClient.get<{ users: User[] }>('/users');
    return res.users;
  },

  async createUser(payload: CreateUserPayload): Promise<User> {
    const res = await apiClient.post<{ user: User }>('/users', payload);
    return res.user;
  },

  async setUserActive(id: string, isActive: boolean): Promise<User> {
    const res = await apiClient.patch<{ user: User }>(`/users/${encodeURIComponent(id)}`, { isActive });
    return res.user;
  },
};

import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus, Shield, UserCheck, Power, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authService } from '../api/auth.service';
import type { User, UserRole } from '../types/scolarite';
import { formatDateShort } from '../utils/format';

interface TeamManagementPageProps {
  currentUser: User;
}

export function TeamManagementPage({ currentUser }: TeamManagementPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<UserRole>('AGENT');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const list = await authService.getUsers();
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement de l’équipe.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setFeedback(null);
    try {
      const created = await authService.createUser({
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        role,
        password,
      });
      setShowCreate(false);
      setFullName('');
      setUsername('');
      setPassword('');
      setRole('AGENT');
      setFeedback(`Compte créé pour ${created.fullName} (${created.role === 'SUPERVISOR' ? 'Superviseur' : 'Agent de guichet'}).`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de création du compte.');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleUser(u: User) {
    setError(null);
    setFeedback(null);
    try {
      await authService.setUserActive(u.id, !u.isActive);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de modifier le statut.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#332E86]">Contrôle d’accès</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">Équipe &amp; Accès</h1>
          <p className="text-sm text-slate-600 mt-1">
            Gérez les comptes Superviseurs et Agents de guichet autorisés à utiliser le module Scolarité.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowCreate(true);
            setError(null);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#332E86] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#28246b] self-start cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          Nouveau compte personnel
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {feedback && (
        <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      <div className="glass-panel rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Chargement des comptes...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Nom complet</th>
                  <th className="py-3 px-4">Identifiant</th>
                  <th className="py-3 px-4">Rôle</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Créé le</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {u.fullName}
                      {u.id === currentUser.id && (
                        <span className="ml-2 text-xs font-normal text-slate-500">(Vous)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono-ref text-xs text-slate-700">@{u.username}</td>
                    <td className="py-3 px-4">
                      {u.role === 'SUPERVISOR' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-[#332E86] border border-indigo-200">
                          <Shield className="h-3.5 w-3.5" />
                          Superviseur
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200">
                          <UserCheck className="h-3.5 w-3.5" />
                          Agent de guichet
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {u.isActive ? (
                        <span className="text-xs font-medium text-emerald-700">Actif</span>
                      ) : (
                        <span className="text-xs font-medium text-rose-600">Désactivé</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">{formatDateShort(u.createdAt)}</td>
                    <td className="py-3 px-4 text-right">
                      {u.id !== currentUser.id ? (
                        <button
                          type="button"
                          onClick={() => handleToggleUser(u)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          <Power className="h-3.5 w-3.5" />
                          {u.isActive ? 'Désactiver' : 'Réactiver'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <form onSubmit={handleCreateUser} className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Créer un compte personnel</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="usr-fullname">
                Nom complet *
              </label>
              <input
                id="usr-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex. Rasoa Guichet"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="usr-name">
                  Identifiant *
                </label>
                <input
                  id="usr-name"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex. guichet2"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="usr-role">
                  Rôle *
                </label>
                <select
                  id="usr-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm bg-white"
                >
                  <option value="AGENT">Agent de guichet</option>
                  <option value="SUPERVISOR">Superviseur</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="usr-pass">
                Mot de passe (6 caractères min.) *
              </label>
              <input
                id="usr-pass"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-[#332E86] px-4 py-2 text-sm font-semibold text-white hover:bg-[#28246b] disabled:opacity-60 cursor-pointer"
              >
                {creating ? 'Création...' : 'Créer le compte'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

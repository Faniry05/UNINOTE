import { useState, type FormEvent } from 'react';
import { GraduationCap, Lock, ShieldCheck, UserPlus, AlertCircle } from 'lucide-react';
import { authService } from '../api/auth.service';
import type { User } from '../types/scolarite';

interface LoginScreenProps {
  needsSetup: boolean;
  hasEnvPasscode: boolean;
  onAuthenticated: (user: User) => void;
}

export function LoginScreen({ needsSetup, hasEnvPasscode, onAuthenticated }: LoginScreenProps) {
  // Login state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Setup state
  const [supFullName, setSupFullName] = useState('');
  const [supUsername, setSupUsername] = useState('');
  const [supPassword, setSupPassword] = useState('');
  const [createInitialAgent, setCreateInitialAgent] = useState(true);
  const [agentFullName, setAgentFullName] = useState('');
  const [agentUsername, setAgentUsername] = useState('');
  const [agentPassword, setAgentPassword] = useState('');
  const [adminPasscode, setAdminPasscode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await authService.login(username, password);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de connexion.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await authService.setupInitialAdmin({
        fullName: supFullName,
        username: supUsername,
        password: supPassword,
        ...(createInitialAgent && agentUsername.trim()
          ? {
              agentFullName,
              agentUsername,
              agentPassword,
            }
          : {}),
        ...(hasEnvPasscode ? { adminPasscode } : {}),
      });
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la configuration initiale.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(circle at 12% 14%, rgba(51, 46, 134, 0.14), transparent 42%), radial-gradient(circle at 86% 84%, rgba(51, 46, 134, 0.10), transparent 46%)',
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-lg">
        <div className="flex items-center justify-center gap-3 mb-7">
          <div className="h-11 w-11 rounded-xl bg-[#332E86] text-white flex items-center justify-center shadow-sm">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">UniNotes</h1>
            <p className="text-xs font-medium text-slate-500">Scolarité — Gestion des prestations</p>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6 sm:p-8">
          {needsSetup ? (
            <form onSubmit={handleSetup} className="space-y-5">
              <div className="border-b border-slate-200/80 pb-4">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#332E86] mb-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Configuration initiale de la plateforme
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Créer le compte Superviseur</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Aucun compte n’est encore configuré. Définissez le premier administrateur Scolarité (Superviseur).
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-sm text-rose-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {hasEnvPasscode && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="setup-passcode">
                    Code administrateur serveur
                  </label>
                  <input
                    id="setup-passcode"
                    type="password"
                    required
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none focus:ring-2 focus:ring-[#332E86]/20"
                    placeholder="Code configuré dans ADMIN_PASSCODE"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="sup-name">
                    Nom complet (Superviseur)
                  </label>
                  <input
                    id="sup-name"
                    type="text"
                    required
                    value={supFullName}
                    onChange={(e) => setSupFullName(e.target.value)}
                    placeholder="Ex. Dr. Raveloson"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none focus:ring-2 focus:ring-[#332E86]/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="sup-user">
                    Identifiant
                  </label>
                  <input
                    id="sup-user"
                    type="text"
                    required
                    value={supUsername}
                    onChange={(e) => setSupUsername(e.target.value)}
                    placeholder="Ex. superviseur"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none focus:ring-2 focus:ring-[#332E86]/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="sup-pass">
                  Mot de passe Superviseur (6 caractères min.)
                </label>
                <input
                  id="sup-pass"
                  type="password"
                  required
                  minLength={6}
                  value={supPassword}
                  onChange={(e) => setSupPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none focus:ring-2 focus:ring-[#332E86]/20"
                />
              </div>

              <div className="pt-2 border-t border-slate-200/80">
                <label className="flex items-center gap-2.5 text-sm font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createInitialAgent}
                    onChange={(e) => setCreateInitialAgent(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#332E86] focus:ring-[#332E86]"
                  />
                  <UserPlus className="h-4 w-4 text-[#332E86]" />
                  Créer aussi un compte Agent de guichet (optionnel)
                </label>

                {createInitialAgent && (
                  <div className="mt-3.5 space-y-3 rounded-xl bg-slate-50/90 border border-slate-200 p-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="ag-name">
                          Nom complet (Agent)
                        </label>
                        <input
                          id="ag-name"
                          type="text"
                          required={createInitialAgent}
                          value={agentFullName}
                          onChange={(e) => setAgentFullName(e.target.value)}
                          placeholder="Ex. Nomena Guichet"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="ag-user">
                          Identifiant Agent
                        </label>
                        <input
                          id="ag-user"
                          type="text"
                          required={createInitialAgent}
                          value={agentUsername}
                          onChange={(e) => setAgentUsername(e.target.value)}
                          placeholder="Ex. guichet1"
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1" htmlFor="ag-pass">
                        Mot de passe Agent
                      </label>
                      <input
                        id="ag-pass"
                        type="password"
                        required={createInitialAgent}
                        minLength={6}
                        value={agentPassword}
                        onChange={(e) => setAgentPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[#332E86] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#28246b] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {submitting ? 'Initialisation en cours...' : 'Initialiser UniNotes et accéder'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Connexion personnel Scolarité</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Connectez-vous avec votre compte Superviseur ou Agent de guichet.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-sm text-rose-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="login-username">
                  Identifiant
                </label>
                <input
                  id="login-username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Votre identifiant UniNotes"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none focus:ring-2 focus:ring-[#332E86]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5" htmlFor="login-password">
                  Mot de passe
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 focus:border-[#332E86] focus:outline-none focus:ring-2 focus:ring-[#332E86]/20"
                  />
                  <Lock className="h-4 w-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[#332E86] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#28246b] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {submitting ? 'Vérification...' : 'Se connecter'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { Lock, ShieldCheck, UserPlus, AlertCircle, FlaskConical } from 'lucide-react';
import { authService, type DemoAccount } from '../api/auth.service';
import { LogoTile } from '../ui/LogoTile';
import type { User } from '../types/scolarite';

interface LoginScreenProps {
  needsSetup: boolean;
  hasEnvPasscode: boolean;
  demoAccounts?: DemoAccount[];
  onAuthenticated: (user: User) => void;
}

export function LoginScreen({ needsSetup, hasEnvPasscode, demoAccounts = [], onAuthenticated }: LoginScreenProps) {
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

  async function loginAs(u: string, p: string) {
    setError(null);
    setSubmitting(true);
    try {
      const { user } = await authService.login(u, p);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de connexion.');
    } finally {
      setSubmitting(false);
    }
  }

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
    <div className="min-h-screen px-[15px] py-[14px] flex flex-col">
      <div className="flex items-center gap-[9px]">
        <LogoTile />
        <div className="card h-[38px] rounded-xl px-3 flex items-center gap-2.5">
          <span className="mono text-[12px] tracking-[-.12em] opacity-70">::</span>
          <span className="text-[18px] leading-none">UniNotes</span>
          <span className="h-2.5 w-2.5 rounded-full border-2 border-pin-orange" aria-hidden />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-8 items-end lg:items-center py-8 mx-auto w-full max-w-[1410px]">
        <div>
          <div className="scene-text font-mono-ref text-[12.6px]">UniNotes&nbsp;&nbsp;Université / Scolarité /</div>
          <h1 className="scene-text scene-title mt-2">Service de la Scolarité</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="chip">Relevés · Attestations · Certifications</span>
            <span className="chip">Paiement espèces</span>
          </div>
        </div>

      <div className="w-full">
        <div className="glass-panel rounded-2xl p-6 sm:p-8">
          {needsSetup ? (
            <form onSubmit={handleSetup} className="space-y-5">
              <div className="border-b border-ink/10 pb-4">
                <div className="inline-flex items-center gap-2 text-xs font-medium text-ink mb-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  Configuration initiale de la plateforme
                </div>
                <h2 className="text-lg font-medium text-ink">Créer le compte Superviseur</h2>
                <p className="text-sm text-ink/70 mt-1">
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
                  <label className="block text-xs font-medium text-ink/80 mb-1.5" htmlFor="setup-passcode">
                    Code administrateur serveur
                  </label>
                  <input
                    id="setup-passcode"
                    type="password"
                    required
                    value={adminPasscode}
                    onChange={(e) => setAdminPasscode(e.target.value)}
                    className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                    placeholder="Code configuré dans ADMIN_PASSCODE"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-ink/80 mb-1.5" htmlFor="sup-name">
                    Nom complet (Superviseur)
                  </label>
                  <input
                    id="sup-name"
                    type="text"
                    required
                    value={supFullName}
                    onChange={(e) => setSupFullName(e.target.value)}
                    placeholder="Ex. Dr. Raveloson"
                    className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink/80 mb-1.5" htmlFor="sup-user">
                    Identifiant
                  </label>
                  <input
                    id="sup-user"
                    type="text"
                    required
                    value={supUsername}
                    onChange={(e) => setSupUsername(e.target.value)}
                    placeholder="Ex. superviseur"
                    className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink/80 mb-1.5" htmlFor="sup-pass">
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
                  className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                />
              </div>

              <div className="pt-2 border-t border-ink/10">
                <label className="flex items-center gap-2.5 text-sm font-medium text-ink/90 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createInitialAgent}
                    onChange={(e) => setCreateInitialAgent(e.target.checked)}
                    className="h-4 w-4 rounded border-ink/15 text-ink focus:ring-ink"
                  />
                  <UserPlus className="h-4 w-4 text-ink" />
                  Créer aussi un compte Agent de guichet (optionnel)
                </label>

                {createInitialAgent && (
                  <div className="mt-3.5 space-y-3 rounded-xl bg-panel/60 border border-ink/10 p-3.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-ink/80 mb-1" htmlFor="ag-name">
                          Nom complet (Agent)
                        </label>
                        <input
                          id="ag-name"
                          type="text"
                          required={createInitialAgent}
                          value={agentFullName}
                          onChange={(e) => setAgentFullName(e.target.value)}
                          placeholder="Ex. Nomena Guichet"
                          className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-ink/80 mb-1" htmlFor="ag-user">
                          Identifiant Agent
                        </label>
                        <input
                          id="ag-user"
                          type="text"
                          required={createInitialAgent}
                          value={agentUsername}
                          onChange={(e) => setAgentUsername(e.target.value)}
                          placeholder="Ex. guichet1"
                          className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink/80 mb-1" htmlFor="ag-pass">
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
                        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-ink focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white hover:bg-black disabled:opacity-60 transition-colors cursor-pointer"
              >
                {submitting ? 'Initialisation en cours...' : 'Initialiser UniNotes et accéder'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <h2 className="text-lg font-medium text-ink">Connexion personnel Scolarité</h2>
                <p className="text-sm text-ink/70 mt-1">
                  Connectez-vous avec votre compte Responsable ou Agent de guichet.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3 text-sm text-rose-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-ink/80 mb-1.5" htmlFor="login-username">
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
                  className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink/80 mb-1.5" htmlFor="login-password">
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
                    className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 pr-10 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/20"
                  />
                  <Lock className="h-4 w-4 text-ink/40 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-medium text-white hover:bg-black disabled:opacity-60 transition-colors cursor-pointer"
              >
                {submitting ? 'Vérification...' : 'Se connecter'}
              </button>

              {demoAccounts.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-900">
                    <FlaskConical className="h-4 w-4" />
                    Comptes de démonstration (mot de passe : {demoAccounts[0].password})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {demoAccounts.map((acc) => (
                      <button
                        key={acc.username}
                        type="button"
                        disabled={submitting}
                        onClick={() => loginAs(acc.username, acc.password)}
                        className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-left hover:border-ink/50 disabled:opacity-60 cursor-pointer"
                      >
                        <div className="text-xs font-medium text-ink">
                          {acc.role === 'SUPERVISOR' ? 'Responsable' : 'Agent guichet'}
                        </div>
                        <div className="text-[11px] font-mono-ref text-ink/60">{acc.username}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

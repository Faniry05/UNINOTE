import { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  GraduationCap,
  History,
  LogOut,
  Menu,
  PlusCircle,
  Settings2,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { authService } from './api/auth.service';
import { apiClient } from './api/client';
import { ActivityLogPage } from './components/ActivityLogPage';
import { AgentHistoryPage } from './components/AgentHistoryPage';
import { CounterInterface } from './components/CounterInterface';
import { LoginScreen } from './components/LoginScreen';
import { ServiceCatalogPage } from './components/ServiceCatalogPage';
import { StudentsDirectoryPage } from './components/StudentsDirectoryPage';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { TeamManagementPage } from './components/TeamManagementPage';
import type { User } from './types/scolarite';

type TabId =
  | 'dashboard'
  | 'counter'
  | 'my-history'
  | 'catalog'
  | 'audit'
  | 'students'
  | 'team';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [hasEnvPasscode, setHasEnvPasscode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('counter');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    apiClient.setUnauthorizedHandler(() => {
      apiClient.setToken(null);
      setUser(null);
    });

    async function checkStatus() {
      try {
        const status = await authService.getStatus();
        setNeedsSetup(status.needsSetup);
        setHasEnvPasscode(status.hasEnvPasscode);
      } catch {
        // Fallback to login screen
      } finally {
        setBooting(false);
      }
    }

    checkStatus();

    return () => {
      apiClient.setUnauthorizedHandler(null);
    };
  }, []);

  function handleAuthenticated(loggedInUser: User) {
    setUser(loggedInUser);
    setNeedsSetup(false);
    setActiveTab(loggedInUser.role === 'SUPERVISOR' ? 'dashboard' : 'counter');
  }

  async function handleLogout() {
    await authService.logout();
    setUser(null);
    const status = await authService.getStatus().catch(() => ({ needsSetup: false, hasEnvPasscode: false }));
    setNeedsSetup(status.needsSetup);
  }

  if (booting) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <div className="h-5 w-5 rounded-full border-2 border-[#332E86] border-t-transparent animate-spin" />
          Chargement d’UniNotes...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        needsSetup={needsSetup}
        hasEnvPasscode={hasEnvPasscode}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const isSupervisor = user.role === 'SUPERVISOR';

  const navItems: Array<{ id: TabId; label: string; icon: typeof BarChart3; section: string }> = isSupervisor
    ? [
        { id: 'dashboard', label: 'Suivi des prestations', icon: BarChart3, section: 'Scolarité' },
        { id: 'counter', label: 'Nouvelle prestation', icon: PlusCircle, section: 'Scolarité' },
        { id: 'catalog', label: 'Catalogue des tarifs', icon: Settings2, section: 'Scolarité' },
        { id: 'audit', label: 'Journal d’audit', icon: ClipboardList, section: 'Scolarité' },
        { id: 'students', label: 'Étudiants & Notes', icon: BookOpen, section: 'UniNotes' },
        { id: 'team', label: 'Équipe & Accès', icon: Users, section: 'Administration' },
      ]
    : [
        { id: 'counter', label: 'Nouvelle prestation', icon: PlusCircle, section: 'Guichet Scolarité' },
        { id: 'my-history', label: 'Mes opérations', icon: History, section: 'Guichet Scolarité' },
        { id: 'students', label: 'Étudiants & Notes', icon: BookOpen, section: 'UniNotes' },
      ];

  return (
    <div className="min-h-screen bg-[#f4f6fb] flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-[#332E86] text-white flex items-center justify-center">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 leading-tight">UniNotes</div>
            <div className="text-[11px] font-medium text-slate-500">Scolarité — Prestations</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label="Menu"
          className="rounded-lg border border-slate-200 p-2 text-slate-700 cursor-pointer"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'fixed inset-0 z-40 flex' : 'hidden'
        } lg:flex lg:w-72 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen flex-col bg-white border-r border-slate-200/90`}
      >
        <div className="p-5 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#332E86] text-white flex items-center justify-center shadow-xs">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-bold tracking-tight text-slate-900">UniNotes</div>
              <div className="text-xs font-medium text-slate-500">Scolarité — Gestion</div>
            </div>
          </div>
          {mobileMenuOpen && (
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden rounded-lg p-1.5 text-slate-500"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto" aria-label="Navigation principale">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-[#332E86] text-white shadow-sm'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200/80 bg-slate-50/70 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[#332E86]/10 text-[#332E86] flex items-center justify-center font-bold text-xs shrink-0">
              {user.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-900 truncate">{user.fullName}</div>
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <Shield className="h-3 w-3 text-[#332E86] shrink-0" />
                <span>{isSupervisor ? 'Superviseur' : 'Agent de guichet'}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          {activeTab === 'dashboard' && isSupervisor && <SupervisorDashboard />}
          {activeTab === 'counter' && <CounterInterface currentUser={user} />}
          {activeTab === 'my-history' && <AgentHistoryPage />}
          {activeTab === 'catalog' && isSupervisor && <ServiceCatalogPage />}
          {activeTab === 'audit' && isSupervisor && <ActivityLogPage />}
          {activeTab === 'students' && <StudentsDirectoryPage currentUser={user} />}
          {activeTab === 'team' && isSupervisor && <TeamManagementPage currentUser={user} />}
        </div>
      </main>
    </div>
  );
}

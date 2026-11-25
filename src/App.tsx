import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FlaskConical,
  Hammer,
  History,
  LogOut,
  PlusCircle,
  RotateCcw,
  Settings2,
  Users,
} from 'lucide-react';
import { authService, type DemoAccount } from './api/auth.service';
import { apiClient } from './api/client';
import { ActivityLogPage } from './components/ActivityLogPage';
import { AgentHistoryPage } from './components/AgentHistoryPage';
import { CounterInterface } from './components/CounterInterface';
import { LoginScreen } from './components/LoginScreen';
import { ProductionTrackingPage } from './components/ProductionTrackingPage';
import { ServiceCatalogPage } from './components/ServiceCatalogPage';
import { StudentsDirectoryPage } from './components/StudentsDirectoryPage';
import { SupervisorDashboard } from './components/SupervisorDashboard';
import { TeamManagementPage } from './components/TeamManagementPage';
import type { User } from './types/scolarite';
import { LogoTile } from './ui/LogoTile';
import { playEntrance } from './ui/motion';
import { SceneBackdrop } from './ui/SceneBackdrop';
import { setDemoMode } from './utils/demo';

type TabId = 'dashboard' | 'counter' | 'my-history' | 'production' | 'catalog' | 'audit' | 'students' | 'team';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [hasEnvPasscode, setHasEnvPasscode] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('counter');
  const [demoMode, setDemoModeState] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);
  const [focusProductionId, setFocusProductionId] = useState<string | null>(null);
  const [resettingDemo, setResettingDemo] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

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
        setDemoMode(Boolean(status.demoMode));
        setDemoModeState(Boolean(status.demoMode));
        setDemoAccounts(status.demoAccounts ?? []);
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

  // Entrance timeline: top bar once per login, page content on each tab change.
  useEffect(() => {
    if (user) playEntrance(topRef.current);
  }, [user]);
  useEffect(() => {
    if (user) playEntrance(mainRef.current, 150);
  }, [user, activeTab, focusProductionId]);

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

  function openProduction(productionId: string) {
    setFocusProductionId(productionId);
    setActiveTab('production');
  }

  async function handleResetDemo() {
    if (!window.confirm('Réinitialiser toutes les données de démonstration ? Vous serez déconnecté(e).')) return;
    setResettingDemo(true);
    try {
      await authService.resetDemo();
    } finally {
      setResettingDemo(false);
      apiClient.setToken(null);
      setUser(null);
    }
  }

  const demoBanner = demoMode ? (
    <div className="sticky top-0 z-40 bg-ink text-amber-light mono text-[11px] px-4 py-1.5 flex items-center justify-center gap-2 text-center">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      Mode démonstration — données fictives, base séparée
    </div>
  ) : null;

  if (booting) {
    return (
      <>
        <SceneBackdrop />
        <div className="min-h-screen flex items-center justify-center">
          <div className="card rounded-xl px-4 py-3 flex items-center gap-3 mono text-xs">
            <div className="h-4 w-4 rounded-full border-2 border-ink border-t-transparent animate-spin" />
            Chargement d’UniNotes
          </div>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <SceneBackdrop />
        {demoBanner}
        <LoginScreen
          needsSetup={needsSetup}
          hasEnvPasscode={hasEnvPasscode}
          demoAccounts={demoAccounts}
          onAuthenticated={handleAuthenticated}
        />
      </>
    );
  }

  const isSupervisor = user.role === 'SUPERVISOR';

  const navItems: Array<{ id: TabId; label: string; icon: typeof BarChart3 }> = isSupervisor
    ? [
        { id: 'dashboard', label: 'Tableau de bord', icon: BarChart3 },
        { id: 'counter', label: 'Guichet', icon: PlusCircle },
        { id: 'production', label: 'Production', icon: Hammer },
        { id: 'catalog', label: 'Tarifs', icon: Settings2 },
        { id: 'audit', label: 'Historique', icon: ClipboardList },
        { id: 'students', label: 'Étudiants', icon: BookOpen },
        { id: 'team', label: 'Équipe', icon: Users },
      ]
    : [
        { id: 'counter', label: 'Guichet', icon: PlusCircle },
        { id: 'production', label: 'Production', icon: Hammer },
        { id: 'my-history', label: 'Mes ventes', icon: History },
        { id: 'students', label: 'Étudiants', icon: BookOpen },
      ];

  return (
    <>
      <SceneBackdrop />
      {demoBanner}
      <div className="min-h-screen px-[15px] pb-10">
        {/* Top bar: logo tile, user pill, navigation tab bar, session actions */}
        <div ref={topRef} className="mx-auto max-w-[1440px] pt-[14px] flex flex-wrap items-center gap-[9px]">
          <div data-enter="drop" data-delay="0">
            <LogoTile />
          </div>
          <div data-enter="drop" data-delay="80" className="card h-[38px] rounded-xl px-3 flex items-center gap-2.5 min-w-0 flex-1 sm:flex-none">
            <span className="mono text-[12px] tracking-[-.12em] opacity-70">::</span>
            <span className="text-[18px] leading-none truncate max-w-[46vw] sm:max-w-none">{user.fullName}</span>
            <span className="h-2.5 w-2.5 rounded-full border-2 border-pin-orange" aria-hidden />
            <span className="mono text-[10.5px] text-ink/60 hidden 2xl:inline">
              {isSupervisor ? 'Responsable' : 'Agent guichet'}
            </span>
          </div>

          <nav
            data-enter="drop"
            data-delay="160"
            aria-label="Navigation principale"
            className="card rounded-xl p-1 flex gap-1 overflow-x-auto max-w-full order-last lg:order-none w-full lg:w-auto"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-active={activeTab === item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setFocusProductionId(null);
                  }}
                  className="tab"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div data-enter="drop" data-delay="240" className="ml-auto flex gap-[9px]">
            {demoMode && isSupervisor && (
              <button
                type="button"
                disabled={resettingDemo}
                onClick={handleResetDemo}
                title="Réinitialiser la démo"
                className="card h-[38px] w-[41px] rounded-xl inline-flex items-center justify-center hover:bg-amber-light disabled:opacity-60 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="sr-only">Réinitialiser la démo</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleLogout}
              title="Se déconnecter"
              className="card h-[38px] w-[41px] rounded-xl inline-flex items-center justify-center hover:bg-amber-light cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="sr-only">Se déconnecter</span>
            </button>
          </div>
        </div>

        <main ref={mainRef} className="mx-auto max-w-[1440px] pt-[34px]">
          {activeTab === 'dashboard' && isSupervisor && <SupervisorDashboard />}
          {activeTab === 'counter' && <CounterInterface currentUser={user} onOpenProduction={openProduction} />}
          {activeTab === 'production' && (
            <ProductionTrackingPage key={focusProductionId ?? 'list'} currentUser={user} focusProductionId={focusProductionId} />
          )}
          {activeTab === 'my-history' && <AgentHistoryPage />}
          {activeTab === 'catalog' && isSupervisor && <ServiceCatalogPage />}
          {activeTab === 'audit' && isSupervisor && <ActivityLogPage />}
          {activeTab === 'students' && <StudentsDirectoryPage currentUser={user} />}
          {activeTab === 'team' && isSupervisor && <TeamManagementPage currentUser={user} />}
        </main>
      </div>
    </>
  );
}

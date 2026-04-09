import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, createContext, useContext, Suspense, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { isAuthenticated, clearToken, api } from './api/api';
import { Sun, Moon, RefreshCw, LayoutGrid, Monitor, Keyboard, Link2 } from 'lucide-react';
import { clsx } from 'clsx';
import LoginPage from './pages/LoginPage';
import {
  AboutPage,
  AlertSettingsPage,
  AlertsPage,
  AnalysisPage,
  AvailabilityGroupsPage,
  BackupAmpelPage,
  BackupsPage,
  BlockingPage,
  CollectionHealthPage,
  CommunityToolsPage,
  ConfigGroupsPage,
  ConfigRetentionPage,
  ConfigServersPage,
  ConfigUsersPage,
  ConfigurationPage,
  CorruptionCheckdbPage,
  CpuPerformancePage,
  CustomReportsPage,
  DashboardPage,
  DatabaseDetailPage,
  DatabaseMirroringPage,
  DriveHistoryPage,
  DrivesPage,
  EstateAGsPage,
  EstateBackupsPage,
  EstateDatabaseMirroringPage,
  EstateDiskPage,
  EstateLogShippingPage,
  ExecStatsPage,
  FleetStatsPage,
  IdentityColumnsPage,
  InstanceDetailPage,
  InstancesPage,
  IOPerformancePage,
  JobTimelinePage,
  JobsPage,
  LicenseOverviewPage,
  LogShippingPage,
  MemoryPage,
  PatchingPage,
  PerformanceCountersPage,
  QueriesPage,
  QueryStorePage,
  ReportsPage,
  RunningQueriesPage,
  SchemaChangesPage,
  SlowQueriesPage,
  SqlMonitorPage,
  TempDBPage,
  ThresholdsPage,
  UnderutilizedPage,
  WaitsTimelinePage,
  WinFormsScreensPage,
  WindowsParityPage,
  DBSpacePage,
} from './lazyPages';
import SearchDialog from './components/SearchDialog';
import { usePresentation } from './context/PresentationContext';
import Breadcrumbs from './components/Breadcrumbs';
import TimeRangePicker from './components/TimeRangePicker';
import InstanceTree from './components/InstanceTree';
import PageTransition from './components/PageTransition';
import RouteSkeleton from './components/RouteSkeleton';
import AmbientBackground from './components/AmbientBackground';
import ScrollToTop from './components/ScrollToTop';
import KeyboardShortcutsModal, { registerShortcutsPaletteListener } from './components/KeyboardShortcutsModal';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { openSearchPalette } from './lib/searchEvents';
import { useToast } from './context/ToastContext';

const RefreshContext = createContext<{ lastRefresh: Date; refresh: () => void }>({
  lastRefresh: new Date(),
  refresh: () => {},
});

export function useRefresh() {
  return useContext(RefreshContext);
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored ? stored === 'dark' : true;
  });

  useEffect(() => {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('light-mode', !dark);
  }, [dark]);

  return { dark, toggle: () => setDark(d => !d) };
}

function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const { lastRefresh, refresh } = useRefresh();
  const { dark, toggle: toggleTheme } = useTheme();
  const { mode, setMode } = usePresentation();
  const reduceMotion = useReducedMotion();
  const isWebShell = mode === 'web';
  const lightShell = isWebShell && !dark;
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [searchData, setSearchData] = useState<{ instances: any[]; databases: any[]; jobs: any[] }>({
    instances: [], databases: [], jobs: [],
  });
  const showToast = useToast();

  useDocumentTitle(location.pathname);

  useEffect(() => registerShortcutsPaletteListener(() => setShortcutsOpen(true)), []);

  useEffect(() => {
    (async () => {
      try {
        const [instances, jobs] = await Promise.all([
          api.instances().catch(() => []),
          api.jobsRecent(500, 0).catch(() => []),
        ]);
        setSearchData({
          instances: Array.isArray(instances) ? instances : [],
          databases: [],
          jobs: Array.isArray(jobs) ? jobs : [],
        });
      } catch {}
    })();
  }, []);

  // Windows-style presentation uses a light shell; web mode follows the sun/moon toggle.
  useEffect(() => {
    if (mode === 'desktop') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.toggle('light-mode', !dark);
    }
  }, [mode, dark]);

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  const copyPageLink = useCallback(async () => {
    const url = `${window.location.origin}${location.pathname}${location.search}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  }, [location.pathname, location.search, showToast]);

  const headerMotion = isWebShell && !reduceMotion
    ? {
        initial: { y: -16, opacity: 0 } as const,
        animate: { y: 0, opacity: 1 } as const,
        transition: { type: 'spring' as const, stiffness: 380, damping: 32, mass: 0.9 },
      }
    : { initial: false as const };

  return (
    <div className="relative flex h-screen overflow-hidden">
      {isWebShell && <AmbientBackground lightShell={lightShell} />}

      <SearchDialog instances={searchData.instances} databases={searchData.databases} jobs={searchData.jobs} />

      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Instance Tree Sidebar */}
      <InstanceTree onLogout={handleLogout} />

      {/* Main */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        <motion.header
          {...headerMotion}
          className={clsx(
            'flex h-14 shrink-0 items-center justify-between border-b px-6 glass-strong z-10 border-white/10',
            mode === 'desktop' && 'layout-header-desktop',
            isWebShell && 'supports-[backdrop-filter]:bg-slate-950/65',
          )}
        >
          <Breadcrumbs />
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              whileHover={isWebShell && !reduceMotion ? { scale: 1.03 } : undefined}
              whileTap={isWebShell && !reduceMotion ? { scale: 0.97 } : undefined}
              onClick={() => openSearchPalette()}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-500 bg-white/5 hover:bg-white/10 transition-colors duration-200"
            >
              <span>Search</span>
              <kbd className="text-[10px] px-1 py-0.5 rounded bg-white/10">⌘K</kbd>
            </motion.button>
            <motion.button
              type="button"
              whileHover={isWebShell && !reduceMotion ? { scale: 1.03 } : undefined}
              whileTap={isWebShell && !reduceMotion ? { scale: 0.97 } : undefined}
              onClick={() => void copyPageLink()}
              title="Copy link to this page"
              aria-label="Copy link to this page"
              className="hidden sm:flex items-center justify-center p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors duration-200"
            >
              <Link2 className="w-4 h-4" />
            </motion.button>
            <TimeRangePicker />
            <motion.button
              type="button"
              whileHover={isWebShell && !reduceMotion ? { scale: 1.03 } : undefined}
              whileTap={isWebShell && !reduceMotion ? { scale: 0.97 } : undefined}
              onClick={() => setShortcutsOpen(true)}
              title="Keyboard shortcuts (?)"
              className="hidden sm:flex items-center justify-center p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors duration-200"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </motion.button>
            <motion.button
              type="button"
              whileHover={isWebShell && !reduceMotion ? { scale: 1.03 } : undefined}
              whileTap={isWebShell && !reduceMotion ? { scale: 0.97 } : undefined}
              onClick={() => setMode(mode === 'desktop' ? 'web' : 'desktop')}
              title={
                mode === 'desktop'
                  ? 'Switch to dark glass web theme'
                  : 'Windows DBA Dash look: light shell, bordered grids (default)'
              }
              className={clsx(
                'hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs transition-all border',
                mode === 'desktop'
                  ? 'border-[#adadad] bg-gradient-to-b from-white to-[#f0f0f0] text-black hover:from-[#fafafa] hover:to-[#ebebeb]'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border-transparent hover:border-white/10',
              )}
            >
              {mode === 'desktop' ? <Monitor className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
              {mode === 'desktop' ? 'Web UI' : 'Windows style'}
            </motion.button>
            <motion.button
              type="button"
              whileHover={isWebShell && !reduceMotion ? { scale: 1.08, rotate: 12 } : undefined}
              whileTap={isWebShell && !reduceMotion ? { scale: 0.92 } : undefined}
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors duration-200"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </motion.button>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {lastRefresh.toLocaleTimeString()}
            </div>
            <motion.button
              type="button"
              whileHover={isWebShell && !reduceMotion ? { scale: 1.08 } : undefined}
              whileTap={isWebShell && !reduceMotion ? { scale: 0.92 } : undefined}
              onClick={refresh}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-colors duration-200"
            >
              <RefreshCw className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.header>

        <main ref={mainRef} className="flex-1 overflow-y-auto p-6 layout-main">
          <ScrollToTop scrollElRef={mainRef} />
          <PageTransition>
            <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>
          </PageTransition>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const refresh = useCallback(() => {
    setLastRefresh(new Date());
  }, []);

  return (
    <RefreshContext.Provider value={{ lastRefresh, refresh }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={
          <AuthGuard>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/instances" element={<InstancesPage />} />
                <Route path="/instances/:id" element={<InstanceDetailPage />} />
                <Route path="/instances/:id/databases/:dbId" element={<DatabaseDetailPage />} />
                <Route path="/instances/:id/backups" element={<BackupsPage />} />
                <Route path="/instances/:id/drives" element={<DrivesPage />} />
                <Route path="/instances/:id/configuration" element={<ConfigurationPage />} />
                <Route path="/instances/:id/hadr" element={<AvailabilityGroupsPage />} />
                <Route path="/instances/:id/jobs" element={<JobTimelinePage />} />
                <Route path="/instances/:id/reports" element={<ReportsPage />} />
                <Route path="/jobs" element={<JobsPage />} />
                <Route path="/backups" element={<BackupsPage />} />
                <Route path="/alerts" element={<AlertsPage />} />
                <Route path="/drives" element={<DrivesPage />} />
                <Route path="/availability-groups" element={<AvailabilityGroupsPage />} />
                <Route path="/analysis" element={<AnalysisPage />} />
                <Route path="/queries" element={<QueriesPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/estate/disks" element={<EstateDiskPage />} />
                <Route path="/estate/backups" element={<EstateBackupsPage />} />
                <Route path="/estate/availability-groups" element={<EstateAGsPage />} />
                <Route path="/estate/log-shipping" element={<EstateLogShippingPage />} />
                <Route path="/estate/database-mirroring" element={<EstateDatabaseMirroringPage />} />
                <Route path="/settings/alerts" element={<AlertSettingsPage />} />
                <Route path="/settings/servers" element={<ConfigServersPage />} />
                <Route path="/settings/groups" element={<ConfigGroupsPage />} />
                <Route path="/settings/users" element={<ConfigUsersPage />} />
                <Route path="/settings/retention" element={<ConfigRetentionPage />} />
                <Route path="/performance/cpu" element={<CpuPerformancePage />} />
                <Route path="/performance/running-queries" element={<RunningQueriesPage />} />
                <Route path="/performance/blocking" element={<BlockingPage />} />
                <Route path="/performance/slow-queries" element={<SlowQueriesPage />} />
                <Route path="/performance/memory" element={<MemoryPage />} />
                <Route path="/performance/io" element={<IOPerformancePage />} />
                <Route path="/performance/exec-stats" element={<ExecStatsPage />} />
                <Route path="/performance/waits-timeline" element={<WaitsTimelinePage />} />
                <Route path="/performance/counters" element={<PerformanceCountersPage />} />
                <Route path="/monitoring/job-timeline" element={<JobTimelinePage />} />
                <Route path="/monitoring/configuration" element={<ConfigurationPage />} />
                <Route path="/monitoring/patching" element={<PatchingPage />} />
                <Route path="/monitoring/schema-changes" element={<SchemaChangesPage />} />
                <Route path="/monitoring/identity-columns" element={<IdentityColumnsPage />} />
                <Route path="/monitoring/tempdb" element={<TempDBPage />} />
                <Route path="/monitoring/db-space" element={<DBSpacePage />} />
                <Route path="/monitoring/log-shipping" element={<LogShippingPage />} />
                <Route path="/monitoring/database-mirroring" element={<DatabaseMirroringPage />} />
                <Route path="/monitoring/collection-health" element={<CollectionHealthPage />} />
                <Route path="/monitoring/corruption-checkdb" element={<CorruptionCheckdbPage />} />
                <Route path="/monitoring/drive-history" element={<DriveHistoryPage />} />
                <Route path="/performance/query-store" element={<QueryStorePage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/reports/licenses" element={<LicenseOverviewPage />} />
                <Route path="/reports/underutilized" element={<UnderutilizedPage />} />
                <Route path="/reports/fleet-stats" element={<FleetStatsPage />} />
                <Route path="/reports/backup-ampel" element={<BackupAmpelPage />} />
                <Route path="/monitor" element={<SqlMonitorPage />} />
                <Route path="/settings/thresholds" element={<ThresholdsPage />} />
                <Route path="/windows-screens" element={<WinFormsScreensPage />} />
                <Route path="/windows-parity" element={<WindowsParityPage />} />
                <Route path="/tools/community" element={<CommunityToolsPage />} />
                <Route path="/tools/custom-reports" element={<CustomReportsPage />} />
              </Routes>
            </Layout>
          </AuthGuard>
        } />
      </Routes>
    </RefreshContext.Provider>
  );
}

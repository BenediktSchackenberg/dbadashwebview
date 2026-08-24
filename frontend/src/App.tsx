import { Suspense, createContext, lazy, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Moon, RefreshCw, Sun } from 'lucide-react';
import { api, clearToken, isAuthenticated } from './api/api';
import { hasRole } from './auth/session';
import type { AuthRole } from './auth/session';
import type { SearchInstanceRow, SearchJobRow } from './api/types';
import Breadcrumbs from './components/Breadcrumbs';
import InstanceTree from './components/InstanceTree';
import LoadingSpinner from './components/LoadingSpinner';
import SearchDialog from './components/SearchDialog';
import TimeRangePicker from './components/TimeRangePicker';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const InstancesPage = lazy(() => import('./pages/InstancesPage'));
const InstanceDetailPage = lazy(() => import('./pages/InstanceDetailPage'));
const JobsPage = lazy(() => import('./pages/JobsPage'));
const BackupsPage = lazy(() => import('./pages/BackupsPage'));
const BackupAmpelPage = lazy(() => import('./pages/BackupAmpelPage'));
const SqlMonitorPage = lazy(() => import('./pages/SqlMonitorPage'));
const AlertsPage = lazy(() => import('./pages/AlertsPage'));
const DrivesPage = lazy(() => import('./pages/DrivesPage'));
const CorruptionPage = lazy(() => import('./pages/CorruptionPage'));
const AvailabilityGroupsPage = lazy(() => import('./pages/AvailabilityGroupsPage'));
const DatabaseDetailPage = lazy(() => import('./pages/DatabaseDetailPage'));
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'));
const QueriesPage = lazy(() => import('./pages/QueriesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const EstateDiskPage = lazy(() => import('./pages/EstateDiskPage'));
const EstateBackupsPage = lazy(() => import('./pages/EstateBackupsPage'));
const EstateAGsPage = lazy(() => import('./pages/EstateAGsPage'));
const AlertSettingsPage = lazy(() => import('./pages/AlertSettingsPage'));
const ConfigServersPage = lazy(() => import('./pages/ConfigServersPage'));
const ConfigGroupsPage = lazy(() => import('./pages/ConfigGroupsPage'));
const ConfigUsersPage = lazy(() => import('./pages/ConfigUsersPage'));
const ConfigRetentionPage = lazy(() => import('./pages/ConfigRetentionPage'));
const RunningQueriesPage = lazy(() => import('./pages/RunningQueriesPage'));
const BlockingPage = lazy(() => import('./pages/BlockingPage'));
const SlowQueriesPage = lazy(() => import('./pages/SlowQueriesPage'));
const MemoryPage = lazy(() => import('./pages/MemoryPage'));
const IOPerformancePage = lazy(() => import('./pages/IOPerformancePage'));
const ExecStatsPage = lazy(() => import('./pages/ExecStatsPage'));
const WaitsTimelinePage = lazy(() => import('./pages/WaitsTimelinePage'));
const PerformanceCountersPage = lazy(() => import('./pages/PerformanceCountersPage'));
const JobTimelinePage = lazy(() => import('./pages/JobTimelinePage'));
const ConfigurationPage = lazy(() => import('./pages/ConfigurationPage'));
const PatchingPage = lazy(() => import('./pages/PatchingPage'));
const SchemaChangesPage = lazy(() => import('./pages/SchemaChangesPage'));
const QueryStorePage = lazy(() => import('./pages/QueryStorePage'));
const IdentityColumnsPage = lazy(() => import('./pages/IdentityColumnsPage'));
const TempDBPage = lazy(() => import('./pages/TempDBPage'));
const DBSpacePage = lazy(() => import('./pages/DBSpacePage'));
const LicenseOverviewPage = lazy(() => import('./pages/LicenseOverviewPage'));
const UnderutilizedPage = lazy(() => import('./pages/UnderutilizedPage'));
const FleetStatsPage = lazy(() => import('./pages/FleetStatsPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const ThresholdsPage = lazy(() => import('./pages/ThresholdsPage'));

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

function RoleGuard({ roles, children }: { roles: AuthRole[]; children: React.ReactNode }) {
  if (!hasRole(roles)) return <Navigate to="/" replace />;
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

  return { dark, toggle: () => setDark(current => !current) };
}

function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { lastRefresh, refresh } = useRefresh();
  const { dark, toggle: toggleTheme } = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchData, setSearchData] = useState<{ instances: SearchInstanceRow[]; databases: []; jobs: SearchJobRow[] }>({
    instances: [],
    databases: [],
    jobs: [],
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [instances, jobs] = await Promise.all([
          api.instances().catch(() => []),
          api.jobsRecent().catch(() => []),
        ]);

        if (!cancelled) {
          setSearchData({
            instances: Array.isArray(instances) ? instances : [],
            databases: [],
            jobs: Array.isArray(jobs) ? jobs : [],
          });
        }
      } catch {
        if (!cancelled) {
          setSearchData({ instances: [], databases: [], jobs: [] });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const shortcutLabel = useMemo(
    () => (navigator.platform.toUpperCase().includes('MAC') ? '⌘K' : 'Ctrl+K'),
    [],
  );

  const triggerSearch = () => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: isMac, ctrlKey: !isMac }));
  };

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  // Close drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Close drawer on Esc
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      <SearchDialog instances={searchData.instances} databases={searchData.databases} jobs={searchData.jobs} />

      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <InstanceTree onLogout={handleLogout} />
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              key="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
              aria-hidden="true"
            />
            <motion.div
              key="drawer-panel"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 z-50 flex md:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation"
            >
              <InstanceTree
                onLogout={handleLogout}
                onNavigate={() => setMobileNavOpen(false)}
                variant="drawer"
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="glass-strong z-10 flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-3 md:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="-ml-1 rounded-lg p-2 text-gray-300 transition-all hover:bg-white/5 hover:text-white md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Breadcrumbs />
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <button
              onClick={triggerSearch}
              className="hidden items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-500 transition-all hover:bg-white/10 sm:flex"
            >
              <span>Search</span>
              <kbd className="rounded bg-white/10 px-1 py-0.5 text-[10px]">{shortcutLabel}</kbd>
            </button>
            <TimeRangePicker />
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 text-gray-400 transition-all hover:bg-white/5 hover:text-white"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500">
              {lastRefresh.toLocaleTimeString()}
            </div>
            <button
              onClick={refresh}
              className="rounded-lg p-2 text-gray-400 transition-all hover:bg-white/5 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 md:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Suspense fallback={<LoadingSpinner text="Loading page..." />}>
                {children}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  return <RoleGuard roles={['Admin']}>{children}</RoleGuard>;
}

export default function App() {
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const refresh = () => {
    setLastRefresh(new Date());
  };

  return (
    <RefreshContext.Provider value={{ lastRefresh, refresh }}>
      <Routes>
        <Route
          path="/login"
          element={
            <Suspense fallback={<LoadingSpinner text="Loading login..." />}>
              <LoginPage />
            </Suspense>
          }
        />
        <Route
          path="*"
          element={(
            <AuthGuard>
              <Layout>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/instances" element={<InstancesPage />} />
                  <Route path="/instances/:id" element={<InstanceDetailPage />} />
                  <Route path="/instances/:id/databases/:dbId" element={<DatabaseDetailPage />} />
                  <Route path="/instances/:id/backups" element={<BackupsPage />} />
                  <Route path="/instances/:id/drives" element={<DrivesPage />} />
                  <Route path="/instances/:id/corruption" element={<CorruptionPage />} />
                  <Route path="/instances/:id/configuration" element={<ConfigurationPage />} />
                  <Route path="/instances/:id/hadr" element={<AvailabilityGroupsPage />} />
                  <Route path="/instances/:id/jobs" element={<JobTimelinePage />} />
                  <Route path="/instances/:id/reports" element={<ReportsPage />} />
                  <Route path="/jobs" element={<JobsPage />} />
                  <Route path="/backups" element={<BackupsPage />} />
                  <Route path="/alerts" element={<AlertsPage />} />
                  <Route path="/drives" element={<DrivesPage />} />
                  <Route path="/corruption" element={<CorruptionPage />} />
                  <Route path="/availability-groups" element={<AvailabilityGroupsPage />} />
                  <Route path="/analysis" element={<AnalysisPage />} />
                  <Route path="/queries" element={<QueriesPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/estate/disks" element={<EstateDiskPage />} />
                  <Route path="/estate/backups" element={<EstateBackupsPage />} />
                  <Route path="/estate/availability-groups" element={<EstateAGsPage />} />
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
                  <Route path="/performance/query-store" element={<QueryStorePage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/reports/licenses" element={<LicenseOverviewPage />} />
                  <Route path="/reports/underutilized" element={<UnderutilizedPage />} />
                  <Route path="/reports/fleet-stats" element={<FleetStatsPage />} />
                  <Route path="/reports/backup-ampel" element={<BackupAmpelPage />} />
                  <Route path="/monitor" element={<SqlMonitorPage />} />
                  <Route path="/settings/alerts" element={<AdminRoute><AlertSettingsPage /></AdminRoute>} />
                  <Route path="/settings/servers" element={<AdminRoute><ConfigServersPage /></AdminRoute>} />
                  <Route path="/settings/groups" element={<AdminRoute><ConfigGroupsPage /></AdminRoute>} />
                  <Route path="/settings/users" element={<AdminRoute><ConfigUsersPage /></AdminRoute>} />
                  <Route path="/settings/retention" element={<AdminRoute><ConfigRetentionPage /></AdminRoute>} />
                  <Route path="/settings/thresholds" element={<AdminRoute><ThresholdsPage /></AdminRoute>} />
                </Routes>
              </Layout>
            </AuthGuard>
          )}
        />
      </Routes>
    </RefreshContext.Provider>
  );
}

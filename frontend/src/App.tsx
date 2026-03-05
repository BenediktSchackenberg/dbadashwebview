import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { isAuthenticated, clearToken, api } from './api/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, RefreshCw } from 'lucide-react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InstancesPage from './pages/InstancesPage';
import InstanceDetailPage from './pages/InstanceDetailPage';
import JobsPage from './pages/JobsPage';
import BackupsPage from './pages/BackupsPage';
import AlertsPage from './pages/AlertsPage';
import DrivesPage from './pages/DrivesPage';
import AvailabilityGroupsPage from './pages/AvailabilityGroupsPage';
import DatabaseDetailPage from './pages/DatabaseDetailPage';
import AnalysisPage from './pages/AnalysisPage';
import QueriesPage from './pages/QueriesPage';
import ReportsPage from './pages/ReportsPage';
import EstateDiskPage from './pages/EstateDiskPage';
import EstateBackupsPage from './pages/EstateBackupsPage';
import EstateAGsPage from './pages/EstateAGsPage';
import AlertSettingsPage from './pages/AlertSettingsPage';
import ConfigServersPage from './pages/ConfigServersPage';
import ConfigGroupsPage from './pages/ConfigGroupsPage';
import ConfigUsersPage from './pages/ConfigUsersPage';
import ConfigRetentionPage from './pages/ConfigRetentionPage';
import RunningQueriesPage from './pages/RunningQueriesPage';
import BlockingPage from './pages/BlockingPage';
import SlowQueriesPage from './pages/SlowQueriesPage';
import MemoryPage from './pages/MemoryPage';
import IOPerformancePage from './pages/IOPerformancePage';
import ExecStatsPage from './pages/ExecStatsPage';
import WaitsTimelinePage from './pages/WaitsTimelinePage';
import PerformanceCountersPage from './pages/PerformanceCountersPage';
import JobTimelinePage from './pages/JobTimelinePage';
import ConfigurationPage from './pages/ConfigurationPage';
import PatchingPage from './pages/PatchingPage';
import SchemaChangesPage from './pages/SchemaChangesPage';
import QueryStorePage from './pages/QueryStorePage';
import IdentityColumnsPage from './pages/IdentityColumnsPage';
import TempDBPage from './pages/TempDBPage';
import DBSpacePage from './pages/DBSpacePage';
import AboutPage from './pages/AboutPage';
import ThresholdsPage from './pages/ThresholdsPage';
import SearchDialog from './components/SearchDialog';
import Breadcrumbs from './components/Breadcrumbs';
import TimeRangePicker from './components/TimeRangePicker';
import InstanceTree from './components/InstanceTree';

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
  const { lastRefresh, refresh } = useRefresh();
  const { dark, toggle: toggleTheme } = useTheme();
  const [searchData, setSearchData] = useState<{ instances: any[]; databases: any[]; jobs: any[] }>({
    instances: [], databases: [], jobs: [],
  });

  useEffect(() => {
    (async () => {
      try {
        const [instances, jobs] = await Promise.all([
          api.instances().catch(() => []),
          api.jobsRecent().catch(() => []),
        ]);
        setSearchData({
          instances: Array.isArray(instances) ? instances : [],
          databases: [],
          jobs: Array.isArray(jobs) ? jobs : [],
        });
      } catch {}
    })();
  }, []);

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <SearchDialog instances={searchData.instances} databases={searchData.databases} jobs={searchData.jobs} />

      {/* Instance Tree Sidebar */}
      <InstanceTree onLogout={handleLogout} />

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 glass-strong border-b border-white/10 flex items-center justify-between px-6 shrink-0 z-10">
          <Breadcrumbs />
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-gray-500 bg-white/5 hover:bg-white/10 transition-all"
            >
              <span>Search</span>
              <kbd className="text-[10px] px-1 py-0.5 rounded bg-white/10">⌘K</kbd>
            </button>
            <TimeRangePicker />
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {lastRefresh.toLocaleTimeString()}
            </div>
            <button
              onClick={refresh}
              className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const refresh = useCallback(() => {
    setRefreshKey(k => k + 1);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, 60000);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <RefreshContext.Provider value={{ lastRefresh, refresh }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={
          <AuthGuard>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage key={refreshKey} />} />
                <Route path="/instances" element={<InstancesPage key={refreshKey} />} />
                <Route path="/instances/:id" element={<InstanceDetailPage key={refreshKey} />} />
                <Route path="/instances/:id/databases/:dbId" element={<DatabaseDetailPage key={refreshKey} />} />
                <Route path="/instances/:id/backups" element={<BackupsPage key={refreshKey} />} />
                <Route path="/instances/:id/drives" element={<DrivesPage key={refreshKey} />} />
                <Route path="/jobs" element={<JobsPage key={refreshKey} />} />
                <Route path="/backups" element={<BackupsPage key={refreshKey} />} />
                <Route path="/alerts" element={<AlertsPage key={refreshKey} />} />
                <Route path="/drives" element={<DrivesPage key={refreshKey} />} />
                <Route path="/availability-groups" element={<AvailabilityGroupsPage key={refreshKey} />} />
                <Route path="/analysis" element={<AnalysisPage key={refreshKey} />} />
                <Route path="/queries" element={<QueriesPage key={refreshKey} />} />
                <Route path="/reports" element={<ReportsPage key={refreshKey} />} />
                <Route path="/estate/disks" element={<EstateDiskPage key={refreshKey} />} />
                <Route path="/estate/backups" element={<EstateBackupsPage key={refreshKey} />} />
                <Route path="/estate/availability-groups" element={<EstateAGsPage key={refreshKey} />} />
                <Route path="/settings/alerts" element={<AlertSettingsPage key={refreshKey} />} />
                <Route path="/settings/servers" element={<ConfigServersPage key={refreshKey} />} />
                <Route path="/settings/groups" element={<ConfigGroupsPage key={refreshKey} />} />
                <Route path="/settings/users" element={<ConfigUsersPage key={refreshKey} />} />
                <Route path="/settings/retention" element={<ConfigRetentionPage key={refreshKey} />} />
                <Route path="/performance/running-queries" element={<RunningQueriesPage key={refreshKey} />} />
                <Route path="/performance/blocking" element={<BlockingPage key={refreshKey} />} />
                <Route path="/performance/slow-queries" element={<SlowQueriesPage key={refreshKey} />} />
                <Route path="/performance/memory" element={<MemoryPage key={refreshKey} />} />
                <Route path="/performance/io" element={<IOPerformancePage key={refreshKey} />} />
                <Route path="/performance/exec-stats" element={<ExecStatsPage key={refreshKey} />} />
                <Route path="/performance/waits-timeline" element={<WaitsTimelinePage key={refreshKey} />} />
                <Route path="/performance/counters" element={<PerformanceCountersPage key={refreshKey} />} />
                <Route path="/monitoring/job-timeline" element={<JobTimelinePage key={refreshKey} />} />
                <Route path="/monitoring/configuration" element={<ConfigurationPage key={refreshKey} />} />
                <Route path="/monitoring/patching" element={<PatchingPage key={refreshKey} />} />
                <Route path="/monitoring/schema-changes" element={<SchemaChangesPage key={refreshKey} />} />
                <Route path="/monitoring/identity-columns" element={<IdentityColumnsPage key={refreshKey} />} />
                <Route path="/monitoring/tempdb" element={<TempDBPage key={refreshKey} />} />
                <Route path="/monitoring/db-space" element={<DBSpacePage key={refreshKey} />} />
                <Route path="/performance/query-store" element={<QueryStorePage key={refreshKey} />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/settings/thresholds" element={<ThresholdsPage key={refreshKey} />} />
              </Routes>
            </Layout>
          </AuthGuard>
        } />
      </Routes>
    </RefreshContext.Provider>
  );
}

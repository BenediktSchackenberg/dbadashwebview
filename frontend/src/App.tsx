import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { isAuthenticated, clearToken, api } from './api/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Server, Database, Bell, HardDrive, Network, AlertTriangle,
  ChevronLeft, ChevronRight, ChevronDown, LogOut, User, RefreshCw, Sun, Moon,
  Activity, Search, FileText, Users, Tag, Clock, Shield, Zap, Gauge, CalendarClock, Settings,
  Key, Thermometer, GitBranch, Info
} from 'lucide-react';
import { clsx } from 'clsx';
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
import SearchDialog from './components/SearchDialog';
import Breadcrumbs from './components/Breadcrumbs';
import TimeRangePicker from './components/TimeRangePicker';

const RefreshContext = createContext<{ lastRefresh: Date; refresh: () => void }>({
  lastRefresh: new Date(),
  refresh: () => {},
});

export function useRefresh() {
  return useContext(RefreshContext);
}

interface NavGroup {
  label: string;
  items: { path: string; icon: any; label: string }[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Overviews',
    items: [
      { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { path: '/instances', icon: Server, label: 'Instances' },
      { path: '/availability-groups', icon: Network, label: 'Availability Groups' },
    ],
  },
  {
    label: 'Performance',
    items: [
      { path: '/performance/running-queries', icon: Activity, label: 'Running Queries' },
      { path: '/performance/blocking', icon: AlertTriangle, label: 'Blocking' },
      { path: '/performance/slow-queries', icon: Clock, label: 'Slow Queries' },
      { path: '/performance/memory', icon: HardDrive, label: 'Memory' },
      { path: '/performance/io', icon: HardDrive, label: 'IO Performance' },
      { path: '/performance/exec-stats', icon: Zap, label: 'Object Exec Stats' },
      { path: '/performance/waits-timeline', icon: Clock, label: 'Waits Timeline' },
      { path: '/performance/counters', icon: Gauge, label: 'Perf Counters' },
      { path: '/performance/query-store', icon: Search, label: 'Query Store' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { path: '/alerts', icon: Bell, label: 'Alerts' },
      { path: '/analysis', icon: Activity, label: 'Analysis' },
      { path: '/queries', icon: Search, label: 'Queries' },
      { path: '/monitoring/job-timeline', icon: CalendarClock, label: 'Job Timeline' },
      { path: '/monitoring/configuration', icon: Settings, label: 'Configuration' },
      { path: '/monitoring/patching', icon: Shield, label: 'SQL Patching' },
      { path: '/monitoring/schema-changes', icon: GitBranch, label: 'Schema Changes' },
      { path: '/monitoring/identity-columns', icon: Key, label: 'Identity Columns' },
      { path: '/monitoring/tempdb', icon: Thermometer, label: 'TempDB' },
      { path: '/monitoring/db-space', icon: Database, label: 'DB Space' },
    ],
  },
  {
    label: 'Estate',
    items: [
      { path: '/estate/disks', icon: HardDrive, label: 'Disk Usage' },
      { path: '/estate/backups', icon: Database, label: 'Backups' },
      { path: '/estate/availability-groups', icon: Network, label: 'AGs Estate' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { path: '/reports', icon: FileText, label: 'Reports' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { path: '/settings/servers', icon: Server, label: 'Servers' },
      { path: '/settings/groups', icon: Tag, label: 'Groups & Tags' },
      { path: '/settings/users', icon: Users, label: 'Users & RBAC' },
      { path: '/settings/retention', icon: Clock, label: 'Data Retention' },
      { path: '/settings/alerts', icon: Shield, label: 'Alert Config' },
    ],
  },
  {
    label: 'About',
    items: [
      { path: '/about', icon: Info, label: 'About DBA Dash' },
    ],
  },
];

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
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navGroups.forEach(g => { initial[g.label] = true; });
    return initial;
  });
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

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <SearchDialog instances={searchData.instances} databases={searchData.databases} jobs={searchData.jobs} />

      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 256 }}
        transition={{ duration: 0.2 }}
        className="glass-strong flex flex-col border-r border-white/10 shrink-0 z-20"
      >
        <div className="p-4 flex items-center gap-3 border-b border-white/10">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-bold text-white whitespace-nowrap">
              DBA Dash
            </motion.span>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navGroups.map(group => (
            <div key={group.label}>
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex items-center justify-between w-full px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors"
                >
                  <span>{group.label}</span>
                  {expandedGroups[group.label] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              )}
              {(collapsed || expandedGroups[group.label]) && group.items.map(item => {
                const active = location.pathname === item.path ||
                  (item.path !== '/' && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                      active ? 'bg-blue-500/15 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all w-full"
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            {!collapsed && <span>Collapse</span>}
          </button>
          {!collapsed && (
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center">
                <User className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-sm text-gray-300">admin</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-400/5 transition-all w-full"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </motion.aside>

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
              </Routes>
            </Layout>
          </AuthGuard>
        } />
      </Routes>
    </RefreshContext.Provider>
  );
}

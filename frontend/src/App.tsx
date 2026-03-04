import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { isAuthenticated, clearToken } from './api/api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Server, Briefcase, Database, Bell, HardDrive, Network,
  ChevronLeft, ChevronRight, LogOut, User, RefreshCw, Clock
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

const RefreshContext = createContext<{ lastRefresh: Date; refresh: () => void }>({
  lastRefresh: new Date(),
  refresh: () => {},
});

export function useRefresh() {
  return useContext(RefreshContext);
}

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/instances', icon: Server, label: 'Instances' },
  { path: '/jobs', icon: Briefcase, label: 'Jobs' },
  { path: '/backups', icon: Database, label: 'Backups' },
  { path: '/alerts', icon: Bell, label: 'Alerts' },
  { path: '/drives', icon: HardDrive, label: 'Drives' },
  { path: '/availability-groups', icon: Network, label: 'AG' },
];

function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { lastRefresh, refresh } = useRefresh();

  const handleLogout = () => {
    clearToken();
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 240 }}
        transition={{ duration: 0.2 }}
        className="glass-strong flex flex-col border-r border-white/10 shrink-0 z-20"
      >
        {/* Logo */}
        <div className="p-4 flex items-center gap-3 border-b border-white/10">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-bold text-white whitespace-nowrap"
            >
              DBA Dash
            </motion.span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => {
            const active = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
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
        {/* Top Bar */}
        <header className="h-14 glass-strong border-b border-white/10 flex items-center justify-between px-6 shrink-0 z-10">
          <div className="text-sm text-gray-400">
            {navItems.find(n => location.pathname === n.path || (n.path !== '/' && location.pathname.startsWith(n.path)))?.label || 'Dashboard'}
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock className="w-3.5 h-3.5" />
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

        {/* Content */}
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

  // Auto-refresh every 60s
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
                <Route path="/jobs" element={<JobsPage key={refreshKey} />} />
                <Route path="/backups" element={<BackupsPage key={refreshKey} />} />
                <Route path="/alerts" element={<AlertsPage key={refreshKey} />} />
                <Route path="/drives" element={<DrivesPage key={refreshKey} />} />
                <Route path="/availability-groups" element={<AvailabilityGroupsPage key={refreshKey} />} />
              </Routes>
            </Layout>
          </AuthGuard>
        } />
      </Routes>
    </RefreshContext.Provider>
  );
}

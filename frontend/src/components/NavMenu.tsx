import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  Blocks,
  ChevronDown,
  ChevronRight,
  Database,
  Gauge,
  HardDrive,
  LayoutDashboard,
  LineChart,
  Monitor,
  Package,
  Play,
  Settings,
  Shield,
  ShieldAlert,
  Wrench,
  Info,
} from 'lucide-react';
import { hasRole } from '../auth/session';

type NavItem = {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
};

type NavGroup = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  items: NavItem[];
};

const STORAGE_KEY = 'sidebar-navmenu-expanded';

const navGroups: NavGroup[] = [
  {
    key: 'overview',
    label: 'Overview',
    icon: LayoutDashboard,
    items: [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'SQL Monitor', path: '/monitor', icon: Monitor },
      { label: 'Alerts', path: '/alerts', icon: Bell },
    ],
  },
  {
    key: 'performance',
    label: 'Performance',
    icon: Gauge,
    items: [
      { label: 'Running Queries', path: '/performance/running-queries', icon: Play },
      { label: 'Blocking', path: '/performance/blocking', icon: Shield },
      { label: 'Slow Queries', path: '/performance/slow-queries', icon: LineChart },
      { label: 'Memory', path: '/performance/memory', icon: Activity },
      { label: 'I/O Performance', path: '/performance/io', icon: HardDrive },
      { label: 'Exec Stats', path: '/performance/exec-stats', icon: BarChart3 },
      { label: 'Waits Timeline', path: '/performance/waits-timeline', icon: Activity },
      { label: 'Perf Counters', path: '/performance/counters', icon: Gauge },
      { label: 'Query Store', path: '/performance/query-store', icon: Database },
    ],
  },
  {
    key: 'monitoring',
    label: 'Monitoring',
    icon: Activity,
    items: [
      { label: 'Job Timeline', path: '/monitoring/job-timeline', icon: Play },
      { label: 'Configuration', path: '/monitoring/configuration', icon: Settings },
      { label: 'Patching', path: '/monitoring/patching', icon: Wrench },
      { label: 'Schema Changes', path: '/monitoring/schema-changes', icon: Blocks },
      { label: 'Corruption', path: '/corruption', icon: ShieldAlert },
      { label: 'Identity Columns', path: '/monitoring/identity-columns', icon: Database },
      { label: 'TempDB', path: '/monitoring/tempdb', icon: Database },
      { label: 'DB Space', path: '/monitoring/db-space', icon: HardDrive },
    ],
  },
  {
    key: 'storage',
    label: 'Storage',
    icon: HardDrive,
    items: [
      { label: 'Drives', path: '/drives', icon: HardDrive },
      { label: 'Estate Disks', path: '/estate/disks', icon: HardDrive },
      { label: 'Estate Backups', path: '/estate/backups', icon: Database },
    ],
  },
  {
    key: 'jobs-backups',
    label: 'Jobs & Backups',
    icon: Package,
    items: [
      { label: 'Jobs', path: '/jobs', icon: Play },
      { label: 'Backups', path: '/backups', icon: Database },
      { label: 'Backup Status', path: '/reports/backup-ampel', icon: Shield },
    ],
  },
  {
    key: 'availability',
    label: 'Availability',
    icon: Shield,
    items: [
      { label: 'AlwaysOn Overview', path: '/availability-groups', icon: Shield },
      { label: 'Estate AGs', path: '/estate/availability-groups', icon: Database },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: BarChart3,
    items: [
      { label: 'Analysis', path: '/analysis', icon: BarChart3 },
      { label: 'Queries', path: '/queries', icon: LineChart },
      { label: 'Reports', path: '/reports', icon: BarChart3 },
      { label: 'Licenses', path: '/reports/licenses', icon: Database },
      { label: 'Underutilized', path: '/reports/underutilized', icon: Activity },
      { label: 'Fleet Stats', path: '/reports/fleet-stats', icon: Gauge },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: Settings,
    adminOnly: true,
    items: [
      { label: 'Alert Settings', path: '/settings/alerts', icon: Bell },
      { label: 'Servers', path: '/settings/servers', icon: Database },
      { label: 'Groups', path: '/settings/groups', icon: Blocks },
      { label: 'Users', path: '/settings/users', icon: Shield },
      { label: 'Retention', path: '/settings/retention', icon: Package },
      { label: 'Thresholds', path: '/settings/thresholds', icon: Gauge },
    ],
  },
  {
    key: 'about',
    label: 'About',
    icon: Info,
    items: [{ label: 'About', path: '/about', icon: Info }],
  },
];

function isPathActive(currentPath: string, targetPath: string) {
  if (targetPath === '/') return currentPath === '/';
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export default function NavMenu({ onNavigate }: { onNavigate?: () => void } = {}) {
  const location = useLocation();
  const isAdmin = hasRole(['Admin']);

  const visibleGroups = useMemo(
    () => navGroups.filter((group) => !group.adminOnly || isAdmin),
    [isAdmin]
  );

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch {
      // ignore localStorage parse problems
    }

    return Object.fromEntries(visibleGroups.map((group) => [group.key, group.key === 'overview']));
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expandedGroups));
  }, [expandedGroups]);

  useEffect(() => {
    const activeGroup = visibleGroups.find((group) =>
      group.items.some((item) => isPathActive(location.pathname, item.path))
    );

    if (activeGroup && !expandedGroups[activeGroup.key]) {
      setExpandedGroups((prev) => ({ ...prev, [activeGroup.key]: true }));
    }
  }, [location.pathname, visibleGroups, expandedGroups]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="px-3 py-2 border-b border-white/10">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-0 py-2">Navigation</div>
      <div className="space-y-1">
        {visibleGroups.map((group) => {
          const expanded = expandedGroups[group.key] ?? false;
          const groupHasActiveItem = group.items.some((item) => isPathActive(location.pathname, item.path));

          return (
            <div key={group.key} className="rounded-md bg-slate-900/40">
              <button
                onClick={() => toggleGroup(group.key)}
                className={`flex items-center gap-2 w-full py-1.5 px-2 rounded text-left text-sm transition-colors ${
                  groupHasActiveItem
                    ? 'text-blue-300 bg-blue-500/10'
                    : 'text-gray-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {expanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                )}
                <group.icon className={`w-3.5 h-3.5 ${groupHasActiveItem ? 'text-blue-400' : 'text-gray-500'}`} />
                <span className="font-medium">{group.label}</span>
              </button>

              {expanded && (
                <div className="pl-6 pr-1 pb-1">
                  {group.items.map((item) => {
                    const active = isPathActive(location.pathname, item.path);
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={onNavigate}
                        className={`flex items-center gap-2 py-1 px-2 rounded text-sm transition-all border-l-2 ${
                          active
                            ? 'bg-blue-500/15 text-blue-400 border-blue-400'
                            : 'text-gray-400 hover:text-white hover:bg-white/5 border-transparent'
                        }`}
                      >
                        <item.icon className={`w-3.5 h-3.5 ${active ? 'text-blue-400' : 'text-gray-500'}`} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

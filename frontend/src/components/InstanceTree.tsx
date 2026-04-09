import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { clsx } from 'clsx';
import {
  Database, ChevronRight, LayoutDashboard, Bell, HardDrive, Network,
  Settings, ClipboardCheck, Shield, Play, BarChart3, Search, LogOut, User, Folder, Server,
  FileSpreadsheet, TrendingDown, Activity, Monitor, Layers, Cpu, Ship, Copy, CalendarClock,
  ShieldAlert, LineChart, Clock, Wrench, LayoutList,
} from 'lucide-react';
import { api } from '../api/api';
import { usePresentationOptional } from '../context/PresentationContext';

interface TreeDatabase {
  databaseId: number;
  name: string;
  isSystem: boolean;
}

interface TreeInstance {
  instanceId: number;
  instanceName: string;
  productVersion: string | null;
  productMajorVersion: number | null;
  databases: TreeDatabase[];
}

const versionMap: Record<number, string> = {
  17: 'SQL Server 2025', 16: 'SQL Server 2022', 15: 'SQL Server 2019',
  14: 'SQL Server 2017', 13: 'SQL Server 2016', 12: 'SQL Server 2014',
  11: 'SQL Server 2012', 10: 'SQL Server 2008',
};

const globalViews = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/windows-screens', icon: LayoutList, label: 'WinForms map' },
  { path: '/windows-parity', icon: Layers, label: 'Windows parity' },
  { path: '/monitor', icon: Monitor, label: 'SQL Monitor' },
  { path: '/alerts', icon: Bell, label: 'Alerts' },
  { path: '/estate/backups', icon: Database, label: 'Backups' },
  { path: '/drives', icon: HardDrive, label: 'Drives' },
  { path: '/availability-groups', icon: Network, label: 'AlwaysOn Overview' },
];

const performanceViews = [
  { path: '/performance/cpu', icon: Cpu, label: 'CPU' },
  { path: '/performance/running-queries', icon: Activity, label: 'Running queries' },
  { path: '/performance/blocking', icon: ShieldAlert, label: 'Blocking' },
  { path: '/performance/slow-queries', icon: Clock, label: 'Slow queries' },
  { path: '/performance/memory', icon: Activity, label: 'Memory' },
  { path: '/performance/io', icon: HardDrive, label: 'I/O' },
  { path: '/performance/exec-stats', icon: BarChart3, label: 'Exec stats' },
  { path: '/performance/waits-timeline', icon: Activity, label: 'Waits' },
  { path: '/performance/counters', icon: Activity, label: 'Counters' },
  { path: '/performance/query-store', icon: Database, label: 'Query Store' },
];

const monitoringViews = [
  { path: '/monitoring/job-timeline', icon: Play, label: 'Job timeline' },
  { path: '/monitoring/configuration', icon: Settings, label: 'Configuration' },
  { path: '/monitoring/patching', icon: Server, label: 'Patching' },
  { path: '/monitoring/schema-changes', icon: ClipboardCheck, label: 'Schema changes' },
  { path: '/monitoring/identity-columns', icon: Database, label: 'Identity columns' },
  { path: '/monitoring/tempdb', icon: Database, label: 'TempDB' },
  { path: '/monitoring/db-space', icon: HardDrive, label: 'DB space' },
  { path: '/monitoring/log-shipping', icon: Ship, label: 'Log shipping' },
  { path: '/monitoring/database-mirroring', icon: Copy, label: 'DB mirroring' },
  { path: '/monitoring/collection-health', icon: CalendarClock, label: 'Collection health' },
  { path: '/monitoring/corruption-checkdb', icon: ShieldAlert, label: 'Corruption / CHECKDB' },
  { path: '/monitoring/drive-history', icon: LineChart, label: 'Drive history' },
];

const estateExtraViews = [
  { path: '/estate/disks', icon: HardDrive, label: 'Estate disks' },
  { path: '/estate/log-shipping', icon: Ship, label: 'Estate log shipping' },
  { path: '/estate/database-mirroring', icon: Copy, label: 'Estate mirroring' },
];

const instanceCategories = [
  { key: 'configuration', icon: Settings, label: 'Configuration', path: (id: number) => `/instances/${id}/configuration` },
  { key: 'checks', icon: ClipboardCheck, label: 'Checks', path: (id: number) => `/instances/${id}` },
  { key: 'hadr', icon: Shield, label: 'HA/DR', path: (id: number) => `/instances/${id}/hadr` },
  { key: 'storage', icon: HardDrive, label: 'Storage', path: (id: number) => `/instances/${id}/drives` },
  { key: 'databases', icon: Database, label: 'Databases', path: (_id: number) => '' },
  { key: 'backups', icon: Database, label: 'Backups', path: (id: number) => `/instances/${id}/backups` },
  { key: 'jobs', icon: Play, label: 'Jobs', path: (id: number) => `/instances/${id}/jobs` },
  { key: 'reports', icon: BarChart3, label: 'Reports', path: (id: number) => `/instances/${id}/reports` },
];

export default function InstanceTree({ onLogout }: { onLogout: () => void }) {
  const [instances, setInstances] = useState<TreeInstance[]>([]);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem('tree-versions');
      return stored ? new Set(JSON.parse(stored)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [expandedInstances, setExpandedInstances] = useState<Set<number>>(() => {
    try {
      const stored = sessionStorage.getItem('tree-expanded');
      return stored ? new Set(JSON.parse(stored)) : new Set<number>();
    } catch { return new Set<number>(); }
  });
  const [expandedDbs, setExpandedDbs] = useState<Set<number>>(new Set());
  const [expandedSysDb, setExpandedSysDb] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');
  const location = useLocation();
  const { isDesktopData } = usePresentationOptional();
  const reduceMotion = useReducedMotion();
  const navMicro = !isDesktopData && !reduceMotion;

  const sectionTitleClass = clsx(
    'text-xs font-semibold uppercase tracking-wider px-0 py-2',
    isDesktopData ? 'text-gray-600' : 'text-gray-500',
  );

  const navItemClass = (active: boolean) =>
    clsx(
      'flex items-center gap-2.5 py-1.5 px-2 rounded text-sm transition-all duration-200 ease-out border-l-2',
      navMicro && 'hover:translate-x-1 active:scale-[0.99]',
      isDesktopData
        ? active
          ? 'bg-[#d0e8ff] text-[#0c3762] border-[#0078d4]'
          : 'text-gray-800 border-transparent hover:bg-black/[0.06]'
        : active
          ? 'border-blue-400 bg-gradient-to-r from-blue-500/20 to-cyan-500/10 text-blue-300 shadow-[0_0_20px_-8px_rgba(56,189,248,0.45)]'
          : 'border-transparent text-gray-400 hover:bg-white/[0.06] hover:text-white',
    );

  const navIconClass = (active: boolean) =>
    clsx(
      'w-4 h-4',
      isDesktopData ? (active ? 'text-[#0078d4]' : 'text-gray-600') : active ? 'text-blue-400' : 'text-gray-500',
    );

  useEffect(() => {
    api.tree().then((data: any) => {
      setInstances(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    sessionStorage.setItem('tree-expanded', JSON.stringify([...expandedInstances]));
  }, [expandedInstances]);

  useEffect(() => {
    sessionStorage.setItem('tree-versions', JSON.stringify([...expandedVersions]));
  }, [expandedVersions]);

  const filtered = useMemo(() => {
    if (!search.trim()) return instances;
    const q = search.toLowerCase();
    return instances.filter(i => i.instanceName.toLowerCase().includes(q));
  }, [instances, search]);

  // Group by SQL Server version
  const versionGroups = useMemo(() => {
    const groups = new Map<string, TreeInstance[]>();
    filtered.forEach(inst => {
      const major = inst.productMajorVersion || 0;
      const label = versionMap[major] || `SQL Server (v${major || '?'})`;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(inst);
    });
    // Sort by version descending
    return [...groups.entries()].sort((a, b) => {
      const va = filtered.find(i => (versionMap[i.productMajorVersion || 0] || '') === a[0])?.productMajorVersion || 0;
      const vb = filtered.find(i => (versionMap[i.productMajorVersion || 0] || '') === b[0])?.productMajorVersion || 0;
      return vb - va;
    });
  }, [filtered]);

  // Auto-expand versions when searching
  const effectiveVersions = useMemo(() => {
    if (search.trim()) return new Set(versionGroups.map(([label]) => label));
    return expandedVersions;
  }, [search, versionGroups, expandedVersions]);

  const effectiveInstances = useMemo(() => {
    if (search.trim()) return new Set(filtered.map(i => i.instanceId));
    return expandedInstances;
  }, [search, filtered, expandedInstances]);

  const toggle = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, key: T) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isActive = (path: string) => {
    const [base, qs] = path.split('?');
    if (location.pathname === base || (base !== '/' && location.pathname.startsWith(base))) {
      if (qs) return location.search.includes(qs);
      return true;
    }
    return false;
  };

  return (
    <motion.div
      className={clsx(
        'flex h-full w-72 shrink-0 flex-col relative z-10',
        isDesktopData
          ? 'dba-sidebar-desktop border-r border-[#ababab] bg-[#ececec] text-[#1e1e1e]'
          : 'border-r border-white/[0.08] bg-slate-950/80 text-slate-100 shadow-[6px_0_40px_-18px_rgba(0,0,0,0.65)] backdrop-blur-2xl',
      )}
      initial={isDesktopData || reduceMotion ? false : { x: -36, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={
        isDesktopData || reduceMotion
          ? { duration: 0 }
          : { type: 'spring', stiffness: 260, damping: 32, mass: 0.9 }
      }
    >
      {/* Header */}
      <div
        className={clsx(
          'flex items-center gap-3 border-b p-4',
          isDesktopData ? 'border-[#ababab] bg-[#f5f5f5]' : 'border-white/[0.06] bg-white/[0.03]',
        )}
      >
        <motion.div
          className={clsx(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded',
            isDesktopData ? 'bg-[#0078d4]' : 'rounded-lg bg-gradient-to-br from-sky-500 via-blue-600 to-violet-600 shadow-lg shadow-blue-500/25',
          )}
          whileHover={navMicro ? { scale: 1.08, rotate: 4 } : undefined}
          whileTap={navMicro ? { scale: 0.94 } : undefined}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        >
          <Database className={clsx('w-4 h-4', isDesktopData ? 'text-white' : 'text-white')} />
        </motion.div>
        <span className={clsx('font-bold text-sm whitespace-nowrap', isDesktopData ? 'text-black' : 'text-white')}>
          DBA Dash WebView
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: isDesktopData ? '#b0b0b0 #ececec' : '#475569 transparent',
        }}
      >
        {/* Global Views */}
        <div className="px-3 py-2">
          <div className={sectionTitleClass}>Global Views</div>
          {globalViews.map(item => (
            <Link key={item.path} to={item.path} className={navItemClass(isActive(item.path))}>
              <item.icon className={navIconClass(isActive(item.path))} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Performance */}
        <div className="px-3 py-2">
          <div className={sectionTitleClass}>Performance</div>
          {performanceViews.map(item => (
            <Link key={item.path} to={item.path} className={navItemClass(isActive(item.path))}>
              <item.icon className={navIconClass(isActive(item.path))} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Monitoring */}
        <div className="px-3 py-2">
          <div className={sectionTitleClass}>Monitoring</div>
          {monitoringViews.map(item => (
            <Link key={item.path} to={item.path} className={navItemClass(isActive(item.path))}>
              <item.icon className={navIconClass(isActive(item.path))} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Estate */}
        <div className="px-3 py-2">
          <div className={sectionTitleClass}>Estate</div>
          {estateExtraViews.map(item => (
            <Link key={item.path} to={item.path} className={navItemClass(isActive(item.path))}>
              <item.icon className={navIconClass(isActive(item.path))} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* Tools (Windows Community Tools + UserReport catalog) */}
        <div className="px-3 py-2">
          <div className={sectionTitleClass}>Tools &amp; reports</div>
          <Link to="/tools/community" className={navItemClass(isActive('/tools/community'))}>
            <Wrench className={navIconClass(isActive('/tools/community'))} />
            <span>Community tools</span>
          </Link>
          <Link to="/tools/custom-reports" className={navItemClass(isActive('/tools/custom-reports'))}>
            <FileSpreadsheet className={navIconClass(isActive('/tools/custom-reports'))} />
            <span>Custom reports</span>
          </Link>
        </div>

        {/* Reporting */}
        <div className="px-3 py-2">
          <div className={sectionTitleClass}>Reporting</div>
          {[
            { path: '/reports/licenses', icon: FileSpreadsheet, label: 'License Overview' },
            { path: '/reports/underutilized', icon: TrendingDown, label: 'Underutilized Servers' },
            { path: '/reports/fleet-stats', icon: Activity, label: 'Fleet Statistics' },
            { path: '/reports/backup-ampel', icon: Shield, label: 'Backup Ampel Report' },
          ].map(item => (
            <Link key={item.path} to={item.path} className={navItemClass(isActive(item.path))}>
              <item.icon className={navIconClass(isActive(item.path))} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* SQL Servers grouped by version */}
        <div className="px-3 py-2">
          <div className={clsx(sectionTitleClass, 'py-2')}>SQL Servers ({filtered.length})</div>
          <div className="mb-2 relative">
            <Search
              className={clsx(
                'absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5',
                isDesktopData ? 'text-gray-500' : 'text-gray-500',
              )}
            />
            <input
              type="text"
              placeholder="Filter instances..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={clsx(
                'w-full rounded text-sm px-3 py-1.5 pl-8 focus:outline-none',
                isDesktopData
                  ? 'bg-white border border-[#7a7a7a] text-black placeholder-gray-500 focus:border-[#0078d4]'
                  : 'bg-slate-800 border border-slate-700 text-gray-200 placeholder-gray-500 focus:border-blue-500/50',
              )}
            />
          </div>

          {versionGroups.map(([versionLabel, insts]) => {
            const vExpanded = effectiveVersions.has(versionLabel);
            return (
              <div key={versionLabel} className="mb-1">
                {/* Version group header */}
                <button
                  onClick={() => toggle(setExpandedVersions, versionLabel)}
                  className={clsx(
                    'flex items-center gap-1.5 w-full py-1.5 px-2 rounded text-left transition-colors',
                    isDesktopData ? 'hover:bg-black/[0.06]' : 'hover:bg-white/5',
                  )}
                >
                  <ChevronRight
                    className={clsx(
                      'w-3.5 h-3.5 shrink-0 transition-transform duration-200 ease-out',
                      vExpanded && 'rotate-90',
                      isDesktopData ? 'text-gray-600' : 'text-gray-400',
                    )}
                  />
                  <Server className={clsx('w-4 h-4 shrink-0', isDesktopData ? 'text-[#0078d4]' : 'text-blue-400')} />
                  <span className={clsx('font-medium text-sm', isDesktopData ? 'text-gray-900' : 'text-gray-300')}>{versionLabel}</span>
                  <span
                    className={clsx(
                      'ml-auto text-[10px] px-1.5 py-0.5 rounded',
                      isDesktopData ? 'text-gray-700 bg-white border border-[#c0c0c0]' : 'text-gray-600 bg-slate-800',
                    )}
                  >
                    {insts.length}
                  </span>
                </button>

                {vExpanded && insts.map(inst => {
                  const iExpanded = effectiveInstances.has(inst.instanceId);
                  const systemDbs = inst.databases?.filter(d => d.isSystem) || [];
                  const userDbs = inst.databases?.filter(d => !d.isSystem) || [];
                  const dbsExpanded = expandedDbs.has(inst.instanceId);
                  const sysExpanded = expandedSysDb.has(inst.instanceId);

                  return (
                    <div key={inst.instanceId} className="ml-3">
                      {/* Instance row */}
                      <button
                        onClick={() => toggle(setExpandedInstances, inst.instanceId)}
                        className={clsx(
                          'flex items-center gap-1.5 w-full py-1 px-2 rounded text-left transition-colors',
                          isDesktopData ? 'hover:bg-black/[0.06]' : 'hover:bg-white/5',
                        )}
                      >
                        <ChevronRight
                          className={clsx(
                            'w-3 h-3 shrink-0 transition-transform duration-200 ease-out',
                            iExpanded && 'rotate-90',
                            isDesktopData ? 'text-gray-600' : 'text-gray-500',
                          )}
                        />
                        <span className={clsx('text-sm truncate', isDesktopData ? 'text-gray-900' : 'text-gray-200')}>
                          {inst.instanceName}
                        </span>
                      </button>

                      {/* Categories under instance */}
                      {iExpanded && (
                        <div className="ml-3">
                          {instanceCategories.map(cat => {
                            if (cat.key === 'databases') {
                              return (
                                <div key="databases">
                                  <button
                                    onClick={() => toggle(setExpandedDbs, inst.instanceId)}
                                    className={clsx(
                                      'flex items-center gap-2 w-full py-1 pl-4 pr-2 rounded text-left text-sm transition-all',
                                      isDesktopData
                                        ? 'text-gray-800 hover:bg-black/[0.06]'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5',
                                    )}
                                  >
                                    <ChevronRight
                                      className={clsx(
                                        'w-3 h-3 shrink-0 transition-transform duration-200 ease-out',
                                        dbsExpanded && 'rotate-90',
                                        isDesktopData ? 'text-gray-600' : 'text-gray-500',
                                      )}
                                    />
                                    <cat.icon className={clsx('w-3.5 h-3.5', isDesktopData ? 'text-gray-600' : 'text-gray-500')} />
                                    <span>Databases</span>
                                    <span className={clsx('ml-auto text-[10px]', isDesktopData ? 'text-gray-600' : 'text-gray-600')}>
                                      {inst.databases?.length || 0}
                                    </span>
                                  </button>
                                  {dbsExpanded && (
                                    <div className="ml-4">
                                      {systemDbs.length > 0 && (
                                        <div>
                                          <button
                                            onClick={() => toggle(setExpandedSysDb, inst.instanceId)}
                                            className={clsx(
                                              'flex items-center gap-2 w-full py-0.5 pl-4 pr-2 rounded text-left text-xs',
                                              isDesktopData
                                                ? 'text-gray-700 hover:bg-black/[0.06]'
                                                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
                                            )}
                                          >
                                            <ChevronRight
                                              className={clsx(
                                                'w-3 h-3 shrink-0 transition-transform duration-200 ease-out',
                                                sysExpanded && 'rotate-90',
                                                isDesktopData ? 'text-gray-600' : 'text-gray-500',
                                              )}
                                            />
                                            <Folder className="w-3 h-3" />
                                            <span>System Databases</span>
                                          </button>
                                          {sysExpanded && systemDbs.map(db => (
                                            <Link
                                              key={db.databaseId}
                                              to={`/instances/${inst.instanceId}/databases/${db.databaseId}`}
                                              className={clsx(
                                                'flex items-center gap-2 py-0.5 pl-10 pr-2 rounded text-xs transition-all',
                                                isActive(`/instances/${inst.instanceId}/databases/${db.databaseId}`)
                                                  ? isDesktopData
                                                    ? 'bg-[#d0e8ff] text-[#0c3762]'
                                                    : 'bg-blue-500/15 text-blue-400'
                                                  : isDesktopData
                                                    ? 'text-gray-700 hover:bg-black/[0.06]'
                                                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
                                              )}
                                            >
                                              <Database className="w-3 h-3" />
                                              <span className="truncate">{db.name}</span>
                                            </Link>
                                          ))}
                                        </div>
                                      )}
                                      {userDbs.map(db => (
                                        <Link
                                          key={db.databaseId}
                                          to={`/instances/${inst.instanceId}/databases/${db.databaseId}`}
                                          className={clsx(
                                            'flex items-center gap-2 py-0.5 pl-4 pr-2 rounded text-xs transition-all',
                                            isActive(`/instances/${inst.instanceId}/databases/${db.databaseId}`)
                                              ? isDesktopData
                                                ? 'bg-[#d0e8ff] text-[#0c3762]'
                                                : 'bg-blue-500/15 text-blue-400'
                                              : isDesktopData
                                                ? 'text-gray-700 hover:bg-black/[0.06]'
                                                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5',
                                          )}
                                        >
                                          <Database className="w-3 h-3" />
                                          <span className="truncate">{db.name}</span>
                                        </Link>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            const path = cat.path(inst.instanceId);
                            return (
                              <Link key={cat.key} to={path} className={clsx(navItemClass(isActive(path)), 'py-1 pl-4')}>
                                <cat.icon className={clsx('w-3.5 h-3.5', navIconClass(isActive(path)))} />
                                <span>{cat.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p className={clsx('text-xs text-center py-4', isDesktopData ? 'text-gray-600' : 'text-gray-500')}>
              No instances found
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div
        className={clsx(
          'p-3 border-t space-y-1',
          isDesktopData ? 'border-[#ababab] bg-[#e8e8e8]' : 'border-white/10',
        )}
      >
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div
            className={clsx(
              'w-6 h-6 rounded-full flex items-center justify-center',
              isDesktopData ? 'bg-[#0078d4]/15' : 'bg-blue-500/20',
            )}
          >
            <User className={clsx('w-3.5 h-3.5', isDesktopData ? 'text-[#0078d4]' : 'text-blue-400')} />
          </div>
          <span className={clsx('text-xs', isDesktopData ? 'text-gray-800' : 'text-gray-300')}>admin</span>
        </div>
        <button
          onClick={onLogout}
          className={clsx(
            'flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-all w-full',
            isDesktopData
              ? 'text-gray-700 hover:text-red-700 hover:bg-red-100'
              : 'text-gray-400 hover:text-red-400 hover:bg-red-400/5',
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </motion.div>
  );
}

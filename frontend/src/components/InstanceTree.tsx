import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Database, ChevronRight, ChevronDown, LayoutDashboard, Bell, HardDrive, Network,
  Settings, ClipboardCheck, Shield, Play, BarChart3, Search, LogOut, User, Folder, Server
} from 'lucide-react';
import { api } from '../api/api';

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
  { path: '/alerts', icon: Bell, label: 'Alerts' },
  { path: '/estate/backups', icon: Database, label: 'Backups' },
  { path: '/drives', icon: HardDrive, label: 'Drives' },
  { path: '/availability-groups', icon: Network, label: 'AG Overview' },
];

const instanceCategories = [
  { key: 'configuration', icon: Settings, label: 'Configuration', path: (id: number) => `/monitoring/configuration?instanceId=${id}` },
  { key: 'checks', icon: ClipboardCheck, label: 'Checks', path: (id: number) => `/instances/${id}` },
  { key: 'hadr', icon: Shield, label: 'HA/DR', path: (id: number) => `/availability-groups?instanceId=${id}` },
  { key: 'storage', icon: HardDrive, label: 'Storage', path: (id: number) => `/drives?instanceId=${id}` },
  { key: 'databases', icon: Database, label: 'Databases', path: (_id: number) => '' },
  { key: 'backups', icon: Database, label: 'Backups', path: (id: number) => `/instances/${id}/backups` },
  { key: 'drives', icon: HardDrive, label: 'Drives', path: (id: number) => `/instances/${id}/drives` },
  { key: 'jobs', icon: Play, label: 'Jobs', path: (id: number) => `/monitoring/job-timeline?instanceId=${id}` },
  { key: 'reports', icon: BarChart3, label: 'Reports', path: (id: number) => `/reports?instanceId=${id}` },
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
    <div className="w-72 bg-slate-900/95 border-r border-white/10 flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="p-4 flex items-center gap-3 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
          <Database className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white text-sm whitespace-nowrap">DBA Dash WebView</span>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 transparent' }}>
        {/* Global Views */}
        <div className="px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-0 py-2">Global Views</div>
          {globalViews.map(item => (
            <Link key={item.path} to={item.path}
              className={`flex items-center gap-2.5 py-1.5 px-2 rounded text-sm transition-all ${
                isActive(item.path)
                  ? 'bg-blue-500/15 text-blue-400 border-l-2 border-blue-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
              }`}>
              <item.icon className={`w-4 h-4 ${isActive(item.path) ? 'text-blue-400' : 'text-gray-500'}`} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* SQL Servers grouped by version */}
        <div className="px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 py-2">
            SQL Servers ({filtered.length})
          </div>
          <div className="mb-2 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input type="text" placeholder="Filter instances..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm px-3 py-1.5 pl-8 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50" />
          </div>

          {versionGroups.map(([versionLabel, insts]) => {
            const vExpanded = effectiveVersions.has(versionLabel);
            return (
              <div key={versionLabel} className="mb-1">
                {/* Version group header */}
                <button onClick={() => toggle(setExpandedVersions, versionLabel)}
                  className="flex items-center gap-1.5 w-full py-1.5 px-2 rounded text-left hover:bg-white/5 transition-colors">
                  {vExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                  <Server className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="font-medium text-gray-300 text-sm">{versionLabel}</span>
                  <span className="ml-auto text-[10px] text-gray-600 bg-slate-800 px-1.5 py-0.5 rounded">{insts.length}</span>
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
                      <button onClick={() => toggle(setExpandedInstances, inst.instanceId)}
                        className="flex items-center gap-1.5 w-full py-1 px-2 rounded text-left hover:bg-white/5 transition-colors">
                        {iExpanded
                          ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
                          : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />}
                        <span className="text-gray-200 text-sm truncate">{inst.instanceName}</span>
                      </button>

                      {/* Categories under instance */}
                      {iExpanded && (
                        <div className="ml-3">
                          {instanceCategories.map(cat => {
                            if (cat.key === 'databases') {
                              return (
                                <div key="databases">
                                  <button onClick={() => toggle(setExpandedDbs, inst.instanceId)}
                                    className="flex items-center gap-2 w-full py-1 pl-4 pr-2 rounded text-left text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all">
                                    {dbsExpanded
                                      ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
                                      : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />}
                                    <cat.icon className="w-3.5 h-3.5 text-gray-500" />
                                    <span>Databases</span>
                                    <span className="ml-auto text-[10px] text-gray-600">{inst.databases?.length || 0}</span>
                                  </button>
                                  {dbsExpanded && (
                                    <div className="ml-4">
                                      {systemDbs.length > 0 && (
                                        <div>
                                          <button onClick={() => toggle(setExpandedSysDb, inst.instanceId)}
                                            className="flex items-center gap-2 w-full py-0.5 pl-4 pr-2 rounded text-left text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5">
                                            {sysExpanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                                            <Folder className="w-3 h-3" />
                                            <span>System Databases</span>
                                          </button>
                                          {sysExpanded && systemDbs.map(db => (
                                            <Link key={db.databaseId} to={`/instances/${inst.instanceId}/databases/${db.databaseId}`}
                                              className={`flex items-center gap-2 py-0.5 pl-10 pr-2 rounded text-xs transition-all ${
                                                isActive(`/instances/${inst.instanceId}/databases/${db.databaseId}`)
                                                  ? 'bg-blue-500/15 text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                              }`}>
                                              <Database className="w-3 h-3" />
                                              <span className="truncate">{db.name}</span>
                                            </Link>
                                          ))}
                                        </div>
                                      )}
                                      {userDbs.map(db => (
                                        <Link key={db.databaseId} to={`/instances/${inst.instanceId}/databases/${db.databaseId}`}
                                          className={`flex items-center gap-2 py-0.5 pl-4 pr-2 rounded text-xs transition-all ${
                                            isActive(`/instances/${inst.instanceId}/databases/${db.databaseId}`)
                                              ? 'bg-blue-500/15 text-blue-400' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                          }`}>
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
                              <Link key={cat.key} to={path}
                                className={`flex items-center gap-2 py-1 pl-4 pr-2 rounded text-sm transition-all ${
                                  isActive(path)
                                    ? 'bg-blue-500/15 text-blue-400 border-l-2 border-blue-400'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
                                }`}>
                                <cat.icon className={`w-3.5 h-3.5 ${isActive(path) ? 'text-blue-400' : 'text-gray-500'}`} />
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
            <p className="text-xs text-gray-500 text-center py-4">No instances found</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 space-y-1">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <span className="text-xs text-gray-300">admin</span>
        </div>
        <button onClick={onLogout}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded text-xs text-gray-400 hover:text-red-400 hover:bg-red-400/5 transition-all w-full">
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

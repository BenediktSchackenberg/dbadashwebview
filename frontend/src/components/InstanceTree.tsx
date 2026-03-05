import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Database, ChevronRight, ChevronDown, LayoutDashboard, Bell, HardDrive, Network,
  Wrench, Settings, ClipboardCheck, Shield, Play, BarChart3, Search, LogOut, User, Folder
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
  databases: TreeDatabase[];
}

const globalViews = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/alerts', icon: Bell, label: 'Alerts' },
  { path: '/backups', icon: Database, label: 'Backups' },
  { path: '/drives', icon: HardDrive, label: 'Drives' },
  { path: '/availability-groups', icon: Network, label: 'AG Overview' },
];

const categories = [
  { key: 'overview', icon: Wrench, label: 'Settings', path: (id: number) => `/instances/${id}` },
  { key: 'configuration', icon: Settings, label: 'Configuration', path: (id: number) => `/instances/${id}` },
  { key: 'checks', icon: ClipboardCheck, label: 'Checks', path: (id: number) => `/instances/${id}` },
  { key: 'hadr', icon: Shield, label: 'HA/DR', path: (id: number) => `/instances/${id}` },
  { key: 'storage', icon: HardDrive, label: 'Storage', path: (id: number) => `/instances/${id}` },
  { key: 'databases', icon: Database, label: 'Databases', path: (_id: number) => '' },
  { key: 'jobs', icon: Play, label: 'Jobs', path: (id: number) => `/instances/${id}` },
  { key: 'reports', icon: BarChart3, label: 'Reports', path: (id: number) => `/instances/${id}` },
];

export default function InstanceTree({ onLogout }: { onLogout: () => void }) {
  const [instances, setInstances] = useState<TreeInstance[]>([]);
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

  const filtered = useMemo(() => {
    if (!search.trim()) return instances;
    const q = search.toLowerCase();
    return instances.filter(i => i.instanceName.toLowerCase().includes(q));
  }, [instances, search]);

  // Auto-expand when searching
  const effectiveExpanded = useMemo(() => {
    if (search.trim()) return new Set(filtered.map(i => i.instanceId));
    return expandedInstances;
  }, [search, filtered, expandedInstances]);

  const toggleInstance = (id: number) => {
    setExpandedInstances(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleDbs = (id: number) => {
    setExpandedDbs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSysDb = (id: number) => {
    setExpandedSysDb(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  return (
    <div className="w-72 bg-slate-900/95 border-r border-white/10 flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="p-4 flex items-center gap-3 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
          <Database className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-white text-sm whitespace-nowrap">DBA Dash WebView</span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 transparent' }}>
        {/* Global Views */}
        <div className="px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 px-0 py-2">Global Views</div>
          {globalViews.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 py-1.5 px-2 rounded text-sm transition-all ${
                isActive(item.path)
                  ? 'bg-blue-500/15 text-blue-400 border-l-2 border-blue-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
              }`}
            >
              <item.icon className={`w-4 h-4 ${isActive(item.path) ? 'text-blue-400' : 'text-gray-500'}`} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        {/* SQL Servers */}
        <div className="px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 py-2">
            SQL Servers ({filtered.length})
          </div>
          <div className="mb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                placeholder="Filter instances..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm px-3 py-1.5 pl-8 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>

          {/* Instance tree */}
          {filtered.map(inst => {
            const isExpanded = effectiveExpanded.has(inst.instanceId);
            const systemDbs = inst.databases?.filter(d => d.isSystem) || [];
            const userDbs = inst.databases?.filter(d => !d.isSystem) || [];
            const dbsExpanded = expandedDbs.has(inst.instanceId);
            const sysExpanded = expandedSysDb.has(inst.instanceId);

            return (
              <div key={inst.instanceId} className="mb-0.5">
                {/* Instance row */}
                <button
                  onClick={() => toggleInstance(inst.instanceId)}
                  className="flex items-center gap-1.5 w-full py-1.5 px-2 rounded text-left hover:bg-white/5 transition-colors"
                >
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                  <span className="font-medium text-gray-200 text-sm truncate">{inst.instanceName}</span>
                </button>

                {/* Categories */}
                {isExpanded && (
                  <div className="ml-2">
                    {categories.map(cat => {
                      if (cat.key === 'databases') {
                        return (
                          <div key={cat.key}>
                            <button
                              onClick={() => toggleDbs(inst.instanceId)}
                              className="flex items-center gap-2 w-full py-1.5 pl-6 pr-2 rounded text-left text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all border-l-2 border-transparent"
                            >
                              {dbsExpanded
                                ? <ChevronDown className="w-3 h-3 text-gray-500 shrink-0" />
                                : <ChevronRight className="w-3 h-3 text-gray-500 shrink-0" />}
                              <cat.icon className="w-4 h-4 text-gray-500" />
                              <span>Databases</span>
                              <span className="ml-auto text-[10px] text-gray-600">
                                {(inst.databases?.length || 0)}
                              </span>
                            </button>
                            {dbsExpanded && (
                              <div>
                                {/* System Databases */}
                                {systemDbs.length > 0 && (
                                  <div>
                                    <button
                                      onClick={() => toggleSysDb(inst.instanceId)}
                                      className="flex items-center gap-2 w-full py-1 pl-10 pr-2 rounded text-left text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all"
                                    >
                                      {sysExpanded
                                        ? <ChevronDown className="w-3 h-3 shrink-0" />
                                        : <ChevronRight className="w-3 h-3 shrink-0" />}
                                      <Folder className="w-3.5 h-3.5" />
                                      <span>System Databases</span>
                                    </button>
                                    {sysExpanded && systemDbs.map(db => (
                                      <Link
                                        key={db.databaseId}
                                        to={`/instances/${inst.instanceId}/databases/${db.databaseId}`}
                                        className={`flex items-center gap-2 py-1 pl-14 pr-2 rounded text-sm transition-all ${
                                          isActive(`/instances/${inst.instanceId}/databases/${db.databaseId}`)
                                            ? 'bg-blue-500/15 text-blue-400 border-l-2 border-blue-400'
                                            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border-l-2 border-transparent'
                                        }`}
                                      >
                                        <Database className="w-3 h-3" />
                                        <span className="truncate">{db.name}</span>
                                      </Link>
                                    ))}
                                  </div>
                                )}
                                {/* User Databases */}
                                {userDbs.map(db => (
                                  <Link
                                    key={db.databaseId}
                                    to={`/instances/${inst.instanceId}/databases/${db.databaseId}`}
                                    className={`flex items-center gap-2 py-1 pl-10 pr-2 rounded text-sm transition-all ${
                                      isActive(`/instances/${inst.instanceId}/databases/${db.databaseId}`)
                                        ? 'bg-blue-500/15 text-blue-400 border-l-2 border-blue-400'
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border-l-2 border-transparent'
                                    }`}
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
                        <Link
                          key={cat.key}
                          to={path}
                          className={`flex items-center gap-2 py-1.5 pl-6 pr-2 rounded text-sm transition-all ${
                            isActive(path) && cat.key === 'overview'
                              ? 'bg-blue-500/15 text-blue-400 border-l-2 border-blue-400'
                              : 'text-gray-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
                          }`}
                        >
                          <cat.icon className={`w-4 h-4 ${isActive(path) && cat.key === 'overview' ? 'text-blue-400' : 'text-gray-500'}`} />
                          <span>{cat.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
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
        <button
          onClick={onLogout}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded text-xs text-gray-400 hover:text-red-400 hover:bg-red-400/5 transition-all w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}

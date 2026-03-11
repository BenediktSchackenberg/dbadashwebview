import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingDown, Info, Server, Cpu, MemoryStick, Search, X, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from '../api/api';

const tooltipStyle = { backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' };

const VERSION_COLORS: Record<string, string> = {
  '2022': '#3b82f6', '2019': '#8b5cf6', '2017': '#10b981', '2016': '#f59e0b',
  '2014': '#ef4444', '2012': '#f97316', '2008': '#ec4899', 'Other': '#64748b',
};

function parseVersion(pv: string | null | undefined): string {
  if (!pv) return 'Other';
  const major = parseInt(pv);
  if (major >= 16) return '2022';
  if (major >= 15) return '2019';
  if (major >= 14) return '2017';
  if (major >= 13) return '2016';
  if (major >= 12) return '2014';
  if (major >= 11) return '2012';
  if (major >= 10) return '2008';
  return 'Other';
}

type SortKey = 'InstanceName' | 'version' | 'Edition' | 'cpu_count' | 'ramGb' | 'AvgCPU' | 'MaxCPU';

export default function UnderutilizedPage() {
  const [data, setData] = useState<any[]>([]);
  const [totalInstances, setTotalInstances] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('AvgCPU');
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState('');
  const [versionFilter, setVersionFilter] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<any | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.reportsUnderutilized(), api.reportsLicenses()]).then(([u, l]) => {
      setData(Array.isArray(u) ? u : []);
      setTotalInstances(Array.isArray(l) ? l.length : 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const enriched = useMemo(() => data.map(r => ({
    ...r,
    sqlVersion: parseVersion(r.ProductVersion),
    ramGb: r.physical_memory_kb ? Math.round(r.physical_memory_kb / 1048576) : 0,
  })), [data]);

  const filtered = useMemo(() => {
    let d = enriched;
    if (versionFilter) d = d.filter(r => r.sqlVersion === versionFilter);
    if (search) d = d.filter(r => (r.InstanceName || '').toLowerCase().includes(search.toLowerCase()));
    return d;
  }, [enriched, versionFilter, search]);

  // Version distribution among underutilized
  const versionDist = useMemo(() => {
    const map = new Map<string, number>();
    enriched.forEach(r => map.set(r.sqlVersion, (map.get(r.sqlVersion) || 0) + 1));
    return Array.from(map.entries()).map(([name, count]) => ({
      name: `SQL ${name}`, version: name, count,
    })).sort((a, b) => b.count - a.count);
  }, [enriched]);

  // Edition distribution
  const editionDist = useMemo(() => {
    const map = new Map<string, number>();
    enriched.forEach(r => map.set(r.Edition || 'Unknown', (map.get(r.Edition || 'Unknown') || 0) + 1));
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [enriched]);

  const EDITION_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

  // Chart data
  const chartData = useMemo(() =>
    filtered.map(r => ({
      name: r.InstanceName,
      avgCpu: Math.round((r.AvgCPU || 0) * 100) / 100,
      version: r.sqlVersion,
      fill: VERSION_COLORS[r.sqlVersion] || '#64748b',
    })).slice(0, 30),
  [filtered]);

  // Aggregates
  const totalCores = useMemo(() => filtered.reduce((s, r) => s + (r.cpu_count || 0), 0), [filtered]);
  const totalRam = useMemo(() => filtered.reduce((s, r) => s + r.ramGb, 0), [filtered]);

  // Sorted table
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'version') { av = a.sqlVersion; bv = b.sqlVersion; }
      else if (sortKey === 'ramGb') { av = a.ramGb; bv = b.ramGb; }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
    return copy;
  }, [filtered, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'InstanceName' || key === 'version'); }
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white whitespace-nowrap select-none" onClick={() => handleSort(k)}>
      {label} {sortKey === k ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  );

  const VersionBadge = ({ version }: { version: string }) => (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: (VERSION_COLORS[version] || '#64748b') + '20', color: VERSION_COLORS[version] || '#64748b', border: `1px solid ${(VERSION_COLORS[version] || '#64748b')}40` }}>
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VERSION_COLORS[version] || '#64748b' }} />
      SQL {version}
    </span>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <TrendingDown className="w-6 h-6 text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Underutilized SQL Servers</h1>
          <span className="text-sm text-gray-500">&lt;5% avg CPU over 14 days</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-44"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-gray-500" /></button>}
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-gray-500" />
            <button onClick={() => setVersionFilter(null)} className={`px-2 py-1 rounded-md text-xs transition-colors ${!versionFilter ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400 hover:bg-white/5'}`}>All</button>
            {versionDist.map(v => (
              <button key={v.version} onClick={() => setVersionFilter(versionFilter === v.version ? null : v.version)}
                className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1 ${versionFilter === v.version ? 'ring-1' : 'hover:bg-white/5'}`}
                style={{ color: VERSION_COLORS[v.version], ...(versionFilter === v.version ? { backgroundColor: VERSION_COLORS[v.version] + '20' } : {}) }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VERSION_COLORS[v.version] }} />
                {v.version} ({v.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Instance Detail Panel (when selected) */}
      <AnimatePresence>
        {selectedInstance && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="glass rounded-xl p-6 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-semibold text-white">{selectedInstance.InstanceName}</h3>
                  <VersionBadge version={selectedInstance.sqlVersion} />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => navigate(`/instances/${selectedInstance.InstanceID}`)} className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-colors">Open Instance →</button>
                  <button onClick={() => setSelectedInstance(null)} className="p-1.5 rounded-lg hover:bg-white/10"><X className="w-4 h-4 text-gray-400" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Edition', value: selectedInstance.Edition || '—' },
                  { label: 'Version', value: selectedInstance.ProductVersion || '—' },
                  { label: 'CPU Cores', value: selectedInstance.cpu_count ?? '—' },
                  { label: 'RAM', value: selectedInstance.ramGb ? selectedInstance.ramGb + ' GB' : '—' },
                  { label: 'Avg CPU (14d)', value: selectedInstance.AvgCPU != null ? selectedInstance.AvgCPU.toFixed(2) + '%' : '—' },
                  { label: 'Max CPU (14d)', value: selectedInstance.MaxCPU != null ? selectedInstance.MaxCPU + '%' : '—' },
                ].map((item, i) => (
                  <div key={i}>
                    <div className="text-xs text-gray-500">{item.label}</div>
                    <div className="text-sm text-white font-medium mt-0.5">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-300">
                  <strong>Recommendation:</strong> This {selectedInstance.Edition || 'SQL Server'} instance with {selectedInstance.cpu_count || '?'} cores has averaged only {(selectedInstance.AvgCPU || 0).toFixed(2)}% CPU over 14 days.
                  {(selectedInstance.MaxCPU || 0) < 10 && ' Even peak usage stayed below 10% — this server appears completely idle.'}
                  {' '}Consider consolidation, downsizing, or decommissioning after verifying with application owners.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-gray-500">Underutilized</span>
          </div>
          <div className="text-xl font-bold text-white">{filtered.length}</div>
          <div className="text-xs text-gray-500">{totalInstances > 0 ? Math.round(enriched.length / totalInstances * 100) : 0}% of {totalInstances} total</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-gray-500">Idle Cores</span>
          </div>
          <div className="text-xl font-bold text-white">{totalCores}</div>
          <div className="text-xs text-gray-500">could be reclaimed</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <MemoryStick className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-500">Idle RAM</span>
          </div>
          <div className="text-xl font-bold text-white">{totalRam >= 1024 ? (totalRam / 1024).toFixed(1) + ' TB' : totalRam + ' GB'}</div>
          <div className="text-xs text-gray-500">allocated to idle servers</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-green-400" />
            <span className="text-xs text-gray-500">Completely Idle</span>
          </div>
          <div className="text-xl font-bold text-white">{enriched.filter(r => (r.MaxCPU || 0) < 10).length}</div>
          <div className="text-xs text-gray-500">max CPU &lt;10% in 14 days</div>
        </motion.div>
      </div>

      {/* Version + Edition charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-2">By SQL Server Version</h2>
          <p className="text-xs text-gray-500 mb-4">Click to filter</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={versionDist} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45}
                onClick={(d: any) => setVersionFilter(versionFilter === d.version ? null : d.version)}
                className="cursor-pointer" stroke="none"
              >
                {versionDist.map((v, i) => (
                  <Cell key={i} fill={VERSION_COLORS[v.version] || '#64748b'} opacity={versionFilter && versionFilter !== v.version ? 0.3 : 1} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any, p: any) => [`${v} instances`, p.payload.name]} />
              <Legend formatter={(v: any) => <span className="text-gray-300 text-sm">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-2">By Edition</h2>
          <p className="text-xs text-gray-500 mb-4">Edition breakdown of underutilized instances</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={editionDist} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} stroke="none">
                {editionDist.map((_, i) => <Cell key={i} fill={EDITION_COLORS[i % EDITION_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any, p: any) => [`${v} instances`, p.payload.name]} />
              <Legend formatter={(v: any) => <span className="text-gray-300 text-sm">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CPU chart colored by version */}
      {chartData.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Average CPU Usage (14 days)</h2>
          <p className="text-xs text-gray-500 mb-4">Bars colored by SQL Server version</p>
          <ResponsiveContainer width="100%" height={Math.max(250, chartData.length * 28)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" domain={[0, 5]} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={180} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any, p: any) => [`${v.toFixed(2)}% (SQL ${p.payload.version})`, 'Avg CPU']} />
              <Bar dataKey="avgCpu" radius={[0, 4, 4, 0]}>
                {chartData.map((r, i) => <Cell key={i} fill={r.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Info Box */}
      <div className="glass rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm text-gray-300 space-y-1.5">
            <p>Instances shown here averaged <strong className="text-white">&lt;5% CPU</strong> over the past 14 days. Click any row to see details and recommendations.</p>
            <p className="text-gray-400">Consider: <strong className="text-gray-300">Consolidation</strong> (merge onto fewer hosts), <strong className="text-gray-300">Downsizing</strong> (reduce cores/RAM), or <strong className="text-gray-300">Decommissioning</strong> (retire unused instances). Always verify with application owners first.</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl p-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Instance Details</h2>
          <span className="text-xs text-gray-500">{filtered.length} of {enriched.length} shown · Click a row for details</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <SortHeader k="InstanceName" label="Instance" />
              <SortHeader k="version" label="Version" />
              <SortHeader k="Edition" label="Edition" />
              <SortHeader k="cpu_count" label="Cores" />
              <SortHeader k="ramGb" label="RAM" />
              <SortHeader k="AvgCPU" label="Avg CPU (14d)" />
              <SortHeader k="MaxCPU" label="Max CPU (14d)" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const idle = (r.MaxCPU || 0) < 10;
              const isSelected = selectedInstance?.InstanceID === r.InstanceID;
              return (
                <tr key={i}
                  onClick={() => setSelectedInstance(isSelected ? null : r)}
                  className={`border-b border-white/5 cursor-pointer transition-colors ${isSelected ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : idle ? 'bg-amber-500/5 hover:bg-white/5' : 'hover:bg-white/5'}`}
                >
                  <td className="px-3 py-2.5 text-sm text-gray-200 font-medium">{r.InstanceName}</td>
                  <td className="px-3 py-2.5"><VersionBadge version={r.sqlVersion} /></td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{r.Edition || '—'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-300 text-center">{r.cpu_count ?? '—'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-300">{r.ramGb ? r.ramGb + ' GB' : '—'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-300 font-mono">{r.AvgCPU != null ? r.AvgCPU.toFixed(2) + '%' : '—'}</td>
                  <td className={`px-3 py-2.5 text-sm font-mono ${idle ? 'text-amber-400' : 'text-gray-300'}`}>{r.MaxCPU != null ? r.MaxCPU + '%' : '—'}{idle && ' ⚠'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center text-gray-500 py-8">{enriched.length > 0 ? 'No instances match the current filters' : 'No underutilized instances found — great!'}</p>}
      </div>
    </motion.div>
  );
}

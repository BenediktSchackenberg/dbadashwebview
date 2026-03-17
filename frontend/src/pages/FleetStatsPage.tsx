import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Cpu, MemoryStick, HardDrive, Server, Database, ChevronDown, ChevronRight, Filter, Search, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from '../api/api';
import TimeRangeSelector, { hoursLabel } from '../components/TimeRangeSelector';

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

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes >= 1099511627776) return (bytes / 1099511627776).toFixed(1) + ' TB';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

type SortKey = 'InstanceName' | 'version' | 'Edition' | 'cpu_count' | 'AvgCPU24h' | 'MaxCPU24h' | 'ramGb' | 'storUsed' | 'storTotal' | 'storPct';

export default function FleetStatsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('AvgCPU24h');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');
  const [versionFilter, setVersionFilter] = useState<string | null>(null);
  const [editionFilter, setEditionFilter] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.reportsFleetStats(hours).then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, [hours]);

  // Enrich data with parsed version
  const enriched = useMemo(() => data.map(r => ({
    ...r,
    sqlVersion: parseVersion(r.ProductVersion),
    ramGb: r.physical_memory_kb ? Math.round(r.physical_memory_kb / 1048576) : 0,
    storPct: r.TotalCapacity ? Math.round((r.TotalUsed || 0) / r.TotalCapacity * 100) : 0,
  })), [data]);

  // Filters
  const filtered = useMemo(() => {
    let d = enriched;
    if (versionFilter) d = d.filter(r => r.sqlVersion === versionFilter);
    if (editionFilter) d = d.filter(r => (r.Edition || '').toLowerCase().includes(editionFilter.toLowerCase()));
    if (search) d = d.filter(r => (r.InstanceName || '').toLowerCase().includes(search.toLowerCase()));
    return d;
  }, [enriched, versionFilter, editionFilter, search]);

  // Aggregates
  const totalCores = useMemo(() => filtered.reduce((s, r) => s + (r.cpu_count || 0), 0), [filtered]);
  const totalRam = useMemo(() => filtered.reduce((s, r) => s + r.ramGb, 0), [filtered]);
  const avgFleetCpu = useMemo(() => {
    const tw = filtered.reduce((s, r) => s + (r.AvgCPU24h || 0) * (r.cpu_count || 1), 0);
    return totalCores > 0 ? tw / totalCores : 0;
  }, [filtered, totalCores]);
  const totalStorUsed = useMemo(() => filtered.reduce((s, r) => s + (r.TotalUsed || 0), 0), [filtered]);
  const totalStorCap = useMemo(() => filtered.reduce((s, r) => s + (r.TotalCapacity || 0), 0), [filtered]);

  // Version distribution (pie)
  const versionDist = useMemo(() => {
    const map = new Map<string, { count: number; cores: number; ram: number }>();
    enriched.forEach(r => {
      const v = r.sqlVersion;
      const cur = map.get(v) || { count: 0, cores: 0, ram: 0 };
      cur.count++;
      cur.cores += r.cpu_count || 0;
      cur.ram += r.ramGb;
      map.set(v, cur);
    });
    return Array.from(map.entries())
      .map(([name, d]) => ({ name: `SQL ${name}`, version: name, ...d }))
      .sort((a, b) => b.count - a.count);
  }, [enriched]);

  // Edition distribution (pie)
  const editionDist = useMemo(() => {
    const map = new Map<string, number>();
    enriched.forEach(r => {
      const ed = r.Edition ? r.Edition.split(' ')[0] : 'Unknown';
      map.set(ed, (map.get(ed) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [enriched]);

  const EDITION_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

  // CPU distribution by version (stacked)
  const cpuByVersion = useMemo(() => {
    const buckets = ['0-5%', '5-10%', '10-25%', '25-50%', '50-75%', '75-100%'];
    const ranges = [[0, 5], [5, 10], [10, 25], [25, 50], [50, 75], [75, 101]];
    const versions = [...new Set(enriched.map(r => r.sqlVersion))].sort();
    return buckets.map((name, i) => {
      const row: any = { name };
      const [min, max] = ranges[i];
      versions.forEach(v => {
        row[`SQL ${v}`] = enriched.filter(r => r.sqlVersion === v && (r.AvgCPU24h || 0) >= min && (r.AvgCPU24h || 0) < max).length;
      });
      return row;
    });
  }, [enriched]);

  // Top 10 CPU with version color
  const top10Cpu = useMemo(() =>
    [...filtered].sort((a, b) => (b.AvgCPU24h || 0) - (a.AvgCPU24h || 0)).slice(0, 10).map(r => ({
      name: r.InstanceName,
      value: Math.round((r.AvgCPU24h || 0) * 100) / 100,
      version: r.sqlVersion,
      fill: VERSION_COLORS[r.sqlVersion] || '#64748b',
    })),
  [filtered]);

  // RAM distribution by version
  const ramByVersion = useMemo(() => {
    const buckets = ['<8GB', '8-16', '16-32', '32-64', '64-128', '>128'];
    const ranges = [[0, 8], [8, 16], [16, 32], [32, 64], [64, 128], [128, Infinity]];
    const versions = [...new Set(enriched.map(r => r.sqlVersion))].sort();
    return buckets.map((name, i) => {
      const row: any = { name };
      const [min, max] = ranges[i];
      versions.forEach(v => {
        row[`SQL ${v}`] = enriched.filter(r => r.sqlVersion === v && r.ramGb >= min && r.ramGb < max).length;
      });
      return row;
    });
  }, [enriched]);

  // Top 10 storage with version
  const top10Storage = useMemo(() =>
    [...filtered].filter(r => r.TotalUsed > 0).sort((a, b) => (b.TotalUsed || 0) - (a.TotalUsed || 0)).slice(0, 10).map(r => ({
      name: r.InstanceName,
      value: Math.round((r.TotalUsed || 0) / 1073741824),
      version: r.sqlVersion,
      fill: VERSION_COLORS[r.sqlVersion] || '#64748b',
    })),
  [filtered]);

  // Version breakdown groups
  const versionGroups = useMemo(() => {
    const map = new Map<string, any[]>();
    enriched.forEach(r => {
      const arr = map.get(r.sqlVersion) || [];
      arr.push(r);
      map.set(r.sqlVersion, arr);
    });
    return Array.from(map.entries())
      .map(([version, instances]) => ({
        version,
        instances: instances.sort((a, b) => (b.AvgCPU24h || 0) - (a.AvgCPU24h || 0)),
        avgCpu: instances.reduce((s, r) => s + (r.AvgCPU24h || 0), 0) / instances.length,
        totalCores: instances.reduce((s, r) => s + (r.cpu_count || 0), 0),
        totalRam: instances.reduce((s, r) => s + r.ramGb, 0),
      }))
      .sort((a, b) => b.instances.length - a.instances.length);
  }, [enriched]);

  // Sorted table
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'version') { av = a.sqlVersion; bv = b.sqlVersion; }
      else if (sortKey === 'Edition') { av = a.Edition || ''; bv = b.Edition || ''; }
      else if (sortKey === 'ramGb') { av = a.ramGb; bv = b.ramGb; }
      else if (sortKey === 'storUsed') { av = a.TotalUsed || 0; bv = b.TotalUsed || 0; }
      else if (sortKey === 'storTotal') { av = a.TotalCapacity || 0; bv = b.TotalCapacity || 0; }
      else if (sortKey === 'storPct') { av = a.storPct; bv = b.storPct; }
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

  const SortHeader = ({ k, label, className = '' }: { k: SortKey; label: string; className?: string }) => (
    <th className={`px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white whitespace-nowrap select-none ${className}`} onClick={() => handleSort(k)}>
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

  const versions = [...new Set(enriched.map(r => r.sqlVersion))].sort();

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Fleet Statistics</h1>
          <span className="text-sm text-gray-500">{enriched.length} instances</span>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text" placeholder="Search instances..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-48"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-gray-500" /></button>}
          </div>
          {/* Version filter chips */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-gray-500" />
            <button onClick={() => setVersionFilter(null)} className={`px-2 py-1 rounded-md text-xs transition-colors ${!versionFilter ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400 hover:bg-white/5'}`}>All</button>
            {versionDist.map(v => (
              <button key={v.version} onClick={() => setVersionFilter(versionFilter === v.version ? null : v.version)}
                className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1 ${versionFilter === v.version ? 'ring-1' : 'hover:bg-white/5'}`}
                style={{ color: VERSION_COLORS[v.version], ...(versionFilter === v.version ? { backgroundColor: VERSION_COLORS[v.version] + '20', ringColor: VERSION_COLORS[v.version] } : {}) }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VERSION_COLORS[v.version] }} />
                {v.version} ({v.count})
              </button>
            ))}
          </div>
          <TimeRangeSelector value={hours} onChange={setHours} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Server, label: 'Instances', value: filtered.length.toString(), sub: versionFilter ? `of ${enriched.length}` : undefined, color: 'text-blue-400' },
          { icon: Cpu, label: 'CPU Cores', value: totalCores.toLocaleString(), color: 'text-cyan-400' },
          { icon: Activity, label: `Avg CPU (${hoursLabel(hours)})`, value: avgFleetCpu.toFixed(1) + '%', color: avgFleetCpu > 50 ? 'text-red-400' : avgFleetCpu > 25 ? 'text-yellow-400' : 'text-green-400' },
          { icon: MemoryStick, label: 'Total RAM', value: totalRam >= 1024 ? (totalRam / 1024).toFixed(1) + ' TB' : totalRam + ' GB', color: 'text-purple-400' },
          { icon: HardDrive, label: 'Storage Used', value: formatBytes(totalStorUsed), sub: `of ${formatBytes(totalStorCap)}`, color: 'text-yellow-400' },
          { icon: Database, label: 'Versions', value: versions.length.toString(), sub: 'SQL Server', color: 'text-emerald-400' },
        ].map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <span className="text-xs text-gray-500">{c.label}</span>
            </div>
            <div className="text-lg font-bold text-white">{c.value}</div>
            {c.sub && <div className="text-xs text-gray-500">{c.sub}</div>}
          </motion.div>
        ))}
      </div>

      {/* Version + Edition pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-2">SQL Server Version Distribution</h2>
          <p className="text-xs text-gray-500 mb-4">Click a segment to filter the fleet</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={versionDist} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                onClick={(d: any) => setVersionFilter(versionFilter === d.version ? null : d.version)}
                className="cursor-pointer" stroke="none"
              >
                {versionDist.map((v, i) => (
                  <Cell key={i} fill={VERSION_COLORS[v.version] || '#64748b'} opacity={versionFilter && versionFilter !== v.version ? 0.3 : 1} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, _n: any, p: any) => [`${v} instances (${(p.percent * 100).toFixed(0)}%)`, p.payload.name]} />
              <Legend formatter={(value: any) => <span className="text-gray-300 text-sm">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-2">Edition Distribution</h2>
          <p className="text-xs text-gray-500 mb-4">Click a segment to filter by edition</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={editionDist} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                onClick={(d: any) => setEditionFilter(editionFilter === d.name ? null : d.name)}
                className="cursor-pointer" stroke="none"
              >
                {editionDist.map((_, i) => <Cell key={i} fill={EDITION_COLORS[i % EDITION_COLORS.length]} opacity={editionFilter && editionFilter !== editionDist[i].name ? 0.3 : 1} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, _n: any, p: any) => [`${v} instances (${(p.percent * 100).toFixed(0)}%)`, p.payload.name]} />
              <Legend formatter={(value: any) => <span className="text-gray-300 text-sm">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* CPU + RAM by version (stacked bars) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">CPU Usage by Version</h2>
          <p className="text-xs text-gray-500 mb-4">Instance count per CPU bucket, colored by SQL version</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cpuByVersion}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              {versions.map(v => <Bar key={v} dataKey={`SQL ${v}`} stackId="a" fill={VERSION_COLORS[v] || '#64748b'} />)}
              <Legend formatter={(value: any) => <span className="text-gray-300 text-xs">{value}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">RAM by Version</h2>
          <p className="text-xs text-gray-500 mb-4">Instance count per RAM bucket, colored by SQL version</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ramByVersion}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              {versions.map(v => <Bar key={v} dataKey={`SQL ${v}`} stackId="a" fill={VERSION_COLORS[v] || '#64748b'} />)}
              <Legend formatter={(value: any) => <span className="text-gray-300 text-xs">{value}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top 10 charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top 10 CPU Consumers (24h)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={top10Cpu} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={150} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, _n: any, p: any) => [`${v}% (SQL ${p.payload.version})`, 'Avg CPU']} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {top10Cpu.map((r, i) => <Cell key={i} fill={r.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top 10 Storage Usage (GB)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={top10Storage} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={150} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, _n: any, p: any) => [`${v} GB (SQL ${p.payload.version})`, 'Used']} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {top10Storage.map((r, i) => <Cell key={i} fill={r.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Version Breakdown Accordion */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Version Breakdown</h2>
        <div className="space-y-2">
          {versionGroups.map(g => (
            <div key={g.version}>
              <button
                onClick={() => setExpandedVersion(expandedVersion === g.version ? null : g.version)}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedVersion === g.version ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <VersionBadge version={g.version} />
                  <span className="text-sm text-white font-medium">{g.instances.length} instances</span>
                </div>
                <div className="flex items-center gap-6 text-xs text-gray-400">
                  <span>{g.totalCores} cores</span>
                  <span>{g.totalRam} GB RAM</span>
                  <span>Avg CPU: {g.avgCpu.toFixed(1)}%</span>
                </div>
              </button>
              <AnimatePresence>
                {expandedVersion === g.version && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="pl-10 pr-3 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {g.instances.map((inst, i) => (
                        <div key={i} onClick={() => navigate(`/instances/${inst.InstanceID}`)}
                          className="p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                        >
                          <div className="text-sm font-medium text-white truncate">{inst.InstanceName}</div>
                          <div className="text-xs text-gray-400 mt-1">{inst.Edition || '—'} · v{inst.ProductVersion || '?'}</div>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                            <span>{inst.cpu_count || 0} cores</span>
                            <span>{inst.ramGb} GB</span>
                            <span>CPU: {(inst.AvgCPU24h || 0).toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* Table with version */}
      <div className="glass rounded-xl p-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">All Instances</h2>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            {(versionFilter || editionFilter || search) && (
              <button onClick={() => { setVersionFilter(null); setEditionFilter(null); setSearch(''); }} className="text-blue-400 hover:text-blue-300">Clear filters</button>
            )}
            <span>{filtered.length} of {enriched.length} shown</span>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <SortHeader k="InstanceName" label="Instance" />
              <SortHeader k="version" label="Version" />
              <SortHeader k="Edition" label="Edition" />
              <SortHeader k="cpu_count" label="Cores" />
              <SortHeader k="AvgCPU24h" label="Avg CPU (24h)" />
              <SortHeader k="MaxCPU24h" label="Max CPU (24h)" />
              <SortHeader k="ramGb" label="RAM" />
              <SortHeader k="storUsed" label="Storage" />
              <SortHeader k="storPct" label="Stor %" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const storClass = r.storPct > 85 ? 'bg-red-500/10' : r.storPct > 70 ? 'bg-yellow-500/10' : '';
              const cpuClass = (r.AvgCPU24h || 0) > 75 ? 'text-red-400' : (r.AvgCPU24h || 0) > 50 ? 'text-yellow-400' : 'text-gray-300';
              return (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors" onClick={() => navigate(`/instances/${r.InstanceID}`)}>
                  <td className="px-3 py-2 text-sm text-gray-200 font-medium">{r.InstanceName}</td>
                  <td className="px-3 py-2"><VersionBadge version={r.sqlVersion} /></td>
                  <td className="px-3 py-2 text-xs text-gray-400">{r.Edition || '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-300 text-center">{r.cpu_count ?? '—'}</td>
                  <td className={`px-3 py-2 text-sm font-mono ${cpuClass}`}>{r.AvgCPU24h != null ? r.AvgCPU24h.toFixed(1) + '%' : '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-300 font-mono">{r.MaxCPU24h != null ? r.MaxCPU24h + '%' : '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-300">{r.ramGb ? r.ramGb + ' GB' : '—'}</td>
                  <td className="px-3 py-2 text-sm text-gray-300">{r.TotalUsed ? formatBytes(r.TotalUsed) : '—'}</td>
                  <td className={`px-3 py-2 text-sm text-gray-300 ${storClass}`}>{r.TotalCapacity ? r.storPct + '%' : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center text-gray-500 py-8">{enriched.length > 0 ? 'No instances match the current filters' : 'No data available'}</p>}
      </div>
    </motion.div>
  );
}

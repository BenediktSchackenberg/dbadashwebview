import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileSpreadsheet, Server, Cpu, MemoryStick, Layers, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/api';

const versionMap: Record<number, string> = {
  17: 'SQL Server 2025', 16: 'SQL Server 2022', 15: 'SQL Server 2019',
  14: 'SQL Server 2017', 13: 'SQL Server 2016', 12: 'SQL Server 2014',
  11: 'SQL Server 2012', 10: 'SQL Server 2008',
};

const COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8', '#8b5cf6', '#10b981', '#6366f1'];

const tooltipStyle = { backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' };

const supportTimeline = [
  { version: 'SQL Server 2012', major: 11, endDate: new Date('2022-07-12'), label: 'Jul 2022' },
  { version: 'SQL Server 2014', major: 12, endDate: new Date('2024-07-09'), label: 'Jul 2024' },
  { version: 'SQL Server 2016', major: 13, endDate: new Date('2026-07-14'), label: 'Jul 2026' },
  { version: 'SQL Server 2017', major: 14, endDate: new Date('2027-10-12'), label: 'Oct 2027' },
  { version: 'SQL Server 2019', major: 15, endDate: new Date('2030-01-08'), label: 'Jan 2030' },
  { version: 'SQL Server 2022', major: 16, endDate: new Date('2034-01-10'), label: 'Jan 2034' },
];

type SortKey = 'InstanceName' | 'Edition' | 'ProductVersion' | 'cpu_count' | 'socket_count' | 'ramGb' | 'sqlserver_start_time';

export default function LicenseOverviewPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('InstanceName');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    api.reportsLicenses().then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const totalCores = useMemo(() => data.reduce((s, r) => s + (r.cpu_count || 0), 0), [data]);
  const totalRam = useMemo(() => Math.round(data.reduce((s, r) => s + (r.physical_memory_kb || 0), 0) / 1048576), [data]);
  const uniqueEditions = useMemo(() => new Set(data.map(r => r.Edition).filter(Boolean)).size, [data]);

  const versionDist = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach(r => {
      const name = versionMap[r.ProductMajorVersion] || `v${r.ProductMajorVersion || '?'}`;
      map.set(name, (map.get(name) || 0) + 1);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value }));
  }, [data]);

  const editionDist = useMemo(() => {
    const map = new Map<string, number>();
    data.forEach(r => { const e = r.Edition || 'Unknown'; map.set(e, (map.get(e) || 0) + 1); });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data]);

  const supportInfo = useMemo(() => {
    const now = new Date();
    const oneYear = new Date(now.getTime() + 365 * 86400000);
    return supportTimeline.map(s => {
      const count = data.filter(r => r.ProductMajorVersion === s.major).length;
      const expired = s.endDate < now;
      const nearExpiry = !expired && s.endDate < oneYear;
      return { ...s, count, expired, nearExpiry };
    });
  }, [data]);

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'ramGb') { av = (a.physical_memory_kb || 0); bv = (b.physical_memory_kb || 0); }
      else { av = a[sortKey]; bv = b[sortKey]; }
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
    return copy;
  }, [data, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white" onClick={() => handleSort(k)}>
      {label} {sortKey === k ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  );

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">License & Version Overview</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Server, label: 'Total Instances', value: data.length, color: 'text-blue-400' },
          { icon: Cpu, label: 'Total Cores', value: totalCores.toLocaleString(), color: 'text-purple-400' },
          { icon: MemoryStick, label: 'Total RAM', value: `${totalRam} GB`, color: 'text-green-400' },
          { icon: Layers, label: 'Editions', value: uniqueEditions, color: 'text-yellow-400' },
        ].map((c, i) => (
          <div key={i} className="glass rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <c.icon className={`w-5 h-5 ${c.color}`} />
              <span className="text-sm text-gray-400">{c.label}</span>
            </div>
            <div className="text-2xl font-bold text-white">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Version Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={versionDist} cx="50%" cy="50%" innerRadius={60} outerRadius={110} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                {versionDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Edition Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={editionDist} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={120} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* End of Support Timeline */}
      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">End of Extended Support Timeline</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {supportInfo.map((s, i) => (
            <div key={i} className={`rounded-lg p-4 border ${s.expired ? 'bg-red-500/10 border-red-500/30' : s.nearExpiry ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{s.version}</span>
                {s.expired ? <AlertTriangle className="w-4 h-4 text-red-400" /> : s.nearExpiry ? <Clock className="w-4 h-4 text-yellow-400" /> : <CheckCircle className="w-4 h-4 text-green-400" />}
              </div>
              <div className={`text-xs ${s.expired ? 'text-red-400' : s.nearExpiry ? 'text-yellow-400' : 'text-green-400'}`}>
                {s.expired ? `EXPIRED — ${s.label}` : `Ends ${s.label}`}
              </div>
              <div className="text-xs text-gray-400 mt-1">{s.count} instance{s.count !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Instance Table */}
      <div className="glass rounded-xl p-6 overflow-x-auto">
        <h2 className="text-lg font-semibold text-white mb-4">All Instances</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <SortHeader k="InstanceName" label="Instance" />
              <SortHeader k="Edition" label="Edition" />
              <SortHeader k="ProductVersion" label="Version" />
              <SortHeader k="cpu_count" label="Cores" />
              <SortHeader k="socket_count" label="Sockets" />
              <SortHeader k="ramGb" label="RAM (GB)" />
              <SortHeader k="sqlserver_start_time" label="Start Date" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                <td className="px-4 py-2 text-sm text-gray-200">{r.InstanceName}</td>
                <td className="px-4 py-2 text-sm text-gray-300">{r.Edition || '—'}</td>
                <td className="px-4 py-2 text-sm text-gray-300">{r.ProductVersion || '—'}</td>
                <td className="px-4 py-2 text-sm text-gray-300">{r.cpu_count ?? '—'}</td>
                <td className="px-4 py-2 text-sm text-gray-300">{r.socket_count ?? '—'}</td>
                <td className="px-4 py-2 text-sm text-gray-300">{r.physical_memory_kb ? Math.round(r.physical_memory_kb / 1048576) + ' GB' : '—'}</td>
                <td className="px-4 py-2 text-sm text-gray-300">{r.sqlserver_start_time ? new Date(r.sqlserver_start_time).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.length === 0 && <p className="text-center text-gray-500 py-8">No data available</p>}
      </div>
    </motion.div>
  );
}

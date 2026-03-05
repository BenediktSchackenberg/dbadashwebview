import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, Info, DollarSign, Server } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/api';

const tooltipStyle = { backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' };

function estimateSavings(edition: string, cores: number): number {
  if (!edition) return 0;
  const e = edition.toLowerCase();
  if (e.includes('enterprise')) return cores * 15000;
  if (e.includes('standard')) return cores * 4000;
  return 0;
}

function formatDollar(n: number): string {
  return n === 0 ? '$0' : '$' + n.toLocaleString();
}

type SortKey = 'InstanceName' | 'Edition' | 'cpu_count' | 'ramGb' | 'AvgCPU' | 'MaxCPU' | 'savings';

export default function UnderutilizedPage() {
  const [data, setData] = useState<any[]>([]);
  const [totalInstances, setTotalInstances] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('AvgCPU');
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    Promise.all([api.reportsUnderutilized(), api.reportsLicenses()]).then(([u, l]) => {
      setData(Array.isArray(u) ? u : []);
      setTotalInstances(Array.isArray(l) ? l.length : 0);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const chartData = useMemo(() =>
    data.map(r => ({ name: r.InstanceName, avgCpu: Math.round((r.AvgCPU || 0) * 100) / 100 })).slice(0, 30),
  [data]);

  const totalSavings = useMemo(() => data.reduce((s, r) => s + estimateSavings(r.Edition, r.cpu_count || 0), 0), [data]);

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'ramGb') { av = a.physical_memory_kb || 0; bv = b.physical_memory_kb || 0; }
      else if (sortKey === 'savings') { av = estimateSavings(a.Edition, a.cpu_count || 0); bv = estimateSavings(b.Edition, b.cpu_count || 0); }
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
        <TrendingDown className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">Underutilized SQL Servers</h1>
      </div>

      {/* Info Card */}
      <div className="glass rounded-xl p-6">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm text-gray-300 space-y-2">
            <p>These SQL Server instances have averaged less than 5% CPU utilization over the past 14 days.
            This consistently low usage may indicate that these servers are underutilized or no longer actively needed.</p>
            <p className="text-gray-400"><strong className="text-gray-200">Potential savings:</strong></p>
            <ul className="list-disc list-inside text-gray-400 space-y-1">
              <li><strong className="text-gray-300">License costs</strong> — SQL Server licenses (especially Enterprise) are expensive per-core. Consolidating underutilized instances can significantly reduce licensing costs.</li>
              <li><strong className="text-gray-300">VM/Infrastructure costs</strong> — Each VM consumes compute, memory, and storage resources. Decommissioning or consolidating can free up capacity.</li>
              <li><strong className="text-gray-300">Operational overhead</strong> — Fewer servers means less patching, monitoring, and maintenance effort.</li>
            </ul>
            <p className="text-gray-400"><strong className="text-gray-200">Recommendation:</strong> Review these instances with application owners to determine if they can be consolidated, downsized, or decommissioned.</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Server className="w-5 h-5 text-yellow-400" />
            <span className="text-sm text-gray-400">Underutilized Instances</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {data.length} <span className="text-sm font-normal text-gray-400">/ {totalInstances} total ({totalInstances > 0 ? Math.round(data.length / totalInstances * 100) : 0}%)</span>
          </div>
        </div>
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            <span className="text-sm text-gray-400">Total Potential Annual Savings</span>
          </div>
          <div className="text-2xl font-bold text-green-400">{formatDollar(totalSavings)}</div>
          <div className="text-xs text-gray-500 mt-1">Estimated based on typical SQL Server list pricing</div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Average CPU Usage (14 days)</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 28)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" domain={[0, 5]} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={180} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v.toFixed(2)}%`, 'Avg CPU']} />
              <Bar dataKey="avgCpu" fill="#64748b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="glass rounded-xl p-6 overflow-x-auto">
        <h2 className="text-lg font-semibold text-white mb-4">Instance Details</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <SortHeader k="InstanceName" label="Instance" />
              <SortHeader k="Edition" label="Edition" />
              <SortHeader k="cpu_count" label="Cores" />
              <SortHeader k="ramGb" label="RAM (GB)" />
              <SortHeader k="AvgCPU" label="Avg CPU % (14d)" />
              <SortHeader k="MaxCPU" label="Max CPU % (14d)" />
              <SortHeader k="savings" label="Potential Savings/yr" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const idle = (r.MaxCPU || 0) < 10;
              const savings = estimateSavings(r.Edition, r.cpu_count || 0);
              return (
                <tr key={i} className={`border-b border-white/5 ${idle ? 'bg-yellow-500/5' : 'hover:bg-white/5'}`}>
                  <td className="px-4 py-2 text-sm text-gray-200">{r.InstanceName}</td>
                  <td className="px-4 py-2 text-sm text-gray-300">{r.Edition || '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-300">{r.cpu_count ?? '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-300">{r.physical_memory_kb ? Math.round(r.physical_memory_kb / 1048576) + ' GB' : '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-300">{r.AvgCPU != null ? r.AvgCPU.toFixed(2) + '%' : '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-300">{r.MaxCPU != null ? r.MaxCPU + '%' : '—'}</td>
                  <td className="px-4 py-2 text-sm text-green-400" title="Estimated based on typical SQL Server list pricing">{formatDollar(savings)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.length === 0 && <p className="text-center text-gray-500 py-8">No underutilized instances found</p>}
      </div>
    </motion.div>
  );
}

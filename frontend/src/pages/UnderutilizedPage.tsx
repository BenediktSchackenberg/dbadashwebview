import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingDown, Info, Server, Cpu, MemoryStick, Search, X, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from '../api/api';
import type { UnderutilizedReportRow } from '../api/types';
import { SQL_SERVER_VERSION_COLORS as VERSION_COLORS, sqlServerVersionYear } from '../utils/sqlServerVersions';

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#fff',
};

type SortKey = 'instanceName' | 'version' | 'edition' | 'cpuCount' | 'ramGb' | 'avgCpu' | 'maxCpu';

interface UnderutilizedViewRow extends UnderutilizedReportRow {
  instanceName: string;
  editionName: string;
  productVersionText: string;
  sqlVersion: string;
  cpuCount: number;
  ramGb: number;
  avgCpu: number;
  maxCpu: number;
}

interface DistributionRow {
  name: string;
  version: string;
  count: number;
}

interface EditionDistributionRow {
  name: string;
  count: number;
}

interface ChartRow {
  name: string;
  avgCpu: number;
  version: string;
  fill: string;
}

export default function UnderutilizedPage() {
  const [data, setData] = useState<UnderutilizedReportRow[]>([]);
  const [totalInstances, setTotalInstances] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('avgCpu');
  const [sortAsc, setSortAsc] = useState(true);
  const [search, setSearch] = useState('');
  const [versionFilter, setVersionFilter] = useState<string | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<UnderutilizedViewRow | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.reportsUnderutilized(), api.reportsLicenses()])
      .then(([underutilizedRows, licenseRows]) => {
        setData(Array.isArray(underutilizedRows) ? underutilizedRows : []);
        setTotalInstances(Array.isArray(licenseRows) ? licenseRows.length : 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const enriched = useMemo<UnderutilizedViewRow[]>(() => {
    return data.map((row) => ({
      ...row,
      instanceName: row.InstanceName || `Instance ${row.InstanceID}`,
      editionName: row.Edition || 'Unknown',
      productVersionText: row.ProductVersion || '?',
      sqlVersion: sqlServerVersionYear(row.ProductVersion),
      cpuCount: row.cpu_count ?? 0,
      ramGb: row.physical_memory_kb ? Math.round(row.physical_memory_kb / 1048576) : 0,
      avgCpu: row.AvgCPU ?? 0,
      maxCpu: row.MaxCPU ?? 0,
    }));
  }, [data]);

  const filtered = useMemo(() => {
    return enriched.filter((row) => {
      if (versionFilter && row.sqlVersion !== versionFilter) return false;
      if (search && !row.instanceName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [enriched, search, versionFilter]);

  const versionDist = useMemo<DistributionRow[]>(() => {
    const map = new Map<string, number>();
    enriched.forEach((row) => map.set(row.sqlVersion, (map.get(row.sqlVersion) || 0) + 1));
    return Array.from(map.entries())
      .map(([version, count]) => ({ name: `SQL ${version}`, version, count }))
      .sort((a, b) => b.count - a.count);
  }, [enriched]);

  const editionDist = useMemo<EditionDistributionRow[]>(() => {
    const map = new Map<string, number>();
    enriched.forEach((row) => map.set(row.editionName, (map.get(row.editionName) || 0) + 1));
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [enriched]);

  const chartData = useMemo<ChartRow[]>(() => {
    return filtered
      .slice()
      .sort((a, b) => a.avgCpu - b.avgCpu)
      .slice(0, 30)
      .map((row) => ({
        name: row.instanceName,
        avgCpu: Math.round(row.avgCpu * 100) / 100,
        version: row.sqlVersion,
        fill: VERSION_COLORS[row.sqlVersion] || VERSION_COLORS.Other,
      }));
  }, [filtered]);

  const totalCores = useMemo(() => filtered.reduce((sum, row) => sum + row.cpuCount, 0), [filtered]);
  const totalRam = useMemo(() => filtered.reduce((sum, row) => sum + row.ramGb, 0), [filtered]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let left: string | number = a.instanceName;
      let right: string | number = b.instanceName;

      switch (sortKey) {
        case 'version':
          left = a.sqlVersion;
          right = b.sqlVersion;
          break;
        case 'edition':
          left = a.editionName;
          right = b.editionName;
          break;
        case 'cpuCount':
          left = a.cpuCount;
          right = b.cpuCount;
          break;
        case 'ramGb':
          left = a.ramGb;
          right = b.ramGb;
          break;
        case 'avgCpu':
          left = a.avgCpu;
          right = b.avgCpu;
          break;
        case 'maxCpu':
          left = a.maxCpu;
          right = b.maxCpu;
          break;
        default:
          left = a.instanceName;
          right = b.instanceName;
          break;
      }

      if (typeof left === 'string' && typeof right === 'string') {
        return sortAsc ? left.localeCompare(right) : right.localeCompare(left);
      }

      return sortAsc ? Number(left) - Number(right) : Number(right) - Number(left);
    });
    return rows;
  }, [filtered, sortAsc, sortKey]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((value) => !value);
      return;
    }

    setSortKey(key);
    setSortAsc(key === 'instanceName' || key === 'version');
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white whitespace-nowrap select-none"
      onClick={() => handleSort(k)}
    >
      {label} {sortKey === k ? (sortAsc ? '^' : 'v') : ''}
    </th>
  );

  const VersionBadge = ({ version }: { version: string }) => (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: `${VERSION_COLORS[version] || VERSION_COLORS.Other}20`,
        color: VERSION_COLORS[version] || VERSION_COLORS.Other,
        border: `1px solid ${(VERSION_COLORS[version] || VERSION_COLORS.Other)}40`,
      }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VERSION_COLORS[version] || VERSION_COLORS.Other }} />
      SQL {version}
    </span>
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" /></div>;
  }

  const idleInstances = enriched.filter((row) => row.maxCpu < 10).length;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <TrendingDown className="w-6 h-6 text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Underutilized SQL Servers</h1>
          <span className="text-sm text-gray-500">&lt;5% avg CPU over 14 days</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-44"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-gray-500" />
            <button
              onClick={() => setVersionFilter(null)}
              className={`px-2 py-1 rounded-md text-xs transition-colors ${!versionFilter ? 'bg-blue-500/20 text-blue-400' : 'text-gray-400 hover:bg-white/5'}`}
            >
              All
            </button>
            {versionDist.map((row) => (
              <button
                key={row.version}
                onClick={() => setVersionFilter(versionFilter === row.version ? null : row.version)}
                className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1 ${versionFilter === row.version ? 'ring-1' : 'hover:bg-white/5'}`}
                style={{
                  color: VERSION_COLORS[row.version] || VERSION_COLORS.Other,
                  backgroundColor: versionFilter === row.version ? `${VERSION_COLORS[row.version] || VERSION_COLORS.Other}20` : undefined,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VERSION_COLORS[row.version] || VERSION_COLORS.Other }} />
                {row.version} ({row.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedInstance && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="glass rounded-xl p-6 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-semibold text-white">{selectedInstance.instanceName}</h3>
                  <VersionBadge version={selectedInstance.sqlVersion} />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/instances/${selectedInstance.InstanceID}`)}
                    className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 text-xs hover:bg-blue-500/30 transition-colors"
                  >
                    Open Instance
                  </button>
                  <button onClick={() => setSelectedInstance(null)} className="p-1.5 rounded-lg hover:bg-white/10">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                {[
                  { label: 'Edition', value: selectedInstance.editionName },
                  { label: 'Version', value: selectedInstance.productVersionText },
                  { label: 'CPU Cores', value: selectedInstance.cpuCount || '-' },
                  { label: 'RAM', value: selectedInstance.ramGb ? `${selectedInstance.ramGb} GB` : '-' },
                  { label: 'Avg CPU (14d)', value: `${selectedInstance.avgCpu.toFixed(2)}%` },
                  { label: 'Max CPU (14d)', value: `${selectedInstance.maxCpu.toFixed(2)}%` },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="text-xs text-gray-500">{item.label}</div>
                    <div className="text-sm text-white font-medium mt-0.5">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-300">
                  <strong>Recommendation:</strong> This {selectedInstance.editionName || 'SQL Server'} instance with {selectedInstance.cpuCount || '?'} cores has averaged only {selectedInstance.avgCpu.toFixed(2)}% CPU over 14 days.
                  {selectedInstance.maxCpu < 10 && ' Even peak usage stayed below 10% - this server appears completely idle.'}
                  {' '}Consider consolidation, downsizing, or decommissioning after verifying with application owners.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Server className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-gray-500">Underutilized</span>
          </div>
          <div className="text-xl font-bold text-white">{filtered.length}</div>
          <div className="text-xs text-gray-500">{totalInstances > 0 ? Math.round((enriched.length / totalInstances) * 100) : 0}% of {totalInstances} total</div>
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
          <div className="text-xl font-bold text-white">{totalRam >= 1024 ? `${(totalRam / 1024).toFixed(1)} TB` : `${totalRam} GB`}</div>
          <div className="text-xs text-gray-500">allocated to idle servers</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-green-400" />
            <span className="text-xs text-gray-500">Completely Idle</span>
          </div>
          <div className="text-xl font-bold text-white">{idleInstances}</div>
          <div className="text-xs text-gray-500">max CPU &lt;10% in 14 days</div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-2">By SQL Server Version</h2>
          <p className="text-xs text-gray-500 mb-4">Click to filter</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={versionDist}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                innerRadius={45}
                onClick={(entry: DistributionRow) => setVersionFilter(versionFilter === entry.version ? null : entry.version)}
                className="cursor-pointer"
                stroke="none"
              >
                {versionDist.map((row) => (
                  <Cell key={row.version} fill={VERSION_COLORS[row.version] || VERSION_COLORS.Other} opacity={versionFilter && versionFilter !== row.version ? 0.3 : 1} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number | string | undefined) => `${Number(value ?? 0)} instances`}
              />
              <Legend formatter={(value: string) => <span className="text-gray-300 text-sm">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-2">By Edition</h2>
          <p className="text-xs text-gray-500 mb-4">Edition breakdown of underutilized instances</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={editionDist} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} stroke="none">
                {editionDist.map((row, index) => <Cell key={row.name} fill={['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#64748b'][index % 6]} />)}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number | string | undefined) => `${Number(value ?? 0)} instances`}
              />
              <Legend formatter={(value: string) => <span className="text-gray-300 text-sm">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">Average CPU Usage (14 days)</h2>
          <p className="text-xs text-gray-500 mb-4">Bars colored by SQL Server version</p>
          <ResponsiveContainer width="100%" height={Math.max(250, chartData.length * 28)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" domain={[0, 5]} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={180} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number | string | undefined) => `${Number(value ?? 0).toFixed(2)}%`}
              />
              <Bar dataKey="avgCpu" radius={[0, 4, 4, 0]}>
                {chartData.map((row) => <Cell key={row.name} fill={row.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="glass rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm text-gray-300 space-y-1.5">
            <p>Instances shown here averaged <strong className="text-white">&lt;5% CPU</strong> over the past 14 days. Click any row to see details and recommendations.</p>
            <p className="text-gray-400">Consider: <strong className="text-gray-300">Consolidation</strong>, <strong className="text-gray-300">Downsizing</strong>, or <strong className="text-gray-300">Decommissioning</strong>. Always verify with application owners first.</p>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Instance Details</h2>
          <span className="text-xs text-gray-500">{filtered.length} of {enriched.length} shown | Click a row for details</span>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <SortHeader k="instanceName" label="Instance" />
              <SortHeader k="version" label="Version" />
              <SortHeader k="edition" label="Edition" />
              <SortHeader k="cpuCount" label="Cores" />
              <SortHeader k="ramGb" label="RAM" />
              <SortHeader k="avgCpu" label="Avg CPU (14d)" />
              <SortHeader k="maxCpu" label="Max CPU (14d)" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const idle = row.maxCpu < 10;
              const isSelected = selectedInstance?.InstanceID === row.InstanceID;

              return (
                <tr
                  key={row.InstanceID}
                  onClick={() => setSelectedInstance(isSelected ? null : row)}
                  className={`border-b border-white/5 cursor-pointer transition-colors ${isSelected ? 'bg-blue-500/10 ring-1 ring-blue-500/30' : idle ? 'bg-amber-500/5 hover:bg-white/5' : 'hover:bg-white/5'}`}
                >
                  <td className="px-3 py-2.5 text-sm text-gray-200 font-medium">{row.instanceName}</td>
                  <td className="px-3 py-2.5"><VersionBadge version={row.sqlVersion} /></td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{row.editionName}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-300 text-center">{row.cpuCount || '-'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-300">{row.ramGb ? `${row.ramGb} GB` : '-'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-300 font-mono">{row.avgCpu.toFixed(2)}%</td>
                  <td className={`px-3 py-2.5 text-sm font-mono ${idle ? 'text-amber-400' : 'text-gray-300'}`}>{row.maxCpu.toFixed(2)}%{idle && ' !'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            {enriched.length > 0 ? 'No instances match the current filters' : 'No underutilized instances found - great!'}
          </p>
        )}
      </div>
    </motion.div>
  );
}

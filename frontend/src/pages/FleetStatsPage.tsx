import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Server,
  Database,
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
  X,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { api } from '../api/api';
import type { FleetStatsRow } from '../api/types';
import TimeRangeSelector, { hoursLabel } from '../components/TimeRangeSelector';
import { SQL_SERVER_VERSION_COLORS as VERSION_COLORS, sqlServerVersionYear } from '../utils/sqlServerVersions';

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#fff',
};

type SortKey =
  | 'instanceName'
  | 'version'
  | 'edition'
  | 'cpuCount'
  | 'avgCpu24h'
  | 'maxCpu24h'
  | 'ramGb'
  | 'storUsed'
  | 'storTotal'
  | 'storPct';

interface FleetViewRow extends FleetStatsRow {
  instanceName: string;
  editionName: string;
  productVersionText: string;
  sqlVersion: string;
  cpuCount: number;
  ramGb: number;
  avgCpu24h: number;
  maxCpu24h: number;
  totalUsed: number;
  totalCapacity: number;
  storPct: number;
}

interface VersionDistributionRow {
  name: string;
  version: string;
  count: number;
  cores: number;
  ram: number;
}

interface EditionDistributionRow {
  name: string;
  count: number;
}

interface TopMetricRow {
  name: string;
  value: number;
  version: string;
  fill: string;
}

interface VersionGroup {
  version: string;
  instances: FleetViewRow[];
  avgCpu: number;
  totalCores: number;
  totalRam: number;
}

type BucketRow = { name: string } & Record<string, string | number>;

interface BucketDefinition {
  name: string;
  min: number;
  max: number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes >= 1099511627776) return `${(bytes / 1099511627776).toFixed(1)} TB`;
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function buildBucketRows(
  rows: FleetViewRow[],
  versions: string[],
  buckets: BucketDefinition[],
  metric: (row: FleetViewRow) => number,
): BucketRow[] {
  return buckets.map((bucket) => {
    const result: BucketRow = { name: bucket.name };
    versions.forEach((version) => {
      result[`SQL ${version}`] = rows.filter(
        (row) => row.sqlVersion === version && metric(row) >= bucket.min && metric(row) < bucket.max,
      ).length;
    });
    return result;
  });
}

export default function FleetStatsPage() {
  const [data, setData] = useState<FleetStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('avgCpu24h');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');
  const [versionFilter, setVersionFilter] = useState<string | null>(null);
  const [editionFilter, setEditionFilter] = useState<string | null>(null);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.reportsFleetStats(hours)
      .then((rows) => setData(Array.isArray(rows) ? rows : []))
      .finally(() => setLoading(false));
  }, [hours]);

  const enriched = useMemo<FleetViewRow[]>(() => {
    return data.map((row) => {
      const totalCapacity = row.TotalCapacity ?? 0;
      const totalUsed = row.TotalUsed ?? 0;

      return {
        ...row,
        instanceName: row.InstanceName || `Instance ${row.InstanceID}`,
        editionName: row.Edition || 'Unknown',
        productVersionText: row.ProductVersion || '?',
        sqlVersion: sqlServerVersionYear(row.ProductVersion),
        cpuCount: row.cpu_count ?? 0,
        ramGb: row.physical_memory_kb ? Math.round(row.physical_memory_kb / 1048576) : 0,
        avgCpu24h: row.AvgCPU24h ?? 0,
        maxCpu24h: row.MaxCPU24h ?? 0,
        totalUsed,
        totalCapacity,
        storPct: totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0,
      };
    });
  }, [data]);

  const filtered = useMemo(() => {
    return enriched.filter((row) => {
      if (versionFilter && row.sqlVersion !== versionFilter) return false;
      if (editionFilter && !row.editionName.toLowerCase().includes(editionFilter.toLowerCase())) return false;
      if (search && !row.instanceName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [editionFilter, enriched, search, versionFilter]);

  const totalCores = useMemo(() => filtered.reduce((sum, row) => sum + row.cpuCount, 0), [filtered]);
  const totalRam = useMemo(() => filtered.reduce((sum, row) => sum + row.ramGb, 0), [filtered]);
  const totalStorUsed = useMemo(() => filtered.reduce((sum, row) => sum + row.totalUsed, 0), [filtered]);
  const totalStorCap = useMemo(() => filtered.reduce((sum, row) => sum + row.totalCapacity, 0), [filtered]);

  const avgFleetCpu = useMemo(() => {
    const weighted = filtered.reduce((sum, row) => sum + row.avgCpu24h * Math.max(row.cpuCount, 1), 0);
    return totalCores > 0 ? weighted / totalCores : 0;
  }, [filtered, totalCores]);

  const versionDist = useMemo<VersionDistributionRow[]>(() => {
    const map = new Map<string, VersionDistributionRow>();
    enriched.forEach((row) => {
      const existing = map.get(row.sqlVersion) ?? {
        name: `SQL ${row.sqlVersion}`,
        version: row.sqlVersion,
        count: 0,
        cores: 0,
        ram: 0,
      };
      existing.count += 1;
      existing.cores += row.cpuCount;
      existing.ram += row.ramGb;
      map.set(row.sqlVersion, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [enriched]);

  const editionDist = useMemo<EditionDistributionRow[]>(() => {
    const map = new Map<string, number>();
    enriched.forEach((row) => {
      const edition = row.editionName.split(' ')[0] || 'Unknown';
      map.set(edition, (map.get(edition) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [enriched]);

  const versions = useMemo(() => [...new Set(enriched.map((row) => row.sqlVersion))].sort(), [enriched]);

  const cpuBuckets = useMemo<BucketRow[]>(() => {
    const buckets: BucketDefinition[] = [
      { name: '0-5%', min: 0, max: 5 },
      { name: '5-10%', min: 5, max: 10 },
      { name: '10-25%', min: 10, max: 25 },
      { name: '25-50%', min: 25, max: 50 },
      { name: '50-75%', min: 50, max: 75 },
      { name: '75-100%', min: 75, max: 101 },
    ];
    return buildBucketRows(enriched, versions, buckets, (row) => row.avgCpu24h);
  }, [enriched, versions]);

  const ramBuckets = useMemo<BucketRow[]>(() => {
    const buckets: BucketDefinition[] = [
      { name: '<8GB', min: 0, max: 8 },
      { name: '8-16', min: 8, max: 16 },
      { name: '16-32', min: 16, max: 32 },
      { name: '32-64', min: 32, max: 64 },
      { name: '64-128', min: 64, max: 128 },
      { name: '>128', min: 128, max: Number.POSITIVE_INFINITY },
    ];
    return buildBucketRows(enriched, versions, buckets, (row) => row.ramGb);
  }, [enriched, versions]);

  const top10Cpu = useMemo<TopMetricRow[]>(() => {
    return [...filtered]
      .sort((a, b) => b.avgCpu24h - a.avgCpu24h)
      .slice(0, 10)
      .map((row) => ({
        name: row.instanceName,
        value: Math.round(row.avgCpu24h * 100) / 100,
        version: row.sqlVersion,
        fill: VERSION_COLORS[row.sqlVersion] || VERSION_COLORS.Other,
      }));
  }, [filtered]);

  const top10Storage = useMemo<TopMetricRow[]>(() => {
    return [...filtered]
      .filter((row) => row.totalUsed > 0)
      .sort((a, b) => b.totalUsed - a.totalUsed)
      .slice(0, 10)
      .map((row) => ({
        name: row.instanceName,
        value: Math.round(row.totalUsed / 1073741824),
        version: row.sqlVersion,
        fill: VERSION_COLORS[row.sqlVersion] || VERSION_COLORS.Other,
      }));
  }, [filtered]);

  const versionGroups = useMemo<VersionGroup[]>(() => {
    const map = new Map<string, FleetViewRow[]>();
    enriched.forEach((row) => {
      const rows = map.get(row.sqlVersion) ?? [];
      rows.push(row);
      map.set(row.sqlVersion, rows);
    });

    return Array.from(map.entries())
      .map(([version, rows]) => ({
        version,
        instances: [...rows].sort((a, b) => b.avgCpu24h - a.avgCpu24h),
        avgCpu: rows.reduce((sum, row) => sum + row.avgCpu24h, 0) / rows.length,
        totalCores: rows.reduce((sum, row) => sum + row.cpuCount, 0),
        totalRam: rows.reduce((sum, row) => sum + row.ramGb, 0),
      }))
      .sort((a, b) => b.instances.length - a.instances.length);
  }, [enriched]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let left: number | string = a.instanceName;
      let right: number | string = b.instanceName;

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
        case 'avgCpu24h':
          left = a.avgCpu24h;
          right = b.avgCpu24h;
          break;
        case 'maxCpu24h':
          left = a.maxCpu24h;
          right = b.maxCpu24h;
          break;
        case 'ramGb':
          left = a.ramGb;
          right = b.ramGb;
          break;
        case 'storUsed':
          left = a.totalUsed;
          right = b.totalUsed;
          break;
        case 'storTotal':
          left = a.totalCapacity;
          right = b.totalCapacity;
          break;
        case 'storPct':
          left = a.storPct;
          right = b.storPct;
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

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Fleet Statistics</h1>
          <span className="text-sm text-gray-500">{enriched.length} instances</span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search instances..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-48"
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

          <TimeRangeSelector value={hours} onChange={setHours} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Server, label: 'Instances', value: filtered.length.toString(), sub: versionFilter ? `of ${enriched.length}` : undefined, color: 'text-blue-400' },
          { icon: Cpu, label: 'CPU Cores', value: totalCores.toLocaleString(), color: 'text-cyan-400' },
          { icon: Activity, label: `Avg CPU (${hoursLabel(hours)})`, value: `${avgFleetCpu.toFixed(1)}%`, color: avgFleetCpu > 50 ? 'text-red-400' : avgFleetCpu > 25 ? 'text-yellow-400' : 'text-green-400' },
          { icon: MemoryStick, label: 'Total RAM', value: totalRam >= 1024 ? `${(totalRam / 1024).toFixed(1)} TB` : `${totalRam} GB`, color: 'text-purple-400' },
          { icon: HardDrive, label: 'Storage Used', value: formatBytes(totalStorUsed), sub: `of ${formatBytes(totalStorCap)}`, color: 'text-yellow-400' },
          { icon: Database, label: 'Versions', value: versions.length.toString(), sub: 'SQL Server', color: 'text-emerald-400' },
        ].map((card, index) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-gray-500">{card.label}</span>
            </div>
            <div className="text-lg font-bold text-white">{card.value}</div>
            {card.sub && <div className="text-xs text-gray-500">{card.sub}</div>}
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-2">SQL Server Version Distribution</h2>
          <p className="text-xs text-gray-500 mb-4">Click a segment to filter the fleet</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={versionDist}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                onClick={(entry: VersionDistributionRow) => setVersionFilter(versionFilter === entry.version ? null : entry.version)}
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
          <h2 className="text-lg font-semibold text-white mb-2">Edition Distribution</h2>
          <p className="text-xs text-gray-500 mb-4">Click a segment to filter by edition</p>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={editionDist}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                onClick={(entry: EditionDistributionRow) => setEditionFilter(editionFilter === entry.name ? null : entry.name)}
                className="cursor-pointer"
                stroke="none"
              >
                {editionDist.map((row, index) => (
                  <Cell key={row.name} fill={['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#64748b'][index % 6]} opacity={editionFilter && editionFilter !== row.name ? 0.3 : 1} />
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">CPU Usage by Version</h2>
          <p className="text-xs text-gray-500 mb-4">Instance count per CPU bucket, colored by SQL version</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={cpuBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              {versions.map((version) => (
                <Bar key={version} dataKey={`SQL ${version}`} stackId="cpu" fill={VERSION_COLORS[version] || VERSION_COLORS.Other} />
              ))}
              <Legend formatter={(value: string) => <span className="text-gray-300 text-xs">{value}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">RAM by Version</h2>
          <p className="text-xs text-gray-500 mb-4">Instance count per RAM bucket, colored by SQL version</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={ramBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              {versions.map((version) => (
                <Bar key={version} dataKey={`SQL ${version}`} stackId="ram" fill={VERSION_COLORS[version] || VERSION_COLORS.Other} />
              ))}
              <Legend formatter={(value: string) => <span className="text-gray-300 text-xs">{value}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Top 10 CPU Consumers (24h)</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={top10Cpu} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" width={150} stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number | string | undefined) => `${Number(value ?? 0).toFixed(1)}%`}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {top10Cpu.map((row) => <Cell key={row.name} fill={row.fill} />)}
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
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number | string | undefined) => `${Number(value ?? 0)} GB`}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {top10Storage.map((row) => <Cell key={row.name} fill={row.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Version Breakdown</h2>
        <div className="space-y-2">
          {versionGroups.map((group) => (
            <div key={group.version}>
              <button
                onClick={() => setExpandedVersion(expandedVersion === group.version ? null : group.version)}
                className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedVersion === group.version ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  <VersionBadge version={group.version} />
                  <span className="text-sm text-white font-medium">{group.instances.length} instances</span>
                </div>
                <div className="flex items-center gap-6 text-xs text-gray-400">
                  <span>{group.totalCores} cores</span>
                  <span>{group.totalRam} GB RAM</span>
                  <span>Avg CPU: {group.avgCpu.toFixed(1)}%</span>
                </div>
              </button>

              <AnimatePresence>
                {expandedVersion === group.version && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="pl-10 pr-3 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {group.instances.map((row) => (
                        <div
                          key={row.InstanceID}
                          onClick={() => navigate(`/instances/${row.InstanceID}`)}
                          className="p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                        >
                          <div className="text-sm font-medium text-white truncate">{row.instanceName}</div>
                          <div className="text-xs text-gray-400 mt-1">{row.editionName} · v{row.productVersionText}</div>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                            <span>{row.cpuCount} cores</span>
                            <span>{row.ramGb} GB</span>
                            <span>CPU: {row.avgCpu24h.toFixed(1)}%</span>
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

      <div className="glass rounded-xl p-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">All Instances</h2>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            {(versionFilter || editionFilter || search) && (
              <button
                onClick={() => {
                  setVersionFilter(null);
                  setEditionFilter(null);
                  setSearch('');
                }}
                className="text-blue-400 hover:text-blue-300"
              >
                Clear filters
              </button>
            )}
            <span>{filtered.length} of {enriched.length} shown</span>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <SortHeader k="instanceName" label="Instance" />
              <SortHeader k="version" label="Version" />
              <SortHeader k="edition" label="Edition" />
              <SortHeader k="cpuCount" label="Cores" />
              <SortHeader k="avgCpu24h" label="Avg CPU (24h)" />
              <SortHeader k="maxCpu24h" label="Max CPU (24h)" />
              <SortHeader k="ramGb" label="RAM" />
              <SortHeader k="storUsed" label="Storage" />
              <SortHeader k="storPct" label="Stor %" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const storClass = row.storPct > 85 ? 'bg-red-500/10' : row.storPct > 70 ? 'bg-yellow-500/10' : '';
              const cpuClass = row.avgCpu24h > 75 ? 'text-red-400' : row.avgCpu24h > 50 ? 'text-yellow-400' : 'text-gray-300';

              return (
                <tr
                  key={row.InstanceID}
                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  onClick={() => navigate(`/instances/${row.InstanceID}`)}
                >
                  <td className="px-3 py-2 text-sm text-gray-200 font-medium">{row.instanceName}</td>
                  <td className="px-3 py-2"><VersionBadge version={row.sqlVersion} /></td>
                  <td className="px-3 py-2 text-xs text-gray-400">{row.editionName}</td>
                  <td className="px-3 py-2 text-sm text-gray-300 text-center">{row.cpuCount || '-'}</td>
                  <td className={`px-3 py-2 text-sm font-mono ${cpuClass}`}>{row.avgCpu24h.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-sm text-gray-300 font-mono">{row.maxCpu24h.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-sm text-gray-300">{row.ramGb ? `${row.ramGb} GB` : '-'}</td>
                  <td className="px-3 py-2 text-sm text-gray-300">{row.totalUsed ? formatBytes(row.totalUsed) : '-'}</td>
                  <td className={`px-3 py-2 text-sm text-gray-300 ${storClass}`}>{row.totalCapacity ? `${row.storPct}%` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            {enriched.length > 0 ? 'No instances match the current filters' : 'No data available'}
          </p>
        )}
      </div>
    </motion.div>
  );
}

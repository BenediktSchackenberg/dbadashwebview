import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldAlert, ShieldCheck, Clock, Database, HardDrive, Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../api/api';
import type { BackupAmpelDatabaseRow, BackupAmpelInstanceRow } from '../api/types';

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#fff',
};

type AmpelStatus = 'GREEN' | 'YELLOW' | 'RED';
type SortKey = 'instanceName' | 'status' | 'fullAge' | 'logAge' | 'rpo' | 'dbCount' | 'volume';

interface InstanceAmpel extends BackupAmpelInstanceRow {
  instanceName: string;
  editionText: string | null;
  productVersionText: string | null;
  databaseCountNumber: number;
  backupVolumeGb24h: number;
  backedUpDbs24hNumber: number;
  oldFullBackupCount: number;
  oldLogBackupCount: number;
  avgLogIntervalMinValue: number | null;
  maxLogIntervalMinValue: number | null;
  status: AmpelStatus;
  fullAgeHours: number | null;
  logAgeMin: number | null;
  rpoMin: number | null;
}

interface AmpelPieRow {
  name: string;
  status: AmpelStatus;
  value: number;
  color: string;
}

interface RpoBucketRow {
  name: string;
  min: number;
  max: number;
  count: number;
}

interface FullAgeBucketRow {
  name: string;
  max: number;
  count: number;
  color: string;
}

const STATUS_CONFIG: Record<AmpelStatus, { label: string; color: string; bg: string; border: string; text: string; icon: typeof Shield }> = {
  GREEN: { label: 'Gruen', color: '#22c55e', bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: ShieldCheck },
  YELLOW: { label: 'Gelb', color: '#eab308', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: Shield },
  RED: { label: 'Rot', color: '#ef4444', bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: ShieldAlert },
};

function computeAmpel(row: BackupAmpelInstanceRow): InstanceAmpel {
  const now = Date.now();
  const newestFullDate = row.NewestFullBackup ? new Date(row.NewestFullBackup).getTime() : row.LastFullBackup ? new Date(row.LastFullBackup).getTime() : null;
  const newestLogDate = row.NewestLogBackup ? new Date(row.NewestLogBackup).getTime() : row.LastLogBackup ? new Date(row.LastLogBackup).getTime() : null;
  const fullAgeHours = newestFullDate ? (now - newestFullDate) / 3600000 : null;
  const logAgeMin = newestLogDate ? (now - newestLogDate) / 60000 : null;
  const avgLogIntervalMin = row.AvgLogIntervalMin ?? null;
  const oldLogBackupCount = row.DbsWithOldLogBackup ?? 0;
  const oldFullBackupCount = row.DbsWithOldFullBackup ?? 0;
  const hasLogBackups = logAgeMin !== null || oldLogBackupCount > 0;

  let rpoMin: number | null = null;
  if (avgLogIntervalMin != null && logAgeMin != null) rpoMin = Math.max(avgLogIntervalMin, logAgeMin);
  else if (avgLogIntervalMin != null) rpoMin = avgLogIntervalMin;
  else if (logAgeMin != null) rpoMin = logAgeMin;

  let status: AmpelStatus = 'RED';
  if (fullAgeHours !== null) {
    const logOk = !hasLogBackups || (logAgeMin !== null && logAgeMin <= 60);
    const logWarn = !hasLogBackups || (logAgeMin !== null && logAgeMin <= 120);
    if (fullAgeHours <= 24 && logOk) status = 'GREEN';
    else if (fullAgeHours <= 48 && logWarn) status = 'YELLOW';
  }

  return {
    ...row,
    instanceName: row.InstanceName || `Instance ${row.InstanceID}`,
    editionText: row.Edition || null,
    productVersionText: row.ProductVersion || null,
    databaseCountNumber: row.DatabaseCount ?? 0,
    backupVolumeGb24h: row.BackupVolumeGB24h ?? 0,
    backedUpDbs24hNumber: row.BackedUpDBs24h ?? 0,
    oldFullBackupCount,
    oldLogBackupCount,
    avgLogIntervalMinValue: avgLogIntervalMin,
    maxLogIntervalMinValue: row.MaxLogIntervalMin ?? null,
    status,
    fullAgeHours: fullAgeHours !== null ? Math.round(fullAgeHours * 10) / 10 : null,
    logAgeMin: logAgeMin !== null ? Math.round(logAgeMin) : null,
    rpoMin: rpoMin !== null ? Math.round(rpoMin) : null,
  };
}

function formatAge(hours: number | null): string {
  if (hours === null) return 'nie';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)}d`;
}

function parseVersion(productVersion: string | null): string {
  if (!productVersion) return '?';
  const major = parseInt(productVersion, 10);
  if (major >= 16) return '2022';
  if (major >= 15) return '2019';
  if (major >= 14) return '2017';
  if (major >= 13) return '2016';
  if (major >= 12) return '2014';
  return productVersion.split('.')[0];
}

function StatusBadge({ status, size = 'md' }: { status: AmpelStatus; size?: 'sm' | 'md' }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full ${config.bg} border ${config.border} ${config.text} ${size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      {config.label}
    </span>
  );
}

export default function BackupAmpelPage() {
  const [instances, setInstances] = useState<InstanceAmpel[]>([]);
  const [databases, setDatabases] = useState<BackupAmpelDatabaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AmpelStatus | null>(null);
  const [expandedInstance, setExpandedInstance] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.reportsBackupAmpel()
      .then((response) => {
        if (response.error) {
          console.error('Backup Ampel API error:', response.error);
        }
        setInstances((response.instances || []).map(computeAmpel));
        setDatabases(response.databases || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return instances.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (search && !row.instanceName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [instances, search, statusFilter]);

  const statusCounts = useMemo(
    () => ({
      GREEN: instances.filter((row) => row.status === 'GREEN').length,
      YELLOW: instances.filter((row) => row.status === 'YELLOW').length,
      RED: instances.filter((row) => row.status === 'RED').length,
    }),
    [instances],
  );

  const ampelPie = useMemo<AmpelPieRow[]>(
    () => {
      const rows: AmpelPieRow[] = [
        { name: 'Gruen', status: 'GREEN', value: statusCounts.GREEN, color: '#22c55e' },
        { name: 'Gelb', status: 'YELLOW', value: statusCounts.YELLOW, color: '#eab308' },
        { name: 'Rot', status: 'RED', value: statusCounts.RED, color: '#ef4444' },
      ];
      return rows.filter((row) => row.value > 0);
    },
    [statusCounts],
  );

  const totalVolume24h = useMemo(() => instances.reduce((sum, row) => sum + row.backupVolumeGb24h, 0), [instances]);
  const totalDBs = useMemo(() => instances.reduce((sum, row) => sum + row.databaseCountNumber, 0), [instances]);
  const totalBackedUp = useMemo(() => instances.reduce((sum, row) => sum + row.backedUpDbs24hNumber, 0), [instances]);

  const avgRPO = useMemo(() => {
    const validRows = instances.filter((row) => row.rpoMin != null);
    return validRows.length > 0 ? validRows.reduce((sum, row) => sum + (row.rpoMin || 0), 0) / validRows.length : 0;
  }, [instances]);

  const worstRPO = useMemo(() => Math.max(...instances.map((row) => row.rpoMin || 0), 0), [instances]);

  const rpoBuckets = useMemo<RpoBucketRow[]>(() => {
    const buckets: RpoBucketRow[] = [
      { name: '<=15min', min: 0, max: 15, count: 0 },
      { name: '15-30min', min: 15, max: 30, count: 0 },
      { name: '30-60min', min: 30, max: 60, count: 0 },
      { name: '1-4h', min: 60, max: 240, count: 0 },
      { name: '4-24h', min: 240, max: 1440, count: 0 },
      { name: '>24h', min: 1440, max: Number.POSITIVE_INFINITY, count: 0 },
    ];

    instances.forEach((row) => {
      if (row.rpoMin == null) return;
      const bucket = buckets.find((candidate) => row.rpoMin! >= candidate.min && row.rpoMin! < candidate.max) || buckets[buckets.length - 1];
      bucket.count += 1;
    });

    return buckets;
  }, [instances]);

  const fullAgeBuckets = useMemo<FullAgeBucketRow[]>(() => {
    const buckets: FullAgeBucketRow[] = [
      { name: '<=12h', max: 12, count: 0, color: '#22c55e' },
      { name: '12-24h', max: 24, count: 0, color: '#86efac' },
      { name: '24-48h', max: 48, count: 0, color: '#eab308' },
      { name: '48h-7d', max: 168, count: 0, color: '#f97316' },
      { name: '>7d / nie', max: Number.POSITIVE_INFINITY, count: 0, color: '#ef4444' },
    ];

    instances.forEach((row) => {
      const age = row.fullAgeHours ?? Number.POSITIVE_INFINITY;
      const bucket = buckets.find((candidate) => age < candidate.max) || buckets[buckets.length - 1];
      bucket.count += 1;
    });

    return buckets;
  }, [instances]);

  const sorted = useMemo(() => {
    const statusOrder: Record<AmpelStatus, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
    const rows = [...filtered];
    rows.sort((a, b) => {
      let left: string | number = a.instanceName;
      let right: string | number = b.instanceName;

      switch (sortKey) {
        case 'status':
          left = statusOrder[a.status];
          right = statusOrder[b.status];
          break;
        case 'fullAge':
          left = a.fullAgeHours ?? Number.POSITIVE_INFINITY;
          right = b.fullAgeHours ?? Number.POSITIVE_INFINITY;
          break;
        case 'logAge':
          left = a.logAgeMin ?? Number.POSITIVE_INFINITY;
          right = b.logAgeMin ?? Number.POSITIVE_INFINITY;
          break;
        case 'rpo':
          left = a.rpoMin ?? Number.POSITIVE_INFINITY;
          right = b.rpoMin ?? Number.POSITIVE_INFINITY;
          break;
        case 'dbCount':
          left = a.databaseCountNumber;
          right = b.databaseCountNumber;
          break;
        case 'volume':
          left = a.backupVolumeGb24h;
          right = b.backupVolumeGb24h;
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
    setSortAsc(key === 'instanceName');
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white whitespace-nowrap select-none"
      onClick={() => handleSort(k)}
    >
      {label} {sortKey === k ? (sortAsc ? '^' : 'v') : ''}
    </th>
  );

  const instanceDbs = useMemo<BackupAmpelDatabaseRow[]>(() => {
    if (expandedInstance === null) return [];
    return databases.filter((row) => row.InstanceID === expandedInstance);
  }, [databases, expandedInstance]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" /></div>;
  }

  const fleetStatus: AmpelStatus = statusCounts.RED > 0 ? 'RED' : statusCounts.YELLOW > 0 ? 'YELLOW' : 'GREEN';
  const fleetConfig = STATUS_CONFIG[fleetStatus];
  const FleetIcon = fleetConfig.icon;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <FleetIcon className={`w-7 h-7 ${fleetConfig.text}`} />
          <div>
            <h1 className="text-2xl font-bold text-white">Backup Ampel Report</h1>
            <p className="text-xs text-gray-500">AlwaysOn and backup health across the entire fleet</p>
          </div>
          <StatusBadge status={fleetStatus} />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Instanz suchen..."
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
        </div>
      </div>

      <div className="glass rounded-xl p-4 border border-white/5">
        <div className="flex items-center gap-6 text-xs text-gray-400 flex-wrap">
          <span className="text-gray-500">Ampel rules:</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> <strong className="text-green-400">Gruen</strong> Full &lt;=24h &amp; Log &lt;=1h</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> <strong className="text-yellow-400">Gelb</strong> Full &lt;=48h &amp; Log &lt;=2h</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> <strong className="text-red-400">Rot</strong> Everything else / no backups</span>
          <span className="text-gray-500 ml-auto">RPO = max(avg log interval, age of latest log backup)</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(['GREEN', 'YELLOW', 'RED'] as AmpelStatus[]).map((status) => {
          const config = STATUS_CONFIG[status];
          const Icon = config.icon;
          const count = statusCounts[status];
          return (
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              className={`glass rounded-xl p-4 cursor-pointer transition-all ${statusFilter === status ? `ring-2 ${config.bg}` : 'hover:bg-white/5'}`}
              style={statusFilter === status ? { borderColor: config.color } : undefined}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${config.text}`} />
                <span className="text-xs text-gray-500">{config.label}</span>
              </div>
              <div className={`text-2xl font-bold ${config.text}`}>{count}</div>
              <div className="text-xs text-gray-500">{instances.length > 0 ? Math.round((count / instances.length) * 100) : 0}%</div>
            </motion.div>
          );
        })}

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-gray-500">Databases</span>
          </div>
          <div className="text-xl font-bold text-white">{totalBackedUp} <span className="text-sm text-gray-500">/ {totalDBs}</span></div>
          <div className="text-xs text-gray-500">backed up (24h)</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-500">Volume (24h)</span>
          </div>
          <div className="text-xl font-bold text-white">{totalVolume24h >= 1024 ? `${(totalVolume24h / 1024).toFixed(1)} TB` : `${totalVolume24h.toFixed(1)} GB`}</div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-gray-500">RPO (avg / worst)</span>
          </div>
          <div className="text-xl font-bold text-white">
            {Math.round(avgRPO)}min <span className="text-sm text-red-400">/ {worstRPO >= 60 ? `${Math.round(worstRPO / 60)}h` : `${worstRPO}min`}</span>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Ampel Distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={ampelPie}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={40}
                onClick={(entry: AmpelPieRow) => setStatusFilter(statusFilter === entry.status ? null : entry.status)}
                className="cursor-pointer"
                stroke="none"
              >
                {ampelPie.map((row) => <Cell key={row.status} fill={row.color} opacity={statusFilter && statusFilter !== row.status ? 0.3 : 1} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number | string | undefined) => `${Number(value ?? 0)} instances`} />
              <Legend formatter={(value: string) => <span className="text-gray-300 text-sm">{value}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">RPO Distribution</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rpoBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Age of Full Backups</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={fullAgeBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {fullAgeBuckets.map((row) => <Cell key={row.name} fill={row.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass rounded-xl p-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Instance Overview</h2>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {statusFilter && <button onClick={() => setStatusFilter(null)} className="text-blue-400 hover:text-blue-300">Reset filter</button>}
            <span>{filtered.length} of {instances.length} | Click a row for DB details</span>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <SortHeader k="status" label="Status" />
              <SortHeader k="instanceName" label="Instance" />
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Version</th>
              <SortHeader k="dbCount" label="DBs" />
              <SortHeader k="fullAge" label="Latest Full" />
              <SortHeader k="logAge" label="Latest Log" />
              <SortHeader k="rpo" label="RPO" />
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Log avg / max</th>
              <SortHeader k="volume" label="Vol. 24h" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isExpanded = expandedInstance === row.InstanceID;
              return (
                <motion.tr
                  key={row.InstanceID}
                  layout
                  onClick={() => setExpandedInstance(isExpanded ? null : row.InstanceID)}
                  className={`border-b border-white/5 cursor-pointer transition-colors ${isExpanded ? 'bg-white/5' : 'hover:bg-white/5'}`}
                >
                  <td className="px-3 py-2.5"><StatusBadge status={row.status} size="sm" /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                      <span className="text-sm text-white font-medium">{row.instanceName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">
                    {row.editionText ? `${row.editionText.split(' ')[0]} ${parseVersion(row.productVersionText)}` : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-gray-300 text-center">{row.databaseCountNumber}</td>
                  <td className={`px-3 py-2.5 text-sm ${row.fullAgeHours === null ? 'text-red-400' : row.fullAgeHours > 48 ? 'text-red-400' : row.fullAgeHours > 24 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {formatAge(row.fullAgeHours)}
                  </td>
                  <td className={`px-3 py-2.5 text-sm ${row.logAgeMin === null ? (row.oldLogBackupCount > 0 ? 'text-red-400' : 'text-gray-500') : row.logAgeMin > 120 ? 'text-red-400' : row.logAgeMin > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {row.logAgeMin !== null ? `${row.logAgeMin} min` : (row.oldLogBackupCount > 0 ? 'nie' : 'N/A')}
                  </td>
                  <td className={`px-3 py-2.5 text-sm font-mono ${row.rpoMin == null ? 'text-gray-500' : row.rpoMin > 60 ? 'text-red-400' : row.rpoMin > 15 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {row.rpoMin !== null ? (row.rpoMin >= 60 ? `${Math.round(row.rpoMin / 60)}h` : `${row.rpoMin}min`) : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">
                    {row.avgLogIntervalMinValue != null ? `${row.avgLogIntervalMinValue}min` : '-'} / {row.maxLogIntervalMinValue != null ? `${row.maxLogIntervalMinValue}min` : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-gray-300">{row.backupVolumeGb24h.toFixed(1)} GB</td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>

        <AnimatePresence>
          {expandedInstance !== null && instanceDbs.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-2">
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Database Details - {instances.find((row) => row.InstanceID === expandedInstance)?.instanceName}</h3>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/instances/${expandedInstance}`);
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Open instance
                  </button>
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-2 py-2 text-left text-gray-500">Database</th>
                      <th className="px-2 py-2 text-left text-gray-500">AG Role</th>
                      <th className="px-2 py-2 text-left text-gray-500">Recovery</th>
                      <th className="px-2 py-2 text-left text-gray-500">TDE</th>
                      <th className="px-2 py-2 text-left text-gray-500">Latest Full</th>
                      <th className="px-2 py-2 text-left text-gray-500">Latest Diff</th>
                      <th className="px-2 py-2 text-left text-gray-500">Latest Log</th>
                      <th className="px-2 py-2 text-right text-gray-500">Full Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instanceDbs.map((database) => {
                      const isSecondary = database.IsPrimaryReplica === false || database.IsPrimaryReplica === 0;
                      const isInAg = database.IsPrimaryReplica != null;
                      const fullDate = database.LastFullDate ? new Date(database.LastFullDate) : null;
                      const fullAge = fullDate ? (Date.now() - fullDate.getTime()) / 3600000 : null;
                      const logDate = database.LastLogDate ? new Date(database.LastLogDate) : null;
                      const logAge = logDate ? (Date.now() - logDate.getTime()) / 60000 : null;

                      return (
                        <tr key={database.DatabaseID} className={`border-b border-white/5 hover:bg-white/5 ${isSecondary ? 'opacity-60' : ''}`}>
                          <td className="px-2 py-1.5 text-gray-200 font-medium">
                            {database.DatabaseName}
                            {database.AGName && <span className="ml-1.5 text-[10px] text-blue-400/70">({database.AGName})</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            {!isInAg ? <span className="text-gray-600">-</span> : isSecondary ? <span className="text-blue-400 text-xs">Secondary</span> : <span className="text-emerald-400 text-xs">Primary</span>}
                          </td>
                          <td className="px-2 py-1.5 text-gray-400">{database.RecoveryModel || '-'}</td>
                          <td className="px-2 py-1.5">{database.IsEncrypted ? <span className="text-green-400">Yes</span> : <span className="text-gray-600">-</span>}</td>
                          <td className={`px-2 py-1.5 ${isSecondary ? 'text-gray-600' : fullAge === null ? 'text-red-400' : fullAge > 48 ? 'text-red-400' : fullAge > 24 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {isSecondary ? 'via Primary' : fullDate ? fullDate.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nie'}
                          </td>
                          <td className="px-2 py-1.5 text-gray-400">
                            {isSecondary ? '-' : database.LastDiffDate ? new Date(database.LastDiffDate).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td className={`px-2 py-1.5 ${isSecondary ? 'text-gray-600' : logAge === null ? 'text-gray-600' : logAge > 120 ? 'text-red-400' : logAge > 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {isSecondary ? 'via Primary' : logDate ? logDate.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td className="px-2 py-1.5 text-right text-gray-300">
                            {database.FullBackupSize ? `${(database.FullBackupSize / 1073741824).toFixed(1)} GB` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {filtered.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            {instances.length > 0 ? 'No instances match this filter' : 'No data available'}
          </p>
        )}
      </div>
    </motion.div>
  );
}

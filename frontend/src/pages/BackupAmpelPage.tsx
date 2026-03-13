import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldAlert, ShieldCheck, Clock, Database, HardDrive, Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../api/api';

const tooltipStyle = { backgroundColor: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' };

type AmpelStatus = 'GREEN' | 'YELLOW' | 'RED';

interface InstanceAmpel {
  InstanceID: number;
  InstanceName: string;
  Edition: string | null;
  ProductVersion: string | null;
  DatabaseCount: number;
  LastFullBackup: string | null;
  LastDiffBackup: string | null;
  LastLogBackup: string | null;
  BackupVolumeGB24h: number;
  BackedUpDBs24h: number;
  DbsWithOldFullBackup: number;
  DbsWithOldLogBackup: number;
  AvgLogIntervalMin: number | null;
  MaxLogIntervalMin: number | null;
  // computed
  status: AmpelStatus;
  fullAgeHours: number | null;
  logAgeMin: number | null;
  rpoMin: number | null;
}

function computeAmpel(row: any): InstanceAmpel {
  const now = Date.now();
  // Use newest backup dates for status (matches Estate/Backups behavior)
  const fullDate = row.NewestFullBackup ? new Date(row.NewestFullBackup).getTime() :
                   row.LastFullBackup ? new Date(row.LastFullBackup).getTime() : null;
  const logDate = row.NewestLogBackup ? new Date(row.NewestLogBackup).getTime() :
                  row.LastLogBackup ? new Date(row.LastLogBackup).getTime() : null;
  const fullAgeHours = fullDate ? (now - fullDate) / 3600000 : null;
  const logAgeMin = logDate ? (now - logDate) / 60000 : null;
  const avgLog = row.AvgLogIntervalMin;

  // RPO = max(avg log interval, age of last log backup)
  let rpoMin: number | null = null;
  if (avgLog != null && logAgeMin != null) rpoMin = Math.max(avgLog, logAgeMin);
  else if (avgLog != null) rpoMin = avgLog;
  else if (logAgeMin != null) rpoMin = logAgeMin;
  else rpoMin = null; // no log backups (possibly all Simple Recovery)

  // Ampel rules:
  // GREEN: newest full <= 24h AND (newest log <= 15min OR no Full/Bulk-Logged DBs needing logs)
  // YELLOW: newest full <= 48h AND (newest log <= 30min OR no log-needing DBs)
  // RED: everything else
  const hasLogDbs = logDate !== null || (row.DbsWithOldLogBackup != null && row.DbsWithOldLogBackup > 0);
  let status: AmpelStatus = 'RED';
  if (fullAgeHours !== null) {
    const logOk = !hasLogDbs || (logAgeMin !== null && logAgeMin <= 15);
    const logWarn = !hasLogDbs || (logAgeMin !== null && logAgeMin <= 30);
    if (fullAgeHours <= 24 && logOk) status = 'GREEN';
    else if (fullAgeHours <= 48 && logWarn) status = 'YELLOW';
  }

  return {
    ...row,
    status,
    fullAgeHours: fullAgeHours !== null ? Math.round(fullAgeHours * 10) / 10 : null,
    logAgeMin: logAgeMin !== null ? Math.round(logAgeMin) : null,
    rpoMin: rpoMin !== null ? Math.round(rpoMin) : null,
  };
}

const STATUS_CONFIG = {
  GREEN: { label: 'Grün', color: '#22c55e', bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-400', icon: ShieldCheck },
  YELLOW: { label: 'Gelb', color: '#eab308', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', icon: Shield },
  RED: { label: 'Rot', color: '#ef4444', bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', icon: ShieldAlert },
};

function StatusBadge({ status, size = 'md' }: { status: AmpelStatus; size?: 'sm' | 'md' }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full ${cfg.bg} border ${cfg.border} ${cfg.text} ${size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-3 py-1'}`}>
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      {cfg.label}
    </span>
  );
}

function formatAge(hours: number | null): string {
  if (hours === null) return 'nie';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)}d`;
}

function parseVersion(pv: string | null): string {
  if (!pv) return '?';
  const major = parseInt(pv);
  if (major >= 16) return '2022';
  if (major >= 15) return '2019';
  if (major >= 14) return '2017';
  if (major >= 13) return '2016';
  if (major >= 12) return '2014';
  return pv.split('.')[0];
}

type SortKey = 'InstanceName' | 'status' | 'fullAge' | 'logAge' | 'rpo' | 'dbCount' | 'volume';

export default function BackupAmpelPage() {
  const [instances, setInstances] = useState<InstanceAmpel[]>([]);
  const [databases, setDatabases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AmpelStatus | null>(null);
  const [expandedInstance, setExpandedInstance] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.reportsBackupAmpel().then(res => {
      if ((res as any).error) console.error('Backup Ampel API error:', (res as any).error);
      const inst = (res.instances || []).map(computeAmpel);
      setInstances(inst);
      setDatabases(res.databases || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let d = instances;
    if (statusFilter) d = d.filter(r => r.status === statusFilter);
    if (search) d = d.filter(r => r.InstanceName.toLowerCase().includes(search.toLowerCase()));
    return d;
  }, [instances, statusFilter, search]);

  // Ampel summary
  const statusCounts = useMemo(() => ({
    GREEN: instances.filter(r => r.status === 'GREEN').length,
    YELLOW: instances.filter(r => r.status === 'YELLOW').length,
    RED: instances.filter(r => r.status === 'RED').length,
  }), [instances]);

  // Ampel pie
  const ampelPie = useMemo(() => [
    { name: 'Grün', value: statusCounts.GREEN, color: '#22c55e' },
    { name: 'Gelb', value: statusCounts.YELLOW, color: '#eab308' },
    { name: 'Rot', value: statusCounts.RED, color: '#ef4444' },
  ].filter(d => d.value > 0), [statusCounts]);

  // Total KPIs
  const totalVolume24h = useMemo(() => instances.reduce((s, r) => s + (r.BackupVolumeGB24h || 0), 0), [instances]);
  const totalDBs = useMemo(() => instances.reduce((s, r) => s + (r.DatabaseCount || 0), 0), [instances]);
  const totalBackedUp = useMemo(() => instances.reduce((s, r) => s + (r.BackedUpDBs24h || 0), 0), [instances]);
  const avgRPO = useMemo(() => {
    const valid = instances.filter(r => r.rpoMin !== null);
    return valid.length > 0 ? valid.reduce((s, r) => s + (r.rpoMin || 0), 0) / valid.length : 0;
  }, [instances]);
  const worstRPO = useMemo(() => Math.max(...instances.filter(r => r.rpoMin != null).map(r => r.rpoMin!), 0), [instances]);

  // RPO distribution chart
  const rpoBuckets = useMemo(() => {
    const buckets = [
      { name: '≤15min', min: 0, max: 15, count: 0 },
      { name: '15-30min', min: 15, max: 30, count: 0 },
      { name: '30-60min', min: 30, max: 60, count: 0 },
      { name: '1-4h', min: 60, max: 240, count: 0 },
      { name: '4-24h', min: 240, max: 1440, count: 0 },
      { name: '>24h', min: 1440, max: Infinity, count: 0 },
    ];
    instances.forEach(r => {
      if (r.rpoMin == null) return; // skip instances with no log-needing DBs
      const rpo = r.rpoMin;
      const b = buckets.find(b => rpo >= b.min && rpo < b.max) || buckets[buckets.length - 1];
      b.count++;
    });
    return buckets;
  }, [instances]);

  // Full backup age distribution
  const fullAgeBuckets = useMemo(() => {
    const buckets = [
      { name: '≤12h', max: 12, count: 0, color: '#22c55e' },
      { name: '12-24h', max: 24, count: 0, color: '#86efac' },
      { name: '24-48h', max: 48, count: 0, color: '#eab308' },
      { name: '48h-7d', max: 168, count: 0, color: '#f97316' },
      { name: '>7d / nie', max: Infinity, count: 0, color: '#ef4444' },
    ];
    instances.forEach(r => {
      const age = r.fullAgeHours ?? 99999;
      const b = buckets.find(b => age < b.max) || buckets[buckets.length - 1];
      b.count++;
    });
    return buckets;
  }, [instances]);

  // Sorted
  const sorted = useMemo(() => {
    const statusOrder = { RED: 0, YELLOW: 1, GREEN: 2 };
    return [...filtered].sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === 'status') { av = statusOrder[a.status]; bv = statusOrder[b.status]; }
      else if (sortKey === 'fullAge') { av = a.fullAgeHours ?? 99999; bv = b.fullAgeHours ?? 99999; }
      else if (sortKey === 'logAge') { av = a.logAgeMin ?? 99999; bv = b.logAgeMin ?? 99999; }
      else if (sortKey === 'rpo') { av = a.rpoMin ?? 99999; bv = b.rpoMin ?? 99999; }
      else if (sortKey === 'dbCount') { av = a.DatabaseCount; bv = b.DatabaseCount; }
      else if (sortKey === 'volume') { av = a.BackupVolumeGB24h; bv = b.BackupVolumeGB24h; }
      else { av = a.InstanceName; bv = b.InstanceName; }
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortAsc ? av - bv : bv - av;
    });
  }, [filtered, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === 'InstanceName'); }
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider cursor-pointer hover:text-white whitespace-nowrap select-none" onClick={() => handleSort(k)}>
      {label} {sortKey === k ? (sortAsc ? '▲' : '▼') : ''}
    </th>
  );

  const instanceDbs = useMemo(() => {
    if (expandedInstance === null) return [];
    return databases.filter(d => d.InstanceID === expandedInstance);
  }, [databases, expandedInstance]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" /></div>;

  // Overall fleet status
  const fleetStatus: AmpelStatus = statusCounts.RED > 0 ? 'RED' : statusCounts.YELLOW > 0 ? 'YELLOW' : 'GREEN';
  const fleetCfg = STATUS_CONFIG[fleetStatus];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <fleetCfg.icon className={`w-7 h-7 ${fleetCfg.text}`} />
          <div>
            <h1 className="text-2xl font-bold text-white">Backup Ampel Report</h1>
            <p className="text-xs text-gray-500">AlwaysOn & Backup-Health über die gesamte Fleet</p>
          </div>
          <StatusBadge status={fleetStatus} />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Instanz suchen..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-48"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-gray-500" /></button>}
          </div>
        </div>
      </div>

      {/* Ampel rules info */}
      <div className="glass rounded-xl p-4 border border-white/5">
        <div className="flex items-center gap-6 text-xs text-gray-400 flex-wrap">
          <span className="text-gray-500">Ampel-Regeln:</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500" /> <strong className="text-green-400">Grün</strong> Full ≤24h & Log ≤15min</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> <strong className="text-yellow-400">Gelb</strong> Full ≤48h & Log ≤30min</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> <strong className="text-red-400">Rot</strong> Alles andere / keine Backups</span>
          <span className="text-gray-500 ml-auto">RPO = max(Ø Log-Intervall, Alter letztes Log-Backup)</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Ampel status cards */}
        {(['GREEN', 'YELLOW', 'RED'] as AmpelStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s];
          const count = statusCounts[s];
          const Icon = cfg.icon;
          return (
            <motion.div key={s} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
              className={`glass rounded-xl p-4 cursor-pointer transition-all ${statusFilter === s ? `ring-2 ${cfg.bg}` : 'hover:bg-white/5'}`}
              style={statusFilter === s ? { borderColor: cfg.color } as React.CSSProperties : undefined}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${cfg.text}`} />
                <span className="text-xs text-gray-500">{cfg.label}</span>
              </div>
              <div className={`text-2xl font-bold ${cfg.text}`}>{count}</div>
              <div className="text-xs text-gray-500">{instances.length > 0 ? Math.round(count / instances.length * 100) : 0}%</div>
            </motion.div>
          );
        })}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-gray-500">Datenbanken</span>
          </div>
          <div className="text-xl font-bold text-white">{totalBackedUp} <span className="text-sm text-gray-500">/ {totalDBs}</span></div>
          <div className="text-xs text-gray-500">gesichert (24h)</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-500">Volumen (24h)</span>
          </div>
          <div className="text-xl font-bold text-white">{totalVolume24h >= 1024 ? (totalVolume24h / 1024).toFixed(1) + ' TB' : totalVolume24h.toFixed(1) + ' GB'}</div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-cyan-400" />
            <span className="text-xs text-gray-500">RPO (Ø / Worst)</span>
          </div>
          <div className="text-xl font-bold text-white">{Math.round(avgRPO)}min <span className="text-sm text-red-400">/ {worstRPO >= 60 ? Math.round(worstRPO / 60) + 'h' : worstRPO + 'min'}</span></div>
        </motion.div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ampel Pie */}
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Ampel-Verteilung</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={ampelPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                onClick={(d: any) => {
                  const map: Record<string, AmpelStatus> = { 'Grün': 'GREEN', 'Gelb': 'YELLOW', 'Rot': 'RED' };
                  const s = map[d.name];
                  setStatusFilter(statusFilter === s ? null : s);
                }}
                className="cursor-pointer" stroke="none"
              >
                {ampelPie.map((d, i) => <Cell key={i} fill={d.color} opacity={statusFilter && STATUS_CONFIG[statusFilter].label !== d.name ? 0.3 : 1} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v} Instanzen`, '']} />
              <Legend formatter={(v: any) => <span className="text-gray-300 text-sm">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* RPO Distribution */}
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">RPO-Verteilung</h2>
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

        {/* Full Backup Age */}
        <div className="glass rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Alter Full-Backups</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={fullAgeBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#374151" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis stroke="#374151" tick={{ fill: '#6b7280', fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {fullAgeBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Instance Table */}
      <div className="glass rounded-xl p-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Instanz-Übersicht</h2>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {statusFilter && <button onClick={() => setStatusFilter(null)} className="text-blue-400 hover:text-blue-300">Filter aufheben</button>}
            <span>{filtered.length} von {instances.length} · Klick auf Zeile für DB-Details</span>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <SortHeader k="status" label="Status" />
              <SortHeader k="InstanceName" label="Instanz" />
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Version</th>
              <SortHeader k="dbCount" label="DBs" />
              <SortHeader k="fullAge" label="Letzte Full" />
              <SortHeader k="logAge" label="Letzte Log" />
              <SortHeader k="rpo" label="RPO" />
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Log Ø / Max</th>
              <SortHeader k="volume" label="Vol. 24h" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isExpanded = expandedInstance === r.InstanceID;
              
              return (
                <motion.tr key={r.InstanceID} layout
                  onClick={() => setExpandedInstance(isExpanded ? null : r.InstanceID)}
                  className={`border-b border-white/5 cursor-pointer transition-colors ${isExpanded ? 'bg-white/5' : 'hover:bg-white/5'}`}
                >
                  <td className="px-3 py-2.5"><StatusBadge status={r.status} size="sm" /></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                      <span className="text-sm text-white font-medium">{r.InstanceName}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400">{r.Edition ? `${r.Edition.split(' ')[0]} ${parseVersion(r.ProductVersion)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-300 text-center">{r.DatabaseCount}</td>
                  <td className={`px-3 py-2.5 text-sm ${r.fullAgeHours === null ? 'text-red-400' : r.fullAgeHours > 48 ? 'text-red-400' : r.fullAgeHours > 24 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {formatAge(r.fullAgeHours)}
                  </td>
                  <td className={`px-3 py-2.5 text-sm ${r.logAgeMin === null ? (r.DbsWithOldLogBackup > 0 ? 'text-red-400' : 'text-gray-500') : r.logAgeMin > 30 ? 'text-red-400' : r.logAgeMin > 15 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {r.logAgeMin !== null ? `${r.logAgeMin} min` : (r.DbsWithOldLogBackup > 0 ? 'nie' : 'N/A')}
                  </td>
                  <td className={`px-3 py-2.5 text-sm font-mono ${r.rpoMin == null ? 'text-gray-500' : r.rpoMin > 60 ? 'text-red-400' : r.rpoMin > 15 ? 'text-yellow-400' : 'text-green-400'}`}>
                    {r.rpoMin !== null ? (r.rpoMin >= 60 ? `${Math.round(r.rpoMin / 60)}h` : `${r.rpoMin}min`) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-gray-400 font-mono">
                    {r.AvgLogIntervalMin != null ? `${r.AvgLogIntervalMin}min` : '—'} / {r.MaxLogIntervalMin != null ? `${r.MaxLogIntervalMin}min` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-gray-300">{(r.BackupVolumeGB24h || 0).toFixed(1)} GB</td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>

        {/* Expanded database details */}
        <AnimatePresence>
          {expandedInstance !== null && instanceDbs.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mt-2">
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">Datenbank-Details — {instances.find(i => i.InstanceID === expandedInstance)?.InstanceName}</h3>
                  <button onClick={(e) => { e.stopPropagation(); navigate(`/instances/${expandedInstance}`); }}
                    className="text-xs text-blue-400 hover:text-blue-300">Instanz öffnen →</button>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-2 py-2 text-left text-gray-500">Datenbank</th>
                      <th className="px-2 py-2 text-left text-gray-500">AG Rolle</th>
                      <th className="px-2 py-2 text-left text-gray-500">Recovery</th>
                      <th className="px-2 py-2 text-left text-gray-500">TDE</th>
                      <th className="px-2 py-2 text-left text-gray-500">Letzte Full</th>
                      <th className="px-2 py-2 text-left text-gray-500">Letzte Diff</th>
                      <th className="px-2 py-2 text-left text-gray-500">Letzte Log</th>
                      <th className="px-2 py-2 text-right text-gray-500">Full Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instanceDbs.map((db, i) => {
                      const isSecondary = db.IsPrimaryReplica === false || db.IsPrimaryReplica === 0;
                      const isInAG = db.IsPrimaryReplica != null;
                      const fullDate = db.LastFullDate ? new Date(db.LastFullDate) : null;
                      const fullAge = fullDate ? (Date.now() - fullDate.getTime()) / 3600000 : null;
                      const logDate = db.LastLogDate ? new Date(db.LastLogDate) : null;
                      const logAge = logDate ? (Date.now() - logDate.getTime()) / 60000 : null;
                      return (
                        <tr key={i} className={`border-b border-white/5 hover:bg-white/5 ${isSecondary ? 'opacity-60' : ''}`}>
                          <td className="px-2 py-1.5 text-gray-200 font-medium">
                            {db.DatabaseName}
                            {db.AGName && <span className="ml-1.5 text-[10px] text-blue-400/70">({db.AGName})</span>}
                          </td>
                          <td className="px-2 py-1.5">
                            {!isInAG ? <span className="text-gray-600">—</span> :
                             isSecondary ? <span className="text-blue-400 text-xs">Secondary</span> :
                             <span className="text-emerald-400 text-xs">Primary</span>}
                          </td>
                          <td className="px-2 py-1.5 text-gray-400">{db.RecoveryModel || '—'}</td>
                          <td className="px-2 py-1.5">{db.IsEncrypted ? <span className="text-green-400">✓</span> : <span className="text-gray-600">—</span>}</td>
                          <td className={`px-2 py-1.5 ${isSecondary ? 'text-gray-600' : fullAge === null ? 'text-red-400' : fullAge > 48 ? 'text-red-400' : fullAge > 24 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {isSecondary ? 'via Primary' : fullDate ? fullDate.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'nie'}
                          </td>
                          <td className="px-2 py-1.5 text-gray-400">
                            {isSecondary ? '—' : db.LastDiffDate ? new Date(db.LastDiffDate).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className={`px-2 py-1.5 ${isSecondary ? 'text-gray-600' : logAge === null ? 'text-gray-600' : logAge > 30 ? 'text-red-400' : logAge > 15 ? 'text-yellow-400' : 'text-green-400'}`}>
                            {isSecondary ? 'via Primary' : logDate ? logDate.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right text-gray-300">
                            {db.FullBackupSize ? `${(db.FullBackupSize / 1073741824).toFixed(1)} GB` : '—'}
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

        {filtered.length === 0 && <p className="text-center text-gray-500 py-8">{instances.length > 0 ? 'Keine Instanzen passen zum Filter' : 'Keine Daten verfügbar'}</p>}
      </div>
    </motion.div>
  );
}

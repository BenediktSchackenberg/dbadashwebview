import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/api';
import { useRefresh } from '../App';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, HardDrive, Timer, ChevronRight, Database, Server, Shield, Loader2 } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────

function estimateRecoveryMinutes(backupSizeBytes: number | null, durationSec: number | null): number {
  if (durationSec && durationSec > 0) return (durationSec * 1.5) / 60;
  if (backupSizeBytes && backupSizeBytes > 0) return backupSizeBytes / 1073741824;
  return 0;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '\u2014';
  if (bytes >= 1099511627776) return `${(bytes / 1099511627776).toFixed(1)} TB`;
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function timeSince(dateStr: string | null): { text: string; hours: number | null } {
  if (!dateStr) return { text: 'No Backup', hours: null };
  const h = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  if (h < 1) return { text: `${Math.round(h * 60)}min ago`, hours: h };
  if (h < 24) return { text: `${Math.round(h)}h ago`, hours: h };
  if (h < 48) return { text: `${Math.round(h)}h ago`, hours: h };
  return { text: `${Math.floor(h / 24)}d ago`, hours: h };
}

function backupBadgeCls(hours: number | null): string {
  if (hours == null) return 'text-gray-500 bg-gray-500/10';
  if (hours < 24) return 'text-emerald-400 bg-emerald-500/10';
  if (hours < 48) return 'text-yellow-400 bg-yellow-500/10';
  return 'text-red-400 bg-red-500/10';
}

function getRpo(newestHours: number | null): { label: string; color: string } {
  if (newestHours == null) return { label: 'Critical', color: 'text-red-400' };
  if (newestHours < 1) return { label: 'Excellent', color: 'text-emerald-400' };
  if (newestHours < 4) return { label: 'Good', color: 'text-blue-400' };
  if (newestHours < 24) return { label: 'OK', color: 'text-green-400' };
  if (newestHours < 48) return { label: 'Warning', color: 'text-yellow-400' };
  return { label: 'Critical', color: 'text-red-400' };
}

function cpuBadgeCls(cpu: number): string {
  if (cpu > 50) return 'bg-red-500/20 text-red-400';
  if (cpu > 25) return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-emerald-500/20 text-emerald-400';
}

// ── Types ────────────────────────────────────────────────────────────────

interface DbEntry {
  databaseId: number;
  databaseName: string;
  fullBackup: { date: string | null; size: number; duration: number } | null;
  diffBackup: { date: string | null } | null;
  logBackup: { date: string | null } | null;
  recoveryMinutes: number;
  rpoLabel: string;
  rpoColor: string;
}

interface InstanceGroup {
  instanceId: number;
  instanceName: string;
  edition: string;
  avgCpu: number;
  databases: DbEntry[];
  totalSize: number;
  rpoOk: number;
  rpoWarning: number;
  rpoCritical: number;
}

// ── Component ────────────────────────────────────────────────────────────

export default function EstateBackupsPage() {
  const { lastRefresh } = useRefresh();
  const [raw, setRaw] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    api.backupsManagement()
      .then(d => setRaw(d))
      .catch(() => setRaw(null))
      .finally(() => setLoading(false));
  }, [lastRefresh]);

  const { instances, stats, maxRecoveryDb, avgRecoveryMin, rpoGapCount } = useMemo(() => {
    if (!raw || !raw.backups) return { instances: [] as InstanceGroup[], stats: null, maxRecoveryDb: null as any, avgRecoveryMin: 0, rpoGapCount: 0 };

    const cpuMap = new Map<number, number>();
    (raw.cpuByInstance || []).forEach((c: any) => cpuMap.set(c.instanceId, c.avgCpu24h));

    // Group by instance+database
    const instMap = new Map<number, { name: string; edition: string; dbMap: Map<number, any> }>();
    for (const b of raw.backups) {
      if (!instMap.has(b.instanceId)) {
        instMap.set(b.instanceId, { name: b.instanceName, edition: b.edition || '', dbMap: new Map() });
      }
      const inst = instMap.get(b.instanceId)!;
      if (b.databaseId == null) continue;
      if (!inst.dbMap.has(b.databaseId)) {
        inst.dbMap.set(b.databaseId, { databaseName: b.databaseName, full: null, diff: null, log: null });
      }
      const db = inst.dbMap.get(b.databaseId)!;
      const type = (b.type || '').trim();
      if (type === 'D') db.full = { date: b.backupStartDate, size: b.backupSize || 0, duration: b.backupDurationSec || 0 };
      else if (type === 'I') db.diff = { date: b.backupStartDate };
      else if (type === 'L') db.log = { date: b.backupStartDate };
    }

    let maxRecovery = 0;
    let maxRecoveryDb: any = null;
    let totalRecovery = 0;
    let dbCount = 0;
    let rpoGapCount = 0;

    const instances: InstanceGroup[] = [];
    for (const [instId, inst] of instMap) {
      const databases: DbEntry[] = [];
      let totalSize = 0;
      let rpoOk = 0, rpoWarning = 0, rpoCritical = 0;

      for (const [dbId, db] of inst.dbMap) {
        const fullH = timeSince(db.full?.date).hours;
        const diffH = timeSince(db.diff?.date).hours;
        const logH = timeSince(db.log?.date).hours;
        const newestH = [fullH, diffH, logH].filter(h => h != null).reduce((a, b) => Math.min(a!, b!), Infinity as number | null);
        const rpo = getRpo(newestH === Infinity ? null : newestH);
        const recoveryMin = estimateRecoveryMinutes(db.full?.size || null, db.full?.duration || null);
        const size = db.full?.size || 0;
        totalSize += size;

        if (fullH != null && fullH < 24) rpoOk++;
        else if (fullH != null && fullH < 48) rpoWarning++;
        else rpoCritical++;

        if (newestH != null && newestH !== Infinity && newestH >= 24) rpoGapCount++;

        if (recoveryMin > maxRecovery) {
          maxRecovery = recoveryMin;
          maxRecoveryDb = { name: db.databaseName, size, instanceName: inst.name };
        }
        totalRecovery += recoveryMin;
        dbCount++;

        databases.push({
          databaseId: dbId,
          databaseName: db.databaseName,
          fullBackup: db.full,
          diffBackup: db.diff,
          logBackup: db.log,
          recoveryMinutes: recoveryMin,
          rpoLabel: rpo.label,
          rpoColor: rpo.color,
        });
      }

      instances.push({
        instanceId: instId,
        instanceName: inst.name,
        edition: inst.edition,
        avgCpu: cpuMap.get(instId) || 0,
        databases,
        totalSize,
        rpoOk,
        rpoWarning,
        rpoCritical,
      });
    }

    // Sort by CPU descending
    instances.sort((a, b) => b.avgCpu - a.avgCpu);

    return {
      instances,
      stats: raw.stats,
      maxRecoveryDb: maxRecoveryDb ? { ...maxRecoveryDb, minutes: maxRecovery } : null,
      avgRecoveryMin: dbCount > 0 ? totalRecovery / dbCount : 0,
      rpoGapCount,
    };
  }, [raw]);

  const toggle = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) return (
    <div className="glass rounded-xl p-12 flex flex-col items-center justify-center gap-4">
      <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
      <p className="text-gray-300 text-lg">Loading backup management overview...</p>
    </div>
  );

  const avgRecoverySec = stats?.avgDurationSec24h || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Backup & Recovery Overview</h1>
          <p className="text-sm text-gray-400 mt-1">Management view — sorted by CPU load (highest first)</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <div className="text-2xl font-bold text-white">{stats?.backupCount24h?.toLocaleString() || 0}</div>
              <div className="text-xs text-gray-400">Backups (24h)</div>
            </div>
          </div>
          <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-purple-400 shrink-0" />
            <div>
              <div className="text-2xl font-bold text-white">{formatBytes(Number(stats?.totalSize24h) || 0)}</div>
              <div className="text-xs text-gray-400">Total Backup Size</div>
            </div>
          </div>
          <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <Timer className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-2xl font-bold text-white">
                {avgRecoverySec > 0 ? `${Math.floor(avgRecoverySec / 60)}m ${avgRecoverySec % 60}s` : '\u2014'}
              </div>
              <div className="text-xs text-gray-400">Avg Recovery Time</div>
            </div>
          </div>
        </div>
      </div>

      {/* Instance Accordion */}
      <div className="space-y-3">
        {instances.map(inst => {
          const isOpen = expanded.has(inst.instanceId);
          return (
            <div key={inst.instanceId} className="glass rounded-xl overflow-hidden">
              {/* Collapsed row */}
              <button
                onClick={() => toggle(inst.instanceId)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 transition-all text-left"
              >
                <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </motion.div>
                <Server className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="font-medium text-white min-w-[180px]">{inst.instanceName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cpuBadgeCls(inst.avgCpu)}`}>
                  CPU: {inst.avgCpu.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-400">DBs: {inst.databases.length}</span>
                <span className="text-xs text-gray-400">Total Size: {formatBytes(inst.totalSize)}</span>
                <span className="text-xs text-gray-400 flex items-center gap-2 ml-auto">
                  RPO Status:
                  {inst.rpoOk > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> {inst.rpoOk} OK</span>}
                  {inst.rpoWarning > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> {inst.rpoWarning} Warning</span>}
                  {inst.rpoCritical > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> {inst.rpoCritical} Critical</span>}
                </span>
              </button>

              {/* Expanded table */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-800/50">
                          <th className="py-2 px-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">Database</th>
                          <th className="py-2 px-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">Full Backup</th>
                          <th className="py-2 px-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">Diff Backup</th>
                          <th className="py-2 px-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">Log Backup</th>
                          <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Size</th>
                          <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Recovery Time</th>
                          <th className="py-2 px-4 text-center text-xs font-semibold uppercase tracking-wider text-gray-400">RPO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {inst.databases.map(db => {
                          const fullTs = timeSince(db.fullBackup?.date || null);
                          const diffTs = timeSince(db.diffBackup?.date || null);
                          const logTs = timeSince(db.logBackup?.date || null);
                          return (
                            <tr key={db.databaseId} className="hover:bg-white/5 transition-colors">
                              <td className="py-2 px-4 text-gray-300 flex items-center gap-2">
                                <Database className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                {db.databaseName}
                              </td>
                              {[fullTs, diffTs, logTs].map((ts, i) => (
                                <td key={i} className="py-2 px-4 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${backupBadgeCls(ts.hours)}`}>
                                    {ts.text}
                                  </span>
                                </td>
                              ))}
                              <td className="py-2 px-4 text-right text-gray-300">
                                {db.fullBackup?.size ? formatBytes(db.fullBackup.size) : '\u2014'}
                              </td>
                              <td className="py-2 px-4 text-right text-gray-300">
                                {db.recoveryMinutes > 0 ? formatDuration(db.recoveryMinutes) : '\u2014'}
                              </td>
                              <td className="py-2 px-4 text-center">
                                <span className={`text-xs font-medium ${db.rpoColor}`}>{db.rpoLabel}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {instances.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-8">No backup data available.</p>
      )}

      {/* Management Summary */}
      {instances.length > 0 && (
        <div className="glass rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Recovery Impact Assessment</h3>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">
            Based on current backup sizes and durations, the estimated maximum recovery time across all databases is{' '}
            <span className="font-bold text-white">{formatDuration(maxRecoveryDb?.minutes || 0)}</span>
            {maxRecoveryDb && (
              <> (for the largest database: {maxRecoveryDb.name}, {formatBytes(maxRecoveryDb.size)} on {maxRecoveryDb.instanceName})</>
            )}.
            The average recovery time is <span className="font-bold text-white">{formatDuration(avgRecoveryMin)}</span>.
            {rpoGapCount > 0 ? (
              <> <span className="font-bold text-yellow-400">{rpoGapCount}</span> database{rpoGapCount !== 1 ? 's have' : ' has'} RPO gaps exceeding 24 hours and should be reviewed.</>
            ) : (
              <> All databases have backups within the last 24 hours.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

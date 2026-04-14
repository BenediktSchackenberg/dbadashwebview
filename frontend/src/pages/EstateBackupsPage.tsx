import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import type { BackupManagementBackupRow, BackupManagementResponse, BackupManagementStats } from '../api/types';
import { useRefresh } from '../App';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, HardDrive, Timer, ChevronRight, Database, Server, Shield, Loader2 } from 'lucide-react';

interface BackupPoint {
  date: string | null;
}

interface FullBackupPoint extends BackupPoint {
  size: number;
  duration: number;
}

interface DbAccumulator {
  databaseName: string;
  full: FullBackupPoint | null;
  diff: BackupPoint | null;
  log: BackupPoint | null;
}

interface DbEntry {
  databaseId: number;
  databaseName: string;
  fullBackup: FullBackupPoint | null;
  diffBackup: BackupPoint | null;
  logBackup: BackupPoint | null;
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

interface RecoverySummary {
  name: string;
  size: number;
  instanceName: string;
  minutes: number;
}

const EMPTY_STATS: BackupManagementStats = {
  backupCount24h: 0,
  totalSize24h: 0,
  avgDurationSec24h: 0,
};

function estimateRecoveryMinutes(backupSizeBytes: number | null, durationSec: number | null): number {
  if (durationSec && durationSec > 0) return (durationSec * 1.5) / 60;
  if (backupSizeBytes && backupSizeBytes > 0) return backupSizeBytes / 1073741824;
  return 0;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '-';
  if (bytes >= 1099511627776) return `${(bytes / 1099511627776).toFixed(1)} TB`;
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function timeSince(dateStr: string | null): { text: string; hours: number | null } {
  if (!dateStr) return { text: 'No Backup', hours: null };
  const hours = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  if (hours < 1) return { text: `${Math.round(hours * 60)}min ago`, hours };
  if (hours < 48) return { text: `${Math.round(hours)}h ago`, hours };
  return { text: `${Math.floor(hours / 24)}d ago`, hours };
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

function applyBackup(accumulator: DbAccumulator, backup: BackupManagementBackupRow) {
  const backupDate = backup.backupStartDate || null;
  const type = (backup.type || '').trim();

  if (type === 'D') {
    accumulator.full = {
      date: backupDate,
      size: backup.backupSize ?? 0,
      duration: backup.backupDurationSec ?? 0,
    };
    return;
  }

  if (type === 'I') {
    accumulator.diff = { date: backupDate };
    return;
  }

  if (type === 'L') {
    accumulator.log = { date: backupDate };
  }
}

export default function EstateBackupsPage() {
  const { lastRefresh } = useRefresh();
  const [raw, setRaw] = useState<BackupManagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    api.backupsManagement()
      .then((response) => setRaw(response))
      .catch(() => setRaw(null))
      .finally(() => setLoading(false));
  }, [lastRefresh]);

  const { instances, stats, maxRecoveryDb, avgRecoveryMin, rpoGapCount } = useMemo(() => {
    if (!raw || !raw.backups) {
      return {
        instances: [] as InstanceGroup[],
        stats: EMPTY_STATS,
        maxRecoveryDb: null as RecoverySummary | null,
        avgRecoveryMin: 0,
        rpoGapCount: 0,
      };
    }

    const cpuMap = new Map<number, number>();
    raw.cpuByInstance.forEach((row) => cpuMap.set(row.instanceId, row.avgCpu24h));

    const instanceMap = new Map<number, { name: string; edition: string; dbMap: Map<number, DbAccumulator> }>();
    raw.backups.forEach((backup) => {
      if (!instanceMap.has(backup.instanceId)) {
        instanceMap.set(backup.instanceId, {
          name: backup.instanceName || `Instance ${backup.instanceId}`,
          edition: backup.edition || '',
          dbMap: new Map<number, DbAccumulator>(),
        });
      }

      if (backup.databaseId == null) return;

      const instance = instanceMap.get(backup.instanceId)!;
      if (!instance.dbMap.has(backup.databaseId)) {
        instance.dbMap.set(backup.databaseId, {
          databaseName: backup.databaseName || `Database ${backup.databaseId}`,
          full: null,
          diff: null,
          log: null,
        });
      }

      applyBackup(instance.dbMap.get(backup.databaseId)!, backup);
    });

    let maxRecovery = 0;
    let maxRecoveryRow: RecoverySummary | null = null;
    let totalRecovery = 0;
    let databaseCount = 0;
    let gapCount = 0;

    const groupedInstances: InstanceGroup[] = [];

    instanceMap.forEach((instance, instanceId) => {
      const databases: DbEntry[] = [];
      let totalSize = 0;
      let rpoOk = 0;
      let rpoWarning = 0;
      let rpoCritical = 0;

      instance.dbMap.forEach((database, databaseId) => {
        const fullHours = timeSince(database.full?.date || null).hours;
        const diffHours = timeSince(database.diff?.date || null).hours;
        const logHours = timeSince(database.log?.date || null).hours;
        const existing = [fullHours, diffHours, logHours].filter((value): value is number => value != null);
        const newestHours = existing.length > 0 ? Math.min(...existing) : null;
        const rpo = getRpo(newestHours);
        const recoveryMinutes = estimateRecoveryMinutes(database.full?.size || null, database.full?.duration || null);
        const size = database.full?.size || 0;

        totalSize += size;
        if (fullHours != null && fullHours < 24) rpoOk += 1;
        else if (fullHours != null && fullHours < 48) rpoWarning += 1;
        else rpoCritical += 1;

        if (newestHours != null && newestHours >= 24) gapCount += 1;

        if (recoveryMinutes > maxRecovery) {
          maxRecovery = recoveryMinutes;
          maxRecoveryRow = {
            name: database.databaseName,
            size,
            instanceName: instance.name,
            minutes: recoveryMinutes,
          };
        }

        totalRecovery += recoveryMinutes;
        databaseCount += 1;

        databases.push({
          databaseId,
          databaseName: database.databaseName,
          fullBackup: database.full,
          diffBackup: database.diff,
          logBackup: database.log,
          recoveryMinutes,
          rpoLabel: rpo.label,
          rpoColor: rpo.color,
        });
      });

      groupedInstances.push({
        instanceId,
        instanceName: instance.name,
        edition: instance.edition,
        avgCpu: cpuMap.get(instanceId) || 0,
        databases,
        totalSize,
        rpoOk,
        rpoWarning,
        rpoCritical,
      });
    });

    groupedInstances.sort((a, b) => b.avgCpu - a.avgCpu);

    return {
      instances: groupedInstances,
      stats: raw.stats || EMPTY_STATS,
      maxRecoveryDb: maxRecoveryRow,
      avgRecoveryMin: databaseCount > 0 ? totalRecovery / databaseCount : 0,
      rpoGapCount: gapCount,
    };
  }, [raw]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="glass rounded-xl p-12 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
        <p className="text-gray-300 text-lg">Loading backup management overview...</p>
      </div>
    );
  }

  const avgRecoverySec = stats.avgDurationSec24h || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Backup &amp; Recovery Overview</h1>
          <p className="text-sm text-gray-400 mt-1">Management view - sorted by CPU load (highest first)</p>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-400 shrink-0" />
            <div>
              <div className="text-2xl font-bold text-white">{stats.backupCount24h.toLocaleString()}</div>
              <div className="text-xs text-gray-400">Backups (24h)</div>
            </div>
          </div>

          <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <HardDrive className="w-5 h-5 text-purple-400 shrink-0" />
            <div>
              <div className="text-2xl font-bold text-white">{formatBytes(Number(stats.totalSize24h) || 0)}</div>
              <div className="text-xs text-gray-400">Total Backup Size</div>
            </div>
          </div>

          <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
            <Timer className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <div className="text-2xl font-bold text-white">
                {avgRecoverySec > 0 ? `${Math.floor(avgRecoverySec / 60)}m ${avgRecoverySec % 60}s` : '-'}
              </div>
              <div className="text-xs text-gray-400">Avg Recovery Time</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {instances.map((instance) => {
          const isOpen = expanded.has(instance.instanceId);
          return (
            <div key={instance.instanceId} className="glass rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(instance.instanceId)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 transition-all text-left"
              >
                <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </motion.div>
                <Server className="w-4 h-4 text-gray-500 shrink-0" />
                <span className="font-medium text-white min-w-[180px]">{instance.instanceName}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cpuBadgeCls(instance.avgCpu)}`}>
                  CPU: {instance.avgCpu.toFixed(1)}%
                </span>
                <span className="text-xs text-gray-400">DBs: {instance.databases.length}</span>
                <span className="text-xs text-gray-400">Total Size: {formatBytes(instance.totalSize)}</span>
                <span className="text-xs text-gray-400 flex items-center gap-2 ml-auto">
                  RPO Status:
                  {instance.rpoOk > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> {instance.rpoOk} OK</span>}
                  {instance.rpoWarning > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> {instance.rpoWarning} Warning</span>}
                  {instance.rpoCritical > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> {instance.rpoCritical} Critical</span>}
                </span>
              </button>

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
                        {instance.databases.map((database) => {
                          const fullTs = timeSince(database.fullBackup?.date || null);
                          const diffTs = timeSince(database.diffBackup?.date || null);
                          const logTs = timeSince(database.logBackup?.date || null);

                          return (
                            <tr key={database.databaseId} className="hover:bg-white/5 transition-colors">
                              <td className="py-2 px-4 text-gray-300">
                                <div className="flex items-center gap-2">
                                  <Database className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                  {database.databaseName}
                                </div>
                              </td>
                              {[fullTs, diffTs, logTs].map((timeValue, index) => (
                                <td key={index} className="py-2 px-4 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${backupBadgeCls(timeValue.hours)}`}>
                                    {timeValue.text}
                                  </span>
                                </td>
                              ))}
                              <td className="py-2 px-4 text-right text-gray-300">
                                {database.fullBackup?.size ? formatBytes(database.fullBackup.size) : '-'}
                              </td>
                              <td className="py-2 px-4 text-right text-gray-300">
                                {database.recoveryMinutes > 0 ? formatDuration(database.recoveryMinutes) : '-'}
                              </td>
                              <td className="py-2 px-4 text-center">
                                <span className={`text-xs font-medium ${database.rpoColor}`}>{database.rpoLabel}</span>
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
            {' '}The average recovery time is <span className="font-bold text-white">{formatDuration(avgRecoveryMin)}</span>.
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

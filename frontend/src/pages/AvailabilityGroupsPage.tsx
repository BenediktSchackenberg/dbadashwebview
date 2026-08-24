import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import type {
  HadrOverviewGroupRow,
  InstanceHadrDatabaseRow,
  InstanceHadrGroupRow,
  InstanceHadrReplicaRow,
  InstanceHadrResponse,
  InstanceMirroringRow,
  InstanceLogShippingRow,
} from '../api/types';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import {
  Shield, Server, Database, ArrowRight, ArrowDown, ChevronDown, ChevronRight,
  Activity, AlertTriangle, Network, Crown, RefreshCw, Search, X, Copy, History
} from 'lucide-react';

/* ── helpers ── */

function asBoolean(value: boolean | number | null | undefined): boolean {
  return value === true || value === 1;
}

function formatBytes(kb: number | null | undefined): string {
  if (kb == null) return '';
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
}

function formatLag(seconds: number | null | undefined): { text: string; color: string } {
  if (seconds == null) return { text: '', color: 'text-gray-500' };
  const s = Number(seconds);
  if (s < 5) return { text: `${s}s`, color: 'text-green-400' };
  if (s < 30) return { text: s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`, color: 'text-yellow-400' };
  return { text: s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`, color: 'text-red-400' };
}

function syncStateBadge(state: string | null | undefined): string {
  if (!state) return 'bg-gray-500/20 text-gray-400';
  const s = state.toUpperCase();
  if (s === 'SYNCHRONIZED') return 'bg-green-500/20 text-green-300';
  if (s === 'SYNCHRONIZING') return 'bg-blue-500/20 text-blue-300';
  if (s === 'NOT SYNCHRONIZING') return 'bg-red-500/20 text-red-300';
  if (s === 'REVERTING') return 'bg-yellow-500/20 text-yellow-300';
  return 'bg-gray-500/20 text-gray-400';
}

function mirroringStateBadge(state: string | null | undefined): string {
  if (!state) return 'bg-gray-500/20 text-gray-400';
  const s = state.toUpperCase();
  if (s === 'SYNCHRONIZED') return 'bg-green-500/20 text-green-300';
  if (s === 'SYNCHRONIZING') return 'bg-blue-500/20 text-blue-300';
  if (s === 'PENDING_FAILOVER') return 'bg-yellow-500/20 text-yellow-300';
  if (s === 'SUSPENDED' || s === 'DISCONNECTED' || s === 'UNSYNCHRONIZED') return 'bg-red-500/20 text-red-300';
  return 'bg-gray-500/20 text-gray-400';
}

function healthDotColor(h: string | null | undefined): string {
  if (!h) return 'bg-gray-400';
  const s = h.toUpperCase();
  if (s === 'HEALTHY') return 'bg-green-400';
  if (s === 'PARTIALLY_HEALTHY') return 'bg-yellow-400';
  return 'bg-red-400';
}

function healthBg(h: string | null | undefined): string {
  if (!h) return 'bg-gray-500/10 text-gray-400';
  const s = h.toUpperCase();
  if (s === 'HEALTHY') return 'bg-emerald-500/10 text-emerald-400';
  if (s === 'PARTIALLY_HEALTHY') return 'bg-yellow-500/10 text-yellow-400';
  return 'bg-red-500/10 text-red-400';
}

function cpuBarColor(cpu: number): string {
  if (cpu < 50) return 'bg-blue-500';
  if (cpu <= 80) return 'bg-yellow-500';
  return 'bg-red-500';
}

function cpuTextColor(cpu: number): string {
  if (cpu < 50) return 'text-blue-400';
  if (cpu <= 80) return 'text-yellow-400';
  return 'text-red-400';
}

function extractPort(url: string | null | undefined): string {
  if (!url) return '';
  const m = url.match(/:(\d+)$/);
  return m ? m[1] : '';
}

/* ── Types ── */

interface ServerInfo {
  instanceId: number;
  instanceName: string;
  edition: string;
  cpuCount: number;
  ramGb: number;
  currentCPU: number | null;
  isPrimary: boolean;
  availabilityMode: string;
  failoverMode: string;
}

interface AGDatabase {
  databaseId: number;
  databaseName: string;
  syncState: string;
  health: string;
  isSuspended: boolean;
  lagSeconds: number | null;
  logSendQueue: number | null;
  redoQueue: number | null;
  logSendRate: number | null;
  redoRate: number | null;
}

interface AGGroup {
  groupId: string;
  name: string;
  backupPreference: string;
  databases: AGDatabase[];
}

interface AGCluster {
  servers: ServerInfo[];
  ags: AGGroup[];
}

/* ── Union-Find ── */

class UnionFind {
  parent: Map<number, number> = new Map();
  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x);
    if (this.parent.get(x) !== x) this.parent.set(x, this.find(this.parent.get(x)!));
    return this.parent.get(x)!;
  }
  union(a: number, b: number) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/* ── Build clusters from raw API data ── */

function buildClusters(
  rawAgs: HadrOverviewGroupRow[],
  rawReplicas: InstanceHadrReplicaRow[],
  rawDatabases: InstanceHadrDatabaseRow[],
): AGCluster[] {
  // Map group_id → set of instanceIds
  const groupInstances = new Map<string, Set<number>>();
  for (const ag of rawAgs) {
    const gid = ag.group_id;
    if (!groupInstances.has(gid)) groupInstances.set(gid, new Set());
    groupInstances.get(gid)!.add(ag.InstanceID);
  }

  // Union-find to cluster instances that share an AG
  const uf = new UnionFind();
  for (const instanceIds of groupInstances.values()) {
    const arr = Array.from(instanceIds);
    for (let i = 1; i < arr.length; i++) uf.union(arr[0], arr[i]);
  }

  // Also union instances that appear in different groups
  const instanceGroups = new Map<number, Set<string>>();
  for (const ag of rawAgs) {
    if (!instanceGroups.has(ag.InstanceID)) instanceGroups.set(ag.InstanceID, new Set());
    instanceGroups.get(ag.InstanceID)!.add(ag.group_id);
  }
  // Instances sharing a group are already unioned above. Now do transitive:
  // If instance A has group G1, and instance B has group G1, they're unioned.
  // Already done. Good.

  // Group instances by cluster root
  const clusterMap = new Map<number, Set<number>>();
  for (const instId of instanceGroups.keys()) {
    const root = uf.find(instId);
    if (!clusterMap.has(root)) clusterMap.set(root, new Set());
    clusterMap.get(root)!.add(instId);
  }

  // Build replica lookup: replica_id → replica info
  const replicaMap = new Map<string, InstanceHadrReplicaRow>();
  for (const r of rawReplicas) {
    replicaMap.set(r.replica_id, r);
  }

  // Build instance info lookup from rawAgs (deduplicated)
  const instanceInfoMap = new Map<number, HadrOverviewGroupRow>();
  for (const ag of rawAgs) {
    if (!instanceInfoMap.has(ag.InstanceID)) {
      instanceInfoMap.set(ag.InstanceID, ag);
    }
  }

  // Determine which instances are primary for at least one AG
  // A database with is_primary_replica=true: find its replica_id → replica_server_name → match to instance
  const primaryForGroup = new Map<string, Set<number>>(); // group_id → set of primary instanceIds
  for (const db of rawDatabases) {
    if (asBoolean(db.is_primary_replica)) {
      const gid = db.group_id;
      const replica = replicaMap.get(db.replica_id);
      if (replica) {
        // Match replica_server_name to an instance
        for (const ag of rawAgs) {
          if (ag.group_id === gid) {
            const instName = (ag.InstanceName || '').toUpperCase();
            const replName = (replica.replica_server_name || '').toUpperCase();
            if (instName === replName || instName.startsWith(replName) || replName.startsWith(instName)) {
              if (!primaryForGroup.has(gid)) primaryForGroup.set(gid, new Set());
              primaryForGroup.get(gid)!.add(ag.InstanceID);
            }
          }
        }
      }
    }
  }

  // Build clusters
  const clusters: AGCluster[] = [];
  for (const [, instanceIds] of clusterMap) {
    const instArr = Array.from(instanceIds);

    // Collect all group_ids for this cluster
    const clusterGroupIds = new Set<string>();
    for (const instId of instArr) {
      const groups = instanceGroups.get(instId);
      if (groups) for (const g of groups) clusterGroupIds.add(g);
    }

    // Build servers
    const servers: ServerInfo[] = instArr.map(instId => {
      const info = instanceInfoMap.get(instId)!;
      const isPrimary = Array.from(primaryForGroup.values()).some(s => s.has(instId));
      // Get availability mode and failover mode from replicas
      let availMode = '';
      let failMode = '';
      for (const gid of clusterGroupIds) {
        for (const r of rawReplicas) {
          if (r.group_id === gid) {
            const rName = (r.replica_server_name || '').toUpperCase();
            const iName = (info.InstanceName || '').toUpperCase();
            if (rName === iName || rName.startsWith(iName) || iName.startsWith(rName)) {
              availMode = availMode || r.availability_mode_desc || '';
              failMode = failMode || r.failover_mode_desc || '';
            }
          }
        }
      }
      return {
        instanceId: instId,
        instanceName: info.InstanceName || `Instance ${instId}`,
        edition: info.Edition || '',
        cpuCount: info.cpu_count || 0,
        ramGb: Math.round((info.physical_memory_kb || 0) / 1024 / 1024),
        currentCPU: info.currentCPU ?? null,
        isPrimary,
        availabilityMode: availMode,
        failoverMode: failMode,
      };
    }).sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

    // Build AG groups
    const ags: AGGroup[] = Array.from(clusterGroupIds).map(gid => {
      const agInfo = rawAgs.find((a) => a.group_id === gid)!;
      // Get unique databases for this group (deduplicate by DatabaseID, prefer primary)
      const dbMap = new Map<number, AGDatabase>();
      for (const db of rawDatabases) {
        if (db.group_id !== gid) continue;
        const existing = dbMap.get(db.DatabaseID);
        if (!existing || asBoolean(db.is_primary_replica)) {
          dbMap.set(db.DatabaseID, {
            databaseId: db.DatabaseID,
            databaseName: db.DatabaseName || `DB ${db.DatabaseID}`,
            syncState: db.synchronization_state_desc || '',
            health: db.synchronization_health_desc || '',
            isSuspended: asBoolean(db.is_suspended),
            lagSeconds: asBoolean(db.is_primary_replica) ? null : (db.secondary_lag_seconds ?? null),
            logSendQueue: db.log_send_queue_size ?? null,
            redoQueue: db.redo_queue_size ?? null,
            logSendRate: db.log_send_rate ?? null,
            redoRate: db.redo_rate ?? null,
          });
        }
      }
      return {
        groupId: gid,
        name: agInfo.AGName || gid,
        backupPreference: agInfo.automated_backup_preference_desc || '',
        databases: Array.from(dbMap.values()).sort((a, b) => a.databaseName.localeCompare(b.databaseName)),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    clusters.push({ servers, ags });
  }

  return clusters;
}

/* ── Per-Instance View (unchanged) ── */

function InstanceHadrView({ instanceId }: { instanceId: number }) {
  const [data, setData] = useState<InstanceHadrResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [instanceName, setInstanceName] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const [hadr, instData] = await Promise.all([
          api.instanceHadr(instanceId),
          api.instance(instanceId).catch(() => null),
        ]);
        setData(hadr);
        setInstanceName(
          instData?.instance?.InstanceDisplayName || instData?.instance?.Instance || `Instance ${instanceId}`
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [instanceId]);

  if (loading) return <LoadingSpinner />;
  if (!data || data.error) return <EmptyState message={data?.error || 'Failed to load HA/DR data'} />;

  const { ags = [], replicas = [], databases = [], mirroring = [], logShipping = [] } = data;

  const mirroringAndLogShippingSections = (
    <>
      {mirroring.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-800/80 flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider">
            <Copy className="w-3.5 h-3.5 text-purple-400" /> Database Mirroring
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-white/5">
                <th className="px-4 py-2">Database</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">State</th>
                <th className="px-4 py-2">Partner</th>
                <th className="px-4 py-2">Witness</th>
                <th className="px-4 py-2">Safety</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {mirroring.map((m: InstanceMirroringRow) => (
                <tr key={m.DatabaseID} className="hover:bg-white/5">
                  <td className="px-4 py-2.5 text-white font-medium">{m.DatabaseName}</td>
                  <td className="px-4 py-2.5 text-gray-300">{m.mirroring_role_desc || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs', mirroringStateBadge(m.mirroring_state_desc))}>
                      {m.mirroring_state_desc || 'UNKNOWN'}
                    </span>
                    {m.PartnerStateDesc && m.PartnerStateDesc !== m.mirroring_state_desc && (
                      <span className="text-xs text-gray-500 ml-1">(partner: {m.PartnerStateDesc})</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{m.mirroring_partner_instance || m.mirroring_partner_name || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{m.mirroring_witness_name || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{m.mirroring_safety_level_desc || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {logShipping.length > 0 && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-800/80 flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider">
            <History className="w-3.5 h-3.5 text-cyan-400" /> Log Shipping
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-white/5">
                <th className="px-4 py-2">Database</th>
                <th className="px-4 py-2">Last Restore</th>
                <th className="px-4 py-2">Last Backup Restored</th>
                <th className="px-4 py-2">Last File</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logShipping.map((l: InstanceLogShippingRow) => {
                const staleHours = l.restore_date ? (Date.now() - new Date(l.restore_date).getTime()) / 3600000 : null;
                return (
                  <tr key={l.DatabaseID} className="hover:bg-white/5">
                    <td className="px-4 py-2.5 text-white font-medium">{l.DatabaseName}</td>
                    <td className={clsx('px-4 py-2.5 text-xs', staleHours == null ? 'text-gray-500' : staleHours > 4 ? 'text-red-400' : staleHours > 1 ? 'text-yellow-400' : 'text-emerald-400')}>
                      {l.restore_date ? new Date(l.restore_date).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{l.backup_start_date ? new Date(l.backup_start_date).toLocaleString() : '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs font-mono truncate max-w-[240px]">{l.last_file || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );

  if (ags.length === 0) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-blue-400" />
        <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">HA/DR — {instanceName}</h1>
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Auto-refresh 30s
        </span>
      </div>
      </div>
      {mirroring.length === 0 && logShipping.length === 0 ? (
        <EmptyState message="No Availability Groups, Database Mirroring, or Log Shipping configured on this instance" />
      ) : (
        mirroringAndLogShippingSections
      )}
    </div>
  );

  const toggleAg = (groupId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  const primaryReplicaIds = new Set(
    databases.filter((database) => asBoolean(database.is_primary_replica)).map((database) => database.replica_id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">HA/DR — {instanceName}</h1>
      </div>

      {ags.map((ag: InstanceHadrGroupRow) => {
        const gid = ag.group_id;
        const agReplicas = replicas.filter((replica) => replica.group_id === gid);
        const agDbs = databases.filter((database) => database.group_id === gid);
        const isExpanded = expanded.has(gid);
        const uniqueDbCount = new Set(agDbs.map((database) => database.DatabaseID)).size;

        const healths = agDbs.map((database) => database.synchronization_health_desc?.toUpperCase());
        const overallHealth = healths.includes('NOT_HEALTHY') ? 'NOT_HEALTHY'
          : healths.includes('PARTIALLY_HEALTHY') ? 'PARTIALLY_HEALTHY'
          : healths.length > 0 ? 'HEALTHY' : 'UNKNOWN';

        return (
          <div key={gid} className="glass rounded-xl overflow-hidden">
            <button
              onClick={() => toggleAg(gid)}
              className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-colors text-left"
            >
              {isExpanded
                ? <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                : <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />}
              <Network className="w-5 h-5 text-blue-400 shrink-0" />
              <span className="font-semibold text-white">{ag.name}</span>
              <div className="flex items-center gap-4 ml-auto text-xs text-gray-400">
                <span>Replicas: {agReplicas.length}</span>
                <span>Databases: {uniqueDbCount}</span>
                <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium', healthBg(overallHealth))}>
                  <span className={clsx('w-1.5 h-1.5 rounded-full', healthDotColor(overallHealth))} />
                  {overallHealth === 'HEALTHY' ? 'Healthy' : overallHealth === 'PARTIALLY_HEALTHY' ? 'Partial' : overallHealth === 'NOT_HEALTHY' ? 'Unhealthy' : 'Unknown'}
                </span>
              </div>
            </button>

            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 pt-2 space-y-6 border-t border-white/5">
                    <div className="glass rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-400" /> AG Properties
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                        {[
                          ['Backup Preference', ag.automated_backup_preference_desc],
                          ['DB Failover', asBoolean(ag.db_failover) ? 'Enabled' : 'Disabled'],
                          ['Basic AG', asBoolean(ag.basic_features) ? 'Yes' : 'No'],
                          ['DTC Support', asBoolean(ag.dtc_support) ? 'Yes' : 'No'],
                          ['Distributed', asBoolean(ag.is_distributed) ? 'Yes' : 'No'],
                          ['Contained', asBoolean(ag.is_contained) ? 'Yes' : 'No'],
                          ['Health Check Timeout', ag.health_check_timeout != null ? `${ag.health_check_timeout}ms` : ''],
                          ['Failure Condition Level', ag.failure_condition_level ?? ''],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="bg-white/5 rounded-lg px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
                            <div className="text-gray-200 mt-0.5">{String(value)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="glass rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <Server className="w-4 h-4 text-blue-400" /> Replica Topology
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {agReplicas.map((r: InstanceHadrReplicaRow, i: number) => {
                          const isPrimary = primaryReplicaIds.has(r.replica_id);
                          return (
                            <div key={r.replica_id} className="flex items-center gap-2">
                              <div className={clsx('rounded-xl p-4 border min-w-[200px]',
                                isPrimary
                                  ? 'border-blue-500/30 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                  : 'border-gray-600/30 bg-gray-500/5'
                              )}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={clsx('w-2 h-2 rounded-full', isPrimary ? 'bg-blue-400' : 'bg-gray-500')} />
                                  <span className={clsx('text-xs font-medium rounded-full px-2 py-0.5',
                                    isPrimary ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                                  )}>
                                    {isPrimary ? 'PRIMARY' : 'SECONDARY'}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-white truncate">{r.replica_server_name}</p>
                                <div className="mt-2 space-y-1 text-xs text-gray-400">
                                  <p>{r.availability_mode_desc}</p>
                                  <p>{r.failover_mode_desc}</p>
                                  <p>Backup Prio: {r.backup_priority}</p>
                                  <p>Endpoint: {extractPort(r.endpoint_url)}</p>
                                </div>
                              </div>
                              {i < agReplicas.length - 1 && (
                                <ArrowRight className="w-4 h-4 text-gray-600 shrink-0 hidden md:block" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {agDbs.length > 0 && (
                      <div className="glass rounded-xl overflow-hidden">
                        <div className="p-4 border-b border-white/10">
                          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Database className="w-4 h-4 text-blue-400" /> Database Synchronization
                          </h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-white/10">
                                {['Database', 'Replica', 'Role', 'Sync State', 'Health', 'Lag', 'Log Send Q', 'Redo Q', 'Send Rate', 'Redo Rate'].map(h => (
                                  <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {[...agDbs]
                                .sort((a, b) => {
                                  const nameComp = (a.DatabaseName || '').localeCompare(b.DatabaseName || '');
                                  if (nameComp !== 0) return nameComp;
                                  return Number(asBoolean(b.is_primary_replica)) - Number(asBoolean(a.is_primary_replica));
                                })
                                .map((d: InstanceHadrDatabaseRow, i: number) => {
                                  const replica = agReplicas.find((r) => r.replica_id === d.replica_id);
                                  const lag = formatLag(asBoolean(d.is_primary_replica) ? null : d.secondary_lag_seconds);
                                  return (
                                    <tr key={`${d.DatabaseID}-${d.replica_id}-${i}`} className="hover:bg-slate-800/50">
                                      <td className="px-3 py-2 text-white font-medium">{d.DatabaseName || ''}</td>
                                      <td className="px-3 py-2 text-gray-300">{replica?.replica_server_name || ''}</td>
                                      <td className="px-3 py-2">
                                        <span className={clsx('text-xs rounded-full px-2 py-0.5 font-medium',
                                          asBoolean(d.is_primary_replica) ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-400'
                                        )}>
                                          {asBoolean(d.is_primary_replica) ? 'PRIMARY' : 'SECONDARY'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={clsx('text-xs rounded-full px-2 py-0.5 font-medium', syncStateBadge(d.synchronization_state_desc))}>
                                          {d.synchronization_state_desc || ''}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={clsx('text-xs rounded-full px-2 py-0.5 font-medium', healthBg(d.synchronization_health_desc))}>
                                          {d.synchronization_health_desc || ''}
                                        </span>
                                      </td>
                                      <td className={clsx('px-3 py-2 text-xs', lag.color)}>{lag.text}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">{formatBytes(d.log_send_queue_size)}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">{formatBytes(d.redo_queue_size)}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">{d.log_send_rate != null ? `${d.log_send_rate} KB/s` : ''}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">
                                        {d.redo_rate != null ? `${d.redo_rate} KB/s` : ''}
                                        {asBoolean(d.is_suspended) && (
                                          <span className="ml-2 inline-flex items-center gap-1 text-yellow-400">
                                            <AlertTriangle className="w-3 h-3" />
                                            {d.suspend_reason_desc || 'Suspended'}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {(mirroring.length > 0 || logShipping.length > 0) && mirroringAndLogShippingSections}
    </div>
  );
}

/* ── Estate View (new clustered design) ── */

function EstateView() {
  const [clusters, setClusters] = useState<AGCluster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedAGs, setExpandedAGs] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const d = await api.hadrOverview();
        if (d.error) { setError(d.error); return; }
        const built = buildClusters(d.ags || [], d.replicas || [], d.databases || []);
        setClusters(built);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleAG = (gid: string) => {
    setExpandedAGs(prev => {
      const next = new Set(prev);
      next.has(gid) ? next.delete(gid) : next.add(gid);
      return next;
    });
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <EmptyState message={error} />;

  // KPIs
  const totalClusters = clusters.length;
  const totalAGs = clusters.reduce((s, c) => s + c.ags.length, 0);
  const totalReplicas = clusters.reduce((s, c) => s + c.servers.length, 0);
  const totalDatabases = clusters.reduce((s, c) => s + c.ags.reduce((ss, ag) => ss + ag.databases.length, 0), 0);

  // Search filter: match server names, AG names, or database names
  const q = search.toLowerCase().trim();
  const filteredClusters = q ? clusters.map(cluster => {
    // Check if a server matches
    const serverMatch = cluster.servers.some(s => s.instanceName.toLowerCase().includes(q));
    // Filter AGs: keep AG if name matches or a DB matches
    const filteredAGs = cluster.ags.map(ag => {
      const agNameMatch = ag.name.toLowerCase().includes(q);
      const matchingDbs = ag.databases.filter(d => d.databaseName.toLowerCase().includes(q));
      if (agNameMatch || matchingDbs.length > 0) return { ...ag, databases: agNameMatch ? ag.databases : matchingDbs };
      return null;
    }).filter((ag): ag is AGGroup => ag !== null);
    // Show cluster if server matches (show all AGs) or if filtered AGs exist
    if (serverMatch) return cluster;
    if (filteredAGs.length > 0) return { ...cluster, ags: filteredAGs };
    return null;
  }).filter((c): c is AGCluster => c !== null) : clusters;

  if (totalClusters === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">AlwaysOn Availability Groups</h1>
          <p className="text-sm text-gray-400 mt-1">Fleet-wide overview of HA/DR clusters, replicas, and database synchronization</p>
        </div>
        <div className="glass rounded-xl p-12 text-center">
          <Shield className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-400">No Availability Groups Configured</h2>
          <p className="text-sm text-gray-500 mt-2">AlwaysOn Availability Groups will appear here once configured on your monitored SQL Servers.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">AlwaysOn Availability Groups</h1>
          <p className="text-sm text-gray-400 mt-1">Fleet-wide overview of HA/DR clusters, replicas, and database synchronization</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Server, AG, database..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-8 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-56"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-gray-500 hover:text-gray-300" />
              </button>
            )}
          </div>
          {[
            { label: 'Clusters', value: totalClusters },
            { label: 'AGs', value: totalAGs },
            { label: 'Replicas', value: totalReplicas },
            { label: 'Databases', value: totalDatabases },
          ].map(kpi => (
            <div key={kpi.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <span className="text-sm font-bold text-white">{kpi.value}</span>
              <span className="text-xs text-gray-400">{kpi.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cluster cards */}
      {filteredClusters.length === 0 && q && (
        <div className="glass rounded-xl p-8 text-center">
          <Search className="w-8 h-8 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">No results for &ldquo;{search}&rdquo;</p>
          <button onClick={() => setSearch('')} className="text-sm text-blue-400 hover:text-blue-300 mt-2">Reset filters</button>
        </div>
      )}
      {filteredClusters.map((cluster, clusterIdx) => (
        <motion.div
          key={clusterIdx}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: clusterIdx * 0.05 }}
          className="rounded-xl bg-gradient-to-br from-blue-500/5 to-purple-500/5 border border-white/5 overflow-hidden"
        >
          {/* Server Banner */}
          <div className="p-6">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-4 font-semibold">Member Servers</div>
            <div className="flex flex-wrap items-center gap-1">
              {cluster.servers.map((server, sIdx) => (
                <div key={server.instanceId} className="flex items-center">
                  {/* Server card */}
                  <div
                    className="relative group cursor-pointer"
                    onClick={() => navigate(`/instances/${server.instanceId}/hadr`)}
                  >
                    {server.isPrimary && (
                      <div className="absolute -inset-0.5 bg-blue-500/20 rounded-xl blur-sm" />
                    )}
                    <div className={clsx(
                      'relative rounded-xl p-4 min-w-[200px] transition-transform hover:scale-[1.02]',
                      server.isPrimary
                        ? 'bg-blue-500/10 border border-blue-500/30'
                        : 'bg-slate-800/60 border border-white/5'
                    )}>
                      {/* Role badge */}
                      <div className={clsx(
                        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium mb-2',
                        server.isPrimary ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-500/20 text-gray-400'
                      )}>
                        {server.isPrimary ? <Crown className="w-3 h-3" /> : <Server className="w-3 h-3" />}
                        {server.isPrimary ? 'PRIMARY' : 'SECONDARY'}
                      </div>

                      <h3 className="text-lg font-bold text-white mb-3">{server.instanceName}</h3>

                      {/* CPU Bar */}
                      {server.currentCPU != null && (
                        <div className="mb-2">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-gray-400">CPU</span>
                            <span className={cpuTextColor(server.currentCPU)}>{server.currentCPU}%</span>
                          </div>
                          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={clsx('h-full rounded-full transition-all', cpuBarColor(server.currentCPU))}
                              style={{ width: `${Math.min(server.currentCPU, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* RAM */}
                      {server.ramGb > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">RAM</span>
                          <span className="text-gray-200">{server.ramGb} GB</span>
                        </div>
                      )}

                      {/* Mode badges */}
                      <div className="flex gap-1.5 mt-3 flex-wrap">
                        {server.availabilityMode && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-gray-400">{server.availabilityMode}</span>
                        )}
                        {server.failoverMode && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/50 text-gray-400">{server.failoverMode}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Arrow between servers */}
                  {sIdx < cluster.servers.length - 1 && (
                    <>
                      <div className="hidden sm:flex items-center px-2">
                        <div className="w-8 border-t border-dashed border-gray-600" />
                        <ArrowRight className="w-4 h-4 text-gray-500 -mx-1" />
                      </div>
                      <div className="flex sm:hidden items-center justify-center py-2">
                        <ArrowDown className="w-4 h-4 text-gray-500" />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/5" />

          {/* AG Groups */}
          <div className="p-6 pt-4 space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-3 font-semibold">Availability Groups</div>
            {cluster.ags.map(ag => {
              const isExpanded = expandedAGs.has(ag.groupId) || !!q;
              const allHealthy = ag.databases.every(d => d.health.toUpperCase() === 'HEALTHY');
              const someUnhealthy = ag.databases.some(d => {
                const h = d.health.toUpperCase();
                return h === 'NOT_HEALTHY';
              });

              return (
                <div key={ag.groupId}>
                  <button
                    onClick={() => toggleAG(ag.groupId)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800/40 hover:bg-slate-800/60 cursor-pointer transition-all text-left"
                  >
                    <ChevronRight className={clsx('w-4 h-4 text-gray-400 transition-transform', isExpanded && 'rotate-90')} />
                    <Database className="w-4 h-4 text-purple-400" />
                    <span className="font-medium text-white">{ag.name}</span>
                    {ag.backupPreference && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-gray-500">{ag.backupPreference}</span>
                    )}
                    <span className="text-xs text-gray-500 ml-auto">{ag.databases.length} databases</span>
                    <div className={clsx('w-2 h-2 rounded-full', allHealthy ? 'bg-green-400' : someUnhealthy ? 'bg-red-400' : 'bg-yellow-400')} />
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <div className="pl-8 pt-2 pb-1 space-y-0.5">
                          {ag.databases.map((db, i) => {
                            const lag = formatLag(db.lagSeconds);
                            return (
                              <div key={db.databaseId} className="flex items-center gap-3 py-1.5 px-3 rounded hover:bg-white/5">
                                <span className="text-gray-600 font-mono text-xs select-none">
                                  {i === ag.databases.length - 1 ? '\u2514\u2500' : '\u251C\u2500'}
                                </span>
                                <span className="text-sm text-gray-200 font-mono">{db.databaseName}</span>
                                <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', syncStateBadge(db.syncState))}>
                                  {db.syncState}
                                </span>
                                {db.lagSeconds != null && db.lagSeconds > 0 && (
                                  <span className={clsx('text-xs', lag.color)}>{lag.text} lag</span>
                                )}
                                {db.isSuspended && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-medium flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Suspended
                                  </span>
                                )}
                                <div className={clsx('w-1.5 h-1.5 rounded-full ml-auto', healthDotColor(db.health))} />
                                {((db.logSendQueue ?? 0) > 0 || (db.redoQueue ?? 0) > 0) && (
                                  <div className="flex gap-2 text-[10px] text-gray-500">
                                    {(db.logSendQueue ?? 0) > 0 && <span>Send: {formatBytes(db.logSendQueue)}</span>}
                                    {(db.redoQueue ?? 0) > 0 && <span>Redo: {formatBytes(db.redoQueue)}</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

/* ── Main Component ── */

export default function AvailabilityGroupsPage() {
  const { id } = useParams<{ id: string }>();

  if (id) {
    return <InstanceHadrView instanceId={parseInt(id, 10)} />;
  }

  return <EstateView />;
}

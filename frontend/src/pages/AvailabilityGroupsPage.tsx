import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Server, Database, ArrowRight, ChevronDown, ChevronRight,
  Activity, AlertTriangle, Network
} from 'lucide-react';

/* ── helpers ── */

function formatBytes(kb: number | null | undefined): string {
  if (kb == null) return '—';
  if (kb < 1024) return `${kb} KB`;
  if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
}

function formatLag(seconds: number | null | undefined): { text: string; color: string } {
  if (seconds == null) return { text: '—', color: 'text-gray-500' };
  const s = Number(seconds);
  if (s < 5) return { text: `${s}s`, color: 'text-emerald-400' };
  if (s < 30) return { text: s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`, color: 'text-yellow-400' };
  return { text: s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`, color: 'text-red-400' };
}

function syncStateBg(state: string | null): string {
  if (!state) return 'bg-gray-500/10 text-gray-400';
  const s = state.toUpperCase();
  if (s === 'SYNCHRONIZED') return 'bg-emerald-500/10 text-emerald-400';
  if (s === 'SYNCHRONIZING') return 'bg-blue-500/10 text-blue-400';
  if (s === 'NOT SYNCHRONIZING') return 'bg-red-500/10 text-red-400';
  if (s === 'REVERTING') return 'bg-yellow-500/10 text-yellow-400';
  return 'bg-gray-500/10 text-gray-400';
}

function healthBg(h: string | null): string {
  if (!h) return 'bg-gray-500/10 text-gray-400';
  const s = h.toUpperCase();
  if (s === 'HEALTHY') return 'bg-emerald-500/10 text-emerald-400';
  if (s === 'PARTIALLY_HEALTHY') return 'bg-yellow-500/10 text-yellow-400';
  return 'bg-red-500/10 text-red-400';
}

function extractPort(url: string | null): string {
  if (!url) return '—';
  const m = url.match(/:(\d+)$/);
  return m ? m[1] : '—';
}

/* ── Per-Instance View ── */

function InstanceHadrView({ instanceId }: { instanceId: number }) {
  const [data, setData] = useState<any>(null);
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

  const { ags = [], replicas = [], databases = [] } = data;

  if (ags.length === 0) return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">HA/DR — {instanceName}</h1>
      </div>
      <EmptyState message="No Availability Groups configured on this instance" />
    </div>
  );

  const toggleAg = (groupId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(groupId) ? next.delete(groupId) : next.add(groupId);
      return next;
    });
  };

  // Determine primary replicas from databases
  const primaryReplicaIds = new Set(
    databases.filter((d: any) => d.is_primary_replica).map((d: any) => d.replica_id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">HA/DR — {instanceName}</h1>
      </div>

      {ags.map((ag: any) => {
        const gid = ag.group_id;
        const agReplicas = replicas.filter((r: any) => r.group_id === gid);
        const agDbs = databases.filter((d: any) => d.group_id === gid);
        const isExpanded = expanded.has(gid);
        const uniqueDbCount = new Set(agDbs.map((d: any) => d.DatabaseID)).size;

        // Overall health from databases
        const healths = agDbs.map((d: any) => d.synchronization_health_desc?.toUpperCase());
        const overallHealth = healths.includes('NOT_HEALTHY') ? 'NOT_HEALTHY'
          : healths.includes('PARTIALLY_HEALTHY') ? 'PARTIALLY_HEALTHY'
          : healths.length > 0 ? 'HEALTHY' : 'UNKNOWN';

        return (
          <div key={gid} className="glass rounded-xl overflow-hidden">
            {/* AG Header */}
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
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${healthBg(overallHealth)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${overallHealth === 'HEALTHY' ? 'bg-emerald-400' : overallHealth === 'PARTIALLY_HEALTHY' ? 'bg-yellow-400' : 'bg-red-400'}`} />
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
                    {/* AG Properties */}
                    <div className="glass rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-400" /> AG Properties
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                        {[
                          ['Backup Preference', ag.automated_backup_preference_desc],
                          ['DB Failover', ag.db_failover ? 'Enabled' : 'Disabled'],
                          ['Basic AG', ag.basic_features ? 'Yes' : 'No'],
                          ['DTC Support', ag.dtc_support ? 'Yes' : 'No'],
                          ['Distributed', ag.is_distributed ? 'Yes' : 'No'],
                          ['Contained', ag.is_contained ? 'Yes' : 'No'],
                          ['Health Check Timeout', ag.health_check_timeout != null ? `${ag.health_check_timeout}ms` : '—'],
                          ['Failure Condition Level', ag.failure_condition_level ?? '—'],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="bg-white/5 rounded-lg px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
                            <div className="text-gray-200 mt-0.5">{String(value)}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Replica Topology */}
                    <div className="glass rounded-xl p-5">
                      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <Server className="w-4 h-4 text-blue-400" /> Replica Topology
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {agReplicas.map((r: any, i: number) => {
                          const isPrimary = primaryReplicaIds.has(r.replica_id);
                          return (
                            <div key={r.replica_id} className="flex items-center gap-2">
                              <div className={`rounded-xl p-4 border min-w-[200px] ${
                                isPrimary
                                  ? 'border-blue-500/30 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                                  : 'border-gray-600/30 bg-gray-500/5'
                              }`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`w-2 h-2 rounded-full ${isPrimary ? 'bg-blue-400' : 'bg-gray-500'}`} />
                                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                                    isPrimary ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                                  }`}>
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

                    {/* Database Synchronization Table */}
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
                              {/* Sort by database name, then primary first */}
                              {[...agDbs]
                                .sort((a: any, b: any) => {
                                  const nameComp = (a.DatabaseName || '').localeCompare(b.DatabaseName || '');
                                  if (nameComp !== 0) return nameComp;
                                  return (b.is_primary_replica ? 1 : 0) - (a.is_primary_replica ? 1 : 0);
                                })
                                .map((d: any, i: number) => {
                                  const replica = agReplicas.find((r: any) => r.replica_id === d.replica_id);
                                  const lag = formatLag(d.is_primary_replica ? null : d.secondary_lag_seconds);
                                  return (
                                    <tr key={`${d.DatabaseID}-${d.replica_id}-${i}`} className="hover:bg-slate-800/50">
                                      <td className="px-3 py-2 text-white font-medium">{d.DatabaseName || '—'}</td>
                                      <td className="px-3 py-2 text-gray-300">{replica?.replica_server_name || '—'}</td>
                                      <td className="px-3 py-2">
                                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                                          d.is_primary_replica ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-400'
                                        }`}>
                                          {d.is_primary_replica ? 'PRIMARY' : 'SECONDARY'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${syncStateBg(d.synchronization_state_desc)}`}>
                                          {d.synchronization_state_desc || '—'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${healthBg(d.synchronization_health_desc)}`}>
                                          {d.synchronization_health_desc || '—'}
                                        </span>
                                      </td>
                                      <td className={`px-3 py-2 text-xs ${lag.color}`}>{lag.text}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">{formatBytes(d.log_send_queue_size)}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">{formatBytes(d.redo_queue_size)}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">{d.log_send_rate != null ? `${d.log_send_rate} KB/s` : '—'}</td>
                                      <td className="px-3 py-2 text-xs text-gray-400">
                                        {d.redo_rate != null ? `${d.redo_rate} KB/s` : '—'}
                                        {d.is_suspended && (
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
    </div>
  );
}

/* ── Estate View ── */

function EstateView() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const d = await api.hadrOverview();
        setData(Array.isArray(d) ? d : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalAgs = data.length;
  const totalReplicas = data.reduce((s, a) => s + (a.ReplicaCount || 0), 0);
  const totalDbs = data.reduce((s, a) => s + (a.DatabaseCount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">AlwaysOn Availability Groups — Fleet Overview</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total AGs', value: totalAgs, icon: Network },
          { label: 'Total Replicas', value: totalReplicas, icon: Server },
          { label: 'Databases in AGs', value: totalDbs, icon: Database },
        ].map(c => (
          <div key={c.label} className="glass rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <c.icon className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{c.value}</div>
              <div className="text-xs text-gray-400">{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {data.length === 0 ? (
        <EmptyState message="No Availability Groups found across the estate" />
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {['AG Name', 'Instance', 'Replicas', 'Databases', 'Backup Preference', 'Type'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.map((ag: any, i: number) => {
                const agType = ag.is_distributed ? 'Distributed' : ag.basic_features ? 'Basic' : 'Standard';
                return (
                  <motion.tr
                    key={`${ag.group_id}-${i}`}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => navigate(`/instances/${ag.InstanceID}/hadr`)}
                    className="hover:bg-slate-800/50 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-white font-medium">{ag.AGName}</td>
                    <td className="px-4 py-3 text-gray-300">{ag.InstanceName}</td>
                    <td className="px-4 py-3 text-gray-400">{ag.ReplicaCount}</td>
                    <td className="px-4 py-3 text-gray-400">{ag.DatabaseCount}</td>
                    <td className="px-4 py-3 text-gray-400">{ag.automated_backup_preference_desc || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                        agType === 'Distributed' ? 'bg-purple-500/10 text-purple-400'
                        : agType === 'Basic' ? 'bg-gray-500/10 text-gray-400'
                        : 'bg-blue-500/10 text-blue-400'
                      }`}>{agType}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
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

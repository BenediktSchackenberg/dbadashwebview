import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import type { InstanceListRow } from '../api/types';
import { useRefresh } from '../App';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, AlertCircle, Info, Search, X, Inbox, Server,
  Clock, ChevronRight, ExternalLink
} from 'lucide-react';
import { clsx } from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';

/* ── Helpers ── */

type Severity = 'critical' | 'warning' | 'info';
type AlertType = 'error' | 'job_failure';
type AlertStatus = 'open' | 'closed';

interface ParsedAlert {
  instanceId: number;
  instanceName: string;
  date: Date;
  dateStr: string;
  message: string;
  context: string;
  alertType: AlertType;
  severity: Severity;
  status: AlertStatus;
}

function parseSeverity(a: any): Severity {
  const msg = ((a.ErrorMessage || '') + ' ' + (a.ErrorContext || '')).toLowerCase();
  if (a.AlertType === 'job_failure') return 'warning';
  if (msg.includes('error') || msg.includes('fail') || msg.includes('timeout') || msg.includes('cannot')) return 'critical';
  if (msg.includes('warning') || msg.includes('retry')) return 'warning';
  return 'info';
}

function parseStatus(raw: any): AlertStatus {
  const statusText = String(raw.Status ?? raw.AlertStatus ?? '').toLowerCase();

  if (
    raw.IsOpen === false ||
    raw.IsActive === false ||
    raw.ClosedDate ||
    raw.ClearDate ||
    raw.ClearedDate ||
    raw.ResolvedDate ||
    raw.EndDate ||
    statusText.includes('closed') ||
    statusText.includes('resolved') ||
    statusText.includes('cleared') ||
    statusText.includes('acknowledged')
  ) {
    return 'closed';
  }

  return 'open';
}

function parseAlert(raw: any): ParsedAlert {
  const date = raw.ErrorDate ? new Date(raw.ErrorDate) : new Date(0);
  return {
    instanceId: raw.InstanceID || 0,
    instanceName: raw.InstanceName || `Instance ${raw.InstanceID || '?'}`,
    date,
    dateStr: raw.ErrorDate || '',
    message: raw.ErrorMessage || '—',
    context: raw.ErrorContext || '',
    alertType: raw.AlertType === 'job_failure' ? 'job_failure' : 'error',
    severity: parseSeverity(raw),
    status: parseStatus(raw),
  };
}

const SEV_CONFIG = {
  critical: { label: 'Critical', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-500/20', dot: 'bg-red-400', ring: 'ring-red-500/20' },
  warning: { label: 'Warning', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-500/20', dot: 'bg-yellow-400', ring: 'ring-yellow-500/20' },
  info: { label: 'Info', icon: Info, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-500/20', dot: 'bg-blue-400', ring: 'ring-blue-500/20' },
};

/* ── Component ── */

export default function AlertsPage() {
  const { lastRefresh } = useRefresh();
  const navigate = useNavigate();
  const [raw, setRaw] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState<Severity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('open');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Instance selector — '' = nothing chosen yet (initial state, no fetch)
  // 'all' = fetch across the whole fleet (explicit opt-in, may be slow)
  // numeric id (as string) = single instance
  const [instanceChoice, setInstanceChoice] = useState<string>('');
  const [instances, setInstances] = useState<InstanceListRow[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(true);

  useEffect(() => {
    setInstancesLoading(true);
    api.instances()
      .then(rows => setInstances(Array.isArray(rows) ? rows : []))
      .catch(() => setInstances([]))
      .finally(() => setInstancesLoading(false));
  }, []);

  useEffect(() => {
    if (instanceChoice === '') {
      // Nothing chosen yet — don't hammer the backend on page load
      setRaw([]);
      return;
    }
    setLoading(true);
    const instanceId = instanceChoice === 'all' ? undefined : Number(instanceChoice);
    api.alertsRecent(instanceId)
      .then(d => setRaw(Array.isArray(d) ? d : []))
      .catch(() => setRaw([]))
      .finally(() => setLoading(false));
  }, [lastRefresh, instanceChoice]);

  const alerts = useMemo(() => raw.map(parseAlert).sort((a, b) => b.date.getTime() - a.date.getTime()), [raw]);

  const q = search.toLowerCase();
  const filtered = useMemo(() => alerts.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (sevFilter !== 'all' && a.severity !== sevFilter) return false;
    if (q && !a.message.toLowerCase().includes(q) && !a.instanceName.toLowerCase().includes(q) && !a.context.toLowerCase().includes(q)) return false;
    return true;
  }), [alerts, statusFilter, sevFilter, q]);

  const counts = useMemo(() => ({
    total: alerts.length,
    open: alerts.filter(a => a.status === 'open').length,
    closed: alerts.filter(a => a.status === 'closed').length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length,
  }), [alerts]);

  const selected = selectedIdx !== null && selectedIdx < filtered.length ? filtered[selectedIdx] : null;

  // Group by instance for sidebar stats
  const byInstance = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of filtered) {
      m.set(a.instanceName, (m.get(a.instanceName) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const instanceSelector = (
    <div className="flex items-center gap-2 flex-wrap">
      <label htmlFor="alerts-instance-select" className="text-xs text-gray-400 flex items-center gap-1.5">
        <Server className="w-3.5 h-3.5" />
        Instance
      </label>
      <select
        id="alerts-instance-select"
        value={instanceChoice}
        onChange={e => { setInstanceChoice(e.target.value); setSelectedIdx(null); }}
        disabled={instancesLoading}
        className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
      >
        <option value="">— select an instance —</option>
        <option value="all">All instances (slow)</option>
        {instances.map(i => (
          <option key={i.InstanceID} value={String(i.InstanceID)}>
            {i.InstanceDisplayName || i.Instance}
          </option>
        ))}
      </select>
      {instanceChoice === 'all' && (
        <span className="text-[11px] text-yellow-400/80 inline-flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          Loading alerts across all instances may take several seconds.
        </span>
      )}
    </div>
  );

  if (instanceChoice === '') {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts & Errors</h1>
          <p className="text-xs text-gray-500 mt-1">Pick a server to load its alerts — or choose <span className="text-gray-300">All instances</span> for the full fleet (slower).</p>
        </div>
        <div className="glass rounded-2xl p-6">{instanceSelector}</div>
        <div className="glass rounded-2xl p-16 flex flex-col items-center gap-3">
          <Server className="w-12 h-12 text-gray-600" />
          <p className="text-sm text-gray-400">Select an instance above to load alerts.</p>
        </div>
      </motion.div>
    );
  }

  if (loading) return <LoadingSpinner />;

  if (alerts.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-2xl font-bold text-white">Alerts & Errors</h1>
          {instanceSelector}
        </div>
        <div className="glass rounded-2xl p-16 flex flex-col items-center gap-4">
          <Inbox className="w-16 h-16 text-gray-600" />
          <p className="text-lg font-medium text-gray-400">No alerts — everything looks healthy!</p>
          <p className="text-sm text-gray-500">Collection errors and failed jobs will appear here</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts & Errors</h1>
          <p className="text-xs text-gray-500 mt-1">Collection errors and failed jobs · newest first · auto-refresh 30s</p>
        </div>
        {instanceSelector}
      </div>

      {/* Filter Strip */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          {([
            { key: 'open' as const, label: 'Open', count: counts.open },
            { key: 'closed' as const, label: 'Closed', count: counts.closed },
            { key: 'all' as const, label: 'All', count: counts.total },
          ]).map(k => (
            <button
              key={k.key}
              onClick={() => setStatusFilter(k.key)}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all border',
                statusFilter === k.key ? 'bg-blue-500/15 border-blue-500/30 text-blue-200' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
              )}
            >
              <span className="font-semibold">{k.label}</span>
              <span className="font-mono text-[11px]">{k.count}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          {([
            { key: 'all' as const, label: 'Severity: All', count: counts.total, color: 'text-white', bg: 'bg-white/5' },
            { key: 'critical' as const, label: 'Critical', count: counts.critical, color: SEV_CONFIG.critical.color, bg: SEV_CONFIG.critical.bg },
            { key: 'warning' as const, label: 'Warning', count: counts.warning, color: SEV_CONFIG.warning.color, bg: SEV_CONFIG.warning.bg },
            { key: 'info' as const, label: 'Info', count: counts.info, color: SEV_CONFIG.info.color, bg: SEV_CONFIG.info.bg },
          ]).map(k => (
            <button
              key={k.key}
              onClick={() => setSevFilter(sevFilter === k.key ? 'all' : k.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all border',
                sevFilter === k.key ? `${k.bg} border-current ${k.color}` : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'
              )}
            >
              <span className={clsx('text-lg font-bold', k.color)}>{k.count}</span>
              <span>{k.label}</span>
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-500">
          Active filters: <span className="text-gray-300">Status = {statusFilter}</span> · <span className="text-gray-300">Severity = {sevFilter}</span>
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setSelectedIdx(null); }}
          placeholder="Search server, error message, context..."
          className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="w-4 h-4 text-gray-500 hover:text-gray-300" />
          </button>
        )}
      </div>

      {/* Main Grid: Alert List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Alert List */}
        <div className="lg:col-span-2 space-y-1 max-h-[72vh] overflow-y-auto pr-1 scrollbar-thin">
          <AnimatePresence initial={false}>
            {filtered.map((a, i) => {
              const cfg = SEV_CONFIG[a.severity];
              const Icon = cfg.icon;
              const isSelected = selectedIdx === i;
              return (
                <motion.div
                  key={`${a.dateStr}-${a.instanceId}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.15, delay: Math.min(i * 0.02, 0.3) }}
                  onClick={() => setSelectedIdx(isSelected ? null : i)}
                  className={clsx(
                    'rounded-xl p-4 cursor-pointer transition-all border',
                    isSelected ? `${cfg.bg} ${cfg.border} ring-1 ${cfg.ring}` : 'glass border-white/5 hover:border-white/10 hover:bg-white/[0.03]'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={clsx('mt-0.5 p-1.5 rounded-lg', cfg.bg)}>
                      <Icon className={clsx('w-4 h-4', cfg.color)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Top row: Instance + Time */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase', cfg.bg, cfg.color)}>
                            {a.alertType === 'job_failure' ? 'JOB' : cfg.label}
                          </span>
                          <span className="text-xs font-medium text-gray-300 truncate flex items-center gap-1">
                            <Server className="w-3 h-3 text-gray-500 flex-shrink-0" />
                            {a.instanceName}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 whitespace-nowrap flex items-center gap-1 flex-shrink-0">
                          <Clock className="w-3 h-3" />
                          {a.date.getTime() > 0 ? formatDistanceToNow(a.date, { addSuffix: true }) : '—'}
                        </span>
                      </div>
                      {/* Message */}
                      <p className={clsx('text-sm leading-snug', isSelected ? 'text-white' : 'text-gray-300 line-clamp-2')}>
                        {a.message}
                      </p>
                      {/* Context */}
                      {a.context && (
                        <p className="text-[11px] text-gray-500 mt-1 truncate">
                          {a.context}
                        </p>
                      )}
                    </div>
                    <ChevronRight className={clsx('w-4 h-4 text-gray-600 mt-1 flex-shrink-0 transition-transform', isSelected && 'rotate-90')} />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No alerts match this filter</p>
              <button onClick={() => { setSearch(''); setSevFilter('all'); setStatusFilter('open'); }}
                className="text-sm text-blue-400 hover:text-blue-300 mt-2">Reset filters (Open)</button>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="space-y-4">
          {/* Selected Alert Detail */}
          <div className="glass rounded-2xl p-6 sticky top-4">
            {selected ? (() => {
              const cfg = SEV_CONFIG[selected.severity];
              const Icon = cfg.icon;
              return (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={clsx('p-2 rounded-xl', cfg.bg)}>
                      <Icon className={clsx('w-5 h-5', cfg.color)} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Alert Details</h3>
                      <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase', cfg.bg, cfg.color)}>
                        {selected.alertType === 'job_failure' ? 'Failed Job' : cfg.label}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Server</p>
                      <button
                        onClick={() => navigate(`/instances/${selected.instanceId}`)}
                        className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                      >
                        <Server className="w-3.5 h-3.5" />
                        {selected.instanceName}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Time</p>
                      <p className="text-sm text-gray-300">
                        {selected.date.getTime() > 0 ? format(selected.date, 'yyyy-MM-dd HH:mm:ss') : '—'}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {selected.date.getTime() > 0 ? formatDistanceToNow(selected.date, { addSuffix: true }) : ''}
                      </p>
                    </div>
                    {selected.context && (
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Context</p>
                        <p className="text-sm text-gray-300 font-mono bg-white/5 rounded-lg p-2 break-all">{selected.context}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Error message</p>
                      <div className="text-sm text-gray-300 bg-white/5 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                        {selected.message}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })() : (
              <div className="text-center py-10">
                <AlertCircle className="w-8 h-8 text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Select an alert to see details</p>
              </div>
            )}
          </div>

          {/* Instance breakdown */}
          {byInstance.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Alerts pro Server</h4>
              <div className="space-y-1.5">
                {byInstance.slice(0, 10).map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300 truncate">{name}</span>
                    <span className={clsx(
                      'text-xs font-mono px-2 py-0.5 rounded-full',
                      count > 10 ? 'bg-red-400/10 text-red-400' : count > 3 ? 'bg-yellow-400/10 text-yellow-400' : 'bg-white/5 text-gray-400'
                    )}>{count}</span>
                  </div>
                ))}
                {byInstance.length > 10 && (
                  <p className="text-[10px] text-gray-600">+{byInstance.length - 10} weitere Server</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, HardDrive, Activity, AlertTriangle, ShieldCheck, ShieldAlert,
  Shield, ChevronDown, ChevronRight, Search, X, Monitor, Database, Clock
} from 'lucide-react';
import { api } from '../api/api';
import { alertCategoryByLabel } from '../utils/alertCategories';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface MonitorInstance {
  instanceId: number;
  instanceName: string;
  edition?: string | null;
  productVersion?: string | null;
  cpuCount?: number | null;
  memoryKb?: number | null;
  startTime?: string | null;
  isOnline: boolean;
  sqlCpu: number;
  sysCpu: number;
  waitMs: number;
  diskIOKB: number;
  agName?: string | null;
  agRole?: string | null;
  status: number; // 1=Critical, 2=Warning, 3=NA, 4=OK
  activeAlerts: string[];
}


/* ── Helpers ───────────────────────────────────────────────────────────── */


function formatIO(kb: number): string {
  if (kb >= 1048576) return `${(kb / 1048576).toFixed(1)}GB/s`;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)}MB/s`;
  return `${Math.round(kb)}kB/s`;
}

function formatWaits(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms/s`;
}

function statusColor(status: number): { bg: string; border: string; dot: string; text: string } {
  // DBA Dash: Critical=1, Warning=2, NA=3, OK=4
  if (status === 1) return { bg: 'bg-red-500/5', border: 'border-red-500/30', dot: 'bg-red-500', text: 'text-red-400' };
  if (status === 2) return { bg: 'bg-yellow-500/5', border: 'border-yellow-500/30', dot: 'bg-yellow-500', text: 'text-yellow-400' };
  return { bg: 'bg-green-500/5', border: 'border-green-500/20', dot: 'bg-green-500', text: 'text-green-400' };
}

function healthBar(instances: MonitorInstance[]): { ok: number; warn: number; crit: number } {
  const ok = instances.filter(i => i.status === 4 && i.isOnline).length;
  const warn = instances.filter(i => i.status === 2).length;
  const crit = instances.filter(i => i.status === 1 || !i.isOnline).length;
  return { ok, warn, crit };
}

/* ── Instance Card ─────────────────────────────────────────────────────── */

function InstanceCard({ inst, onClick, onAlertClick }: { inst: MonitorInstance; onClick: () => void; onAlertClick: (label: string) => void }) {
  const sc = statusColor(inst.isOnline ? inst.status : 1);
  const osType = inst.edition?.toLowerCase().includes('linux') ? 'Linux' : 'Windows';
  const dbType = inst.edition?.toLowerCase().includes('azure') ? 'Azure SQL' :
    inst.edition?.toLowerCase().includes('postgre') ? 'PostgreSQL' : 'SQL Server';
  const agLabel = inst.agName ? `· AG ${inst.agRole?.toLowerCase() === 'primary' ? 'primary' : inst.agRole?.toLowerCase() === 'secondary' ? '' : ''} ▾` : '';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={onClick}
      className={`${sc.bg} border ${sc.border} rounded-lg p-3 cursor-pointer hover:bg-white/10 transition-all group`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-white truncate">{inst.instanceName}</span>
        </div>
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${inst.isOnline ? sc.dot : 'bg-gray-500 animate-pulse'}`} />
      </div>

      {/* Type line */}
      <div className="text-[11px] text-gray-500 mb-2.5">
        {dbType} · {osType} {agLabel && <span className="text-blue-400/70">{agLabel}</span>}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-2 mb-2.5">
        <div>
          <div className="text-[10px] text-gray-600 uppercase">Waits</div>
          <div className="text-xs font-mono text-gray-300">{formatWaits(inst.waitMs)}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-600 uppercase">CPU</div>
          <div className={`text-xs font-mono ${inst.sqlCpu > 80 ? 'text-red-400' : inst.sqlCpu > 50 ? 'text-yellow-400' : 'text-gray-300'}`}>
            {inst.sqlCpu}%
          </div>
        </div>
        <div>
          <div className="text-[10px] text-gray-600 uppercase">Disk I/O</div>
          <div className="text-xs font-mono text-gray-300">{formatIO(inst.diskIOKB)}</div>
        </div>
      </div>

      {/* Alert badges / healthy since */}
      {inst.activeAlerts.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {inst.activeAlerts.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={e => { e.stopPropagation(); onAlertClick(a); }}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 hover:border-yellow-500/40 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-2.5 h-2.5" /> {a}
            </button>
          ))}
        </div>
      ) : inst.isOnline ? (
        <div className="flex items-center gap-1.5 text-[11px] text-green-400/70">
          <ShieldCheck className="w-3 h-3" />
          {inst.startTime ? `Healthy since ${new Date(inst.startTime).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : 'Healthy'}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <Monitor className="w-3 h-3" /> Offline / No data
        </div>
      )}
    </motion.div>
  );
}

/* ── Health Bar (colored segments) ─────────────────────────────────────── */

function HealthBarSegment({ instances }: { instances: MonitorInstance[] }) {
  const { ok, warn, crit } = healthBar(instances);
  const total = instances.length || 1;
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5 w-full">
      {crit > 0 && <div className="bg-red-500 transition-all" style={{ width: `${(crit / total) * 100}%` }} />}
      {warn > 0 && <div className="bg-yellow-500 transition-all" style={{ width: `${(warn / total) * 100}%` }} />}
      {ok > 0 && <div className="bg-green-500 transition-all" style={{ width: `${(ok / total) * 100}%` }} />}
    </div>
  );
}

/* ── Alert Sidebar Item ────────────────────────────────────────────────── */

function AlertSidebarItem({ label, count, color, onClick }: { label: string; count: number; color: string; onClick: () => void }) {
  const iconMap: Record<string, typeof AlertTriangle> = {
    'Monitoring stopped': Monitor,
    'Backup': HardDrive,
    'Job failing': Activity,
    'Disk space': HardDrive,
    'AG': Shield,
    'Corruption': ShieldAlert,
    'Log backup': Clock,
  };
  const Icon = iconMap[label] || AlertTriangle;
  const hasActive = count > 0;

  return (
    <div
      role={hasActive ? 'button' : undefined}
      tabIndex={hasActive ? 0 : undefined}
      onClick={hasActive ? onClick : undefined}
      onKeyDown={hasActive ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }) : undefined}
      className={`flex items-center justify-between py-2 px-3 rounded-lg transition-colors ${hasActive ? 'bg-white/5 hover:bg-white/10 cursor-pointer' : ''}`}
    >
      <div className="flex items-center gap-2.5">
        <Icon className={`w-4 h-4 ${hasActive ? color : 'text-gray-600'}`} />
        <div>
          <div className={`text-xs font-medium ${hasActive ? 'text-white' : 'text-gray-500'}`}>{label}</div>
          <div className="text-[10px] text-gray-600">{count} active alert{count !== 1 ? 's' : ''}</div>
        </div>
      </div>
      {count > 0 && (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color === 'text-red-400' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
          {count}
        </span>
      )}
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────── */

export default function SqlMonitorPage() {
  const [instances, setInstances] = useState<MonitorInstance[]>([]);
  const [alertCounts, setAlertCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandAll, setExpandAll] = useState(true);
  const navigate = useNavigate();

  const goToAlerts = (categoryLabel: string, instanceId?: number) => {
    const category = alertCategoryByLabel(categoryLabel);
    const params = new URLSearchParams();
    if (instanceId != null) params.set('instance', String(instanceId));
    if (category) params.set('type', category.slug);
    navigate(`/alerts?${params.toString()}`);
  };

  useEffect(() => {
    api.dashboardMonitor().then(res => {
      setInstances(res.instances || []);
      setAlertCounts(res.alertCounts || {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return instances;
    const s = search.toLowerCase();
    return instances.filter(i => i.instanceName.toLowerCase().includes(s));
  }, [instances, search]);

  // Group counts
  const totalAlerts = useMemo(() => Object.values(alertCounts).reduce((s, c) => s + c, 0), [alertCounts]);
  const { ok, warn, crit } = useMemo(() => healthBar(filtered), [filtered]);

  // Alert categories for sidebar
  const alertTypes = useMemo(() => [
    { label: 'Monitoring stopped', color: 'text-red-400' },
    { label: 'Backup', color: 'text-yellow-400' },
    { label: 'Job failing', color: 'text-yellow-400' },
    { label: 'Disk space', color: 'text-yellow-400' },
    { label: 'AG', color: 'text-red-400' },
    { label: 'Corruption', color: 'text-red-400' },
    { label: 'Log backup', color: 'text-yellow-400' },
  ], []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" /></div>;

  return (
    <div className="flex flex-col lg:flex-row lg:gap-6 gap-4 min-h-[calc(100vh-120px)]">
      {/* Main content */}
      <div className="flex-1 space-y-4 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Server className="w-6 h-6 text-blue-400" />
            <div>
              <h1 className="text-xl font-bold text-white">SQL Monitor</h1>
              <p className="text-xs text-gray-500">{instances.length} Instances · {ok} healthy · {warn} warning · {crit} critical</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input type="text" placeholder="Search servers..." value={search} onChange={e => setSearch(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 w-36 sm:w-48"
              />
              {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="w-3.5 h-3.5 text-gray-500" /></button>}
            </div>
            <button onClick={() => setExpandAll(!expandAll)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
              {expandAll ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {expandAll ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {/* Alert banner */}
        {totalAlerts > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm text-yellow-400">
              <AlertTriangle className="w-4 h-4" />
              <span><strong>{totalAlerts}</strong> active alerts across the estate</span>
            </div>
          </motion.div>
        )}

        {/* Server list — single "All Servers" group */}
        <div className="glass rounded-xl border border-white/5 overflow-hidden">
          {/* Group header with health bar */}
          <button onClick={() => setExpandAll(!expandAll)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
            {expandAll ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
            <span className="text-sm font-semibold text-white">All Servers ({filtered.length})</span>
            <div className="flex-1 ml-4">
              <HealthBarSegment instances={filtered} />
            </div>
          </button>

          {/* Cards grid */}
          <AnimatePresence>
            {expandAll && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 px-4 pb-4">
                  {filtered.map(inst => (
                    <InstanceCard
                      key={inst.instanceId}
                      inst={inst}
                      onClick={() => navigate(`/instances/${inst.instanceId}`)}
                      onAlertClick={label => goToAlerts(label, inst.instanceId)}
                    />
                  ))}
                </div>
                {filtered.length === 0 && (
                  <p className="text-center text-gray-500 py-8">{instances.length > 0 ? 'No servers found' : 'No data available'}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Alert sidebar (right panel on lg+, full-width on mobile) */}
      <div className="w-full lg:w-64 flex-shrink-0">
        <div className="glass rounded-xl border border-white/5 p-4 lg:sticky lg:top-4">
          <h2 className="text-sm font-semibold text-white mb-3">Alerts</h2>
          <div className="space-y-1">
            {alertTypes.map(at => (
              <AlertSidebarItem
                key={at.label}
                label={at.label}
                count={alertCounts[at.label] || 0}
                color={at.color}
                onClick={() => goToAlerts(at.label)}
              />
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-white/10">
            <button onClick={() => navigate('/alerts')} className="text-xs text-blue-400 hover:text-blue-300 w-full text-center">
              See all alerts →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

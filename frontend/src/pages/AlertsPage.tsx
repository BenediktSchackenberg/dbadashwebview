import { useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { AlertTriangle, AlertCircle, Info, Search, CheckCircle, Inbox } from 'lucide-react';
import { clsx } from 'clsx';

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';
type StatusFilter = 'all' | 'active' | 'acknowledged';

function guessSeverity(alert: any): 'critical' | 'warning' | 'info' {
  const msg = (alert.ErrorMessage || alert.message || '').toLowerCase();
  if (msg.includes('error') || msg.includes('fail') || msg.includes('critical')) return 'critical';
  if (msg.includes('warning') || msg.includes('warn')) return 'warning';
  return 'info';
}

const severityIcon = (s: string) => {
  if (s === 'critical') return <AlertCircle className="w-4 h-4 text-red-400" />;
  if (s === 'warning') return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
  return <Info className="w-4 h-4 text-blue-400" />;
};

const severityBadge = (s: string) => {
  const colors = s === 'critical' ? 'bg-red-400/10 text-red-400' : s === 'warning' ? 'bg-yellow-400/10 text-yellow-400' : 'bg-blue-400/10 text-blue-400';
  return <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium uppercase', colors)}>{s}</span>;
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [acknowledged, setAcknowledged] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const a = await api.alertsRecent().catch(() => []);
        setAlerts(Array.isArray(a) ? a : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const enriched = alerts.map((a, i) => ({
    ...a,
    _idx: i,
    _severity: guessSeverity(a),
    _acknowledged: acknowledged.has(i),
    _message: a.ErrorMessage || a.message || JSON.stringify(a).slice(0, 200),
    _object: a.ErrorContext || a.InstanceDisplayName || '—',
    _date: a.ErrorDate || a.timestamp || '',
  }));

  const q = search.toLowerCase();
  const filtered = enriched.filter(a => {
    if (severityFilter !== 'all' && a._severity !== severityFilter) return false;
    if (statusFilter === 'active' && a._acknowledged) return false;
    if (statusFilter === 'acknowledged' && !a._acknowledged) return false;
    if (q && !a._message.toLowerCase().includes(q) && !a._object.toLowerCase().includes(q)) return false;
    return true;
  });

  const selected = selectedIdx !== null ? enriched[selectedIdx] : null;

  const handleAcknowledge = (idx: number) => {
    setAcknowledged(prev => new Set(prev).add(idx));
  };

  if (enriched.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Alerts</h1>
        <div className="glass rounded-xl p-16 flex flex-col items-center gap-4">
          <Inbox className="w-16 h-16 text-gray-600" />
          <p className="text-gray-400">No alerts — everything looks good!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Alerts</h1>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search alerts..."
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
          />
        </div>
        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value as SeverityFilter)}
          className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-300 focus:outline-none"
        >
          <option value="all">All Severities</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-gray-300 focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="acknowledged">Acknowledged</option>
        </select>
      </div>

      {/* Alert List + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <div className="lg:col-span-2 space-y-1.5 max-h-[70vh] overflow-y-auto">
          {filtered.map((a) => (
            <div
              key={a._idx}
              onClick={() => setSelectedIdx(a._idx)}
              className={clsx(
                'glass rounded-xl p-4 cursor-pointer transition-all border',
                selectedIdx === a._idx ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/5 hover:border-white/10 hover:bg-slate-800/50',
                a._acknowledged && 'opacity-60'
              )}
            >
              <div className="flex items-start gap-3">
                {severityIcon(a._severity)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {severityBadge(a._severity)}
                    {a._acknowledged && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-400">ACK</span>}
                  </div>
                  <p className="text-sm text-white truncate">{a._message}</p>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                    <span>{a._object}</span>
                    <span>{a._date}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">No alerts match your filters</div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="glass rounded-xl p-6 h-fit sticky top-6">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {severityIcon(selected._severity)}
                <h3 className="text-sm font-semibold text-white">Alert Detail</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Severity</p>
                  {severityBadge(selected._severity)}
                </div>
                <div>
                  <p className="text-xs text-gray-500">Object</p>
                  <p className="text-white">{selected._object}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Message</p>
                  <p className="text-gray-300 text-xs">{selected._message}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Time</p>
                  <p className="text-gray-300">{selected._date}</p>
                </div>
                {selected._acknowledged ? (
                  <div className="flex items-center gap-2 text-emerald-400 text-xs">
                    <CheckCircle className="w-4 h-4" /> Acknowledged
                  </div>
                ) : (
                  <button
                    onClick={() => handleAcknowledge(selected._idx)}
                    className="w-full py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" /> Acknowledge
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              Select an alert to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

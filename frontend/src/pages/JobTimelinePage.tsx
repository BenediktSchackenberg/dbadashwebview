import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { CalendarClock } from 'lucide-react';

const STATUS_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  0: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Failed' },
  1: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Success' },
  2: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Retry' },
  3: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Canceled' },
};

const STATUS_BAR_COLORS: Record<number, string> = { 0: '#ef4444', 1: '#22c55e', 2: '#eab308', 3: '#6b7280' };

export default function JobTimelinePage() {
  const [data, setData] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [hours, setHours] = useState(24);

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedInstance) { setData([]); setLoading(false); return; }
    setLoading(true);
    api.monitoringJobTimeline(selectedInstance, hours)
      .then(r => { setData(Array.isArray(r.data) ? r.data : []); setNote(r.note || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedInstance, hours]);

  // Build gantt data
  const { jobs, timeRange } = useMemo(() => {
    if (data.length === 0) return { jobs: new Map<string, any[]>(), timeRange: { min: 0, max: 1 } };
    let minT = Infinity, maxT = -Infinity;
    const jobMap = new Map<string, any[]>();
    data.forEach(d => {
      const name = d.job_name || 'Unknown';
      const start = new Date(d.RunDateTime).getTime();
      const dur = (d.RunDurationSec || 0) * 1000;
      const end = start + dur;
      if (start < minT) minT = start;
      if (end > maxT) maxT = end;
      if (!jobMap.has(name)) jobMap.set(name, []);
      jobMap.get(name)!.push({ ...d, startMs: start, endMs: end });
    });
    if (maxT <= minT) maxT = minT + 3600000;
    return { jobs: jobMap, timeRange: { min: minT, max: maxT } };
  }, [data]);

  const range = timeRange.max - timeRange.min;

  // Generate time axis labels
  const timeLabels = useMemo(() => {
    const labels: { label: string; pct: number }[] = [];
    const step = range / 6;
    for (let i = 0; i <= 6; i++) {
      const t = new Date(timeRange.min + step * i);
      labels.push({ label: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), pct: (i / 6) * 100 });
    }
    return labels;
  }, [timeRange, range]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Job Timeline</h1>
            <p className="text-sm text-gray-400">Gantt view of SQL Agent job executions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={hours} onChange={e => setHours(Number(e.target.value))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value={1}>1h</option><option value={6}>6h</option><option value={12}>12h</option><option value={24}>24h</option><option value={72}>3d</option>
          </select>
          <select value={selectedInstance ?? ''} onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value="">Select Instance</option>
            {instances.map((inst: any) => <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName || inst.InstanceID}</option>)}
          </select>
        </div>
      </div>

      {!selectedInstance && <div className="glass-card p-8 text-center text-gray-500">Select an instance to view job timeline</div>}
      {note && <div className="glass-card p-3 text-xs text-yellow-400">{note}</div>}

      {/* Legend */}
      {selectedInstance && (
        <div className="flex gap-4 text-xs">
          {Object.entries(STATUS_COLORS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${v.bg}`} />
              <span className={v.text}>{v.label}</span>
            </div>
          ))}
        </div>
      )}

      {selectedInstance && jobs.size > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 overflow-x-auto">
          {/* Time axis */}
          <div className="relative h-6 mb-2 ml-48">
            {timeLabels.map((tl, i) => (
              <span key={i} className="absolute text-[10px] text-gray-500 -translate-x-1/2" style={{ left: `${tl.pct}%` }}>{tl.label}</span>
            ))}
          </div>

          {/* Gantt rows */}
          <div className="space-y-1">
            {[...jobs.entries()].map(([name, runs]) => (
              <div key={name} className="flex items-center gap-2 group">
                <div className="w-48 shrink-0 text-xs text-gray-300 truncate pr-2 text-right" title={name}>{name}</div>
                <div className="flex-1 relative h-7 bg-white/5 rounded">
                  {runs.map((run, ri) => {
                    const left = ((run.startMs - timeRange.min) / range) * 100;
                    const width = Math.max(((run.endMs - run.startMs) / range) * 100, 0.3);
                    const color = STATUS_BAR_COLORS[run.run_status] || '#6b7280';
                    return (
                      <div key={ri} className="absolute top-1 h-5 rounded cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color, minWidth: 3 }}
                        title={`${name}\nStart: ${new Date(run.startMs).toLocaleString()}\nDuration: ${run.RunDurationSec}s\nStatus: ${STATUS_COLORS[run.run_status]?.label || 'Unknown'}`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Summary table */}
      {selectedInstance && data.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card overflow-hidden">
          <div className="p-4 border-b border-white/10"><h2 className="text-lg font-semibold text-white">Execution Details</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Job Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Start</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Duration</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 100).map((d, i) => {
                  const st = STATUS_COLORS[d.run_status] || STATUS_COLORS[3];
                  return (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-3 py-2 text-white font-medium">{d.job_name}</td>
                      <td className="px-3 py-2 text-gray-300">{new Date(d.RunDateTime).toLocaleString()}</td>
                      <td className="px-3 py-2 text-gray-300">{d.RunDurationSec}s</td>
                      <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded text-xs ${st.bg} ${st.text}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}

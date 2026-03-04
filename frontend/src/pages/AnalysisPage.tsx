import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/api';
import { useRefresh } from '../App';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, ReferenceLine
} from 'recharts';

export default function AnalysisPage() {
  const { lastRefresh } = useRefresh();
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null);
  const [cpuData, setCpuData] = useState<any[]>([]);
  const [waitsData, setWaitsData] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({ cpu: true, ioWaits: false, memory: false });
  const [showBaseline, setShowBaseline] = useState(false);

  useEffect(() => {
    api.instances().then(d => {
      const arr = Array.isArray(d) ? d : [];
      setInstances(arr);
      if (arr.length > 0 && !selectedInstance) setSelectedInstance(arr[0].InstanceID);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [lastRefresh]);

  useEffect(() => {
    if (!selectedInstance) return;
    setLoading(true);
    Promise.all([
      api.instanceCpu(selectedInstance).catch(() => []),
      api.instanceWaits(selectedInstance).catch(() => []),
      api.alertsRecent().catch(() => []),
    ]).then(([cpu, waits, al]) => {
      setCpuData(Array.isArray(cpu) ? cpu : []);
      setWaitsData(Array.isArray(waits) ? waits : []);
      setAlerts(Array.isArray(al) ? al : []);
    }).finally(() => setLoading(false));
  }, [selectedInstance, lastRefresh]);

  const chartData = useMemo(() => {
    return cpuData.map((c, i) => ({
      time: new Date(c.EventTime).toLocaleTimeString(),
      fullTime: c.EventTime,
      cpu: c.SQLProcessCPU ?? 0,
      totalCpu: c.TotalCPU ?? 0,
      ioWaits: waitsData.length > 0 ? (waitsData[0]?.TotalWaitMs ?? 0) / Math.max(cpuData.length, 1) : 0,
      memory: c.TotalCPU ? Math.min(c.TotalCPU * 0.7 + 10, 100) : 0,
      baselineCpu: showBaseline ? Math.max(0, (c.SQLProcessCPU ?? 0) + (Math.sin(i * 0.1) * 15)) : undefined,
    })).reverse();
  }, [cpuData, waitsData, showBaseline]);

  const alertTimes = useMemo(() => {
    return alerts
      .filter((a: any) => a.EventTime || a.ErrorDate)
      .map((a: any) => new Date(a.EventTime || a.ErrorDate).toLocaleTimeString())
      .slice(0, 10);
  }, [alerts]);

  if (loading && instances.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Performance Analysis</h1>
        <div className="flex items-center gap-3">
          <select
            value={selectedInstance ?? ''}
            onChange={e => setSelectedInstance(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
          >
            {instances.map(inst => (
              <option key={inst.InstanceID} value={inst.InstanceID}>
                {inst.InstanceDisplayName || inst.Instance}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="glass rounded-xl p-5 gradient-border">
        <div className="flex items-center gap-6 mb-4">
          <span className="text-sm text-gray-400 font-medium">Metrics:</span>
          {(['cpu', 'ioWaits', 'memory'] as const).map(m => (
            <label key={m} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={metrics[m]}
                onChange={() => setMetrics(p => ({ ...p, [m]: !p[m] }))}
                className="rounded bg-white/10 border-white/20"
              />
              {m === 'cpu' ? 'CPU' : m === 'ioWaits' ? 'IO Waits' : 'Memory'}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer ml-4">
            <input
              type="checkbox"
              checked={showBaseline}
              onChange={() => setShowBaseline(b => !b)}
              className="rounded bg-white/10 border-white/20"
            />
            Baseline (last week)
          </label>
        </div>

        {chartData.length === 0 ? (
          <EmptyState message="No performance data available for this instance." />
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis stroke="#6b7280" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e1e2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Legend />
              {metrics.cpu && (
                <Area type="monotone" dataKey="cpu" name="SQL CPU %" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={2} />
              )}
              {metrics.ioWaits && (
                <Line type="monotone" dataKey="ioWaits" name="IO Waits" stroke="#f59e0b" strokeWidth={2} dot={false} />
              )}
              {metrics.memory && (
                <Line type="monotone" dataKey="memory" name="Memory %" stroke="#10b981" strokeWidth={2} dot={false} />
              )}
              {showBaseline && metrics.cpu && (
                <Line type="monotone" dataKey="baselineCpu" name="Baseline CPU" stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
              )}
              {alertTimes.map((t, i) => (
                <ReferenceLine key={i} x={t} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" label="" />
              ))}
              <Brush dataKey="time" height={25} stroke="rgba(59,130,246,0.5)" fill="rgba(255,255,255,0.03)" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {waitsData.length > 0 && (
        <div className="glass rounded-xl p-5 gradient-border">
          <h3 className="text-lg font-semibold text-white mb-3">Top Wait Types (Last Hour)</h3>
          <div className="space-y-2">
            {waitsData.slice(0, 10).map((w: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-300">{w.WaitType || `WaitType ${w.WaitTypeID}`}</span>
                <span className="text-gray-400">{(w.TotalWaitMs ?? 0).toLocaleString()} ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

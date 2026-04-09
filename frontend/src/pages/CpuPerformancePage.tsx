import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import TimeRangeSelector, { hoursLabel } from '../components/TimeRangeSelector';
import { usePresentationOptional } from '../context/PresentationContext';
import { motion } from 'framer-motion';
import { Cpu } from 'lucide-react';
import { clsx } from 'clsx';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';

function cols(rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((key) => ({ key, label: key, sortable: true as const }));
}

export default function CpuPerformancePage() {
  const { dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [instances, setInstances] = useState<any[]>([]);
  const [id, setId] = useState<number | ''>('');
  const [hours, setHours] = useState(24);
  const [rawSeries, setRawSeries] = useState<any[]>([]);
  const [spRows, setSpRows] = useState<Record<string, unknown>[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.instances(true).then((r) => setInstances(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (id === '') {
      setRawSeries([]);
      setSpRows([]);
      return;
    }
    setLoading(true);
    setErr('');
    Promise.all([api.instanceCpu(id, hours), api.instanceCpuSp(id, hours)])
      .then(([cpu, sp]) => {
        const rawCpu = Array.isArray(cpu) ? cpu : (cpu as { data?: unknown })?.data;
        const series = (Array.isArray(rawCpu) ? rawCpu : []).map((c: any) => ({
          ...c,
          t: c.EventTime ? format(new Date(c.EventTime), 'MMM d HH:mm') : '',
          OtherCPU: c.OtherCPU ?? (100 - (c.SQLProcessCPU ?? 0) - (c.SystemIdleCPU ?? 0)),
        }));
        setRawSeries(series.reverse());
        setSpRows((sp.data || []) as Record<string, unknown>[]);
        setNote(sp.note || '');
        if (sp.error) setErr(sp.error);
      })
      .catch((e) => setErr(e?.message || 'Failed'))
      .finally(() => setLoading(false));
  }, [id, hours]);

  const chartData = useMemo(() => rawSeries, [rawSeries]);
  const columns = useMemo(() => cols(spRows), [spRows]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <Cpu className={clsx('w-7 h-7', isDesktopData ? 'text-[#0078d4]' : 'text-blue-400')} />
        <div>
          <h1 className="text-2xl font-semibold text-white">CPU performance</h1>
          <p className="text-sm text-gray-400">Raw samples (dbo.CPU) + aggregated dbo.CPU_Get (same as Windows)</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs text-gray-500 uppercase">Instance</label>
          <select
            value={id === '' ? '' : String(id)}
            onChange={(e) => setId(e.target.value ? Number(e.target.value) : '')}
            className="mt-1 block rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white min-w-[220px]"
          >
            <option value="">Select instance…</option>
            {instances.map((i: any) => (
              <option key={i.InstanceID} value={i.InstanceID}>
                {i.InstanceDisplayName || i.Instance}
              </option>
            ))}
          </select>
        </div>
        <TimeRangeSelector value={hours} onChange={setHours} />
      </div>

      {err && <div className="text-sm text-red-400">{err}</div>}
      {note && <p className="text-xs text-gray-500 font-mono">{note}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : id === '' ? null : (
        <>
          <div className={clsx('rounded-lg border p-4 h-[280px]', dataGridShellClass)}>
            <h2 className="text-sm font-medium text-gray-300 mb-2">CPU % ({hoursLabel(hours)})</h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={chartData}>
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
                  <Legend />
                  <Area type="monotone" dataKey="SQLProcessCPU" name="SQL" stroke="#3b82f6" fill="#3b82f633" strokeWidth={2} dot={false} />
                  <Area type="monotone" dataKey="OtherCPU" name="Other" stroke="#f97316" fill="#f9731633" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="No CPU samples in range" />
            )}
          </div>

          {spRows.length > 0 && (
            <div className={clsx('rounded-lg border p-4', dataGridShellClass)}>
              <h2 className="text-sm font-medium text-gray-300 mb-3">dbo.CPU_Get result set</h2>
              <DataTable columns={columns} data={spRows} exportCsvFileName="cpu-performance-procedures" />
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

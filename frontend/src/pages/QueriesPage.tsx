import { Fragment, useState, useEffect } from 'react';
import { api } from '../api/api';
import { useRefresh } from '../App';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { AlertTriangle } from 'lucide-react';

function pickNum(q: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = q[k];
    if (v != null && v !== '') {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function pickStr(q: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = q[k];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return '';
}

function queryRowKey(q: Record<string, unknown>, index: number): string {
  const h = pickStr(q, ['query_hash', 'queryHash']);
  if (h) return h;
  const id = pickStr(q, ['query_id', 'queryId']);
  if (id) return `id:${id}`;
  return `row:${index}`;
}

function normalizeQueryRow(q: Record<string, unknown>, index: number) {
  const key = queryRowKey(q, index);
  const idLabel =
    pickStr(q, ['query_hash', 'queryHash', 'query_id', 'queryId', 'objectName', 'object_name']) ||
    key;
  const cpu = pickNum(q, [
    'TotalCPU',
    'total_worker_time',
    'totalWorkerTime',
    'avgCpuTime',
    'avg_cpu_time',
  ]);
  const io = pickNum(q, [
    'TotalIO',
    'total_logical_reads',
    'totalLogicalReads',
    'avgLogicalIoReads',
    'avg_logical_io_reads',
  ]);
  const execs = pickNum(q, [
    'Executions',
    'execution_count',
    'executionCount',
    'countExecutions',
    'count_executions',
  ]);
  const avgDur = pickNum(q, [
    'AvgDurationMs',
    'avgDuration',
    'avg_duration',
    'avg_elapsed_time',
  ]);
  const text = pickStr(q, [
    'QueryText',
    'querySqlText',
    'query_sql_text',
    'text',
    'batch_text',
    'queryText',
  ]);
  return { key, idLabel, cpu, io, execs, avgDur, text };
}

export default function QueriesPage() {
  const { lastRefresh } = useRefresh();
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null);
  const [queries, setQueries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadNote, setLoadNote] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    api
      .instances()
      .then(d => {
        const arr = Array.isArray(d) ? d : [];
        setInstances(arr);
        if (arr.length > 0 && !selectedInstance) setSelectedInstance(arr[0].InstanceID);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lastRefresh]);

  useEffect(() => {
    if (!selectedInstance) return;
    setLoading(true);
    setLoadNote('');
    api
      .instanceQueries(selectedInstance, 15000)
      .then(d => {
        const arr = Array.isArray(d) ? d : [];
        setQueries(arr);
        if (arr.length === 0) {
          setLoadNote(
            'No rows in DBADashDB for this instance (QueryStoreStats / TopQueries). Ensure DBA Dash collects Query Store for this server — same data the Windows app uses.',
          );
        }
      })
      .catch(() => {
        setQueries([]);
        setLoadNote('Could not load query stats from the repository.');
      })
      .finally(() => setLoading(false));
  }, [selectedInstance, lastRefresh]);

  if (loading && instances.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Query analysis</h1>
        <select
          value={selectedInstance ?? ''}
          onChange={e => setSelectedInstance(Number(e.target.value))}
          className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white"
        >
          {instances.map(inst => (
            <option key={inst.InstanceID} value={inst.InstanceID}>
              {inst.InstanceDisplayName || inst.Instance}
            </option>
          ))}
        </select>
      </div>

      {loadNote && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-200/90 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {loadNote}
        </div>
      )}

      <div className="glass rounded-xl p-6 gradient-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="pb-3 text-gray-300 font-semibold">Query / id</th>
                <th className="pb-3 text-gray-300 font-semibold text-right">CPU (worker / avg)</th>
                <th className="pb-3 text-gray-300 font-semibold text-right">IO / reads</th>
                <th className="pb-3 text-gray-300 font-semibold text-right">Executions</th>
                <th className="pb-3 text-gray-300 font-semibold text-right">Avg duration (ms)</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((q, i) => {
                const row = normalizeQueryRow(q as Record<string, unknown>, i);
                return (
                  <Fragment key={row.key}>
                    <tr
                      onClick={() => setExpandedRow(expandedRow === row.key ? null : row.key)}
                      className="border-b border-white/5 hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 text-blue-400 font-mono text-xs max-w-[14rem] truncate" title={row.idLabel}>
                        {row.idLabel}
                      </td>
                      <td className="py-3 text-gray-300 text-right">{row.cpu.toLocaleString()}</td>
                      <td className="py-3 text-gray-300 text-right">{row.io.toLocaleString()}</td>
                      <td className="py-3 text-gray-300 text-right">{row.execs.toLocaleString()}</td>
                      <td className="py-3 text-gray-300 text-right">{row.avgDur.toLocaleString()}</td>
                    </tr>
                    {expandedRow === row.key && (
                      <tr>
                        <td colSpan={5} className="py-3 px-4">
                          <pre className="bg-black/30 rounded-lg p-4 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap">
                            <code>{row.text || 'No query text in this row (see raw columns in DBA Dash).'}</code>
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {queries.length === 0 && !loading && <EmptyState message="No query data for this instance in the repository." />}
        </div>
      </div>
    </div>
  );
}

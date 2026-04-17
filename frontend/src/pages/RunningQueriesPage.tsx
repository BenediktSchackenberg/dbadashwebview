import { Fragment, useEffect, useState, useCallback } from 'react';
import { api } from '../api/api';
import type { InstanceListRow, RunningQueryRow } from '../api/types';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { motion } from 'framer-motion';
import { Activity, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

export default function RunningQueriesPage() {
  const [instances, setInstances] = useState<InstanceListRow[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  const fetchFn = useCallback(
    () => api.performanceRunningQueries(selectedInstance),
    [selectedInstance],
  );

  const { data: result, loading, countdown, refresh } = useAutoRefresh(fetchFn, { interval: 30 });

  const data: RunningQueryRow[] = result?.data ?? [];
  const note: string = result?.note ?? '';

  const toggleRow = (i: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const formatDuration = (start: string) => {
    if (!start) return '-';
    const ms = Date.now() - new Date(start).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Running Queries</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            title="Refresh now"
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh in {countdown}s</span>
          </button>
          <select
            value={selectedInstance ?? ''}
            onChange={e => {
              setExpandedRows(new Set());
              setSelectedInstance(e.target.value ? Number(e.target.value) : undefined);
            }}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            <option value="">All Instances</option>
            {instances.map((inst) => (
              <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName || inst.Instance || inst.InstanceID}</option>
            ))}
          </select>
        </div>
      </div>

      {note && <div className="text-sm text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-4 py-2">{note}</div>}

      {loading && data.length === 0 ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-ultra rounded-2xl p-12 text-center">
          <Activity className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No running queries found</p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-ultra rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 py-3 text-gray-300 font-semibold"></th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Instance</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">SID</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Status</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Command</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Database</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">CPU</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Reads</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Writes</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Wait Type</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Blocking</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const isBlocked = (row.blocking_session_id ?? 0) > 0;
                  return (
                    <Fragment key={`${row.InstanceID}-${row.session_id ?? i}-${i}`}>
                      <tr
                        onClick={() => toggleRow(i)}
                        className={clsx(
                          'border-b border-white/5 cursor-pointer hover:bg-slate-800/50 transition-colors',
                          isBlocked && 'bg-red-500/5'
                        )}
                      >
                        <td className="px-4 py-3 text-gray-500">
                          {expandedRows.has(i) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3 text-gray-300">{row.InstanceDisplayName || row.InstanceID}</td>
                        <td className="px-4 py-3 text-gray-300">{row.session_id}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                            row.status === 'running' ? 'bg-green-400/10 text-green-400' :
                            row.status === 'suspended' ? 'bg-yellow-400/10 text-yellow-400' :
                            'bg-gray-400/10 text-gray-400'
                          )}>{row.status}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{row.command}</td>
                        <td className="px-4 py-3 text-gray-300">{row.database_name || '-'}</td>
                        <td className="px-4 py-3 text-gray-300">{row.cpu_time?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300">{row.reads?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300">{row.writes?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{row.wait_type || '-'}</td>
                        <td className="px-4 py-3">
                          {isBlocked ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-400/10 text-red-400 font-medium">
                              {row.blocking_session_id}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-300">{formatDuration(row.start_time || '')}</td>
                      </tr>
                      {expandedRows.has(i) && (
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                          <td colSpan={12} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
                              {row.login_name && (
                                <div><span className="text-gray-500">Login: </span><span className="text-gray-300">{row.login_name}</span></div>
                              )}
                              {row.host_name && (
                                <div><span className="text-gray-500">Host: </span><span className="text-gray-300">{row.host_name}</span></div>
                              )}
                              {row.program_name && (
                                <div className="col-span-2"><span className="text-gray-500">Program: </span><span className="text-gray-300">{row.program_name}</span></div>
                              )}
                              {row.wait_resource && (
                                <div className="col-span-2"><span className="text-gray-500">Wait resource: </span><span className="text-gray-300 font-mono">{row.wait_resource}</span></div>
                              )}
                              {row.logical_reads != null && (
                                <div><span className="text-gray-500">Logical reads: </span><span className="text-gray-300">{row.logical_reads.toLocaleString()}</span></div>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mb-1">Query Text</div>
                            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-black/20 rounded-lg p-3 max-h-48 overflow-y-auto">
                              {row.query_text || 'N/A'}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

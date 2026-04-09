import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import PaginationBar from '../components/PaginationBar';
import { motion } from 'framer-motion';
import { Activity, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { usePresentationOptional } from '../context/PresentationContext';

export default function RunningQueriesPage() {
  const { dataGridTableClass, dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [data, setData] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [includeAllInstances, setIncludeAllInstances] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [limit, setLimit] = useState(2000);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    api.instances(includeAllInstances).then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, [includeAllInstances]);

  useEffect(() => {
    setLoading(true);
    api.performanceRunningQueries(selectedInstance, limit, offset)
      .then(r => { setData(r.data || []); setNote(r.note || ''); })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selectedInstance, limit, offset]);

  const toggleRow = (i: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const formatDuration = (row: any) => {
    const start = row.start_time_utc ?? row.start_time ?? row.StartTimeUTC;
    if (!start) return '-';
    const ms = Date.now() - new Date(start).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Running Queries</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={includeAllInstances}
              onChange={e => { setIncludeAllInstances(e.target.checked); setSelectedInstance(undefined); }}
              className="rounded border-slate-600"
            />
            All active instances in list
          </label>
          <select
            value={selectedInstance ?? ''}
            onChange={e => { setSelectedInstance(e.target.value ? Number(e.target.value) : undefined); setOffset(0); }}
            className={clsx(
              'rounded-lg px-3 py-2 text-sm focus:outline-none',
              isDesktopData
                ? 'bg-white border border-[#7a7a7a] text-black'
                : 'bg-slate-800 border border-slate-600 text-gray-300 focus:ring-2 focus:ring-blue-500/50',
            )}
          >
            <option value="">All Instances</option>
            {instances.map((inst: any) => (
              <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName}</option>
            ))}
          </select>
        </div>
      </div>

      <PaginationBar offset={offset} limit={limit} rowCount={data.length} onOffsetChange={setOffset} onLimitChange={setLimit} />

      {note && <div className="text-sm text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-4 py-2">{note}</div>}

      {data.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={clsx(
            'rounded-2xl p-12 text-center',
            isDesktopData ? 'border border-[#ababab] bg-white text-gray-600' : 'glass-ultra',
          )}
        >
          <Activity className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className={isDesktopData ? 'text-gray-600' : 'text-gray-400'}>No running queries found</p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={isDesktopData ? dataGridShellClass : 'glass-ultra rounded-2xl overflow-hidden'}
        >
          <div className={isDesktopData ? '' : 'overflow-x-auto'}>
            <table className={clsx(isDesktopData ? dataGridTableClass : 'w-full text-sm')}>
              <thead>
                <tr className={clsx('text-left', !isDesktopData && 'border-b border-white/10')}>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}></th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Instance</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>SID</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Status</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Command</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Database</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>CPU</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Reads</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Writes</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Wait Type</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Blocking</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const isBlocked = row.blocking_session_id && row.blocking_session_id > 0;
                  const rk = `${row.InstanceID ?? ''}-${row.session_id ?? i}-${row.SnapshotDateUTC ?? row.snapshotDateUTC ?? i}`;
                  return (
                    <Fragment key={rk}>
                      <tr
                        onClick={() => toggleRow(i)}
                        className={clsx(
                          'cursor-pointer transition-colors',
                          !isDesktopData && 'border-b border-white/5 hover:bg-slate-800/50',
                          !isDesktopData && isBlocked && 'bg-red-500/5',
                          isDesktopData && isBlocked && 'dba-perf-crit',
                        )}
                      >
                        <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-500')}>
                          {expandedRows.has(i) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.InstanceDisplayName}</td>
                        <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.session_id}</td>
                        <td className={clsx(!isDesktopData && 'px-4 py-3')}>
                          <span
                            className={clsx(
                              'text-xs font-medium',
                              isDesktopData
                                ? row.status === 'running'
                                  ? 'dba-cell-ok px-2 py-0.5 inline-block'
                                  : row.status === 'suspended'
                                    ? 'dba-cell-warn px-2 py-0.5 inline-block'
                                    : 'dba-cell-na px-2 py-0.5 inline-block'
                                : clsx(
                                    'px-2 py-0.5 rounded-full',
                                    row.status === 'running' ? 'bg-green-400/10 text-green-400' :
                                    row.status === 'suspended' ? 'bg-yellow-400/10 text-yellow-400' :
                                    'bg-gray-400/10 text-gray-400',
                                  ),
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className={clsx('font-mono text-xs', !isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.command}</td>
                        <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.database_name || '-'}</td>
                        <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.cpu_time?.toLocaleString()}</td>
                        <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.reads?.toLocaleString()}</td>
                        <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.writes?.toLocaleString()}</td>
                        <td className={clsx('font-mono text-xs', !isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.wait_type || '-'}</td>
                        <td className={clsx(!isDesktopData && 'px-4 py-3')}>
                          {isBlocked ? (
                            <span
                              className={clsx(
                                'text-xs font-medium',
                                isDesktopData ? 'dba-cell-crit px-2 py-0.5 inline-block' : 'px-2 py-0.5 rounded-full bg-red-400/10 text-red-400',
                              )}
                            >
                              {row.blocking_session_id}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{formatDuration(row)}</td>
                      </tr>
                      {expandedRows.has(i) && (
                        <tr className={clsx(!isDesktopData && 'border-b border-white/5 bg-white/[0.02]')}>
                          <td colSpan={12} className={clsx('space-y-3', !isDesktopData && 'px-6 py-4', isDesktopData && 'p-4 bg-[#f9f9f9]')}>
                            <div className={clsx('text-xs mb-1', isDesktopData ? 'text-gray-600' : 'text-gray-500')}>Query Text</div>
                            <pre
                              className={clsx(
                                'text-xs whitespace-pre-wrap font-mono rounded-lg p-3 max-h-48 overflow-y-auto',
                                isDesktopData ? 'bg-white border border-[#d0d0d0] text-black' : 'text-gray-300 bg-black/20',
                              )}
                            >
                              {row.query_text || row.QueryText || 'N/A'}
                            </pre>
                            <div className={clsx('text-xs', isDesktopData ? 'text-gray-600' : 'text-gray-500')}>All columns (DBA Dash / row payload)</div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono max-h-56 overflow-y-auto">
                              {Object.entries(row)
                                .filter(([k]) => k !== 'query_text' && k !== 'QueryText')
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([k, v]) => (
                                  <div key={k} className={clsx('flex gap-2 pb-0.5', isDesktopData ? 'border-b border-[#e0e0e0]' : 'border-b border-white/5')}>
                                    <span className={isDesktopData ? 'text-[#0563c1] shrink-0' : 'text-blue-400/80 shrink-0'}>{k}</span>
                                    <span className={clsx('break-all', isDesktopData ? 'text-gray-800' : 'text-gray-300')}>
                                      {v === null || v === undefined ? '—' : String(v)}
                                    </span>
                                  </div>
                                ))}
                            </div>
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

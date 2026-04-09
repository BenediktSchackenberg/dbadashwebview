import { Fragment, useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import PaginationBar from '../components/PaginationBar';
import { motion } from 'framer-motion';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { usePresentationOptional } from '../context/PresentationContext';

export default function SlowQueriesPage() {
  const { dataGridTableClass, dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [data, setData] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [includeAllInstances, setIncludeAllInstances] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [hours, setHours] = useState(24);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [dbFilter, setDbFilter] = useState('');
  const [appFilter, setAppFilter] = useState('');
  const [limit, setLimit] = useState(2000);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    api.instances(includeAllInstances).then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, [includeAllInstances]);

  useEffect(() => {
    setLoading(true);
    api.performanceSlowQueries(selectedInstance, hours, limit, offset)
      .then(r => { setData(r.data || []); setNote(r.note || ''); })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selectedInstance, hours, limit, offset]);

  const toggleRow = (i: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const databases = [...new Set(data.map(r => r.database_name || r.DatabaseName).filter(Boolean))].sort();
  const apps = [...new Set(data.map(r => r.client_app_name).filter(Boolean))].sort();

  const filtered = data.filter(r =>
    (!dbFilter || (r.database_name || r.DatabaseName) === dbFilter) &&
    (!appFilter || r.client_app_name === appFilter)
  );

  const rowDurationMs = (r: any) => r.duration_ms ?? r.duration ?? r.Duration ?? null;
  const rowCpuMs = (r: any) => r.cpu_time_ms ?? r.cpu_time ?? r.CpuTime ?? null;
  const rowTs = (r: any) => r.timestamp ?? r.Timestamp;

  const fmtMs = (ms: number | null) => {
    if (ms == null) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-orange-400" />
          <h1 className="text-2xl font-bold text-white">Slow Queries</h1>
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
          <select value={hours} onChange={e => { setHours(Number(e.target.value)); setOffset(0); }}
            className={clsx(
              'rounded-lg px-3 py-2 text-sm focus:outline-none',
              isDesktopData ? 'bg-white border border-[#7a7a7a] text-black' : 'bg-slate-800 border border-slate-600 text-gray-300',
            )}>
            <option value={1}>Last 1h</option>
            <option value={6}>Last 6h</option>
            <option value={24}>Last 24h</option>
            <option value={72}>Last 3d</option>
            <option value={168}>Last 7d</option>
            <option value={336}>Last 14d</option>
          </select>
          <select value={selectedInstance ?? ''} onChange={e => { setSelectedInstance(e.target.value ? Number(e.target.value) : undefined); setOffset(0); }}
            className={clsx(
              'rounded-lg px-3 py-2 text-sm focus:outline-none',
              isDesktopData ? 'bg-white border border-[#7a7a7a] text-black' : 'bg-slate-800 border border-slate-600 text-gray-300',
            )}>
            <option value="">All Instances</option>
            {instances.map((inst: any) => (
              <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName}</option>
            ))}
          </select>
        </div>
      </div>

      <PaginationBar offset={offset} limit={limit} rowCount={data.length} onOffsetChange={setOffset} onLimitChange={setLimit} />

      <div className="flex items-center gap-3 flex-wrap">
        {databases.length > 0 && (
          <select value={dbFilter} onChange={e => setDbFilter(e.target.value)}
            className={clsx(
              'rounded-lg px-3 py-2 text-sm focus:outline-none',
              isDesktopData ? 'bg-white border border-[#7a7a7a] text-black' : 'bg-slate-800 border border-slate-600 text-gray-300',
            )}>
            <option value="">All Databases</option>
            {databases.map(db => <option key={db} value={db}>{db}</option>)}
          </select>
        )}
        {apps.length > 0 && (
          <select value={appFilter} onChange={e => setAppFilter(e.target.value)}
            className={clsx(
              'rounded-lg px-3 py-2 text-sm focus:outline-none',
              isDesktopData ? 'bg-white border border-[#7a7a7a] text-black' : 'bg-slate-800 border border-slate-600 text-gray-300',
            )}>
            <option value="">All Apps</option>
            {apps.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      {note && <div className="text-sm text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-4 py-2">{note}</div>}

      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={clsx(
            'rounded-2xl p-12 text-center',
            isDesktopData ? 'border border-[#ababab] bg-white text-gray-600' : 'glass-ultra',
          )}
        >
          <Clock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className={isDesktopData ? 'text-gray-600' : 'text-gray-400'}>No slow queries found</p>
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
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Database</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Object</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Duration</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>CPU</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Reads</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Writes</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Client</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>App</th>
                  <th className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300 font-semibold')}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const dms = rowDurationMs(row);
                  const sk = `${row.InstanceID ?? ''}-${dms ?? ''}-${rowTs(row) ?? i}`;
                  return (
                    <Fragment key={sk}>
                    <tr onClick={() => toggleRow(i)}
                      className={clsx(
                        'cursor-pointer transition-colors',
                        !isDesktopData && 'border-b border-white/5 hover:bg-slate-800/50',
                      )}
                    >
                      <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-500')}>
                        {expandedRows.has(i) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.InstanceDisplayName}</td>
                      <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.database_name || row.DatabaseName || '-'}</td>
                      <td className={clsx('font-mono text-xs', !isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.object_name || '-'}</td>
                      <td className={clsx(!isDesktopData && 'px-4 py-3')}>
                        <span
                          className={clsx(
                            'font-medium',
                            isDesktopData
                              ? (dms || 0) > 30000
                                ? 'dba-cell-crit px-1 inline-block'
                                : (dms || 0) > 5000
                                  ? 'dba-cell-warn px-1 inline-block'
                                  : 'text-black'
                              : (dms || 0) > 30000
                                ? 'text-red-400'
                                : (dms || 0) > 5000
                                  ? 'text-yellow-400'
                                  : 'text-gray-300',
                          )}
                        >
                          {fmtMs(dms)}
                        </span>
                      </td>
                      <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{fmtMs(rowCpuMs(row))}</td>
                      <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.logical_reads?.toLocaleString() || '-'}</td>
                      <td className={clsx(!isDesktopData && 'px-4 py-3 text-gray-300', isDesktopData && 'text-black')}>{row.writes?.toLocaleString() || '-'}</td>
                      <td className={clsx('text-xs', !isDesktopData && 'px-4 py-3 text-gray-400', isDesktopData && 'text-gray-800')}>{row.client_hostname || '-'}</td>
                      <td className={clsx('text-xs', !isDesktopData && 'px-4 py-3 text-gray-400', isDesktopData && 'text-gray-800')}>{row.client_app_name || '-'}</td>
                      <td className={clsx('text-xs', !isDesktopData && 'px-4 py-3 text-gray-400', isDesktopData && 'text-gray-800')}>{rowTs(row) ? new Date(rowTs(row)).toLocaleString() : '-'}</td>
                    </tr>
                    {expandedRows.has(i) && (
                      <tr className={clsx(!isDesktopData && 'border-b border-white/5 bg-white/[0.02]')}>
                        <td colSpan={11} className={clsx('space-y-3', !isDesktopData && 'px-6 py-4', isDesktopData && 'p-4 bg-[#f9f9f9]')}>
                          <div className={clsx('text-xs mb-1', isDesktopData ? 'text-gray-600' : 'text-gray-500')}>Query Text</div>
                          <pre
                            className={clsx(
                              'text-xs whitespace-pre-wrap font-mono rounded-lg p-3 max-h-48 overflow-y-auto',
                              isDesktopData ? 'bg-white border border-[#d0d0d0] text-black' : 'text-gray-300 bg-black/20',
                            )}
                          >
                            {row.text || 'N/A'}
                          </pre>
                          <div className={clsx('text-xs', isDesktopData ? 'text-gray-600' : 'text-gray-500')}>All columns</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono max-h-56 overflow-y-auto">
                            {Object.entries(row).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                              <div key={k} className={clsx('flex gap-2 pb-0.5', isDesktopData ? 'border-b border-[#e0e0e0]' : 'border-b border-white/5')}>
                                <span className={isDesktopData ? 'text-[#c65911] shrink-0' : 'text-orange-400/80 shrink-0'}>{k}</span>
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

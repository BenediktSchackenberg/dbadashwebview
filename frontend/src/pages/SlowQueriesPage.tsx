import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import type { InstanceListRow, SlowQueryRow } from '../api/types';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

export default function SlowQueriesPage() {
  const [data, setData] = useState<SlowQueryRow[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<InstanceListRow[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [hours, setHours] = useState(24);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [dbFilter, setDbFilter] = useState('');
  const [appFilter, setAppFilter] = useState('');

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.performanceSlowQueries(selectedInstance, hours)
      .then(r => { setData(r.data || []); setNote(r.note || ''); })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selectedInstance, hours]);

  useEffect(() => {
    setExpandedRows(new Set());
    setExpandedServers(new Set());
  }, [selectedInstance, hours, dbFilter, appFilter]);

  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleServer = (serverName: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev);
      next.has(serverName) ? next.delete(serverName) : next.add(serverName);
      return next;
    });
  };

  const databases = [...new Set(data.map((row) => row.database_name).filter((value): value is string => Boolean(value)))].sort();
  const apps = [...new Set(data.map((row) => row.client_app_name).filter((value): value is string => Boolean(value)))].sort();

  const filtered = data.filter(r =>
    (!dbFilter || r.database_name === dbFilter) &&
    (!appFilter || r.client_app_name === appFilter)
  );

  const groupedByInstance = useMemo(() => {
    return filtered.reduce((acc, row) => {
      const serverName = row.InstanceDisplayName || String(row.InstanceID);
      if (!acc[serverName]) {
        acc[serverName] = [];
      }
      acc[serverName].push(row);
      return acc;
    }, {} as Record<string, SlowQueryRow[]>);
  }, [filtered]);

  const serverNames = useMemo(() => Object.keys(groupedByInstance).sort(), [groupedByInstance]);

  const fmtMs = (ms: number | null | undefined) => {
    if (ms == null) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const renderRows = (rows: SlowQueryRow[], keyPrefix: string, showInstanceColumn: boolean) => (
    rows.map((row, i) => {
      const rowKey = `${keyPrefix}-${row.InstanceID}-${row.DatabaseID ?? 'db'}-${i}`;
      return (
        <Fragment key={rowKey}>
          <tr onClick={() => toggleRow(rowKey)}
            className="border-b border-white/5 cursor-pointer hover:bg-slate-800/50 transition-colors">
            <td className="px-4 py-3 text-gray-500">
              {expandedRows.has(rowKey) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </td>
            {showInstanceColumn && (
              <td className="px-4 py-3 text-gray-300">{row.InstanceDisplayName || row.InstanceID}</td>
            )}
            <td className="px-4 py-3 text-gray-300">{row.database_name || '-'}</td>
            <td className="px-4 py-3 text-gray-300 font-mono text-xs">{row.object_name || '-'}</td>
            <td className="px-4 py-3">
              <span className={clsx('font-medium',
                (row.duration_ms || 0) > 30000 ? 'text-red-400' :
                (row.duration_ms || 0) > 5000 ? 'text-yellow-400' : 'text-gray-300'
              )}>{fmtMs(row.duration_ms)}</span>
            </td>
            <td className="px-4 py-3 text-gray-300">{fmtMs(row.cpu_time_ms)}</td>
            <td className="px-4 py-3 text-gray-300">{row.logical_reads?.toLocaleString() || '-'}</td>
            <td className="px-4 py-3 text-gray-300">{row.writes?.toLocaleString() || '-'}</td>
            <td className="px-4 py-3 text-gray-400 text-xs">{row.client_hostname || '-'}</td>
            <td className="px-4 py-3 text-gray-400 text-xs">{row.client_app_name || '-'}</td>
            <td className="px-4 py-3 text-gray-400 text-xs">{row.SnapshotDate ? new Date(row.SnapshotDate).toLocaleString() : '-'}</td>
          </tr>
          {expandedRows.has(rowKey) && (
            <tr className="border-b border-white/5 bg-white/[0.02]">
              <td colSpan={showInstanceColumn ? 11 : 10} className="px-6 py-4">
                <div className="text-xs text-gray-500 mb-1">Query Text</div>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-black/20 rounded-lg p-3 max-h-48 overflow-y-auto">
                  {row.query_text || 'N/A'}
                </pre>
              </td>
            </tr>
          )}
        </Fragment>
      );
    })
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Clock className="w-6 h-6 text-orange-400" />
          <h1 className="text-2xl font-bold text-white">Slow Queries</h1>
        </div>
        <div className="flex items-center gap-3">
          <select value={hours} onChange={e => setHours(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none">
            <option value={1}>Last 1h</option>
            <option value={6}>Last 6h</option>
            <option value={24}>Last 24h</option>
            <option value={72}>Last 3d</option>
            <option value={168}>Last 7d</option>
            <option value={336}>Last 14d</option>
          </select>
          <select value={selectedInstance ?? ''} onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none">
            <option value="">All Instances</option>
            {instances.map((inst) => (
              <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName || inst.Instance || inst.InstanceID}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {databases.length > 0 && (
          <select value={dbFilter} onChange={e => setDbFilter(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none">
            <option value="">All Databases</option>
            {databases.map(db => <option key={db} value={db}>{db}</option>)}
          </select>
        )}
        {apps.length > 0 && (
          <select value={appFilter} onChange={e => setAppFilter(e.target.value)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none">
            <option value="">All Apps</option>
            {apps.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>

      {note && <div className="text-sm text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-4 py-2">{note}</div>}

      {filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-ultra rounded-2xl p-12 text-center">
          <Clock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No slow queries found</p>
        </motion.div>
      ) : selectedInstance ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-ultra rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="px-4 py-3 text-gray-300 font-semibold"></th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Instance</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Database</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Object</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Duration</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">CPU</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Reads</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Writes</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Client</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">App</th>
                  <th className="px-4 py-3 text-gray-300 font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {renderRows(filtered, 'instance-view', true)}
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {serverNames.map((serverName) => {
            const serverRows = groupedByInstance[serverName] || [];
            const isExpanded = expandedServers.has(serverName);

            return (
              <motion.div
                key={serverName}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-ultra rounded-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleServer(serverName)}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-white/10 hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-2 text-left">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="text-sm font-semibold text-gray-200">{serverName}</span>
                  </div>
                  <span className="text-xs text-gray-400">{serverRows.length} quer{serverRows.length === 1 ? 'y' : 'ies'}</span>
                </button>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10 text-left">
                          <th className="px-4 py-3 text-gray-300 font-semibold"></th>
                          <th className="px-4 py-3 text-gray-300 font-semibold">Database</th>
                          <th className="px-4 py-3 text-gray-300 font-semibold">Object</th>
                          <th className="px-4 py-3 text-gray-300 font-semibold">Duration</th>
                          <th className="px-4 py-3 text-gray-300 font-semibold">CPU</th>
                          <th className="px-4 py-3 text-gray-300 font-semibold">Reads</th>
                          <th className="px-4 py-3 text-gray-300 font-semibold">Writes</th>
                          <th className="px-4 py-3 text-gray-300 font-semibold">Client</th>
                          <th className="px-4 py-3 text-gray-300 font-semibold">App</th>
                          <th className="px-4 py-3 text-gray-300 font-semibold">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {renderRows(serverRows, `server-${serverName}`, false)}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

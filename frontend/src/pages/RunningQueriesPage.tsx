import { useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { Activity, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

export default function RunningQueriesPage() {
  const [data, setData] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.performanceRunningQueries(selectedInstance)
      .then(r => { setData(r.data || []); setNote(r.note || ''); })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selectedInstance]);

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

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Running Queries</h1>
        </div>
        <select
          value={selectedInstance ?? ''}
          onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="">All Instances</option>
          {instances.map((inst: any) => (
            <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName}</option>
          ))}
        </select>
      </div>

      {note && <div className="text-sm text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-4 py-2">{note}</div>}

      {data.length === 0 ? (
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
                  <th className="px-4 py-3 text-gray-400 font-medium"></th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Instance</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">SID</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Status</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Command</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Database</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">CPU</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Reads</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Writes</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Wait Type</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Blocking</th>
                  <th className="px-4 py-3 text-gray-400 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const isBlocked = row.blocking_session_id && row.blocking_session_id > 0;
                  return (
                    <>
                      <tr
                        key={i}
                        onClick={() => toggleRow(i)}
                        className={clsx(
                          'border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors',
                          isBlocked && 'bg-red-500/5'
                        )}
                      >
                        <td className="px-4 py-3 text-gray-500">
                          {expandedRows.has(i) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-4 py-3 text-gray-300">{row.InstanceDisplayName}</td>
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
                        <td className="px-4 py-3 text-gray-300">{formatDuration(row.start_time)}</td>
                      </tr>
                      {expandedRows.has(i) && (
                        <tr key={`${i}-detail`} className="border-b border-white/5 bg-white/[0.02]">
                          <td colSpan={12} className="px-6 py-4">
                            <div className="text-xs text-gray-500 mb-1">Query Text</div>
                            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-black/20 rounded-lg p-3 max-h-48 overflow-y-auto">
                              {row.query_text || 'N/A'}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
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

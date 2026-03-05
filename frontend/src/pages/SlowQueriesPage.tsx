import { useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

export default function SlowQueriesPage() {
  const [data, setData] = useState<any[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [hours, setHours] = useState(24);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
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

  const toggleRow = (i: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const databases = [...new Set(data.map(r => r.database_name).filter(Boolean))].sort();
  const apps = [...new Set(data.map(r => r.client_app_name).filter(Boolean))].sort();

  const filtered = data.filter(r =>
    (!dbFilter || r.database_name === dbFilter) &&
    (!appFilter || r.client_app_name === appFilter)
  );

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
        <div className="flex items-center gap-3">
          <select value={hours} onChange={e => setHours(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none">
            <option value={1}>Last 1h</option>
            <option value={6}>Last 6h</option>
            <option value={24}>Last 24h</option>
            <option value={72}>Last 3d</option>
          </select>
          <select value={selectedInstance ?? ''} onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)}
            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none">
            <option value="">All Instances</option>
            {instances.map((inst: any) => (
              <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName}</option>
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
      ) : (
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
                {filtered.map((row, i) => (
                  <>
                    <tr key={i} onClick={() => toggleRow(i)}
                      className="border-b border-white/5 cursor-pointer hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3 text-gray-500">
                        {expandedRows.has(i) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 text-gray-300">{row.InstanceDisplayName}</td>
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
                      <td className="px-4 py-3 text-gray-400 text-xs">{row.Timestamp ? new Date(row.Timestamp).toLocaleString() : '-'}</td>
                    </tr>
                    {expandedRows.has(i) && (
                      <tr key={`${i}-detail`} className="border-b border-white/5 bg-white/[0.02]">
                        <td colSpan={11} className="px-6 py-4">
                          <div className="text-xs text-gray-500 mb-1">Query Text</div>
                          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-black/20 rounded-lg p-3 max-h-48 overflow-y-auto">
                            {row.text || 'N/A'}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
}

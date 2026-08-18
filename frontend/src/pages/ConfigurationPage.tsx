import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/api';
import type {
  InstanceListRow,
  MonitoringConfigurationChangeRow,
  MonitoringConfigurationRow,
  MonitoringTraceFlagRow,
} from '../api/types';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { Settings } from 'lucide-react';

function valueToText(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export default function ConfigurationPage() {
  const { id: routeId } = useParams();
  const [config, setConfig] = useState<MonitoringConfigurationRow[]>([]);
  const [changes, setChanges] = useState<MonitoringConfigurationChangeRow[]>([]);
  const [traceFlags, setTraceFlags] = useState<MonitoringTraceFlagRow[]>([]);
  const [configNote, setConfigNote] = useState('');
  const [changesNote, setChangesNote] = useState('');
  const [traceFlagsNote, setTraceFlagsNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<InstanceListRow[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>(routeId ? Number(routeId) : undefined);
  const [tab, setTab] = useState<'current' | 'changes' | 'trace-flags'>('current');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedInstance) { setConfig([]); setChanges([]); setTraceFlags([]); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.monitoringConfiguration(selectedInstance).catch(() => ({ data: [], note: '' })),
      api.monitoringConfigurationChanges(selectedInstance).catch(() => ({ data: [], note: '' })),
      api.monitoringTraceFlags(selectedInstance).catch(() => ({ data: [], note: '' })),
    ]).then(([cfg, chg, tf]) => {
      setConfig(Array.isArray(cfg.data) ? cfg.data : []);
      setConfigNote(cfg.note || '');
      setChanges(Array.isArray(chg.data) ? chg.data : []);
      setChangesNote(chg.note || '');
      setTraceFlags(Array.isArray(tf.data) ? tf.data : []);
      setTraceFlagsNote(tf.note || '');
    }).finally(() => setLoading(false));
  }, [selectedInstance]);

  const filtered = useMemo(() => {
    if (!search) return config;
    const q = search.toLowerCase();
    return config.filter((row) => (row.name || '').toLowerCase().includes(q));
  }, [config, search]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Configuration Tracking</h1>
            <p className="text-sm text-gray-400">Server configuration and change history</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!routeId && (
            <select value={selectedInstance ?? ''} onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)} className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-gray-300">
              <option value="">Select Instance</option>
              {instances.map((inst) => <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName || inst.Instance || inst.InstanceID}</option>)}
            </select>
          )}
        </div>
      </div>

      {!selectedInstance && <div className="glass-card p-8 text-center text-gray-500">Select an instance to view configuration</div>}

      {selectedInstance && (
        <>
          <div className="flex gap-2">
            <button onClick={() => setTab('current')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'current' ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:text-white hover:bg-slate-800/50'}`}>
              Current Config
            </button>
            <button onClick={() => setTab('changes')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'changes' ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:text-white hover:bg-slate-800/50'}`}>
              Changes {changes.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-indigo-500/30">{changes.length}</span>}
            </button>
            <button onClick={() => setTab('trace-flags')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'trace-flags' ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:text-white hover:bg-slate-800/50'}`}>
              Trace Flags {traceFlags.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-indigo-500/30">{traceFlags.length}</span>}
            </button>
          </div>

          {configNote && <div className="glass-card p-3 text-xs text-yellow-400">{configNote}</div>}
          {tab === 'changes' && changesNote && <div className="glass-card p-3 text-xs text-yellow-400">{changesNote}</div>}
          {tab === 'trace-flags' && traceFlagsNote && <div className="glass-card p-3 text-xs text-yellow-400">{traceFlagsNote}</div>}

          {tab === 'current' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Configuration Settings</h2>
                <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-gray-300 placeholder-gray-500 w-48" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Name</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Value</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Value In Use</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Min</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Max</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Dynamic</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Advanced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => {
                      const mismatch = row.value !== undefined && row.value_in_use !== undefined && row.value !== row.value_in_use;
                      return (
                        <tr key={i} className={`border-b border-white/5 hover:bg-slate-800/50 ${mismatch ? 'bg-yellow-500/5' : ''}`}>
                          <td className="px-3 py-2 text-white font-medium">{row.name}</td>
                          <td className={`px-3 py-2 ${mismatch ? 'text-yellow-400' : 'text-gray-300'}`}>{valueToText(row.value)}</td>
                          <td className={`px-3 py-2 ${mismatch ? 'text-yellow-400' : 'text-gray-300'}`}>{valueToText(row.value_in_use)}</td>
                          <td className="px-3 py-2 text-gray-500">{valueToText(row.minimum)}</td>
                          <td className="px-3 py-2 text-gray-500">{valueToText(row.maximum)}</td>
                          <td className="px-3 py-2 text-gray-400">{row.is_dynamic ? 'Yes' : 'No'}</td>
                          <td className="px-3 py-2 text-gray-400">{row.is_advanced ? 'Yes' : 'No'}</td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">No configuration data found</td></tr>}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {tab === 'changes' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">Configuration Changes (Last 30 Days)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Setting</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Old Value</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">New Value</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Changed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((row, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-slate-800/50">
                        <td className="px-3 py-2 text-white font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-red-400">{valueToText(row.old_value)}</td>
                        <td className="px-3 py-2 text-green-400">{valueToText(row.new_value)}</td>
                        <td className="px-3 py-2 text-gray-400">{row.ChangeDate ? new Date(row.ChangeDate).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                    {changes.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-500">No configuration changes detected</td></tr>}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {tab === 'trace-flags' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">Enabled Trace Flags</h2>
                <p className="text-xs text-gray-500 mt-0.5">Server-level DBCC TRACEON flags currently set (dbo.TraceFlags)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Trace Flag</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Set Since</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traceFlags.map((row, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-slate-800/50">
                        <td className="px-3 py-2 text-white font-medium font-mono">{row.TraceFlag}</td>
                        <td className="px-3 py-2 text-gray-400">{row.ValidFrom ? new Date(row.ValidFrom).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                    {traceFlags.length === 0 && <tr><td colSpan={2} className="px-3 py-8 text-center text-gray-500">No trace flags currently set</td></tr>}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState, useMemo } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { Settings } from 'lucide-react';

export default function ConfigurationPage() {
  const [config, setConfig] = useState<any[]>([]);
  const [changes, setChanges] = useState<any[]>([]);
  const [configNote, setConfigNote] = useState('');
  const [changesNote, setChangesNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();
  const [tab, setTab] = useState<'current' | 'changes'>('current');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedInstance) { setConfig([]); setChanges([]); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.monitoringConfiguration(selectedInstance).catch(() => ({ data: [], note: '' })),
      api.monitoringConfigurationChanges(selectedInstance).catch(() => ({ data: [], note: '' })),
    ]).then(([cfg, chg]) => {
      setConfig(Array.isArray(cfg.data) ? cfg.data : []);
      setConfigNote(cfg.note || '');
      setChanges(Array.isArray(chg.data) ? chg.data : []);
      setChangesNote(chg.note || '');
    }).finally(() => setLoading(false));
  }, [selectedInstance]);

  const filtered = useMemo(() => {
    if (!search) return config;
    const q = search.toLowerCase();
    return config.filter(c => (c.name || '').toLowerCase().includes(q));
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
          <select value={selectedInstance ?? ''} onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300">
            <option value="">Select Instance</option>
            {instances.map((inst: any) => <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName || inst.InstanceID}</option>)}
          </select>
        </div>
      </div>

      {!selectedInstance && <div className="glass-card p-8 text-center text-gray-500">Select an instance to view configuration</div>}

      {selectedInstance && (
        <>
          <div className="flex gap-2">
            <button onClick={() => setTab('current')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'current' ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              Current Config
            </button>
            <button onClick={() => setTab('changes')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'changes' ? 'bg-indigo-500/20 text-indigo-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              Changes {changes.length > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-indigo-500/30">{changes.length}</span>}
            </button>
          </div>

          {configNote && <div className="glass-card p-3 text-xs text-yellow-400">{configNote}</div>}
          {tab === 'changes' && changesNote && <div className="glass-card p-3 text-xs text-yellow-400">{changesNote}</div>}

          {tab === 'current' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card overflow-hidden">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Configuration Settings</h2>
                <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-300 placeholder-gray-500 w-48" />
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
                    {filtered.map((c, i) => {
                      const mismatch = c.value !== undefined && c.value_in_use !== undefined && c.value !== c.value_in_use;
                      return (
                        <tr key={i} className={`border-b border-white/5 hover:bg-white/5 ${mismatch ? 'bg-yellow-500/5' : ''}`}>
                          <td className="px-3 py-2 text-white font-medium">{c.name}</td>
                          <td className={`px-3 py-2 ${mismatch ? 'text-yellow-400' : 'text-gray-300'}`}>{c.value}</td>
                          <td className={`px-3 py-2 ${mismatch ? 'text-yellow-400' : 'text-gray-300'}`}>{c.value_in_use}</td>
                          <td className="px-3 py-2 text-gray-500">{c.minimum}</td>
                          <td className="px-3 py-2 text-gray-500">{c.maximum}</td>
                          <td className="px-3 py-2 text-gray-400">{c.is_dynamic ? 'Yes' : 'No'}</td>
                          <td className="px-3 py-2 text-gray-400">{c.is_advanced ? 'Yes' : 'No'}</td>
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
                    {changes.map((c, i) => (
                      <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2 text-white font-medium">{c.name}</td>
                        <td className="px-3 py-2 text-red-400">{c.old_value}</td>
                        <td className="px-3 py-2 text-green-400">{c.new_value}</td>
                        <td className="px-3 py-2 text-gray-400">{c.ChangeDate ? new Date(c.ChangeDate).toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                    {changes.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-500">No configuration changes detected</td></tr>}
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

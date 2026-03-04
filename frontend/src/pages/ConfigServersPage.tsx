import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { useRefresh } from '../App';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import { Plus, Edit2, Trash2, X } from 'lucide-react';

export default function ConfigServersPage() {
  const { lastRefresh } = useRefresh();
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', authType: 'Windows' });

  useEffect(() => {
    api.instances().then(d => setInstances(Array.isArray(d) ? d : []))
      .catch(() => setInstances([]))
      .finally(() => setLoading(false));
  }, [lastRefresh]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Monitored Servers</h1>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add Server
        </button>
      </div>

      <div className="glass rounded-xl p-5 gradient-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-3 text-gray-400 font-medium">Instance</th>
              <th className="pb-3 text-gray-400 font-medium">Connection ID</th>
              <th className="pb-3 text-gray-400 font-medium">Edition</th>
              <th className="pb-3 text-gray-400 font-medium">Version</th>
              <th className="pb-3 text-gray-400 font-medium text-center">Status</th>
              <th className="pb-3 text-gray-400 font-medium text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst, i) => (
              <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                <td className="py-3 text-white font-medium">{inst.InstanceDisplayName || inst.Instance}</td>
                <td className="py-3 text-gray-400 font-mono text-xs">{inst.ConnectionID}</td>
                <td className="py-3 text-gray-400 text-xs">{inst.Edition || '—'}</td>
                <td className="py-3 text-gray-400 text-xs">{inst.ProductVersion || '—'}</td>
                <td className="py-3 text-center">
                  <StatusBadge status={inst.IsActive ? 1 : 4} />
                </td>
                <td className="py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button className="p-1.5 rounded hover:bg-white/5 text-gray-400 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {instances.length === 0 && <p className="text-gray-500 text-sm py-4 text-center">No servers configured.</p>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="glass rounded-xl p-6 w-96 gradient-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add Server</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Server Name" value={newServer.name} onChange={e => setNewServer(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <select value={newServer.authType} onChange={e => setNewServer(p => ({ ...p, authType: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                <option value="Windows">Windows Authentication</option>
                <option value="SQL">SQL Authentication</option>
              </select>
              <button disabled className="w-full py-2 bg-white/10 text-gray-500 rounded-lg text-sm font-medium cursor-not-allowed">
                Test Connection (coming soon)
              </button>
              <button onClick={() => setShowAdd(false)} className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

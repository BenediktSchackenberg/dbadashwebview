import { useState } from 'react';
import { Bell, Clock, Edit2, X } from 'lucide-react';

const defaultAlertTypes = [
  { id: 1, name: 'CPU > 90%', desc: 'CPU utilization exceeds threshold', threshold: 90, unit: '%', enabled: true },
  { id: 2, name: 'Disk > 85%', desc: 'Disk space usage exceeds threshold', threshold: 85, unit: '%', enabled: true },
  { id: 3, name: 'Backup > 24h', desc: 'No full backup in specified hours', threshold: 24, unit: 'hours', enabled: true },
  { id: 4, name: 'Job Failed', desc: 'SQL Agent job failure detected', threshold: 1, unit: 'failures', enabled: true },
  { id: 5, name: 'DBCC > 7d', desc: 'No integrity check in specified days', threshold: 7, unit: 'days', enabled: true },
  { id: 6, name: 'AG Not Syncing', desc: 'Availability Group replica not synchronized', threshold: 1, unit: '', enabled: true },
];

const defaultWindows = [
  { id: 1, start: '22:00', end: '06:00', scope: 'All Instances' },
  { id: 2, start: '08:00', end: '09:00', scope: 'DEV servers' },
];

const notificationChannels = [
  { id: 1, type: 'Email', config: 'alerts@example.com', enabled: true },
  { id: 2, type: 'Webhook', config: 'https://hooks.example.com/alert', enabled: true },
];

export default function AlertSettingsPage() {
  const [alertTypes, setAlertTypes] = useState(defaultAlertTypes);
  const [windows] = useState(defaultWindows);
  const [channels, setChannels] = useState(notificationChannels);
  const [editId, setEditId] = useState<number | null>(null);
  const [editThreshold, setEditThreshold] = useState('');
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({ type: 'Email', config: '' });
  const [schedule, setSchedule] = useState('24x7');

  const startEdit = (alert: typeof defaultAlertTypes[0]) => {
    setEditId(alert.id);
    setEditThreshold(String(alert.threshold));
  };

  const saveEdit = () => {
    setAlertTypes(prev => prev.map(a => a.id === editId ? { ...a, threshold: Number(editThreshold) } : a));
    setEditId(null);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Alert Configuration</h1>

      <div className="glass rounded-xl p-5 gradient-border">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Bell className="w-5 h-5 text-blue-400" /> Alert Types</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-3 text-gray-400 font-medium">Alert Type</th>
              <th className="pb-3 text-gray-400 font-medium">Description</th>
              <th className="pb-3 text-gray-400 font-medium text-right">Threshold</th>
              <th className="pb-3 text-gray-400 font-medium text-center">Enabled</th>
              <th className="pb-3 text-gray-400 font-medium text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {alertTypes.map(a => (
              <tr key={a.id} className="border-b border-white/5">
                <td className="py-3 text-gray-300 font-medium">{a.name}</td>
                <td className="py-3 text-gray-400 text-xs">{a.desc}</td>
                <td className="py-3 text-gray-300 text-right">{a.threshold} {a.unit}</td>
                <td className="py-3 text-center">
                  <button onClick={() => setAlertTypes(prev => prev.map(x => x.id === a.id ? { ...x, enabled: !x.enabled } : x))}
                    className={`w-10 h-5 rounded-full transition-colors ${a.enabled ? 'bg-blue-500' : 'bg-white/10'} relative`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${a.enabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </td>
                <td className="py-3 text-center">
                  <button onClick={() => startEdit(a)} className="p-1.5 rounded hover:bg-white/5 text-gray-400 hover:text-white">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditId(null)}>
          <div className="glass rounded-xl p-6 w-96 gradient-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Edit Threshold</h3>
              <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <input type="number" value={editThreshold} onChange={e => setEditThreshold(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white mb-4" />
            <button onClick={saveEdit} className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
              Save
            </button>
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-5 gradient-border">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-yellow-400" /> Maintenance Windows</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-3 text-gray-400 font-medium">Start</th>
              <th className="pb-3 text-gray-400 font-medium">End</th>
              <th className="pb-3 text-gray-400 font-medium">Scope</th>
            </tr>
          </thead>
          <tbody>
            {windows.map(w => (
              <tr key={w.id} className="border-b border-white/5">
                <td className="py-3 text-gray-300">{w.start}</td>
                <td className="py-3 text-gray-300">{w.end}</td>
                <td className="py-3 text-gray-400">{w.scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notification Channels (Story #19) */}
      <div className="glass rounded-xl p-5 gradient-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Notification Channels</h3>
          <button onClick={() => setShowAddChannel(true)} className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 transition-colors">
            Add Channel
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-3 text-gray-400 font-medium">Type</th>
              <th className="pb-3 text-gray-400 font-medium">Configuration</th>
              <th className="pb-3 text-gray-400 font-medium text-center">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {channels.map(c => (
              <tr key={c.id} className="border-b border-white/5">
                <td className="py-3 text-gray-300 font-medium">{c.type}</td>
                <td className="py-3 text-gray-400 text-xs font-mono">{c.config}</td>
                <td className="py-3 text-center">
                  <button onClick={() => setChannels(prev => prev.map(x => x.id === c.id ? { ...x, enabled: !x.enabled } : x))}
                    className={`w-10 h-5 rounded-full transition-colors ${c.enabled ? 'bg-blue-500' : 'bg-white/10'} relative`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${c.enabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddChannel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddChannel(false)}>
          <div className="glass rounded-xl p-6 w-96 gradient-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add Notification Channel</h3>
              <button onClick={() => setShowAddChannel(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <select value={newChannel.type} onChange={e => setNewChannel(p => ({ ...p, type: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                <option value="Email">Email</option>
                <option value="Webhook">Webhook</option>
                <option value="Teams">Teams</option>
              </select>
              <input placeholder={newChannel.type === 'Email' ? 'Email address' : 'Webhook URL'}
                value={newChannel.config} onChange={e => setNewChannel(p => ({ ...p, config: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <button onClick={() => {
                if (newChannel.config) {
                  setChannels(prev => [...prev, { id: Date.now(), ...newChannel, enabled: true }]);
                  setNewChannel({ type: 'Email', config: '' });
                  setShowAddChannel(false);
                }
              }} className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-5 gradient-border">
        <h3 className="text-lg font-semibold text-white mb-4">Notification Schedule</h3>
        <div className="flex gap-3">
          {['Business Hours (8-18)', '24x7', 'Custom'].map(s => (
            <button key={s} onClick={() => setSchedule(s)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${schedule === s ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

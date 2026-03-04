import { useState } from 'react';
import { Plus, X, Shield } from 'lucide-react';

interface UserItem { id: number; username: string; role: string; lastLogin: string; active: boolean }

const defaultUsers: UserItem[] = [
  { id: 1, username: 'admin', role: 'Admin', lastLogin: new Date().toISOString(), active: true },
];

export default function ConfigUsersPage() {
  const [users, setUsers] = useState<UserItem[]>(defaultUsers);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'Viewer' });
  const [authTab, setAuthTab] = useState<'local' | 'ldap' | 'oidc'>('local');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Users & RBAC</h1>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="glass rounded-xl p-5 gradient-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-3 text-gray-400 font-medium">Username</th>
              <th className="pb-3 text-gray-400 font-medium">Role</th>
              <th className="pb-3 text-gray-400 font-medium">Last Login</th>
              <th className="pb-3 text-gray-400 font-medium text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-white/5">
                <td className="py-3 text-white font-medium">{u.username}</td>
                <td className="py-3">
                  <span className={`px-2 py-0.5 rounded text-xs ${u.role === 'Admin' ? 'bg-purple-500/10 text-purple-400' : u.role === 'Operator' ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-500/10 text-gray-400'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="py-3 text-gray-400 text-xs">{new Date(u.lastLogin).toLocaleString()}</td>
                <td className="py-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs ${u.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="glass rounded-xl p-6 w-96 gradient-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add User</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Username" value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <input type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                <option value="Admin">Admin</option>
                <option value="Operator">Operator</option>
                <option value="Viewer">Viewer</option>
              </select>
              <button onClick={() => {
                if (newUser.username) {
                  setUsers(prev => [...prev, { id: Date.now(), username: newUser.username, role: newUser.role, lastLogin: '—', active: true }]);
                  setNewUser({ username: '', password: '', role: 'Viewer' });
                  setShowAdd(false);
                }
              }} className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
                Add User
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-5 gradient-border">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-blue-400" /> Authentication Settings</h3>
        <div className="flex gap-1 mb-4 bg-white/5 rounded-lg p-1 w-fit">
          {(['local', 'ldap', 'oidc'] as const).map(tab => (
            <button key={tab} onClick={() => setAuthTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm transition-colors ${authTab === tab ? 'bg-blue-500 text-white' : 'text-gray-400 hover:text-white'}`}>
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {authTab === 'local' && (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" defaultChecked className="rounded bg-white/10 border-white/20" />
                Enable local authentication
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" className="rounded bg-white/10 border-white/20" />
                Require password change on first login
              </label>
            </>
          )}
          {authTab === 'ldap' && (
            <>
              <input placeholder="LDAP Server URL" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <input placeholder="Base DN" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <input placeholder="Bind DN" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            </>
          )}
          {authTab === 'oidc' && (
            <>
              <input placeholder="Issuer URL" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <input placeholder="Client ID" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
              <input placeholder="Client Secret" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

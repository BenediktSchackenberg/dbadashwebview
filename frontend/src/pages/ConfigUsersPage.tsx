import { useState, useEffect } from 'react';
import { Plus, X, Shield, Save, TestTube, CheckCircle, XCircle, Loader2, FolderTree } from 'lucide-react';
import { motion } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_URL || '';
const getToken = () => localStorage.getItem('token');

interface AdConfig {
  enabled: boolean;
  server: string;
  port: number;
  useSsl: boolean;
  domain: string;
  baseDn: string;
  requiredGroup: string;
  adminGroup: string;
  allowLocalFallback: boolean;
  bindUser: string;
  bindPassword: string;
  hasBindPassword?: boolean;
}

const defaultAdConfig: AdConfig = {
  enabled: false, server: '', port: 389, useSsl: false, domain: '', baseDn: '',
  requiredGroup: '', adminGroup: '', allowLocalFallback: true, bindUser: '', bindPassword: '',
};

interface UserItem { id: number; username: string; role: string; lastLogin: string; active: boolean }

const defaultUsers: UserItem[] = [
  { id: 1, username: 'admin', role: 'Admin', lastLogin: new Date().toISOString(), active: true },
];

export default function ConfigUsersPage() {
  const [users, setUsers] = useState<UserItem[]>(defaultUsers);
  const [showAdd, setShowAdd] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'Viewer' });
  const [authTab, setAuthTab] = useState<'local' | 'ldap'>('local');

  // AD Config state
  const [adConfig, setAdConfig] = useState<AdConfig>(defaultAdConfig);
  const [adLoading, setAdLoading] = useState(false);
  const [adSaving, setAdSaving] = useState(false);
  const [adMessage, setAdMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; groups?: string[] } | null>(null);
  const [testCreds, setTestCreds] = useState({ username: '', password: '' });
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadAdConfig();
  }, []);

  const loadAdConfig = async () => {
    setAdLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings/ad`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdConfig({ ...defaultAdConfig, ...data, bindPassword: '' });
      }
    } catch { }
    setAdLoading(false);
  };

  const saveAdConfig = async () => {
    setAdSaving(true);
    setAdMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings/ad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(adConfig),
      });
      if (res.ok) {
        setAdMessage({ type: 'success', text: 'AD configuration saved successfully' });
      } else {
        setAdMessage({ type: 'error', text: 'Failed to save configuration' });
      }
    } catch {
      setAdMessage({ type: 'error', text: 'Network error' });
    }
    setAdSaving(false);
    setTimeout(() => setAdMessage(null), 5000);
  };

  const testAdLogin = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings/ad/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(testCreds),
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
      }
    } catch {
      setTestResult({ success: false, message: 'Network error' });
    }
    setTesting(false);
  };

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-all placeholder-gray-500";
  const labelCls = "block text-sm font-medium text-gray-300 mb-1.5";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Users & Authentication</h1>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      {/* Users Table */}
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

      {/* Add User Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="glass rounded-xl p-6 w-96 gradient-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Add User</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Username" value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} className={inputCls} />
              <input type="password" placeholder="Password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} className={inputCls} />
              <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))} className={inputCls}>
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

      {/* Authentication Settings */}
      <div className="glass rounded-xl p-6 gradient-border">
        <h3 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" /> Authentication Settings
        </h3>

        <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1 w-fit">
          {(['local', 'ldap'] as const).map(tab => (
            <button key={tab} onClick={() => setAuthTab(tab)}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${authTab === tab ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-white'}`}>
              {tab === 'local' ? 'Local Auth' : 'Active Directory'}
            </button>
          ))}
        </div>

        {authTab === 'local' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Local authentication uses the built-in admin account. Default credentials: admin / admin</p>
            <label className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer">
              <input type="checkbox" defaultChecked className="w-4 h-4 rounded bg-white/10 border-white/20 text-blue-500 focus:ring-blue-500/25" />
              Enable local authentication
            </label>
          </div>
        )}

        {authTab === 'ldap' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {adLoading ? (
              <div className="flex items-center gap-2 text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading configuration...</div>
            ) : (
              <>
                {/* Enable Toggle */}
                <label className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" checked={adConfig.enabled}
                    onChange={e => setAdConfig(p => ({ ...p, enabled: e.target.checked }))}
                    className="w-4 h-4 rounded bg-white/10 border-white/20 text-blue-500 focus:ring-blue-500/25" />
                  Enable Active Directory Authentication
                </label>

                {adConfig.enabled && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                    {/* Connection Settings */}
                    <div className="p-4 bg-white/[0.02] rounded-lg border border-white/5 space-y-4">
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <FolderTree className="w-4 h-4 text-blue-400" /> Connection Settings
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={labelCls}>Domain</label>
                          <input value={adConfig.domain} onChange={e => setAdConfig(p => ({ ...p, domain: e.target.value }))}
                            placeholder="e.g. corp.local" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>LDAP Server</label>
                          <input value={adConfig.server} onChange={e => setAdConfig(p => ({ ...p, server: e.target.value }))}
                            placeholder="e.g. dc01.corp.local or 192.168.0.10" className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Port</label>
                          <input type="number" value={adConfig.port} onChange={e => setAdConfig(p => ({ ...p, port: parseInt(e.target.value) || 389 }))}
                            className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Base DN (optional)</label>
                          <input value={adConfig.baseDn} onChange={e => setAdConfig(p => ({ ...p, baseDn: e.target.value }))}
                            placeholder="Auto-generated from domain if empty" className={inputCls} />
                        </div>
                      </div>
                      <label className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer">
                        <input type="checkbox" checked={adConfig.useSsl}
                          onChange={e => setAdConfig(p => ({ ...p, useSsl: e.target.checked, port: e.target.checked ? 636 : 389 }))}
                          className="w-4 h-4 rounded bg-white/10 border-white/20 text-blue-500 focus:ring-blue-500/25" />
                        Use SSL/TLS (LDAPS)
                      </label>
                    </div>

                    {/* Authorization */}
                    <div className="p-4 bg-white/[0.02] rounded-lg border border-white/5 space-y-4">
                      <h4 className="text-sm font-semibold text-white">Authorization</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={labelCls}>Required Group (optional)</label>
                          <input value={adConfig.requiredGroup} onChange={e => setAdConfig(p => ({ ...p, requiredGroup: e.target.value }))}
                            placeholder="e.g. DBA-Dashboard-Users" className={inputCls} />
                          <p className="text-xs text-gray-500 mt-1">Only members of this group can log in. Leave empty to allow all domain users.</p>
                        </div>
                        <div>
                          <label className={labelCls}>Admin Group (optional)</label>
                          <input value={adConfig.adminGroup} onChange={e => setAdConfig(p => ({ ...p, adminGroup: e.target.value }))}
                            placeholder="e.g. DBA-Dashboard-Admins" className={inputCls} />
                          <p className="text-xs text-gray-500 mt-1">Members of this group get Admin role.</p>
                        </div>
                      </div>
                    </div>

                    {/* Fallback */}
                    <label className="flex items-center gap-3 text-sm text-gray-300 cursor-pointer">
                      <input type="checkbox" checked={adConfig.allowLocalFallback}
                        onChange={e => setAdConfig(p => ({ ...p, allowLocalFallback: e.target.checked }))}
                        className="w-4 h-4 rounded bg-white/10 border-white/20 text-blue-500 focus:ring-blue-500/25" />
                      Allow local admin fallback (recommended for initial setup)
                    </label>

                    {/* Message */}
                    {adMessage && (
                      <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${adMessage.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                        {adMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {adMessage.text}
                      </motion.div>
                    )}

                    {/* Save */}
                    <button onClick={saveAdConfig} disabled={adSaving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                      {adSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Save Configuration
                    </button>

                    {/* Test Connection */}
                    <div className="p-4 bg-white/[0.02] rounded-lg border border-white/5 space-y-4">
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <TestTube className="w-4 h-4 text-purple-400" /> Test AD Login
                      </h4>
                      <p className="text-xs text-gray-500">Save your configuration first, then test with an AD account.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input value={testCreds.username} onChange={e => setTestCreds(p => ({ ...p, username: e.target.value }))}
                          placeholder="AD Username (e.g. jdoe)" className={inputCls} />
                        <input type="password" value={testCreds.password} onChange={e => setTestCreds(p => ({ ...p, password: e.target.value }))}
                          placeholder="AD Password" className={inputCls} />
                      </div>
                      <button onClick={testAdLogin} disabled={testing || !testCreds.username || !testCreds.password}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
                        Test Login
                      </button>

                      {testResult && (
                        <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                          className={`px-4 py-3 rounded-lg text-sm ${testResult.success ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                          <div className="flex items-center gap-2 font-medium">
                            {testResult.success ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            {testResult.message}
                          </div>
                          {testResult.groups && testResult.groups.length > 0 && (
                            <div className="mt-2 text-xs text-gray-400">
                              <span className="font-medium">Groups:</span> {testResult.groups.join(', ')}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, FolderTree, Loader2, Plus, Save, Shield, TestTube, X, XCircle } from 'lucide-react';
import { api } from '../api/api';
import type {
  AdConfig,
  AdLoginTestResult,
  AuthStatusResponse,
  LocalUser,
  UpdateLocalUserRequest,
} from '../api/types';
import type { AuthRole } from '../auth/session';

type EditableUser = LocalUser & { password: string; saving?: boolean };

const defaultAdConfig: AdConfig = {
  enabled: false,
  server: '',
  port: 389,
  useSsl: false,
  domain: '',
  baseDn: '',
  requiredGroup: '',
  operatorGroup: '',
  adminGroup: '',
  allowLocalFallback: true,
  bindUser: '',
  bindPassword: '',
};

const roleOptions: AuthRole[] = ['Admin', 'Operator', 'Viewer'];

function parseScopeList(text: string): string[] {
  return text
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);
}

function parseScopeNumberList(text: string): number[] {
  return parseScopeList(text)
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0);
}

export default function ConfigUsersPage() {
  const [authTab, setAuthTab] = useState<'local' | 'ldap'>('local');
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [users, setUsers] = useState<EditableUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    username: '',
    displayName: '',
    password: '',
    role: 'Viewer' as AuthRole,
    active: true,
    allowedTagsText: '',
    allowedGroupIdsText: ''
  });
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [adConfig, setAdConfig] = useState<AdConfig>(defaultAdConfig);
  const [adLoading, setAdLoading] = useState(true);
  const [adSaving, setAdSaving] = useState(false);
  const [testCreds, setTestCreds] = useState({ username: '', password: '' });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AdLoginTestResult | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const localStatusLabel = useMemo(() => {
    if (!authStatus) return 'Loading authentication status...';
    if (!authStatus.localAuthEnabled) return 'Local authentication is disabled.';
    if (authStatus.bootstrapRequired) return 'Local authentication is enabled but still waiting for the first bootstrap admin.';
    return 'Local users are persisted on the server with hashed passwords.';
  }, [authStatus]);

  async function loadData() {
    setUsersLoading(true);
    setAdLoading(true);

    try {
      const [status, userList, config] = await Promise.all([
        api.authStatus().catch(() => null),
        api.getLocalUsers().catch(() => []),
        api.getAdConfig().catch(() => defaultAdConfig),
      ]);

      setAuthStatus(status);
      setUsers(userList.map(user => ({ ...user, password: '' })));
      setAdConfig(config);
    } finally {
      setUsersLoading(false);
      setAdLoading(false);
    }
  }

  function showToast(type: 'success' | 'error', text: string) {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 4000);
  }

  function updateUser(id: string, patch: Partial<EditableUser>) {
    setUsers(current => current.map(user => (user.id === id ? { ...user, ...patch } : user)));
  }

  async function handleCreateUser() {
    if (!newUser.username.trim() || !newUser.password.trim()) {
      showToast('error', 'Username and password are required.');
      return;
    }

    try {
      const created = await api.createLocalUser({
        username: newUser.username.trim(),
        displayName: newUser.displayName.trim() || undefined,
        password: newUser.password,
        role: newUser.role,
        active: newUser.active,
        allowedTags: parseScopeList(newUser.allowedTagsText),
        allowedGroupIds: parseScopeNumberList(newUser.allowedGroupIdsText),
      });
      setUsers(current => [...current, { ...created, password: '' }].sort((a, b) => a.username.localeCompare(b.username)));
      setNewUser({ username: '', displayName: '', password: '', role: 'Viewer', active: true, allowedTagsText: '', allowedGroupIdsText: '' });
      setShowAdd(false);
      showToast('success', `Created local user ${created.username}.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to create local user.');
    }
  }

  async function handleSaveUser(user: EditableUser) {
    setSavingUserId(user.id);
    try {
      const payload: UpdateLocalUserRequest = {
        displayName: user.displayName || undefined,
        role: user.role,
        active: user.active,
        password: user.password || undefined,
        allowedTags: user.allowedTags ?? [],
        allowedGroupIds: user.allowedGroupIds ?? [],
      };
      const updated = await api.updateLocalUser(user.id, payload);
      updateUser(user.id, { ...updated, password: '' });
      showToast('success', `Updated ${updated.username}.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to update local user.');
    } finally {
      setSavingUserId(null);
    }
  }

  async function handleSaveAdConfig() {
    setAdSaving(true);
    try {
      await api.saveAdConfig(adConfig);
      showToast('success', 'Active Directory configuration saved.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to save Active Directory configuration.');
    } finally {
      setAdSaving(false);
    }
  }

  async function handleTestAdLogin() {
    setTesting(true);
    try {
      const result = await api.testAdLogin(testCreds.username, testCreds.password);
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Unable to test Active Directory login.',
        displayName: null,
        role: 'Viewer',
        groups: [],
      });
    } finally {
      setTesting(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition-all focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/25';
  const labelCls = 'mb-1.5 block text-sm font-medium text-gray-300';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users & Authentication</h1>
          <p className="mt-1 text-sm text-gray-400">{localStatusLabel}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
        >
          <Plus className="h-4 w-4" /> Add User
        </button>
      </div>

      {toast && (
        <div className={`rounded-lg px-4 py-2 text-sm ${toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
          {toast.text}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="gradient-border glass w-full max-w-md rounded-xl p-6" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Add Local User</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 transition-colors hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                placeholder="Username"
                value={newUser.username}
                onChange={event => setNewUser(current => ({ ...current, username: event.target.value }))}
                className={inputCls}
              />
              <input
                placeholder="Display name"
                value={newUser.displayName}
                onChange={event => setNewUser(current => ({ ...current, displayName: event.target.value }))}
                className={inputCls}
              />
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={event => setNewUser(current => ({ ...current, password: event.target.value }))}
                className={inputCls}
              />
              <select
                value={newUser.role}
                onChange={event => setNewUser(current => ({ ...current, role: event.target.value as AuthRole }))}
                className={inputCls}
              >
                {roleOptions.map(role => <option key={role} value={role}>{role}</option>)}
              </select>
              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={newUser.active}
                  onChange={event => setNewUser(current => ({ ...current, active: event.target.checked }))}
                  className="h-4 w-4 rounded border-white/20 bg-white/10"
                />
                User is active
              </label>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Allowed tags (comma separated, empty = full fleet)</label>
                <input
                  placeholder="prod, eu-west"
                  value={newUser.allowedTagsText}
                  onChange={event => setNewUser(current => ({ ...current, allowedTagsText: event.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Allowed group ids (comma separated)</label>
                <input
                  placeholder="1, 3"
                  value={newUser.allowedGroupIdsText}
                  onChange={event => setNewUser(current => ({ ...current, allowedGroupIdsText: event.target.value }))}
                  className={inputCls}
                />
              </div>
              <button
                onClick={handleCreateUser}
                className="w-full rounded-lg bg-blue-500 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
              >
                Create User
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass gradient-border rounded-xl p-6">
        <div className="mb-5 flex gap-1 rounded-lg bg-white/5 p-1 w-fit">
          {(['local', 'ldap'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setAuthTab(tab)}
              className={`rounded-md px-5 py-2 text-sm font-medium transition-colors ${
                authTab === tab ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'local' ? 'Local Auth' : 'Active Directory'}
            </button>
          ))}
        </div>

        {authTab === 'local' && (
          <div className="space-y-5">
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4 text-sm text-gray-300">
              <p>{localStatusLabel}</p>
              {authStatus?.bootstrapRequired && (
                <p className="mt-2 text-amber-300">
                  Configure `LocalAuth__BootstrapAdminPassword` once, restart the app, then sign in with the seeded admin account and create the permanent users you need.
                </p>
              )}
            </div>

            {usersLoading ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading users...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th className="pb-3 font-semibold text-gray-300">Username</th>
                      <th className="pb-3 font-semibold text-gray-300">Display Name</th>
                      <th className="pb-3 font-semibold text-gray-300">Role</th>
                      <th className="pb-3 font-semibold text-gray-300">Status</th>
                      <th className="pb-3 font-semibold text-gray-300">Last Login</th>
                      <th className="pb-3 font-semibold text-gray-300">Tags</th>
                      <th className="pb-3 font-semibold text-gray-300">Groups</th>
                      <th className="pb-3 font-semibold text-gray-300">Reset Password</th>
                      <th className="pb-3 text-right font-semibold text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id} className="border-b border-white/5 align-top">
                        <td className="py-3 text-white">{user.username}</td>
                        <td className="py-3">
                          <input
                            value={user.displayName || ''}
                            onChange={event => updateUser(user.id, { displayName: event.target.value })}
                            className={`${inputCls} min-w-[180px] py-2`}
                            placeholder="Display name"
                          />
                        </td>
                        <td className="py-3">
                          <select
                            value={user.role}
                            onChange={event => updateUser(user.id, { role: event.target.value as AuthRole })}
                            className={`${inputCls} min-w-[130px] py-2`}
                          >
                            {roleOptions.map(role => <option key={role} value={role}>{role}</option>)}
                          </select>
                        </td>
                        <td className="py-3">
                          <label className="flex items-center gap-2 text-gray-300">
                            <input
                              type="checkbox"
                              checked={user.active}
                              onChange={event => updateUser(user.id, { active: event.target.checked })}
                              className="h-4 w-4 rounded border-white/20 bg-white/10"
                            />
                            {user.active ? 'Active' : 'Inactive'}
                          </label>
                        </td>
                        <td className="py-3 text-xs text-gray-400">
                          {user.lastLoginAtUtc ? new Date(user.lastLoginAtUtc).toLocaleString() : 'Never'}
                        </td>
                        <td className="py-3">
                          <input
                            value={(user.allowedTags ?? []).join(', ')}
                            onChange={event => updateUser(user.id, { allowedTags: parseScopeList(event.target.value) })}
                            className={`${inputCls} min-w-[160px] py-2`}
                            placeholder="empty = all"
                          />
                        </td>
                        <td className="py-3">
                          <input
                            value={(user.allowedGroupIds ?? []).join(', ')}
                            onChange={event => updateUser(user.id, { allowedGroupIds: parseScopeNumberList(event.target.value) })}
                            className={`${inputCls} min-w-[120px] py-2`}
                            placeholder="empty = all"
                          />
                        </td>
                        <td className="py-3">
                          <input
                            type="password"
                            value={user.password}
                            onChange={event => updateUser(user.id, { password: event.target.value })}
                            className={`${inputCls} min-w-[180px] py-2`}
                            placeholder="Leave blank to keep current password"
                          />
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleSaveUser(user)}
                            disabled={savingUserId === user.id}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                          >
                            <Save className="h-3.5 w-3.5" />
                            {savingUserId === user.id ? 'Saving...' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-gray-500">
                          No local users configured yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {authTab === 'ldap' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            {adLoading ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading configuration...
              </div>
            ) : (
              <>
                <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={adConfig.enabled}
                    onChange={event => setAdConfig(current => ({ ...current, enabled: event.target.checked }))}
                    className="h-4 w-4 rounded border-white/20 bg-white/10"
                  />
                  Enable Active Directory Authentication
                </label>

                {adConfig.enabled && (
                  <div className="space-y-6">
                    <div className="space-y-4 rounded-lg border border-white/5 bg-white/[0.02] p-4">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <FolderTree className="h-4 w-4 text-blue-400" /> Connection Settings
                      </h4>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>Domain</label>
                          <input value={adConfig.domain} onChange={event => setAdConfig(current => ({ ...current, domain: event.target.value }))} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Server</label>
                          <input value={adConfig.server} onChange={event => setAdConfig(current => ({ ...current, server: event.target.value }))} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Port</label>
                          <input type="number" value={adConfig.port} onChange={event => setAdConfig(current => ({ ...current, port: Number(event.target.value) || 0 }))} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Base DN</label>
                          <input value={adConfig.baseDn} onChange={event => setAdConfig(current => ({ ...current, baseDn: event.target.value }))} className={inputCls} placeholder="OU=Users,DC=corp,DC=local" />
                        </div>
                      </div>
                      <label className="flex items-center gap-3 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={adConfig.useSsl}
                          onChange={event => setAdConfig(current => ({ ...current, useSsl: event.target.checked }))}
                          className="h-4 w-4 rounded border-white/20 bg-white/10"
                        />
                        Use LDAPS / SSL
                      </label>
                    </div>

                    <div className="space-y-4 rounded-lg border border-white/5 bg-white/[0.02] p-4">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Shield className="h-4 w-4 text-blue-400" /> Group Mapping
                      </h4>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>Required Group</label>
                          <input value={adConfig.requiredGroup} onChange={event => setAdConfig(current => ({ ...current, requiredGroup: event.target.value }))} className={inputCls} placeholder="e.g. DBADash-Users" />
                        </div>
                        <div>
                          <label className={labelCls}>Operator Group</label>
                          <input value={adConfig.operatorGroup} onChange={event => setAdConfig(current => ({ ...current, operatorGroup: event.target.value }))} className={inputCls} placeholder="e.g. DBA-Operators" />
                        </div>
                        <div>
                          <label className={labelCls}>Admin Group</label>
                          <input value={adConfig.adminGroup} onChange={event => setAdConfig(current => ({ ...current, adminGroup: event.target.value }))} className={inputCls} placeholder="e.g. DBA-Admins" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-lg border border-white/5 bg-white/[0.02] p-4">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <FolderTree className="h-4 w-4 text-blue-400" /> Optional Bind Account
                      </h4>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>Bind User</label>
                          <input value={adConfig.bindUser} onChange={event => setAdConfig(current => ({ ...current, bindUser: event.target.value }))} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Bind Password</label>
                          <input
                            type="password"
                            value={adConfig.bindPassword}
                            onChange={event => setAdConfig(current => ({ ...current, bindPassword: event.target.value }))}
                            className={inputCls}
                            placeholder={adConfig.hasBindPassword ? 'Stored password unchanged' : ''}
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-3 text-sm text-gray-300">
                        <input
                          type="checkbox"
                          checked={adConfig.allowLocalFallback}
                          onChange={event => setAdConfig(current => ({ ...current, allowLocalFallback: event.target.checked }))}
                          className="h-4 w-4 rounded border-white/20 bg-white/10"
                        />
                        Allow local authentication fallback
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleSaveAdConfig}
                        disabled={adSaving}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        {adSaving ? 'Saving...' : 'Save AD Configuration'}
                      </button>
                    </div>

                    <div className="space-y-4 rounded-lg border border-white/5 bg-white/[0.02] p-4">
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <TestTube className="h-4 w-4 text-blue-400" /> Test Sign-In
                      </h4>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <input
                          placeholder="Username"
                          value={testCreds.username}
                          onChange={event => setTestCreds(current => ({ ...current, username: event.target.value }))}
                          className={inputCls}
                        />
                        <input
                          type="password"
                          placeholder="Password"
                          value={testCreds.password}
                          onChange={event => setTestCreds(current => ({ ...current, password: event.target.value }))}
                          className={inputCls}
                        />
                      </div>
                      <button
                        onClick={handleTestAdLogin}
                        disabled={testing}
                        className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15 disabled:opacity-50"
                      >
                        <TestTube className="h-4 w-4" />
                        {testing ? 'Testing...' : 'Test Login'}
                      </button>

                      {testResult && (
                        <div className={`rounded-lg px-4 py-3 text-sm ${testResult.success ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                          <div className="flex items-start gap-2">
                            {testResult.success ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                            <div>
                              <p>{testResult.message}</p>
                              {testResult.success && (
                                <p className="mt-1 text-xs text-gray-300">
                                  Role: {testResult.role}{testResult.groups.length > 0 ? ` | Groups: ${testResult.groups.join(', ')}` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import type { InstanceListRow, ThresholdMap, ThresholdOverride, ThresholdScopeTagOption, ThresholdScopeType } from '../api/types';
import { Settings, Save, Plus, Trash2 } from 'lucide-react';

const metrics = [
  { key: 'avgCPU', label: 'Avg CPU %' },
  { key: 'maxCPU', label: 'Max CPU %' },
  { key: 'criticalWaitMs', label: 'Critical Wait (ms)' },
  { key: 'lockWaitMs', label: 'Lock Wait (ms)' },
  { key: 'ioWaitMs', label: 'IO Wait (ms)' },
  { key: 'totalWaitMs', label: 'Total Wait (ms)' },
  { key: 'signalWaitPct', label: 'Signal Wait %' },
  { key: 'latchWaitMs', label: 'Latch Wait (ms)' },
  { key: 'readLatency', label: 'Read Latency (ms)' },
  { key: 'writeLatency', label: 'Write Latency (ms)' },
  { key: 'mBsec', label: 'MB/sec' },
  { key: 'iOPs', label: 'IOPs' },
];

function metricLabel(key: string): string {
  return metrics.find((m) => m.key === key)?.label || key;
}

export default function ThresholdsPage() {
  const [thresholds, setThresholds] = useState<ThresholdMap>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [overrides, setOverrides] = useState<ThresholdOverride[]>([]);
  const [instances, setInstances] = useState<InstanceListRow[]>([]);
  const [tags, setTags] = useState<ThresholdScopeTagOption[]>([]);
  const [savingOverride, setSavingOverride] = useState(false);

  const [newScopeType, setNewScopeType] = useState<ThresholdScopeType>('instance');
  const [newScopeId, setNewScopeId] = useState('');
  const [newMetric, setNewMetric] = useState(metrics[0].key);
  const [newWarning, setNewWarning] = useState('');
  const [newCritical, setNewCritical] = useState('');

  useEffect(() => {
    api.getThresholds().then(res => {
      if (res.thresholds) setThresholds(res.thresholds);
      if (Array.isArray(res.overrides)) setOverrides(res.overrides);
    }).catch(() => {});
    api.instances().then(res => setInstances(Array.isArray(res) ? res : [])).catch(() => {});
    api.getThresholdScopeTags().then(res => setTags(Array.isArray(res.data) ? res.data : [])).catch(() => {});
  }, []);

  const instanceName = useMemo(() => {
    const byId = new Map(instances.map(i => [i.InstanceID, i.InstanceDisplayName || i.Instance || `Instance #${i.InstanceID}`]));
    return (id: number) => byId.get(id) || `Instance #${id}`;
  }, [instances]);

  const tagName = useMemo(() => {
    const byId = new Map(tags.map(t => [t.tagId, t.tagValue ? `${t.tagName}: ${t.tagValue}` : t.tagName]));
    return (id: number) => byId.get(id) || `Tag #${id}`;
  }, [tags]);

  const scopeOptions = newScopeType === 'instance'
    ? instances.map(i => ({ value: i.InstanceID, label: i.InstanceDisplayName || i.Instance || `Instance #${i.InstanceID}` }))
    : tags.map(t => ({ value: t.tagId, label: (t.tagValue ? `${t.tagName}: ${t.tagValue}` : t.tagName) + (t.isSystem ? ' (system)' : '') }));

  const sortedOverrides = [...overrides].sort((a, b) => {
    if (a.scopeType !== b.scopeType) return a.scopeType.localeCompare(b.scopeType);
    const nameA = a.scopeType === 'instance' ? instanceName(a.scopeId) : tagName(a.scopeId);
    const nameB = b.scopeType === 'instance' ? instanceName(b.scopeId) : tagName(b.scopeId);
    return nameA.localeCompare(nameB) || metricLabel(a.metricKey).localeCompare(metricLabel(b.metricKey));
  });

  const update = (key: string, field: 'warning' | 'critical', value: string) => {
    setThresholds(prev => {
      const cur = prev[key] || { warning: 0, critical: 0 };
      const num = value === '' ? 0 : parseFloat(value);
      return { ...prev, [key]: { ...cur, [field]: isNaN(num) ? 0 : num } };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Filter out metrics with both values at 0
      const filtered: ThresholdMap = {};
      for (const [k, v] of Object.entries(thresholds)) {
        if (v.warning > 0 || v.critical > 0) filtered[k] = v;
      }
      await api.saveThresholds(filtered);
      setToast({ msg: 'Thresholds saved successfully', ok: true });
    } catch (e) {
      setToast({ msg: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`, ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const persistOverrides = async (updated: ThresholdOverride[]) => {
    setSavingOverride(true);
    try {
      await api.saveThresholdOverrides(updated);
      setOverrides(updated);
      return true;
    } catch (e) {
      setToast({ msg: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`, ok: false });
      setTimeout(() => setToast(null), 3000);
      return false;
    } finally {
      setSavingOverride(false);
    }
  };

  const handleAddOverride = async () => {
    if (newScopeId === '') return;
    const scopeId = Number(newScopeId);
    if (!Number.isFinite(scopeId) || scopeId <= 0) return;

    const warning = newWarning === '' ? 0 : parseFloat(newWarning);
    const critical = newCritical === '' ? 0 : parseFloat(newCritical);
    if ((isNaN(warning) || warning === 0) && (isNaN(critical) || critical === 0)) return;

    const next: ThresholdOverride = {
      metricKey: newMetric,
      scopeType: newScopeType,
      scopeId,
      warning: isNaN(warning) ? 0 : warning,
      critical: isNaN(critical) ? 0 : critical,
    };
    const withoutDuplicate = overrides.filter(
      o => !(o.scopeType === next.scopeType && o.scopeId === next.scopeId && o.metricKey === next.metricKey)
    );
    const ok = await persistOverrides([...withoutDuplicate, next]);
    if (ok) {
      setNewScopeId('');
      setNewWarning('');
      setNewCritical('');
      setToast({ msg: 'Override saved', ok: true });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleDeleteOverride = (target: ThresholdOverride) => {
    persistOverrides(overrides.filter(o => o !== target));
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-blue-400" />
        <h1 className="text-2xl font-bold text-white">Thresholds</h1>
      </div>

      <p className="text-sm text-gray-400">
        Define thresholds for dashboard color coding. Leave empty for no color. Values at or above the threshold trigger the color.
      </p>

      {toast && (
        <div className={`px-4 py-2 rounded-lg text-sm ${toast.ok ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {toast.msg}
        </div>
      )}

      <div className="glass rounded-xl p-6">
        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_140px_140px] gap-4 text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
            <span>Metric</span>
            <span>Warning</span>
            <span>Critical</span>
          </div>
          {metrics.map(m => {
            const t = thresholds[m.key] || { warning: 0, critical: 0 };
            return (
              <div key={m.key} className="grid grid-cols-[1fr_140px_140px] gap-4 items-center">
                <span className="text-sm text-white">{m.label}</span>
                <input
                  type="number"
                  step="any"
                  value={t.warning || ''}
                  onChange={e => update(m.key, 'warning', e.target.value)}
                  placeholder="--"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
                />
                <input
                  type="number"
                  step="any"
                  value={t.critical || ''}
                  onChange={e => update(m.key, 'critical', e.target.value)}
                  placeholder="--"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
                />
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Thresholds'}
          </button>
        </div>
      </div>

      <div className="glass rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Per-Instance / Per-Tag Overrides</h2>
          <p className="text-sm text-gray-400 mt-1">
            Override the global default above for a specific instance, or for every instance carrying a tag.
            An instance-specific override always wins; a tag-specific override wins over the global default.
          </p>
        </div>

        <div className="grid grid-cols-[110px_1fr_1fr_110px_110px_auto] gap-3 items-center">
          <select
            value={newScopeType}
            onChange={e => { setNewScopeType(e.target.value as ThresholdScopeType); setNewScopeId(''); }}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
          >
            <option value="instance">Instance</option>
            <option value="tag">Tag</option>
          </select>
          <select
            value={newScopeId}
            onChange={e => setNewScopeId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
          >
            <option value="">
              {newScopeType === 'instance' ? 'Select instance…' : 'Select tag…'}
            </option>
            {scopeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select
            value={newMetric}
            onChange={e => setNewMetric(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500/50"
          >
            {metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <input
            type="number"
            step="any"
            value={newWarning}
            onChange={e => setNewWarning(e.target.value)}
            placeholder="Warning"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50"
          />
          <input
            type="number"
            step="any"
            value={newCritical}
            onChange={e => setNewCritical(e.target.value)}
            placeholder="Critical"
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50"
          />
          <button
            onClick={handleAddOverride}
            disabled={savingOverride || newScopeId === ''}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {sortedOverrides.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">No overrides configured.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {sortedOverrides.map((o, index) => (
              <div key={`${o.scopeType}-${o.scopeId}-${o.metricKey}-${index}`} className="grid grid-cols-[110px_1fr_1fr_110px_110px_auto] gap-3 items-center py-2">
                <span className="text-xs uppercase tracking-wider text-gray-400">{o.scopeType}</span>
                <span className="text-sm text-white truncate">
                  {o.scopeType === 'instance' ? instanceName(o.scopeId) : tagName(o.scopeId)}
                </span>
                <span className="text-sm text-gray-300">{metricLabel(o.metricKey)}</span>
                <span className="text-sm text-amber-300">{o.warning || '--'}</span>
                <span className="text-sm text-red-300">{o.critical || '--'}</span>
                <button
                  onClick={() => handleDeleteOverride(o)}
                  disabled={savingOverride}
                  className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-400 disabled:opacity-50 justify-self-end"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

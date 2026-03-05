import { useEffect, useState } from 'react';
import { api } from '../api/api';
import { Settings, Save } from 'lucide-react';

type Thresholds = Record<string, { warning: number; critical: number }>;

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

export default function ThresholdsPage() {
  const [thresholds, setThresholds] = useState<Thresholds>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    api.getThresholds().then(res => {
      if (res.thresholds) setThresholds(res.thresholds);
    }).catch(() => {});
  }, []);

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
      const filtered: Thresholds = {};
      for (const [k, v] of Object.entries(thresholds)) {
        if (v.warning > 0 || v.critical > 0) filtered[k] = v;
      }
      await api.saveThresholds(filtered);
      setToast({ msg: 'Thresholds saved successfully', ok: true });
    } catch (e: any) {
      setToast({ msg: `Error: ${e.message}`, ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
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
    </div>
  );
}

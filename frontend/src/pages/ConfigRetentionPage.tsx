import { useState } from 'react';
import { Save } from 'lucide-react';

interface RetentionItem { category: string; days: number; estimatedSize: string }

const defaultRetention: RetentionItem[] = [
  { category: 'CPU Metrics', days: 90, estimatedSize: '~2.1 GB' },
  { category: 'Wait Stats', days: 90, estimatedSize: '~1.8 GB' },
  { category: 'Job History', days: 180, estimatedSize: '~500 MB' },
  { category: 'Backup History', days: 365, estimatedSize: '~200 MB' },
  { category: 'Drive Snapshots', days: 365, estimatedSize: '~150 MB' },
  { category: 'Alert History', days: 90, estimatedSize: '~50 MB' },
  { category: 'Collection Errors', days: 30, estimatedSize: '~20 MB' },
];

function loadRetention(): RetentionItem[] {
  try { return JSON.parse(localStorage.getItem('config_retention') || 'null') || defaultRetention; } catch { return defaultRetention; }
}

export default function ConfigRetentionPage() {
  const [items, setItems] = useState<RetentionItem[]>(loadRetention);
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem('config_retention', JSON.stringify(items));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Data Retention</h1>
        <button onClick={save} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors">
          <Save className="w-4 h-4" /> {saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      <div className="glass rounded-xl p-6 gradient-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              <th className="pb-3 text-gray-300 font-semibold">Data Category</th>
              <th className="pb-3 text-gray-300 font-semibold text-right">Retention (days)</th>
              <th className="pb-3 text-gray-300 font-semibold text-right">Estimated Size</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="py-3 text-gray-300 font-medium">{item.category}</td>
                <td className="py-3 text-right">
                  <input type="number" value={item.days} min={1} max={3650}
                    onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, days: Number(e.target.value) } : x))}
                    className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm text-right" />
                </td>
                <td className="py-3 text-gray-500 text-right text-xs">{item.estimatedSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

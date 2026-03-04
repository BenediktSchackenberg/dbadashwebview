import { useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { AlertTriangle } from 'lucide-react';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const a = await api.alertsRecent().catch(() => []);
        setAlerts(Array.isArray(a) ? a : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Alerts</h1>
      {alerts.length === 0 ? (
        <EmptyState message="No recent alerts" />
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="glass rounded-xl p-4 flex items-start gap-3 hover:bg-white/5 transition-colors">
              <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-white">{a.ErrorMessage || a.message || JSON.stringify(a).slice(0, 200)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {a.ErrorDate || a.timestamp || ''} · {a.ErrorContext || a.InstanceDisplayName || ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

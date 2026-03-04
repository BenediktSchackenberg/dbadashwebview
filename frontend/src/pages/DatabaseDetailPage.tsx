import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import StatusBadge from '../components/StatusBadge';
import { Database, ArrowLeft } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

export default function DatabaseDetailPage() {
  const { id, dbId } = useParams<{ id: string; dbId: string }>();
  const instanceId = parseInt(id!);
  const databaseId = parseInt(dbId!);
  const [instance, setInstance] = useState<any>(null);
  const [databases, setDatabases] = useState<any[]>([]);
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [inst, dbs, bk] = await Promise.all([
          api.instance(instanceId).catch(() => null),
          api.instanceDatabases(instanceId).catch(() => []),
          api.instanceBackups(instanceId).catch(() => []),
        ]);
        setInstance(inst);
        setDatabases(Array.isArray(dbs) ? dbs : []);
        setBackups(Array.isArray(bk) ? bk : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [instanceId]);

  if (loading) return <LoadingSpinner />;

  const db = databases.find(d => d.DatabaseID === databaseId);
  if (!db) return <EmptyState message="Database not found" />;

  const instName = instance?.instance?.InstanceDisplayName || instance?.instance?.ConnectionID || `Instance ${instanceId}`;
  const recoveryLabel = db.recovery_model === 1 ? 'Full' : db.recovery_model === 2 ? 'Bulk-Logged' : db.recovery_model === 3 ? 'Simple' : '—';
  const stateLabel = db.state === 0 ? 'Online' : db.state === 1 ? 'Restoring' : `State ${db.state}`;

  const dbBackups = backups.filter(b => b.DatabaseID === databaseId);
  const lastFull = dbBackups.filter(b => b.type === 'D').sort((a, b) => new Date(b.backup_start_date).getTime() - new Date(a.backup_start_date).getTime())[0];
  const lastDiff = dbBackups.filter(b => b.type === 'I').sort((a, b) => new Date(b.backup_start_date).getTime() - new Date(a.backup_start_date).getTime())[0];
  const lastLog = dbBackups.filter(b => b.type === 'L').sort((a, b) => new Date(b.backup_start_date).getTime() - new Date(a.backup_start_date).getTime())[0];

  const backupCard = (label: string, backup: any) => {
    const date = backup?.backup_start_date ? new Date(backup.backup_start_date) : null;
    const age = date ? formatDistanceToNow(date, { addSuffix: true }) : null;
    return (
      <div className="glass rounded-xl p-4">
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        {date ? (
          <>
            <p className="text-sm text-white">{format(date, 'MMM d, yyyy HH:mm')}</p>
            <p className="text-xs text-gray-500 mt-1">{age}</p>
          </>
        ) : (
          <p className="text-sm text-gray-500">No backup</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Link to={`/instances/${instanceId}`} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to {instName}
      </Link>

      <div className="glass rounded-xl p-6 gradient-border">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Database className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{db.name}</h1>
            <p className="text-sm text-gray-400">{instName} · {stateLabel} · {recoveryLabel}</p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={db.state === 0 ? 1 : 2} size="md" label={stateLabel} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {backupCard('Full Backup', lastFull)}
        {backupCard('Diff Backup', lastDiff)}
        {backupCard('Log Backup', lastLog)}
      </div>

      <div className="glass rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Properties</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Recovery Model</p>
            <p className="text-white">{recoveryLabel}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">State</p>
            <p className="text-white">{stateLabel}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Last Good CheckDB</p>
            <p className="text-white">{db.LastGoodCheckDbTime ? format(new Date(db.LastGoodCheckDbTime), 'MMM d, yyyy HH:mm') : '—'}</p>
            {db.LastGoodCheckDbTime && (
              <p className="text-xs text-gray-500">{formatDistanceToNow(new Date(db.LastGoodCheckDbTime), { addSuffix: true })}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import type { EstateBackupRow, InstanceBackupRow } from '../api/types';
import { useRefresh } from '../App';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

function formatAge(dateStr: string | null): { text: string; color: string } {
  if (!dateStr) return { text: 'never', color: 'text-red-400' };
  const age = (Date.now() - new Date(dateStr).getTime()) / 3600000;
  if (age < 1) return { text: `${Math.round(age * 60)} min`, color: 'text-green-400' };
  if (age < 24) return { text: `${age.toFixed(1)}h`, color: 'text-green-400' };
  if (age < 48) return { text: `${age.toFixed(1)}h`, color: 'text-yellow-400' };
  return { text: `${Math.round(age / 24)}d`, color: 'text-red-400' };
}

function isNewerBackup(candidate: string | null | undefined, current: string | null | undefined): boolean {
  if (!candidate) return false;
  if (!current) return true;
  return candidate > current;
}

export default function BackupsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { lastRefresh } = useRefresh();
  const [instanceBackups, setInstanceBackups] = useState<InstanceBackupRow[]>([]);
  const [estateBackups, setEstateBackups] = useState<EstateBackupRow[]>([]);
  const [instanceName, setInstanceName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (id) {
          // Per-instance: get backups + instance name
          const [backups, inst] = await Promise.all([
            api.instanceBackups(Number(id)).catch(() => []),
            api.instance(Number(id)).catch(() => null),
          ]);
          setInstanceBackups(Array.isArray(backups) ? backups : []);
          setEstateBackups([]);
          setInstanceName(inst?.instance?.InstanceDisplayName || inst?.instance?.ConnectionID || `Instance ${id}`);
        } else {
          // Estate view: all instances with latest backup per DB
          const estate = await api.backupsEstate().catch(() => []);
          setEstateBackups(Array.isArray(estate) ? estate : []);
          setInstanceBackups([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id, lastRefresh]);

  const data = id ? instanceBackups : estateBackups;
  if (loading) return <LoadingSpinner />;
  if (data.length === 0) return <EmptyState message="No backup data available" />;

  // Per-instance view: group by database, show latest per type
  if (id) {
    // Group backups by DatabaseName, pick latest per type
    const byDb = new Map<string, { name: string; full: InstanceBackupRow | null; diff: InstanceBackupRow | null; log: InstanceBackupRow | null }>();
    for (const row of instanceBackups) {
      const name = row.DatabaseName || `DB ${row.DatabaseID}`;
      if (!byDb.has(name)) byDb.set(name, { name, full: null, diff: null, log: null });
      const entry = byDb.get(name)!;
      if (row.type === 'D' && isNewerBackup(row.backup_start_date, entry.full?.backup_start_date)) entry.full = row;
      if (row.type === 'I' && isNewerBackup(row.backup_start_date, entry.diff?.backup_start_date)) entry.diff = row;
      if (row.type === 'L' && isNewerBackup(row.backup_start_date, entry.log?.backup_start_date)) entry.log = row;
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Backups — {instanceName}</h1>
            <p className="text-sm text-gray-400">{byDb.size} databases</p>
          </div>
          <span className="text-xs text-gray-500 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Auto-refresh 30s</span>
        </div>
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Database</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Last Full</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Last Diff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Last Log</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-300 uppercase">Full Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {Array.from(byDb.values()).sort((a, b) => a.name.localeCompare(b.name)).map(db => {
                const fullAge = formatAge(db.full?.backup_start_date || null);
                const diffAge = formatAge(db.diff?.backup_start_date || null);
                const logAge = formatAge(db.log?.backup_start_date || null);
                return (
                  <tr key={db.name} className="hover:bg-slate-800/50">
                    <td className="px-4 py-2.5 text-white font-medium">{db.name}</td>
                    <td className={`px-4 py-2.5 ${fullAge.color}`}>{fullAge.text}</td>
                    <td className={`px-4 py-2.5 ${diffAge.color}`}>{diffAge.text}</td>
                    <td className={`px-4 py-2.5 ${logAge.color}`}>{logAge.text}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">
                      {db.full?.backup_size ? `${(db.full.backup_size / 1073741824).toFixed(1)} GB` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Estate view: group by instance
  const byInstance = new Map<string, { name: string; id: number; dbs: EstateBackupRow[] }>();
  for (const row of estateBackups) {
    const instanceId = row.instanceID;
    const name = row.instanceDisplayName || `Instance ${instanceId}`;
    if (!byInstance.has(name)) byInstance.set(name, { name, id: instanceId, dbs: [] });
    byInstance.get(name)!.dbs.push(row);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Backups</h1>
          <p className="text-sm text-gray-400">Backup status across {byInstance.size} instances</p>
        </div>
        <span className="text-xs text-gray-500 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Auto-refresh 30s</span>
      </div>
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Instance</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-300 uppercase">DBs</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Latest Full</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-300 uppercase">Latest Log</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {Array.from(byInstance.values()).sort((a, b) => a.name.localeCompare(b.name)).map(inst => {
              const newestFull = inst.dbs.reduce((best: string | null, row) => {
                if (!row.fullBackupDate) return best;
                return !best || row.fullBackupDate > best ? row.fullBackupDate : best;
              }, null);
              const newestLog = inst.dbs.reduce((best: string | null, row) => {
                if (!row.logBackupDate) return best;
                return !best || row.logBackupDate > best ? row.logBackupDate : best;
              }, null);
              const fullAge = formatAge(newestFull);
              const logAge = formatAge(newestLog);
              return (
                <tr key={inst.name} className="hover:bg-slate-800/50 cursor-pointer" onClick={() => navigate(`/instances/${inst.id}/backups`)}>
                  <td className="px-4 py-2.5 text-white font-medium">{inst.name}</td>
                  <td className="px-4 py-2.5 text-center text-gray-300">{inst.dbs.length}</td>
                  <td className={`px-4 py-2.5 ${fullAge.color}`}>{fullAge.text}</td>
                  <td className={`px-4 py-2.5 ${logAge.color}`}>{logAge.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

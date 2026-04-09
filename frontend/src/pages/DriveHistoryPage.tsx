import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import { usePresentationOptional } from '../context/PresentationContext';
import { motion } from 'framer-motion';
import { LineChart } from 'lucide-react';
import { clsx } from 'clsx';

function cols(rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((key) => ({ key, label: key, sortable: true as const }));
}

export default function DriveHistoryPage() {
  const { dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [instances, setInstances] = useState<any[]>([]);
  const [id, setId] = useState<number | ''>('');
  const [drives, setDrives] = useState<any[]>([]);
  const [driveId, setDriveId] = useState<number | ''>('');
  const [hours, setHours] = useState(168);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.instances(true).then((r) => setInstances(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (id === '') {
      setDrives([]);
      setDriveId('');
      return;
    }
    setDriveId('');
    api
      .instanceDrives(id)
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setDrives(list);
        if (list.length) {
          const first = list[0].DriveID ?? list[0].driveID;
          if (first != null) setDriveId(Number(first));
        }
      })
      .catch(() => setDrives([]));
  }, [id]);

  useEffect(() => {
    if (id === '' || driveId === '') {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr('');
    api
      .instanceDriveSnapshots(id, Number(driveId), hours)
      .then((r) => {
        setRows((r.data || []) as Record<string, unknown>[]);
        setNote(r.note || '');
        if (r.error) setErr(r.error);
      })
      .catch((e) => setErr(e?.message || 'Failed'))
      .finally(() => setLoading(false));
  }, [id, driveId, hours]);

  const columns = useMemo(() => cols(rows), [rows]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <LineChart className={clsx('w-7 h-7', isDesktopData ? 'text-[#0078d4]' : 'text-emerald-400')} />
        <div>
          <h1 className="text-2xl font-semibold text-white">Drive space history</h1>
          <p className="text-sm text-gray-400">dbo.DriveSnapshot_Get — capacity / free over time</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs text-gray-500 uppercase">Instance</label>
          <select
            value={id === '' ? '' : String(id)}
            onChange={(e) => setId(e.target.value ? Number(e.target.value) : '')}
            className="mt-1 block rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white min-w-[220px]"
          >
            <option value="">Select instance…</option>
            {instances.map((i: any) => (
              <option key={i.InstanceID} value={i.InstanceID}>
                {i.InstanceDisplayName || i.Instance}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase">Drive</label>
          <select
            value={driveId === '' ? '' : String(driveId)}
            onChange={(e) => setDriveId(e.target.value ? Number(e.target.value) : '')}
            className="mt-1 block rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white min-w-[200px]"
            disabled={!drives.length}
          >
            <option value="">Select drive…</option>
            {drives.map((d: any) => {
              const did = d.DriveID ?? d.driveID;
              const label = d.Name || d.Label || `Drive ${did}`;
              return (
                <option key={did} value={did}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase">Range (hours)</label>
          <input
            type="number"
            min={1}
            max={8760}
            value={hours}
            onChange={(e) => setHours(Math.min(8760, Math.max(1, Number(e.target.value) || 168)))}
            className="mt-1 w-28 rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      {err && <div className="text-sm text-red-400">{err}</div>}
      {note && <p className="text-xs text-gray-500 font-mono">{note}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : id !== '' && driveId !== '' && rows.length > 0 ? (
        <div className={clsx('rounded-lg border p-4', dataGridShellClass)}>
          <DataTable columns={columns} data={rows} exportCsvFileName="drive-history" />
        </div>
      ) : id !== '' && driveId !== '' ? (
        <p className="text-gray-500 text-sm">No snapshot rows in range.</p>
      ) : null}
    </motion.div>
  );
}

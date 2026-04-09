import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import TabNav from '../components/TabNav';
import { usePresentationOptional } from '../context/PresentationContext';
import { motion } from 'framer-motion';
import { Copy } from 'lucide-react';
import { clsx } from 'clsx';

function cols(rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((key) => ({ key, label: key, sortable: true as const }));
}

export default function DatabaseMirroringPage() {
  const { dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [instances, setInstances] = useState<any[]>([]);
  const [id, setId] = useState<number | ''>('');
  const [tab, setTab] = useState<'summary' | 'detail'>('summary');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.instances(true).then((r) => setInstances(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (id === '') {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr('');
    const p =
      tab === 'summary' ? api.instanceDatabaseMirroringSummary(id) : api.instanceDatabaseMirroringDetail(id);
    p.then((r) => {
      setRows((r.data || []) as Record<string, unknown>[]);
      setNote(r.note || '');
      if (r.error) setErr(r.error);
    })
      .catch((e) => setErr(e?.message || 'Failed'))
      .finally(() => setLoading(false));
  }, [id, tab]);

  const columns = useMemo(() => cols(rows), [rows]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <Copy className={clsx('w-7 h-7', isDesktopData ? 'text-[#0078d4]' : 'text-violet-400')} />
        <div>
          <h1 className="text-2xl font-semibold text-white">Database mirroring</h1>
          <p className="text-sm text-gray-400">dbo.DatabaseMirroringSummary_Get / DatabaseMirroring_Get</p>
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
        <TabNav
          tabs={[
            { key: 'summary', label: 'Summary' },
            { key: 'detail', label: 'Detail' },
          ]}
          active={tab}
          onChange={(k) => setTab(k as 'summary' | 'detail')}
        />
      </div>

      {err && <div className="text-sm text-red-400">{err}</div>}
      {note && <p className="text-xs text-gray-500 font-mono">{note}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : id !== '' && rows.length > 0 ? (
        <div className={clsx('rounded-lg border p-4', dataGridShellClass)}>
          <DataTable columns={columns} data={rows} exportCsvFileName="database-mirroring" />
        </div>
      ) : id !== '' ? (
        <p className="text-gray-500 text-sm">No rows returned.</p>
      ) : null}
    </motion.div>
  );
}

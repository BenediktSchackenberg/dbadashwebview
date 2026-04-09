import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import { usePresentationOptional } from '../context/PresentationContext';
import { motion } from 'framer-motion';
import { Copy } from 'lucide-react';
import { clsx } from 'clsx';

function cols(rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((key) => ({ key, label: key, sortable: true as const }));
}

export default function EstateDatabaseMirroringPage() {
  const { dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .estateDatabaseMirroring()
      .then((r) => {
        setRows((r.data || []) as Record<string, unknown>[]);
        setNote(r.note || '');
        if (r.error) setErr(r.error);
      })
      .catch((e) => setErr(e?.message || 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  const columns = useMemo(() => cols(rows), [rows]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <Copy className={clsx('w-7 h-7', isDesktopData ? 'text-[#0078d4]' : 'text-violet-400')} />
        <div>
          <h1 className="text-2xl font-semibold text-white">Estate — database mirroring</h1>
          <p className="text-sm text-gray-400">dbo.DatabaseMirroring_Get (all instances)</p>
        </div>
      </div>

      {err && <div className="text-sm text-red-400">{err}</div>}
      {note && <p className="text-xs text-gray-500 font-mono">{note}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : rows.length > 0 ? (
        <div className={clsx('rounded-lg border p-4', dataGridShellClass)}>
          <DataTable columns={columns} data={rows} exportCsvFileName="estate-database-mirroring" />
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No rows returned.</p>
      )}
    </motion.div>
  );
}

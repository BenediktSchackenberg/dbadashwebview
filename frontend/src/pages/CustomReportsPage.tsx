import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import { usePresentationOptional } from '../context/PresentationContext';
import { motion } from 'framer-motion';
import { FileSpreadsheet, Play } from 'lucide-react';
import { clsx } from 'clsx';

export default function CustomReportsPage() {
  const { dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [execName, setExecName] = useState('');
  const [execParamsJson, setExecParamsJson] = useState('{}');
  const [execBusy, setExecBusy] = useState(false);
  const [execErr, setExecErr] = useState('');
  const [execRows, setExecRows] = useState<Record<string, unknown>[]>([]);
  const [execNote, setExecNote] = useState('');

  useEffect(() => {
    api
      .repositoryCustomReports()
      .then((r) => {
        setRows((r.data || []) as Record<string, unknown>[]);
        setNote(r.note || '');
        if (r.error) setErr(r.error);
      })
      .catch((e) => setErr(e?.message || 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  async function runUserReport() {
    const n = execName.trim();
    if (!n) {
      setExecErr('Enter a UserReport procedure name (no schema).');
      return;
    }
    let parameters: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(execParamsJson || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setExecErr('Parameters must be a JSON object, e.g. {"@InstanceID": 1}');
        return;
      }
      parameters = parsed as Record<string, unknown>;
    } catch {
      setExecErr('Invalid JSON for parameters.');
      return;
    }
    setExecBusy(true);
    setExecErr('');
    setExecRows([]);
    setExecNote('');
    try {
      const r = await api.repositoryUserReportExecute({ procedureName: n, parameters, timeoutSeconds: 120 });
      setExecNote(r.note || '');
      if (r.error) setExecErr(r.error);
      setExecRows((r.data || []) as Record<string, unknown>[]);
    } catch (e: any) {
      setExecErr(e?.message || 'Failed (enable UserReport:EnableExecution and AllowedProcedures).');
    } finally {
      setExecBusy(false);
    }
  }

  const columns = useMemo(() => {
    if (!rows.length) return [];
    return Object.keys(rows[0]).map((key) => ({
      key,
      label: key,
      sortable: true as const,
      render: (row: Record<string, unknown>) => {
        const v = row[key];
        if (v != null && typeof v === 'object') return <span className="font-mono text-[10px]">{JSON.stringify(v)}</span>;
        const s = String(v ?? '');
        if (s.length > 200) return <span title={s}>{s.slice(0, 200)}…</span>;
        return s;
      },
    }));
  }, [rows]);

  const execColumns = useMemo(() => {
    if (!execRows.length) return [];
    return Object.keys(execRows[0]).map((key) => ({
      key,
      label: key,
      sortable: true as const,
      render: (row: Record<string, unknown>) => {
        const v = row[key];
        if (v != null && typeof v === 'object') return <span className="font-mono text-[10px]">{JSON.stringify(v)}</span>;
        const s = String(v ?? '');
        if (s.length > 200) return <span title={s}>{s.slice(0, 200)}…</span>;
        return s;
      },
    }));
  }, [execRows]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className={clsx('w-7 h-7', isDesktopData ? 'text-[#0078d4]' : 'text-emerald-400')} />
        <div>
          <h1 className="text-2xl font-semibold text-white">Custom reports (UserReport)</h1>
          <p className="text-sm text-gray-400">
            Same catalog as the Windows custom report picker: <span className="font-mono">dbo.CustomReport_Get</span>. Procedures live in
            the <span className="font-mono">UserReport</span> schema. Optional web execution is gated in appsettings (explicit allow-list
            only).
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-white/10 p-4 space-y-3 bg-white/[0.02]">
        <h2 className="text-sm font-medium text-white">Execute UserReport procedure (optional)</h2>
        <p className="text-xs text-gray-500">
          Set <span className="font-mono">UserReport:EnableExecution</span> and comma-separated{' '}
          <span className="font-mono">UserReport:AllowedProcedures</span>. Parameters are scalar only (same shape as repository invoke-sp).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-gray-500 uppercase">Procedure name</label>
            <input
              value={execName}
              onChange={(e) => setExecName(e.target.value)}
              placeholder="MyReportProc"
              className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-gray-500 uppercase">Parameters (JSON object)</label>
            <textarea
              value={execParamsJson}
              onChange={(e) => setExecParamsJson(e.target.value)}
              rows={3}
              className="mt-1 w-full font-mono text-xs rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={execBusy}
          onClick={runUserReport}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 px-4 py-2 text-sm text-white"
        >
          <Play className="w-4 h-4" />
          {execBusy ? 'Running…' : 'Execute'}
        </button>
        {execNote && <p className="text-xs text-gray-500 font-mono">{execNote}</p>}
        {execErr && <div className="text-sm text-red-400">{execErr}</div>}
        {execRows.length > 0 && (
          <div className={clsx('rounded-lg border p-3 max-h-[480px] overflow-auto', dataGridShellClass)}>
            <DataTable columns={execColumns} data={execRows} searchable exportCsvFileName="custom-reports-execution" />
          </div>
        )}
      </section>

      {err && <div className="text-sm text-red-400">{err}</div>}
      {note && <p className="text-xs text-gray-500 font-mono">{note}</p>}

      {loading ? (
        <LoadingSpinner />
      ) : rows.length > 0 ? (
        <div className={clsx('rounded-lg border p-4', dataGridShellClass)}>
          <DataTable columns={columns} data={rows} searchable exportCsvFileName="custom-reports-catalog" />
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No UserReport procedures found (or insufficient permissions).</p>
      )}
    </motion.div>
  );
}

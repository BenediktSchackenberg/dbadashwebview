import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/api';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import { usePresentationOptional } from '../context/PresentationContext';
import { motion } from 'framer-motion';
import { Layers, Play, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

type CatalogEntry = {
  category: string;
  label: string;
  procedure: string;
  addEmptyDayHourTvp: boolean;
  suggestedTimeoutSeconds: number;
  instanceParameterName: string | null;
  databaseParameterName: string | null;
  notes: string | null;
};

type MutatingEntry = {
  category: string;
  label: string;
  procedure: string;
  suggestedTimeoutSeconds: number;
  notes: string | null;
};

function buildParameters(
  instanceParameterName: string | null,
  databaseParameterName: string | null,
  instanceId: number | '',
  databaseId: number | '',
  extraJson: string,
): Record<string, unknown> {
  let extra: Record<string, unknown> = {};
  if (extraJson.trim()) {
    try {
      extra = JSON.parse(extraJson) as Record<string, unknown>;
      if (typeof extra !== 'object' || extra === null) throw new Error();
    } catch {
      throw new Error('Extra parameters must be valid JSON object.');
    }
  }

  const p: Record<string, unknown> = { ...extra };
  if (instanceParameterName && instanceId !== '') {
    const k = instanceParameterName.replace(/^@/, '');
    p[k] = Number(instanceId);
  }
  if (databaseParameterName && databaseId !== '' && databaseId !== null) {
    const k = databaseParameterName.replace(/^@/, '');
    p[k] = Number(databaseId);
  }
  return p;
}

export default function WindowsParityPage() {
  const { dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [searchParams] = useSearchParams();
  const appliedDeepLink = useRef<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [mutatingEnabled, setMutatingEnabled] = useState(false);
  const [mutatingCatalog, setMutatingCatalog] = useState<MutatingEntry[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [instances, setInstances] = useState<{ instanceId: number; instanceName: string }[]>([]);
  const [category, setCategory] = useState<string>('__all__');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  const [customProcedure, setCustomProcedure] = useState('');
  const [mode, setMode] = useState<'catalog' | 'custom' | 'mutate'>('catalog');
  const [instanceId, setInstanceId] = useState<number | ''>('');
  const [databaseId, setDatabaseId] = useState<number | ''>('');
  const [extraJson, setExtraJson] = useState('{}');
  const [tvpIdsJson, setTvpIdsJson] = useState('');
  const [addDayHourTvp, setAddDayHourTvp] = useState(true);
  const [timeoutSec, setTimeoutSec] = useState(120);
  const [mutatingEntry, setMutatingEntry] = useState<MutatingEntry | null>(null);
  const [mutateJson, setMutateJson] = useState('{}');

  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [lastMeta, setLastMeta] = useState<{ procedure: string; rowCount?: number; rowsAffected?: number; error?: string } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api
      .parityCatalog()
      .then((r) => {
        setCatalog(Array.isArray(r.entries) ? r.entries : []);
        setMutatingEnabled(!!r.mutatingEnabled);
        setMutatingCatalog(Array.isArray(r.mutatingEntries) ? r.mutatingEntries : []);
      })
      .catch(() => {
        setCatalog([]);
        setMutatingCatalog([]);
      })
      .finally(() => setLoadingCatalog(false));
  }, []);

  useEffect(() => {
    api
      .instances(true)
      .then((list: any) => {
        const arr = Array.isArray(list) ? list : [];
        setInstances(
          arr.map((i: any) => ({
            instanceId: i.InstanceID ?? i.instanceId ?? i.id,
            instanceName: i.InstanceDisplayName ?? i.Instance ?? i.instanceName ?? String(i.InstanceID ?? ''),
          })),
        );
      })
      .catch(() => setInstances([]));
  }, []);

  const procQs = searchParams.get('procedure')?.trim() ?? '';
  const instQs = searchParams.get('instanceId')?.trim() ?? '';

  useEffect(() => {
    if (loadingCatalog || catalog.length === 0 || !procQs) return;
    const linkKey = `${procQs}|${instQs}`;
    if (appliedDeepLink.current === linkKey) return;
    appliedDeepLink.current = linkKey;
    const norm = procQs.toLowerCase().startsWith('dbo.') ? procQs : `dbo.${procQs}`;
    const hit = catalog.find((e) => e.procedure.toLowerCase() === norm.toLowerCase());
    if (hit) {
      setMode('catalog');
      setSelected(hit);
      setCategory(hit.category);
    } else {
      setMode('custom');
      setCustomProcedure(norm);
    }
    if (instQs && !Number.isNaN(Number(instQs))) setInstanceId(Number(instQs));
  }, [loadingCatalog, catalog, procQs, instQs]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    catalog.forEach((e) => s.add(e.category));
    return ['__all__', ...[...s].sort()];
  }, [catalog]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((e) => {
      if (category !== '__all__' && e.category !== category) return false;
      if (!q) return true;
      return (
        e.label.toLowerCase().includes(q) ||
        e.procedure.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    });
  }, [catalog, category, search]);

  useEffect(() => {
    if (selected) {
      setAddDayHourTvp(selected.addEmptyDayHourTvp);
      setTimeoutSec(selected.suggestedTimeoutSeconds);
    }
  }, [selected]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    return keys.map((key) => ({
      key,
      label: key,
      sortable: true,
      render: (row: Record<string, unknown>) => {
        const v = row[key];
        if (typeof v === 'string' && v.length > 120) return <span title={v}>{v.slice(0, 120)}…</span>;
        return String(v ?? '');
      },
    }));
  }, [rows]);

  const parseTvpIds = (): Record<string, number[]> | undefined => {
    const t = tvpIdsJson.trim();
    if (!t) return undefined;
    try {
      const o = JSON.parse(t) as Record<string, unknown>;
      if (typeof o !== 'object' || o === null) return undefined;
      const out: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(o)) {
        if (Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x))) out[k] = v as number[];
      }
      return Object.keys(out).length > 0 ? out : undefined;
    } catch {
      return undefined;
    }
  };

  const runRead = async () => {
    const proc =
      mode === 'custom' ? customProcedure.trim() : selected?.procedure;
    if (!proc) {
      setLastMeta({ procedure: '', error: 'Select a catalog entry or enter a procedure name.' });
      return;
    }

    setRunning(true);
    setLastMeta(null);
    setRows([]);
    try {
      const params = buildParameters(
        mode === 'catalog' ? selected?.instanceParameterName ?? null : null,
        mode === 'catalog' ? selected?.databaseParameterName ?? null : null,
        instanceId,
        databaseId,
        extraJson,
      );
      if (mode === 'custom') {
        if (instanceId !== '') params.InstanceID = Number(instanceId);
        if (databaseId !== '') params.DatabaseID = Number(databaseId);
      }

      const tvpIds = parseTvpIds();
      if (tvpIdsJson.trim() && !tvpIds) {
        setLastMeta({ procedure: proc, error: 'tvpIds must be valid JSON object mapping names to number arrays, e.g. {"InstanceIDs":[1,2]}.' });
        setRunning(false);
        return;
      }

      const r = await api.repositoryInvokeSp({
        procedure: proc.startsWith('dbo.') ? proc : `dbo.${proc}`,
        timeoutSeconds: timeoutSec,
        parameters: params,
        addEmptyDayHourTvp: addDayHourTvp,
        tvpIds,
      });
      setRows(r.rows || []);
      setLastMeta({ procedure: r.procedure, rowCount: r.rowCount });
    } catch (e: any) {
      setLastMeta({ procedure: proc, error: e?.message || 'Request failed' });
    } finally {
      setRunning(false);
    }
  };

  const runMutate = async () => {
    if (!mutatingEntry) {
      setLastMeta({ procedure: '', error: 'Select a mutating action.' });
      return;
    }
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(mutateJson.trim() || '{}') as Record<string, unknown>;
      if (typeof params !== 'object' || params === null) throw new Error();
    } catch {
      setLastMeta({ procedure: mutatingEntry.procedure, error: 'Mutate parameters must be valid JSON object.' });
      return;
    }

    setRunning(true);
    setLastMeta(null);
    setRows([]);
    try {
      const r = await api.repositoryInvokeSpMutate({
        procedure: mutatingEntry.procedure,
        timeoutSeconds: mutatingEntry.suggestedTimeoutSeconds,
        parameters: params,
      });
      setLastMeta({ procedure: r.procedure, rowsAffected: r.rowsAffected });
    } catch (e: any) {
      setLastMeta({ procedure: mutatingEntry.procedure, error: e?.message || 'Request failed' });
    } finally {
      setRunning(false);
    }
  };

  if (loadingCatalog) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start gap-3">
        <div className={clsx('p-2 rounded-lg', isDesktopData ? 'bg-[#e8f4fc]' : 'bg-blue-500/10')}>
          <Layers className={clsx('w-6 h-6', isDesktopData ? 'text-[#0078d4]' : 'text-blue-400')} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">Windows feature parity</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl">
            <Link to="/windows-screens" className="text-blue-400 hover:underline">
              WinForms screen map
            </Link>{' '}
            lists every desktop tab and links here with <code className="text-gray-300">?procedure=dbo.…</code>. Run the same{' '}
            <code className="text-gray-300">dbo.*</code> stored procedures as the DBA Dash WinForms app against DBADashDB. Use the catalog for
            guided parameters, or custom procedure names (must be allow-listed). For{' '}
            <code className="text-gray-300">dbo.IDs</code> table-valued parameters, add JSON under <em>tvpIds</em> (e.g.{' '}
            <code className="text-gray-300">{`{"InstanceIDs":[1,2]}`}</code>). Plan XML and similar columns are returned as base64.
            Enable mutating procedures in{' '}
            <code className="text-gray-300">Repository:AllowMutatingStoredProcedures</code> on the server when you accept
            the risk.
          </p>
        </div>
      </div>

      <div className={clsx('rounded-lg border p-4 space-y-4', dataGridShellClass)}>
        <div className="flex flex-wrap gap-2">
          {(['catalog', 'custom', ...(mutatingEnabled ? (['mutate'] as const) : [])] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={clsx(
                'px-3 py-1.5 rounded text-sm border transition-all',
                mode === m
                  ? isDesktopData
                    ? 'bg-[#0078d4] text-white border-[#0078d4]'
                    : 'bg-blue-600 text-white border-blue-500'
                  : isDesktopData
                    ? 'border-[#ccc] text-gray-800 hover:bg-black/[0.04]'
                    : 'border-white/15 text-gray-300 hover:bg-white/5',
              )}
            >
              {m === 'catalog' ? 'Catalog' : m === 'custom' ? 'Custom procedure' : 'Mutate (SP)'}
            </button>
          ))}
        </div>

        {mode === 'mutate' && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex gap-2 text-sm text-amber-200/90">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Mutating procedures change repository data. Use only with credentials you trust.</span>
          </div>
        )}

        {mode === 'catalog' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-gray-500 uppercase tracking-wide">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === '__all__' ? 'All categories' : c}
                  </option>
                ))}
              </select>
              <input
                type="search"
                placeholder="Search label or procedure…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-gray-500"
              />
              <div className="h-[min(420px,50vh)] overflow-y-auto rounded-md border border-white/10 divide-y divide-white/5">
                {filteredEntries.map((e) => (
                  <button
                    key={`${e.procedure}-${e.label}`}
                    type="button"
                    onClick={() => setSelected(e)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      selected?.procedure === e.procedure && selected?.label === e.label
                        ? isDesktopData
                          ? 'bg-[#d0e8ff]'
                          : 'bg-blue-500/20'
                        : 'hover:bg-white/5 text-gray-300',
                    )}
                  >
                    <div className="font-medium text-white/90">{e.label}</div>
                    <div className="text-xs text-gray-500 font-mono">{e.procedure}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              {selected?.notes && <p className="text-xs text-gray-400">{selected.notes}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">Instance</label>
                  <select
                    value={instanceId === '' ? '' : String(instanceId)}
                    onChange={(e) => setInstanceId(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  >
                    <option value="">(none)</option>
                    {instances.map((i) => (
                      <option key={i.instanceId} value={i.instanceId}>
                        {i.instanceName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase tracking-wide">Database ID</label>
                  <input
                    type="number"
                    value={databaseId === '' ? '' : databaseId}
                    onChange={(e) => setDatabaseId(e.target.value ? Number(e.target.value) : '')}
                    placeholder="optional"
                    className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">Extra parameters (JSON)</label>
                <textarea
                  value={extraJson}
                  onChange={(e) => setExtraJson(e.target.value)}
                  rows={5}
                  className="mt-1 w-full font-mono text-xs rounded-md bg-white/5 border border-white/10 px-3 py-2 text-gray-200"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">
                  dbo.IDs TVPs (optional JSON)
                </label>
                <textarea
                  value={tvpIdsJson}
                  onChange={(e) => setTvpIdsJson(e.target.value)}
                  placeholder='{"InstanceIDs": [1, 2]}'
                  rows={2}
                  className="mt-1 w-full font-mono text-xs rounded-md bg-white/5 border border-white/10 px-3 py-2 text-gray-200"
                />
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={addDayHourTvp} onChange={(e) => setAddDayHourTvp(e.target.checked)} />
                  Empty @DaysOfWeek / @Hours TVPs
                </label>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Timeout (s)</span>
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={timeoutSec}
                    onChange={(e) => setTimeoutSec(Number(e.target.value) || 120)}
                    className="w-20 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-white"
                  />
                </div>
                <button
                  type="button"
                  disabled={running || !selected}
                  onClick={() => void runRead()}
                  className={clsx(
                    'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40',
                    isDesktopData
                      ? 'bg-[#0078d4] text-white hover:bg-[#006cbd]'
                      : 'bg-blue-600 text-white hover:bg-blue-500',
                  )}
                >
                  <Play className="w-4 h-4" />
                  Run read
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'custom' && (
          <div className="space-y-3 max-w-3xl">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide">Procedure</label>
              <input
                value={customProcedure}
                onChange={(e) => setCustomProcedure(e.target.value)}
                placeholder="dbo.SomeProcedure_Get"
                className="mt-1 w-full font-mono text-sm rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">InstanceID (optional)</label>
                <select
                  value={instanceId === '' ? '' : String(instanceId)}
                  onChange={(e) => setInstanceId(e.target.value ? Number(e.target.value) : '')}
                  className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                >
                  <option value="">(none)</option>
                  {instances.map((i) => (
                    <option key={i.instanceId} value={i.instanceId}>
                      {i.instanceName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 uppercase tracking-wide">DatabaseID (optional)</label>
                <input
                  type="number"
                  value={databaseId === '' ? '' : databaseId}
                  onChange={(e) => setDatabaseId(e.target.value ? Number(e.target.value) : '')}
                  className="mt-1 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide">Parameters (JSON)</label>
              <textarea
                value={extraJson}
                onChange={(e) => setExtraJson(e.target.value)}
                rows={6}
                className="mt-1 w-full font-mono text-xs rounded-md bg-white/5 border border-white/10 px-3 py-2 text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wide">dbo.IDs TVPs (optional)</label>
              <textarea
                value={tvpIdsJson}
                onChange={(e) => setTvpIdsJson(e.target.value)}
                placeholder='{"InstanceIDs": [1]}'
                rows={2}
                className="mt-1 w-full font-mono text-xs rounded-md bg-white/5 border border-white/10 px-3 py-2 text-gray-200"
              />
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={addDayHourTvp} onChange={(e) => setAddDayHourTvp(e.target.checked)} />
                Empty @DaysOfWeek / @Hours TVPs
              </label>
              <input
                type="number"
                min={5}
                max={600}
                value={timeoutSec}
                onChange={(e) => setTimeoutSec(Number(e.target.value) || 120)}
                className="w-20 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-white text-sm"
              />
              <button
                type="button"
                disabled={running}
                onClick={() => void runRead()}
                className={clsx(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-40',
                  isDesktopData ? 'bg-[#0078d4] text-white' : 'bg-blue-600 text-white',
                )}
              >
                <Play className="w-4 h-4" />
                Run read
              </button>
            </div>
          </div>
        )}

        {mode === 'mutate' && mutatingEnabled && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-[min(360px,45vh)] overflow-y-auto rounded-md border border-white/10 divide-y divide-white/5">
              {mutatingCatalog.map((e) => (
                <button
                  key={`${e.procedure}-${e.label}`}
                  type="button"
                  onClick={() => setMutatingEntry(e)}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-sm transition-colors',
                    mutatingEntry === e ? 'bg-amber-500/20' : 'hover:bg-white/5 text-gray-300',
                  )}
                >
                  <div className="font-medium text-white/90">{e.label}</div>
                  <div className="text-xs text-gray-500 font-mono">{e.procedure}</div>
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {mutatingEntry?.notes && <p className="text-xs text-gray-400">{mutatingEntry.notes}</p>}
              <label className="text-xs text-gray-500 uppercase tracking-wide">Parameters (JSON)</label>
              <textarea
                value={mutateJson}
                onChange={(e) => setMutateJson(e.target.value)}
                rows={10}
                className="w-full font-mono text-xs rounded-md bg-white/5 border border-white/10 px-3 py-2 text-gray-200"
              />
              <button
                type="button"
                disabled={running || !mutatingEntry}
                onClick={() => void runMutate()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-amber-600 text-white disabled:opacity-40 hover:bg-amber-500"
              >
                Execute mutate
              </button>
            </div>
          </div>
        )}

        {mode === 'mutate' && !mutatingEnabled && (
          <p className="text-sm text-gray-400">
            Mutating procedures are disabled on this server. Set <code className="text-gray-300">Repository:AllowMutatingStoredProcedures</code> to{' '}
            <code className="text-gray-300">true</code> in appsettings (understand the risk first).
          </p>
        )}
      </div>

      {lastMeta && (
        <div
          className={clsx(
            'rounded-md border px-4 py-3 text-sm',
            lastMeta.error
              ? 'border-red-500/40 bg-red-500/10 text-red-200'
              : 'border-white/10 bg-white/5 text-gray-300',
          )}
        >
          {lastMeta.error ? (
            <span>
              <strong className="text-red-300">Error</strong> — {lastMeta.error}
            </span>
          ) : (
            <span>
              <span className="font-mono text-gray-400">{lastMeta.procedure}</span>
              {lastMeta.rowCount !== undefined && <> — {lastMeta.rowCount} row(s)</>}
              {lastMeta.rowsAffected !== undefined && <> — rows affected: {lastMeta.rowsAffected}</>}
            </span>
          )}
        </div>
      )}

      {running && (
        <div className="flex justify-center py-6">
          <LoadingSpinner />
        </div>
      )}

      {!running && rows.length > 0 && (
        <div className={clsx('rounded-lg border p-4', dataGridShellClass)}>
          <DataTable columns={columns} data={rows} searchable exportCsvFileName="windows-parity-catalog" />
        </div>
      )}
    </motion.div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/api';
import DataTable from '../components/DataTable';
import LoadingSpinner from '../components/LoadingSpinner';
import { usePresentationOptional } from '../context/PresentationContext';
import { motion } from 'framer-motion';
import { ExternalLink, Play, Wrench } from 'lucide-react';
import { clsx } from 'clsx';

/** Same catalog as DBADashGUI.CommunityTools.CommunityToolsList — scripts run on monitored instances via DBA Dash agent/messaging in Windows. */
const COMMUNITY_SCRIPTS = [
  { name: 'sp_LogHunter', kit: 'DarlingData', url: 'https://github.com/erikdarlingdata/DarlingData' },
  { name: 'sp_WhoIsActive', kit: 'FirstResponderKit', url: 'https://github.com/BrentOzarULTD/SQL-Server-First-Responder-Kit' },
  { name: 'sp_Blitz', kit: 'FirstResponderKit', url: 'https://github.com/BrentOzarULTD/SQL-Server-First-Responder-Kit' },
  { name: 'sp_BlitzWho', kit: 'FirstResponderKit', url: 'https://github.com/BrentOzarULTD/SQL-Server-First-Responder-Kit' },
  { name: 'sp_BlitzIndex', kit: 'FirstResponderKit', url: 'https://github.com/BrentOzarULTD/SQL-Server-First-Responder-Kit' },
  { name: 'sp_BlitzCache', kit: 'FirstResponderKit', url: 'https://github.com/BrentOzarULTD/SQL-Server-First-Responder-Kit' },
  { name: 'sp_BlitzLock', kit: 'FirstResponderKit', url: 'https://github.com/BrentOzarULTD/SQL-Server-First-Responder-Kit' },
  { name: 'sp_BlitzFirst', kit: 'FirstResponderKit', url: 'https://github.com/BrentOzarULTD/SQL-Server-First-Responder-Kit' },
  { name: 'sp_BlitzBackups', kit: 'FirstResponderKit', url: 'https://github.com/BrentOzarULTD/SQL-Server-First-Responder-Kit' },
  { name: 'sp_HumanEvents', kit: 'DarlingData', url: 'https://github.com/erikdarlingdata/DarlingData' },
  { name: 'sp_PressureDetector', kit: 'DarlingData', url: 'https://github.com/erikdarlingdata/DarlingData' },
  { name: 'sp_HealthParser', kit: 'DarlingData', url: 'https://github.com/erikdarlingdata/DarlingData' },
  { name: 'sp_QuickieStore', kit: 'DarlingData', url: 'https://github.com/erikdarlingdata/DarlingData' },
  { name: 'sp_HumanEventsBlockViewer', kit: 'DarlingData', url: 'https://github.com/erikdarlingdata/DarlingData' },
  { name: 'sp_SrvPermissions', kit: 'DarlingData', url: 'https://github.com/erikdarlingdata/DarlingData' },
  { name: 'sp_DBPermissions', kit: 'DarlingData', url: 'https://github.com/erikdarlingdata/DarlingData' },
  { name: 'sp_IndexCleanup', kit: 'DarlingData', url: 'https://github.com/erikdarlingdata/DarlingData' },
];

function cols(rows: Record<string, unknown>[]) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((key) => ({ key, label: key, sortable: true as const }));
}

export default function CommunityToolsPage() {
  const { dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [instances, setInstances] = useState<any[]>([]);
  const [id, setId] = useState<number | ''>('');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [runProc, setRunProc] = useState(COMMUNITY_SCRIPTS[0]?.name ?? '');
  const [runBusy, setRunBusy] = useState(false);
  const [runErr, setRunErr] = useState('');
  const [runProgress, setRunProgress] = useState<string[]>([]);
  const [runSets, setRunSets] = useState<{ name: string; rows: Record<string, unknown>[] }[]>([]);

  useEffect(() => {
    api.instances(true).then((r) => setInstances(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (id === '') {
      setRows([]);
      setNote('');
      setErr('');
      return;
    }
    setLoading(true);
    api
      .instanceCustomTools(id)
      .then((r) => {
        setRows((r.data || []) as Record<string, unknown>[]);
        setNote(r.note || '');
        if (r.error) setErr(r.error);
        else setErr('');
      })
      .catch((e) => setErr(e?.message || 'Failed'))
      .finally(() => setLoading(false));
  }, [id]);

  const toolColumns = useMemo(
    () => [
      { key: 'name', label: 'Procedure', sortable: true as const },
      { key: 'kit', label: 'Source', sortable: true as const },
      {
        key: 'url',
        label: '',
        sortable: false as const,
        render: (row: { url: string }) => (
          <a href={row.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1">
            Repo <ExternalLink className="w-3 h-3" />
          </a>
        ),
      },
    ],
    [],
  );

  const toolRows = useMemo(
    () => COMMUNITY_SCRIPTS.map((s) => ({ name: s.name, kit: s.kit, url: s.url })),
    [],
  );

  const dbColumns = useMemo(() => cols(rows), [rows]);

  const runColumnsFor = (r: Record<string, unknown>[]) => cols(r);

  async function runCommunityOnInstance() {
    if (id === '') {
      setRunErr('Select an instance first.');
      return;
    }
    setRunBusy(true);
    setRunErr('');
    setRunProgress([]);
    setRunSets([]);
    try {
      const res = await api.instanceMessagingCommunityProc(Number(id), {
        procedureName: runProc,
        schemaName: 'dbo',
        lifetimeSeconds: 300,
      });
      if (res.progress?.length) setRunProgress(res.progress.map((p) => p.message || '').filter(Boolean));
      if (res.error) setRunErr(res.error);
      if (res.resultSets?.length) setRunSets(res.resultSets);
    } catch (e: any) {
      setRunErr(e?.message || 'Request failed (enable Messaging:EnableCommunityProcedureExecution and set ProcedureExecutionMessageAssemblyQualifiedName).');
    } finally {
      setRunBusy(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 max-w-5xl">
      <div className="flex items-center gap-3">
        <Wrench className={clsx('w-7 h-7', isDesktopData ? 'text-[#0078d4]' : 'text-orange-400')} />
        <div>
          <h1 className="text-2xl font-semibold text-white">Community tools</h1>
          <p className="text-sm text-gray-400 mt-1">
            Same script list as the Windows app’s Community Tools folder. Install scripts from the linked repos on each monitored SQL
            instance; the desktop app can execute them via the DBA Dash agent.             This web UI lists definitions, shows <span className="font-mono text-gray-500">dbo.CustomTools_Get</span>, and can trigger the
            same community-script messages as the desktop app when the API is configured (Service Broker + matching{' '}
            <span className="font-mono text-gray-500">ProcedureExecutionMessage</span> type name).
          </p>
        </div>
      </div>

      <section className="space-y-3 rounded-lg border border-white/10 p-4 bg-white/[0.02]">
        <h2 className="text-lg font-medium text-white">Run community script (messaging)</h2>
        <p className="text-xs text-gray-500">
          Uses <span className="font-mono">Messaging.SendMessageFromGUIToService</span> like DBADashGUI. Scripts must be installed on the
          target SQL instance; the collector must allow the script per service config.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500 uppercase block">Script</label>
            <select
              value={runProc}
              onChange={(e) => setRunProc(e.target.value)}
              className="mt-1 rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white min-w-[200px]"
            >
              {COMMUNITY_SCRIPTS.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={runBusy || id === ''}
            onClick={runCommunityOnInstance}
            className="inline-flex items-center gap-2 rounded-md bg-orange-600 hover:bg-orange-500 disabled:opacity-40 px-4 py-2 text-sm text-white"
          >
            <Play className="w-4 h-4" />
            {runBusy ? 'Running…' : 'Run on selected instance'}
          </button>
        </div>
        {id === '' && <p className="text-xs text-amber-400/90">Choose an instance under “Allowed custom procedures” below.</p>}
        {runErr && <div className="text-sm text-red-400">{runErr}</div>}
        {runProgress.length > 0 && (
          <ul className="text-xs text-gray-400 list-disc pl-4">
            {runProgress.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
        {runSets.map((rs, idx) => (
          <div key={idx} className="space-y-2">
            <h3 className="text-sm font-medium text-gray-300">{rs.name || `Result ${idx + 1}`}</h3>
            {rs.rows.length > 0 ? (
              <div className={clsx('rounded-lg border p-3 max-h-[480px] overflow-auto', dataGridShellClass)}>
                <DataTable
                  columns={runColumnsFor(rs.rows)}
                  data={rs.rows}
                  searchable
                  exportCsvFileName="community-tools-results"
                />
              </div>
            ) : (
              <p className="text-xs text-gray-500">No rows</p>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-white">Catalog (First Responder Kit & Darling Data)</h2>
        <div className={clsx('rounded-lg border p-4', dataGridShellClass)}>
          <DataTable
            columns={toolColumns}
            data={toolRows}
            searchable
            searchKeys={['name', 'kit']}
            exportCsvFileName="community-tools-catalog"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-white">Allowed custom procedures (repository)</h2>
        <p className="text-xs text-gray-500">
          From <span className="font-mono">CustomTools_Get</span> — requires collector messaging and AllowedCustomProcs on the agent.
        </p>
        <div>
          <label className="text-xs text-gray-500 uppercase">Instance</label>
          <select
            value={id === '' ? '' : String(id)}
            onChange={(e) => setId(e.target.value ? Number(e.target.value) : '')}
            className="mt-1 block rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white min-w-[240px]"
          >
            <option value="">Select instance…</option>
            {instances.map((i: any) => (
              <option key={i.InstanceID} value={i.InstanceID}>
                {i.InstanceDisplayName || i.Instance}
              </option>
            ))}
          </select>
        </div>
        {err && <div className="text-sm text-red-400">{err}</div>}
        {note && <p className="text-xs text-gray-500 font-mono">{note}</p>}
        {loading ? (
          <LoadingSpinner />
        ) : id !== '' && rows.length > 0 ? (
          <div className={clsx('rounded-lg border p-4', dataGridShellClass)}>
            <DataTable columns={dbColumns} data={rows} exportCsvFileName="community-tools-databases" />
          </div>
        ) : id !== '' ? (
          <p className="text-sm text-gray-500">No rows — messaging may be disabled or no procs allowed for this instance.</p>
        ) : null}
      </section>

      <p className="text-xs text-gray-600 max-w-3xl">
        Host-level tools, SSMS, and Azure Data Studio are outside the repository database; this UI does not launch local executables. Use RDP or
        jump-box tooling, or open SSMS/ADS on your workstation against the instance connection string.
      </p>
    </motion.div>
  );
}

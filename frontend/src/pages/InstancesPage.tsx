import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import { SUMMARY_STATUS_KEYS } from '../constants/summaryStatusKeys';

/** DBA Dash summary status enum → readable label for CSV export. */
function dbaStatusCsv(v: unknown): string {
  const n = Number(v);
  if (Number.isNaN(n)) return v == null ? '' : String(v);
  if (n === 1) return 'Critical';
  if (n === 2) return 'Warning';
  if (n === 3) return 'N/A';
  if (n === 4) return 'OK';
  if (n === 5) return 'Acknowledged';
  return String(n);
}

function getOverallStatus(row: any): number {
  // DBA Dash enum: Critical=1, Warning=2, NA=3, OK=4, Acknowledged=5
  let worst = 4; // start at OK
  for (const { key: k } of SUMMARY_STATUS_KEYS) {
    const v = row[k] != null ? Number(row[k]) : 3;
    if (v === 3) continue;
    if (v < worst) worst = v;
  }
  return worst;
}

export default function InstancesPage() {
  const [instances, setInstances] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeAllActive, setIncludeAllActive] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [inst, sum] = await Promise.all([
          api.instances(includeAllActive).catch(() => []),
          api.dashboardSummary().catch(() => []),
        ]);
        setInstances(Array.isArray(inst) ? inst : []);
        setSummary(Array.isArray(sum) ? sum : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [includeAllActive]);

  if (loading) return <LoadingSpinner />;

  const merged = instances.map(inst => {
    const s = summary.find((su: any) => su.InstanceID === inst.InstanceID) || {};
    return { ...inst, ...s, _overallStatus: getOverallStatus(s) };
  });

  const columns = [
    {
      key: '_overallStatus',
      label: 'Status',
      exportValue: (row: any) => dbaStatusCsv(row._overallStatus),
      render: (row: any) => <StatusBadge status={row._overallStatus} size="xs" />,
    },
    { key: 'InstanceDisplayName', label: 'Instance' },
    {
      key: 'Edition',
      label: 'Edition',
      render: (row: any) => <span className="text-xs text-gray-400">{row.Edition || '—'}</span>,
    },
    {
      key: 'ProductVersion',
      label: 'Version',
      render: (row: any) => <span className="text-xs text-gray-400">{row.ProductVersion || '—'}</span>,
    },
    { key: 'cpu_count', label: 'CPUs', render: (row: any) => <span className="text-xs">{row.cpu_count ?? '—'}</span> },
    {
      key: 'physical_memory_kb',
      label: 'RAM',
      exportValue: (row: any) =>
        row.physical_memory_kb ? `${(row.physical_memory_kb / 1048576).toFixed(1)} GB` : '',
      render: (row: any) => <span className="text-xs">{row.physical_memory_kb ? `${(row.physical_memory_kb / 1048576).toFixed(1)} GB` : '—'}</span>,
    },
    {
      key: 'FullBackupStatus',
      label: 'Backup',
      exportValue: (row: any) => (row.FullBackupStatus != null ? dbaStatusCsv(row.FullBackupStatus) : ''),
      render: (row: any) => row.FullBackupStatus ? <StatusBadge status={row.FullBackupStatus} size="xs" /> : <span className="text-xs text-gray-500">—</span>,
    },
    {
      key: 'DriveStatus',
      label: 'Drives',
      exportValue: (row: any) => (row.DriveStatus != null ? dbaStatusCsv(row.DriveStatus) : ''),
      render: (row: any) => row.DriveStatus ? <StatusBadge status={row.DriveStatus} size="xs" /> : <span className="text-xs text-gray-500">—</span>,
    },
    {
      key: 'JobStatus',
      label: 'Jobs',
      exportValue: (row: any) => (row.JobStatus != null ? dbaStatusCsv(row.JobStatus) : ''),
      render: (row: any) => row.JobStatus ? <StatusBadge status={row.JobStatus} size="xs" /> : <span className="text-xs text-gray-500">—</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Instances</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeAllActive}
              onChange={e => setIncludeAllActive(e.target.checked)}
              className="rounded border-slate-600"
            />
            Show all active instances (not only collected in last 24h)
          </label>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Auto-refresh 30s
          </span>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={merged}
        onRowClick={(row) => navigate(`/instances/${row.InstanceID}`)}
        searchKeys={['InstanceDisplayName', 'Instance', 'Edition']}
        exportCsvFileName="instances"
      />
    </div>
  );
}

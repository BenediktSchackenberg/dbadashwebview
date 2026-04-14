import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import type { DashboardSummaryRow, InstanceListRow } from '../api/types';

type InstanceTableRow = InstanceListRow & Partial<DashboardSummaryRow> & {
  _overallStatus: number;
};

function getOverallStatus(row?: Partial<DashboardSummaryRow> | null): number {
  const keys = ['FullBackupStatus', 'DriveStatus', 'JobStatus', 'AGStatus', 'CorruptionStatus', 'LastGoodCheckDBStatus', 'LogBackupStatus'] as const;
  let worst = 4;
  for (const key of keys) {
    const value = row?.[key] != null ? Number(row[key]) : 3;
    if (value === 3) continue;
    if (value < worst) worst = value;
  }
  return worst;
}

export default function InstancesPage() {
  const [instances, setInstances] = useState<InstanceListRow[]>([]);
  const [summary, setSummary] = useState<DashboardSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [instanceRows, summaryRows] = await Promise.all([
          api.instances().catch(() => []),
          api.dashboardSummary().catch(() => []),
        ]);
        setInstances(Array.isArray(instanceRows) ? instanceRows : []);
        setSummary(Array.isArray(summaryRows) ? summaryRows : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const merged: InstanceTableRow[] = instances.map((instance) => {
    const summaryRow = summary.find((row) => row.InstanceID === instance.InstanceID);
    return { ...instance, ...(summaryRow ?? {}), _overallStatus: getOverallStatus(summaryRow) };
  });

  const columns = [
    {
      key: '_overallStatus',
      label: 'Status',
      render: (row: InstanceTableRow) => <StatusBadge status={row._overallStatus} size="xs" />,
    },
    { key: 'InstanceDisplayName', label: 'Instance' },
    { key: 'Edition', label: 'Edition', render: (row: InstanceTableRow) => <span className="text-xs text-gray-400">{row.Edition || 'â€”'}</span> },
    { key: 'ProductVersion', label: 'Version', render: (row: InstanceTableRow) => <span className="text-xs text-gray-400">{row.ProductVersion || 'â€”'}</span> },
    { key: 'cpu_count', label: 'CPUs', render: (row: InstanceTableRow) => <span className="text-xs">{row.cpu_count ?? 'â€”'}</span> },
    {
      key: 'physical_memory_kb',
      label: 'RAM',
      render: (row: InstanceTableRow) => <span className="text-xs">{row.physical_memory_kb ? `${(row.physical_memory_kb / 1048576).toFixed(1)} GB` : 'â€”'}</span>,
    },
    {
      key: 'FullBackupStatus',
      label: 'Backup',
      render: (row: InstanceTableRow) => row.FullBackupStatus ? <StatusBadge status={row.FullBackupStatus} size="xs" /> : <span className="text-xs text-gray-500">â€”</span>,
    },
    {
      key: 'DriveStatus',
      label: 'Drives',
      render: (row: InstanceTableRow) => row.DriveStatus ? <StatusBadge status={row.DriveStatus} size="xs" /> : <span className="text-xs text-gray-500">â€”</span>,
    },
    {
      key: 'JobStatus',
      label: 'Jobs',
      render: (row: InstanceTableRow) => row.JobStatus ? <StatusBadge status={row.JobStatus} size="xs" /> : <span className="text-xs text-gray-500">â€”</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Instances</h1>
        <span className="text-xs text-gray-500 flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Auto-refresh 30s
        </span>
      </div>
      <DataTable
        columns={columns}
        data={merged}
        onRowClick={(row) => navigate(`/instances/${row.InstanceID}`)}
        searchKeys={['InstanceDisplayName', 'Instance', 'Edition']}
      />
    </div>
  );
}

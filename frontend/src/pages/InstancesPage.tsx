import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/api';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';

function getOverallStatus(row: any): number {
  const keys = ['FullBackupStatus', 'DriveStatus', 'JobStatus', 'AGStatus',
    'CorruptionStatus', 'LastGoodCheckDBStatus', 'LogBackupStatus'];
  let worst = 1;
  for (const k of keys) {
    const v = row[k];
    if (v === 4) return 4;
    if (v === 2 && worst < 2) worst = 2;
  }
  return worst;
}

export default function InstancesPage() {
  const [instances, setInstances] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [inst, sum] = await Promise.all([
          api.instances().catch(() => []),
          api.dashboardSummary().catch(() => []),
        ]);
        setInstances(Array.isArray(inst) ? inst : []);
        setSummary(Array.isArray(sum) ? sum : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const merged = instances.map(inst => {
    const s = summary.find((su: any) => su.InstanceID === inst.InstanceID) || {};
    return { ...inst, ...s, _overallStatus: getOverallStatus(s) };
  });

  const columns = [
    {
      key: '_overallStatus',
      label: 'Status',
      render: (row: any) => <StatusBadge status={row._overallStatus} size="xs" />,
    },
    { key: 'InstanceDisplayName', label: 'Instance' },
    { key: 'Edition', label: 'Edition', render: (row: any) => <span className="text-xs text-gray-400">{row.Edition || '—'}</span> },
    { key: 'ProductVersion', label: 'Version', render: (row: any) => <span className="text-xs text-gray-400">{row.ProductVersion || '—'}</span> },
    { key: 'cpu_count', label: 'CPUs', render: (row: any) => <span className="text-xs">{row.cpu_count ?? '—'}</span> },
    {
      key: 'physical_memory_kb',
      label: 'RAM',
      render: (row: any) => <span className="text-xs">{row.physical_memory_kb ? `${(row.physical_memory_kb / 1048576).toFixed(1)} GB` : '—'}</span>,
    },
    {
      key: 'FullBackupStatus', label: 'Backup',
      render: (row: any) => row.FullBackupStatus ? <StatusBadge status={row.FullBackupStatus} size="xs" /> : <span className="text-xs text-gray-500">—</span>,
    },
    {
      key: 'DriveStatus', label: 'Drives',
      render: (row: any) => row.DriveStatus ? <StatusBadge status={row.DriveStatus} size="xs" /> : <span className="text-xs text-gray-500">—</span>,
    },
    {
      key: 'JobStatus', label: 'Jobs',
      render: (row: any) => row.JobStatus ? <StatusBadge status={row.JobStatus} size="xs" /> : <span className="text-xs text-gray-500">—</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Instances</h1>
      <DataTable
        columns={columns}
        data={merged}
        onRowClick={(row) => navigate(`/instances/${row.InstanceID}`)}
        searchKeys={['InstanceDisplayName', 'Instance', 'Edition']}
      />
    </div>
  );
}

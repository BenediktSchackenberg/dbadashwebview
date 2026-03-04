import { useState, useEffect, useMemo } from 'react';
import { api } from '../api/api';
import { useRefresh } from '../App';
import LoadingSpinner from '../components/LoadingSpinner';
import { Heart, Database, HardDrive, Briefcase, Server, ArrowLeft, Download } from 'lucide-react';

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const reportDefs = [
  { id: 'health', title: 'Health Overview', desc: 'Instance health status summary', icon: Heart, color: 'text-emerald-400' },
  { id: 'backups', title: 'Backup Compliance', desc: 'Backup coverage and compliance rate', icon: Database, color: 'text-blue-400' },
  { id: 'disks', title: 'Disk Capacity', desc: 'Drive usage across all instances', icon: HardDrive, color: 'text-yellow-400' },
  { id: 'jobs', title: 'Job Failures', desc: 'Recent job failures (last 24h)', icon: Briefcase, color: 'text-red-400' },
  { id: 'resources', title: 'Top Resource Consumers', desc: 'Instances by CPU usage', icon: Server, color: 'text-purple-400' },
];

export default function ReportsPage() {
  const { lastRefresh } = useRefresh();
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeReport) return;
    setLoading(true);
    const fetcher = {
      health: () => api.dashboardSummary(),
      backups: () => api.backupsEstate(),
      disks: () => api.drives(),
      jobs: () => api.jobsFailures(),
      resources: () => api.instances(),
    }[activeReport];
    if (fetcher) {
      fetcher().then(d => setData(Array.isArray(d) ? d : [])).catch(() => setData([])).finally(() => setLoading(false));
    }
  }, [activeReport, lastRefresh]);

  const complianceScore = useMemo(() => {
    if (activeReport !== 'backups' || data.length === 0) return null;
    const dbs = new Map<string, Date>();
    data.forEach((b: any) => {
      if (b.type === 'D' && b.backup_start_date) {
        const key = `${b.InstanceID}-${b.DatabaseID}`;
        const d = new Date(b.backup_start_date);
        if (!dbs.has(key) || d > dbs.get(key)!) dbs.set(key, d);
      }
    });
    const now = Date.now();
    const total = dbs.size;
    if (total === 0) return null;
    const compliant = [...dbs.values()].filter(d => now - d.getTime() < 24 * 3600 * 1000).length;
    return Math.round((compliant / total) * 100);
  }, [data, activeReport]);

  const handleExport = () => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => String(r[h] ?? '')));
    downloadCSV(`${activeReport}-report.csv`, headers, rows);
  };

  if (!activeReport) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-white">Report Center</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportDefs.map(r => (
            <button key={r.id} onClick={() => setActiveReport(r.id)}
              className="glass rounded-xl p-6 gradient-border text-left hover:bg-white/5 transition-all group">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg bg-white/5 ${r.color}`}>
                  <r.icon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">{r.title}</h3>
                  <p className="text-sm text-gray-400 mt-1">{r.desc}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const def = reportDefs.find(r => r.id === activeReport)!;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setActiveReport(null)} className="p-2 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-white">{def.title}</h1>
        </div>
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-all text-sm font-medium">
          <Download className="w-4 h-4" />
          Download as CSV
        </button>
      </div>

      {complianceScore !== null && (
        <div className="glass rounded-xl p-5 gradient-border">
          <span className="text-sm text-gray-400">Compliance Score: </span>
          <span className={`text-2xl font-bold ${complianceScore >= 90 ? 'text-emerald-400' : complianceScore >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
            {complianceScore}%
          </span>
          <span className="text-sm text-gray-500 ml-2">of databases have a full backup &lt;24h</span>
        </div>
      )}

      {loading ? <LoadingSpinner /> : (
        <div className="glass rounded-xl p-5 gradient-border overflow-x-auto">
          {data.length === 0 ? (
            <p className="text-gray-400 text-sm">No data available for this report.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  {Object.keys(data[0]).map(k => (
                    <th key={k} className="pb-3 text-gray-400 font-medium px-2">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.slice(0, 100).map((row, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    {Object.values(row).map((v, j) => (
                      <td key={j} className="py-2 px-2 text-gray-300">{v != null ? String(v) : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

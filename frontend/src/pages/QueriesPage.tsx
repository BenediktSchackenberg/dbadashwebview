import { useState, useEffect } from 'react';
import { api } from '../api/api';
import { useRefresh } from '../App';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { AlertTriangle } from 'lucide-react';

const mockQueries = [
  { query_hash: '0xA1B2C3D4', TotalCPU: 4520000, TotalIO: 1230000, Executions: 340, AvgDurationMs: 1250, QueryText: 'SELECT TOP 100 * FROM dbo.Orders o JOIN dbo.OrderItems oi ON o.OrderID = oi.OrderID WHERE o.OrderDate > @p1' },
  { query_hash: '0xE5F6A7B8', TotalCPU: 3100000, TotalIO: 890000, Executions: 1200, AvgDurationMs: 450, QueryText: 'UPDATE dbo.Inventory SET Quantity = Quantity - @qty WHERE ProductID = @pid' },
  { query_hash: '0xC9D0E1F2', TotalCPU: 2800000, TotalIO: 2100000, Executions: 55, AvgDurationMs: 8900, QueryText: 'SELECT CustomerID, SUM(Amount) AS TotalSpend FROM dbo.Transactions GROUP BY CustomerID HAVING SUM(Amount) > 10000 ORDER BY TotalSpend DESC' },
  { query_hash: '0x12345678', TotalCPU: 1900000, TotalIO: 450000, Executions: 890, AvgDurationMs: 320, QueryText: 'EXEC dbo.usp_GetDashboardData @StartDate, @EndDate' },
  { query_hash: '0xAABBCCDD', TotalCPU: 1500000, TotalIO: 3400000, Executions: 12, AvgDurationMs: 25000, QueryText: 'SELECT * FROM dbo.AuditLog WHERE EventDate BETWEEN @start AND @end ORDER BY EventDate DESC' },
];

export default function QueriesPage() {
  const { lastRefresh } = useRefresh();
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null);
  const [queries, setQueries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [useMock, setUseMock] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    api.instances().then(d => {
      const arr = Array.isArray(d) ? d : [];
      setInstances(arr);
      if (arr.length > 0 && !selectedInstance) setSelectedInstance(arr[0].InstanceID);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [lastRefresh]);

  useEffect(() => {
    if (!selectedInstance) return;
    setLoading(true);
    api.instanceQueries(selectedInstance).then(d => {
      const arr = Array.isArray(d) ? d : [];
      if (arr.length === 0) {
        setQueries(mockQueries);
        setUseMock(true);
      } else {
        setQueries(arr);
        setUseMock(false);
      }
    }).catch(() => {
      setQueries(mockQueries);
      setUseMock(true);
    }).finally(() => setLoading(false));
  }, [selectedInstance, lastRefresh]);

  if (loading && instances.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Query Analysis</h1>
        <select
          value={selectedInstance ?? ''}
          onChange={e => setSelectedInstance(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        >
          {instances.map(inst => (
            <option key={inst.InstanceID} value={inst.InstanceID}>
              {inst.InstanceDisplayName || inst.Instance}
            </option>
          ))}
        </select>
      </div>

      {useMock && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Connect to database to see live data. Showing sample data.
        </div>
      )}

      <div className="glass rounded-xl p-5 gradient-border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left">
                <th className="pb-3 text-gray-400 font-medium">Query Hash</th>
                <th className="pb-3 text-gray-400 font-medium text-right">Total CPU</th>
                <th className="pb-3 text-gray-400 font-medium text-right">Total IO</th>
                <th className="pb-3 text-gray-400 font-medium text-right">Executions</th>
                <th className="pb-3 text-gray-400 font-medium text-right">Avg Duration (ms)</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((q, i) => (
                <>
                  <tr
                    key={i}
                    onClick={() => setExpandedRow(expandedRow === q.query_hash ? null : q.query_hash)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="py-3 text-blue-400 font-mono text-xs">{q.query_hash}</td>
                    <td className="py-3 text-gray-300 text-right">{(q.TotalCPU ?? 0).toLocaleString()}</td>
                    <td className="py-3 text-gray-300 text-right">{(q.TotalIO ?? 0).toLocaleString()}</td>
                    <td className="py-3 text-gray-300 text-right">{(q.Executions ?? 0).toLocaleString()}</td>
                    <td className="py-3 text-gray-300 text-right">{(q.AvgDurationMs ?? 0).toLocaleString()}</td>
                  </tr>
                  {expandedRow === q.query_hash && (
                    <tr key={`${i}-exp`}>
                      <td colSpan={5} className="py-3 px-4">
                        <pre className="bg-black/30 rounded-lg p-4 text-xs text-gray-300 font-mono overflow-x-auto whitespace-pre-wrap">
                          <code>{q.QueryText || 'No query text available'}</code>
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {queries.length === 0 && <EmptyState message="No query data available." />}
        </div>
      </div>
    </div>
  );
}

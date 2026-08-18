import { useState, useEffect } from 'react';
import { api } from '../api/api';
import type { InstanceListRow, PlanForcingLogRow, QueryStoreRow } from '../api/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Search as SearchIcon } from 'lucide-react';
import { format } from 'date-fns';
import TabNav from '../components/TabNav';

function statusColor(status: string | null | undefined): string {
  const s = (status || '').toUpperCase();
  if (s === 'SUCCESS' || s === 'APPLIED') return 'bg-emerald-400/10 text-emerald-400';
  if (s === 'FAILED' || s === 'ERROR') return 'bg-red-400/10 text-red-400';
  if (s === 'REQUEST' || s === 'PENDING') return 'bg-yellow-400/10 text-yellow-400';
  return 'bg-gray-400/10 text-gray-400';
}

export default function QueryStorePage() {
  const [tab, setTab] = useState<'top-queries' | 'plan-forcing'>('top-queries');
  const [data, setData] = useState<QueryStoreRow[]>([]);
  const [planForcingLog, setPlanForcingLog] = useState<PlanForcingLogRow[]>([]);
  const [instances, setInstances] = useState<InstanceListRow[]>([]);
  const [instanceId, setInstanceId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [sortBy, setSortBy] = useState<'avgCpuTime' | 'avgDuration' | 'countExecutions'>('avgCpuTime');

  useEffect(() => { api.instances().then(setInstances).catch(() => {}); }, []);

  useEffect(() => {
    if (!instanceId) return;
    setLoading(true);
    if (tab === 'top-queries') {
      api.performanceQueryStore(instanceId).then(r => { setData(r.data || []); setNote(r.note || ''); }).finally(() => setLoading(false));
    } else {
      api.performancePlanForcingLog(instanceId).then(r => { setPlanForcingLog(r.data || []); setNote(r.note || ''); }).finally(() => setLoading(false));
    }
  }, [instanceId, tab]);

  const sorted = [...data].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
  const top10 = sorted.slice(0, 10);
  const inputCls = "bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3"><SearchIcon className="w-7 h-7 text-blue-400" /> Query Store</h1>
      <div className="flex gap-3 items-center flex-wrap">
        <select value={instanceId || ''} onChange={e => setInstanceId(Number(e.target.value) || undefined)} className={inputCls}>
          <option value="">Select Instance...</option>
          {instances.map((inst) => <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName || inst.Instance || inst.InstanceID}</option>)}
        </select>
        {tab === 'top-queries' && (
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className={inputCls}>
            <option value="avgCpuTime">Sort by CPU</option>
            <option value="avgDuration">Sort by Duration</option>
            <option value="countExecutions">Sort by Exec Count</option>
          </select>
        )}
      </div>

      <TabNav
        tabs={[
          { key: 'top-queries', label: 'Top Queries' },
          { key: 'plan-forcing', label: 'Plan Forcing History' },
        ]}
        active={tab}
        onChange={key => setTab(key as typeof tab)}
      />

      {note && <p className="text-xs text-amber-400/70">{note}</p>}
      {!instanceId ? <p className="text-gray-500 text-sm">Select an instance to view {tab === 'top-queries' ? 'Query Store' : 'plan forcing'} data.</p> :
        loading ? <div className="text-gray-400">Loading...</div> :
        tab === 'top-queries' ? (
        <>
          {top10.length > 0 && (
            <div className="glass rounded-xl p-6 gradient-border">
              <h3 className="text-sm font-semibold text-gray-400 mb-4">Top 10 by {sortBy === 'avgCpuTime' ? 'CPU' : sortBy === 'avgDuration' ? 'Duration' : 'Executions'}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top10} layout="vertical"><XAxis type="number" stroke="#4b5563" /><YAxis type="category" dataKey="objectName" width={200} stroke="#4b5563" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#1a1f36', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                  <Bar dataKey={sortBy} radius={[0, 4, 4, 0]}>{top10.map((_, i) => <Cell key={i} fill={i < 3 ? '#ef4444' : i < 6 ? '#f59e0b' : '#3b82f6'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="glass rounded-xl p-6 gradient-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-white/10 text-left text-gray-300 font-semibold">
                <th className="pb-2">Query/Object</th><th className="pb-2">Execs</th><th className="pb-2">Avg CPU (ms)</th><th className="pb-2">Avg Duration (ms)</th><th className="pb-2">Avg Reads</th>
              </tr></thead>
              <tbody>{sorted.map((d, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-slate-800/50">
                  <td className="py-2 text-white max-w-xs truncate" title={d.querySqlText || undefined}>{d.objectName || d.querySqlText?.substring(0, 80)}</td>
                  <td className="py-2 text-gray-300">{d.countExecutions?.toLocaleString()}</td>
                  <td className="py-2 text-gray-300">{d.avgCpuTime?.toFixed(1)}</td>
                  <td className="py-2 text-gray-300">{d.avgDuration?.toFixed(1)}</td>
                  <td className="py-2 text-gray-300">{d.avgLogicalIoReads?.toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </>
        ) : (
        <div className="glass rounded-xl p-6 gradient-border overflow-x-auto">
          <p className="text-xs text-gray-500 mb-4">
            Real audit trail from DBA Dash's own forced-plan actions (dbo.PlanForcingLog) — who forced or
            unforced a plan, when, and its status. Forcing a plan itself is still done from the DBA Dash
            desktop client; this is a read-only history.
          </p>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 text-left text-gray-300 font-semibold">
              <th className="pb-2">Date</th><th className="pb-2">Type</th><th className="pb-2">Status</th><th className="pb-2">Database</th>
              <th className="pb-2">Object</th><th className="pb-2">Query/Plan ID</th><th className="pb-2">User</th><th className="pb-2">Notes</th>
            </tr></thead>
            <tbody>{planForcingLog.map(r => (
              <tr key={r.MessageGroupID} className="border-b border-white/5 hover:bg-slate-800/50">
                <td className="py-2 text-gray-300 text-xs whitespace-nowrap">{r.log_date ? format(new Date(r.log_date), 'MMM d HH:mm:ss') : '—'}</td>
                <td className="py-2 text-gray-300 text-xs">{r.log_type}</td>
                <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded ${statusColor(r.status)}`}>{r.status || '—'}</span></td>
                <td className="py-2 text-gray-300 text-xs">{r.database_name}</td>
                <td className="py-2 text-white text-xs max-w-xs truncate" title={r.query_sql_text || undefined}>{r.object_name || r.query_sql_text?.substring(0, 60) || '—'}</td>
                <td className="py-2 text-gray-400 text-xs font-mono">{r.query_id} / {r.plan_id}</td>
                <td className="py-2 text-gray-300 text-xs">{r.user_name}</td>
                <td className="py-2 text-gray-400 text-xs max-w-xs truncate" title={r.notes || undefined}>{r.notes || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          {planForcingLog.length === 0 && <p className="text-gray-500 text-sm py-4 text-center">No plan forcing actions recorded for this instance.</p>}
        </div>
        )
      }
    </div>
  );
}

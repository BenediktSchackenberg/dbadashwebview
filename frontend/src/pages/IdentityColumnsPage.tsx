import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key } from 'lucide-react';
import { api } from '../api/api';

export default function IdentityColumnsPage() {
  const [data, setData] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [instanceId, setInstanceId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => { api.instances().then(setInstances).catch(() => {}); }, []);
  useEffect(() => {
    if (!instanceId) { setData([]); return; }
    setLoading(true);
    api.monitoringIdentityColumns(instanceId).then(r => { setData(r.data || []); setNote(r.note || ''); }).finally(() => setLoading(false));
  }, [instanceId]);

  const getColor = (pct: number) => pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981';
  const inputCls = "bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3"><Key className="w-7 h-7 text-amber-400" /> Identity Columns</h1>
      <select value={instanceId || ''} onChange={e => setInstanceId(Number(e.target.value) || undefined)} className={inputCls}>
        <option value="">Select Instance...</option>
        {instances.map((inst: any) => <option key={inst.instanceID} value={inst.instanceID}>{inst.instanceDisplayName || inst.instance}</option>)}
      </select>
      {note && <p className="text-xs text-amber-400/70">{note}</p>}
      {!instanceId ? <p className="text-gray-500 text-sm">Select an instance to view identity column usage.</p> :
        loading ? <div className="text-gray-400">Loading...</div> :
        data.length === 0 ? <p className="text-gray-500 text-sm">No identity columns found.</p> :
        <div className="glass rounded-xl p-5 gradient-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 text-left text-gray-400">
              <th className="pb-2">Database</th><th className="pb-2">Table</th><th className="pb-2">Column</th><th className="pb-2">Last Value</th><th className="pb-2">Max Value</th><th className="pb-2 w-48">Usage</th>
            </tr></thead>
            <tbody>{data.map((d, i) => {
              const pct = d.percentUsed ?? 0;
              return (
                <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 text-gray-300">{d.databaseName}</td>
                  <td className="py-2 text-white">{d.schemaName}.{d.tableName}</td>
                  <td className="py-2 text-gray-300">{d.columnName}</td>
                  <td className="py-2 text-gray-400 font-mono text-xs">{d.lastValue?.toLocaleString()}</td>
                  <td className="py-2 text-gray-400 font-mono text-xs">{d.maxValue?.toLocaleString()}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white/5 rounded-full h-2.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: getColor(pct) }} />
                      </div>
                      <span className="text-xs font-medium" style={{ color: getColor(pct) }}>{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                </motion.tr>
              );
            })}</tbody>
          </table>
        </div>
      }
    </div>
  );
}

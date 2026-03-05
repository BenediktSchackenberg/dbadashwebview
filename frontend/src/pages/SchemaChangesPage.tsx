import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GitBranch } from 'lucide-react';
import { api } from '../api/api';

export default function SchemaChangesPage() {
  const [data, setData] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [instanceId, setInstanceId] = useState<number | undefined>();
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');

  useEffect(() => { api.instances().then(setInstances).catch(() => {}); }, []);
  useEffect(() => {
    if (!instanceId) { setData([]); setLoading(false); return; }
    setLoading(true);
    api.monitoringSchemaChanges(instanceId, days).then(r => { setData(r.data || []); setNote(r.note || ''); }).finally(() => setLoading(false));
  }, [instanceId, days]);

  const inputCls = "bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-3"><GitBranch className="w-7 h-7 text-purple-400" /> Schema Changes</h1>
      <div className="flex gap-3 items-center flex-wrap">
        <select value={instanceId || ''} onChange={e => setInstanceId(Number(e.target.value) || undefined)} className={inputCls}>
          <option value="">Select Instance...</option>
          {instances.map((inst: any) => <option key={inst.instanceID} value={inst.instanceID}>{inst.instanceDisplayName || inst.instance}</option>)}
        </select>
        <select value={days} onChange={e => setDays(Number(e.target.value))} className={inputCls}>
          {[7, 14, 30, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      {note && <p className="text-xs text-amber-400/70">{note}</p>}
      {!instanceId ? <p className="text-gray-500 text-sm">Select an instance to view schema changes.</p> :
        loading ? <div className="text-gray-400">Loading...</div> :
        data.length === 0 ? <p className="text-gray-500 text-sm">No schema changes found.</p> :
        <div className="glass rounded-xl p-6 gradient-border">
          <div className="space-y-3">
            {data.map((d, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.02 }}
                className="flex items-start gap-4 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-slate-800/50 transition-colors">
                <div className="w-2 h-2 rounded-full bg-purple-400 mt-2 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white font-medium">{d.schemaName}.{d.objectName}</span>
                    <span className="px-1.5 py-0.5 rounded text-xs bg-purple-500/10 text-purple-400">{d.ddlEvent || d.objectType}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {d.loginName && <span>by {d.loginName} — </span>}
                    {new Date(d.eventDate).toLocaleString()}
                  </div>
                  {d.ddlText && <pre className="mt-2 text-xs text-gray-400 bg-black/20 rounded p-2 overflow-x-auto max-h-32">{d.ddlText}</pre>}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      }
    </div>
  );
}

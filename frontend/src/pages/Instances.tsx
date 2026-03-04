import { useEffect, useState } from 'react'
import { api } from '../api'

type Instance = { id: number; name: string; connectionId: string | null }

export default function Instances() {
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.instances()
      .then(setInstances)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-slate-100">SQL Server Instances</h2>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6 text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Status</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Instance</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Connection</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Backup</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">DBCC</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Disk</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">Loading…</td></tr>
            ) : instances.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">No instances found. Check database connection.</td></tr>
            ) : (
              instances.map(inst => (
                <tr key={inst.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                  <td className="px-5 py-3">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-500" title="Unknown" />
                  </td>
                  <td className="px-5 py-3 font-medium text-slate-200">{inst.name}</td>
                  <td className="px-5 py-3 text-slate-400 font-mono text-xs">{inst.connectionId ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-500">—</td>
                  <td className="px-5 py-3 text-slate-500">—</td>
                  <td className="px-5 py-3 text-slate-500">—</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

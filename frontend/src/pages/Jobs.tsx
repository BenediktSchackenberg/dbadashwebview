import { useEffect, useState } from 'react'
import { api } from '../api'

type Job = {
  jobId: number; jobName: string; instanceId: number;
  runStatus: number; runDate: number; runTime: number; runDuration: number;
}

const statusLabel = (s: number) => {
  switch (s) {
    case 0: return { text: 'Failed', cls: 'bg-red-500/20 text-red-400 border-red-500/30' }
    case 1: return { text: 'Success', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' }
    case 2: return { text: 'Retry', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }
    case 3: return { text: 'Canceled', cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30' }
    default: return { text: 'Unknown', cls: 'bg-slate-500/20 text-slate-400 border-slate-500/30' }
  }
}

function formatDate(d: number) {
  const s = String(d)
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}
function formatTime(t: number) {
  const s = String(t).padStart(6, '0')
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`
}

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.recentJobs()
      .then(setJobs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6 text-slate-100">Recent Agent Jobs</h2>

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
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Job Name</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Date</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Time</th>
              <th className="text-left px-5 py-3.5 text-slate-400 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">Loading…</td></tr>
            ) : jobs.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No jobs found. Check database connection.</td></tr>
            ) : (
              jobs.map((job, i) => {
                const st = statusLabel(job.runStatus)
                return (
                  <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${st.cls}`}>
                        {st.text}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-200">{job.jobName}</td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">{formatDate(job.runDate)}</td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">{formatTime(job.runTime)}</td>
                    <td className="px-5 py-3 text-slate-400 font-mono text-xs">{job.runDuration}s</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

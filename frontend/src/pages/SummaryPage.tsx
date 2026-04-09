import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { api } from '../api/api';
import { SUMMARY_STATUS_KEYS } from '../constants/summaryStatusKeys';
import { usePresentationOptional } from '../context/PresentationContext';
import { RefreshCw, Clock, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

/* DBA Dash Status Enum: Critical=1, Warning=2, NA=3, OK=4, Acknowledged=5 */

function cellBg(
  count: number,
  type: 'ok' | 'warning' | 'critical' | 'na' | 'ack',
  desktop: boolean,
): string {
  if (desktop) {
    if (count === 0) return 'dba-cell-na';
    if (type === 'ok') return 'dba-cell-ok';
    if (type === 'warning') return 'dba-cell-warn';
    if (type === 'critical') return 'dba-cell-crit';
    if (type === 'ack') return 'dba-cell-ack';
    return 'dba-cell-na';
  }
  if (count === 0) return 'text-gray-600';
  if (type === 'ok') return 'bg-green-600/60 text-green-100 font-semibold';
  if (type === 'warning') return 'bg-yellow-500/60 text-yellow-100 font-semibold';
  if (type === 'critical') return 'bg-red-600/60 text-red-100 font-semibold';
  if (type === 'ack') return 'bg-blue-600/40 text-blue-200 font-semibold';
  return 'text-gray-400';
}

export default function SummaryPage() {
  const { dataGridTableClass, dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.dashboardSummary();
      setSummary(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
      setCountdown(30);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { fetchData(); return 30; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  // Build status matrix — DBA Dash enum: Critical=1, Warning=2, NA=3, OK=4, Acknowledged=5
  const matrix = useMemo(() => {
    return SUMMARY_STATUS_KEYS.map(sk => {
      let ok = 0, warning = 0, critical = 0, na = 0, ack = 0;
      for (const row of summary) {
        const raw = row[sk.key];
        const v = (raw == null) ? 3 : Number(raw);
        if (v === 4) ok++;
        else if (v === 2) warning++;
        else if (v === 1) critical++;
        else if (v === 5) ack++;
        else na++; // 3 or anything else
      }
      if (ok + warning + critical + ack === 0 && na === summary.length) return null;
      return { ...sk, ok, warning, critical, na, ack, total: ok + warning + critical + na + ack };
    }).filter(Boolean) as { key: string; label: string; ok: number; warning: number; critical: number; na: number; ack: number; total: number }[];
  }, [summary]);

  if (loading && summary.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
        <p className="text-gray-400">Loading Summary...</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Summary</h1>
          <p className="text-xs text-gray-500">{summary.length} instances · DBA Dash Summary_Get</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {lastRefresh.toLocaleTimeString()}</span>
          <span className="flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> {countdown}s</span>
          <button onClick={fetchData} className="p-1.5 rounded hover:bg-white/10">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className={isDesktopData ? dataGridShellClass : 'glass rounded-xl overflow-hidden'}>
        <div className={isDesktopData ? '' : 'overflow-x-auto'}>
          <table className={clsx(isDesktopData ? dataGridTableClass : 'w-full text-xs')}>
            <thead>
              <tr className={isDesktopData ? '' : 'bg-slate-800/80'}>
                <th className={clsx(!isDesktopData && 'px-3 py-2.5 text-left text-gray-400 font-semibold uppercase tracking-wider')}>
                  Test
                </th>
                <th className={clsx('text-center', !isDesktopData && 'px-3 py-2.5 text-green-400 font-semibold')}>
                  Instance Count OK
                </th>
                <th className={clsx('text-center', !isDesktopData && 'px-3 py-2.5 text-yellow-400 font-semibold')}>
                  Instance Count Warning
                </th>
                <th className={clsx('text-center', !isDesktopData && 'px-3 py-2.5 text-red-400 font-semibold')}>
                  Instance Count Critical
                </th>
                <th className={clsx('text-center', !isDesktopData && 'px-3 py-2.5 text-gray-400 font-semibold')}>
                  Instance Count N/A
                </th>
                <th className={clsx('text-center', !isDesktopData && 'px-3 py-2.5 text-blue-400 font-semibold')}>
                  Instance Count Acknowledged
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((m) => (
                <tr key={m.key} className={isDesktopData ? '' : 'border-b border-white/5 hover:bg-white/5 transition-colors'}>
                  <td
                    className={clsx(
                      'font-medium',
                      !isDesktopData && 'px-3 py-1.5',
                      !isDesktopData && (m.critical > 0 ? 'text-red-400' : m.warning > 0 ? 'text-yellow-400' : 'text-white'),
                    )}
                  >
                    {m.label}
                  </td>
                  <td className={clsx('text-center', !isDesktopData && 'px-3 py-1.5')}>
                    <span className={clsx('inline-block min-w-[2rem]', !isDesktopData && 'px-2 py-0.5 rounded', cellBg(m.ok, 'ok', isDesktopData))}>
                      {m.ok}
                    </span>
                  </td>
                  <td className={clsx('text-center', !isDesktopData && 'px-3 py-1.5')}>
                    <span className={clsx('inline-block min-w-[2rem]', !isDesktopData && 'px-2 py-0.5 rounded', cellBg(m.warning, 'warning', isDesktopData))}>
                      {m.warning}
                    </span>
                  </td>
                  <td className={clsx('text-center', !isDesktopData && 'px-3 py-1.5')}>
                    <span className={clsx('inline-block min-w-[2rem]', !isDesktopData && 'px-2 py-0.5 rounded', cellBg(m.critical, 'critical', isDesktopData))}>
                      {m.critical}
                    </span>
                  </td>
                  <td className={clsx('text-center', !isDesktopData && 'px-3 py-1.5')}>
                    <span className={clsx('inline-block min-w-[2rem]', !isDesktopData && 'px-2 py-0.5 rounded', cellBg(m.na, 'na', isDesktopData))}>
                      {m.na}
                    </span>
                  </td>
                  <td className={clsx('text-center', !isDesktopData && 'px-3 py-1.5')}>
                    <span className={clsx('inline-block min-w-[2rem]', !isDesktopData && 'px-2 py-0.5 rounded', cellBg(m.ack, 'ack', isDesktopData))}>
                      {m.ack}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

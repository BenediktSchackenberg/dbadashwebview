import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRefresh } from '../App';
import SummaryPage from './SummaryPage';
import DashboardPerfSummary from './DashboardPerfSummary';
import AlertsPage from './AlertsPage';
import SlowQueriesPage from './SlowQueriesPage';
import RunningQueriesPage from './RunningQueriesPage';

const TABS = [
  { key: 'summary', label: 'Summary' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'performance', label: 'Performance Summary' },
  { key: 'slow', label: 'Slow Queries' },
  { key: 'running', label: 'Running Queries' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function DashboardPage() {
  const [tab, setTab] = useState<TabKey>('summary');
  const location = useLocation();
  const { refresh } = useRefresh();

  useEffect(() => {
    if (location.pathname === '/') {
      setTab('summary');
      refresh();
    }
  }, [location.pathname, refresh]);

  return (
    <div className="space-y-4">
      {/* Tab Bar — matching DBA Dash original layout */}
      <div className="flex items-center gap-1 bg-slate-800/60 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'text-white'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            {tab === t.key && (
              <motion.div
                layoutId="dashboard-tab"
                className="absolute inset-0 bg-blue-600/20 border border-blue-500/30 rounded-lg"
                transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
              />
            )}
            <span className="relative z-10">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'summary' && <SummaryPage />}
      {tab === 'alerts' && <AlertsPage />}
      {tab === 'performance' && <DashboardPerfSummary />}
      {tab === 'slow' && <SlowQueriesPage />}
      {tab === 'running' && <RunningQueriesPage />}
    </div>
  );
}

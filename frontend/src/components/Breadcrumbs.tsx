import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { usePresentationOptional } from '../context/PresentationContext';

export default function Breadcrumbs() {
  const location = useLocation();
  const { isDesktopData } = usePresentationOptional();
  const reduceMotion = useReducedMotion();
  const parts = location.pathname.split('/').filter(Boolean);

  if (parts.length === 0) {
    const dash = <span className="text-sm text-gray-400">Dashboard</span>;
    if (isDesktopData || reduceMotion) return dash;
    return (
      <motion.span
        className="text-sm text-gray-400"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
      >
        Dashboard
      </motion.span>
    );
  }

  const crumbs: { label: string; path: string }[] = [];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    const label = part === 'windows-screens' ? 'WinForms map'
      : part === 'windows-parity' ? 'Windows parity'
      : part === 'tools' ? 'Tools'
      : part === 'community' ? 'Community tools'
      : part === 'custom-reports' ? 'Custom reports'
      : part === 'performance' ? 'Performance'
      : part === 'monitoring' ? 'Monitoring'
      : part === 'estate' ? 'Estate'
      : part === 'cpu' ? 'CPU'
      : part === 'running-queries' ? 'Running queries'
      : part === 'slow-queries' ? 'Slow queries'
      : part === 'exec-stats' ? 'Exec stats'
      : part === 'waits-timeline' ? 'Waits'
      : part === 'query-store' ? 'Query Store'
      : part === 'job-timeline' ? 'Job timeline'
      : part === 'schema-changes' ? 'Schema changes'
      : part === 'identity-columns' ? 'Identity columns'
      : part === 'db-space' ? 'DB space'
      : part === 'log-shipping' ? 'Log shipping'
      : part === 'database-mirroring' ? 'DB mirroring'
      : part === 'collection-health' ? 'Collection health'
      : part === 'corruption-checkdb' ? 'Corruption / CHECKDB'
      : part === 'drive-history' ? 'Drive history'
      : part === 'fleet-stats' ? 'Fleet stats'
      : part === 'backup-ampel' ? 'Backup ampel'
      : part === 'availability-groups' ? 'AG'
      : part === 'instances' ? 'Instances'
      : part === 'jobs' ? 'Jobs'
      : part === 'backups' ? 'Backups'
      : part === 'alerts' ? 'Alerts'
      : part === 'drives' ? 'Drives'
      : part === 'databases' ? 'Databases'
      : part.match(/^\d+$/) ? `#${part}`
      : part;
    crumbs.push({ label, path: acc });
  }

  const innerStatic = (
    <>
      <Link to="/" className="text-gray-500 hover:text-gray-300 transition-colors duration-200">
        Dashboard
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 shrink-0 text-gray-600 transition-transform duration-200" />
          {i === crumbs.length - 1 ? (
            <span className="font-medium text-gray-200">{c.label}</span>
          ) : (
            <Link to={c.path} className="text-gray-500 hover:text-gray-300 transition-colors duration-200">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </>
  );

  if (isDesktopData || reduceMotion) {
    return <nav className="flex flex-wrap items-center gap-1 text-sm">{innerStatic}</nav>;
  }

  const crumbItem = {
    hidden: { opacity: 0, x: -7 },
    show: {
      opacity: 1,
      x: 0,
      transition: { type: 'spring' as const, stiffness: 420, damping: 34 },
    },
  };

  const navList = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.038, delayChildren: 0.04 },
    },
  };

  return (
    <motion.nav
      className="flex flex-wrap items-center gap-1 text-sm"
      key={location.pathname}
      variants={navList}
      initial="hidden"
      animate="show"
    >
      <motion.span variants={crumbItem} className="inline-flex">
        <Link to="/" className="text-gray-500 hover:text-gray-300 transition-colors duration-200">
          Dashboard
        </Link>
      </motion.span>
      {crumbs.map((c, i) => (
        <motion.span key={c.path} variants={crumbItem} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 shrink-0 text-gray-600" />
          {i === crumbs.length - 1 ? (
            <span className="font-medium text-gray-200">{c.label}</span>
          ) : (
            <Link to={c.path} className="text-gray-500 hover:text-gray-300 transition-colors duration-200">
              {c.label}
            </Link>
          )}
        </motion.span>
      ))}
    </motion.nav>
  );
}

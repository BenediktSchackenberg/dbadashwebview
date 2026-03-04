import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function Breadcrumbs() {
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);

  if (parts.length === 0) return <span className="text-sm text-gray-400">Dashboard</span>;

  const crumbs: { label: string; path: string }[] = [];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    const label = part === 'instances' ? 'Instances'
      : part === 'jobs' ? 'Jobs'
      : part === 'backups' ? 'Backups'
      : part === 'alerts' ? 'Alerts'
      : part === 'drives' ? 'Drives'
      : part === 'availability-groups' ? 'AG'
      : part === 'databases' ? 'Databases'
      : part.match(/^\d+$/) ? `#${part}`
      : part;
    crumbs.push({ label, path: acc });
  }

  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link to="/" className="text-gray-500 hover:text-gray-300 transition-colors">Dashboard</Link>
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 text-gray-600" />
          {i === crumbs.length - 1 ? (
            <span className="text-gray-300">{c.label}</span>
          ) : (
            <Link to={c.path} className="text-gray-500 hover:text-gray-300 transition-colors">{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}

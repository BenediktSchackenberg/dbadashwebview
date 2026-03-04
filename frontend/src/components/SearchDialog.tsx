import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Server, Database, Briefcase, X } from 'lucide-react';
import { clsx } from 'clsx';

interface SearchItem {
  type: 'instance' | 'database' | 'job';
  label: string;
  sublabel?: string;
  path: string;
}

interface SearchDialogProps {
  instances: any[];
  databases: any[];
  jobs: any[];
}

export default function SearchDialog({ instances, databases, jobs }: SearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const allItems: SearchItem[] = [];
  for (const inst of instances) {
    allItems.push({
      type: 'instance',
      label: inst.InstanceDisplayName || inst.ConnectionID || inst.Instance,
      sublabel: inst.Edition,
      path: `/instances/${inst.InstanceID}`,
    });
  }
  for (const db of databases) {
    allItems.push({
      type: 'database',
      label: db.name,
      sublabel: db.InstanceDisplayName || `Instance ${db.InstanceID}`,
      path: `/instances/${db.InstanceID}/databases/${db.DatabaseID}`,
    });
  }
  for (const job of jobs) {
    allItems.push({
      type: 'job',
      label: job.step_name || job.job_id,
      sublabel: job.InstanceDisplayName,
      path: `/instances/${job.InstanceID}`,
    });
  }

  const q = query.toLowerCase();
  const filtered = q ? allItems.filter(i => i.label?.toLowerCase().includes(q) || i.sublabel?.toLowerCase().includes(q)) : allItems.slice(0, 20);

  const grouped = {
    instance: filtered.filter(i => i.type === 'instance'),
    database: filtered.filter(i => i.type === 'database'),
    job: filtered.filter(i => i.type === 'job'),
  };

  const flatFiltered = [...grouped.instance, ...grouped.database, ...grouped.job];

  const handleSelect = useCallback((item: SearchItem) => {
    navigate(item.path);
    setOpen(false);
  }, [navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatFiltered[selectedIndex]) {
      handleSelect(flatFiltered[selectedIndex]);
    }
  };

  useEffect(() => { setSelectedIndex(0); }, [query]);

  if (!open) return null;

  const iconMap = { instance: Server, database: Database, job: Briefcase };
  const groupLabels = { instance: 'Instances', database: 'Databases', job: 'Jobs' };

  let globalIdx = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg glass-strong rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search instances, databases, jobs..."
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
          />
          <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {flatFiltered.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No results found</p>
          )}
          {(['instance', 'database', 'job'] as const).map(type => {
            const items = grouped[type];
            if (items.length === 0) return null;
            const Icon = iconMap[type];
            return (
              <div key={type}>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 px-3 py-1.5 font-medium">{groupLabels[type]}</p>
                {items.map(item => {
                  globalIdx++;
                  const idx = globalIdx;
                  return (
                    <button
                      key={`${type}-${idx}`}
                      onClick={() => handleSelect(item)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                        idx === selectedIndex ? 'bg-blue-500/15 text-blue-400' : 'text-gray-300 hover:bg-white/5'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-gray-500" />
                      <div className="min-w-0">
                        <p className="text-sm truncate">{item.label}</p>
                        {item.sublabel && <p className="text-[10px] text-gray-500 truncate">{item.sublabel}</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-white/10 flex items-center gap-4 text-[10px] text-gray-500">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}

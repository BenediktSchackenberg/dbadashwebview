import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Server, Database, Briefcase, X, History } from 'lucide-react';
import { clsx } from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { OPEN_SEARCH_EVENT } from '../lib/searchEvents';

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

const RECENT_KEY = 'dba-search-recent-v1';

function loadRecent(): SearchItem[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Partial<SearchItem>[];
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (x): x is SearchItem =>
        Boolean(x && typeof x.path === 'string' && typeof x.label === 'string' && x.type),
    );
  } catch {
    return [];
  }
}

function pushRecent(item: SearchItem) {
  const prev = loadRecent();
  const next = [item, ...prev.filter(p => p.path !== item.path)].slice(0, 8);
  sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export default function SearchDialog({ instances, databases, jobs }: SearchDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentTick, setRecentTick] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = panelRef.current;
    if (!root) return;
    const focusables = () =>
      [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea')].filter(
        el => !el.hasAttribute('disabled'),
      );
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onTab);
    return () => root.removeEventListener('keydown', onTab);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const allItems = useMemo(() => {
    const list: SearchItem[] = [];
    for (const inst of instances) {
      list.push({
        type: 'instance',
        label: inst.InstanceDisplayName || inst.ConnectionID || inst.Instance,
        sublabel: inst.Edition,
        path: `/instances/${inst.InstanceID}`,
      });
    }
    for (const db of databases) {
      list.push({
        type: 'database',
        label: db.name,
        sublabel: db.InstanceDisplayName || `Instance ${db.InstanceID}`,
        path: `/instances/${db.InstanceID}/databases/${db.DatabaseID}`,
      });
    }
    for (const job of jobs) {
      list.push({
        type: 'job',
        label: job.step_name || job.job_id,
        sublabel: job.InstanceDisplayName,
        path: `/instances/${job.InstanceID}`,
      });
    }
    return list;
  }, [instances, databases, jobs]);

  const q = query.trim().toLowerCase();

  const { flatFiltered, recentForRender, grouped } = useMemo(() => {
    if (q) {
      const filtered = allItems.filter(
        i => i.label?.toLowerCase().includes(q) || i.sublabel?.toLowerCase().includes(q),
      );
      const g = {
        instance: filtered.filter(i => i.type === 'instance'),
        database: filtered.filter(i => i.type === 'database'),
        job: filtered.filter(i => i.type === 'job'),
      };
      const flat = [...g.instance, ...g.database, ...g.job];
      return { flatFiltered: flat, recentForRender: [] as SearchItem[], grouped: g };
    }
    const recent = loadRecent();
    const recentPaths = new Set(recent.map(r => r.path));
    const browsed = allItems.filter(i => !recentPaths.has(i.path)).slice(0, 20);
    const g = {
      instance: browsed.filter(i => i.type === 'instance'),
      database: browsed.filter(i => i.type === 'database'),
      job: browsed.filter(i => i.type === 'job'),
    };
    const flat = [...recent, ...g.instance, ...g.database, ...g.job];
    return { flatFiltered: flat, recentForRender: recent, grouped: g };
  }, [allItems, q, recentTick]);

  const handleSelect = useCallback(
    (item: SearchItem) => {
      pushRecent(item);
      setRecentTick(t => t + 1);
      navigate(item.path);
      setOpen(false);
    },
    [navigate],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, Math.max(0, flatFiltered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatFiltered[selectedIndex]) {
      handleSelect(flatFiltered[selectedIndex]!);
    }
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    setSelectedIndex(i => Math.min(i, Math.max(0, flatFiltered.length - 1)));
  }, [flatFiltered]);

  const iconMap = { instance: Server, database: Database, job: Briefcase };
  const groupLabels = { instance: 'Instances', database: 'Databases', job: 'Jobs' };

  let globalIdx = -1;

  const listParent = reduceMotion
    ? { hidden: {}, show: {} }
    : { hidden: {}, show: { transition: { staggerChildren: 0.028, delayChildren: 0.06 } } };
  const listChild = reduceMotion
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.12 } } }
    : {
        hidden: { opacity: 0, y: 10 },
        show: {
          opacity: 1,
          y: 0,
          transition: { type: 'spring' as const, stiffness: 520, damping: 36 },
        },
      };

  const renderRow = (item: SearchItem) => {
    globalIdx++;
    const idx = globalIdx;
    const Icon = iconMap[item.type];
    return (
      <motion.button
        key={`${item.type}-${item.path}-${item.label}-${idx}`}
        type="button"
        variants={listChild}
        onClick={() => handleSelect(item)}
        className={clsx(
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors duration-200',
          idx === selectedIndex ? 'bg-blue-500/15 text-blue-400' : 'text-gray-300 hover:bg-slate-800/50',
        )}
      >
        <Icon className="w-4 h-4 shrink-0 text-gray-500" />
        <div className="min-w-0">
          <p className="text-sm truncate">{item.label}</p>
          {item.sublabel && <p className="text-[10px] text-gray-500 truncate">{item.sublabel}</p>}
        </div>
      </motion.button>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.22 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.25 }}
          />
          <motion.div
            ref={panelRef}
            className="relative w-full max-w-lg glass-strong rounded-2xl shadow-2xl overflow-hidden gpu-promote-layer"
            onClick={e => e.stopPropagation()}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
            transition={
              reduceMotion
                ? { duration: 0.15 }
                : { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.85 }
            }
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
              <motion.span
                initial={reduceMotion ? false : { scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring' as const, stiffness: 400, damping: 24, delay: reduceMotion ? 0 : 0.05 }}
              >
                <Search className="w-5 h-5 text-gray-400 shrink-0" />
              </motion.span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search instances, databases, jobs..."
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
              />
              <motion.button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-300 rounded-lg p-1 transition-colors"
                whileTap={reduceMotion ? undefined : { scale: 0.92 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>
            <motion.div
              className="max-h-80 overflow-y-auto p-2"
              variants={listParent}
              initial="hidden"
              animate="show"
            >
              {flatFiltered.length === 0 && (
                <motion.p variants={listChild} className="text-sm text-gray-500 text-center py-8">
                  {q ? 'No results found' : 'No suggestions yet — type to search'}
                </motion.p>
              )}
              {!q && recentForRender.length > 0 && (
                <div className="mb-1">
                  <motion.p
                    variants={listChild}
                    className="text-[10px] uppercase tracking-wider text-gray-500 px-3 py-1.5 font-medium flex items-center gap-1.5"
                  >
                    <History className="w-3 h-3" />
                    Recent
                  </motion.p>
                  {recentForRender.map(item => renderRow(item))}
                </div>
              )}
              {(['instance', 'database', 'job'] as const).map(type => {
                const items = grouped[type];
                if (items.length === 0) return null;
                return (
                  <div key={type}>
                    <motion.p
                      variants={listChild}
                      className="text-[10px] uppercase tracking-wider text-gray-500 px-3 py-1.5 font-medium"
                    >
                      {groupLabels[type]}
                    </motion.p>
                    {items.map(item => renderRow(item))}
                  </div>
                );
              })}
            </motion.div>
            <motion.div
              className="px-4 py-2 border-t border-white/10 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduceMotion ? 0 : 0.12, duration: 0.2 }}
            >
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>Esc Close</span>
              <span className="text-gray-600">Recent saves automatically</span>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Tag, X } from 'lucide-react';
import { api } from '../api/api';
import type { ViewTagOption } from '../api/types';
import { getAuthSession } from '../auth/session';

interface AdminTagFilterProps {
  selected: string[];
  onChange: (tags: string[]) => void;
}

export default function AdminTagFilter({ selected, onChange }: AdminTagFilterProps) {
  const [options, setOptions] = useState<ViewTagOption[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const isAdmin = getAuthSession()?.role === 'Admin';

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api.tags()
      .then(rows => {
        if (!cancelled) setOptions(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isAdmin]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!isAdmin) return null;

  const filteredOptions = options.filter(option =>
    option.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  const toggle = (tag: string) => {
    onChange(selected.includes(tag)
      ? selected.filter(value => value !== tag)
      : [...selected, tag]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen(current => !current);
          setSearch('');
        }}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
          selected.length > 0
            ? 'border-purple-400/40 bg-purple-500/15 text-purple-200'
            : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
        }`}
        aria-label="Filter current view by tag"
        aria-expanded={open}
        title="Temporary admin view filter"
      >
        <Tag className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">
          {selected.length === 0 ? 'All tags' : `Tags (${selected.length})`}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-white/10 bg-slate-900 p-3 shadow-2xl">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Filter by tags</p>
              <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
                Shows instances matching any selected tag for this session.
              </p>
            </div>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded p-1 text-gray-500 hover:bg-white/5 hover:text-white"
                aria-label="Clear tag filter"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {options.length > 8 && (
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search tags..."
              className="mb-2 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:border-purple-400/50 focus:outline-none"
            />
          )}

          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {loading && <p className="px-2 py-3 text-center text-xs text-gray-500">Loading tags...</p>}
            {!loading && filteredOptions.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-gray-500">No tags found</p>
            )}
            {filteredOptions.map(option => {
              const checked = selected.includes(option.name);
              return (
                <button
                  type="button"
                  key={option.name}
                  onClick={() => toggle(option.name)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-gray-200 hover:bg-white/5"
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                    checked ? 'border-purple-400 bg-purple-500/30 text-purple-100' : 'border-slate-600 text-transparent'
                  }`}>
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{option.name}</span>
                  <span className="text-[10px] text-gray-600">{Number(option.instanceCount || 0)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

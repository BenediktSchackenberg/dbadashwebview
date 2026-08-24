import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { clsx } from 'clsx';

export type FilterMode = 'include' | 'exclude';

interface MultiSelectFilterProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  mode: FilterMode;
  onModeChange: (mode: FilterMode) => void;
}

/**
 * Dropdown checkbox list with an include/exclude toggle, e.g. "show only these
 * drives" vs "hide these drives". Used anywhere a plain single-select dropdown
 * isn't enough (drive letters, instance names, ...).
 */
export default function MultiSelectFilter({ label, options, selected, onChange, mode, onModeChange }: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filteredOptions = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  const summary = selected.length === 0
    ? `All ${label}`
    : `${mode === 'exclude' ? 'Excl. ' : ''}${label} (${selected.length})`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen(o => !o);
          setSearch('');
        }}
        className={clsx(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors',
          selected.length > 0
            ? mode === 'exclude'
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            : 'bg-slate-800 border-slate-600 text-gray-300 hover:text-white'
        )}
      >
        {summary}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-64 rounded-lg border border-white/10 bg-slate-900 shadow-xl p-2">
          <div className="flex rounded-md overflow-hidden border border-white/10 mb-2 text-xs">
            <button
              onClick={() => onModeChange('include')}
              className={clsx('flex-1 py-1.5 transition-colors', mode === 'include' ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400 hover:text-white')}
            >
              Include
            </button>
            <button
              onClick={() => onModeChange('exclude')}
              className={clsx('flex-1 py-1.5 transition-colors', mode === 'exclude' ? 'bg-red-500/20 text-red-300' : 'text-gray-400 hover:text-white')}
            >
              Exclude
            </button>
          </div>

          {options.length > 8 && (
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full mb-2 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none"
            />
          )}

          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {filteredOptions.length === 0 && (
              <p className="text-xs text-gray-500 px-1 py-1">No matches</p>
            )}
            {filteredOptions.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-white/5 cursor-pointer text-xs text-gray-200">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="accent-blue-500"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>

          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full mt-2 flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-white py-1 border-t border-white/5 pt-2"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

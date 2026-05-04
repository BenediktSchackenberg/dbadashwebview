import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

const CUSTOM_VALUE = 'custom';

const presets = [
  { label: 'Last 1h', value: '1h' },
  { label: 'Last 4h', value: '4h' },
  { label: 'Last 12h', value: '12h' },
  { label: 'Last 24h', value: '24h' },
  { label: 'Last 7d', value: '7d' },
  { label: 'Custom', value: CUSTOM_VALUE },
];

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string {
  return new Date(value).toISOString();
}

function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : toLocalInputValue(date);
}

export function useTimeRange() {
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;
  const range = searchParams.get('range') || '24h';
  const hoursMap: Record<string, number> = { '1h': 1, '4h': 4, '12h': 12, '24h': 24, '7d': 168 };

  if (from && to) {
    return { range, hours: hoursMap[range] || 24, from, to };
  }

  return { range, hours: hoursMap[range] || 24, from: undefined, to: undefined };
}

export default function TimeRangePicker() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const paramFrom = searchParams.get('from');
  const paramTo = searchParams.get('to');
  const hasCustom = Boolean(paramFrom && paramTo);
  const current = hasCustom ? CUSTOM_VALUE : (searchParams.get('range') || '24h');

  const [fromInput, setFromInput] = useState(() => {
    if (paramFrom) return isoToLocalInput(paramFrom);
    const now = new Date();
    return toLocalInputValue(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  });
  const [toInput, setToInput] = useState(() => {
    if (paramTo) return isoToLocalInput(paramTo);
    return toLocalInputValue(new Date());
  });

  useEffect(() => {
    if (paramFrom) setFromInput(isoToLocalInput(paramFrom));
    if (paramTo) setToInput(isoToLocalInput(paramTo));
  }, [paramFrom, paramTo]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === CUSTOM_VALUE) {
      params.delete('range');
      if (fromInput && toInput) {
        params.set('from', localInputToIso(fromInput));
        params.set('to', localInputToIso(toInput));
      }
    } else {
      params.set('range', value);
      params.delete('from');
      params.delete('to');
      setOpen(false);
    }
    setSearchParams(params);
  };

  const applyCustom = () => {
    if (!fromInput || !toInput) return;
    const params = new URLSearchParams(searchParams);
    params.delete('range');
    params.set('from', localInputToIso(fromInput));
    params.set('to', localInputToIso(toInput));
    setSearchParams(params);
  };

  const currentLabel = presets.find(p => p.value === current)?.label || current;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-slate-800/50 transition-all"
      >
        <Clock className="w-3.5 h-3.5" />
        {currentLabel}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 glass-strong rounded-lg shadow-xl py-1 min-w-[280px] z-50">
          {presets.map(p => (
            <button
              key={p.value}
              onClick={() => select(p.value)}
              className={clsx(
                'w-full px-3 py-1.5 text-left text-xs transition-colors',
                p.value === current ? 'bg-blue-500/15 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-slate-800/50'
              )}
            >
              {p.label}
            </button>
          ))}

          {current === CUSTOM_VALUE && (
            <div className="px-3 pt-2 pb-1 border-t border-white/10 mt-1 space-y-2">
              <label className="block text-[11px] text-gray-400">
                From
                <input
                  type="datetime-local"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-gray-200"
                />
              </label>
              <label className="block text-[11px] text-gray-400">
                To
                <input
                  type="datetime-local"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  className="mt-1 w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-gray-200"
                />
              </label>
              <button
                type="button"
                onClick={applyCustom}
                disabled={!fromInput || !toInput}
                className="w-full rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed px-2 py-1.5 text-xs"
              >
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

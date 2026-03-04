import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';

const presets = [
  { label: 'Last 1h', value: '1h' },
  { label: 'Last 4h', value: '4h' },
  { label: 'Last 12h', value: '12h' },
  { label: 'Last 24h', value: '24h' },
  { label: 'Last 7d', value: '7d' },
];

export function useTimeRange() {
  const [searchParams] = useSearchParams();
  const range = searchParams.get('range') || '24h';
  const hoursMap: Record<string, number> = { '1h': 1, '4h': 4, '12h': 12, '24h': 24, '7d': 168 };
  return { range, hours: hoursMap[range] || 24 };
}

export default function TimeRangePicker() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = searchParams.get('range') || '24h';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('range', value);
    setSearchParams(params);
    setOpen(false);
  };

  const currentLabel = presets.find(p => p.value === current)?.label || current;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all"
      >
        <Clock className="w-3.5 h-3.5" />
        {currentLabel}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 glass-strong rounded-lg shadow-xl py-1 min-w-[140px] z-50">
          {presets.map(p => (
            <button
              key={p.value}
              onClick={() => select(p.value)}
              className={clsx(
                'w-full px-3 py-1.5 text-left text-xs transition-colors',
                p.value === current ? 'bg-blue-500/15 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

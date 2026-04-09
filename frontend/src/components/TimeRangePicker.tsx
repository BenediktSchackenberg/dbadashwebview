import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePresentationOptional } from '../context/PresentationContext';

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
  const { isDesktopData } = usePresentationOptional();
  const reduceMotion = useReducedMotion();

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

  const presetButtons = (motionItems: boolean) =>
    presets.map((p, i) => {
      const cls = clsx(
        'w-full px-3 py-1.5 text-left text-xs transition-colors duration-200',
        p.value === current ? 'bg-blue-500/15 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-slate-800/50',
      );
      if (motionItems) {
        return (
          <motion.button
            key={p.value}
            type="button"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.035, type: 'spring', stiffness: 400, damping: 30 }}
            onClick={() => select(p.value)}
            className={cls}
          >
            {p.label}
          </motion.button>
        );
      }
      return (
        <button key={p.value} type="button" onClick={() => select(p.value)} className={cls}>
          {p.label}
        </button>
      );
    });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-slate-800/50 transition-all duration-200 active:scale-[0.98]"
      >
        <Clock className="w-3.5 h-3.5" />
        {currentLabel}
        {!reduceMotion && !isDesktopData ? (
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
            className="inline-flex"
          >
            <ChevronDown className="w-3 h-3" />
          </motion.span>
        ) : (
          <ChevronDown
            className={clsx('w-3 h-3 transition-transform duration-200', open && 'rotate-180')}
          />
        )}
      </button>
      <AnimatePresence>
        {open && !isDesktopData && !reduceMotion && (
          <motion.div
            key="time-range-menu"
            className="absolute right-0 top-full mt-1 glass-strong rounded-lg shadow-xl py-1 min-w-[140px] z-50 origin-top-right overflow-hidden gpu-promote-layer"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 480, damping: 34 }}
          >
            {presetButtons(true)}
          </motion.div>
        )}
      </AnimatePresence>
      {open && (isDesktopData || reduceMotion) && (
        <div className="absolute right-0 top-full mt-1 glass-strong rounded-lg shadow-xl py-1 min-w-[140px] z-50">
          {presetButtons(false)}
        </div>
      )}
    </div>
  );
}

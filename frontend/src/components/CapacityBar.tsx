import { clsx } from 'clsx';

export default function CapacityBar({ used, total, showLabel = true }: { used: number; total: number; showLabel?: boolean }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const color = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-emerald-500';
  const glow = pct > 90 ? 'shadow-red-500/30' : pct > 75 ? 'shadow-yellow-500/30' : 'shadow-emerald-500/30';

  return (
    <div className="w-full">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-500 shadow-lg', color, glow)}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        {showLabel && (
          <span className={clsx('text-xs font-medium min-w-[3rem] text-right',
            pct > 90 ? 'text-red-400' : pct > 75 ? 'text-yellow-400' : 'text-gray-400'
          )}>
            {pct.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { usePresentationOptional } from '../context/PresentationContext';

const LIMIT_OPTIONS = [200, 500, 2000, 5000];

interface PaginationBarProps {
  offset: number;
  limit: number;
  rowCount: number;
  onOffsetChange: (next: number) => void;
  onLimitChange?: (next: number) => void;
  className?: string;
}

/** Offset-based pagination when the API does not return total row counts (Next enabled if page is full). */
export default function PaginationBar({
  offset,
  limit,
  rowCount,
  onOffsetChange,
  onLimitChange,
  className = '',
}: PaginationBarProps) {
  const { isDesktopData } = usePresentationOptional();
  const start = rowCount === 0 ? 0 : offset + 1;
  const end = offset + rowCount;
  const canPrev = offset > 0;
  const canNext = rowCount >= limit;

  return (
    <div
      className={clsx(
        'flex flex-wrap items-center justify-between gap-3 text-sm',
        isDesktopData ? 'dba-pagination text-gray-700' : 'text-gray-400',
        className,
      )}
    >
      <span>
        Rows <span className={isDesktopData ? 'text-black font-mono' : 'text-gray-200 font-mono'}>{start}</span>
        {'–'}
        <span className={isDesktopData ? 'text-black font-mono' : 'text-gray-200 font-mono'}>{end}</span>
        {rowCount >= limit ? ' (page full — there may be more)' : ''}
      </span>
      <div className="flex items-center gap-2">
        {onLimitChange && (
          <label className="flex items-center gap-2 text-xs">
            <span className={isDesktopData ? 'text-gray-600' : 'text-gray-500'}>Page size</span>
            <select
              value={limit}
              onChange={e => {
                onLimitChange(Number(e.target.value));
                onOffsetChange(0);
              }}
              className={clsx(
                'rounded-lg px-2 py-1 text-xs',
                isDesktopData
                  ? 'bg-white border border-[#7a7a7a] text-black'
                  : 'bg-slate-800 border border-slate-600 text-gray-200',
              )}
            >
              {LIMIT_OPTIONS.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
          className={clsx(
            'p-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-transform duration-200',
            !isDesktopData && 'active:scale-95',
            isDesktopData ? 'border border-[#adadad] hover:bg-gray-100' : 'border border-white/10 hover:bg-white/5',
          )}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => onOffsetChange(offset + limit)}
          className={clsx(
            'p-1.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-transform duration-200',
            !isDesktopData && 'active:scale-95',
            isDesktopData ? 'border border-[#adadad] hover:bg-gray-100' : 'border border-white/10 hover:bg-white/5',
          )}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

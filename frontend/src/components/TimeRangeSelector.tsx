import { clsx } from 'clsx';

interface TimeRangeSelectorProps {
  value: number;
  onChange: (hours: number) => void;
}

const options = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '14d', hours: 336 },
];

export default function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
      {options.map(o => (
        <button
          key={o.hours}
          onClick={() => onChange(o.hours)}
          className={clsx(
            'px-3 py-1 rounded text-xs font-medium transition-colors',
            value === o.hours
              ? 'bg-blue-600 text-white'
              : 'bg-white/5 text-gray-400 hover:text-white'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function hoursLabel(hours: number): string {
  if (hours >= 168) return `${Math.round(hours / 24)}d`;
  return `${hours}h`;
}

import { clsx } from 'clsx';

interface Tab {
  key: string;
  label: string;
  count?: number;
}

export default function TabNav({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (key: string) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-white/5 rounded-lg w-fit">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={clsx(
            'px-4 py-2 text-sm font-medium rounded-md transition-all',
            active === tab.key
              ? 'bg-blue-500/20 text-blue-400 shadow-sm'
              : 'text-gray-400 hover:text-gray-200 hover:bg-slate-800/50'
          )}
        >
          {tab.label}
          {tab.count != null && (
            <span className={clsx('ml-1.5 text-xs',
              active === tab.key ? 'text-blue-300' : 'text-gray-500'
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

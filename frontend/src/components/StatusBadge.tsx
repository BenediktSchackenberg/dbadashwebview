import { clsx } from 'clsx';
import { Shield, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';

const statusConfig: Record<number, { label: string; color: string; bg: string; icon: any }> = {
  1: { label: 'OK', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20', icon: ShieldCheck },
  2: { label: 'Warning', color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20', icon: ShieldAlert },
  3: { label: 'N/A', color: 'text-gray-400', bg: 'bg-gray-400/10 border-gray-400/20', icon: ShieldQuestion },
  4: { label: 'Critical', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', icon: Shield },
};

export default function StatusBadge({ status, label, size = 'sm' }: { status: number; label?: string; size?: 'xs' | 'sm' | 'md' }) {
  const cfg = statusConfig[status] || statusConfig[3];
  const Icon = cfg.icon;
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full border font-medium', cfg.bg, cfg.color,
      size === 'xs' && 'px-1.5 py-0.5 text-[10px]',
      size === 'sm' && 'px-2 py-0.5 text-xs',
      size === 'md' && 'px-3 py-1 text-sm',
    )}>
      <Icon className={clsx(size === 'xs' ? 'w-3 h-3' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
      {label || cfg.label}
    </span>
  );
}

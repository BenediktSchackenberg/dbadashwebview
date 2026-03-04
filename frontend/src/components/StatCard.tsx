import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect } from 'react';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number;
  icon: LucideIcon;
  color?: string;
  subtitle?: string;
}

function AnimatedNumber({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => { animate(mv, value, { duration: 1.2, ease: 'easeOut' }); }, [value]);
  return <motion.span>{display}</motion.span>;
}

export default function StatCard({ title, value, icon: Icon, color = 'text-blue-400', subtitle }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-5 gradient-border"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-1">{title}</p>
          <p className={clsx('text-3xl font-bold', color)}>
            <AnimatedNumber value={value} />
          </p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={clsx('p-2.5 rounded-lg bg-white/5', color)}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </motion.div>
  );
}

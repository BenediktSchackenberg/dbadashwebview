import { clsx } from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { usePresentationOptional } from '../context/PresentationContext';

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 380, damping: 28 },
  },
};

/** Lightweight placeholder while lazy route chunks load. */
export default function RouteSkeleton() {
  const { isDesktopData } = usePresentationOptional();
  const reduceMotion = useReducedMotion();
  const bar = (className?: string) =>
    clsx(
      'rounded-md',
      isDesktopData ? 'bg-[#d8d8d8]' : 'bg-white/[0.08]',
      className,
    );
  const card = clsx(
    'rounded-lg border p-4',
    isDesktopData ? 'border-[#c8c8c8] bg-white' : 'border-white/10 bg-white/[0.03]',
  );

  if (isDesktopData || reduceMotion) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 animate-pulse" aria-busy="true" aria-label="Loading page">
        <div className={bar('h-8 w-48')} />
        <div className={bar('h-4 w-full max-w-2xl')} />
        <div className={card}>
          <div className="space-y-3">
            <div className={bar('h-4 w-full')} />
            <div className={bar('h-4 w-5/6')} />
            <div className={bar('h-4 w-4/5')} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className={clsx(card, 'h-36')} />
          <div className={clsx(card, 'h-36')} />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="mx-auto max-w-6xl space-y-6"
      aria-busy="true"
      aria-label="Loading page"
      initial="hidden"
      animate="show"
      variants={container}
    >
      <motion.div variants={item} className={clsx(bar('h-8 w-48'), 'animate-pulse')} />
      <motion.div variants={item} className={clsx(bar('h-4 w-full max-w-2xl'), 'animate-pulse')} />
      <motion.div variants={item} className={card}>
        <div className="space-y-3">
          <div className={clsx(bar('h-4 w-full'), 'animate-pulse')} />
          <div className={clsx(bar('h-4 w-5/6'), 'animate-pulse')} />
          <div className={clsx(bar('h-4 w-4/5'), 'animate-pulse')} />
        </div>
      </motion.div>
      <motion.div variants={item} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className={clsx(card, 'h-36 animate-pulse')} />
        <div className={clsx(card, 'h-36 animate-pulse')} />
      </motion.div>
    </motion.div>
  );
}

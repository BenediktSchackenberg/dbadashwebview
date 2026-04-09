import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { clsx } from 'clsx';

export type ToastTone = 'success' | 'error' | 'info';

type ToastItem = { id: number; message: string; tone: ToastTone };

type ShowToast = (message: string, tone?: ToastTone, durationMs?: number) => void;

const ToastContext = createContext<ShowToast | null>(null);

const DEFAULT_MS = 3800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const reduceMotion = useReducedMotion();

  const showToast: ShowToast = useCallback((message, tone = 'info', durationMs = DEFAULT_MS) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div
        className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-2 pointer-events-none max-w-[min(100vw-2rem,380px)]"
        aria-live="polite"
        aria-relevant="additions"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map(t => (
            <motion.div
              key={t.id}
              layout
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={
                reduceMotion
                  ? { duration: 0.12 }
                  : { type: 'spring' as const, stiffness: 420, damping: 32 }
              }
              className={clsx(
                'pointer-events-auto px-4 py-3 rounded-xl text-sm shadow-lg border backdrop-blur-md',
                t.tone === 'success' &&
                  'bg-emerald-950/90 text-emerald-100 border-emerald-500/25',
                t.tone === 'error' && 'bg-red-950/90 text-red-100 border-red-500/25',
                t.tone === 'info' && 'bg-slate-900/90 text-slate-100 border-white/12',
              )}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return () => {};
  }
  return ctx;
}

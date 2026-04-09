import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { clsx } from 'clsx';

const isTypingTarget = (el: EventTarget | null) => {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
};

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function registerShortcutsPaletteListener(onOpen: () => void) {
  const handler = (e: KeyboardEvent) => {
    if (e.key !== '?') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target)) return;
    e.preventDefault();
    onOpen();
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}

export default function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [open, onClose]);

  const rows: { keys: string; desc: string }[] = [
    { keys: '⌘ K / Ctrl+K', desc: 'Open search (instances, databases, jobs)' },
    { keys: '?', desc: 'Show this panel (when not typing in a field)' },
    { keys: 'Esc', desc: 'Close search or this panel' },
    { keys: '↑ ↓', desc: 'Move selection in search results' },
    { keys: 'Enter', desc: 'Open highlighted search result' },
    { keys: 'Toolbar', desc: 'Link icon — copy URL to this page (with filters in the query string)' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.2 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
          <motion.div
            className={clsx(
              'relative w-full max-w-md glass-strong rounded-2xl shadow-2xl overflow-hidden border border-white/10',
              'gpu-promote-layer',
            )}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={
              reduceMotion
                ? { duration: 0.12 }
                : { type: 'spring' as const, stiffness: 420, damping: 34 }
            }
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2 text-white">
                <Keyboard className="w-5 h-5 text-blue-400 shrink-0" />
                <h2 id="shortcuts-title" className="text-sm font-semibold">
                  Keyboard shortcuts
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="p-3 space-y-1 max-h-[min(70vh,420px)] overflow-y-auto">
              {rows.map(row => (
                <li
                  key={row.desc}
                  className="flex items-start justify-between gap-4 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-sm text-gray-300 leading-snug">{row.desc}</span>
                  <kbd className="shrink-0 text-[11px] px-2 py-1 rounded-md bg-white/10 text-gray-200 font-mono whitespace-nowrap border border-white/10">
                    {row.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

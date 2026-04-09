import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { usePresentationOptional } from '../context/PresentationContext';

const springEnter = { type: 'spring' as const, stiffness: 440, damping: 32, mass: 0.88 };
const springExit = { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.7 };
const springEnterWeb = { type: 'spring' as const, stiffness: 400, damping: 30, mass: 0.82 };
const springExitWeb = { type: 'spring' as const, stiffness: 540, damping: 36, mass: 0.68 };

/**
 * Route transitions: web shell uses a slight scale + slide; desktop shell keeps a minimal slide only.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const { isDesktopData } = usePresentationOptional();
  const transitionKey = `${location.pathname}${location.search}`;
  const webFx = !isDesktopData && !reduceMotion;

  if (reduceMotion) {
    return <div className="page-transition-root flex min-h-0 flex-col">{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={transitionKey}
        className="page-transition-root flex min-h-0 flex-col gpu-promote-layer"
        initial={webFx ? { opacity: 0, y: 18, scale: 0.972 } : { opacity: 0, y: 10 }}
        animate={
          webFx
            ? { opacity: 1, y: 0, scale: 1, transition: springEnterWeb }
            : { opacity: 1, y: 0, transition: springEnter }
        }
        exit={
          webFx
            ? { opacity: 0, y: -10, scale: 0.985, transition: springExitWeb }
            : { opacity: 0, y: -6, transition: springExit }
        }
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

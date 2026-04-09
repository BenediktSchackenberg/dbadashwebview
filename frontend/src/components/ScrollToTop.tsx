import { useLayoutEffect, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';

/** Scrolls the main content region to the top when the route path changes. */
export default function ScrollToTop({ scrollElRef }: { scrollElRef: RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation();
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const el = scrollElRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [pathname, scrollElRef, reduceMotion]);

  return null;
}

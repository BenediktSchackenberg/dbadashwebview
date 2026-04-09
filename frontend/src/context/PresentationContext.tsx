import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type PresentationMode = 'web' | 'desktop';

const STORAGE_KEY = 'dbadash-presentation';

type PresentationValue = {
  mode: PresentationMode;
  setMode: (m: PresentationMode) => void;
  isDesktopData: boolean;
  /** Apply to `<table>` for WinForms-style grid */
  dataGridTableClass: string;
  /** Wrapper around scrollable grid (removes glass in desktop) */
  dataGridShellClass: string;
};

const PresentationContext = createContext<PresentationValue | null>(null);

export function PresentationProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PresentationMode>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY) as PresentationMode | null;
      return s === 'desktop' ? 'desktop' : 'web';
    } catch {
      return 'web';
    }
  });

  const setMode = (m: PresentationMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    document.documentElement.dataset.presentation = mode;
  }, [mode]);

  const value = useMemo<PresentationValue>(
    () => ({
      mode,
      setMode,
      isDesktopData: mode === 'desktop',
      dataGridTableClass: mode === 'desktop' ? 'dba-datagrid w-full' : 'w-full text-sm',
      dataGridShellClass:
        mode === 'desktop'
          ? 'dba-datagrid-shell overflow-x-auto rounded-sm border border-[#ababab] bg-white shadow-sm'
          : 'overflow-x-auto rounded-xl glass',
    }),
    [mode],
  );

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>;
}

export function usePresentation(): PresentationValue {
  const ctx = useContext(PresentationContext);
  if (!ctx) {
    throw new Error('usePresentation must be used within PresentationProvider');
  }
  return ctx;
}

/** Safe default when provider is absent (e.g. tests). */
export function usePresentationOptional(): PresentationValue {
  const ctx = useContext(PresentationContext);
  return (
    ctx ?? {
      mode: 'web',
      setMode: () => {},
      isDesktopData: false,
      dataGridTableClass: 'w-full text-sm',
      dataGridShellClass: 'overflow-x-auto rounded-xl glass',
    }
  );
}

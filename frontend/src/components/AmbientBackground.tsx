import { clsx } from 'clsx';

/**
 * Full-bleed mesh behind the app in “web” presentation. Pure CSS animation (GPU-friendly).
 * Hidden in Windows/desktop presentation and when user prefers reduced motion.
 */
export default function AmbientBackground({ lightShell }: { lightShell: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      {/* Base wash */}
      <div
        className={clsx(
          'absolute inset-0 transition-colors duration-700',
          lightShell
            ? 'bg-gradient-to-br from-slate-100 via-indigo-50/80 to-violet-100/90'
            : 'bg-[#060a12]',
        )}
      />
      {/* Orb 1 */}
      <div
        className={clsx(
          'ambient-orb ambient-orb-1 absolute -left-[20%] -top-[30%] h-[70vmin] w-[70vmin] rounded-full opacity-50 blur-[100px]',
          lightShell ? 'bg-cyan-300/40' : 'bg-cyan-500/25',
        )}
      />
      {/* Orb 2 */}
      <div
        className={clsx(
          'ambient-orb ambient-orb-2 absolute -right-[25%] top-[10%] h-[65vmin] w-[65vmin] rounded-full opacity-45 blur-[110px]',
          lightShell ? 'bg-violet-400/35' : 'bg-fuchsia-600/20',
        )}
      />
      {/* Orb 3 */}
      <div
        className={clsx(
          'ambient-orb ambient-orb-3 absolute bottom-[-20%] left-[20%] h-[55vmin] w-[55vmin] rounded-full opacity-40 blur-[90px]',
          lightShell ? 'bg-indigo-400/30' : 'bg-blue-600/22',
        )}
      />
      {/* Subtle grid (dark web only) */}
      {!lightShell && (
        <div
          className="absolute inset-0 opacity-[0.12] mix-blend-soft-light"
          style={{
            backgroundImage: `
              linear-gradient(rgba(148, 163, 184, 0.15) 1px, transparent 1px),
              linear-gradient(90deg, rgba(148, 163, 184, 0.12) 1px, transparent 1px)
            `,
            backgroundSize: '48px 48px',
          }}
        />
      )}
    </div>
  );
}

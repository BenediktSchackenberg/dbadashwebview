import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutList, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';
import { WINFORMS_AREAS, WINFORMS_SCREEN_MAP, type WinFormsScreenRow } from '../data/winformsScreenMap';
import { usePresentationOptional } from '../context/PresentationContext';

function ParityLink({ procedure }: { procedure: string }) {
  const q = `/windows-parity?procedure=${encodeURIComponent(procedure)}`;
  return (
    <Link to={q} className="text-blue-400 hover:underline font-mono text-xs inline-flex items-center gap-1">
      {procedure}
      <ExternalLink className="w-3 h-3 opacity-70" />
    </Link>
  );
}

export default function WinFormsScreensPage() {
  const { dataGridShellClass, isDesktopData } = usePresentationOptional();
  const [area, setArea] = useState<string>('__all__');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return WINFORMS_SCREEN_MAP.filter((r) => {
      if (area !== '__all__' && r.area !== area) return false;
      if (!q) return true;
      return (
        r.tab.toLowerCase().includes(q) ||
        r.label.toLowerCase().includes(q) ||
        (r.webPath?.toLowerCase().includes(q) ?? false) ||
        (r.parityProcedure?.toLowerCase().includes(q) ?? false) ||
        (r.notes?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [area, search]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start gap-3">
        <div className={clsx('p-2 rounded-lg', isDesktopData ? 'bg-[#e8f4fc]' : 'bg-violet-500/10')}>
          <LayoutList className={clsx('w-6 h-6', isDesktopData ? 'text-[#0078d4]' : 'text-violet-400')} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">WinForms screen map</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl">
            Every major <span className="text-gray-300">DBADashGUI</span> tab and several admin surfaces mapped to this web app. Dedicated
            pages mirror a subset of charts, grids, and workflows; where the UI is not rebuilt yet, use{' '}
            <Link to="/windows-parity" className="text-blue-400 hover:underline">
              Windows parity
            </Link>{' '}
            to run the same <code className="text-gray-400 font-mono text-xs">dbo.*</code> procedures (allow-listed on the API).
          </p>
        </div>
      </div>

      <div className={clsx('rounded-lg border p-4 flex flex-wrap gap-4', dataGridShellClass)}>
        <div>
          <label className="text-xs text-gray-500 uppercase block mb-1">Area</label>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white min-w-[200px]"
          >
            <option value="__all__">All areas</option>
            {WINFORMS_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-gray-500 uppercase block mb-1">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tab, label, route, procedure…"
            className="w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      <div className={clsx('rounded-lg border overflow-x-auto', dataGridShellClass)}>
        <table className="w-full text-sm">
          <thead>
            <tr className={clsx('text-left text-xs uppercase tracking-wide border-b', isDesktopData ? 'text-gray-600 border-[#ccc]' : 'text-gray-500 border-white/10')}>
              <th className="p-3 font-semibold">Tab / area</th>
              <th className="p-3 font-semibold">WinForms label</th>
              <th className="p-3 font-semibold">Web UI</th>
              <th className="p-3 font-semibold">Parity SP</th>
              <th className="p-3 font-semibold">Notes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r: WinFormsScreenRow) => (
              <tr key={r.tab + r.label} className={clsx('border-b', isDesktopData ? 'border-[#e0e0e0]' : 'border-white/5')}>
                <td className="p-3 align-top">
                  <div className="font-mono text-xs text-violet-300">{r.tab}</div>
                  <div className="text-xs text-gray-500">{r.area}</div>
                </td>
                <td className="p-3 align-top text-gray-200">{r.label}</td>
                <td className="p-3 align-top">
                  {r.webPath ? (
                    <Link to={r.webPath} className="text-blue-400 hover:underline text-xs">
                      {r.webLabel || r.webPath}
                    </Link>
                  ) : (
                    <span className="text-gray-600 text-xs">—</span>
                  )}
                </td>
                <td className="p-3 align-top">{r.parityProcedure ? <ParityLink procedure={r.parityProcedure} /> : <span className="text-gray-600 text-xs">—</span>}</td>
                <td className="p-3 align-top text-xs text-gray-500 max-w-md">{r.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="p-6 text-center text-gray-500 text-sm">No rows match.</p>}
      </div>
    </motion.div>
  );
}

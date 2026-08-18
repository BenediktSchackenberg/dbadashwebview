import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/api';
import type { DriveGrowthPoint, EstateDriveRow, InstanceDriveRow } from '../api/types';
import { computeDriveGrowth } from '../utils/driveGrowth';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CapacityBar from '../components/CapacityBar';
import MultiSelectFilter, { type FilterMode } from '../components/MultiSelectFilter';
import { HardDrive, ArrowUpDown, RefreshCw, Filter, Scale, X, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';

type DriveRow = (EstateDriveRow | InstanceDriveRow) & { InstanceDisplayName?: string | null };

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes > 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function getUsedPercent(drive: DriveRow): number {
  if (!drive.Capacity || drive.Capacity <= 0) return 0;
  return ((drive.Capacity - (drive.FreeSpace || 0)) / drive.Capacity) * 100;
}

function driveKey(drive: DriveRow, index: number): string {
  return drive.DriveID != null ? `id:${drive.DriveID}` : `pos:${drive.InstanceDisplayName || ''}:${drive.Name || ''}:${index}`;
}

export default function DrivesPage() {
  const { id } = useParams();
  const [drives, setDrives] = useState<DriveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState('');

  const [driveMode, setDriveMode] = useState<FilterMode>('include');
  const [selectedDrives, setSelectedDrives] = useState<string[]>([]);
  const [instanceMode, setInstanceMode] = useState<FilterMode>('include');
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);

  const [compareMode, setCompareMode] = useState(false);
  const [compareKeys, setCompareKeys] = useState<Set<string>>(new Set());
  const [growthByDriveId, setGrowthByDriveId] = useState<Map<number, DriveGrowthPoint>>(new Map());
  const [growthLoading, setGrowthLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = id
          ? await api.instanceDrives(Number(id)).catch(() => [])
          : await api.drives().catch(() => []);
        setDrives(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Unique drive names and instances for filter dropdowns
  const driveNames = useMemo(() => {
    const names = new Set(drives.map(d => d.Name).filter(Boolean) as string[]);
    return [...names].sort();
  }, [drives]);

  const instanceNames = useMemo(() => {
    if (id) return []; // already instance-filtered
    const names = new Set(drives.map(d => d.InstanceDisplayName).filter(Boolean) as string[]);
    return [...names].sort();
  }, [drives, id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drives.filter(d => {
      if (q) {
        const matches = (d.Name || '').toLowerCase().includes(q) || (d.InstanceDisplayName || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (selectedDrives.length > 0) {
        const isSelected = selectedDrives.includes(d.Name || '');
        if (driveMode === 'include' && !isSelected) return false;
        if (driveMode === 'exclude' && isSelected) return false;
      }

      if (!id && selectedInstances.length > 0) {
        const isSelected = selectedInstances.includes(d.InstanceDisplayName || '');
        if (instanceMode === 'include' && !isSelected) return false;
        if (instanceMode === 'exclude' && isSelected) return false;
      }

      return true;
    });
  }, [drives, search, selectedDrives, driveMode, selectedInstances, instanceMode, id]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) =>
      sortDesc ? getUsedPercent(b) - getUsedPercent(a) : getUsedPercent(a) - getUsedPercent(b)
    ), [filtered, sortDesc]);

  const compareDrives = useMemo(
    () => drives.filter((d, i) => compareKeys.has(driveKey(d, i))),
    [drives, compareKeys]
  );

  const compareDriveIds = useMemo(
    () => [...new Set(compareDrives.map(d => d.DriveID).filter((v): v is number => v != null))].sort(),
    [compareDrives]
  );

  useEffect(() => {
    if (compareDriveIds.length === 0) {
      setGrowthByDriveId(new Map());
      return;
    }

    let cancelled = false;
    setGrowthLoading(true);
    api.drivesGrowth(compareDriveIds, 30)
      .then(res => {
        if (cancelled) return;
        const map = new Map<number, DriveGrowthPoint>();
        for (const point of res.data || []) map.set(point.driveID, point);
        setGrowthByDriveId(map);
      })
      .catch(() => { if (!cancelled) setGrowthByDriveId(new Map()); })
      .finally(() => { if (!cancelled) setGrowthLoading(false); });

    return () => { cancelled = true; };
  }, [compareDriveIds]);

  const toggleCompare = (key: string) => {
    setCompareKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const hasActiveFilters = selectedDrives.length > 0 || selectedInstances.length > 0 || search.trim().length > 0;

  if (loading) return <LoadingSpinner />;

  const criticalCount = sorted.filter(d => getUsedPercent(d) >= 85).length;
  const warnCount = sorted.filter(d => getUsedPercent(d) >= 70 && getUsedPercent(d) < 85).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{id ? 'Instance Drives' : 'Drives'}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {sorted.length} drives{id ? '' : ' across all instances'}
            {criticalCount > 0 && <span className="ml-2 text-red-400">· {criticalCount} critical (&gt;85%)</span>}
            {warnCount > 0 && <span className="ml-2 text-yellow-400">· {warnCount} warning (&gt;70%)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search drive or instance..."
              className="bg-slate-800 border border-slate-600 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 w-56 focus:outline-none"
            />
          </div>
          {/* Instance filter (estate view only) */}
          {!id && instanceNames.length > 0 && (
            <MultiSelectFilter
              label="Instances"
              options={instanceNames}
              selected={selectedInstances}
              onChange={setSelectedInstances}
              mode={instanceMode}
              onModeChange={setInstanceMode}
            />
          )}
          {/* Drive name filter */}
          {driveNames.length > 1 && (
            <MultiSelectFilter
              label="Drives"
              options={driveNames}
              selected={selectedDrives}
              onChange={setSelectedDrives}
              mode={driveMode}
              onModeChange={setDriveMode}
            />
          )}
          <button
            onClick={() => setSortDesc(!sortDesc)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-slate-800/50 transition-all"
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortDesc ? 'Most used first' : 'Least used first'}
          </button>
          <button
            onClick={() => {
              setCompareMode(m => !m);
              if (compareMode) setCompareKeys(new Set());
            }}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors',
              compareMode ? 'bg-purple-500/10 border-purple-500/30 text-purple-300' : 'bg-slate-800 border-slate-600 text-gray-300 hover:text-white'
            )}
          >
            <Scale className="w-4 h-4" />
            {compareMode ? 'Exit Compare' : 'Compare'}
          </button>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Auto-refresh 30s
          </span>
        </div>
      </div>

      {/* Active filters badge */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
          <Filter className="w-3 h-3" />
          <span>Filtering by:</span>
          {search.trim() && (
            <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-gray-300">
              "{search.trim()}"
              <button onClick={() => setSearch('')} className="ml-1 hover:text-white">×</button>
            </span>
          )}
          {selectedInstances.map(name => (
            <span key={name} className={clsx('px-2 py-0.5 rounded-full', instanceMode === 'exclude' ? 'bg-red-400/10 text-red-400' : 'bg-blue-400/10 text-blue-400')}>
              {instanceMode === 'exclude' ? 'not ' : ''}{name}
              <button onClick={() => setSelectedInstances(prev => prev.filter(n => n !== name))} className="ml-1 hover:text-white">×</button>
            </span>
          ))}
          {selectedDrives.map(name => (
            <span key={name} className={clsx('px-2 py-0.5 rounded-full', driveMode === 'exclude' ? 'bg-red-400/10 text-red-400' : 'bg-purple-400/10 text-purple-400')}>
              {driveMode === 'exclude' ? 'not ' : ''}{name}
              <button onClick={() => setSelectedDrives(prev => prev.filter(n => n !== name))} className="ml-1 hover:text-white">×</button>
            </span>
          ))}
        </div>
      )}

      {compareMode && compareDrives.length > 0 && (
        <div className="glass rounded-xl p-4 border border-purple-500/20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Scale className="w-4 h-4 text-purple-400" /> Comparing {compareDrives.length} drives
            </h2>
            <button onClick={() => setCompareKeys(new Set())} className="text-xs text-gray-400 hover:text-white flex items-center gap-1">
              <X className="w-3 h-3" /> Clear selection
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs text-gray-400 uppercase tracking-wider">
                  <th className="pb-2 pr-4">Drive</th>
                  {!id && <th className="pb-2 pr-4">Instance</th>}
                  <th className="pb-2 pr-4 w-40">Usage</th>
                  <th className="pb-2 pr-4 text-right">Capacity</th>
                  <th className="pb-2 pr-4 text-right">Used</th>
                  <th className="pb-2 pr-4 text-right">Free</th>
                  <th className="pb-2 pr-4 text-right">Used %</th>
                  <th className="pb-2 text-right">Growth (30d)</th>
                </tr>
              </thead>
              <tbody>
                {compareDrives.map((d, i) => {
                  const pct = getUsedPercent(d);
                  const used = (d.Capacity || 0) - (d.FreeSpace || 0);
                  const growth = computeDriveGrowth(d.DriveID != null ? growthByDriveId.get(d.DriveID) : undefined);
                  return (
                    <tr key={driveKey(d, i)} className="border-b border-white/5">
                      <td className="py-2 pr-4 text-white font-mono text-xs">{d.Name || d.Label || '—'}</td>
                      {!id && <td className="py-2 pr-4 text-gray-300">{d.InstanceDisplayName || '—'}</td>}
                      <td className="py-2 pr-4"><CapacityBar used={used} total={d.Capacity || 0} /></td>
                      <td className="py-2 pr-4 text-right text-gray-400 text-xs">{formatBytes(d.Capacity)}</td>
                      <td className="py-2 pr-4 text-right text-gray-400 text-xs">{formatBytes(used)}</td>
                      <td className="py-2 pr-4 text-right text-gray-400 text-xs">{formatBytes(d.FreeSpace)}</td>
                      <td className={clsx('py-2 pr-4 text-right text-xs font-semibold', pct >= 85 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-green-400')}>
                        {pct.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right text-xs">
                        {growthLoading ? (
                          <span className="text-gray-500">…</span>
                        ) : growth.bytesPerDay == null ? (
                          <span className="text-gray-500">not enough history</span>
                        ) : growth.bytesPerDay <= 0 ? (
                          <span className="flex items-center justify-end gap-1 text-green-400">
                            <TrendingDown className="w-3 h-3" /> freeing up
                          </span>
                        ) : (
                          <span className={clsx('flex items-center justify-end gap-1', growth.daysUntilFull != null && growth.daysUntilFull < 30 ? 'text-red-400' : 'text-gray-300')}>
                            <TrendingUp className="w-3 h-3" />
                            {formatBytes(growth.bytesPerDay)}/day
                            {growth.daysUntilFull != null && ` · full in ${Math.round(growth.daysUntilFull)}d`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {compareDriveIds.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                Growth is measured from real drive-space history (dbo.DriveSnapshot) over the last 30 days, not an estimate.
              </p>
            )}
          </div>
        </div>
      )}
      {compareMode && compareDrives.length === 0 && (
        <div className="glass rounded-xl p-4 border border-purple-500/20 text-sm text-gray-400">
          Select drives below to compare them side by side.
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState message="No drive data available" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((drive, i) => {
            const pct = getUsedPercent(drive);
            const usedBytes = (drive.Capacity || 0) - (drive.FreeSpace || 0);
            const borderColor = pct >= 85 ? 'border-red-500/30' : pct >= 70 ? 'border-yellow-500/30' : 'border-white/5';
            const iconColor = pct >= 85 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-blue-400';
            const key = driveKey(drive, i);
            const isCompared = compareKeys.has(key);
            return (
              <motion.div
                key={drive.DriveID || i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={clsx('glass rounded-xl p-5 border relative', isCompared ? 'border-purple-500/50 ring-1 ring-purple-500/30' : borderColor)}
              >
                {compareMode && (
                  <label className="absolute top-3 right-3 flex items-center">
                    <input
                      type="checkbox"
                      checked={isCompared}
                      onChange={() => toggleCompare(key)}
                      className="accent-purple-500 w-4 h-4 cursor-pointer"
                    />
                  </label>
                )}

                {/* Drive header */}
                <div className="flex items-start gap-3 mb-4">
                  <HardDrive className={clsx('w-5 h-5 mt-0.5 shrink-0', iconColor)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white truncate">{drive.Name || '—'}</p>
                      {!compareMode && (
                        <span className={clsx('text-xs font-bold shrink-0',
                          pct >= 85 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-green-400'
                        )}>{pct.toFixed(1)}%</span>
                      )}
                    </div>
                    {drive.Label && (
                      <p className="text-xs text-gray-500 truncate">{drive.Label}</p>
                    )}
                    {!id && drive.InstanceDisplayName && (
                      <p className="text-xs text-gray-500 truncate">{drive.InstanceDisplayName}</p>
                    )}
                  </div>
                </div>

                {/* Capacity bar */}
                <CapacityBar used={usedBytes} total={drive.Capacity || 0} />

                {/* Details grid */}
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div className="text-center">
                    <p className="text-gray-500">Used</p>
                    <p className="text-white font-medium">{formatBytes(usedBytes)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">Free</p>
                    <p className={clsx('font-medium', pct >= 85 ? 'text-red-400' : pct >= 70 ? 'text-yellow-400' : 'text-gray-300')}>
                      {formatBytes(drive.FreeSpace)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-500">Total</p>
                    <p className="text-gray-300 font-medium">{formatBytes(drive.Capacity)}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import CapacityBar from '../components/CapacityBar';
import { HardDrive } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DrivesPage() {
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const inst = await api.instances().catch(() => []);
        const arr = Array.isArray(inst) ? inst : [];
        // Load drives for all instances
        const withDrives = await Promise.all(
          arr.map(async (i: any) => {
            const drives = await api.instanceDrives(i.InstanceID).catch(() => []);
            return { ...i, drives: Array.isArray(drives) ? drives : [] };
          })
        );
        setInstances(withDrives.filter(i => i.drives.length > 0));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingSpinner />;

  const allDrives = instances.flatMap(i =>
    i.drives.map((d: any) => ({ ...d, instanceName: i.InstanceDisplayName || i.Instance }))
  ).sort((a: any, b: any) => {
    const pctA = a.Capacity > 0 ? ((a.Capacity - a.FreeSpace) / a.Capacity) : 0;
    const pctB = b.Capacity > 0 ? ((b.Capacity - b.FreeSpace) / b.Capacity) : 0;
    return pctB - pctA;
  });

  const formatBytes = (b: number) => {
    if (!b) return '—';
    if (b > 1e12) return `${(b / 1e12).toFixed(1)} TB`;
    if (b > 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    return `${(b / 1e6).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">Drives</h1>
      <p className="text-sm text-gray-400">Sorted by usage (highest first)</p>
      {allDrives.length === 0 ? (
        <EmptyState message="No drive data available" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allDrives.map((d: any, i: number) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="glass rounded-xl p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <HardDrive className="w-5 h-5 text-blue-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{d.Name}</p>
                  <p className="text-xs text-gray-500">{d.instanceName}</p>
                </div>
              </div>
              <CapacityBar used={(d.Capacity || 0) - (d.FreeSpace || 0)} total={d.Capacity || 0} />
              <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{formatBytes(d.FreeSpace)} free</span>
                <span>{formatBytes(d.Capacity)} total</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

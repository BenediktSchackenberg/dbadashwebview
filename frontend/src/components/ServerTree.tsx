import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Server, Database, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { api } from '../api/api';

const VERSION_MAP: Record<number, string> = {
  17: 'SQL Server 2025',
  16: 'SQL Server 2022',
  15: 'SQL Server 2019',
  14: 'SQL Server 2017',
  13: 'SQL Server 2016',
  12: 'SQL Server 2014',
  11: 'SQL Server 2012',
};

interface Instance {
  instanceID: number;
  instanceDisplayName?: string;
  instance?: string;
  productVersion?: string;
  productMajorVersion?: number;
  edition?: string;
}

interface ServerTreeProps {
  selectedInstanceId: number | null;
  onSelectInstance: (id: number | null) => void;
  performanceData?: any[];
}

export default function ServerTree({ selectedInstanceId, onSelectInstance, performanceData }: ServerTreeProps) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.instances().then((data: any) => {
      const list = Array.isArray(data) ? data : [];
      setInstances(list);
    }).catch(() => {});
  }, []);

  // Group by major version
  const groups: Record<string, Instance[]> = {};
  for (const inst of instances) {
    const major = inst.productMajorVersion ?? 0;
    const label = VERSION_MAP[major] || `SQL Server (v${major || '?'})`;
    if (!groups[label]) groups[label] = [];
    groups[label].push(inst);
  }

  const sortedGroups = Object.entries(groups).sort((a, b) => {
    const va = instances.find(i => groups[a[0]]?.includes(i))?.productMajorVersion ?? 0;
    const vb = instances.find(i => groups[b[0]]?.includes(i))?.productMajorVersion ?? 0;
    return vb - va;
  });

  const toggleGroup = (label: string) => {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const selectedInstance = instances.find(i => i.instanceID === selectedInstanceId);
  const selectedPerf = performanceData?.find(p => p.instanceID === selectedInstanceId);

  return (
    <div className="space-y-4">
      {/* Tree Panel */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="p-3 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">SQL Servers</h2>
            <span className="text-xs text-gray-400">{instances.length}</span>
          </div>
        </div>
        <div className="overflow-y-auto max-h-[60vh] p-2">
          {sortedGroups.map(([label, insts]) => (
            <div key={label} className="mb-1">
              <button
                onClick={() => toggleGroup(label)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded hover:bg-white/5 transition-colors text-left"
              >
                {collapsed[label] ? (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                )}
                <Database className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-300 truncate">{label}</span>
                <span className="ml-auto text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full">{insts.length}</span>
              </button>
              {!collapsed[label] && (
                <div className="ml-5 mt-0.5 space-y-0.5">
                  {insts.sort((a, b) => (a.instanceDisplayName || a.instance || '').localeCompare(b.instanceDisplayName || b.instance || '')).map(inst => {
                    const isSelected = inst.instanceID === selectedInstanceId;
                    return (
                      <button
                        key={inst.instanceID}
                        onClick={() => onSelectInstance(isSelected ? null : inst.instanceID)}
                        className={`flex items-center gap-1.5 w-full px-2 py-1 rounded text-left transition-colors ${
                          isSelected
                            ? 'bg-blue-500/20 border-l-2 border-blue-400'
                            : 'hover:bg-white/5 border-l-2 border-transparent'
                        }`}
                      >
                        <Server className="w-3 h-3 text-gray-500 flex-shrink-0" />
                        <span className={`text-xs truncate ${isSelected ? 'text-blue-300' : 'text-gray-400'}`}>
                          {inst.instanceDisplayName || inst.instance || 'Unknown'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          {instances.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">No instances found</p>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedInstance && (
        <div className="glass rounded-xl p-3 space-y-2">
          <h3 className="text-sm font-bold text-white truncate">
            {selectedInstance.instanceDisplayName || selectedInstance.instance}
          </h3>
          <div className="space-y-1 text-xs">
            {selectedInstance.productVersion && (
              <div className="flex justify-between">
                <span className="text-gray-400">Version</span>
                <span className="text-gray-200 font-mono">{selectedInstance.productVersion}</span>
              </div>
            )}
            {selectedInstance.edition && (
              <div className="flex justify-between">
                <span className="text-gray-400">Edition</span>
                <span className="text-gray-200 truncate ml-2">{selectedInstance.edition}</span>
              </div>
            )}
            {selectedPerf && (
              <>
                <div className="border-t border-white/10 my-1.5" />
                <div className="flex justify-between">
                  <span className="text-gray-400">Avg CPU</span>
                  <span className="text-gray-200 font-mono">{selectedPerf.avgCPU}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Read Latency</span>
                  <span className="text-gray-200 font-mono">{selectedPerf.readLatency} ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">IOPs</span>
                  <span className="text-gray-200 font-mono">{Number(selectedPerf.iOPs || 0).toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
          <Link
            to={`/instances/${selectedInstance.instanceID}`}
            className="flex items-center justify-center gap-1.5 w-full mt-2 px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View Details
          </Link>
        </div>
      )}
    </div>
  );
}

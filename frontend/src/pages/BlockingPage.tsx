import { useEffect, useState } from 'react';
import { api } from '../api/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

interface BlockingRow {
  InstanceID: number;
  InstanceDisplayName: string;
  session_id: number;
  blocking_session_id: number;
  start_time: string;
  status: string;
  command: string;
  wait_type: string;
  wait_resource: string;
  cpu_time: number;
  query_text: string;
  SnapshotDate: string;
}

interface BlockNode {
  row: BlockingRow | null;
  sessionId: number;
  children: BlockNode[];
  isRoot: boolean;
}

export default function BlockingPage() {
  const [data, setData] = useState<BlockingRow[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<number | undefined>();

  useEffect(() => {
    api.instances().then(i => setInstances(Array.isArray(i) ? i : [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.performanceBlocking(selectedInstance)
      .then(r => { setData(r.data || []); setNote(r.note || ''); })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [selectedInstance]);

  const buildTree = (): BlockNode[] => {
    if (data.length === 0) return [];
    const bySession = new Map<number, BlockingRow>();
    const blockedIds = new Set<number>();
    data.forEach(r => {
      bySession.set(r.session_id, r);
      if (r.blocking_session_id > 0) blockedIds.add(r.session_id);
    });

    const blockerIds = new Set<number>();
    data.forEach(r => {
      if (r.blocking_session_id > 0) blockerIds.add(r.blocking_session_id);
    });

    const rootIds = [...blockerIds].filter(id => {
      const row = bySession.get(id);
      return !row || !row.blocking_session_id || row.blocking_session_id === 0;
    });

    const buildNode = (sessionId: number, visited: Set<number>): BlockNode => {
      if (visited.has(sessionId)) return { row: bySession.get(sessionId) || null, sessionId, children: [], isRoot: false };
      visited.add(sessionId);
      const children = data
        .filter(r => r.blocking_session_id === sessionId)
        .map(r => buildNode(r.session_id, visited));
      return { row: bySession.get(sessionId) || null, sessionId, children, isRoot: true };
    };

    if (rootIds.length === 0) {
      return data.map(r => ({ row: r, sessionId: r.session_id, children: [], isRoot: false }));
    }
    return rootIds.map(id => buildNode(id, new Set()));
  };

  const formatDuration = (start: string) => {
    if (!start) return '-';
    const s = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  const renderNode = (node: BlockNode, depth: number): React.ReactNode => (
    <div key={`${node.sessionId}-${depth}`}>
      <div
        className={clsx(
          'flex items-start gap-4 px-4 py-3 border-b border-white/5 transition-colors hover:bg-white/5',
          depth === 0 && 'bg-red-500/5'
        )}
        style={{ paddingLeft: `${1 + depth * 2}rem` }}
      >
        <div className="shrink-0 mt-1">
          {depth === 0 ? (
            <AlertTriangle className="w-4 h-4 text-red-400" />
          ) : (
            <div className="w-4 h-4 flex items-center justify-center text-gray-600">|</div>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={clsx('font-mono text-sm font-bold', depth === 0 ? 'text-red-400' : 'text-yellow-400')}>
              SID {node.sessionId}
            </span>
            {node.row && (
              <>
                <span className="text-xs text-gray-500">{node.row.InstanceDisplayName}</span>
                {node.row.wait_type && <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400">{node.row.wait_type}</span>}
                {node.row.wait_resource && <span className="text-xs text-gray-500 font-mono">{node.row.wait_resource}</span>}
                <span className="text-xs text-gray-500">{formatDuration(node.row.start_time)}</span>
              </>
            )}
          </div>
          {node.row?.query_text && (
            <pre className="text-xs text-gray-400 font-mono truncate max-w-3xl">{node.row.query_text}</pre>
          )}
        </div>
      </div>
      {node.children.map(child => renderNode(child, depth + 1))}
    </div>
  );

  if (loading) return <LoadingSpinner />;
  const tree = buildTree();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-400" />
          <h1 className="text-2xl font-bold text-white">Blocking</h1>
        </div>
        <select
          value={selectedInstance ?? ''}
          onChange={e => setSelectedInstance(e.target.value ? Number(e.target.value) : undefined)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        >
          <option value="">All Instances</option>
          {instances.map((inst: any) => (
            <option key={inst.InstanceID} value={inst.InstanceID}>{inst.InstanceDisplayName}</option>
          ))}
        </select>
      </div>

      {note && <div className="text-sm text-yellow-400/80 bg-yellow-400/5 border border-yellow-400/20 rounded-lg px-4 py-2">{note}</div>}

      {tree.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-ultra rounded-2xl p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">No blocking detected</p>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-ultra rounded-2xl overflow-hidden">
          {tree.map(node => renderNode(node, 0))}
        </motion.div>
      )}
    </div>
  );
}

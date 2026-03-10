import { RefreshCw, Clock } from 'lucide-react';

export default function RefreshIndicator({ countdown, lastRefresh }: { countdown: number; lastRefresh: Date }) {
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refreshing in {countdown}s</span>
      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {lastRefresh.toLocaleTimeString()}</span>
    </div>
  );
}

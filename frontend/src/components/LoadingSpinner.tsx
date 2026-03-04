import { Loader2 } from 'lucide-react';

export default function LoadingSpinner({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}

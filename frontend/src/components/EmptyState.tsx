import { Inbox } from 'lucide-react';

export default function EmptyState({ message = 'No data available' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
      <Inbox className="w-12 h-12" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

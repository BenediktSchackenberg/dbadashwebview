const BASE_URL = import.meta.env.VITE_API_URL || '';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (res.status === 501) throw new Error('Not implemented yet');
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  health: () => apiFetch<{ status: string; timestamp: string }>('/api/health'),
  instances: () => apiFetch<Array<{ id: number; name: string; connectionId: string | null }>>('/api/instances'),
  instanceStatus: (id: number) => apiFetch<unknown>(`/api/instances/${id}/status`),
  performanceSummary: () => apiFetch<unknown>('/api/performance/summary'),
  recentJobs: () => apiFetch<Array<{
    jobId: number; jobName: string; instanceId: number;
    runStatus: number; runDate: number; runTime: number; runDuration: number;
  }>>('/api/jobs/recent'),
};

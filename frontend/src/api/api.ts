const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  health: () => request<{ status: string }>('/api/health'),
  dashboardSummary: () => request<any[]>('/api/dashboard/summary'),
  instances: () => request<any[]>('/api/instances'),
  instance: (id: number) => request<{ instance: any; summary: any }>(`/api/instances/${id}`),
  instanceCpu: (id: number) => request<any[]>(`/api/instances/${id}/cpu`),
  instanceWaits: (id: number) => request<any[]>(`/api/instances/${id}/waits`),
  instanceDrives: (id: number) => request<any[]>(`/api/instances/${id}/drives`),
  instanceDatabases: (id: number) => request<any[]>(`/api/instances/${id}/databases`),
  instanceBackups: (id: number) => request<any[]>(`/api/instances/${id}/backups`),
  instanceJobs: (id: number) => request<any[]>(`/api/instances/${id}/jobs`),
  jobsRecent: () => request<any[]>('/api/jobs/recent'),
  jobsFailures: () => request<any[]>('/api/jobs/failures'),
  alertsRecent: () => request<any[]>('/api/alerts/recent'),
};

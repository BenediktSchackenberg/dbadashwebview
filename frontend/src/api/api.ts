const API_BASE = import.meta.env.VITE_API_URL || '';

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

export interface DashboardStats {
  totalInstances: number;
  healthy: number;
  warning: number;
  critical: number;
  totalDatabases: number;
  failedJobs24h: number;
  top10Cpu: { instanceId: number; instanceName: string; avgCpu: number }[];
  top10LargestDbs: { instanceName: string; databaseName: string; sizeMb: number }[];
  recentAlerts: any[];
  failedJobs: any[];
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  health: () => request<{ status: string }>('/api/health'),
  dashboardSummary: () => request<any[]>('/api/dashboard/summary'),
  dashboardStats: () => request<DashboardStats>('/api/dashboard/stats'),
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
  availabilityGroups: () => request<any[]>('/api/availability-groups'),
  availabilityGroup: (id: number) => request<{ ag: any; replicas: any[]; databases: any[] }>(`/api/availability-groups/${id}`),
  drives: () => request<any[]>('/api/drives'),
  instanceQueries: (id: number) => request<any[]>(`/api/instances/${id}/queries`),
  backupsEstate: () => request<any[]>('/api/backups/estate'),
  performanceRunningQueries: (instanceId?: number) =>
    request<{ data: any[]; note: string }>(`/api/performance/running-queries${instanceId ? `?instanceId=${instanceId}` : ''}`),
  performanceBlocking: (instanceId?: number) =>
    request<{ data: any[]; note: string }>(`/api/performance/blocking${instanceId ? `?instanceId=${instanceId}` : ''}`),
  performanceSlowQueries: (instanceId?: number, hours = 24) =>
    request<{ data: any[]; note: string }>(`/api/performance/slow-queries?hours=${hours}${instanceId ? `&instanceId=${instanceId}` : ''}`),
  performanceMemory: (instanceId?: number) =>
    request<{ clerks: any[]; counters: any[]; clerkNote: string; counterNote: string }>(`/api/performance/memory${instanceId ? `?instanceId=${instanceId}` : ''}`),
  performanceIO: (instanceId?: number) =>
    request<{ fileStats: any[]; drivePerf: any[]; fileNote: string; driveNote: string }>(`/api/performance/io${instanceId ? `?instanceId=${instanceId}` : ''}`),
  performanceExecStats: (instanceId?: number, hours = 24) =>
    request<{ data: any[]; note: string }>(`/api/performance/exec-stats?hours=${hours}${instanceId ? `&instanceId=${instanceId}` : ''}`),
  performanceWaitsTimeline: (instanceId: number, hours = 24) =>
    request<{ data: any[]; note: string }>(`/api/performance/waits-timeline?instanceId=${instanceId}&hours=${hours}`),
  performanceCounters: (instanceId: number, hours = 24) =>
    request<{ data: any[]; note: string }>(`/api/performance/counters?instanceId=${instanceId}&hours=${hours}`),
  monitoringJobTimeline: (instanceId: number, hours = 24) =>
    request<{ data: any[]; note: string }>(`/api/monitoring/job-timeline?instanceId=${instanceId}&hours=${hours}`),
  monitoringConfiguration: (instanceId: number) =>
    request<{ data: any[]; note: string }>(`/api/monitoring/configuration?instanceId=${instanceId}`),
  monitoringConfigurationChanges: (instanceId: number, days = 30) =>
    request<{ data: any[]; note: string }>(`/api/monitoring/configuration/changes?instanceId=${instanceId}&days=${days}`),
};

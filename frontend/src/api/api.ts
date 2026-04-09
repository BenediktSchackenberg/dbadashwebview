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

function withQuery(base: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === false || v === '') continue;
    if (v === true) q.set(k, 'true');
    else q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${base}?${s}` : base;
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
  /** @param allInstances when true, include active instances without requiring collection activity in the last 24h */
  instances: (allInstances?: boolean) =>
    request<any[]>(withQuery('/api/instances', { all: allInstances ? true : undefined })),
  instance: (id: number) => request<{ instance: any; summary: any }>(`/api/instances/${id}`),
  instanceCpu: (id: number, hours = 24) => request<any[]>(`/api/instances/${id}/cpu?hours=${hours}`),
  instanceWaits: (id: number, hours = 24, top = 200) =>
    request<any[]>(withQuery(`/api/instances/${id}/waits`, { hours, top })),
  instanceDrives: (id: number) => request<any[]>(`/api/instances/${id}/drives`),
  instanceDatabases: (id: number) => request<any[]>(`/api/instances/${id}/databases`),
  instanceBackups: (id: number) => request<any[]>(`/api/instances/${id}/backups`),
  instanceJobs: (id: number, limit?: number, offset?: number) =>
    request<any[]>(withQuery(`/api/instances/${id}/jobs`, { limit, offset })),
  jobsRecent: (limit?: number, offset?: number) =>
    request<any[]>(withQuery('/api/jobs/recent', { limit, offset })),
  jobsFailures: (limit?: number, offset?: number) =>
    request<any[]>(withQuery('/api/jobs/failures', { limit, offset })),
  alertsRecent: (limit?: number, offset?: number) =>
    request<any[]>(withQuery('/api/alerts/recent', { limit, offset })),
  availabilityGroups: () => request<any[]>('/api/availability-groups'),
  availabilityGroup: (id: number) => request<{ ag: any; replicas: any[]; databases: any[] }>(`/api/availability-groups/${id}`),
  instanceHadr: (id: number) => request<any>(`/api/instances/${id}/hadr`),
  hadrOverview: () => request<any>('/api/hadr/overview'),
  drives: () => request<any[]>('/api/drives'),
  instanceQueries: (id: number, limit?: number) =>
    request<any[]>(withQuery(`/api/instances/${id}/queries`, { limit })),
  backupsEstate: () => request<any[]>('/api/backups/estate'),
  backupsManagement: () => request<any>('/api/backups/management'),
  performanceRunningQueries: (instanceId?: number, limit?: number, offset?: number) =>
    request<{ data: any[]; note: string }>(
      withQuery('/api/performance/running-queries', { instanceId, limit, offset }),
    ),
  performanceBlocking: (instanceId?: number, limit?: number, offset?: number) =>
    request<{ data: any[]; note: string }>(
      withQuery('/api/performance/blocking', { instanceId, limit, offset }),
    ),
  performanceSlowQueries: (instanceId?: number, hours = 24, limit?: number, offset?: number) =>
    request<{ data: any[]; note: string }>(
      withQuery('/api/performance/slow-queries', { instanceId, hours, limit, offset }),
    ),
  performanceMemory: (instanceId?: number, hours = 24, limit?: number) =>
    request<{ clerks: any[]; counters: any[]; clerkNote: string; counterNote: string }>(
      withQuery('/api/performance/memory', { instanceId, hours, limit }),
    ),
  performanceIO: (instanceId?: number, hours = 24, limit?: number) =>
    request<{ fileStats: any[]; drivePerf: any[]; fileNote: string; driveNote: string }>(
      withQuery('/api/performance/io', { instanceId, hours, limit }),
    ),
  performanceExecStats: (instanceId?: number, hours = 24, limit?: number, offset?: number) =>
    request<{ data: any[]; note: string }>(
      withQuery('/api/performance/exec-stats', { instanceId, hours, limit, offset }),
    ),
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
  monitoringPatching: () =>
    request<{ data: any[]; note: string }>('/api/monitoring/patching'),
  monitoringSchemaChanges: (instanceId: number, days = 30) =>
    request<{ data: any[]; note: string }>(`/api/monitoring/schema-changes?instanceId=${instanceId}&days=${days}`),
  performanceQueryStore: (instanceId: number) =>
    request<{ data: any[]; note: string }>(`/api/performance/query-store?instanceId=${instanceId}`),
  monitoringIdentityColumns: (instanceId: number) =>
    request<{ data: any[]; note: string }>(`/api/monitoring/identity-columns?instanceId=${instanceId}`),
  monitoringTempDB: (instanceId: number) =>
    request<{ data: any[]; note: string }>(`/api/monitoring/tempdb?instanceId=${instanceId}`),
  monitoringDBSpace: (instanceId: number) =>
    request<{ data: any[]; note: string }>(`/api/monitoring/db-space?instanceId=${instanceId}`),
  dashboardPerformanceSummary: () =>
    request<{ data: any[]; note: string }>('/api/dashboard/performance-summary'),
  tree: () => request<any[]>('/api/tree'),
  reportsLicenses: () => request<any[]>('/api/reports/licenses'),
  reportsUnderutilized: () => request<any[]>('/api/reports/underutilized'),
  reportsFleetStats: (hours = 24) => request<any[]>(`/api/reports/fleet-stats?hours=${hours}`),
  reportsBackupAmpel: () => request<{ instances: any[]; databases: any[] }>('/api/reports/backup-ampel'),
  dashboardMonitor: () => request<{ instances: any[]; alertCounts: Record<string, number>; recentErrors: any[] }>('/api/dashboard/monitor'),
  getThresholds: () =>
    request<{ thresholds: Record<string, { warning: number; critical: number }> }>('/api/settings/thresholds'),
  saveThresholds: (thresholds: Record<string, { warning: number; critical: number }>) =>
    request<{ success: boolean }>('/api/settings/thresholds', { method: 'POST', body: JSON.stringify({ thresholds }) }),
};

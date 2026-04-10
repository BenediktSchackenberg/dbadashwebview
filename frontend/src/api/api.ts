import { clearAuthSession, getAuthSession, isAuthenticated, setAuthSession } from '../auth/session';
import type {
  AdConfig,
  AdLoginTestResult,
  ApiErrorShape,
  ApiRow,
  AuthStatusResponse,
  CreateLocalUserRequest,
  DashboardMonitorResponse,
  DashboardPerformanceResponse,
  DashboardSummaryRow,
  DashboardStats,
  InstanceBackupRow,
  InstanceCpuRow,
  InstanceDatabaseRow,
  InstanceDetailResponse,
  InstanceDriveRow,
  InstanceJobRow,
  InstanceListRow,
  InstanceWaitRow,
  LocalUser,
  LoginResponse,
  ThresholdMap,
  TreeInstanceNode,
  UpdateLocalUserRequest,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || '';

function getToken(): string | null {
  return getAuthSession()?.token ?? null;
}

export function setToken(token: string) {
  const session = getAuthSession();
  if (!session) return;
  setAuthSession({ ...session, token });
}

export function clearToken() {
  clearAuthSession();
}

function extractErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const maybeError = payload as ApiErrorShape;
  return maybeError.detail || maybeError.error || maybeError.message || maybeError.title || null;
}

async function readPayload<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await res.json() as T;
  }

  return await res.text() as T;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const payload = await readPayload<unknown>(res).catch(() => null);

  if (res.status === 401) {
    clearAuthSession();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    throw new Error(extractErrorMessage(payload) || `HTTP ${res.status}`);
  }

  return payload as T;
}

export { isAuthenticated, setAuthSession };
export type { ThresholdMap } from './types';

export const api = {
  authStatus: () => request<AuthStatusResponse>('/api/auth/status'),
  login: async (username: string, password: string) => {
    const response = await request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setAuthSession(response);
    return response;
  },
  health: () => request<{ status: string }>('/api/health'),
  dashboardSummary: () => request<DashboardSummaryRow[]>('/api/dashboard/summary'),
  dashboardStats: () => request<DashboardStats>('/api/dashboard/stats'),
  instances: () => request<InstanceListRow[]>('/api/instances'),
  instance: (id: number) => request<InstanceDetailResponse>(`/api/instances/${id}`),
  instanceCpu: (id: number, hours = 24) => request<InstanceCpuRow[]>(`/api/instances/${id}/cpu?hours=${hours}`),
  instanceWaits: (id: number, hours = 24) => request<InstanceWaitRow[]>(`/api/instances/${id}/waits?hours=${hours}`),
  instanceDrives: (id: number) => request<InstanceDriveRow[]>(`/api/instances/${id}/drives`),
  instanceDatabases: (id: number) => request<InstanceDatabaseRow[]>(`/api/instances/${id}/databases`),
  instanceBackups: (id: number) => request<InstanceBackupRow[]>(`/api/instances/${id}/backups`),
  instanceJobs: (id: number) => request<InstanceJobRow[]>(`/api/instances/${id}/jobs`),
  jobsRecent: () => request<InstanceJobRow[]>('/api/jobs/recent'),
  jobsFailures: () => request<ApiRow[]>('/api/jobs/failures'),
  alertsRecent: () => request<ApiRow[]>('/api/alerts/recent'),
  availabilityGroups: () => request<ApiRow[]>('/api/availability-groups'),
  availabilityGroup: (id: number) => request<{ ag: ApiRow; replicas: ApiRow[]; databases: ApiRow[] }>(`/api/availability-groups/${id}`),
  instanceHadr: (id: number) => request<any>(`/api/instances/${id}/hadr`),
  hadrOverview: () => request<any>('/api/hadr/overview'),
  drives: () => request<ApiRow[]>('/api/drives'),
  instanceQueries: (id: number) => request<ApiRow[]>(`/api/instances/${id}/queries`),
  backupsEstate: () => request<ApiRow[]>('/api/backups/estate'),
  backupsManagement: () => request<any>('/api/backups/management'),
  performanceRunningQueries: (instanceId?: number) =>
    request<{ data: any[]; note: string }>(`/api/performance/running-queries${instanceId ? `?instanceId=${instanceId}` : ''}`),
  performanceBlocking: (instanceId?: number) =>
    request<{ data: any[]; note: string }>(`/api/performance/blocking${instanceId ? `?instanceId=${instanceId}` : ''}`),
  performanceSlowQueries: (instanceId?: number, hours = 24) =>
    request<{ data: ApiRow[]; note: string }>(`/api/performance/slow-queries?hours=${hours}${instanceId ? `&instanceId=${instanceId}` : ''}`),
  performanceMemory: (instanceId?: number, hours = 24) =>
    request<{ clerks: ApiRow[]; counters: ApiRow[]; clerkNote: string; counterNote: string }>(`/api/performance/memory?hours=${hours}${instanceId ? `&instanceId=${instanceId}` : ''}`),
  performanceIO: (instanceId?: number, hours = 24) =>
    request<{ fileStats: ApiRow[]; drivePerf: ApiRow[]; fileNote: string; driveNote: string }>(`/api/performance/io?hours=${hours}${instanceId ? `&instanceId=${instanceId}` : ''}`),
  performanceExecStats: (instanceId?: number, hours = 24) =>
    request<{ data: ApiRow[]; note: string }>(`/api/performance/exec-stats?hours=${hours}${instanceId ? `&instanceId=${instanceId}` : ''}`),
  performanceWaitsTimeline: (instanceId: number, hours = 24) =>
    request<{ data: ApiRow[]; note: string }>(`/api/performance/waits-timeline?instanceId=${instanceId}&hours=${hours}`),
  performanceCounters: (instanceId: number, hours = 24) =>
    request<{ data: ApiRow[]; note: string }>(`/api/performance/counters?instanceId=${instanceId}&hours=${hours}`),
  monitoringJobTimeline: (instanceId: number, hours = 24) =>
    request<{ data: ApiRow[]; note: string }>(`/api/monitoring/job-timeline?instanceId=${instanceId}&hours=${hours}`),
  monitoringConfiguration: (instanceId: number) =>
    request<{ data: ApiRow[]; note: string }>(`/api/monitoring/configuration?instanceId=${instanceId}`),
  monitoringConfigurationChanges: (instanceId: number, days = 30) =>
    request<{ data: ApiRow[]; note: string }>(`/api/monitoring/configuration/changes?instanceId=${instanceId}&days=${days}`),
  monitoringPatching: () =>
    request<{ data: any[]; note: string }>('/api/monitoring/patching'),
  monitoringSchemaChanges: (instanceId: number, days = 30) =>
    request<{ data: ApiRow[]; note: string }>(`/api/monitoring/schema-changes?instanceId=${instanceId}&days=${days}`),
  performanceQueryStore: (instanceId: number) =>
    request<{ data: ApiRow[]; note: string }>(`/api/performance/query-store?instanceId=${instanceId}`),
  monitoringIdentityColumns: (instanceId: number) =>
    request<{ data: ApiRow[]; note: string }>(`/api/monitoring/identity-columns?instanceId=${instanceId}`),
  monitoringTempDB: (instanceId: number) =>
    request<{ data: ApiRow[]; note: string }>(`/api/monitoring/tempdb?instanceId=${instanceId}`),
  monitoringDBSpace: (instanceId: number) =>
    request<{ data: ApiRow[]; note: string }>(`/api/monitoring/db-space?instanceId=${instanceId}`),
  dashboardPerformanceSummary: () =>
    request<DashboardPerformanceResponse>('/api/dashboard/performance-summary'),
  tree: () => request<TreeInstanceNode[]>('/api/tree'),
  reportsLicenses: () => request<ApiRow[]>('/api/reports/licenses'),
  reportsUnderutilized: () => request<ApiRow[]>('/api/reports/underutilized'),
  reportsFleetStats: (hours = 24) => request<ApiRow[]>(`/api/reports/fleet-stats?hours=${hours}`),
  reportsBackupAmpel: () => request<{ instances: ApiRow[]; databases: ApiRow[] }>('/api/reports/backup-ampel'),
  dashboardMonitor: () => request<DashboardMonitorResponse>('/api/dashboard/monitor'),
  getThresholds: () =>
    request<{ thresholds: ThresholdMap }>('/api/settings/thresholds'),
  saveThresholds: (thresholds: ThresholdMap) =>
    request<{ success: boolean }>('/api/settings/thresholds', { method: 'POST', body: JSON.stringify({ thresholds }) }),
  getAdConfig: async () => {
    const response = await request<AdConfig>('/api/settings/ad');
    return { ...response, bindPassword: '' };
  },
  saveAdConfig: (config: AdConfig) =>
    request<{ success: boolean; message: string }>('/api/settings/ad', { method: 'POST', body: JSON.stringify(config) }),
  testAdLogin: (username: string, password: string) =>
    request<AdLoginTestResult>('/api/settings/ad/test', { method: 'POST', body: JSON.stringify({ username, password }) }),
  getLocalUsers: () => request<LocalUser[]>('/api/settings/users'),
  createLocalUser: (payload: CreateLocalUserRequest) =>
    request<LocalUser>('/api/settings/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateLocalUser: (id: string, payload: UpdateLocalUserRequest) =>
    request<LocalUser>(`/api/settings/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
};

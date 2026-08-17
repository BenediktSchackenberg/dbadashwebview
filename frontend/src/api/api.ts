import { clearAuthSession, getAuthSession, isAuthenticated, setAuthSession } from '../auth/session';
import type {
  AcknowledgeAlertsRequest,
  ActiveAlertRow,
  AdConfig,
  AdLoginTestResult,
  AlertLifecycleResponse,
  ApplicationVersionResponse,
  AvailabilityGroupSummaryRow,
  BackupAmpelResponse,
  BackupManagementResponse,
  ApiDataResponse,
  ApiErrorShape,
  ApiRow,
  AuthStatusResponse,
  ClosedAlertRow,
  CloseAlertsRequest,
  CreateLocalUserRequest,
  DbSpaceRow,
  EstateBackupRow,
  DriveGrowthPoint,
  EstateDriveRow,
  FleetStatsRow,
  HadrOverviewResponse,
  DashboardMonitorResponse,
  DashboardPerformanceResponse,
  DashboardSummaryRow,
  DashboardStats,
  ExecStatsRow,
  IdentityColumnRow,
  InstanceBackupRow,
  InstanceCpuRow,
  InstanceDatabaseRow,
  InstanceDetailResponse,
  InstanceDriveRow,
  InstanceHadrResponse,
  InstanceJobRow,
  InstanceListRow,
  InstanceWaitRow,
  JobTimelineRow,
  LicenseReportRow,
  LocalUser,
  LoginResponse,
  MemoryResponse,
  MonitoringConfigurationChangeRow,
  MonitoringConfigurationRow,
  PatchingRow,
  PerformanceCounterRow,
  PerformanceIOResponse,
  QueryAnalysisRow,
  QueryStoreRow,
  RunningQueryRow,
  SchemaChangeRow,
  SlowQueryRow,
  TempDbFileRow,
  ThresholdMap,
  TreeInstanceNode,
  UnderutilizedReportRow,
  UpdateAlertNotesRequest,
  UpdateLocalUserRequest,
  WaitTimelineRow,
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
  version: () => request<ApplicationVersionResponse>('/api/version'),
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
  jobsRecent: (instanceId?: number) => request<InstanceJobRow[]>(`/api/jobs/recent${instanceId ? `?instanceId=${instanceId}` : ''}`),
  jobsFailures: (instanceId?: number) => request<ApiRow[]>(`/api/jobs/failures${instanceId ? `?instanceId=${instanceId}` : ''}`),
  alertsRecent: (instanceId?: number) =>
    request<ApiRow[]>(
      typeof instanceId === 'number'
        ? `/api/alerts/recent?instanceId=${instanceId}`
        : '/api/alerts/recent',
    ),
  availabilityGroups: () => request<AvailabilityGroupSummaryRow[]>('/api/availability-groups'),
  instanceHadr: (id: number) => request<InstanceHadrResponse>(`/api/instances/${id}/hadr`),
  hadrOverview: () => request<HadrOverviewResponse>('/api/hadr/overview'),
  drives: () => request<EstateDriveRow[]>('/api/drives'),
  drivesGrowth: (driveIds: number[], days = 30) =>
    request<{ data: DriveGrowthPoint[] }>(`/api/drives/growth?driveIds=${driveIds.join(',')}&days=${days}`),
  instanceQueries: (id: number) => request<QueryAnalysisRow[]>(`/api/instances/${id}/queries`),
  backupsEstate: () => request<EstateBackupRow[]>('/api/backups/estate'),
  backupsManagement: () => request<BackupManagementResponse>('/api/backups/management'),
  performanceRunningQueries: (instanceId?: number) =>
    request<ApiDataResponse<RunningQueryRow>>(`/api/performance/running-queries${instanceId ? `?instanceId=${instanceId}` : ''}`),
  performanceBlocking: (instanceId?: number) =>
    request<ApiDataResponse<RunningQueryRow>>(`/api/performance/blocking${instanceId ? `?instanceId=${instanceId}` : ''}`),
  performanceSlowQueries: (instanceId?: number, hours = 24, from?: string, to?: string) =>
    request<ApiDataResponse<SlowQueryRow>>(
      `/api/performance/slow-queries?${from && to
        ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : `hours=${hours}`}${instanceId ? `&instanceId=${instanceId}` : ''}`
    ),
  performanceMemory: (instanceId?: number, hours = 24) =>
    request<MemoryResponse>(`/api/performance/memory?hours=${hours}${instanceId ? `&instanceId=${instanceId}` : ''}`),
  performanceIO: (instanceId?: number, hours = 24) =>
    request<PerformanceIOResponse>(`/api/performance/io?hours=${hours}${instanceId ? `&instanceId=${instanceId}` : ''}`),
  performanceExecStats: (instanceId?: number, hours = 24, from?: string, to?: string) =>
    request<ApiDataResponse<ExecStatsRow>>(
      `/api/performance/exec-stats?${from && to
        ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : `hours=${hours}`}${instanceId ? `&instanceId=${instanceId}` : ''}`
    ),
  performanceWaitsTimeline: (instanceId: number, hours = 24, from?: string, to?: string) =>
    request<ApiDataResponse<WaitTimelineRow>>(
      `/api/performance/waits-timeline?instanceId=${instanceId}&${from && to
        ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : `hours=${hours}`}`
    ),
  performanceCounters: (instanceId: number, hours = 24, from?: string, to?: string) =>
    request<ApiDataResponse<PerformanceCounterRow>>(
      `/api/performance/counters?instanceId=${instanceId}&${from && to
        ? `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : `hours=${hours}`}`
    ),
  monitoringJobTimeline: (instanceId: number, hours = 24) =>
    request<ApiDataResponse<JobTimelineRow>>(`/api/monitoring/job-timeline?instanceId=${instanceId}&hours=${hours}`),
  monitoringConfiguration: (instanceId: number) =>
    request<ApiDataResponse<MonitoringConfigurationRow>>(`/api/monitoring/configuration?instanceId=${instanceId}`),
  monitoringConfigurationChanges: (instanceId: number, days = 30) =>
    request<ApiDataResponse<MonitoringConfigurationChangeRow>>(`/api/monitoring/configuration/changes?instanceId=${instanceId}&days=${days}`),
  monitoringPatching: () =>
    request<ApiDataResponse<PatchingRow>>('/api/monitoring/patching'),
  monitoringSchemaChanges: (instanceId: number, days = 30) =>
    request<ApiDataResponse<SchemaChangeRow>>(`/api/monitoring/schema-changes?instanceId=${instanceId}&days=${days}`),
  performanceQueryStore: (instanceId: number) =>
    request<ApiDataResponse<QueryStoreRow>>(`/api/performance/query-store?instanceId=${instanceId}`),
  monitoringIdentityColumns: (instanceId: number) =>
    request<ApiDataResponse<IdentityColumnRow>>(`/api/monitoring/identity-columns?instanceId=${instanceId}`),
  monitoringTempDB: (instanceId: number) =>
    request<ApiDataResponse<TempDbFileRow>>(`/api/monitoring/tempdb?instanceId=${instanceId}`),
  monitoringDBSpace: (instanceId: number) =>
    request<ApiDataResponse<DbSpaceRow>>(`/api/monitoring/db-space?instanceId=${instanceId}`),
  dashboardPerformanceSummary: () =>
    request<DashboardPerformanceResponse>('/api/dashboard/performance-summary'),
  tree: () => request<TreeInstanceNode[]>('/api/tree'),
  reportsLicenses: () => request<LicenseReportRow[]>('/api/reports/licenses'),
  reportsUnderutilized: () => request<UnderutilizedReportRow[]>('/api/reports/underutilized'),
  reportsFleetStats: (hours = 24) => request<FleetStatsRow[]>(`/api/reports/fleet-stats?hours=${hours}`),
  reportsBackupAmpel: () => request<BackupAmpelResponse>('/api/reports/backup-ampel'),
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
  alertsActive: (instanceId?: number) =>
    request<AlertLifecycleResponse<ActiveAlertRow>>(`/api/alerts/active${instanceId ? `?instanceId=${instanceId}` : ''}`),
  alertsClosed: (instanceId?: number, top = 500) =>
    request<AlertLifecycleResponse<ClosedAlertRow>>(`/api/alerts/closed?top=${top}${instanceId ? `&instanceId=${instanceId}` : ''}`),
  acknowledgeAlerts: (payload: AcknowledgeAlertsRequest) =>
    request<{ success: boolean }>('/api/alerts/acknowledge', { method: 'POST', body: JSON.stringify(payload) }),
  closeAlerts: (payload: CloseAlertsRequest) =>
    request<{ success: boolean }>('/api/alerts/close', { method: 'POST', body: JSON.stringify(payload) }),
  updateAlertNotes: (alertId: number, payload: UpdateAlertNotesRequest) =>
    request<{ success: boolean }>(`/api/alerts/${alertId}/notes`, { method: 'PUT', body: JSON.stringify(payload) }),
};

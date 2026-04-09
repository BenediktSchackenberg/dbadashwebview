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
  dashboardStats: (detailTop?: number) =>
    request<DashboardStats>(withQuery('/api/dashboard/stats', { detailTop })),
  /** @param allInstances when true, include active instances without requiring collection activity in the last 24h */
  instances: (allInstances?: boolean) =>
    request<any[]>(withQuery('/api/instances', { all: allInstances ? true : undefined })),
  instance: (id: number) => request<{ instance: any; summary: any }>(`/api/instances/${id}`),
  instanceCpu: (id: number, hours = 24) => request<any[]>(`/api/instances/${id}/cpu?hours=${hours}`),
  instanceWaits: (id: number, hours = 24, top = 200) =>
    request<any[]>(withQuery(`/api/instances/${id}/waits`, { hours, top })),
  instanceDrives: (id: number) => request<any[]>(`/api/instances/${id}/drives`),
  instanceLogShippingSummary: (id: number) =>
    request<{ data: any[]; note: string; error?: string }>(`/api/instances/${id}/log-shipping-summary`),
  instanceLogShippingDetail: (id: number) =>
    request<{ data: any[]; note: string; error?: string }>(`/api/instances/${id}/log-shipping-detail`),
  instanceDatabaseMirroringSummary: (id: number) =>
    request<{ data: any[]; note: string; error?: string }>(`/api/instances/${id}/database-mirroring-summary`),
  instanceDatabaseMirroringDetail: (id: number) =>
    request<{ data: any[]; note: string; error?: string }>(`/api/instances/${id}/database-mirroring-detail`),
  instanceCollectionDates: (id: number) =>
    request<{ data: any[]; note: string; error?: string }>(`/api/instances/${id}/collection-dates`),
  instanceCollectionErrors: (id: number, days?: number) =>
    request<{ data: any[]; note: string; error?: string }>(
      withQuery(`/api/instances/${id}/collection-errors`, { days }),
    ),
  instanceCorruption: (id: number) =>
    request<{ data: any[]; note: string; error?: string }>(`/api/instances/${id}/corruption`),
  instanceLastCheckdb: (id: number) =>
    request<{ data: any[]; note: string; error?: string }>(`/api/instances/${id}/last-checkdb`),
  instanceDriveSnapshots: (id: number, driveId: number, hours?: number) =>
    request<{ data: any[]; note: string; error?: string; fromDate?: string; toDate?: string }>(
      withQuery(`/api/instances/${id}/drives/${driveId}/snapshots`, { hours }),
    ),
  instanceCpuSp: (id: number, hours?: number) =>
    request<{ data: any[]; note: string; error?: string }>(withQuery(`/api/instances/${id}/cpu-sp`, { hours })),
  estateLogShipping: () =>
    request<{ data: any[]; note: string; error?: string }>('/api/estate/log-shipping'),
  estateDatabaseMirroring: () =>
    request<{ data: any[]; note: string; error?: string }>('/api/estate/database-mirroring'),
  instanceCustomTools: (id: number) =>
    request<{ data: any[]; note: string; error?: string }>(`/api/instances/${id}/custom-tools`),
  /** DBA Dash messaging: run allow-listed community proc on monitored instance (requires appsettings + agent messaging). */
  instanceMessagingCommunityProc: (
    id: number,
    body: {
      procedureName: string;
      schemaName?: string;
      lifetimeSeconds?: number;
      parameters?: { name: string; dbType?: string; value?: unknown; isNull?: boolean }[];
    },
  ) =>
    request<{
      error?: string;
      usedS3DataPath?: boolean;
      progress: { message?: string }[];
      resultSets: { name: string; rows: Record<string, unknown>[] }[];
    }>(`/api/instances/${id}/messaging/community-proc`, { method: 'POST', body: JSON.stringify(body) }),
  /** UserReport schema only; each procedure must be listed in UserReport:AllowedProcedures. */
  repositoryUserReportExecute: (body: {
    procedureName: string;
    timeoutSeconds?: number;
    parameters?: Record<string, unknown>;
  }) =>
    request<{ data: Record<string, unknown>[]; error?: string; note?: string }>(
      '/api/repository/user-report/execute',
      { method: 'POST', body: JSON.stringify(body) },
    ),
  repositoryCustomReports: () =>
    request<{ data: any[]; note: string; error?: string }>('/api/repository/custom-reports'),
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
  /** Same data as Windows DBA Dash Running Queries summary: dbo.RunningQueriesSummary_Get */
  performanceRunningQueriesSummary: (instanceId: number, hours = 24, limit?: number) =>
    request<{ data: any[]; note: string }>(
      withQuery('/api/performance/running-queries-summary', { instanceId, hours, limit }),
    ),
  /** dbo.RunningQueries_Get — full snapshot grid + OUTPUT metadata (hasCursors, snapshot dates) */
  performanceRunningQueriesSnapshot: (instanceId: number, top?: number) =>
    request<{
      data: any[];
      outputs?: Record<string, unknown>;
      rowCount?: number;
      note: string;
      error?: string;
    }>(withQuery('/api/performance/running-queries-snapshot', { instanceId, top })),
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
  monitoringSchemaChanges: (instanceId: number, days = 30, limit?: number) =>
    request<{ data: any[]; note: string }>(
      withQuery('/api/monitoring/schema-changes', { instanceId, days, limit }),
    ),
  performanceQueryStore: (instanceId: number, limit?: number) =>
    request<{ data: any[]; note: string }>(
      withQuery('/api/performance/query-store', { instanceId, limit }),
    ),
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

  /**
   * Whitelisted dbo.* read procedures (DBADashDB). Same surface area as many DBADashGUI screens.
   * BlockingSnapshots_Get / WaitsSummary_Get: leave addEmptyDayHourTvp true for empty @DaysOfWeek/@Hours TVPs.
   */
  repositoryInvokeSp: async (opts: {
    procedure: string;
    timeoutSeconds?: number;
    parameters?: Record<string, unknown>;
    addEmptyDayHourTvp?: boolean;
    /** dbo.IDs TVPs: e.g. { InstanceIDs: [1, 2] } → @InstanceIDs */
    tvpIds?: Record<string, number[]>;
  }): Promise<{ procedure: string; rowCount: number; rows: Record<string, unknown>[] }> => {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/repository/invoke-sp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(opts),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const msg =
        typeof (data as { error?: string })?.error === 'string'
          ? (data as { error: string }).error
          : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data as { procedure: string; rowCount: number; rows: Record<string, unknown>[] };
  },

  parityCatalog: () =>
    request<{
      mutatingEnabled: boolean;
      entries: Array<{
        category: string;
        label: string;
        procedure: string;
        addEmptyDayHourTvp: boolean;
        suggestedTimeoutSeconds: number;
        instanceParameterName: string | null;
        databaseParameterName: string | null;
        notes: string | null;
      }>;
      mutatingEntries: Array<{
        category: string;
        label: string;
        procedure: string;
        suggestedTimeoutSeconds: number;
        notes: string | null;
      }>;
    }>('/api/repository/parity-catalog'),

  repositoryInvokeSpMutate: async (opts: {
    procedure: string;
    timeoutSeconds?: number;
    parameters?: Record<string, unknown>;
  }): Promise<{ procedure: string; rowsAffected: number }> => {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/api/repository/invoke-sp-mutate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(opts),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (res.status === 401) {
      clearToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const msg =
        typeof (data as { error?: string })?.error === 'string'
          ? (data as { error: string }).error
          : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data as { procedure: string; rowsAffected: number };
  },
};

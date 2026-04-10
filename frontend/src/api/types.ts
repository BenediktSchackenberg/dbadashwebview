import type { AuthRole, AuthSource } from '../auth/session';

export type ApiRow = Record<string, unknown>;

export interface ApiErrorShape {
  error?: string;
  title?: string;
  detail?: string;
  message?: string;
}

export interface AuthStatusResponse {
  localAuthEnabled: boolean;
  adEnabled: boolean;
  bootstrapRequired: boolean;
  supportedRoles: AuthRole[];
}

export interface LoginResponse {
  token: string;
  username: string;
  displayName?: string | null;
  role: AuthRole;
  source: AuthSource;
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
  recentAlerts: ApiRow[];
  failedJobs: ApiRow[];
}

export interface TreeDatabaseNode {
  databaseId: number;
  name: string;
  isSystem: boolean;
}

export interface TreeInstanceNode {
  instanceId: number;
  instanceName: string;
  productVersion: string | null;
  productMajorVersion: number | null;
  databases: TreeDatabaseNode[];
}

export interface LocalUser {
  id: string;
  username: string;
  displayName?: string | null;
  role: AuthRole;
  active: boolean;
  createdAtUtc: string;
  lastLoginAtUtc?: string | null;
}

export interface CreateLocalUserRequest {
  username: string;
  displayName?: string | null;
  password: string;
  role: AuthRole;
  active?: boolean;
}

export interface UpdateLocalUserRequest {
  displayName?: string | null;
  role: AuthRole;
  active: boolean;
  password?: string;
}

export interface AdConfig {
  enabled: boolean;
  server: string;
  port: number;
  useSsl: boolean;
  domain: string;
  baseDn: string;
  requiredGroup: string;
  operatorGroup: string;
  adminGroup: string;
  allowLocalFallback: boolean;
  bindUser: string;
  bindPassword: string;
  hasBindPassword?: boolean;
}

export interface AdLoginTestResult {
  success: boolean;
  message: string;
  displayName?: string | null;
  role: AuthRole;
  groups: string[];
}

export interface ThresholdValue {
  warning: number;
  critical: number;
}

export type ThresholdMap = Record<string, ThresholdValue>;

export interface SearchInstanceRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string;
  Instance?: string;
  ConnectionID?: string;
  Edition?: string;
}

export interface SearchDatabaseRow extends ApiRow {
  DatabaseID: number;
  InstanceID: number;
  name?: string;
  InstanceDisplayName?: string;
}

export interface SearchJobRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string;
  step_name?: string;
  job_id?: string;
}

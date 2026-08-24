import type { AuthRole, AuthSource } from '../auth/session';

export type ApiRow = Record<string, unknown>;
export type StatusCode = 1 | 2 | 3 | 4 | 5;

export interface ApiErrorShape {
  error?: string;
  title?: string;
  detail?: string;
  message?: string;
}

export interface ApplicationVersionResponse {
  version: string;
  source: 'version-file' | 'assembly';
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
  allowedTags?: string[];
  allowedGroupIds?: number[];
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

export interface DashboardSummaryRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string;
  Instance?: string;
  FullBackupStatus?: StatusCode | null;
  DiffBackupStatus?: StatusCode | null;
  LogBackupStatus?: StatusCode | null;
  LogShippingStatus?: StatusCode | null;
  DriveStatus?: StatusCode | null;
  FileFreeSpaceStatus?: StatusCode | null;
  LogFreeSpaceStatus?: StatusCode | null;
  JobStatus?: StatusCode | null;
  AGStatus?: StatusCode | null;
  CorruptionStatus?: StatusCode | null;
  LastGoodCheckDBStatus?: StatusCode | null;
  MemoryDumpStatus?: StatusCode | null;
  SnapshotAgeStatus?: StatusCode | null;
  UptimeStatus?: StatusCode | null;
  IsAgentRunningStatus?: StatusCode | null;
  DBMailStatus?: StatusCode | null;
  QueryStoreStatus?: StatusCode | null;
  AlertStatus?: StatusCode | null;
  PctMaxSizeStatus?: StatusCode | null;
  CollectionErrorStatus?: StatusCode | null;
  DatabaseStateStatus?: StatusCode | null;
  IdentityStatus?: StatusCode | null;
  CustomCheckStatus?: StatusCode | null;
  MirroringStatus?: StatusCode | null;
  ElasticPoolStorageStatus?: StatusCode | null;
}

export interface InstanceListRow extends SearchInstanceRow {
  LastCollected?: string | null;
  ShowInSummary?: boolean | null;
  ProductVersion?: string | null;
  ProductMajorVersion?: number | null;
  cpu_count?: number | null;
  physical_memory_kb?: number | null;
  sqlserver_start_time?: string | null;
}

export interface InstanceDetailInstance extends InstanceListRow {
  Alias?: string | null;
}

export interface InstanceDetailResponse {
  instance: InstanceDetailInstance;
  summary?: DashboardSummaryRow | null;
}

export interface InstanceCpuRow extends ApiRow {
  EventTime: string;
  SQLProcessCPU?: number | null;
  SystemIdleCPU?: number | null;
  OtherCPU?: number | null;
  TotalCPU?: number | null;
}

export interface InstanceWaitRow extends ApiRow {
  WaitTypeID?: number | null;
  WaitType?: string | null;
  TotalWaitMs?: number | null;
  TotalWaitCount?: number | null;
  TotalSignalWaitMs?: number | null;
}

export interface InstanceDriveRow extends ApiRow {
  DriveID?: number | null;
  Name?: string | null;
  Label?: string | null;
  Capacity?: number | null;
  FreeSpace?: number | null;
  UsedSpace?: number | null;
}

export interface InstanceDatabaseRow extends ApiRow {
  DatabaseID: number;
  name: string;
  state?: number | null;
  recovery_model?: number | null;
  LastGoodCheckDbTime?: string | null;
  IsActive?: boolean | null;
  is_primary_replica?: boolean | number | null;
  synchronization_state?: number | null;
  synchronization_health?: number | null;
  ag_name?: string | null;
}

export interface InstanceBackupRow extends ApiRow {
  DatabaseID: number;
  DatabaseName?: string | null;
  type?: string | null;
  backup_start_date?: string | null;
  backup_finish_date?: string | null;
  backup_size?: number | null;
  compressed_backup_size?: number | null;
}

export interface InstanceJobRow extends SearchJobRow {
  step_id?: number | null;
  run_status?: number | null;
  RunDateTime?: string | null;
  RunDurationSec?: number | null;
  message?: string | null;
}

export interface AvailabilityGroupSummaryRow extends ApiRow {
  group_id: string;
  InstanceID: number;
  name?: string | null;
  InstanceDisplayName?: string | null;
}

export interface InstanceHadrGroupRow extends ApiRow {
  group_id: string;
  name?: string | null;
  failure_condition_level?: number | null;
  health_check_timeout?: number | null;
  automated_backup_preference_desc?: string | null;
  basic_features?: boolean | number | null;
  dtc_support?: boolean | number | null;
  db_failover?: boolean | number | null;
  is_distributed?: boolean | number | null;
  cluster_type?: string | null;
  is_contained?: boolean | number | null;
}

export interface InstanceHadrReplicaRow extends ApiRow {
  group_id: string;
  replica_id: string;
  replica_server_name?: string | null;
  endpoint_url?: string | null;
  availability_mode_desc?: string | null;
  failover_mode_desc?: string | null;
  primary_role_allow_connections_desc?: string | null;
  secondary_role_allow_connections_desc?: string | null;
  backup_priority?: number | null;
  seeding_mode_desc?: string | null;
  session_timeout?: number | null;
  read_only_routing_url?: string | null;
}

export interface InstanceHadrDatabaseRow extends ApiRow {
  DatabaseID: number;
  group_id: string;
  replica_id: string;
  is_primary_replica?: boolean | number | null;
  synchronization_state_desc?: string | null;
  synchronization_health_desc?: string | null;
  is_suspended?: boolean | number | null;
  suspend_reason_desc?: string | null;
  database_state_desc?: string | null;
  secondary_lag_seconds?: number | null;
  log_send_queue_size?: number | null;
  log_send_rate?: number | null;
  redo_queue_size?: number | null;
  redo_rate?: number | null;
  last_sent_time?: string | null;
  last_received_time?: string | null;
  last_hardened_time?: string | null;
  last_redone_time?: string | null;
  DatabaseName?: string | null;
}

export interface InstanceHadrResponse {
  error?: string;
  ags: InstanceHadrGroupRow[];
  replicas: InstanceHadrReplicaRow[];
  databases: InstanceHadrDatabaseRow[];
}

export interface HadrOverviewGroupRow extends ApiRow {
  group_id: string;
  AGName?: string | null;
  InstanceID: number;
  InstanceName?: string | null;
  automated_backup_preference_desc?: string | null;
  basic_features?: boolean | number | null;
  db_failover?: boolean | number | null;
  is_distributed?: boolean | number | null;
  cluster_type?: string | null;
  ProductMajorVersion?: number | null;
  Edition?: string | null;
  cpu_count?: number | null;
  physical_memory_kb?: number | null;
  currentCPU?: number | null;
  systemIdle?: number | null;
}

export interface HadrOverviewResponse {
  error?: string;
  ags: HadrOverviewGroupRow[];
  replicas: InstanceHadrReplicaRow[];
  databases: InstanceHadrDatabaseRow[];
}

export interface DashboardPerformanceRow extends ApiRow {
  instanceID: number;
  instanceDisplayName: string;
  avgCPU: number;
  maxCPU: number;
  maxTotalCPU: number;
  criticalWaitMs: number;
  lockWaitMs: number;
  ioWaitMs: number;
  totalWaitMs: number;
  signalWaitPct: number;
  latchWaitMs: number;
  readLatency: number;
  writeLatency: number;
  mBsec: number;
  iOPs: number;
}

export interface DashboardPerformanceResponse {
  data: DashboardPerformanceRow[];
  note: string;
}

export interface DashboardMonitorInstance {
  instanceId: number;
  instanceName: string;
  edition?: string | null;
  productVersion?: string | null;
  cpuCount?: number | null;
  memoryKb?: number | null;
  startTime?: string | null;
  isOnline: boolean;
  sqlCpu: number;
  sysCpu: number;
  waitMs: number;
  diskIOKB: number;
  agName?: string | null;
  agRole?: string | null;
  status: number;
  activeAlerts: string[];
}

export interface DashboardMonitorResponse {
  instances: DashboardMonitorInstance[];
  alertCounts: Record<string, number>;
  recentErrors: ApiRow[];
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

export interface EstateBackupRow extends ApiRow {
  instanceID: number;
  instanceDisplayName?: string | null;
  databaseID?: number | null;
  databaseName?: string | null;
  fullBackupDate?: string | null;
  fullBackupSize?: number | null;
  diffBackupDate?: string | null;
  logBackupDate?: string | null;
}

export interface EstateDriveRow extends ApiRow {
  DriveID?: number | null;
  InstanceID?: number | null;
  Name?: string | null;
  Label?: string | null;
  Capacity?: number | null;
  FreeSpace?: number | null;
  UsedSpace?: number | null;
  IsActive?: boolean | number | null;
  InstanceDisplayName?: string | null;
}

export interface DriveGrowthPoint {
  driveID: number;
  dataPoints: number;
  oldestSnapshotDate: string | null;
  oldestFreeSpace: number | null;
  latestSnapshotDate: string | null;
  latestFreeSpace: number | null;
  latestCapacity: number | null;
}

export interface LicenseReportRow extends ApiRow {
  InstanceID: number;
  InstanceName?: string | null;
  Edition?: string | null;
  ProductVersion?: string | null;
  ProductMajorVersion?: number | null;
  cpu_count?: number | null;
  cores_per_socket?: number | null;
  socket_count?: number | null;
  physical_memory_kb?: number | null;
  sqlserver_start_time?: string | null;
  LicenseType?: string | null;
}

export interface UnderutilizedReportRow extends ApiRow {
  InstanceID: number;
  InstanceName?: string | null;
  Edition?: string | null;
  ProductVersion?: string | null;
  cpu_count?: number | null;
  socket_count?: number | null;
  cores_per_socket?: number | null;
  physical_memory_kb?: number | null;
  AvgCPU?: number | null;
  MaxCPU?: number | null;
}

export interface FleetStatsRow extends ApiRow {
  InstanceID: number;
  InstanceName?: string | null;
  Edition?: string | null;
  ProductVersion?: string | null;
  cpu_count?: number | null;
  physical_memory_kb?: number | null;
  AvgCPU24h?: number | null;
  MaxCPU24h?: number | null;
  TotalCapacity?: number | null;
  TotalFree?: number | null;
  TotalUsed?: number | null;
}

export interface BackupManagementBackupRow extends ApiRow {
  instanceId: number;
  instanceName?: string | null;
  edition?: string | null;
  databaseId?: number | null;
  databaseName?: string | null;
  type?: string | null;
  backupStartDate?: string | null;
  backupFinishDate?: string | null;
  backupSize?: number | null;
  compressedBackupSize?: number | null;
  backupDurationSec?: number | null;
}

export interface BackupManagementCpuRow extends ApiRow {
  instanceId: number;
  avgCpu24h: number;
}

export interface BackupManagementStats extends ApiRow {
  backupCount24h: number;
  totalSize24h: number;
  avgDurationSec24h: number;
}

export interface BackupManagementResponse {
  error?: string;
  backups: BackupManagementBackupRow[];
  cpuByInstance: BackupManagementCpuRow[];
  stats: BackupManagementStats;
}

export interface BackupAmpelInstanceRow extends ApiRow {
  InstanceID: number;
  InstanceName?: string | null;
  Edition?: string | null;
  ProductVersion?: string | null;
  DatabaseCount?: number | null;
  LastFullBackup?: string | null;
  LastLogBackup?: string | null;
  NewestFullBackup?: string | null;
  NewestLogBackup?: string | null;
  BackupVolumeGB24h?: number | null;
  BackedUpDBs24h?: number | null;
  DbsWithOldFullBackup?: number | null;
  DbsWithOldLogBackup?: number | null;
  AvgLogIntervalMin?: number | null;
  MaxLogIntervalMin?: number | null;
}

export interface BackupAmpelDatabaseRow extends ApiRow {
  InstanceID: number;
  DatabaseID: number;
  DatabaseName?: string | null;
  RecoveryModel?: string | null;
  CompatLevel?: number | null;
  IsEncrypted?: boolean | number | null;
  IsPrimaryReplica?: boolean | number | null;
  AGName?: string | null;
  LastFullDate?: string | null;
  FullBackupSize?: number | null;
  LastDiffDate?: string | null;
  LastLogDate?: string | null;
}

export interface BackupAmpelResponse {
  error?: string;
  instances: BackupAmpelInstanceRow[];
  databases: BackupAmpelDatabaseRow[];
}

export interface LocalUser {
  id: string;
  username: string;
  displayName?: string | null;
  role: AuthRole;
  active: boolean;
  createdAtUtc: string;
  lastLoginAtUtc?: string | null;
  allowedTags?: string[];
  allowedGroupIds?: number[];
}

export interface CreateLocalUserRequest {
  username: string;
  displayName?: string | null;
  password: string;
  role: AuthRole;
  active?: boolean;
  allowedTags?: string[];
  allowedGroupIds?: number[];
}

export interface UpdateLocalUserRequest {
  displayName?: string | null;
  role: AuthRole;
  active: boolean;
  password?: string;
  allowedTags?: string[];
  allowedGroupIds?: number[];
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

export interface ApiDataResponse<T> {
  data: T[];
  note: string;
}

export interface JobTimelineRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string | null;
  job_name?: string | null;
  step_id?: number | null;
  step_name?: string | null;
  run_status?: number | null;
  RunDateTime?: string | null;
  RunDurationSec?: number | null;
  EndDateTime?: string | null;
}

export interface MonitoringConfigurationRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string | null;
  name?: string | null;
  value?: string | number | boolean | null;
  value_in_use?: string | number | boolean | null;
  minimum?: string | number | null;
  maximum?: string | number | null;
  is_dynamic?: boolean | number | null;
  is_advanced?: boolean | number | null;
  ValidFrom?: string | null;
}

export interface MonitoringConfigurationChangeRow extends ApiRow {
  name?: string | null;
  old_value?: string | number | boolean | null;
  new_value?: string | number | boolean | null;
  ChangeDate?: string | null;
}

export interface QueryAnalysisRow extends ApiRow {
  query_hash: string;
  TotalCPU?: number | null;
  TotalIO?: number | null;
  Executions?: number | null;
  AvgDurationMs?: number | null;
  QueryText?: string | null;
}

export interface RunningQueryRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string | null;
  session_id?: number | null;
  start_time?: string | null;
  status?: string | null;
  command?: string | null;
  wait_type?: string | null;
  wait_resource?: string | null;
  blocking_session_id?: number | null;
  cpu_time?: number | null;
  reads?: number | null;
  writes?: number | null;
  logical_reads?: number | null;
  SnapshotDate?: string | null;
  database_id?: number | null;
  database_name?: string | null;
  login_name?: string | null;
  host_name?: string | null;
  program_name?: string | null;
  query_text?: string | null;
}

export interface SlowQueryRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string | null;
  object_name?: string | null;
  DatabaseID?: number | null;
  database_name?: string | null;
  query_text?: string | null;
  duration_ms?: number | null;
  cpu_time_ms?: number | null;
  logical_reads?: number | null;
  physical_reads?: number | null;
  writes?: number | null;
  SnapshotDate?: string | null;
  client_hostname?: string | null;
  client_app_name?: string | null;
  username?: string | null;
}

export interface MemoryClerkRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string | null;
  clerk_type?: string | null;
  clerk_name?: string | null;
  pages_kb?: number | null;
  SnapshotDate?: string | null;
}

export interface MemoryCounterRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string | null;
  counter_name?: string | null;
  cntr_value?: number | null;
  SnapshotDate?: string | null;
}

export interface MemoryResponse {
  clerks: MemoryClerkRow[];
  counters: MemoryCounterRow[];
  clerkNote: string;
  counterNote: string;
}

export interface PerformanceFileStatRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string | null;
  database_name?: string | null;
  file_name?: string | null;
  io_stall_read_ms?: number | null;
  io_stall_write_ms?: number | null;
  num_of_reads?: number | null;
  num_of_writes?: number | null;
  num_of_bytes_read?: number | null;
  num_of_bytes_written?: number | null;
  SnapshotDate?: string | null;
}

export interface PerformanceIOResponse {
  fileStats: PerformanceFileStatRow[];
  drivePerf: ApiRow[];
  fileNote: string;
  driveNote: string;
}

export interface ExecStatsRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string | null;
  object_name?: string | null;
  SchemaName?: string | null;
  execution_count?: number | null;
  total_worker_time?: number | null;
  total_elapsed_time?: number | null;
  total_logical_reads?: number | null;
  total_logical_writes?: number | null;
  total_physical_reads?: number | null;
  SnapshotDate?: string | null;
}

export interface WaitTimelineRow extends ApiRow {
  InstanceID: number;
  SnapshotDate?: string | null;
  WaitType?: string | null;
  wait_time_ms?: number | null;
  waiting_tasks_count?: number | null;
  signal_wait_time_ms?: number | null;
}

export interface PerformanceCounterRow extends ApiRow {
  InstanceID: number;
  InstanceDisplayName?: string | null;
  object_name?: string | null;
  counter_name?: string | null;
  instance_name?: string | null;
  cntr_value?: number | null;
  SnapshotDate?: string | null;
}

export interface PatchingRow extends ApiRow {
  instanceId: number;
  instanceName?: string | null;
  productVersion?: string | null;
  productMajorVersion?: number | null;
  edition?: string | null;
}

export interface QueryStoreRow extends ApiRow {
  objectName?: string | null;
  querySqlText?: string | null;
  avgCpuTime?: number | null;
  avgDuration?: number | null;
  countExecutions?: number | null;
  avgLogicalIoReads?: number | null;
}

export interface SchemaChangeRow extends ApiRow {
  databaseId?: number | null;
  objectName?: string | null;
  schemaName?: string | null;
  objectType?: string | null;
  objectDateCreated?: string | null;
  objectDateModified?: string | null;
  eventDate?: string | null;
  snapshotValidFrom?: string | null;
  ddlEvent?: string | null;
  loginName?: string | null;
  ddlText?: string | null;
}

export interface IdentityColumnRow extends ApiRow {
  instanceId?: number | null;
  databaseName?: string | null;
  schemaName?: string | null;
  tableName?: string | null;
  columnName?: string | null;
  seedValue?: number | null;
  incrementValue?: number | null;
  lastValue?: number | null;
  maxValue?: number | null;
  percentUsed?: number | null;
}

export interface TempDbFileRow extends ApiRow {
  fileId?: number | null;
  name?: string | null;
  sizeKb?: number | null;
  usedKb?: number | null;
}

export interface DbSpaceRow extends ApiRow {
  databaseName?: string | null;
  fileName?: string | null;
  typeDesc?: string | null;
  sizeKb?: number | null;
  usedKb?: number | null;
  growth?: number | null;
  isPercentGrowth?: boolean | number | null;
}

// DBA Dash's real alert lifecycle (Alert.ActiveAlerts / Alert.ClosedAlerts),
// as opposed to the synthetic collection-error/failed-job feed on /api/alerts/recent.
export interface ActiveAlertRow extends ApiRow {
  alertID: number;
  instanceID: number;
  instanceDisplayName?: string | null;
  priority: number;
  priorityDescription?: string | null;
  alertType?: string | null;
  alertKey?: string | null;
  firstMessage?: string | null;
  lastMessage?: string | null;
  triggerDate?: string | null;
  alertDuration?: string | null;
  updatedDate?: string | null;
  timeSinceLastUpdate?: string | null;
  updateCount?: number | null;
  isAcknowledged: boolean;
  isResolved: boolean;
  resolvedDate?: string | null;
  isBlackout: boolean;
  alertStatus?: number | null;
  notes?: string | null;
  groupName?: string | null;
  ruleNotes?: string | null;
}

export interface ClosedAlertRow extends ApiRow {
  alertID: number;
  instanceID: number;
  instanceDisplayName?: string | null;
  priority: number;
  priorityDescription?: string | null;
  alertType?: string | null;
  alertKey?: string | null;
  firstMessage?: string | null;
  lastMessage?: string | null;
  triggerDate?: string | null;
  alertDuration?: string | null;
  isAcknowledged: boolean;
  isResolved: boolean;
  resolvedDate?: string | null;
  notes?: string | null;
  closedDate?: string | null;
  groupName?: string | null;
  ruleNotes?: string | null;
}

export interface AlertLifecycleResponse<T> {
  supported: boolean;
  /**
   * Whether the deployment opted into alert writes. Read access does not imply
   * write access: the procedures need EXECUTE grants a db_datareader install
   * will not have, so the UI hides the actions rather than offering buttons
   * that can only fail.
   */
  canWrite?: boolean;
  error?: string;
  data: T[];
}

export interface AcknowledgeAlertsRequest {
  alertIds: number[];
  isAcknowledged: boolean;
}

export interface CloseAlertsRequest {
  alertIds: number[];
}

export interface UpdateAlertNotesRequest {
  notes?: string;
}

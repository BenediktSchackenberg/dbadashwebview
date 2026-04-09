/**
 * Maps DBADashGUI Main.Tabs / major WinForms surfaces to WebView routes and parity SPs.
 * WinForms has many charts and pickers per tab; here we map the tab/workspace itself.
 */
export type WinFormsScreenRow = {
  /** Main.Tabs enum name (or logical WinForms area). */
  tab: string;
  /** Human label (WinForms tab text or close equivalent). */
  label: string;
  /** Navigation group for the map UI. */
  area: string;
  /** First-class web route when we have a dedicated page (may still be a simplified view vs WinForms). */
  webPath: string | null;
  webLabel: string | null;
  /** Allow-listed dbo.* for /windows-parity deep link when no dedicated page or for drill-down. */
  parityProcedure: string | null;
  notes: string | null;
};

export const WINFORMS_SCREEN_MAP: WinFormsScreenRow[] = [
  { tab: 'Performance', label: 'Performance', area: 'Root tabs', webPath: '/performance/cpu', webLabel: 'CPU (performance)', parityProcedure: 'dbo.PerformanceSummary_Get', notes: 'WinForms hosts PerformanceReport in a tab.' },
  { tab: 'PerformanceSummary', label: 'Performance summary', area: 'Performance', webPath: '/', webLabel: 'Dashboard', parityProcedure: 'dbo.PerformanceSummary_Get', notes: 'Summary strip + dashboard cards.' },
  { tab: 'ObjectExecutionSummary', label: 'Object execution summary', area: 'Performance', webPath: '/performance/exec-stats', webLabel: 'Exec stats', parityProcedure: 'dbo.ObjectExecutionStatsSummary_Get', notes: null },
  { tab: 'RunningQueries', label: 'Running queries', area: 'Performance', webPath: '/performance/running-queries', webLabel: 'Running queries', parityProcedure: 'dbo.RunningQueriesSummary_Get', notes: 'Live grid + snapshot tab in web.' },
  { tab: 'Metrics', label: 'Metrics', area: 'Performance', webPath: '/performance/counters', webLabel: 'Performance counters', parityProcedure: 'dbo.PerformanceCounterSummary_Get', notes: 'WinForms saved metrics / counter picker.' },
  { tab: 'SlowQueries', label: 'Slow queries', area: 'Performance', webPath: '/performance/slow-queries', webLabel: 'Slow queries', parityProcedure: 'dbo.SlowQueriesSummary_Get', notes: null },
  { tab: 'Waits', label: 'Waits', area: 'Performance', webPath: '/performance/waits-timeline', webLabel: 'Waits timeline', parityProcedure: 'dbo.WaitsSummary_Get', notes: 'Day/hour TVPs in parity when needed.' },
  { tab: 'Memory', label: 'Memory', area: 'Performance', webPath: '/performance/memory', webLabel: 'Memory', parityProcedure: 'dbo.MemoryUsage_Get', notes: null },
  { tab: 'Backups', label: 'Backups', area: 'Backups', webPath: '/estate/backups', webLabel: 'Estate backups', parityProcedure: 'dbo.BackupSummary_Get', notes: 'Instance backups under instance → Backups.' },
  { tab: 'LogShipping', label: 'Log shipping', area: 'HA/DR', webPath: '/monitoring/log-shipping', webLabel: 'Log shipping', parityProcedure: 'dbo.LogShippingSummary_Get', notes: 'Estate: /estate/log-shipping.' },
  { tab: 'Drives', label: 'Drives', area: 'Storage', webPath: '/drives', webLabel: 'Drives (estate)', parityProcedure: 'dbo.Drives_Get', notes: 'Per instance: instance → Storage.' },
  { tab: 'Jobs', label: 'Jobs', area: 'Agent', webPath: '/jobs', webLabel: 'Jobs (recent)', parityProcedure: 'dbo.Jobs_Get', notes: 'Job timeline under instance / monitoring.' },
  { tab: 'DBADashErrorLog', label: 'DBA Dash error log', area: 'Checks', webPath: '/monitoring/collection-health', webLabel: 'Collection health', parityProcedure: 'dbo.CollectionErrorLog_Get', notes: null },
  { tab: 'AG', label: 'Always On / AG', area: 'HA/DR', webPath: '/availability-groups', webLabel: 'AG overview', parityProcedure: 'dbo.AvailabilityGroupSummary_Get', notes: null },
  { tab: 'LastGood', label: 'Last good CHECKDB', area: 'Checks', webPath: '/monitoring/corruption-checkdb', webLabel: 'Corruption / CHECKDB', parityProcedure: 'dbo.LastGoodCheckDB_Get', notes: null },
  { tab: 'CollectionDates', label: 'Collection dates', area: 'Checks', webPath: '/monitoring/collection-health', webLabel: 'Collection health', parityProcedure: 'dbo.CollectionDates_Get', notes: null },
  { tab: 'SQLAgentAlerts', label: 'SQL Agent alerts', area: 'Alerts', webPath: '/settings/alerts', webLabel: 'Alert settings', parityProcedure: 'dbo.AlertsConfig_Get', notes: 'Active alerts: /alerts.' },
  { tab: 'Files', label: 'Database files', area: 'Storage', webPath: null, webLabel: null, parityProcedure: 'dbo.DBFiles_Get', notes: 'Open instance → database → detail; parity needs @DatabaseID.' },
  { tab: 'CustomChecks', label: 'Custom checks', area: 'Checks', webPath: null, webLabel: null, parityProcedure: 'dbo.CustomCheck_Get', notes: 'Custom checks on summary / instance drill-down in WinForms.' },
  { tab: 'Mirroring', label: 'Database mirroring', area: 'HA/DR', webPath: '/monitoring/database-mirroring', webLabel: 'DB mirroring', parityProcedure: 'dbo.DatabaseMirroringSummary_Get', notes: 'Estate: /estate/database-mirroring.' },
  { tab: 'AzureSummary', label: 'Azure summary', area: 'Azure', webPath: '/monitor', webLabel: 'SQL Monitor', parityProcedure: 'dbo.AzureDBPerformanceSummary_Get', notes: null },
  { tab: 'QS', label: 'Query Store', area: 'Performance', webPath: '/performance/query-store', webLabel: 'Query Store', parityProcedure: 'dbo.DatabaseQueryStoreOptionsSummary_Get', notes: null },
  { tab: 'IdentityColumns', label: 'Identity columns', area: 'Checks', webPath: '/monitoring/identity-columns', webLabel: 'Identity columns', parityProcedure: null, notes: 'Uses monitoring API in web.' },
  { tab: 'DBOptions', label: 'Database options', area: 'Databases', webPath: null, webLabel: null, parityProcedure: 'dbo.DBSummary_Get', notes: 'Database detail page for options slice.' },
  { tab: 'OfflineInstances', label: 'Offline instances', area: 'Summary', webPath: null, webLabel: null, parityProcedure: 'dbo.OfflineInstanceTimeline_Get', notes: 'Pass @InstanceID; estate summary on dashboard.' },
  { tab: 'DBSpace', label: 'DB space', area: 'Storage', webPath: '/monitoring/db-space', webLabel: 'DB space', parityProcedure: 'dbo.DBSpace_Get', notes: null },
  { tab: 'SnapshotSummary', label: 'DDL snapshot summary', area: 'DDL', webPath: '/monitoring/schema-changes', webLabel: 'Schema changes', parityProcedure: 'dbo.DDLSnapshotInstanceSummary_Get', notes: 'Full snapshot diff UI is parity / future work.' },
  { tab: 'DBConfiguration', label: 'Database configuration', area: 'Configuration', webPath: '/monitoring/configuration', webLabel: 'Configuration', parityProcedure: 'dbo.DBConfiguration_Get', notes: null },
  { tab: 'TopQueries', label: 'Top queries', area: 'Performance', webPath: '/queries', webLabel: 'Queries', parityProcedure: 'dbo.SlowQueriesDetail_Get', notes: null },
  { tab: 'QueryStoreForcedPlans', label: 'Query Store forced plans', area: 'Performance', webPath: '/performance/query-store', webLabel: 'Query Store', parityProcedure: 'dbo.PlanForcingLog_Get', notes: null },
  { tab: 'InstanceMetadata', label: 'Instance metadata', area: 'Configuration', webPath: null, webLabel: null, parityProcedure: 'dbo.InstanceInfo_Get', notes: 'Instance detail header + parity.' },
  { tab: 'Alerts', label: 'DBA Dash alerts', area: 'Alerts', webPath: '/alerts', webLabel: 'Alerts', parityProcedure: 'dbo.Alerts_Get', notes: 'Root “Alerts” tab in WinForms.' },
  { tab: 'RunningJobs', label: 'Running jobs', area: 'Agent', webPath: '/jobs', webLabel: 'Jobs', parityProcedure: 'dbo.RunningJobs_Get', notes: null },
  { tab: 'JobTimeline', label: 'Job timeline', area: 'Agent', webPath: '/monitoring/job-timeline', webLabel: 'Job timeline', parityProcedure: 'dbo.JobTimeline_Get', notes: null },
  { tab: 'JobStats', label: 'Job stats', area: 'Agent', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: 'dbo.JobStatsSummary_Get', notes: null },
  { tab: 'Configuration', label: 'Server configuration', area: 'Configuration', webPath: '/monitoring/configuration', webLabel: 'Configuration', parityProcedure: 'dbo.Configuration_Get', notes: null },
  { tab: 'TraceFlags', label: 'Trace flags', area: 'Configuration', webPath: '/monitoring/configuration', webLabel: 'Configuration', parityProcedure: 'dbo.TraceFlags_Get', notes: 'Dedicated trace UI may be parity-only.' },
  { tab: 'Hardware', label: 'Hardware', area: 'Configuration', webPath: '/monitoring/configuration', webLabel: 'Configuration', parityProcedure: 'dbo.Hardware_Get', notes: null },
  { tab: 'SQLPatching', label: 'SQL patching', area: 'Configuration', webPath: '/monitoring/patching', webLabel: 'Patching', parityProcedure: 'dbo.SQLPatching_Get', notes: null },
  { tab: 'Drivers', label: 'Drivers', area: 'Configuration', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: 'dbo.Drivers_Get', notes: null },
  { tab: 'TempDB', label: 'TempDB', area: 'Storage', webPath: '/monitoring/tempdb', webLabel: 'TempDB', parityProcedure: 'dbo.TempDBConfig_Get', notes: null },
  { tab: 'ResourceGovernor', label: 'Resource Governor', area: 'Performance', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: 'dbo.ResourceGovernorConfiguration_Get', notes: 'Pools / groups metrics via parity catalog.' },
  { tab: 'ServerServices', label: 'Server services', area: 'Custom reports', webPath: '/tools/custom-reports', webLabel: 'Custom reports', parityProcedure: null, notes: 'WinForms custom report; run UserReport via gated API if enabled.' },
  { tab: 'AzureServiceObjectives', label: 'Azure service objectives', area: 'Azure', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: 'dbo.AzureDBPoolSummary_Get', notes: null },
  { tab: 'AzureDBResourceGovernance', label: 'Azure DB resource governance', area: 'Azure', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: 'dbo.AzureDBResourceGovernance_Get', notes: null },
  { tab: 'Tags', label: 'Tags', area: 'Tags', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: 'dbo.TagReport_Get', notes: 'Tag picker UX not recreated; data via parity.' },
  { tab: 'TableSize', label: 'Table size', area: 'Storage', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: null, notes: 'WinForms DBFiles/TableSize; use parity or future table-size SP if added.' },
  { tab: 'TuningRecommendations', label: 'Tuning recommendations', area: 'Community', webPath: '/tools/community', webLabel: 'Community tools', parityProcedure: null, notes: 'Embedded script via messaging in WinForms.' },
  { tab: 'PoolsAndGroups', label: 'Resource Governor pools & groups', area: 'Performance', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: 'dbo.ResourceGovernorResourcePools_Get', notes: 'WinForms RG performance tab.' },
  { tab: 'CommunityTools', label: 'Community tools (sp_Blitz, …)', area: 'Community', webPath: '/tools/community', webLabel: 'Community tools', parityProcedure: null, notes: 'Each script is a WinForms tab; web lists + messaging run.' },
  { tab: 'CustomReports', label: 'Custom reports (UserReport)', area: 'Custom reports', webPath: '/tools/custom-reports', webLabel: 'Custom reports', parityProcedure: 'dbo.CustomReport_Get', notes: null },
  { tab: 'CustomTools', label: 'Custom tools (allowed procs)', area: 'Community', webPath: '/tools/community', webLabel: 'Community tools', parityProcedure: 'dbo.CustomTools_Get', notes: null },
  { tab: 'SchemaCompare', label: 'Schema compare / Diff', area: 'DDL', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: 'dbo.DatabaseDDLCompare_Get', notes: 'WinForms DiffControl not recreated; SP-backed compare via parity.' },
  { tab: 'RecycleBin', label: 'Recycle bin (deleted instances)', area: 'Admin', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: null, notes: 'Admin-only in WinForms; no dedicated web page yet.' },
  { tab: 'DBADashAlertsConfig', label: 'DBA Dash alert rules', area: 'Alerts', webPath: '/settings/alerts', webLabel: 'Alert settings', parityProcedure: null, notes: 'Rule editor UX simplified in web settings.' },
  { tab: 'ManageInstances', label: 'Manage instances', area: 'Admin', webPath: '/settings/servers', webLabel: 'Servers', parityProcedure: null, notes: null },
  { tab: 'DataRetention', label: 'Data retention', area: 'Admin', webPath: '/settings/retention', webLabel: 'Retention', parityProcedure: 'dbo.DataRetention_Get', notes: null },
  { tab: 'RepoSettings', label: 'Repository settings', area: 'Admin', webPath: '/settings/servers', webLabel: 'Servers', parityProcedure: null, notes: 'WinForms repo options partially mirrored.' },
  { tab: 'JobInfo', label: 'Job info', area: 'Agent', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: 'dbo.JobStep_Get', notes: 'Needs JobID/StepID parameters.' },
  { tab: 'OSLoadedModules', label: 'OS loaded modules', area: 'Checks', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: 'dbo.OSLoadedModules_Get', notes: 'Threshold/status screens via parity catalog.' },
  { tab: 'Corruption', label: 'Corruption', area: 'Checks', webPath: '/monitoring/corruption-checkdb', webLabel: 'Corruption / CHECKDB', parityProcedure: 'dbo.Corruption_Get', notes: null },
  { tab: 'Thresholds', label: 'Thresholds (CPU, etc.)', area: 'Settings', webPath: '/settings/thresholds', webLabel: 'Thresholds', parityProcedure: 'dbo.InstanceUptimeThresholds_Get', notes: 'Various threshold SPs in parity catalog.' },
  { tab: 'WindowsParity', label: 'All other dbo.* grids', area: 'Parity', webPath: '/windows-parity', webLabel: 'Windows parity', parityProcedure: null, notes: 'Full allow-listed SP catalog + mutating SPs when enabled.' },
];

export const WINFORMS_AREAS = [...new Set(WINFORMS_SCREEN_MAP.map((r) => r.area))].sort();

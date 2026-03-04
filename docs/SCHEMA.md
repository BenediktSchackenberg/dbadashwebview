# DBA Dash Database Schema — Key Tables & Relationships

## Core Entity: `dbo.Instances`
Central table — every other table references `InstanceID`.

| Column | Type | Notes |
|--------|------|-------|
| InstanceID | INT (PK, Identity) | Central FK target |
| Instance | sysname | SQL Server instance name |
| ConnectionID | sysname | Unique connection identifier |
| IsActive | BIT | Active/inactive instance |
| Edition | NVARCHAR(128) | SQL Server edition |
| ProductVersion | NVARCHAR(128) | Version string |
| ProductMajorVersion | INT | Major version number |
| cpu_count | INT | Logical CPUs |
| physical_memory_kb | BIGINT | Physical RAM |
| sqlserver_start_time | DATETIME | Last restart |
| Alias | NVARCHAR(128) | Display alias |
| InstanceDisplayName | Computed | ISNULL(Alias, ConnectionID) |
| ShowInSummary | BIT | Show in main dashboard |

## `dbo.Summary` (Cached View — call `Summary_Get` SP)
Pre-computed health status per instance. Statuses: 1=OK/Green, 2=Warning/Yellow, 4=Critical/Red, 3=N/A.

Key status columns:
- FullBackupStatus, LogBackupStatus, DiffBackupStatus
- DriveStatus, FileFreeSpaceStatus, LogFreeSpaceStatus
- JobStatus, AGStatus, CorruptionStatus
- CollectionErrorStatus, SnapshotAgeStatus
- LastGoodCheckDBStatus, UptimeStatus
- AlertStatus, CustomCheckStatus, MirroringStatus
- IdentityStatus, DatabaseStateStatus

## `dbo.CPU` (1-min intervals, partitioned by EventTime)
| Column | Type |
|--------|------|
| InstanceID | INT (FK) |
| EventTime | DATETIME2(3) |
| SQLProcessCPU | TINYINT (0-100) |
| SystemIdleCPU | TINYINT |
| OtherCPU | Computed (100 - SQL - Idle) |
| TotalCPU | Computed (100 - Idle) |

Also: `dbo.CPU_60MIN` for hourly aggregates.

## `dbo.Waits` (1-min intervals, partitioned)
| Column | Type |
|--------|------|
| InstanceID | INT (FK) |
| SnapshotDate | DATETIME2(2) |
| WaitTypeID | SMALLINT (FK → WaitType) |
| waiting_tasks_count | BIGINT |
| wait_time_ms | BIGINT |
| signal_wait_time_ms | BIGINT |

## `dbo.Backups`
| Column | Type |
|--------|------|
| DatabaseID | INT (FK → Databases) |
| type | CHAR(1) — D=Full, I=Diff, L=Log |
| backup_start_date | DATETIME2(3) |
| backup_finish_date | DATETIME2(3) |
| backup_size | DECIMAL(20,0) |
| compressed_backup_size | DECIMAL(20,0) |

## `dbo.Databases`
| Column | Type |
|--------|------|
| DatabaseID | INT (PK, Identity) |
| InstanceID | INT (FK) |
| name | sysname |
| state | TINYINT (0=ONLINE, 1=RESTORING, etc.) |
| recovery_model | TINYINT |
| LastGoodCheckDbTime | DATETIME2(3) |
| IsActive | BIT |

## `dbo.Drives`
| Column | Type |
|--------|------|
| DriveID | INT (PK) |
| InstanceID | INT (FK) |
| Name | NVARCHAR(256) — mount point |
| Capacity | BIGINT (bytes) |
| FreeSpace | BIGINT (bytes) |
| UsedSpace | Computed |
| Label | NVARCHAR(256) |

Also: `dbo.DriveSnapshot` for historical drive data.

## `dbo.JobHistory`
| Column | Type |
|--------|------|
| InstanceID | INT (FK) |
| job_id | UNIQUEIDENTIFIER |
| step_id | INT |
| step_name | NVARCHAR(128) |
| run_status | INT (0=Failed, 1=Succeeded, 2=Retry, 3=Canceled) |
| RunDateTime | DATETIME2(2) |
| RunDurationSec | INT |
| message | NVARCHAR(4000) |
| FinishDateTime | Computed |

Related: `dbo.Jobs` (job_id → job name mapping)

## `dbo.CollectionDates`
Tracks last successful collection per type per instance.
- InstanceID, Reference (e.g. 'CPU', 'Backups'), SnapshotDate

## Key Stored Procedures (Read-Only, for our API)
| SP | Purpose |
|----|---------|
| `Summary_Get` | Main dashboard — all instance health statuses |
| `Backups_Get` | Backup details per instance |
| `BackupSummary_Get` | Backup overview |
| `AgentJobs_Get` | Agent job listing with status |
| `CPU_Get` | CPU history for charting |
| `Waits_Get` | Wait stats over time |
| `AvailabilityGroupSummary_Get` | AG health |
| `Alerts_Get` | Recent alerts |

## Relationships
```
Instances (InstanceID)
  ├── CPU (InstanceID)
  ├── Waits (InstanceID)
  ├── Drives (InstanceID)
  ├── JobHistory (InstanceID)
  ├── CollectionDates (InstanceID)
  ├── Databases (InstanceID)
  │     └── Backups (DatabaseID)
  └── Summary (InstanceID, cached)
```

## Status Codes (used in Summary)
- 1 = OK / Healthy (🟢)
- 2 = Warning (🟡)  
- 3 = N/A (⚪)
- 4 = Critical (🔴)

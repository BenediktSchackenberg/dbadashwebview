-- Performance indexes contributed by @edwillis777
-- These indexes significantly improve query performance on the DBADash database.
-- Run these against your DBADash repository database (not the monitored SQL Server instances).
-- All indexes are created with IF NOT EXISTS guards and ONLINE=ON so they can be applied without downtime.

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IX_RunningQueries_blocking_session_id_SnapshotDateUTC') 
BEGIN
	CREATE NONCLUSTERED INDEX [IX_RunningQueries_blocking_session_id_SnapshotDateUTC]
	ON [dbo].[RunningQueries] (blocking_session_id,SnapshotDateUTC)
	WITH (ONLINE=ON, SORT_IN_TEMPDB=ON, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, PAD_INDEX=ON, FILLFACTOR=90, DATA_COMPRESSION=PAGE) 
	ON [PRIMARY]
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IX_DBIOStats_FileID_SnapshotDate') 
BEGIN
	CREATE NONCLUSTERED INDEX [IX_DBIOStats_FileID_SnapshotDate]
	ON [dbo].[DBIOStats] ([FileID],[SnapshotDate])
	INCLUDE ([num_of_reads],[num_of_writes],[num_of_bytes_read],[num_of_bytes_written],[io_stall_read_ms],[io_stall_write_ms])
	WITH (ONLINE=ON, SORT_IN_TEMPDB=ON, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, PAD_INDEX=ON, FILLFACTOR=90, DATA_COMPRESSION=PAGE) 
	ON [PRIMARY]
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IX_CPU_EventTime') 
BEGIN
	CREATE NONCLUSTERED INDEX [IX_CPU_EventTime]
	ON [dbo].[CPU] ([EventTime])
	INCLUDE ([SQLProcessCPU],[TotalCPU])
	WITH (ONLINE=ON, SORT_IN_TEMPDB=ON, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, PAD_INDEX=ON, FILLFACTOR=90, DATA_COMPRESSION=PAGE) 
	ON [PRIMARY]
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IX_DBIOStats_SnapshotDate') 
BEGIN
	CREATE NONCLUSTERED INDEX [IX_DBIOStats_SnapshotDate]
	ON [dbo].[DBIOStats] ([SnapshotDate])
	INCLUDE ([InstanceID], [MaxReadLatency], [MaxWriteLatency], [MaxMBsec], [MaxIOPs])
	WITH (ONLINE=ON, SORT_IN_TEMPDB=ON, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, PAD_INDEX=ON, FILLFACTOR=90, DATA_COMPRESSION=PAGE) 
	ON [PRIMARY]
END

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = 'IX_ObjectExecutionStats_InstanceID_SnapshotDate') 
BEGIN
	CREATE NONCLUSTERED INDEX [IX_ObjectExecutionStats_InstanceID_SnapshotDate]
	ON [dbo].[ObjectExecutionStats] ([InstanceID],[SnapshotDate])
	INCLUDE ([total_worker_time],[total_elapsed_time],[total_logical_reads],[total_logical_writes],[total_physical_reads],[execution_count])
	WITH (ONLINE=ON, SORT_IN_TEMPDB=ON, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, PAD_INDEX=ON, FILLFACTOR=90, DATA_COMPRESSION=PAGE) 
	ON [PRIMARY]
END

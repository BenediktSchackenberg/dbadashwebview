using System.Data;
using DBADashWebView.Data;
using Microsoft.Data.SqlClient;

namespace DBADashWebView.Endpoints;

public static class PerformanceEndpointMappings
{
    public static IEndpointRouteBuilder MapPerformanceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/instances/{id:int}/queries", async (int id, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            _ = id;
            try
            {
                var data = await sql.QueryAsync("""
                    SELECT TOP 50 qs.query_hash,
                           qs.total_worker_time AS TotalCPU,
                           qs.total_logical_reads + qs.total_logical_writes AS TotalIO,
                           qs.execution_count AS Executions,
                           CASE WHEN qs.execution_count > 0
                                THEN qs.total_elapsed_time / qs.execution_count / 1000
                                ELSE 0 END AS AvgDurationMs,
                           SUBSTRING(st.text, 1, 4000) AS QueryText
                    FROM sys.dm_exec_query_stats qs
                    CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
                    ORDER BY qs.total_worker_time DESC
                    """, cancellationToken);
                return Results.Ok(data);
            }
            catch
            {
                return Results.Ok(Array.Empty<object>());
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/running-queries", async (int? instanceId, SqlDataService sql, ILogger<Program> logger, CancellationToken cancellationToken) =>
        {
            try
            {
                var filter = instanceId.HasValue ? "AND rq.InstanceID = @instanceId" : string.Empty;
                var query = $"""
                    SELECT TOP 200 rq.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           rq.session_id,
                           rq.start_time_utc AS start_time,
                           rq.status,
                           rq.command,
                           rq.wait_type,
                           rq.wait_resource,
                           rq.blocking_session_id,
                           rq.cpu_time,
                           rq.reads,
                           rq.writes,
                           rq.logical_reads,
                           rq.SnapshotDateUTC AS SnapshotDate,
                           rq.database_id,
                           d.name AS database_name,
                           rq.login_name,
                           rq.host_name,
                           rq.program_name,
                           CAST(NULL AS nvarchar(max)) AS query_text
                    FROM dbo.RunningQueries rq
                    JOIN dbo.Instances i ON rq.InstanceID = i.InstanceID
                    LEFT JOIN dbo.Databases d ON rq.database_id = d.database_id AND rq.InstanceID = d.InstanceID
                    WHERE rq.SnapshotDateUTC > DATEADD(hour, -1, GETUTCDATE()) {filter}
                    ORDER BY rq.SnapshotDateUTC DESC
                    """;
                var data = await sql.QueryAsync(query, cancellationToken, ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value));
                return Results.Ok(new { data, note = string.Empty });
            }
            catch (Exception ex)
            {
                logger.LogWarning("Running queries endpoint error: {Error}", ex.Message);
                return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/blocking", async (int? instanceId, SqlDataService sql, ILogger<Program> logger, CancellationToken cancellationToken) =>
        {
            try
            {
                var filter = instanceId.HasValue ? "AND rq.InstanceID = @instanceId" : string.Empty;
                var query = $"""
                    SELECT rq.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           rq.session_id,
                           rq.start_time_utc AS start_time,
                           rq.status,
                           rq.command,
                           rq.wait_type,
                           rq.wait_resource,
                           rq.blocking_session_id,
                           rq.cpu_time,
                           rq.reads,
                           rq.writes,
                           rq.SnapshotDateUTC AS SnapshotDate,
                           CAST(NULL AS nvarchar(max)) AS query_text
                    FROM dbo.RunningQueries rq
                    JOIN dbo.Instances i ON rq.InstanceID = i.InstanceID
                    WHERE rq.SnapshotDateUTC > DATEADD(hour, -1, GETUTCDATE())
                      AND (rq.blocking_session_id > 0
                           OR rq.session_id IN (
                               SELECT blocking_session_id
                               FROM dbo.RunningQueries
                               WHERE blocking_session_id > 0
                                 AND SnapshotDateUTC > DATEADD(hour, -1, GETUTCDATE())
                           ))
                      {filter}
                    ORDER BY rq.SnapshotDateUTC DESC
                    """;
                var data = await sql.QueryAsync(query, cancellationToken, ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value));
                return Results.Ok(new { data, note = string.Empty });
            }
            catch (Exception ex)
            {
                logger.LogWarning("Blocking endpoint error: {Error}", ex.Message);
                return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/slow-queries", async (int? instanceId, int? hours, SqlDataService sql, ILogger<Program> logger, CancellationToken cancellationToken) =>
        {
            var effectiveHours = hours ?? 24;
            try
            {
                var filter = instanceId.HasValue ? "AND sq.InstanceID = @instanceId" : string.Empty;
                var query = $"""
                    SELECT TOP 200 sq.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           sq.object_name,
                           sq.DatabaseID,
                           d.name AS database_name,
                           sq.text AS query_text,
                           sq.duration AS duration_ms,
                           sq.cpu_time AS cpu_time_ms,
                           sq.logical_reads,
                           sq.physical_reads,
                           sq.writes,
                           sq.timestamp AS SnapshotDate,
                           sq.client_hostname,
                           sq.client_app_name,
                           sq.username
                    FROM dbo.SlowQueries sq
                    JOIN dbo.Instances i ON sq.InstanceID = i.InstanceID
                    LEFT JOIN dbo.Databases d ON sq.DatabaseID = d.DatabaseID
                    WHERE sq.timestamp > DATEADD(hour, -@hours, GETUTCDATE()) {filter}
                    ORDER BY sq.duration DESC
                    """;
                var data = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value),
                    ("@hours", effectiveHours));
                return Results.Ok(new { data, note = string.Empty });
            }
            catch (Exception ex)
            {
                logger.LogWarning("Slow queries endpoint error: {Error}", ex.Message);
                return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/memory", async (int? instanceId, int? hours, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = Math.Min(hours ?? 24, 336);
            object clerks = Array.Empty<object>();
            object counters = Array.Empty<object>();
            var clerkNote = string.Empty;
            var counterNote = string.Empty;

            try
            {
                var filter = instanceId.HasValue ? "AND mu.InstanceID = @instanceId" : string.Empty;
                var query = $"""
                    SELECT TOP 200 mu.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           mct.MemoryClerkType AS clerk_type,
                           mct.MemoryClerkDescription AS clerk_name,
                           mu.pages_kb,
                           mu.SnapshotDate
                    FROM dbo.MemoryUsage mu
                    JOIN dbo.Instances i ON mu.InstanceID = i.InstanceID
                    JOIN dbo.MemoryClerkType mct ON mu.MemoryClerkTypeID = mct.MemoryClerkTypeID
                    WHERE mu.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE()) {filter}
                    ORDER BY mu.pages_kb DESC
                    """;
                clerks = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value),
                    ("@hours", effectiveHours));
            }
            catch (Exception ex)
            {
                clerkNote = $"MemoryClerkStats not found: {ex.Message}";
            }

            try
            {
                var filter = instanceId.HasValue ? "AND pc.InstanceID = @instanceId" : string.Empty;
                var query = $"""
                    SELECT TOP 500 pc.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           c.counter_name,
                           pc.Value AS cntr_value,
                           pc.SnapshotDate
                    FROM dbo.PerformanceCounters pc
                    JOIN dbo.Instances i ON pc.InstanceID = i.InstanceID
                    JOIN dbo.Counters c ON pc.CounterID = c.CounterID
                    WHERE c.object_name LIKE '%Memory%'
                      AND pc.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE()) {filter}
                    ORDER BY pc.SnapshotDate DESC
                    """;
                counters = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value),
                    ("@hours", effectiveHours));
            }
            catch (Exception ex)
            {
                counterNote = $"PerformanceCounters not found: {ex.Message}";
            }

            return Results.Ok(new { clerks, counters, clerkNote, counterNote });
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/io", async (int? instanceId, int? hours, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = Math.Min(hours ?? 24, 336);
            object fileStats = Array.Empty<object>();
            object drivePerf = Array.Empty<object>();
            var fileNote = string.Empty;
            var driveNote = string.Empty;

            try
            {
                var filter = instanceId.HasValue ? "AND ios.InstanceID = @instanceId" : string.Empty;
                var query = $"""
                    SELECT TOP 200 ios.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           d.name AS database_name,
                           df.name AS file_name,
                           ios.io_stall_read_ms,
                           ios.io_stall_write_ms,
                           ios.num_of_reads,
                           ios.num_of_writes,
                           ios.num_of_bytes_read,
                           ios.num_of_bytes_written,
                           ios.SnapshotDate
                    FROM dbo.DBIOStats ios
                    JOIN dbo.Instances i ON ios.InstanceID = i.InstanceID
                    JOIN dbo.DBFiles df ON ios.FileID = df.FileID
                    JOIN dbo.Databases d ON df.DatabaseID = d.DatabaseID
                    WHERE ios.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE()) {filter}
                    ORDER BY (ios.io_stall_read_ms + ios.io_stall_write_ms) DESC
                    """;
                fileStats = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value),
                    ("@hours", effectiveHours));
            }
            catch (Exception ex)
            {
                fileNote = $"DBIOStats not found: {ex.Message}";
            }

            try
            {
                var filter = instanceId.HasValue ? "AND dp.InstanceID = @instanceId" : string.Empty;
                var query = $"""
                    SELECT TOP 200 dp.*,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName
                    FROM dbo.DriveSnapshot dp
                    JOIN dbo.Instances i ON dp.InstanceID = i.InstanceID
                    WHERE dp.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE()) {filter}
                    ORDER BY dp.SnapshotDate DESC
                    """;
                drivePerf = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value),
                    ("@hours", effectiveHours));
            }
            catch (Exception ex)
            {
                driveNote = $"DriveSnapshot not found: {ex.Message}";
            }

            return Results.Ok(new { fileStats, drivePerf, fileNote, driveNote });
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/exec-stats", async (int? instanceId, int? hours, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = hours ?? 24;
            object data = Array.Empty<object>();
            var note = string.Empty;

            try
            {
                var filter = instanceId.HasValue ? "AND os.InstanceID = @instanceId" : string.Empty;
                var query = $"""
                    SELECT TOP 500 os.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           dbo_obj.ObjectName AS object_name,
                           dbo_obj.SchemaName,
                           os.execution_count,
                           os.total_worker_time,
                           os.total_elapsed_time,
                           os.total_logical_reads,
                           os.total_logical_writes,
                           os.total_physical_reads,
                           os.SnapshotDate
                    FROM dbo.ObjectExecutionStats os
                    JOIN dbo.Instances i ON os.InstanceID = i.InstanceID
                    JOIN dbo.DBObjects dbo_obj ON os.ObjectID = dbo_obj.ObjectID
                    WHERE os.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE()) {filter}
                    ORDER BY os.total_worker_time DESC
                    """;
                data = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    ("@hours", effectiveHours),
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value));
            }
            catch (Exception ex)
            {
                note = $"ObjectExecutionStats not found: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/waits-timeline", async (int? instanceId, int? hours, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = hours ?? 24;
            object data = Array.Empty<object>();
            var note = string.Empty;

            if (!instanceId.HasValue)
            {
                return Results.Ok(new { data, note = "instanceId required" });
            }

            try
            {
                data = await sql.QueryAsync("""
                    SELECT w.InstanceID,
                           w.SnapshotDate,
                           wt.WaitType,
                           w.wait_time_ms,
                           w.waiting_tasks_count,
                           w.signal_wait_time_ms
                    FROM dbo.Waits w
                    JOIN dbo.WaitType wt ON w.WaitTypeID = wt.WaitTypeID
                    WHERE w.InstanceID = @instanceId
                      AND w.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE())
                    ORDER BY w.SnapshotDate
                    """,
                    cancellationToken,
                    ("@instanceId", instanceId.Value),
                    ("@hours", effectiveHours));
            }
            catch (Exception ex)
            {
                note = $"Waits/WaitType not found: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/counters", async (int? instanceId, int? hours, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = hours ?? 24;
            object data = Array.Empty<object>();
            var note = string.Empty;

            if (!instanceId.HasValue)
            {
                return Results.Ok(new { data, note = "instanceId required" });
            }

            try
            {
                data = await sql.QueryAsync("""
                    SELECT pc.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           c.object_name,
                           c.counter_name,
                           c.instance_name,
                           pc.Value AS cntr_value,
                           pc.SnapshotDate
                    FROM dbo.PerformanceCounters pc
                    JOIN dbo.Instances i ON pc.InstanceID = i.InstanceID
                    JOIN dbo.Counters c ON pc.CounterID = c.CounterID
                    WHERE pc.InstanceID = @instanceId
                      AND pc.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE())
                    ORDER BY pc.SnapshotDate
                    """,
                    cancellationToken,
                    ("@instanceId", instanceId.Value),
                    ("@hours", effectiveHours));
            }
            catch (Exception ex)
            {
                note = $"PerformanceCounters/Counters not found: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/query-store", async (int instanceId, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var tables = new[] { "QueryStoreStats", "TopQueries" };
            foreach (var table in tables)
            {
                try
                {
                    await using var connection = await sql.OpenConnectionAsync(cancellationToken);
                    await using var command = new SqlCommand($"SELECT TOP 100 * FROM dbo.{table} WHERE InstanceID = @id ORDER BY 1 DESC", connection)
                    {
                        CommandTimeout = 60
                    };
                    command.Parameters.AddWithValue("@id", instanceId);

                    var data = await EndpointResultMapper.ReadRowsAsync(command, cancellationToken, camelCase: true);
                    return Results.Ok(new { data, note = string.Empty });
                }
                catch
                {
                }
            }

            return Results.Ok(new { data = Array.Empty<object>(), note = "Query Store tables not found" });
        }).RequireAuthorization();

        return endpoints;
    }
}

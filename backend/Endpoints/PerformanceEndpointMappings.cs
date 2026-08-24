using System.Data;
using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;
using Microsoft.Data.SqlClient;

namespace DBADashWebView.Endpoints;

public static class PerformanceEndpointMappings
{
    public static IEndpointRouteBuilder MapPerformanceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/instances/{id:int}/queries", async (int id, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(id, sql, cancellationToken);
            if (deny is not null) return deny;
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

        endpoints.MapGet("/api/performance/running-queries", async (int? instanceId, ClaimsPrincipal user, SqlDataService sql, ILogger<Program> logger, CancellationToken cancellationToken) =>
        {
            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("rq.InstanceID");
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
                           qt.text AS query_text
                    FROM dbo.RunningQueries rq
                    JOIN dbo.Instances i ON rq.InstanceID = i.InstanceID
                    LEFT JOIN dbo.Databases d ON rq.database_id = d.database_id AND rq.InstanceID = d.InstanceID
                    LEFT JOIN dbo.QueryText qt ON rq.sql_handle = qt.sql_handle
                    WHERE rq.SnapshotDateUTC > DATEADD(hour, -1, GETUTCDATE()) {filter} {scopeSnippet}
                    ORDER BY rq.SnapshotDateUTC DESC
                    """;
                var parameters = new List<(string, object?)> { ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value) };
                parameters.AddRange(scopeParameters);
                var data = await sql.QueryAsync(query, cancellationToken, parameters.ToArray());
                return Results.Ok(new { data, note = string.Empty });
            }
            catch (Exception ex)
            {
                logger.LogWarning("Running queries endpoint error: {Error}", ex.Message);
                return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/blocking", async (int? instanceId, ClaimsPrincipal user, SqlDataService sql, ILogger<Program> logger, CancellationToken cancellationToken) =>
        {
            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("rq.InstanceID");
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
                           qt.text AS query_text
                    FROM dbo.RunningQueries rq
                    JOIN dbo.Instances i ON rq.InstanceID = i.InstanceID
                    LEFT JOIN dbo.QueryText qt ON rq.sql_handle = qt.sql_handle
                    WHERE rq.SnapshotDateUTC > DATEADD(hour, -1, GETUTCDATE())
                      AND (rq.blocking_session_id > 0
                           OR rq.session_id IN (
                               SELECT blocking_session_id
                               FROM dbo.RunningQueries
                               WHERE blocking_session_id > 0
                                 AND SnapshotDateUTC > DATEADD(hour, -1, GETUTCDATE())
                           ))
                      {filter} {scopeSnippet}
                    ORDER BY rq.SnapshotDateUTC DESC
                    """;
                var parameters = new List<(string, object?)> { ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value) };
                parameters.AddRange(scopeParameters);
                var data = await sql.QueryAsync(query, cancellationToken, parameters.ToArray());
                return Results.Ok(new { data, note = string.Empty });
            }
            catch (Exception ex)
            {
                logger.LogWarning("Blocking endpoint error: {Error}", ex.Message);
                return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/slow-queries", async (int? instanceId, int? hours, DateTimeOffset? from, DateTimeOffset? to, ClaimsPrincipal user, SqlDataService sql, ILogger<Program> logger, CancellationToken cancellationToken) =>
        {
            var effectiveHours = hours ?? 24;
            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("sq.InstanceID");
                var filter = instanceId.HasValue ? "AND sq.InstanceID = @instanceId" : string.Empty;
                var timeFilter = from.HasValue && to.HasValue
                    ? "sq.timestamp BETWEEN @from AND @to"
                    : "sq.timestamp > DATEADD(hour, -@hours, GETUTCDATE())";
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
                    WHERE {timeFilter} {filter} {scopeSnippet}
                    ORDER BY sq.duration DESC
                    """;
                var parameters = new List<(string, object?)>
                {
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value),
                    ("@hours", effectiveHours),
                    ("@from", from.HasValue ? from.Value : DBNull.Value),
                    ("@to", to.HasValue ? to.Value : DBNull.Value)
                };
                parameters.AddRange(scopeParameters);
                var data = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    parameters.ToArray());
                return Results.Ok(new { data, note = string.Empty });
            }
            catch (Exception ex)
            {
                logger.LogWarning("Slow queries endpoint error: {Error}", ex.Message);
                return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/memory", async (int? instanceId, int? hours, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = Math.Min(hours ?? 24, 336);
            object clerks = Array.Empty<object>();
            object counters = Array.Empty<object>();
            var clerkNote = string.Empty;
            var counterNote = string.Empty;

            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("mu.InstanceID");
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
                    WHERE mu.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE()) {filter} {scopeSnippet}
                    ORDER BY mu.pages_kb DESC
                    """;
                var parameters = new List<(string, object?)>
                {
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value),
                    ("@hours", effectiveHours)
                };
                parameters.AddRange(scopeParameters);
                clerks = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    parameters.ToArray());
            }
            catch (Exception ex)
            {
                clerkNote = $"MemoryClerkStats not found: {ex.Message}";
            }

            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("pc.InstanceID");
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
                      AND pc.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE()) {filter} {scopeSnippet}
                    ORDER BY pc.SnapshotDate DESC
                    """;
                var parameters = new List<(string, object?)>
                {
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value),
                    ("@hours", effectiveHours)
                };
                parameters.AddRange(scopeParameters);
                counters = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    parameters.ToArray());
            }
            catch (Exception ex)
            {
                counterNote = $"PerformanceCounters not found: {ex.Message}";
            }

            return Results.Ok(new { clerks, counters, clerkNote, counterNote });
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/io", async (int? instanceId, int? hours, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = Math.Min(hours ?? 24, 336);
            object fileStats = Array.Empty<object>();
            object drivePerf = Array.Empty<object>();
            var fileNote = string.Empty;
            var driveNote = string.Empty;

            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("ios.InstanceID");
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
                    WHERE ios.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE()) {filter} {scopeSnippet}
                    ORDER BY (ios.io_stall_read_ms + ios.io_stall_write_ms) DESC
                    """;
                var parameters = new List<(string, object?)>
                {
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value),
                    ("@hours", effectiveHours)
                };
                parameters.AddRange(scopeParameters);
                fileStats = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    parameters.ToArray());
            }
            catch (Exception ex)
            {
                fileNote = $"DBIOStats not found: {ex.Message}";
            }

            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("dr.InstanceID");
                var filter = instanceId.HasValue ? "AND dr.InstanceID = @instanceId" : string.Empty;
                // DriveSnapshot has no InstanceID column — join via Drives to resolve the instance.
                var query = $"""
                    SELECT TOP 200 dr.InstanceID,
                           dr.DriveID,
                           dr.Name AS DriveName,
                           dr.Label AS DriveLabel,
                           dp.SnapshotDate,
                           dp.Capacity,
                           dp.FreeSpace,
                           dp.UsedSpace,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName
                    FROM dbo.DriveSnapshot dp
                    JOIN dbo.Drives dr ON dp.DriveID = dr.DriveID
                    JOIN dbo.Instances i ON dr.InstanceID = i.InstanceID
                    WHERE dp.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE()) {filter} {scopeSnippet}
                    ORDER BY dp.SnapshotDate DESC
                    """;
                var parameters = new List<(string, object?)>
                {
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value),
                    ("@hours", effectiveHours)
                };
                parameters.AddRange(scopeParameters);
                drivePerf = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    parameters.ToArray());
            }
            catch (Exception ex)
            {
                driveNote = $"DriveSnapshot not found: {ex.Message}";
            }

            return Results.Ok(new { fileStats, drivePerf, fileNote, driveNote });
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/exec-stats", async (int? instanceId, int? hours, DateTimeOffset? from, DateTimeOffset? to, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = hours ?? 24;
            object data = Array.Empty<object>();
            var note = string.Empty;

            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("os.InstanceID");
                var filter = instanceId.HasValue ? "AND os.InstanceID = @instanceId" : string.Empty;
                var timeFilter = from.HasValue && to.HasValue
                    ? "os.SnapshotDate BETWEEN @from AND @to"
                    : "os.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE())";
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
                    WHERE {timeFilter} {filter} {scopeSnippet}
                    ORDER BY os.total_worker_time DESC
                    """;
                var parameters = new List<(string, object?)>
                {
                    ("@hours", effectiveHours),
                    ("@from", from.HasValue ? from.Value : DBNull.Value),
                    ("@to", to.HasValue ? to.Value : DBNull.Value),
                    ("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value)
                };
                parameters.AddRange(scopeParameters);
                data = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    parameters.ToArray());
            }
            catch (Exception ex)
            {
                note = $"ObjectExecutionStats not found: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/waits-timeline", async (int? instanceId, int? hours, DateTimeOffset? from, DateTimeOffset? to, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = hours ?? 24;
            object data = Array.Empty<object>();
            var note = string.Empty;

            if (!instanceId.HasValue)
            {
                return Results.Ok(new { data, note = "instanceId required" });
            }

            var deny = await user.EnsureInstanceAccessAsync(instanceId.Value, sql, cancellationToken);
            if (deny is not null) return deny;

            try
            {
                var timeFilter = from.HasValue && to.HasValue
                    ? "w.SnapshotDate BETWEEN @from AND @to"
                    : "w.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE())";
                var query = $"""
                    SELECT w.InstanceID,
                           w.SnapshotDate,
                           wt.WaitType,
                           w.wait_time_ms,
                           w.waiting_tasks_count,
                           w.signal_wait_time_ms
                    FROM dbo.Waits w
                    JOIN dbo.WaitType wt ON w.WaitTypeID = wt.WaitTypeID
                    WHERE w.InstanceID = @instanceId
                      AND {timeFilter}
                    ORDER BY w.SnapshotDate
                    """;
                data = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    ("@instanceId", instanceId.Value),
                    ("@hours", effectiveHours),
                    ("@from", from.HasValue ? from.Value : DBNull.Value),
                    ("@to", to.HasValue ? to.Value : DBNull.Value));
            }
            catch (Exception ex)
            {
                note = $"Waits/WaitType not found: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/counters", async (int? instanceId, int? hours, DateTimeOffset? from, DateTimeOffset? to, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = hours ?? 24;
            object data = Array.Empty<object>();
            var note = string.Empty;

            if (!instanceId.HasValue)
            {
                return Results.Ok(new { data, note = "instanceId required" });
            }

            var deny = await user.EnsureInstanceAccessAsync(instanceId.Value, sql, cancellationToken);
            if (deny is not null) return deny;

            try
            {
                var timeFilter = from.HasValue && to.HasValue
                    ? "pc.SnapshotDate BETWEEN @from AND @to"
                    : "pc.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE())";
                var query = $"""
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
                      AND {timeFilter}
                    ORDER BY pc.SnapshotDate
                    """;
                data = await sql.QueryAsync(
                    query,
                    cancellationToken,
                    ("@instanceId", instanceId.Value),
                    ("@hours", effectiveHours),
                    ("@from", from.HasValue ? from.Value : DBNull.Value),
                    ("@to", to.HasValue ? to.Value : DBNull.Value));
            }
            catch (Exception ex)
            {
                note = $"PerformanceCounters/Counters not found: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        endpoints.MapGet("/api/performance/query-store", async (int instanceId, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(instanceId, sql, cancellationToken);
            if (deny is not null) return deny;
            // DBADash has dbo.QueryPlans/QueryText (keyed by plan_handle/sql_handle) but no
            // query-level AGGREGATED runtime-stats table to drive a "top queries" ranking from -
            // only dbo.RunningQueries (point-in-time) and dbo.SlowQueries (individual slow-query
            // events, which already carry their own captured text). The closest real aggregate is
            // dbo.ObjectExecutionStats (procedure/object-level), used here as a top-CPU-consumers
            // view. Real forced-plan history (not an approximation) is a separate endpoint below.
            string note = string.Empty;
            object data = Array.Empty<object>();
            try
            {
                const string query = """
                    SELECT TOP 100
                        os.InstanceID,
                        COALESCE(i.InstanceDisplayName, i.Instance) AS instanceDisplayName,
                        obj.ObjectName AS objectName,
                        obj.SchemaName AS schemaName,
                        SUM(os.execution_count)                          AS countExecutions,
                        AVG(CAST(os.total_worker_time   AS FLOAT) / NULLIF(os.execution_count, 0) / 1000.0) AS avgCpuTime,
                        AVG(CAST(os.total_elapsed_time  AS FLOAT) / NULLIF(os.execution_count, 0) / 1000.0) AS avgDuration,
                        AVG(CAST(os.total_logical_reads AS FLOAT) / NULLIF(os.execution_count, 0))          AS avgLogicalIoReads,
                        MAX(os.SnapshotDate) AS lastSeen
                    FROM dbo.ObjectExecutionStats os
                    JOIN dbo.Instances  i   ON os.InstanceID = i.InstanceID
                    JOIN dbo.DBObjects  obj ON os.ObjectID   = obj.ObjectID
                    WHERE os.InstanceID = @instanceId
                      AND os.SnapshotDate > DATEADD(hour, -24, GETUTCDATE())
                    GROUP BY os.InstanceID, i.InstanceDisplayName, i.Instance, obj.ObjectName, obj.SchemaName
                    ORDER BY SUM(os.total_worker_time) DESC
                    """;
                data = await sql.QueryAsync(query, cancellationToken, ("@instanceId", instanceId));
            }
            catch (Exception ex)
            {
                note = $"Query Store data unavailable: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        // Real forced-plan audit trail from dbo.PlanForcingLog - who forced/unforced which plan
        // for which query, when, and its status. Read-only: forcing a plan is a write against the
        // target SQL Server's actual query plan cache, which stays a DBA Dash desktop client action.
        endpoints.MapGet("/api/performance/plan-forcing-log", async (int instanceId, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(instanceId, sql, cancellationToken);
            if (deny is not null) return deny;
            string note = string.Empty;
            object data = Array.Empty<object>();
            try
            {
                const string query = """
                    SELECT TOP 200
                        MessageGroupID, InstanceID, database_name, log_date, log_type, user_name,
                        query_id, plan_id, object_name, query_sql_text, notes, status
                    FROM dbo.PlanForcingLog
                    WHERE InstanceID = @instanceId
                    ORDER BY log_date DESC
                    """;
                data = await sql.QueryAsync(query, cancellationToken, ("@instanceId", instanceId));
            }
            catch (Exception ex)
            {
                note = $"Plan forcing log unavailable: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        return endpoints;
    }
}

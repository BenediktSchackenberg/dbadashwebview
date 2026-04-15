using DBADashWebView.Data;

namespace DBADashWebView.Endpoints;

public static class InstanceEndpointMappings
{
    public static IEndpointRouteBuilder MapInstanceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/instances", async (SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var instances = await sql.QueryAsync("""
                    SELECT i.InstanceID, i.Instance, i.ConnectionID, i.IsActive, i.Edition,
                           i.ProductVersion, i.ProductMajorVersion, i.cpu_count, i.physical_memory_kb, i.sqlserver_start_time,
                           i.InstanceDisplayName, i.ShowInSummary, cd.LastCollected
                    FROM dbo.Instances i
                    OUTER APPLY (
                        SELECT MAX(SnapshotDate) AS LastCollected
                        FROM dbo.CollectionDates c WHERE c.InstanceID = i.InstanceID
                    ) cd
                    WHERE i.IsActive = 1
                      AND cd.LastCollected > DATEADD(hour, -24, GETUTCDATE())
                    ORDER BY i.InstanceDisplayName
                    """, cancellationToken);
                return Results.Ok(instances);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/instances/{id:int}", async (int id, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var instances = await sql.QueryAsync("""
                    SELECT i.InstanceID, i.Instance, i.ConnectionID, i.IsActive, i.Edition,
                           i.ProductVersion, i.cpu_count, i.physical_memory_kb, i.sqlserver_start_time,
                           i.InstanceDisplayName, i.Alias, cd.LastCollected
                    FROM dbo.Instances i
                    OUTER APPLY (
                        SELECT MAX(SnapshotDate) AS LastCollected
                        FROM dbo.CollectionDates c WHERE c.InstanceID = i.InstanceID
                    ) cd
                    WHERE i.InstanceID = @id
                    """, cancellationToken, ("@id", id));
                if (instances.Count == 0)
                {
                    return Results.NotFound();
                }

                List<Dictionary<string, object?>>? summary = null;
                try
                {
                    summary = await sql.SpAsync("dbo.Summary_Get", cancellationToken);
                }
                catch
                {
                }

                var instanceSummary = summary?.FirstOrDefault(row =>
                    row.ContainsKey("InstanceID") && Convert.ToInt32(row["InstanceID"]) == id);

                return Results.Ok(new { instance = instances[0], summary = instanceSummary });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/instances/{id:int}/cpu", async (int id, int? hours, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = Math.Min(hours ?? 24, 336);
            try
            {
                var data = await sql.QueryAsync("""
                    SELECT TOP 1440 EventTime, SQLProcessCPU, SystemIdleCPU,
                           (100 - SQLProcessCPU - SystemIdleCPU) AS OtherCPU,
                           (100 - SystemIdleCPU) AS TotalCPU
                    FROM dbo.CPU
                    WHERE InstanceID = @id AND EventTime > DATEADD(hour, -@hours, GETUTCDATE())
                    ORDER BY EventTime DESC
                    """, cancellationToken, ("@id", id), ("@hours", effectiveHours));
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/instances/{id:int}/waits", async (int id, int? hours, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = Math.Min(hours ?? 24, 336);
            try
            {
                var data = await sql.QueryAsync("""
                    SELECT TOP 20 w.WaitTypeID, wt.WaitType,
                           SUM(w.wait_time_ms) AS TotalWaitMs,
                           SUM(w.waiting_tasks_count) AS TotalWaitCount,
                           SUM(w.signal_wait_time_ms) AS TotalSignalWaitMs
                    FROM dbo.Waits w
                    LEFT JOIN dbo.WaitType wt ON w.WaitTypeID = wt.WaitTypeID
                    WHERE w.InstanceID = @id AND w.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE())
                    GROUP BY w.WaitTypeID, wt.WaitType
                    ORDER BY SUM(w.wait_time_ms) DESC
                    """, cancellationToken, ("@id", id), ("@hours", effectiveHours));
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/instances/{id:int}/drives", async (int id, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var data = await sql.QueryAsync("""
                    SELECT DriveID, Name, Label, Capacity, FreeSpace,
                           (Capacity - FreeSpace) AS UsedSpace
                    FROM dbo.Drives WHERE InstanceID = @id
                    """, cancellationToken, ("@id", id));
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/instances/{id:int}/databases", async (int id, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var data = await sql.QueryAsync("""
                    SELECT d.DatabaseID, d.name, d.state, d.recovery_model, d.LastGoodCheckDbTime, d.IsActive,
                           h.is_primary_replica, h.synchronization_state, h.synchronization_health,
                           ag.name AS ag_name
                    FROM dbo.Databases d
                    LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                    LEFT JOIN dbo.AvailabilityGroups ag ON h.group_id = ag.group_id AND ag.InstanceID = d.InstanceID
                    WHERE d.InstanceID = @id AND d.IsActive = 1
                    ORDER BY d.name
                    """, cancellationToken, ("@id", id));
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/instances/{id:int}/backups", async (int id, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var data = await sql.QueryAsync("""
                    SELECT d.DatabaseID, d.name AS DatabaseName, b.type,
                           b.backup_start_date, b.backup_finish_date,
                           b.backup_size, b.compressed_backup_size
                    FROM dbo.Databases d
                    LEFT JOIN dbo.Backups b ON d.DatabaseID = b.DatabaseID
                    WHERE d.InstanceID = @id AND d.IsActive = 1
                    ORDER BY d.name, b.backup_start_date DESC
                    """, cancellationToken, ("@id", id));
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/instances/{id:int}/jobs", async (int id, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var data = await sql.QueryAsync("""
                    SELECT TOP 50 job_id, step_id, step_name, run_status,
                           RunDateTime, RunDurationSec, message
                    FROM dbo.JobHistory
                    WHERE InstanceID = @id
                    ORDER BY RunDateTime DESC
                    """, cancellationToken, ("@id", id));
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/jobs/recent", async (SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var data = await sql.QueryAsync("""
                    SELECT TOP 100 jh.job_id, jh.step_id, jh.step_name, jh.run_status,
                           jh.RunDateTime, jh.RunDurationSec, jh.message,
                           jh.InstanceID, i.InstanceDisplayName
                    FROM dbo.JobHistory jh
                    JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
                    WHERE jh.step_id = 0
                    ORDER BY jh.RunDateTime DESC
                    """, cancellationToken);
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/jobs/failures", async (SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var data = await sql.QueryAsync("""
                    SELECT TOP 100 jh.job_id, jh.step_id, jh.step_name, jh.run_status,
                           jh.RunDateTime, jh.RunDurationSec, jh.message,
                           jh.InstanceID, i.InstanceDisplayName
                    FROM dbo.JobHistory jh
                    JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
                    WHERE jh.run_status = 0 AND jh.RunDateTime > DATEADD(hour, -24, GETUTCDATE())
                    ORDER BY jh.RunDateTime DESC
                    """, cancellationToken);
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/alerts/recent", async (SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var errors = await sql.QueryAsync("""
                    SELECT TOP 100 e.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance, CAST(e.InstanceID AS VARCHAR)) AS InstanceName,
                           e.ErrorDate, e.ErrorMessage, e.ErrorContext,
                           'error' AS AlertType
                    FROM dbo.CollectionErrorLog e
                    LEFT JOIN dbo.Instances i ON e.InstanceID = i.InstanceID
                    ORDER BY e.ErrorDate DESC
                    """, cancellationToken);

                List<Dictionary<string, object?>> failedJobs = [];
                try
                {
                    failedJobs = await sql.QueryAsync("""
                        SELECT TOP 50 jh.InstanceID,
                               COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                               jh.RunDateTime AS ErrorDate,
                               CONCAT('Job step failed: ', jh.step_name, ' - ', LEFT(jh.message, 500)) AS ErrorMessage,
                               jh.step_name AS ErrorContext,
                               'job_failure' AS AlertType
                        FROM dbo.JobHistory jh
                        JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
                        WHERE jh.run_status = 0 AND jh.RunDateTime > DATEADD(hour, -48, GETUTCDATE())
                        ORDER BY jh.RunDateTime DESC
                        """, cancellationToken);
                }
                catch
                {
                }

                var combined = new List<Dictionary<string, object?>>();
                combined.AddRange(errors);
                combined.AddRange(failedJobs);
                combined.Sort((left, right) =>
                {
                    var leftDate = left.TryGetValue("ErrorDate", out var leftValue) && leftValue is not null ? leftValue.ToString() : string.Empty;
                    var rightDate = right.TryGetValue("ErrorDate", out var rightValue) && rightValue is not null ? rightValue.ToString() : string.Empty;
                    return string.Compare(rightDate, leftDate, StringComparison.Ordinal);
                });

                return Results.Ok(combined.Take(200));
            }
            catch
            {
                return Results.Ok(Array.Empty<object>());
            }
        }).RequireAuthorization();

        return endpoints;
    }
}

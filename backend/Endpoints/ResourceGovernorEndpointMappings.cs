using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;

namespace DBADashWebView.Endpoints;

/// <summary>
/// Surfaces DBA Dash's real Resource Governor collection: configuration + change history
/// from dbo.ResourceGovernorConfigurationHistory, and current pool/workload-group utilization
/// computed with the same rate formulas as DBA Dash's own
/// dbo.ResourceGovernorResourcePools_Get / dbo.ResourceGovernorWorkloadGroups_Get procs.
/// Those procs return every pool/group row (active or retired) with no IsActive filter, so
/// this endpoint additionally reads the base tables to restrict the response to currently
/// active pools/groups.
/// </summary>
public static class ResourceGovernorEndpointMappings
{
    public static IEndpointRouteBuilder MapResourceGovernorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/instances/{id:int}/resource-governor", async (int id, int? hours, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(id, sql, cancellationToken);
            if (deny is not null) return deny;

            var effectiveHours = Math.Clamp(hours ?? 24, 1, 168);
            var toDate = DateTime.UtcNow;
            var fromDate = toDate.AddHours(-effectiveHours);
            string note = string.Empty;

            object? config = null;
            var configHistory = new List<object>();
            var pools = new List<object>();
            var workloadGroups = new List<object>();

            try
            {
                var configRows = await sql.QueryAsync(
                    """
                    SELECT is_enabled, classifier_function, reconfiguration_error, reconfiguration_pending,
                           max_outstanding_io_per_volume, ValidFrom
                    FROM dbo.ResourceGovernorConfiguration
                    WHERE InstanceID = @id
                    """, cancellationToken, ("@id", id));

                if (configRows.Count > 0)
                {
                    var row = configRows[0];
                    config = new
                    {
                        isEnabled = Convert.ToBoolean(row["is_enabled"]),
                        classifierFunction = row["classifier_function"]?.ToString(),
                        reconfigurationError = Convert.ToBoolean(row["reconfiguration_error"]),
                        reconfigurationPending = Convert.ToBoolean(row["reconfiguration_pending"]),
                        maxOutstandingIoPerVolume = Convert.ToInt32(row["max_outstanding_io_per_volume"]),
                        validFrom = row["ValidFrom"],
                    };
                }

                var historyRows = await sql.QueryAsync(
                    """
                    SELECT TOP 20 is_enabled, classifier_function, reconfiguration_error, reconfiguration_pending,
                           max_outstanding_io_per_volume, ValidFrom, ValidTo
                    FROM dbo.ResourceGovernorConfigurationHistory
                    WHERE InstanceID = @id
                    ORDER BY ValidTo DESC
                    """, cancellationToken, ("@id", id));

                configHistory = historyRows.Select(row => (object)new
                {
                    isEnabled = Convert.ToBoolean(row["is_enabled"]),
                    classifierFunction = row["classifier_function"]?.ToString(),
                    reconfigurationError = Convert.ToBoolean(row["reconfiguration_error"]),
                    reconfigurationPending = Convert.ToBoolean(row["reconfiguration_pending"]),
                    maxOutstandingIoPerVolume = Convert.ToInt32(row["max_outstanding_io_per_volume"]),
                    validFrom = row["ValidFrom"],
                    validTo = row["ValidTo"],
                }).ToList();
            }
            catch (Exception ex)
            {
                note = $"Resource Governor configuration unavailable: {ex.Message}";
            }

            try
            {
                var activePoolNames = (await sql.QueryAsync(
                    "SELECT name FROM dbo.ResourceGovernorResourcePools WHERE InstanceID = @id AND IsActive = 1",
                    cancellationToken, ("@id", id)))
                    .Select(r => r["name"]?.ToString())
                    .Where(n => n is not null)
                    .ToHashSet();

                var poolRows = await sql.QueryAsync(
                    "EXEC dbo.ResourceGovernorResourcePools_Get @InstanceID = @id, @FromDate = @from, @ToDate = @to",
                    cancellationToken, ("@id", id), ("@from", fromDate), ("@to", toDate));

                pools = poolRows
                    .Where(row => activePoolNames.Contains(row["name"]?.ToString()))
                    .Select(row => (object)new
                    {
                        poolId = Convert.ToInt32(row["pool_id"]),
                        name = row["name"]?.ToString(),
                        minCpuPercent = Convert.ToInt32(row["min_cpu_percent"]),
                        maxCpuPercent = Convert.ToInt32(row["max_cpu_percent"]),
                        capCpuPercent = row["cap_cpu_percent"] is null ? (int?)null : Convert.ToInt32(row["cap_cpu_percent"]),
                        minMemoryPercent = Convert.ToInt32(row["min_memory_percent"]),
                        maxMemoryPercent = Convert.ToInt32(row["max_memory_percent"]),
                        periodCpuPercent = ToNullableDouble(row["period_cpu_percent"]),
                        periodCpuSharePercent = ToNullableDouble(row["period_cpu_share_percent"]),
                        cpuCapUtilizationPercent = ToNullableDouble(row["cpu_cap_utilization_percent"]),
                        cpuCapNearThresholdPercent = ToNullableDouble(row["cpu_cap_near_threshold_percent"]),
                        usedMemoryKb = Convert.ToInt64(row["used_memory_kb"]),
                        maxMemoryKb = Convert.ToInt64(row["max_memory_kb"]),
                        targetMemoryKb = Convert.ToInt64(row["target_memory_kb"]),
                        outOfMemoryCountTotal = Convert.ToInt64(row["out_of_memory_count"]),
                        memGrantTimeoutCountTotal = Convert.ToInt64(row["total_memgrant_timeout_count"]),
                        periodOutOfMemoryCountPerMin = ToNullableDouble(row["period_out_of_memory_count_per_min"]),
                        periodMemGrantTimeoutCountPerMin = ToNullableDouble(row["period_memgrant_timeout_count_per_min"]),
                        periodReadIoThrottledPerMin = ToNullableDouble(row["period_read_io_throttled_per_min"]),
                        periodWriteIoThrottledPerMin = ToNullableDouble(row["period_write_io_throttled_per_min"]),
                        snapshotDate = row["SnapshotDate"],
                    })
                    .ToList();
            }
            catch (Exception ex)
            {
                note += (note.Length > 0 ? " " : string.Empty) + $"Resource pools unavailable: {ex.Message}";
            }

            try
            {
                var activeGroupNames = (await sql.QueryAsync(
                    "SELECT name FROM dbo.ResourceGovernorWorkloadGroups WHERE InstanceID = @id AND IsActive = 1",
                    cancellationToken, ("@id", id)))
                    .Select(r => r["name"]?.ToString())
                    .Where(n => n is not null)
                    .ToHashSet();

                var groupRows = await sql.QueryAsync(
                    "EXEC dbo.ResourceGovernorWorkloadGroups_Get @InstanceID = @id, @FromDate = @from, @ToDate = @to",
                    cancellationToken, ("@id", id), ("@from", fromDate), ("@to", toDate));

                workloadGroups = groupRows
                    .Where(row => activeGroupNames.Contains(row["name"]?.ToString()))
                    .Select(row => (object)new
                    {
                        groupId = Convert.ToInt32(row["group_id"]),
                        name = row["name"]?.ToString(),
                        poolName = row["pool_name"]?.ToString(),
                        importance = row["importance"]?.ToString(),
                        requestMaxCpuTimeSec = Convert.ToInt32(row["request_max_cpu_time_sec"]),
                        maxDop = Convert.ToInt32(row["max_dop"]),
                        groupMaxRequests = Convert.ToInt32(row["group_max_requests"]),
                        activeRequestCount = Convert.ToInt32(row["active_request_count"]),
                        queuedRequestCount = Convert.ToInt32(row["queued_request_count"]),
                        blockedTaskCount = Convert.ToInt32(row["blocked_task_count"]),
                        periodCpuPercent = ToNullableDouble(row["period_cpu_percent"]),
                        periodCpuSharePercent = ToNullableDouble(row["period_cpu_share_percent"]),
                        periodRequestsPerMin = ToNullableDouble(row["period_requests_per_min"]),
                        periodQueuedRequestCountPerMin = ToNullableDouble(row["period_queued_request_count_per_min"]),
                        periodLockWaitsPerMin = ToNullableDouble(row["period_lock_waits_per_min"]),
                        periodLockWaitTimeMsPerSec = ToNullableDouble(row["period_lock_wait_time_ms_per_sec"]),
                        tempdbDataSpaceKb = row["tempdb_data_space_kb"] is null ? (long?)null : Convert.ToInt64(row["tempdb_data_space_kb"]),
                        peakTempdbDataSpaceKb = row["peak_tempdb_data_space_kb"] is null ? (long?)null : Convert.ToInt64(row["peak_tempdb_data_space_kb"]),
                        totalTempdbDataLimitViolationCount = row["total_tempdb_data_limit_violation_count"] is null ? (long?)null : Convert.ToInt64(row["total_tempdb_data_limit_violation_count"]),
                        periodTempdbDataLimitViolationsPerMin = ToNullableDouble(row["period_tempdb_data_limit_violations_per_min"]),
                        snapshotDate = row["SnapshotDate"],
                    })
                    .ToList();
            }
            catch (Exception ex)
            {
                note += (note.Length > 0 ? " " : string.Empty) + $"Workload groups unavailable: {ex.Message}";
            }

            return Results.Ok(new { config, configHistory, pools, workloadGroups, periodHours = effectiveHours, note });
        }).RequireAuthorization();

        return endpoints;
    }

    private static double? ToNullableDouble(object? value) => value is null or DBNull ? null : Convert.ToDouble(value);
}

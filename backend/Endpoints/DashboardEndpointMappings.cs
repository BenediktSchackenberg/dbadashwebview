using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;

namespace DBADashWebView.Endpoints;

public static class DashboardEndpointMappings
{
    private static readonly string[] SummaryStatusKeys =
    [
        "FullBackupStatus",
        "DriveStatus",
        "JobStatus",
        "AGStatus",
        "CorruptionStatus",
        "LastGoodCheckDBStatus",
        "LogBackupStatus"
    ];

    public static IEndpointRouteBuilder MapDashboardEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/dashboard/summary", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var rows = await sql.SpAsync("dbo.Summary_Get", cancellationToken);
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                return Results.Ok(rows.FilterByInstanceIds(allowedIds));
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/dashboard/stats", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var activeIds = new HashSet<int>();
                try
                {
                    var activeRows = await sql.QueryAsync("""
                        SELECT DISTINCT InstanceID FROM dbo.CollectionDates
                        WHERE SnapshotDate > DATEADD(hour, -24, GETUTCDATE())
                        """, cancellationToken);
                    foreach (var row in activeRows)
                    {
                        if (row.TryGetValue("InstanceID", out var value) && value is not null)
                        {
                            activeIds.Add(Convert.ToInt32(value));
                        }
                    }
                }
                catch
                {
                }

                var summary = await sql.SpAsync("dbo.Summary_Get", cancellationToken);
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                summary = summary.FilterByInstanceIds(allowedIds);
                var activeSummary = activeIds.Count > 0
                    ? summary.Where(row => row.TryGetValue("InstanceID", out var value) && value is not null && activeIds.Contains(Convert.ToInt32(value))).ToList()
                    : summary;

                var totalInstances = activeSummary.Count;
                var healthy = 0;
                var warning = 0;
                var critical = 0;
                foreach (var row in activeSummary)
                {
                    var worstStatus = GetWorstStatus(row);
                    if (worstStatus == 1)
                    {
                        critical++;
                    }
                    else if (worstStatus == 2)
                    {
                        warning++;
                    }
                    else
                    {
                        healthy++;
                    }
                }

                var totalDatabases = 0;
                try
                {
                    var dbCount = await sql.QueryAsync("""
                        SELECT COUNT(*) AS Cnt FROM dbo.Databases d
                        WHERE d.IsActive = 1
                          AND d.InstanceID IN (
                              SELECT DISTINCT InstanceID
                              FROM dbo.CollectionDates
                              WHERE SnapshotDate > DATEADD(hour, -24, GETUTCDATE())
                          )
                        """, cancellationToken);
                    if (dbCount.Count > 0)
                    {
                        totalDatabases = Convert.ToInt32(dbCount[0]["Cnt"]);
                    }
                }
                catch
                {
                }

                var failedJobs24h = 0;
                try
                {
                    var failedCount = await sql.QueryAsync("""
                        SELECT COUNT(*) AS Cnt FROM dbo.JobHistory
                        WHERE run_status = 0 AND RunDateTime > DATEADD(hour, -24, GETUTCDATE())
                          AND InstanceID IN (
                              SELECT DISTINCT InstanceID
                              FROM dbo.CollectionDates
                              WHERE SnapshotDate > DATEADD(hour, -24, GETUTCDATE())
                          )
                        """, cancellationToken);
                    if (failedCount.Count > 0)
                    {
                        failedJobs24h = Convert.ToInt32(failedCount[0]["Cnt"]);
                    }
                }
                catch
                {
                }

                var top10Cpu = new List<object>();
                try
                {
                    var cpuData = await sql.QueryAsync("""
                        SELECT TOP 10 c.InstanceID, i.InstanceDisplayName, AVG(CAST(c.SQLProcessCPU AS FLOAT)) AS AvgCpu
                        FROM dbo.CPU c
                        JOIN dbo.Instances i ON c.InstanceID = i.InstanceID
                        WHERE c.EventTime > DATEADD(hour, -1, GETUTCDATE())
                          AND c.InstanceID IN (
                              SELECT DISTINCT InstanceID
                              FROM dbo.CollectionDates
                              WHERE SnapshotDate > DATEADD(hour, -24, GETUTCDATE())
                          )
                        GROUP BY c.InstanceID, i.InstanceDisplayName
                        ORDER BY AVG(CAST(c.SQLProcessCPU AS FLOAT)) DESC
                        """, cancellationToken);
                    top10Cpu.AddRange(cpuData.Select(row => new
                    {
                        instanceId = row["InstanceID"],
                        instanceName = row["InstanceDisplayName"],
                        avgCpu = Math.Round(Convert.ToDouble(row["AvgCpu"]), 1)
                    }));
                }
                catch
                {
                }

                var top10LargestDatabases = new List<object>();
                try
                {
                    var dbData = await sql.QueryAsync("""
                        SELECT TOP 10 d.name AS DatabaseName, i.InstanceDisplayName,
                               SUM(CAST(f.size AS BIGINT)) * 8 / 1024 AS SizeMB
                        FROM dbo.Databases d
                        JOIN dbo.Instances i ON d.InstanceID = i.InstanceID
                        JOIN dbo.DBFiles f ON d.DatabaseID = f.DatabaseID
                        WHERE d.IsActive = 1
                        GROUP BY d.name, i.InstanceDisplayName
                        ORDER BY SUM(CAST(f.size AS BIGINT)) DESC
                        """, cancellationToken);
                    top10LargestDatabases.AddRange(dbData.Select(row => new
                    {
                        instanceName = row["InstanceDisplayName"],
                        databaseName = row["DatabaseName"],
                        sizeMb = row["SizeMB"]
                    }));
                }
                catch
                {
                    try
                    {
                        var dbData = await sql.QueryAsync("""
                            SELECT TOP 10 d.name AS DatabaseName, i.InstanceDisplayName,
                                   SUM(CAST(f.size AS BIGINT)) * 8 / 1024 AS SizeMB
                            FROM dbo.Databases d
                            JOIN dbo.Instances i ON d.InstanceID = i.InstanceID
                            JOIN dbo.DatabaseFiles f ON d.DatabaseID = f.DatabaseID
                            WHERE d.IsActive = 1
                            GROUP BY d.name, i.InstanceDisplayName
                            ORDER BY SUM(CAST(f.size AS BIGINT)) DESC
                            """, cancellationToken);
                        top10LargestDatabases.AddRange(dbData.Select(row => new
                        {
                            instanceName = row["InstanceDisplayName"],
                            databaseName = row["DatabaseName"],
                            sizeMb = row["SizeMB"]
                        }));
                    }
                    catch
                    {
                    }
                }

                List<Dictionary<string, object?>> recentAlerts = [];
                try
                {
                    recentAlerts = await sql.QueryAsync("""
                        SELECT TOP 10 InstanceID, ErrorDate, ErrorMessage, ErrorContext
                        FROM dbo.CollectionErrorLog
                        ORDER BY ErrorDate DESC
                        """, cancellationToken);
                    recentAlerts = recentAlerts.FilterByInstanceIds(allowedIds);
                }
                catch
                {
                }

                List<Dictionary<string, object?>> failedJobs = [];
                try
                {
                    failedJobs = await sql.QueryAsync("""
                        SELECT TOP 10 jh.job_id, jh.step_name, jh.RunDateTime, jh.message,
                               jh.InstanceID, i.InstanceDisplayName
                        FROM dbo.JobHistory jh
                        JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
                        WHERE jh.run_status = 0 AND jh.RunDateTime > DATEADD(hour, -24, GETUTCDATE())
                        ORDER BY jh.RunDateTime DESC
                        """, cancellationToken);
                    failedJobs = failedJobs.FilterByInstanceIds(allowedIds);
                }
                catch
                {
                }

                return Results.Ok(new
                {
                    totalInstances,
                    healthy,
                    warning,
                    critical,
                    totalDatabases,
                    failedJobs24h,
                    top10Cpu,
                    top10LargestDbs = top10LargestDatabases,
                    recentAlerts,
                    failedJobs
                });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/dashboard/performance-summary", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var instances = await sql.QueryAsync("""
                    SELECT InstanceID, COALESCE(InstanceDisplayName, Instance) AS Name
                    FROM dbo.Instances
                    WHERE IsActive = 1
                    ORDER BY COALESCE(InstanceDisplayName, Instance)
                    """, cancellationToken);

                var perfAllowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                instances = instances.FilterByInstanceIds(perfAllowedIds);

                var cpuData = new Dictionary<int, (double avg, int max, int maxTotal)>();
                try
                {
                    var cpuRows = await sql.QueryAsync("""
                        SELECT InstanceID, AVG(SQLProcessCPU) AS AvgCPU, MAX(MaxSQLProcessCPU) AS MaxCPU, MAX(MaxTotalCPU) AS MaxTotal
                        FROM dbo.CPU
                        WHERE EventTime > DATEADD(hour, -1, GETUTCDATE())
                        GROUP BY InstanceID
                        """, cancellationToken);
                    foreach (var row in cpuRows)
                    {
                        cpuData[Convert.ToInt32(row["InstanceID"])] = (
                            row["AvgCPU"] is null ? 0 : Convert.ToDouble(row["AvgCPU"]),
                            row["MaxCPU"] is null ? 0 : Convert.ToInt32(row["MaxCPU"]),
                            row["MaxTotal"] is null ? 0 : Convert.ToInt32(row["MaxTotal"]));
                    }
                }
                catch
                {
                }

                var ioData = new Dictionary<int, (double readLatency, double writeLatency, double mbPerSecond, double iops)>();
                try
                {
                    var ioRows = await sql.QueryAsync("""
                        SELECT InstanceID, MAX(MaxReadLatency) AS RL, MAX(MaxWriteLatency) AS WL, SUM(MaxMBsec) AS MB, SUM(MaxIOPs) AS IO
                        FROM dbo.DBIOStats
                        WHERE SnapshotDate > DATEADD(hour, -1, GETUTCDATE())
                        GROUP BY InstanceID
                        """, cancellationToken);
                    foreach (var row in ioRows)
                    {
                        ioData[Convert.ToInt32(row["InstanceID"])] = (
                            row["RL"] is null ? 0 : Convert.ToDouble(row["RL"]),
                            row["WL"] is null ? 0 : Convert.ToDouble(row["WL"]),
                            row["MB"] is null ? 0 : Convert.ToDouble(row["MB"]),
                            row["IO"] is null ? 0 : Convert.ToDouble(row["IO"]));
                    }
                }
                catch
                {
                }

                var waitData = new Dictionary<int, (long critical, long lockWait, long ioWait, long total, double signal, long latch)>();
                try
                {
                    var waitRows = await sql.QueryAsync("""
                        SELECT w.InstanceID,
                            SUM(CASE WHEN wt.IsCriticalWait = 1 THEN w.wait_time_ms ELSE 0 END) AS CriticalWaitMs,
                            SUM(CASE WHEN wt.WaitType LIKE 'LCK%' THEN w.wait_time_ms ELSE 0 END) AS LockWaitMs,
                            SUM(CASE WHEN wt.WaitType LIKE 'PAGEIO%' OR wt.WaitType LIKE 'IO_%' OR wt.WaitType LIKE 'WRITELOG%' THEN w.wait_time_ms ELSE 0 END) AS IoWaitMs,
                            SUM(w.wait_time_ms) AS TotalWaitMs,
                            CASE WHEN SUM(w.wait_time_ms) > 0 THEN SUM(w.signal_wait_time_ms) * 100.0 / SUM(w.wait_time_ms) ELSE 0 END AS SignalWaitPct,
                            SUM(CASE WHEN wt.WaitType LIKE 'LATCH%' THEN w.wait_time_ms ELSE 0 END) AS LatchWaitMs
                        FROM dbo.Waits w
                        JOIN dbo.WaitType wt ON w.WaitTypeID = wt.WaitTypeID
                        WHERE w.SnapshotDate > DATEADD(hour, -1, GETUTCDATE()) AND wt.IsExcluded = 0
                        GROUP BY w.InstanceID
                        """, cancellationToken);
                    foreach (var row in waitRows)
                    {
                        waitData[Convert.ToInt32(row["InstanceID"])] = (
                            row["CriticalWaitMs"] is null ? 0 : Convert.ToInt64(row["CriticalWaitMs"]),
                            row["LockWaitMs"] is null ? 0 : Convert.ToInt64(row["LockWaitMs"]),
                            row["IoWaitMs"] is null ? 0 : Convert.ToInt64(row["IoWaitMs"]),
                            row["TotalWaitMs"] is null ? 0 : Convert.ToInt64(row["TotalWaitMs"]),
                            row["SignalWaitPct"] is null ? 0 : Convert.ToDouble(row["SignalWaitPct"]),
                            row["LatchWaitMs"] is null ? 0 : Convert.ToInt64(row["LatchWaitMs"]));
                    }
                }
                catch
                {
                }

                var result = instances.Select(instance =>
                {
                    var instanceId = Convert.ToInt32(instance["InstanceID"]!);
                    cpuData.TryGetValue(instanceId, out var cpu);
                    ioData.TryGetValue(instanceId, out var io);
                    waitData.TryGetValue(instanceId, out var wait);
                    return new Dictionary<string, object?>
                    {
                        ["instanceID"] = instanceId,
                        ["instanceDisplayName"] = instance["Name"],
                        ["avgCPU"] = Math.Round(cpu.avg, 0),
                        ["maxCPU"] = cpu.max,
                        ["maxTotalCPU"] = cpu.maxTotal,
                        ["criticalWaitMs"] = wait.critical,
                        ["lockWaitMs"] = wait.lockWait,
                        ["ioWaitMs"] = wait.ioWait,
                        ["totalWaitMs"] = wait.total,
                        ["signalWaitPct"] = Math.Round(wait.signal, 1),
                        ["latchWaitMs"] = wait.latch,
                        ["readLatency"] = Math.Round(io.readLatency, 2),
                        ["writeLatency"] = Math.Round(io.writeLatency, 2),
                        ["mBsec"] = Math.Round(io.mbPerSecond, 2),
                        ["iOPs"] = Math.Round(io.iops, 1)
                    };
                }).ToList();

                return Results.Ok(new { data = result, note = string.Empty });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { data = Array.Empty<object>(), note = ex.Message });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/dashboard/monitor", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                List<Dictionary<string, object?>> summary = [];
                try
                {
                    summary = await sql.SpAsync("dbo.Summary_Get", cancellationToken);
                }
                catch
                {
                }

                var instances = await sql.QueryAsync("""
                    SELECT i.InstanceID, COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           i.Edition, i.ProductVersion, i.cpu_count, i.physical_memory_kb,
                           i.sqlserver_start_time,
                           CASE WHEN cd.LastCollected > DATEADD(minute, -10, GETUTCDATE()) THEN 1 ELSE 0 END AS IsOnline
                    FROM dbo.Instances i
                    OUTER APPLY (
                        SELECT MAX(SnapshotDate) AS LastCollected
                        FROM dbo.CollectionDates c WHERE c.InstanceID = i.InstanceID
                    ) cd
                    WHERE i.IsActive = 1
                    ORDER BY COALESCE(i.InstanceDisplayName, i.Instance)
                    """, cancellationToken);

                var monitorAllowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                instances = instances.FilterByInstanceIds(monitorAllowedIds);
                summary = summary.FilterByInstanceIds(monitorAllowedIds);

                var cpuMap = new Dictionary<int, (double sqlCpu, double systemCpu)>();
                var cpuRows = await sql.QueryAsync("""
                    SELECT c.InstanceID,
                           AVG(CAST(c.SQLProcessCPU AS FLOAT)) AS AvgCPU,
                           AVG(CAST((100 - c.SystemIdleCPU - c.SQLProcessCPU) AS FLOAT)) AS SysCPU
                    FROM dbo.CPU c
                    WHERE c.EventTime >= DATEADD(minute, -5, GETUTCDATE())
                    GROUP BY c.InstanceID
                    """, cancellationToken);
                foreach (var row in cpuRows)
                {
                    cpuMap[Convert.ToInt32(row["InstanceID"])] = (
                        row["AvgCPU"] is null ? 0 : Math.Round(Convert.ToDouble(row["AvgCPU"]), 1),
                        row["SysCPU"] is null ? 0 : Math.Round(Convert.ToDouble(row["SysCPU"]), 1));
                }

                var waitsMap = new Dictionary<int, double>();
                try
                {
                    var waitRows = await sql.QueryAsync("""
                        SELECT InstanceID,
                               SUM(CAST(wait_time_ms AS FLOAT)) / 1000.0 AS WaitSec
                        FROM dbo.Waits
                        WHERE SnapshotDate >= DATEADD(minute, -5, GETUTCDATE())
                        GROUP BY InstanceID
                        """, cancellationToken);
                    foreach (var row in waitRows)
                    {
                        waitsMap[Convert.ToInt32(row["InstanceID"])] = row["WaitSec"] is null ? 0 : Math.Round(Convert.ToDouble(row["WaitSec"]), 0);
                    }
                }
                catch
                {
                }

                var ioMap = new Dictionary<int, double>();
                try
                {
                    var ioRows = await sql.QueryAsync("""
                        SELECT io.InstanceID,
                               SUM(CAST(COALESCE(io.num_of_bytes_read, 0) + COALESCE(io.num_of_bytes_written, 0) AS FLOAT)) / 1024.0 AS DiskIOKB
                        FROM dbo.DBIOStats io
                        WHERE io.SnapshotDate >= DATEADD(minute, -5, GETUTCDATE())
                        GROUP BY io.InstanceID
                        """, cancellationToken);
                    foreach (var row in ioRows)
                    {
                        ioMap[Convert.ToInt32(row["InstanceID"])] = row["DiskIOKB"] is null ? 0 : Math.Round(Convert.ToDouble(row["DiskIOKB"]), 0);
                    }
                }
                catch
                {
                }

                var agMap = new Dictionary<int, (string name, string role)>();
                try
                {
                    var agRows = await sql.QueryAsync("""
                        SELECT DISTINCT ar.InstanceID, ag.name AS group_name
                        FROM dbo.AvailabilityReplicas ar
                        JOIN dbo.AvailabilityGroups ag ON ar.group_id = ag.group_id
                        WHERE ar.InstanceID IS NOT NULL
                        """, cancellationToken);
                    foreach (var row in agRows)
                    {
                        agMap[Convert.ToInt32(row["InstanceID"])] = (row["group_name"]?.ToString() ?? string.Empty, string.Empty);
                    }
                }
                catch
                {
                }

                List<Dictionary<string, object?>> alerts = [];
                try
                {
                    alerts = await sql.QueryAsync("""
                        SELECT TOP 100 InstanceID, ErrorDate, ErrorMessage, ErrorContext
                        FROM dbo.CollectionErrorLog
                        ORDER BY ErrorDate DESC
                        """, cancellationToken);
                }
                catch
                {
                }

                var summaryMap = new Dictionary<int, Dictionary<string, object?>>();
                foreach (var row in summary)
                {
                    if (row.TryGetValue("InstanceID", out var value) && value is not null)
                    {
                        summaryMap[Convert.ToInt32(value)] = row;
                    }
                }

                var result = instances.Select(instance =>
                {
                    var instanceId = Convert.ToInt32(instance["InstanceID"]);
                    cpuMap.TryGetValue(instanceId, out var cpu);
                    summaryMap.TryGetValue(instanceId, out var summaryRow);
                    var activeAlerts = new List<string>();
                    if (summaryRow is not null)
                    {
                        CollectAlert(activeAlerts, summaryRow, "FullBackupStatus", "Backup");
                        CollectAlert(activeAlerts, summaryRow, "DriveStatus", "Disk space");
                        CollectAlert(activeAlerts, summaryRow, "JobStatus", "Job failing");
                        CollectAlert(activeAlerts, summaryRow, "AGStatus", "AG");
                        CollectAlert(activeAlerts, summaryRow, "CorruptionStatus", "Corruption");
                        CollectAlert(activeAlerts, summaryRow, "LogBackupStatus", "Log backup");
                    }

                    var ag = agMap.GetValueOrDefault(instanceId, (name: string.Empty, role: string.Empty));
                    return new
                    {
                        instanceId,
                        instanceName = instance["InstanceName"],
                        edition = instance["Edition"],
                        productVersion = instance["ProductVersion"],
                        cpuCount = instance["cpu_count"],
                        memoryKb = instance["physical_memory_kb"],
                        startTime = instance["sqlserver_start_time"],
                        isOnline = Convert.ToInt32(instance["IsOnline"] ?? 0) == 1,
                        sqlCpu = cpu.sqlCpu,
                        sysCpu = cpu.systemCpu,
                        waitMs = waitsMap.GetValueOrDefault(instanceId, 0),
                        diskIOKB = ioMap.GetValueOrDefault(instanceId, 0),
                        agName = ag.name,
                        agRole = ag.role,
                        status = GetWorstStatus(summaryRow),
                        activeAlerts
                    };
                }).ToList();

                var alertCounts = new Dictionary<string, int>
                {
                    ["Monitoring stopped"] = result.Count(row => !row.isOnline),
                    ["Backup"] = result.Count(row => row.activeAlerts.Contains("Backup")),
                    ["Job failing"] = result.Count(row => row.activeAlerts.Contains("Job failing")),
                    ["Disk space"] = result.Count(row => row.activeAlerts.Contains("Disk space")),
                    ["AG"] = result.Count(row => row.activeAlerts.Contains("AG")),
                    ["Corruption"] = result.Count(row => row.activeAlerts.Contains("Corruption")),
                    ["Log backup"] = result.Count(row => row.activeAlerts.Contains("Log backup"))
                };

                return Results.Ok(new { instances = result, alertCounts, recentErrors = alerts.Take(20) });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message });
            }
        }).RequireAuthorization();

        return endpoints;
    }

    private static void CollectAlert(List<string> alerts, IReadOnlyDictionary<string, object?> summary, string key, string label)
    {
        if (summary.TryGetValue(key, out var value) && value is not null)
        {
            var status = Convert.ToInt32(value);
            if (status is 1 or 2)
            {
                alerts.Add(label);
            }
        }
    }

    private static int GetWorstStatus(IReadOnlyDictionary<string, object?>? row)
    {
        if (row is null)
        {
            return 4;
        }

        var worst = 4;
        foreach (var key in SummaryStatusKeys)
        {
            if (!row.TryGetValue(key, out var value) || value is null)
            {
                continue;
            }

            var status = Convert.ToInt32(value);
            if (status == 3)
            {
                continue;
            }

            if (status < worst)
            {
                worst = status;
            }
        }

        return worst;
    }
}

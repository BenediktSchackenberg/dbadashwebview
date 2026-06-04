using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;
using Microsoft.Data.SqlClient;

namespace DBADashWebView.Endpoints;

public static class ReportEndpointMappings
{
    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/reports/licenses", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                var data = await QueryWithFallbackAsync(
                    sql,
                    cancellationToken,
                    """
                    SELECT i.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           i.Edition, i.ProductVersion, i.ProductMajorVersion,
                           i.cpu_count, i.cores_per_socket, i.socket_count,
                           i.physical_memory_kb,
                           i.sqlserver_start_time,
                           i.LicenseType
                    FROM dbo.InstanceInfo i
                    WHERE i.IsActive = 1
                    ORDER BY i.ProductMajorVersion DESC, COALESCE(i.InstanceDisplayName, i.Instance)
                    """,
                    """
                    SELECT i.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           i.Edition, i.ProductVersion, i.ProductMajorVersion,
                           i.cpu_count, NULL AS cores_per_socket, NULL AS socket_count,
                           i.physical_memory_kb,
                           i.sqlserver_start_time,
                           NULL AS LicenseType
                    FROM dbo.Instances i
                    WHERE i.IsActive = 1
                    ORDER BY i.ProductMajorVersion DESC, COALESCE(i.InstanceDisplayName, i.Instance)
                    """);

                return Results.Ok(data.FilterByInstanceIds(allowedIds));
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/reports/underutilized", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                var data = await QueryWithFallbackAsync(
                    sql,
                    cancellationToken,
                    """
                    SELECT i.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           i.Edition, i.ProductVersion, i.cpu_count, i.socket_count, i.cores_per_socket,
                           i.physical_memory_kb,
                           AVG(CAST(c.SQLProcessCPU AS float)) AS AvgCPU,
                           MAX(c.SQLProcessCPU) AS MaxCPU
                    FROM dbo.InstanceInfo i
                    JOIN dbo.CPU c ON i.InstanceID = c.InstanceID
                    WHERE c.EventTime >= DATEADD(day, -14, GETUTCDATE())
                      AND i.IsActive = 1
                    GROUP BY i.InstanceID, i.InstanceDisplayName, i.Instance, i.Edition,
                             i.ProductVersion, i.cpu_count, i.socket_count, i.cores_per_socket, i.physical_memory_kb
                    HAVING AVG(CAST(c.SQLProcessCPU AS float)) < 5
                    ORDER BY AVG(CAST(c.SQLProcessCPU AS float)) ASC
                    """,
                    """
                    SELECT i.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           i.Edition, i.ProductVersion, i.cpu_count, NULL AS socket_count, NULL AS cores_per_socket,
                           i.physical_memory_kb,
                           AVG(CAST(c.SQLProcessCPU AS float)) AS AvgCPU,
                           MAX(c.SQLProcessCPU) AS MaxCPU
                    FROM dbo.Instances i
                    JOIN dbo.CPU c ON i.InstanceID = c.InstanceID
                    WHERE c.EventTime >= DATEADD(day, -14, GETUTCDATE())
                      AND i.IsActive = 1
                    GROUP BY i.InstanceID, i.InstanceDisplayName, i.Instance, i.Edition,
                             i.ProductVersion, i.cpu_count, i.physical_memory_kb
                    HAVING AVG(CAST(c.SQLProcessCPU AS float)) < 5
                    ORDER BY AVG(CAST(c.SQLProcessCPU AS float)) ASC
                    """);

                return Results.Ok(data.FilterByInstanceIds(allowedIds));
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/reports/fleet-stats", async (int? hours, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveHours = Math.Min(hours ?? 24, 336);

            try
            {
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                var cpuData = await QueryWithFallbackAsync(
                    sql,
                    cancellationToken,
                    """
                    SELECT i.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           i.Edition, i.ProductVersion,
                           i.cpu_count, i.physical_memory_kb,
                           AVG(CAST(c.SQLProcessCPU AS float)) AS AvgCPU24h,
                           MAX(c.SQLProcessCPU) AS MaxCPU24h
                    FROM dbo.InstanceInfo i
                    LEFT JOIN dbo.CPU c ON i.InstanceID = c.InstanceID AND c.EventTime >= DATEADD(hour, -@hours, GETUTCDATE())
                    WHERE i.IsActive = 1
                    GROUP BY i.InstanceID, i.InstanceDisplayName, i.Instance, i.Edition, i.ProductVersion, i.cpu_count, i.physical_memory_kb
                    ORDER BY AVG(CAST(c.SQLProcessCPU AS float)) DESC
                    """,
                    """
                    SELECT i.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           i.Edition, i.ProductVersion,
                           i.cpu_count, i.physical_memory_kb,
                           AVG(CAST(c.SQLProcessCPU AS float)) AS AvgCPU24h,
                           MAX(c.SQLProcessCPU) AS MaxCPU24h
                    FROM dbo.Instances i
                    LEFT JOIN dbo.CPU c ON i.InstanceID = c.InstanceID AND c.EventTime >= DATEADD(hour, -@hours, GETUTCDATE())
                    WHERE i.IsActive = 1
                    GROUP BY i.InstanceID, i.InstanceDisplayName, i.Instance, i.Edition, i.ProductVersion, i.cpu_count, i.physical_memory_kb
                    ORDER BY AVG(CAST(c.SQLProcessCPU AS float)) DESC
                    """,
                    ("@hours", effectiveHours));

                var storageData = new Dictionary<int, (long capacity, long free, long used)>();
                try
                {
                    var storageRows = await sql.QueryAsync(
                        """
                        SELECT d.InstanceID,
                               SUM(d.Capacity) AS TotalCapacity,
                               SUM(d.FreeSpace) AS TotalFree
                        FROM dbo.Drives d
                        WHERE d.IsActive = 1
                        GROUP BY d.InstanceID
                        """,
                        cancellationToken);

                    foreach (var row in storageRows)
                    {
                        var instanceId = Convert.ToInt32(row["InstanceID"]);
                        var capacity = row["TotalCapacity"] != null ? Convert.ToInt64(row["TotalCapacity"]) : 0;
                        var free = row["TotalFree"] != null ? Convert.ToInt64(row["TotalFree"]) : 0;
                        storageData[instanceId] = (capacity, free, capacity - free);
                    }
                }
                catch
                {
                }

                var result = cpuData.Select(row =>
                {
                    var instanceId = Convert.ToInt32(row["InstanceID"]);
                    storageData.TryGetValue(instanceId, out var storage);
                    row["TotalCapacity"] = storage.capacity;
                    row["TotalFree"] = storage.free;
                    row["TotalUsed"] = storage.used;
                    return row;
                }).ToList();

                return Results.Ok(result.FilterByInstanceIds(allowedIds));
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/backups/management", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                await using var connection = await sql.OpenConnectionAsync(cancellationToken);

                await using var backupCommand = new SqlCommand(
                    """
                    ;WITH LatestBackups AS (
                        SELECT b.DatabaseID, b.type, b.backup_start_date, b.backup_finish_date,
                               b.backup_size, b.compressed_backup_size,
                               ROW_NUMBER() OVER (PARTITION BY b.DatabaseID, b.type ORDER BY b.backup_start_date DESC) AS rn
                        FROM dbo.Backups b
                    ),
                    DbBackups AS (
                        SELECT d.InstanceID, d.DatabaseID, d.name AS DatabaseName,
                               lb.type, lb.backup_start_date, lb.backup_finish_date,
                               lb.backup_size, lb.compressed_backup_size,
                               DATEDIFF(second, lb.backup_start_date, lb.backup_finish_date) AS backup_duration_sec
                        FROM dbo.Databases d
                        LEFT JOIN LatestBackups lb ON d.DatabaseID = lb.DatabaseID AND lb.rn = 1
                        WHERE d.IsActive = 1
                    )
                    SELECT i.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           i.Edition,
                           db.DatabaseID, db.DatabaseName, db.type,
                           db.backup_start_date, db.backup_finish_date,
                           db.backup_size, db.compressed_backup_size, db.backup_duration_sec
                    FROM dbo.Instances i
                    JOIN DbBackups db ON i.InstanceID = db.InstanceID
                    WHERE i.IsActive = 1
                    ORDER BY COALESCE(i.InstanceDisplayName, i.Instance), db.DatabaseName, db.type
                    """,
                    connection)
                {
                    CommandTimeout = 120
                };
                var backupRows = await EndpointResultMapper.ReadRowsAsync(backupCommand, cancellationToken);
                backupRows = backupRows.FilterByInstanceIds(allowedIds);

                await using var cpuCommand = new SqlCommand(
                    """
                    SELECT c.InstanceID, AVG(CAST(c.SQLProcessCPU AS float)) AS AvgCPU24h
                    FROM dbo.CPU c
                    WHERE c.EventTime >= DATEADD(hour, -24, GETUTCDATE())
                    GROUP BY c.InstanceID
                    """,
                    connection)
                {
                    CommandTimeout = 60
                };
                var cpuRows = await EndpointResultMapper.ReadRowsAsync(cpuCommand, cancellationToken);
                cpuRows = cpuRows.FilterByInstanceIds(allowedIds);

                var cpuByInstance = cpuRows.Select(row => new
                {
                    instanceId = Convert.ToInt32(row["InstanceID"]),
                    avgCpu24h = Math.Round(row["AvgCPU24h"] != null ? Convert.ToDouble(row["AvgCPU24h"]) : 0, 1)
                }).ToList();

                await using var statsCommand = new SqlCommand(
                    """
                    SELECT COUNT(*) AS BackupCount24h,
                           SUM(backup_size) AS TotalSize24h,
                           AVG(DATEDIFF(second, backup_start_date, backup_finish_date)) AS AvgDurationSec24h
                    FROM dbo.Backups
                    WHERE backup_start_date >= DATEADD(hour, -24, GETUTCDATE())
                    """,
                    connection)
                {
                    CommandTimeout = 60
                };
                var statsRows = await EndpointResultMapper.ReadRowsAsync(statsCommand, cancellationToken);
                var statsRow = statsRows.FirstOrDefault();

                return Results.Ok(new
                {
                    backups = backupRows.Select(row => new
                    {
                        instanceId = Convert.ToInt32(row["InstanceID"]),
                        instanceName = row["InstanceName"]?.ToString(),
                        edition = row["Edition"]?.ToString(),
                        databaseId = row["DatabaseID"] != null ? Convert.ToInt32(row["DatabaseID"]) : (int?)null,
                        databaseName = row["DatabaseName"]?.ToString(),
                        type = row["type"]?.ToString()?.Trim(),
                        backupStartDate = row["backup_start_date"],
                        backupFinishDate = row["backup_finish_date"],
                        backupSize = row["backup_size"],
                        compressedBackupSize = row["compressed_backup_size"],
                        backupDurationSec = row["backup_duration_sec"] != null ? Convert.ToInt32(row["backup_duration_sec"]) : (int?)null
                    }).ToList(),
                    cpuByInstance,
                    stats = new
                    {
                        backupCount24h = statsRow?["BackupCount24h"] != null ? Convert.ToInt32(statsRow["BackupCount24h"]) : 0,
                        totalSize24h = statsRow?["TotalSize24h"] != null ? Convert.ToDecimal(statsRow["TotalSize24h"]) : 0m,
                        avgDurationSec24h = statsRow?["AvgDurationSec24h"] != null ? Convert.ToInt32(statsRow["AvgDurationSec24h"]) : 0
                    }
                });
            }
            catch (Exception ex)
            {
                return Results.Ok(new
                {
                    error = ex.Message,
                    backups = Array.Empty<object>(),
                    cpuByInstance = Array.Empty<object>(),
                    stats = new { backupCount24h = 0, totalSize24h = 0m, avgDurationSec24h = 0 }
                });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/reports/backup-ampel", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                List<Dictionary<string, object?>> instances;
                try
                {
                    instances = await sql.QueryAsync(
                        """
                        ;WITH PerDbFull AS (
                            SELECT d.InstanceID, d.DatabaseID,
                                   MAX(b.backup_start_date) AS LatestFull
                            FROM dbo.Databases d
                            LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                            LEFT JOIN dbo.Backups b ON d.DatabaseID = b.DatabaseID AND b.type = 'D'
                            WHERE d.IsActive = 1 AND d.name NOT IN ('master','model','msdb','tempdb')
                              AND (h.is_primary_replica IS NULL OR h.is_primary_replica = 1)
                            GROUP BY d.InstanceID, d.DatabaseID
                        ),
                        PerDbLog AS (
                            SELECT d.InstanceID, d.DatabaseID,
                                   MAX(b.backup_start_date) AS LatestLog
                            FROM dbo.Databases d
                            LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                            LEFT JOIN dbo.Backups b ON d.DatabaseID = b.DatabaseID AND b.type = 'L'
                            WHERE d.IsActive = 1 AND d.name NOT IN ('master','model','msdb','tempdb')
                              AND (h.is_primary_replica IS NULL OR h.is_primary_replica = 1)
                              AND d.recovery_model IN (1, 2)
                            GROUP BY d.InstanceID, d.DatabaseID
                        )
                        SELECT i.InstanceID,
                               COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                               i.Edition, i.ProductVersion,
                               (SELECT COUNT(*) FROM dbo.Databases d2
                                LEFT JOIN dbo.DatabasesHADR h2 ON d2.DatabaseID = h2.DatabaseID AND h2.is_local = 1
                                WHERE d2.InstanceID = i.InstanceID AND d2.IsActive = 1 AND d2.name NOT IN ('master','model','msdb','tempdb')
                                  AND (h2.is_primary_replica IS NULL OR h2.is_primary_replica = 1)) AS DatabaseCount,
                               MIN(pf.LatestFull) AS LastFullBackup,
                               MIN(pl.LatestLog) AS LastLogBackup,
                               MAX(pf.LatestFull) AS NewestFullBackup,
                               MAX(pl.LatestLog) AS NewestLogBackup,
                               ISNULL((SELECT SUM(CAST(COALESCE(b.backup_size, 0) AS float) / 1024 / 1024 / 1024)
                                FROM dbo.Backups b
                                JOIN dbo.Databases d ON b.DatabaseID = d.DatabaseID
                                LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                                WHERE d.InstanceID = i.InstanceID AND d.IsActive = 1
                                  AND d.name NOT IN ('master','model','msdb','tempdb')
                                  AND (h.is_primary_replica IS NULL OR h.is_primary_replica = 1)
                                  AND b.backup_start_date >= DATEADD(hour, -24, GETUTCDATE())), 0) AS BackupVolumeGB24h,
                               (SELECT COUNT(DISTINCT b.DatabaseID)
                                FROM dbo.Backups b
                                JOIN dbo.Databases d ON b.DatabaseID = d.DatabaseID
                                LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                                WHERE d.InstanceID = i.InstanceID AND d.IsActive = 1
                                  AND d.name NOT IN ('master','model','msdb','tempdb')
                                  AND (h.is_primary_replica IS NULL OR h.is_primary_replica = 1)
                                  AND b.backup_start_date >= DATEADD(hour, -24, GETUTCDATE())) AS BackedUpDBs24h,
                               (SELECT COUNT(*) FROM PerDbFull pf2
                                WHERE pf2.InstanceID = i.InstanceID
                                  AND (pf2.LatestFull IS NULL OR pf2.LatestFull < DATEADD(hour, -24, GETUTCDATE()))) AS DbsWithOldFullBackup,
                               (SELECT COUNT(*) FROM PerDbLog pl2
                                WHERE pl2.InstanceID = i.InstanceID
                                  AND (pl2.LatestLog IS NULL OR pl2.LatestLog < DATEADD(minute, -30, GETUTCDATE()))) AS DbsWithOldLogBackup
                        FROM dbo.Instances i
                        LEFT JOIN PerDbFull pf ON i.InstanceID = pf.InstanceID
                        LEFT JOIN PerDbLog pl ON i.InstanceID = pl.InstanceID
                        WHERE i.IsActive = 1
                        GROUP BY i.InstanceID, i.InstanceDisplayName, i.Instance, i.Edition, i.ProductVersion
                        ORDER BY COALESCE(i.InstanceDisplayName, i.Instance)
                        """,
                        cancellationToken);
                }
                catch
                {
                    instances = await sql.QueryAsync(
                        """
                        SELECT i.InstanceID,
                               COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                               i.Edition, i.ProductVersion,
                               (SELECT COUNT(*) FROM dbo.Databases d2
                                LEFT JOIN dbo.DatabasesHADR h2 ON d2.DatabaseID = h2.DatabaseID AND h2.is_local = 1
                                WHERE d2.InstanceID = i.InstanceID AND d2.IsActive = 1 AND d2.name NOT IN ('master','model','msdb','tempdb')
                                  AND (h2.is_primary_replica IS NULL OR h2.is_primary_replica = 1)) AS DatabaseCount,
                               NULL AS LastFullBackup, NULL AS LastDiffBackup, NULL AS LastLogBackup,
                               0 AS BackupVolumeGB24h, 0 AS BackedUpDBs24h
                        FROM dbo.Instances i
                        WHERE i.IsActive = 1
                        ORDER BY COALESCE(i.InstanceDisplayName, i.Instance)
                        """,
                        cancellationToken);
                }

                var logIntervalsByInstance = new Dictionary<int, (double average, int maximum)>();
                try
                {
                    var logStats = await sql.QueryAsync(
                        """
                        ;WITH LogBackups AS (
                            SELECT b.DatabaseID, d.InstanceID, b.backup_start_date,
                                   LAG(b.backup_start_date) OVER (PARTITION BY b.DatabaseID ORDER BY b.backup_start_date) AS prev_backup
                            FROM dbo.Backups b
                            JOIN dbo.Databases d ON b.DatabaseID = d.DatabaseID
                            WHERE b.type = 'L' AND b.backup_start_date >= DATEADD(hour, -24, GETUTCDATE())
                        )
                        SELECT InstanceID,
                               AVG(CAST(DATEDIFF(minute, prev_backup, backup_start_date) AS float)) AS AvgLogIntervalMin,
                               MAX(DATEDIFF(minute, prev_backup, backup_start_date)) AS MaxLogIntervalMin
                        FROM LogBackups
                        WHERE prev_backup IS NOT NULL
                        GROUP BY InstanceID
                        """,
                        cancellationToken);

                    foreach (var row in logStats)
                    {
                        var instanceId = Convert.ToInt32(row["InstanceID"]);
                        var average = row["AvgLogIntervalMin"] != null ? Convert.ToDouble(row["AvgLogIntervalMin"]) : 0;
                        var maximum = row["MaxLogIntervalMin"] != null ? Convert.ToInt32(row["MaxLogIntervalMin"]) : 0;
                        logIntervalsByInstance[instanceId] = (average, maximum);
                    }
                }
                catch
                {
                }

                var databaseDetails = new List<Dictionary<string, object?>>();
                try
                {
                    databaseDetails = await sql.QueryAsync(
                        """
                        ;WITH LatestBackups AS (
                            SELECT b.DatabaseID, b.type, b.backup_start_date, b.backup_size,
                                   ROW_NUMBER() OVER (PARTITION BY b.DatabaseID, b.type ORDER BY b.backup_start_date DESC) AS rn
                            FROM dbo.Backups b
                        )
                        SELECT d.InstanceID, d.DatabaseID, d.name AS DatabaseName,
                               CASE d.recovery_model WHEN 1 THEN 'FULL' WHEN 2 THEN 'BULK_LOGGED' WHEN 3 THEN 'SIMPLE' ELSE 'UNKNOWN' END AS RecoveryModel,
                               d.compatibility_level AS CompatLevel,
                               d.is_encrypted AS IsEncrypted,
                               h.is_primary_replica AS IsPrimaryReplica,
                               ag.name AS AGName,
                               f.backup_start_date AS LastFullDate, f.backup_size AS FullBackupSize,
                               df.backup_start_date AS LastDiffDate,
                               l.backup_start_date AS LastLogDate
                        FROM dbo.Databases d
                        LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                        LEFT JOIN dbo.AvailabilityGroups ag ON h.group_id = ag.group_id AND ag.InstanceID = d.InstanceID
                        LEFT JOIN LatestBackups f ON d.DatabaseID = f.DatabaseID AND f.type = 'D' AND f.rn = 1
                        LEFT JOIN LatestBackups df ON d.DatabaseID = df.DatabaseID AND df.type = 'I' AND df.rn = 1
                        LEFT JOIN LatestBackups l ON d.DatabaseID = l.DatabaseID AND l.type = 'L' AND l.rn = 1
                        WHERE d.IsActive = 1 AND d.name NOT IN ('master','model','msdb','tempdb')
                        ORDER BY d.InstanceID, d.name
                        """,
                        cancellationToken);
                }
                catch
                {
                    try
                    {
                        databaseDetails = await sql.QueryAsync(
                            """
                            ;WITH LatestBackups AS (
                                SELECT b.DatabaseID, b.type, b.backup_start_date, b.backup_size,
                                       ROW_NUMBER() OVER (PARTITION BY b.DatabaseID, b.type ORDER BY b.backup_start_date DESC) AS rn
                                FROM dbo.Backups b
                            )
                            SELECT d.InstanceID, d.DatabaseID, d.name AS DatabaseName,
                                   h.is_primary_replica AS IsPrimaryReplica,
                                   f.backup_start_date AS LastFullDate, f.backup_size AS FullBackupSize,
                                   df.backup_start_date AS LastDiffDate,
                                   l.backup_start_date AS LastLogDate
                            FROM dbo.Databases d
                            LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                            LEFT JOIN LatestBackups f ON d.DatabaseID = f.DatabaseID AND f.type = 'D' AND f.rn = 1
                            LEFT JOIN LatestBackups df ON d.DatabaseID = df.DatabaseID AND df.type = 'I' AND df.rn = 1
                            LEFT JOIN LatestBackups l ON d.DatabaseID = l.DatabaseID AND l.type = 'L' AND l.rn = 1
                            WHERE d.IsActive = 1 AND d.name NOT IN ('master','model','msdb','tempdb')
                            ORDER BY d.InstanceID, d.name
                            """,
                            cancellationToken);
                    }
                    catch
                    {
                    }
                }

                var result = instances.Select(row =>
                {
                    var instanceId = Convert.ToInt32(row["InstanceID"]);
                    if (logIntervalsByInstance.TryGetValue(instanceId, out var interval))
                    {
                        row["AvgLogIntervalMin"] = Math.Round(interval.average, 1);
                        row["MaxLogIntervalMin"] = interval.maximum;
                    }
                    else
                    {
                        row["AvgLogIntervalMin"] = null;
                        row["MaxLogIntervalMin"] = null;
                    }

                    return row;
                }).ToList();

                return Results.Ok(new { instances = result.FilterByInstanceIds(allowedIds), databases = databaseDetails.FilterByInstanceIds(allowedIds) });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, instances = Array.Empty<object>(), databases = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/debug/summary/{id:int}", async (int id, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(id, sql, cancellationToken);
            if (deny is not null)
            {
                return deny;
            }
            try
            {
                var raw = await sql.QueryAsync(
                    """
                    SELECT *
                    FROM dbo.Summary
                    WHERE InstanceID = @id
                    """,
                    cancellationToken,
                    ("@id", id));

                return Results.Ok(raw.Count > 0 ? raw[0] : new Dictionary<string, object?> { ["error"] = "No summary row for this instance" });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message });
            }
        }).RequireAuthorization(AppPolicies.AdminOnly);

        return endpoints;
    }

    private static async Task<List<Dictionary<string, object?>>> QueryWithFallbackAsync(
        SqlDataService sql,
        CancellationToken cancellationToken,
        string primarySql,
        string fallbackSql,
        params (string name, object? value)[] parameters)
    {
        try
        {
            return await sql.QueryAsync(primarySql, cancellationToken, parameters);
        }
        catch
        {
            return await sql.QueryAsync(fallbackSql, cancellationToken, parameters);
        }
    }
}

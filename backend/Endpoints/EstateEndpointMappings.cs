using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;
using Microsoft.Data.SqlClient;

namespace DBADashWebView.Endpoints;

public static class EstateEndpointMappings
{
    public static IEndpointRouteBuilder MapEstateEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/backups/estate", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                await using var connection = await sql.OpenConnectionAsync(cancellationToken);
                await using var command = new SqlCommand(
                    """
                    ;WITH LatestFull AS (
                        SELECT DatabaseID, backup_start_date, backup_size, compressed_backup_size,
                               ROW_NUMBER() OVER (PARTITION BY DatabaseID ORDER BY backup_start_date DESC) AS rn
                        FROM dbo.Backups WHERE type='D'
                    ), LatestDiff AS (
                        SELECT DatabaseID, backup_start_date,
                               ROW_NUMBER() OVER (PARTITION BY DatabaseID ORDER BY backup_start_date DESC) AS rn
                        FROM dbo.Backups WHERE type='I'
                    ), LatestLog AS (
                        SELECT DatabaseID, backup_start_date,
                               ROW_NUMBER() OVER (PARTITION BY DatabaseID ORDER BY backup_start_date DESC) AS rn
                        FROM dbo.Backups WHERE type='L'
                    )
                    SELECT i.InstanceID, COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           d.DatabaseID, d.name AS DatabaseName,
                           f.backup_start_date AS FullBackupDate, f.backup_size AS FullBackupSize,
                           df.backup_start_date AS DiffBackupDate,
                           l.backup_start_date AS LogBackupDate
                    FROM dbo.Instances i
                    JOIN dbo.Databases d ON i.InstanceID = d.InstanceID
                    LEFT JOIN LatestFull f ON d.DatabaseID = f.DatabaseID AND f.rn = 1
                    LEFT JOIN LatestDiff df ON d.DatabaseID = df.DatabaseID AND df.rn = 1
                    LEFT JOIN LatestLog l ON d.DatabaseID = l.DatabaseID AND l.rn = 1
                    WHERE i.IsActive = 1 AND d.IsActive = 1
                    ORDER BY COALESCE(i.InstanceDisplayName, i.Instance), d.name
                    """,
                    connection)
                {
                    CommandTimeout = 60
                };

                var data = await EndpointResultMapper.ReadRowsAsync(command, cancellationToken, camelCase: true);
                return Results.Ok(data.FilterByInstanceIds(allowedIds, instanceIdKey: "instanceID"));
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/drives", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("d.InstanceID");
                var data = await sql.QueryAsync(
                    $"""
                    SELECT d.*, i.InstanceDisplayName
                    FROM dbo.Drives d
                    JOIN dbo.Instances i ON d.InstanceID = i.InstanceID
                    WHERE d.IsActive = 1 {scopeSnippet}
                    """,
                    cancellationToken,
                    scopeParameters);
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        // Real growth for a chosen set of drives, backed by dbo.DriveSnapshot (a row
        // per drive per collection cycle) rather than a guessed/linear projection.
        // Returns the oldest and newest snapshot within the window per drive; the
        // caller derives a rate/projection from those two real data points.
        endpoints.MapGet("/api/drives/growth", async (string? driveIds, int? days, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var ids = ParseDriveIds(driveIds);

            if (ids.Count == 0)
            {
                return Results.Ok(new { data = Array.Empty<object>() });
            }

            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("d.InstanceID");
                var idParamNames = ids.Select((_, index) => $"@id{index}").ToArray();
                var idParams = ids.Select((driveId, index) => ($"@id{index}", (object?)driveId)).ToArray();
                var fromDate = DateTime.UtcNow.AddDays(-ClampGrowthWindowDays(days));

                await using var connection = await sql.OpenConnectionAsync(cancellationToken);
                await using var command = new SqlCommand(
                    $"""
                    WITH bounds AS (
                        SELECT s.DriveID, s.SnapshotDate, s.Capacity, s.FreeSpace,
                               ROW_NUMBER() OVER (PARTITION BY s.DriveID ORDER BY s.SnapshotDate ASC) AS rn_asc,
                               ROW_NUMBER() OVER (PARTITION BY s.DriveID ORDER BY s.SnapshotDate DESC) AS rn_desc,
                               COUNT(*) OVER (PARTITION BY s.DriveID) AS pointCount
                        FROM dbo.DriveSnapshot s
                        JOIN dbo.Drives d ON d.DriveID = s.DriveID
                        WHERE s.DriveID IN ({string.Join(", ", idParamNames)})
                          AND s.SnapshotDate >= @fromDate
                          AND d.IsActive = 1
                          {scopeSnippet}
                    )
                    SELECT DriveID,
                           MAX(pointCount) AS DataPoints,
                           MAX(CASE WHEN rn_asc = 1 THEN SnapshotDate END) AS OldestSnapshotDate,
                           MAX(CASE WHEN rn_asc = 1 THEN FreeSpace END) AS OldestFreeSpace,
                           MAX(CASE WHEN rn_desc = 1 THEN SnapshotDate END) AS LatestSnapshotDate,
                           MAX(CASE WHEN rn_desc = 1 THEN FreeSpace END) AS LatestFreeSpace,
                           MAX(CASE WHEN rn_desc = 1 THEN Capacity END) AS LatestCapacity
                    FROM bounds
                    WHERE rn_asc = 1 OR rn_desc = 1
                    GROUP BY DriveID
                    """,
                    connection)
                {
                    CommandTimeout = 30
                };
                command.Parameters.AddWithValue("@fromDate", fromDate);
                foreach (var (name, value) in idParams)
                {
                    command.Parameters.AddWithValue(name, value ?? DBNull.Value);
                }
                foreach (var (name, value) in scopeParameters)
                {
                    command.Parameters.AddWithValue(name, value ?? DBNull.Value);
                }

                var data = await EndpointResultMapper.ReadRowsAsync(command, cancellationToken, camelCase: true);
                return Results.Ok(new { data });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/tree", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("i.InstanceID");
                var rows = await sql.QueryAsync(
                    $"""
                    SELECT i.InstanceID, COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           i.ProductVersion, i.ProductMajorVersion,
                           d.DatabaseID, d.name AS DatabaseName,
                           CASE WHEN d.database_id <= 4 THEN 1 ELSE 0 END AS IsSystem
                    FROM dbo.Instances i
                    LEFT JOIN dbo.Databases d ON i.InstanceID = d.InstanceID AND d.IsActive = 1
                    WHERE i.IsActive = 1 {scopeSnippet}
                    ORDER BY COALESCE(i.InstanceDisplayName, i.Instance),
                             CASE WHEN d.database_id <= 4 THEN 0 ELSE 1 END, d.name
                    """,
                    cancellationToken,
                    scopeParameters);

                var instances = new Dictionary<int, Dictionary<string, object?>>();
                var databasesByInstance = new Dictionary<int, List<object>>();

                foreach (var row in rows)
                {
                    var instanceId = Convert.ToInt32(row["InstanceID"]);
                    if (!instances.ContainsKey(instanceId))
                    {
                        instances[instanceId] = new Dictionary<string, object?>
                        {
                            ["instanceId"] = instanceId,
                            ["instanceName"] = row["InstanceName"],
                            ["productVersion"] = row["ProductVersion"],
                            ["productMajorVersion"] = row["ProductMajorVersion"] != null ? Convert.ToInt32(row["ProductMajorVersion"]) : 0
                        };
                        databasesByInstance[instanceId] = new List<object>();
                    }

                    if (row["DatabaseID"] != null)
                    {
                        databasesByInstance[instanceId].Add(new
                        {
                            databaseId = Convert.ToInt32(row["DatabaseID"]),
                            name = row["DatabaseName"]?.ToString(),
                            isSystem = Convert.ToInt32(row["IsSystem"]) == 1
                        });
                    }
                }

                var result = instances.Values.Select(instance =>
                {
                    var instanceId = Convert.ToInt32(instance["instanceId"]!);
                    instance["databases"] = databasesByInstance[instanceId];
                    return instance;
                }).ToList();

                return Results.Ok(result);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        return endpoints;
    }

    /// <summary>
    /// Parses a comma-separated list of drive ids from a query string, dropping
    /// anything non-numeric, deduping, and capping the count so a caller can't
    /// force an unbounded IN-list.
    /// </summary>
    internal static List<int> ParseDriveIds(string? raw, int maxCount = 50) =>
        (raw ?? string.Empty)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(s => int.TryParse(s, out var parsed) ? parsed : (int?)null)
            .Where(v => v.HasValue)
            .Select(v => v!.Value)
            .Distinct()
            .Take(maxCount)
            .ToList();

    internal static int ClampGrowthWindowDays(int? days) => Math.Clamp(days ?? 30, 1, 365);
}

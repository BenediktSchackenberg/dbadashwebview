using DBADashWebView.Data;
using Microsoft.Data.SqlClient;

namespace DBADashWebView.Endpoints;

public static class EstateEndpointMappings
{
    public static IEndpointRouteBuilder MapEstateEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/backups/estate", async (SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
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
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/drives", async (SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var data = await sql.QueryAsync(
                    """
                    SELECT d.*, i.InstanceDisplayName
                    FROM dbo.Drives d
                    JOIN dbo.Instances i ON d.InstanceID = i.InstanceID
                    WHERE d.IsActive = 1
                    """,
                    cancellationToken);
                return Results.Ok(data);
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/tree", async (SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var rows = await sql.QueryAsync(
                    """
                    SELECT i.InstanceID, COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           i.ProductVersion, i.ProductMajorVersion,
                           d.DatabaseID, d.name AS DatabaseName,
                           CASE WHEN d.database_id <= 4 THEN 1 ELSE 0 END AS IsSystem
                    FROM dbo.Instances i
                    LEFT JOIN dbo.Databases d ON i.InstanceID = d.InstanceID AND d.IsActive = 1
                    WHERE i.IsActive = 1
                    ORDER BY COALESCE(i.InstanceDisplayName, i.Instance),
                             CASE WHEN d.database_id <= 4 THEN 0 ELSE 1 END, d.name
                    """,
                    cancellationToken);

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
}

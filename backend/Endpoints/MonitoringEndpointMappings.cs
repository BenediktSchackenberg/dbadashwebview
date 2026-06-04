using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;
using Microsoft.Data.SqlClient;

namespace DBADashWebView.Endpoints;

public static class MonitoringEndpointMappings
{
    public static IEndpointRouteBuilder MapMonitoringEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/monitoring/job-timeline", async (int? instanceId, int? hours, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
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
                data = await sql.QueryAsync("""
                    SELECT jh.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           j.name AS job_name,
                           jh.step_id,
                           jh.step_name,
                           jh.run_status,
                           jh.RunDateTime,
                           jh.RunDurationSec,
                           DATEADD(second, jh.RunDurationSec, jh.RunDateTime) AS EndDateTime
                    FROM dbo.JobHistory jh
                    JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
                    JOIN dbo.Jobs j ON jh.job_id = j.job_id AND jh.InstanceID = j.InstanceID
                    WHERE jh.InstanceID = @instanceId
                      AND jh.RunDateTime > DATEADD(hour, -@hours, GETUTCDATE())
                      AND jh.step_id = 0
                    ORDER BY jh.RunDateTime
                    """,
                    cancellationToken,
                    ("@instanceId", instanceId.Value),
                    ("@hours", effectiveHours));
            }
            catch (Exception ex)
            {
                note = $"JobHistory/Jobs not found: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        endpoints.MapGet("/api/monitoring/configuration", async (int? instanceId, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
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
                data = await sql.QueryAsync("""
                    SELECT sc.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           sco.name,
                           sc.value,
                           sc.value_in_use,
                           sco.minimum,
                           sco.maximum,
                           sco.is_dynamic,
                           sco.is_advanced,
                           sc.ValidFrom
                    FROM dbo.SysConfig sc
                    JOIN dbo.Instances i ON sc.InstanceID = i.InstanceID
                    JOIN dbo.SysConfigOptions sco ON sc.configuration_id = sco.configuration_id
                    WHERE sc.InstanceID = @instanceId
                      AND sc.ValidFrom = (
                          SELECT MAX(ValidFrom)
                          FROM dbo.SysConfig sc2
                          WHERE sc2.InstanceID = sc.InstanceID
                            AND sc2.configuration_id = sc.configuration_id
                      )
                    ORDER BY sco.name
                    """,
                    cancellationToken,
                    ("@instanceId", instanceId.Value));
            }
            catch (Exception ex)
            {
                note = $"SysConfig not found: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        endpoints.MapGet("/api/monitoring/configuration/changes", async (int? instanceId, int? days, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var effectiveDays = days ?? 30;
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
                data = await sql.QueryAsync("""
                    ;WITH Ranked AS (
                        SELECT sco.name,
                               sc.value,
                               sc.value_in_use,
                               sc.ValidFrom,
                               LAG(sc.value) OVER (PARTITION BY sc.configuration_id ORDER BY sc.ValidFrom) AS prev_value
                        FROM dbo.SysConfig sc
                        JOIN dbo.SysConfigOptions sco ON sc.configuration_id = sco.configuration_id
                        WHERE sc.InstanceID = @instanceId
                          AND sc.ValidFrom > DATEADD(day, -@days, GETUTCDATE())
                    )
                    SELECT name,
                           prev_value AS old_value,
                           value AS new_value,
                           ValidFrom AS ChangeDate
                    FROM Ranked
                    WHERE prev_value IS NOT NULL
                      AND prev_value <> value
                    ORDER BY ValidFrom DESC
                    """,
                    cancellationToken,
                    ("@instanceId", instanceId.Value),
                    ("@days", effectiveDays));
            }
            catch (Exception ex)
            {
                note = $"Configuration change detection failed: {ex.Message}";
            }

            return Results.Ok(new { data, note });
        }).RequireAuthorization();

        endpoints.MapGet("/api/monitoring/patching", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("i.InstanceID");
                var data = await sql.QueryAsync($"""
                    SELECT i.InstanceID AS instanceId,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS instanceName,
                           i.ProductVersion AS productVersion,
                           i.ProductMajorVersion AS productMajorVersion,
                           i.Edition AS edition
                    FROM dbo.Instances i
                    WHERE i.IsActive = 1 {scopeSnippet}
                    ORDER BY i.ProductVersion
                    """, cancellationToken, scopeParameters);
                return Results.Ok(new { data, note = string.Empty });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { data = Array.Empty<object>(), note = ex.Message });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/monitoring/schema-changes", async (int instanceId, int days, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(instanceId, sql, cancellationToken);
            if (deny is not null) return deny;
            var tables = new[] { "DDLHistory" };
            foreach (var table in tables)
            {
                try
                {
                    await using var connection = await sql.OpenConnectionAsync(cancellationToken);
                    await using var command = new SqlCommand($"""
                        SELECT TOP 200 d.DatabaseID AS databaseId,
                               dbo_obj.ObjectName AS objectName,
                               dbo_obj.SchemaName AS schemaName,
                               dbo_obj.ObjectType AS objectType,
                               d.ObjectDateCreated AS objectDateCreated,
                               d.ObjectDateModified AS objectDateModified,
                               d.SnapshotValidFrom AS eventDate,
                               d.SnapshotValidFrom AS snapshotValidFrom,
                               CAST(NULL AS nvarchar(256)) AS ddlEvent,
                               CAST(NULL AS nvarchar(256)) AS loginName,
                               CAST(NULL AS nvarchar(max)) AS ddlText
                        FROM dbo.{table} d
                        JOIN dbo.DBObjects dbo_obj ON d.ObjectID = dbo_obj.ObjectID
                        WHERE dbo_obj.DatabaseID IN (
                            SELECT DatabaseID FROM dbo.Databases WHERE InstanceID = @id
                        )
                          AND d.SnapshotValidFrom > DATEADD(day, -@days, GETUTCDATE())
                        ORDER BY d.SnapshotValidFrom DESC
                        """, connection)
                    {
                        CommandTimeout = 60
                    };
                    command.Parameters.AddWithValue("@id", instanceId);
                    command.Parameters.AddWithValue("@days", days);

                    var data = await EndpointResultMapper.ReadRowsAsync(command, cancellationToken);
                    return Results.Ok(new { data, note = string.Empty });
                }
                catch
                {
                }
            }

            return Results.Ok(new { data = Array.Empty<object>(), note = "No schema change tables found" });
        }).RequireAuthorization();

        endpoints.MapGet("/api/monitoring/identity-columns", async (int instanceId, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(instanceId, sql, cancellationToken);
            if (deny is not null) return deny;
            try
            {
                var data = await sql.QueryAsync("""
                    SELECT ic.InstanceID AS instanceId,
                           d.name AS databaseName,
                           ic.schema_name AS schemaName,
                           ic.object_name AS tableName,
                           ic.column_name AS columnName,
                           ic.seed_value AS seedValue,
                           ic.increment_value AS incrementValue,
                           ic.last_value AS lastValue,
                           ic.max_ident AS maxValue,
                           CASE WHEN ic.max_ident > 0
                                THEN CAST(ic.last_value AS FLOAT) / CAST(ic.max_ident AS FLOAT) * 100.0
                                ELSE 0 END AS percentUsed
                    FROM dbo.IdentityColumns ic
                    JOIN dbo.Databases d ON ic.DatabaseID = d.DatabaseID
                    WHERE ic.InstanceID = @id
                    ORDER BY percentUsed DESC
                    """, cancellationToken, ("@id", instanceId));
                return Results.Ok(new { data, note = string.Empty });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { data = Array.Empty<object>(), note = ex.Message });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/monitoring/tempdb", async (int instanceId, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(instanceId, sql, cancellationToken);
            if (deny is not null) return deny;
            var queries =
                new[]
                {
                    """
                    SELECT df.file_id AS fileId,
                           df.name AS name,
                           df.size * 8 AS sizeKb,
                           df.space_used * 8 AS usedKb
                    FROM dbo.DBFiles df
                    JOIN dbo.Databases d ON df.DatabaseID = d.DatabaseID
                    WHERE d.InstanceID = @id
                      AND d.name = 'tempdb'
                    """
                };

            foreach (var query in queries)
            {
                try
                {
                    var data = await sql.QueryAsync(query, cancellationToken, ("@id", instanceId));
                    if (data.Count > 0)
                    {
                        return Results.Ok(new { data, note = string.Empty });
                    }
                }
                catch
                {
                }
            }

            return Results.Ok(new { data = Array.Empty<object>(), note = "TempDB data not available" });
        }).RequireAuthorization();

        endpoints.MapGet("/api/monitoring/db-space", async (int instanceId, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(instanceId, sql, cancellationToken);
            if (deny is not null) return deny;
            var queries =
                new[]
                {
                    """
                    SELECT d.name AS databaseName,
                           df.name AS fileName,
                           CASE df.type WHEN 0 THEN 'ROWS' WHEN 1 THEN 'LOG' ELSE 'OTHER' END AS typeDesc,
                           df.size * 8 AS sizeKb,
                           df.space_used * 8 AS usedKb,
                           df.growth,
                           df.is_percent_growth AS isPercentGrowth
                    FROM dbo.DBFiles df
                    JOIN dbo.Databases d ON df.DatabaseID = d.DatabaseID
                    WHERE d.InstanceID = @id
                      AND d.IsActive = 1
                    ORDER BY df.size DESC
                    """
                };

            foreach (var query in queries)
            {
                try
                {
                    var data = await sql.QueryAsync(query, cancellationToken, ("@id", instanceId));
                    if (data.Count > 0)
                    {
                        return Results.Ok(new { data, note = string.Empty });
                    }
                }
                catch
                {
                }
            }

            return Results.Ok(new { data = Array.Empty<object>(), note = "DB space data not available" });
        }).RequireAuthorization();

        return endpoints;
    }
}

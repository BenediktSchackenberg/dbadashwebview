using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;

namespace DBADashWebView.Endpoints;

public sealed record AcknowledgeCorruptionRequest(bool Clear);

/// <summary>
/// Surfaces DBA Dash's real dbo.Corruption data (consistency-check findings from
/// msdb.dbo.suspect_pages and the mirroring/HADR auto-page-repair DMVs) instead of
/// just the CorruptionStatus colour dot elsewhere in the app. It's a per-database
/// status summary (row count + last-seen date per source), not a per-page event log -
/// that's the real granularity DBA Dash collects.
/// </summary>
public static class CorruptionEndpointMappings
{
    private static readonly Dictionary<int, string> SourceLabels = new()
    {
        [1] = "msdb.suspect_pages",
        [2] = "Mirroring auto page repair",
        [3] = "HADR auto page repair",
    };

    public static IEndpointRouteBuilder MapCorruptionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/corruption", async (int? instanceId, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            if (instanceId is int requestedInstanceId)
            {
                var deny = await user.EnsureInstanceAccessAsync(requestedInstanceId, sql, cancellationToken);
                if (deny is not null) return deny;
            }

            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("d.InstanceID");
                var filter = instanceId.HasValue ? "AND d.InstanceID = @instanceId" : string.Empty;
                var rows = await sql.QueryAsync(
                    $"""
                    SELECT c.DatabaseID, d.name AS DatabaseName, d.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceDisplayName,
                           c.SourceTable, c.UpdateDate, c.AckDate, c.CountOfRows
                    FROM dbo.Corruption c
                    JOIN dbo.Databases d ON c.DatabaseID = d.DatabaseID
                    JOIN dbo.Instances i ON d.InstanceID = i.InstanceID
                    WHERE d.IsActive = 1 {filter} {scopeSnippet}
                    ORDER BY c.UpdateDate DESC
                    """,
                    cancellationToken,
                    [("@instanceId", instanceId.HasValue ? instanceId.Value : DBNull.Value), .. scopeParameters]);

                var data = rows.Select(row => new
                {
                    databaseId = Convert.ToInt32(row["DatabaseID"]),
                    databaseName = row["DatabaseName"]?.ToString(),
                    instanceId = Convert.ToInt32(row["InstanceID"]),
                    instanceDisplayName = row["InstanceDisplayName"]?.ToString(),
                    sourceTable = Convert.ToInt32(row["SourceTable"]),
                    source = SourceLabels.GetValueOrDefault(Convert.ToInt32(row["SourceTable"]), "Unknown"),
                    updateDate = row["UpdateDate"],
                    ackDate = row["AckDate"],
                    isAcknowledged = row["AckDate"] is not null,
                    countOfRows = row["CountOfRows"] is null ? (int?)null : Convert.ToInt32(row["CountOfRows"]),
                }).ToList();

                return Results.Ok(new { data });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapPost("/api/corruption/{databaseId:int}/acknowledge", async (
            int databaseId,
            AcknowledgeCorruptionRequest request,
            ClaimsPrincipal user,
            SqlDataService sql,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var instanceRows = await sql.QueryAsync(
                    "SELECT InstanceID FROM dbo.Databases WHERE DatabaseID = @databaseId",
                    cancellationToken, ("@databaseId", databaseId));
                if (instanceRows.Count == 0) return Results.NotFound();

                var instanceId = Convert.ToInt32(instanceRows[0]["InstanceID"]);
                var deny = await user.EnsureInstanceAccessAsync(instanceId, sql, cancellationToken);
                if (deny is not null) return deny;

                await sql.QueryAsync(
                    "EXEC dbo.Corruption_Ack @DatabaseID = @databaseId, @Clear = @clear",
                    cancellationToken, ("@databaseId", databaseId), ("@clear", request.Clear));

                return Results.Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return Results.Problem(title: "Unable to acknowledge corruption", detail: ex.Message, statusCode: StatusCodes.Status500InternalServerError);
            }
        }).RequireAuthorization(AppPolicies.OperatorOrAdmin);

        return endpoints;
    }
}

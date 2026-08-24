using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;

namespace DBADashWebView.Endpoints;

public sealed record TagRow(int TagId, string TagName, string? TagValue, bool IsSystem, int[] InstanceIds);

public sealed record CreateTagRequest(string TagName, string? TagValue, int[] InstanceIds);

/// <summary>
/// Surfaces DBA Dash's real tag schema (<c>dbo.Tags</c> / <c>dbo.InstanceIDsTags</c>) to
/// the Groups &amp; Tags UI. System tags (populated by <c>dbo.SystemTags_Upd</c>, named
/// like <c>{Version}</c>) are read-only here — only plain user tags can be created,
/// applied, or removed.
/// </summary>
public static class TagsEndpointMappings
{
    public static IEndpointRouteBuilder MapTagsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/tags", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                var rows = await sql.QueryAsync(
                    """
                    SELECT T.TagID, T.TagName, T.TagValue, IT.InstanceID
                    FROM dbo.Tags T
                    JOIN dbo.InstanceIDsTags IT ON T.TagID = IT.TagID
                    JOIN dbo.Instances I ON IT.InstanceID = I.InstanceID
                    WHERE I.IsActive = 1
                    ORDER BY T.TagName, T.TagValue
                    """,
                    cancellationToken);

                return Results.Ok(BuildTagRows(rows, allowedIds));
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        endpoints.MapPost("/api/tags", async (
            CreateTagRequest request,
            SqlDataService sql,
            CancellationToken cancellationToken) =>
        {
            var tagName = request.TagName.Trim();
            if (string.IsNullOrWhiteSpace(tagName))
            {
                return Results.Problem(title: "Tag name is required", statusCode: StatusCodes.Status400BadRequest);
            }

            if (tagName.StartsWith('{'))
            {
                return Results.Problem(title: "System tag names cannot be created manually", statusCode: StatusCodes.Status400BadRequest);
            }

            if (request.InstanceIds is null || request.InstanceIds.Length == 0)
            {
                return Results.Problem(title: "At least one instance is required", statusCode: StatusCodes.Status400BadRequest);
            }

            var tagValue = request.TagValue?.Trim() ?? string.Empty;

            var existing = await sql.QueryAsync(
                "SELECT TagID FROM dbo.Tags WHERE TagName = @tagName AND TagValue = @tagValue",
                cancellationToken,
                ("@tagName", tagName), ("@tagValue", tagValue));

            int tagId;
            if (existing.Count > 0)
            {
                tagId = Convert.ToInt32(existing[0]["TagID"]);
            }
            else
            {
                var inserted = await sql.QueryAsync(
                    "INSERT INTO dbo.Tags (TagName, TagValue) OUTPUT INSERTED.TagID VALUES (@tagName, @tagValue)",
                    cancellationToken,
                    ("@tagName", tagName), ("@tagValue", tagValue));
                tagId = Convert.ToInt32(inserted[0]["TagID"]);
            }

            var instanceIds = request.InstanceIds.Distinct().ToArray();
            foreach (var instanceId in instanceIds)
            {
                await sql.QueryAsync(
                    """
                    IF NOT EXISTS (SELECT 1 FROM dbo.InstanceIDsTags WHERE InstanceID = @instanceId AND TagID = @tagId)
                    INSERT INTO dbo.InstanceIDsTags (InstanceID, TagID) VALUES (@instanceId, @tagId)
                    """,
                    cancellationToken,
                    ("@instanceId", instanceId), ("@tagId", tagId));
            }

            return Results.Ok(new TagRow(tagId, tagName, tagValue, false, instanceIds));
        }).RequireAuthorization(AppPolicies.AdminOnly);

        endpoints.MapPost("/api/tags/{tagId:int}/instances/{instanceId:int}", async (
            int tagId,
            int instanceId,
            SqlDataService sql,
            CancellationToken cancellationToken) =>
        {
            var guard = await EnsureUserTagAsync(sql, tagId, cancellationToken);
            if (guard is not null) return guard;

            await sql.QueryAsync(
                """
                IF NOT EXISTS (SELECT 1 FROM dbo.InstanceIDsTags WHERE InstanceID = @instanceId AND TagID = @tagId)
                INSERT INTO dbo.InstanceIDsTags (InstanceID, TagID) VALUES (@instanceId, @tagId)
                """,
                cancellationToken,
                ("@instanceId", instanceId), ("@tagId", tagId));

            return Results.Ok(new { success = true });
        }).RequireAuthorization(AppPolicies.AdminOnly);

        endpoints.MapDelete("/api/tags/{tagId:int}/instances/{instanceId:int}", async (
            int tagId,
            int instanceId,
            SqlDataService sql,
            CancellationToken cancellationToken) =>
        {
            var guard = await EnsureUserTagAsync(sql, tagId, cancellationToken);
            if (guard is not null) return guard;

            await sql.QueryAsync(
                "DELETE FROM dbo.InstanceIDsTags WHERE TagID = @tagId AND InstanceID = @instanceId",
                cancellationToken,
                ("@tagId", tagId), ("@instanceId", instanceId));

            await DeleteOrphanTagAsync(sql, tagId, cancellationToken);

            return Results.Ok(new { success = true });
        }).RequireAuthorization(AppPolicies.AdminOnly);

        endpoints.MapDelete("/api/tags/{tagId:int}", async (
            int tagId,
            SqlDataService sql,
            CancellationToken cancellationToken) =>
        {
            var guard = await EnsureUserTagAsync(sql, tagId, cancellationToken);
            if (guard is not null) return guard;

            await sql.QueryAsync("DELETE FROM dbo.InstanceIDsTags WHERE TagID = @tagId", cancellationToken, ("@tagId", tagId));
            await sql.QueryAsync("DELETE FROM dbo.InstanceTags WHERE TagID = @tagId", cancellationToken, ("@tagId", tagId));
            await sql.QueryAsync("DELETE FROM dbo.Tags WHERE TagID = @tagId", cancellationToken, ("@tagId", tagId));

            return Results.Ok(new { success = true });
        }).RequireAuthorization(AppPolicies.AdminOnly);

        return endpoints;
    }

    /// <summary>
    /// Groups flat (TagID, TagName, TagValue, InstanceID) rows into one
    /// <see cref="TagRow"/> per tag, applying the caller's instance scope and
    /// dropping tags that have no instances left once scoped. Kept separate
    /// from the SQL so it can be unit tested with synthetic rows.
    /// </summary>
    internal static List<TagRow> BuildTagRows(
        List<Dictionary<string, object?>> rows,
        HashSet<int>? allowedInstanceIds)
    {
        var tags = new Dictionary<int, (string TagName, string? TagValue, List<int> InstanceIds)>();
        foreach (var row in rows)
        {
            var instanceId = Convert.ToInt32(row["InstanceID"]);
            if (allowedInstanceIds is not null && !allowedInstanceIds.Contains(instanceId))
            {
                continue;
            }

            var tagId = Convert.ToInt32(row["TagID"]);
            if (!tags.TryGetValue(tagId, out var entry))
            {
                entry = (row["TagName"]?.ToString() ?? string.Empty, row["TagValue"]?.ToString(), new List<int>());
                tags[tagId] = entry;
            }

            entry.InstanceIds.Add(instanceId);
        }

        return tags
            .Where(kvp => kvp.Value.InstanceIds.Count > 0)
            .Select(kvp => new TagRow(
                kvp.Key,
                kvp.Value.TagName,
                kvp.Value.TagValue,
                kvp.Value.TagName.StartsWith('{'),
                kvp.Value.InstanceIds.ToArray()))
            .OrderBy(t => t.IsSystem)
            .ThenBy(t => t.TagName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(t => t.TagValue, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static async Task<IResult?> EnsureUserTagAsync(SqlDataService sql, int tagId, CancellationToken cancellationToken)
    {
        var rows = await sql.QueryAsync("SELECT TagName FROM dbo.Tags WHERE TagID = @tagId", cancellationToken, ("@tagId", tagId));
        if (rows.Count == 0)
        {
            return Results.Problem(title: "Tag not found", statusCode: StatusCodes.Status404NotFound);
        }

        var tagName = rows[0]["TagName"]?.ToString() ?? string.Empty;
        if (tagName.StartsWith('{'))
        {
            return Results.Problem(title: "System tags cannot be modified", statusCode: StatusCodes.Status400BadRequest);
        }

        return null;
    }

    private static async Task DeleteOrphanTagAsync(SqlDataService sql, int tagId, CancellationToken cancellationToken)
    {
        var stillUsed = await sql.QueryAsync(
            """
            SELECT 1 FROM dbo.InstanceIDsTags WHERE TagID = @tagId
            UNION ALL
            SELECT 1 FROM dbo.InstanceTags WHERE TagID = @tagId
            """,
            cancellationToken,
            ("@tagId", tagId));

        if (stillUsed.Count == 0)
        {
            await sql.QueryAsync("DELETE FROM dbo.Tags WHERE TagID = @tagId", cancellationToken, ("@tagId", tagId));
        }
    }
}

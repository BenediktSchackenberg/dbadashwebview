using System.Security.Claims;
using Microsoft.Data.SqlClient;

namespace DBADashWebView.Auth;

/// <summary>
/// Resolves the per-user authorization scope and optional request-scoped view
/// tags from a <see cref="ClaimsPrincipal"/>, then exposes helpers that turn
/// both into SQL fragments used by the endpoint mappings.
///
/// An empty scope means "no restriction" (full fleet access). This keeps the
/// behaviour backwards compatible with existing users that have no scope
/// configured on them.
/// </summary>
public sealed class UserScope
{
    public static UserScope FromPrincipal(ClaimsPrincipal? principal)
    {
        if (principal is null || !principal.Identity?.IsAuthenticated == true)
        {
            return Unrestricted;
        }

        var tags = NormalizeTags(principal.FindAll(AppClaimTypes.AllowedTag));
        var viewTags = NormalizeTags(principal.FindAll(AppClaimTypes.ViewTag));

        var groups = principal.FindAll(AppClaimTypes.AllowedGroupId)
            .Select(c => int.TryParse(c.Value, out var id) ? id : (int?)null)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();

        if (tags.Length == 0 && viewTags.Length == 0 && groups.Length == 0)
        {
            return Unrestricted;
        }

        return new UserScope(tags, viewTags, groups);
    }

    private static string[] NormalizeTags(IEnumerable<Claim> claims) =>
        claims
            .Select(c => c.Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

    public static UserScope Unrestricted { get; } = new([], [], []);

    private UserScope(
        IReadOnlyList<string> allowedTags,
        IReadOnlyList<string> viewTags,
        IReadOnlyList<int> allowedGroupIds)
    {
        AllowedTags = allowedTags;
        ViewTags = viewTags;
        AllowedGroupIds = allowedGroupIds;
    }

    public IReadOnlyList<string> AllowedTags { get; }
    public IReadOnlyList<string> ViewTags { get; }
    public IReadOnlyList<int> AllowedGroupIds { get; }

    public bool IsUnrestricted => AllowedTags.Count == 0 && ViewTags.Count == 0 && AllowedGroupIds.Count == 0;

    /// <summary>
    /// True when the scope can actually be enforced in SQL. Only tag scope is
    /// translated into a predicate today, so a scope that carries group ids but
    /// no tags has nothing to filter on. Callers must check this rather than
    /// <see cref="IsUnrestricted"/> before building a tag predicate — otherwise
    /// they emit <c>IN ()</c> / a dangling <c>AND</c> and the query fails.
    /// </summary>
    public bool HasTagScope => AllowedTags.Count > 0 || ViewTags.Count > 0;

    /// <summary>
    /// Returns a SQL predicate (without leading AND) that constrains the
    /// supplied <paramref name="instanceIdColumn"/> to instances the caller is
    /// allowed to see. Returns an empty string when no scope is set. The
    /// caller must pass the resulting parameters from
    /// <see cref="AppendParameters"/> to the command.
    ///
    /// The predicate joins against <c>dbo.InstanceIDsTags</c> / <c>dbo.Tags</c>
    /// (standard DBA Dash tag schema) for tag scope. Group scope is not yet
    /// enforced at the SQL layer — the values are kept on the JWT so admins
    /// can opt-in once the consuming deployment standardises on a group
    /// table; until then, group scope by itself behaves as unrestricted.
    /// </summary>
    public string BuildInstanceFilter(string instanceIdColumn, string parameterPrefix = "@scope")
    {
        var predicates = new List<string>();
        if (AllowedTags.Count > 0)
        {
            predicates.Add(BuildTagPredicate(instanceIdColumn, AllowedTags.Count, parameterPrefix + "_tag_"));
        }

        if (ViewTags.Count > 0)
        {
            predicates.Add(BuildTagPredicate(instanceIdColumn, ViewTags.Count, parameterPrefix + "_view_tag_"));
        }

        return string.Join(" AND ", predicates.Select(predicate => $"({predicate})"));
    }

    private static string BuildTagPredicate(string instanceIdColumn, int tagCount, string parameterPrefix)
    {
        var paramNames = Enumerable.Range(0, tagCount).Select(index => parameterPrefix + index);
        return $"{instanceIdColumn} IN (SELECT it.InstanceID FROM dbo.InstanceIDsTags it JOIN dbo.Tags t ON it.TagID = t.TagID WHERE t.TagName IN ({string.Join(", ", paramNames)}))";
    }

    /// <summary>
    /// Adds the parameters required by <see cref="BuildInstanceFilter"/> to the
    /// supplied command. Safe to call even when the scope is unrestricted (no-op).
    /// </summary>
    public void AppendParameters(SqlCommand command, string parameterPrefix = "@scope")
    {
        for (var index = 0; index < AllowedTags.Count; index++)
        {
            command.Parameters.AddWithValue(parameterPrefix + "_tag_" + index, AllowedTags[index]);
        }

        for (var index = 0; index < ViewTags.Count; index++)
        {
            command.Parameters.AddWithValue(parameterPrefix + "_view_tag_" + index, ViewTags[index]);
        }
    }

    /// <summary>
    /// Returns the scope parameter tuples for use with
    /// <see cref="DBADashWebView.Data.SqlDataService"/>'s parameterised helpers.
    /// </summary>
    public IEnumerable<(string name, object? value)> ParameterTuples(string parameterPrefix = "@scope")
    {
        for (var index = 0; index < AllowedTags.Count; index++)
        {
            yield return (parameterPrefix + "_tag_" + index, AllowedTags[index]);
        }

        for (var index = 0; index < ViewTags.Count; index++)
        {
            yield return (parameterPrefix + "_view_tag_" + index, ViewTags[index]);
        }
    }

    /// <summary>
    /// True when the supplied instance id passes the configured scope. This is
    /// the cheap fast-path used by per-instance endpoints — we still consult
    /// the database when needed (callers that pre-validate via SQL can skip).
    /// </summary>
    public bool AllowsInstanceWithoutSqlCheck(int instanceId)
    {
        // Without a DB round-trip we cannot prove tag membership, so we say
        // "unknown -> deny" when a tag scope is configured. The caller is
        // expected to defer to <see cref="IsInstanceAllowedAsync"/> for the
        // authoritative answer.
        _ = instanceId;
        return IsUnrestricted;
    }

    /// <summary>
    /// Returns the set of instance ids the caller is allowed to see, or <c>null</c>
    /// when there is no tag scope to enforce (callers should treat null as "no
    /// filter"). A scope carrying only group ids yields <c>null</c>, matching the
    /// documented "group scope by itself behaves as unrestricted" behaviour.
    /// Used by aggregate endpoints (dashboard / reports) that post-filter row
    /// collections instead of rewriting every SQL aggregate.
    /// </summary>
    public async Task<HashSet<int>?> AllowedInstanceIdsAsync(
        DBADashWebView.Data.SqlDataService sql,
        CancellationToken cancellationToken)
    {
        if (!HasTagScope)
        {
            return null;
        }

        var predicate = BuildInstanceFilter("i.InstanceID");
        var query = $"SELECT i.InstanceID FROM dbo.Instances i WHERE {predicate}";

        var rows = await sql.QueryAsync(query, cancellationToken, ParameterTuples().ToArray());
        var ids = new HashSet<int>();
        foreach (var row in rows)
        {
            if (row.TryGetValue("InstanceID", out var value) && value is not null)
            {
                ids.Add(Convert.ToInt32(value));
            }
        }
        return ids;
    }

    /// <summary>
    /// Checks whether the given instance id falls within the user's scope by
    /// running a single, parameterised <c>SELECT 1</c> against the tag tables.
    /// Returns true immediately when there is no tag scope to enforce.
    /// </summary>
    public async Task<bool> IsInstanceAllowedAsync(
        DBADashWebView.Data.SqlDataService sql,
        int instanceId,
        CancellationToken cancellationToken)
    {
        if (!HasTagScope)
        {
            return true;
        }

        var parameters = new List<(string name, object? value)> { ("@instanceId", instanceId) };
        parameters.AddRange(ParameterTuples());
        var query = $"SELECT TOP 1 1 WHERE {BuildInstanceFilter("@instanceId")}";

        var rows = await sql.QueryAsync(query, cancellationToken, parameters.ToArray());
        return rows.Count > 0;
    }
}

using System.Security.Claims;
using Microsoft.Data.SqlClient;

namespace DBADashWebView.Auth;

/// <summary>
/// Resolves the per-user scope (allowed tag names / allowed group ids) from a
/// <see cref="ClaimsPrincipal"/> and exposes helpers that turn the scope into
/// SQL fragments used by the endpoint mappings.
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

        var tags = principal.FindAll(AppClaimTypes.AllowedTag)
            .Select(c => c.Value)
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var groups = principal.FindAll(AppClaimTypes.AllowedGroupId)
            .Select(c => int.TryParse(c.Value, out var id) ? id : (int?)null)
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .Distinct()
            .ToArray();

        if (tags.Length == 0 && groups.Length == 0)
        {
            return Unrestricted;
        }

        return new UserScope(tags, groups);
    }

    public static UserScope Unrestricted { get; } = new(Array.Empty<string>(), Array.Empty<int>());

    private UserScope(IReadOnlyList<string> allowedTags, IReadOnlyList<int> allowedGroupIds)
    {
        AllowedTags = allowedTags;
        AllowedGroupIds = allowedGroupIds;
    }

    public IReadOnlyList<string> AllowedTags { get; }
    public IReadOnlyList<int> AllowedGroupIds { get; }

    public bool IsUnrestricted => AllowedTags.Count == 0 && AllowedGroupIds.Count == 0;

    /// <summary>
    /// Returns a SQL predicate (without leading AND) that constrains the
    /// supplied <paramref name="instanceIdColumn"/> to instances the caller is
    /// allowed to see. Returns an empty string when no scope is set. The
    /// caller must pass the resulting parameters from
    /// <see cref="AppendParameters"/> to the command.
    ///
    /// The predicate joins against <c>dbo.InstanceTag</c> / <c>dbo.Tag</c>
    /// (standard DBA Dash tag schema) for tag scope. Group scope is not yet
    /// enforced at the SQL layer — the values are kept on the JWT so admins
    /// can opt-in once the consuming deployment standardises on a group
    /// table; until then, group scope by itself behaves as unrestricted.
    /// </summary>
    public string BuildInstanceFilter(string instanceIdColumn, string parameterPrefix = "@scope")
    {
        if (AllowedTags.Count == 0)
        {
            return string.Empty;
        }

        // Parameterise every tag so we never concatenate user input into SQL.
        var paramNames = AllowedTags
            .Select((_, index) => parameterPrefix + "_tag_" + index)
            .ToArray();

        var inList = string.Join(", ", paramNames);
        return $"{instanceIdColumn} IN (SELECT it.InstanceID FROM dbo.InstanceTag it JOIN dbo.Tag t ON it.TagID = t.TagID WHERE t.TagName IN ({inList}))";
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
    /// when the scope is unrestricted (callers should treat null as "no filter").
    /// Used by aggregate endpoints (dashboard / reports) that post-filter row
    /// collections instead of rewriting every SQL aggregate.
    /// </summary>
    public async Task<HashSet<int>?> AllowedInstanceIdsAsync(
        DBADashWebView.Data.SqlDataService sql,
        CancellationToken cancellationToken)
    {
        if (IsUnrestricted)
        {
            return null;
        }

        var paramNames = string.Join(", ", AllowedTags.Select((_, index) => "@scope_tag_" + index));
        var query = $"SELECT DISTINCT it.InstanceID FROM dbo.InstanceTag it JOIN dbo.Tag t ON it.TagID = t.TagID WHERE t.TagName IN ({paramNames})";

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
    /// Returns true immediately when the scope is unrestricted.
    /// </summary>
    public async Task<bool> IsInstanceAllowedAsync(
        DBADashWebView.Data.SqlDataService sql,
        int instanceId,
        CancellationToken cancellationToken)
    {
        if (IsUnrestricted)
        {
            return true;
        }

        var parameters = new List<(string name, object? value)> { ("@instanceId", instanceId) };
        parameters.AddRange(ParameterTuples());

        var paramNames = string.Join(", ", AllowedTags.Select((_, index) => "@scope_tag_" + index));
        var query = $"SELECT TOP 1 1 FROM dbo.InstanceTag it JOIN dbo.Tag t ON it.TagID = t.TagID WHERE it.InstanceID = @instanceId AND t.TagName IN ({paramNames})";

        var rows = await sql.QueryAsync(query, cancellationToken, parameters.ToArray());
        return rows.Count > 0;
    }
}

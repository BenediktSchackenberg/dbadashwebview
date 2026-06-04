using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;

namespace DBADashWebView.Endpoints;

/// <summary>
/// Helpers used by endpoint mappings to enforce per-user RBAC scope.
///
/// Conventions:
///   * <see cref="EnsureInstanceAccessAsync"/> returns <c>null</c> when the
///     caller is allowed to access the supplied instance id, or an
///     <see cref="IResult"/> that the endpoint should return immediately.
///   * <see cref="ScopedInstanceFilter"/> returns the SQL snippet (and the
///     accompanying parameter tuples) for list/aggregate queries that need to
///     be constrained to the instances the caller is allowed to see.
/// </summary>
internal static class ScopeEndpointExtensions
{
    public static async Task<IResult?> EnsureInstanceAccessAsync(
        this ClaimsPrincipal user,
        int instanceId,
        SqlDataService sql,
        CancellationToken cancellationToken)
    {
        var scope = UserScope.FromPrincipal(user);
        if (scope.IsUnrestricted)
        {
            return null;
        }

        var allowed = await scope.IsInstanceAllowedAsync(sql, instanceId, cancellationToken);
        return allowed ? null : Results.Forbid();
    }

    /// <summary>
    /// Builds an SQL fragment that constrains <paramref name="instanceIdColumn"/>
    /// to the tag-scope of the caller. Returns an empty snippet (and empty
    /// parameters) when the caller is unrestricted, so it can be inlined into
    /// existing queries with <c>WHERE 1=1 {filter}</c>.
    /// </summary>
    public static (string Snippet, (string name, object? value)[] Parameters) ScopedInstanceFilter(
        this ClaimsPrincipal user,
        string instanceIdColumn,
        string parameterPrefix = "@scope")
    {
        var scope = UserScope.FromPrincipal(user);
        if (scope.IsUnrestricted)
        {
            return (string.Empty, Array.Empty<(string, object?)>());
        }

        var predicate = scope.BuildInstanceFilter(instanceIdColumn, parameterPrefix);
        var parameters = scope.ParameterTuples(parameterPrefix).ToArray();
        return (" AND " + predicate, parameters);
    }

    /// <summary>
    /// Resolves the caller's allowed instance id set (or <c>null</c> when
    /// unrestricted). Convenience wrapper around <see cref="UserScope.AllowedInstanceIdsAsync"/>.
    /// </summary>
    public static Task<HashSet<int>?> AllowedInstanceIdsAsync(
        this ClaimsPrincipal user,
        SqlDataService sql,
        CancellationToken cancellationToken)
    {
        var scope = UserScope.FromPrincipal(user);
        return scope.AllowedInstanceIdsAsync(sql, cancellationToken);
    }

    /// <summary>
    /// Filters a row list down to rows whose <paramref name="instanceIdKey"/>
    /// column falls within <paramref name="allowedIds"/>. Pass-through when
    /// <paramref name="allowedIds"/> is null (caller is unrestricted).
    /// </summary>
    public static List<Dictionary<string, object?>> FilterByInstanceIds(
        this List<Dictionary<string, object?>> rows,
        HashSet<int>? allowedIds,
        string instanceIdKey = "InstanceID")
    {
        if (allowedIds is null)
        {
            return rows;
        }

        return rows.Where(row =>
            row.TryGetValue(instanceIdKey, out var value)
            && value is not null
            && allowedIds.Contains(Convert.ToInt32(value))).ToList();
    }
}

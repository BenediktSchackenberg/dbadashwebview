using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;
using DBADashWebView.Endpoints;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class UserScopeTests
{
    /// <summary>
    /// A data service with no connection string configured. Any code path that
    /// actually reaches SQL throws, so these tests prove the scope helpers
    /// short-circuit before issuing a query.
    /// </summary>
    private static SqlDataService UnusableSqlService() =>
        new(new ConfigurationBuilder().Build());

    private static ClaimsPrincipal PrincipalWith(params Claim[] claims) =>
        new(new ClaimsIdentity(claims, "test"));

    [Fact]
    public void FromPrincipal_NullPrincipal_ReturnsUnrestricted()
    {
        var scope = UserScope.FromPrincipal(null);
        Assert.True(scope.IsUnrestricted);
        Assert.Empty(scope.AllowedTags);
        Assert.Empty(scope.AllowedGroupIds);
    }

    [Fact]
    public void FromPrincipal_NoScopeClaims_ReturnsUnrestricted()
    {
        var identity = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "alice"),
            new Claim(ClaimTypes.Role, "Viewer")
        }, "test");
        var principal = new ClaimsPrincipal(identity);

        var scope = UserScope.FromPrincipal(principal);
        Assert.True(scope.IsUnrestricted);
    }

    [Fact]
    public void FromPrincipal_WithTagAndGroupClaims_PopulatesScope()
    {
        var identity = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "alice"),
            new Claim(AppClaimTypes.AllowedTag, "prod"),
            new Claim(AppClaimTypes.AllowedTag, "eu-west"),
            new Claim(AppClaimTypes.AllowedTag, "prod"), // duplicate, must be deduped
            new Claim(AppClaimTypes.AllowedGroupId, "1"),
            new Claim(AppClaimTypes.AllowedGroupId, "5"),
            new Claim(AppClaimTypes.AllowedGroupId, "abc") // invalid, must be ignored
        }, "test");
        var principal = new ClaimsPrincipal(identity);

        var scope = UserScope.FromPrincipal(principal);
        Assert.False(scope.IsUnrestricted);
        Assert.Equal(new[] { "prod", "eu-west" }, scope.AllowedTags);
        Assert.Equal(new[] { 1, 5 }, scope.AllowedGroupIds);
    }

    [Fact]
    public void BuildInstanceFilter_Unrestricted_ReturnsEmpty()
    {
        var scope = UserScope.Unrestricted;
        Assert.Equal(string.Empty, scope.BuildInstanceFilter("i.InstanceID"));
    }

    [Fact]
    public void BuildInstanceFilter_WithTags_ProducesParameterisedPredicate()
    {
        var identity = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "alice"),
            new Claim(AppClaimTypes.AllowedTag, "prod"),
            new Claim(AppClaimTypes.AllowedTag, "eu-west")
        }, "test");
        var scope = UserScope.FromPrincipal(new ClaimsPrincipal(identity));

        var predicate = scope.BuildInstanceFilter("i.InstanceID");

        Assert.Contains("i.InstanceID IN", predicate);
        Assert.Contains("@scope_tag_0", predicate);
        Assert.Contains("@scope_tag_1", predicate);
        Assert.Contains("dbo.InstanceIDsTags", predicate);
        Assert.Contains("dbo.Tags", predicate);
        // Values must not be inlined into the SQL.
        Assert.DoesNotContain("prod", predicate);
        Assert.DoesNotContain("eu-west", predicate);
    }

    [Fact]
    public void ParameterTuples_ReturnsOneEntryPerTag()
    {
        var identity = new ClaimsIdentity(new[]
        {
            new Claim(AppClaimTypes.AllowedTag, "a"),
            new Claim(AppClaimTypes.AllowedTag, "b")
        }, "test");
        var scope = UserScope.FromPrincipal(new ClaimsPrincipal(identity));

        var tuples = scope.ParameterTuples().ToArray();
        Assert.Equal(2, tuples.Length);
        Assert.Equal("@scope_tag_0", tuples[0].name);
        Assert.Equal("a", tuples[0].value);
        Assert.Equal("@scope_tag_1", tuples[1].name);
        Assert.Equal("b", tuples[1].value);
    }

    // ---------------------------------------------------------------------
    // Group-only scope: a user with allowed group ids but no allowed tags.
    // There is no SQL translation for group scope yet, so such a scope must
    // behave as unrestricted instead of emitting a tag predicate with an
    // empty IN () list or a dangling AND.
    // ---------------------------------------------------------------------

    private static ClaimsPrincipal GroupOnlyPrincipal() => PrincipalWith(
        new Claim(ClaimTypes.Name, "alice"),
        new Claim(AppClaimTypes.AllowedGroupId, "1"),
        new Claim(AppClaimTypes.AllowedGroupId, "5"));

    [Fact]
    public void HasTagScope_GroupOnlyScope_IsFalse()
    {
        var scope = UserScope.FromPrincipal(GroupOnlyPrincipal());

        Assert.False(scope.IsUnrestricted);
        Assert.False(scope.HasTagScope);
        Assert.Equal(new[] { 1, 5 }, scope.AllowedGroupIds);
    }

    [Fact]
    public void BuildInstanceFilter_GroupOnlyScope_ReturnsEmptyPredicate()
    {
        var scope = UserScope.FromPrincipal(GroupOnlyPrincipal());

        // Must never produce "IN ()", which is a T-SQL syntax error.
        Assert.Equal(string.Empty, scope.BuildInstanceFilter("i.InstanceID"));
    }

    [Fact]
    public void ScopedInstanceFilter_GroupOnlyScope_EmitsNoSqlFragment()
    {
        var (snippet, parameters) = GroupOnlyPrincipal().ScopedInstanceFilter("i.InstanceID");

        // A bare " AND " here would break every query that inlines the snippet.
        Assert.Equal(string.Empty, snippet);
        Assert.Empty(parameters);
    }

    [Fact]
    public void ScopedInstanceFilter_TagScope_EmitsPredicateAndParameters()
    {
        var principal = PrincipalWith(new Claim(AppClaimTypes.AllowedTag, "prod"));

        var (snippet, parameters) = principal.ScopedInstanceFilter("i.InstanceID");

        Assert.StartsWith(" AND ", snippet);
        Assert.Contains("i.InstanceID IN", snippet);
        Assert.Single(parameters);
        Assert.Equal("@scope_tag_0", parameters[0].name);
        Assert.Equal("prod", parameters[0].value);
    }

    [Fact]
    public async Task AllowedInstanceIdsAsync_GroupOnlyScope_ReturnsNullWithoutQueryingSql()
    {
        var scope = UserScope.FromPrincipal(GroupOnlyPrincipal());

        var allowed = await scope.AllowedInstanceIdsAsync(UnusableSqlService(), CancellationToken.None);

        Assert.Null(allowed);
    }

    [Fact]
    public async Task IsInstanceAllowedAsync_GroupOnlyScope_AllowsWithoutQueryingSql()
    {
        var scope = UserScope.FromPrincipal(GroupOnlyPrincipal());

        Assert.True(await scope.IsInstanceAllowedAsync(UnusableSqlService(), 42, CancellationToken.None));
    }

    [Fact]
    public async Task EnsureInstanceAccessAsync_GroupOnlyScope_DoesNotDenyAccess()
    {
        var deny = await GroupOnlyPrincipal()
            .EnsureInstanceAccessAsync(42, UnusableSqlService(), CancellationToken.None);

        Assert.Null(deny);
    }
}

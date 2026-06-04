using System.Security.Claims;
using DBADashWebView.Auth;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class UserScopeTests
{
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
        Assert.Contains("dbo.InstanceTag", predicate);
        Assert.Contains("dbo.Tag", predicate);
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
}

using System.Security.Claims;
using DBADashWebView.Auth;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class UserScopeTests
{
    [Fact]
    public void FromPrincipal_ReturnsUnrestricted_WhenPrincipalIsNull()
    {
        var scope = UserScope.FromPrincipal(null);

        Assert.True(scope.IsUnrestricted);
        Assert.Empty(scope.AllowedTags);
        Assert.Empty(scope.AllowedGroupIds);
    }

    [Fact]
    public void FromPrincipal_ReturnsUnrestricted_WhenNoScopeClaims()
    {
        var identity = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "alice"),
            new Claim(ClaimTypes.Role, AppRoles.Viewer)
        }, authenticationType: "test");
        var principal = new ClaimsPrincipal(identity);

        var scope = UserScope.FromPrincipal(principal);

        Assert.True(scope.IsUnrestricted);
    }

    [Fact]
    public void FromPrincipal_ParsesTagAndGroupClaims_AndDeduplicates()
    {
        var identity = new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "bob"),
            new Claim(AppClaimTypes.AllowedTag, "prod"),
            new Claim(AppClaimTypes.AllowedTag, " prod "),
            new Claim(AppClaimTypes.AllowedTag, "finance"),
            new Claim(AppClaimTypes.AllowedGroupId, "10"),
            new Claim(AppClaimTypes.AllowedGroupId, "10"),
            new Claim(AppClaimTypes.AllowedGroupId, "20"),
            new Claim(AppClaimTypes.AllowedGroupId, "not-an-int")
        }, authenticationType: "test");
        var principal = new ClaimsPrincipal(identity);

        var scope = UserScope.FromPrincipal(principal);

        Assert.False(scope.IsUnrestricted);
        Assert.Equal(new[] { "prod", "finance" }, scope.AllowedTags);
        Assert.Equal(new[] { 10, 20 }, scope.AllowedGroupIds);
    }

    [Fact]
    public void BuildInstanceFilter_ReturnsEmpty_WhenUnrestricted()
    {
        var scope = UserScope.Unrestricted;

        Assert.Equal(string.Empty, scope.BuildInstanceFilter("i.InstanceID"));
    }

    [Fact]
    public void BuildInstanceFilter_EmitsParameterisedInClause()
    {
        var identity = new ClaimsIdentity(new[]
        {
            new Claim(AppClaimTypes.AllowedTag, "prod"),
            new Claim(AppClaimTypes.AllowedTag, "qa")
        }, authenticationType: "test");
        var scope = UserScope.FromPrincipal(new ClaimsPrincipal(identity));

        var sql = scope.BuildInstanceFilter("i.InstanceID");

        Assert.Contains("i.InstanceID IN (", sql);
        Assert.Contains("@scope_tag_0", sql);
        Assert.Contains("@scope_tag_1", sql);
        Assert.DoesNotContain("prod", sql);
    }
}

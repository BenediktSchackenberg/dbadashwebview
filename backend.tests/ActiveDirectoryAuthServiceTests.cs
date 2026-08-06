using DBADashWebView.Auth;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class ActiveDirectoryAuthServiceTests
{
    private static readonly AdGroupIdentity AdminGroup = new(
        "DBA-Admins",
        "CN=DBA-Admins,OU=Groups,DC=corp,DC=local");

    private static readonly AdGroupIdentity OperatorGroup = new(
        "DBA-Operators",
        "CN=DBA-Operators,OU=Groups,DC=corp,DC=local");

    [Fact]
    public void BuildTransitiveGroupFilter_EscapesUserDistinguishedName()
    {
        var filter = ActiveDirectoryAuthService.BuildTransitiveGroupFilter(
            @"CN=Alice (DBA)*,OU=Users\Special,DC=corp,DC=local");

        Assert.Equal(
            @"(&(objectCategory=group)(member:1.2.840.113556.1.4.1941:=CN=Alice \28DBA\29\2a,OU=Users\5cSpecial,DC=corp,DC=local))",
            filter);
    }

    [Theory]
    [InlineData("memberOf")]
    [InlineData("MEMBEROF")]
    [InlineData("memberOf;range=0-1499")]
    public void IsMemberOfAttributeName_AcceptsRegularAndRangedNames(string attributeName)
    {
        Assert.True(ActiveDirectoryAuthService.IsMemberOfAttributeName(attributeName));
    }

    [Fact]
    public void GetNextMemberOfRangeStart_ContinuesAfterFiniteRange()
    {
        var next = ActiveDirectoryAuthService.GetNextMemberOfRangeStart(
            ["memberOf", "memberOf;range=0-1499"]);

        Assert.Equal(1500, next);
    }

    [Theory]
    [InlineData("memberOf")]
    [InlineData("memberOf;range=1500-*")]
    public void GetNextMemberOfRangeStart_StopsAfterCompleteResult(string attributeName)
    {
        Assert.Null(ActiveDirectoryAuthService.GetNextMemberOfRangeStart([attributeName]));
    }

    [Fact]
    public void GetGroupNameFromDistinguishedName_UnescapesCommonName()
    {
        var name = ActiveDirectoryAuthService.GetGroupNameFromDistinguishedName(
            @"CN=DBA\, Europe,OU=Groups,DC=corp,DC=local");

        Assert.Equal("DBA, Europe", name);
    }

    [Fact]
    public void MatchesConfiguredGroup_AcceptsPlainNameAndFullDistinguishedName()
    {
        var groups = new[] { AdminGroup };

        Assert.True(ActiveDirectoryAuthService.MatchesConfiguredGroup(groups, "dba-admins"));
        Assert.True(ActiveDirectoryAuthService.MatchesConfiguredGroup(
            groups,
            "cn=dba-admins,ou=groups,dc=corp,dc=local"));
        Assert.False(ActiveDirectoryAuthService.MatchesConfiguredGroup(groups, "DBA-Readers"));
    }

    [Fact]
    public void ResolveRole_PrefersAdminOverOperator()
    {
        var role = ActiveDirectoryAuthService.ResolveRole(
            [OperatorGroup, AdminGroup],
            "DBA-Operators",
            "DBA-Admins");

        Assert.Equal(AppRoles.Admin, role);
    }
}

using System.Net;
using System.Net.Http.Headers;
using DBADashWebView.Auth;
using Microsoft.Extensions.Primitives;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class AdminViewTagFilterUnitTests
{
    [Fact]
    public void ParseHeader_DecodesTrimsAndDeduplicatesTags()
    {
        var tags = AdminViewTagFilterMiddleware.ParseHeader(
            new StringValues("team%20blue,prod%2Ccritical,TEAM%20BLUE,,"));

        Assert.Equal(new[] { "team blue", "prod,critical" }, tags);
    }

    [Fact]
    public void ParseHeader_DropsOversizedTagsAndCapsTheCount()
    {
        var values = Enumerable.Range(1, AdminViewTagFilterMiddleware.MaxTagCount + 5)
            .Select(index => $"tag-{index}")
            .Append(new string('x', AdminViewTagFilterMiddleware.MaxTagLength + 1));

        var tags = AdminViewTagFilterMiddleware.ParseHeader(string.Join(',', values));

        Assert.Equal(AdminViewTagFilterMiddleware.MaxTagCount, tags.Count);
        Assert.DoesNotContain(tags, tag => tag.Length > AdminViewTagFilterMiddleware.MaxTagLength);
    }
}

public sealed class AdminViewTagFilterEndpointTests : IClassFixture<AlertsWebApplicationFactory>
{
    private readonly AlertsWebApplicationFactory _factory;

    public AdminViewTagFilterEndpointTests(AlertsWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task AdminHeader_FiltersInstanceQueriesWithDecodedParameters()
    {
        _factory.Sql.Reset();
        var client = AuthenticatedClient(AppRoles.Admin);
        client.DefaultRequestHeaders.Add(AdminViewTagFilterMiddleware.HeaderName, "team%20blue,production");

        var response = await client.GetAsync("/api/instances");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("@scope_view_tag_0", _factory.Sql.LastSql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("@scope_view_tag_1", _factory.Sql.LastSql, StringComparison.OrdinalIgnoreCase);
        var parameters = Assert.Single(_factory.Sql.ParameterHistory);
        Assert.Contains(parameters, parameter => parameter.name == "@scope_view_tag_0" && Equals(parameter.value, "team blue"));
        Assert.Contains(parameters, parameter => parameter.name == "@scope_view_tag_1" && Equals(parameter.value, "production"));
    }

    [Fact]
    public async Task NonAdminHeader_IsIgnored()
    {
        _factory.Sql.Reset();
        var client = AuthenticatedClient(AppRoles.Viewer);
        client.DefaultRequestHeaders.Add(AdminViewTagFilterMiddleware.HeaderName, "production");

        var response = await client.GetAsync("/api/instances");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("view_tag", _factory.Sql.LastSql, StringComparison.OrdinalIgnoreCase);
        Assert.Empty(Assert.Single(_factory.Sql.ParameterHistory));
    }

    [Fact]
    public async Task TagsEndpoint_ReturnsRealDbaDashTagsForAdmins()
    {
        _factory.Sql.Reset();

        var response = await AuthenticatedClient(AppRoles.Admin).GetAsync("/api/tags");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("FROM dbo.Tags", _factory.Sql.LastSql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("dbo.InstanceIDsTags", _factory.Sql.LastSql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task TagsEndpoint_RejectsNonAdmins()
    {
        _factory.Sql.Reset();

        var response = await AuthenticatedClient(AppRoles.Viewer).GetAsync("/api/tags");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(0, _factory.Sql.QueryCount);
    }

    private HttpClient AuthenticatedClient(string role)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _factory.TokenFor(role, []));
        return client;
    }
}

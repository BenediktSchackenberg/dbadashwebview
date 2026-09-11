using System.Net;
using System.Net.Http.Headers;
using DBADashWebView.Auth;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class MonitoringEndpointMappingsTests : IClassFixture<AlertsWebApplicationFactory>
{
    private readonly AlertsWebApplicationFactory _factory;

    public MonitoringEndpointMappingsTests(AlertsWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task ConfigurationChangesEndpoint_UsesRecordedHistoryAndActualChangeTime()
    {
        _factory.Sql.Reset();

        var response = await AuthenticatedClient()
            .GetAsync("/api/monitoring/configuration/changes?instanceId=42&days=30");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var sql = Assert.Single(_factory.Sql.SqlHistory);
        Assert.Contains("FROM dbo.SysConfigHistory", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("h.value AS old_value", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("h.new_value", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("h.ValidTo AS ChangeDate", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("h.ValidTo >= DATEADD(day, -@days", sql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("LAG(", sql, StringComparison.OrdinalIgnoreCase);
    }

    private HttpClient AuthenticatedClient()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _factory.TokenFor(AppRoles.Admin, []));
        return client;
    }
}

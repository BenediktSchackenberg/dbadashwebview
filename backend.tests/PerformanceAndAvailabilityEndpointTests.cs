using System.Net;
using System.Net.Http.Headers;
using DBADashWebView.Auth;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class PerformanceAndAvailabilityEndpointTests : IClassFixture<AlertsWebApplicationFactory>
{
    private readonly AlertsWebApplicationFactory _factory;

    public PerformanceAndAvailabilityEndpointTests(AlertsWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task MemoryEndpoint_UsesLatestClerkSnapshotsAndAllRequiredCounters()
    {
        _factory.Sql.Reset();
        var response = await AuthenticatedClient().GetAsync("/api/performance/memory?hours=24");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2, _factory.Sql.QueryCount);

        var clerkSql = Assert.Single(_factory.Sql.SqlHistory, sql => sql.Contains("FROM dbo.MemoryUsage", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("MAX(mu.SnapshotDate)", clerkSql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("JOIN dbo.MemoryUsage mu", clerkSql, StringComparison.OrdinalIgnoreCase);

        var counterSql = Assert.Single(_factory.Sql.SqlHistory, sql => sql.Contains("FROM dbo.PerformanceCounters", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("Page life expectancy", counterSql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Database Cache Memory", counterSql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Memory Grants Pending", counterSql, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("object_name LIKE '%Memory%'", counterSql, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AvailabilityGroupsEndpoint_DerivesHealthAndFailoverStateFromHadrData()
    {
        _factory.Sql.Reset();
        var response = await AuthenticatedClient().GetAsync("/api/availability-groups");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var sql = Assert.Single(_factory.Sql.SqlHistory);
        Assert.Contains("dbo.DatabasesHADR", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("dbo.AvailabilityReplicas", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("secondary_count", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("synchronization_health", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("is_failover_ready", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("source_rank = 1", sql, StringComparison.OrdinalIgnoreCase);
    }

    private HttpClient AuthenticatedClient()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _factory.TokenFor(AppRoles.Admin, []));
        return client;
    }
}

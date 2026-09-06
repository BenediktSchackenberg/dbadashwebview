using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using DBADashWebView.Auth;
using DBADashWebView.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace DBADashWebView.Tests;

/// <summary>
/// End-to-end guard for the alert scope short-circuit.
///
/// Alert.ActiveAlerts_Get and Alert.ClosedAlerts_Get treat an empty table-valued
/// parameter as "all instances", so a tag-restricted user matching no instance
/// must never reach the procedure. These tests drive the real endpoints with a
/// scoped JWT and a SqlDataService whose scope lookup returns no rows; if the
/// short-circuit is removed, the handler opens a connection and the request fails
/// instead of returning an empty list.
/// </summary>
public sealed class AlertsEndpointScopeTests : IClassFixture<AlertsWebApplicationFactory>
{
    private readonly AlertsWebApplicationFactory _factory;

    public AlertsEndpointScopeTests(AlertsWebApplicationFactory factory) => _factory = factory;

    [Theory]
    [InlineData("/api/alerts/active")]
    [InlineData("/api/alerts/closed")]
    public async Task RestrictedScopeMatchingNoInstance_ReturnsEmpty_WithoutQueryingAlerts(string path)
    {
        _factory.Sql.Reset();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _factory.TokenFor(AppRoles.Viewer, ["no-such-tag"]));

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(payload.RootElement.GetProperty("supported").GetBoolean());
        Assert.Empty(payload.RootElement.GetProperty("data").EnumerateArray());

        // Exactly one query — the scope lookup. Reaching the stored procedure would
        // mean opening a real connection, which is the leak this guards against.
        Assert.Equal(1, _factory.Sql.QueryCount);
        Assert.Contains("InstanceID", _factory.Sql.LastSql, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("/api/alerts/active")]
    [InlineData("/api/alerts/closed")]
    public async Task UnauthenticatedRequest_IsRejected(string path)
    {
        var response = await _factory.CreateClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}

/// <summary>
/// The alert write endpoints call stored procedures that a db_datareader
/// deployment cannot execute, so they stay closed until an operator opts in.
/// </summary>
public sealed class AlertsEndpointWriteCapabilityTests : IClassFixture<AlertsWebApplicationFactory>
{
    private readonly AlertsWebApplicationFactory _factory;

    public AlertsEndpointWriteCapabilityTests(AlertsWebApplicationFactory factory) => _factory = factory;

    public static TheoryData<HttpMethod, string, string> WriteRoutes => new()
    {
        { HttpMethod.Post, "/api/alerts/acknowledge", """{"alertIds":[1],"isAcknowledged":true}""" },
        { HttpMethod.Post, "/api/alerts/close", """{"alertIds":[1]}""" },
        { HttpMethod.Put, "/api/alerts/1/notes", """{"notes":"hello"}""" },
    };

    [Theory]
    [MemberData(nameof(WriteRoutes))]
    public async Task WriteCapabilityDisabled_IsRefused_WithoutTouchingTheDatabase(
        HttpMethod method, string path, string body)
    {
        _factory.Sql.Reset();
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _factory.TokenFor(AppRoles.Admin, []));

        using var request = new HttpRequestMessage(method, path)
        {
            Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json")
        };
        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        // Refused before any scope lookup or procedure call.
        Assert.Equal(0, _factory.Sql.QueryCount);
    }
}

/// <summary>
/// Records every query and never touches SQL Server. Scope lookups resolve to no
/// instances, which is the condition under test.
/// </summary>
public sealed class RecordingSqlDataService(IConfiguration configuration) : SqlDataService(configuration)
{
    public int QueryCount { get; private set; }

    public string LastSql { get; private set; } = string.Empty;

    public List<string> SqlHistory { get; } = [];

    public void Reset()
    {
        QueryCount = 0;
        LastSql = string.Empty;
        SqlHistory.Clear();
    }

    public override Task<List<Dictionary<string, object?>>> QueryAsync(
        string sql,
        CancellationToken cancellationToken,
        params (string name, object? value)[] parameters)
    {
        QueryCount++;
        LastSql = sql;
        SqlHistory.Add(sql);
        return Task.FromResult(new List<Dictionary<string, object?>>());
    }
}

public sealed class AlertsWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _userStorePath =
        Path.Combine(Path.GetTempPath(), $"dbadash-tests-{Guid.NewGuid():N}", "local-users.json");

    /// Resolved on demand: touching Services builds the host, so this is valid
    /// before the first CreateClient() call.
    public RecordingSqlDataService Sql => Services.GetRequiredService<RecordingSqlDataService>();

    public string TokenFor(string role, string[] allowedTags) =>
        Services.GetRequiredService<JwtTokenService>()
            .CreateToken("scoped-tester", "Scoped Tester", role, allowedTags);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Development supplies the JWT fallback secret, so the host starts without
        // any deployment configuration.
        builder.UseEnvironment(Environments.Development);

        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DBADashDB"] = "Server=(unused);Database=(unused);",
            // Keep the bootstrap user store out of the repository.
            ["LocalAuth:UserStorePath"] = _userStorePath,
            ["LocalAuth:BootstrapAdminPassword"] = "tests-only-not-a-real-password",
        }));

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<SqlDataService>();
            services.AddSingleton<RecordingSqlDataService>();
            services.AddSingleton<SqlDataService>(sp => sp.GetRequiredService<RecordingSqlDataService>());
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;

        var directory = Path.GetDirectoryName(_userStorePath);
        if (directory is not null && Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}

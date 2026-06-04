using DBADashWebView.Auth;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class LocalUserStoreTests : IDisposable
{
    private readonly string _tempDirectory;

    public LocalUserStoreTests()
    {
        _tempDirectory = Path.Combine(Path.GetTempPath(), "dbadashwebview-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDirectory);
    }

    [Fact]
    public async Task EnsureSeededAsync_CreatesBootstrapAdmin_WhenStoreIsEmpty()
    {
        var store = CreateStore(new Dictionary<string, string?>
        {
            ["LocalAuth:Enabled"] = "true",
            ["LocalAuth:UserStorePath"] = Path.Combine(_tempDirectory, "users.json"),
            ["LocalAuth:BootstrapAdminUsername"] = "bootstrap-admin",
            ["LocalAuth:BootstrapAdminDisplayName"] = "Bootstrap Admin",
            ["LocalAuth:BootstrapAdminPassword"] = "change-me-now"
        });

        await store.EnsureSeededAsync();

        var users = await store.GetUsersAsync();
        var status = await store.GetStatusAsync();

        Assert.Single(users);
        Assert.Equal("bootstrap-admin", users[0].Username);
        Assert.Equal(AppRoles.Admin, users[0].Role);
        Assert.False(status.BootstrapRequired);
    }

    [Fact]
    public async Task CreateAndValidateCredentials_RoundTripsHashedPasswords()
    {
        var store = CreateStore(new Dictionary<string, string?>
        {
            ["LocalAuth:Enabled"] = "true",
            ["LocalAuth:UserStorePath"] = Path.Combine(_tempDirectory, "users.json")
        });

        var created = await store.CreateUserAsync(new CreateLocalUserRequest(
            "operator-user",
            "Operator User",
            "S3cret!",
            AppRoles.Operator,
            true));

        var validUser = await store.ValidateCredentialsAsync("operator-user", "S3cret!");
        var invalidUser = await store.ValidateCredentialsAsync("operator-user", "wrong-password");

        Assert.Equal(created.Username, validUser?.Username);
        Assert.Equal(AppRoles.Operator, validUser?.Role);
        Assert.Null(invalidUser);
    }

    [Fact]
    public async Task UpdateUserAsync_RejectsRemovingLastActiveAdmin()
    {
        var store = CreateStore(new Dictionary<string, string?>
        {
            ["LocalAuth:Enabled"] = "true",
            ["LocalAuth:UserStorePath"] = Path.Combine(_tempDirectory, "users.json"),
            ["LocalAuth:BootstrapAdminPassword"] = "seed-admin"
        });

        await store.EnsureSeededAsync();
        var admin = (await store.GetUsersAsync()).Single();

        await Assert.ThrowsAsync<InvalidOperationException>(() => store.UpdateUserAsync(
            admin.Id,
            new UpdateLocalUserRequest(admin.DisplayName, AppRoles.Viewer, false, null)));
    }

    [Fact]
    public async Task CreateUserAsync_PersistsAllowedTagsAndGroupIds()
    {
        var store = CreateStore(new Dictionary<string, string?>
        {
            ["LocalAuth:Enabled"] = "true",
            ["LocalAuth:UserStorePath"] = Path.Combine(_tempDirectory, "users.json")
        });

        var created = await store.CreateUserAsync(new CreateLocalUserRequest(
            "scoped-user",
            "Scoped User",
            "S3cret!",
            AppRoles.Operator,
            true,
            new[] { "prod", "eu-west" },
            new[] { 1, 2 }));

        Assert.Equal(new[] { "eu-west", "prod" }, created.AllowedTags.OrderBy(t => t).ToArray());
        Assert.Equal(new[] { 1, 2 }, created.AllowedGroupIds.OrderBy(g => g).ToArray());

        var reloaded = (await store.GetUsersAsync()).Single(u => u.Username == "scoped-user");
        Assert.Equal(created.AllowedTags.OrderBy(t => t), reloaded.AllowedTags.OrderBy(t => t));
        Assert.Equal(created.AllowedGroupIds.OrderBy(g => g), reloaded.AllowedGroupIds.OrderBy(g => g));
    }

    [Fact]
    public async Task UpdateUserAsync_UpdatesScope()
    {
        var store = CreateStore(new Dictionary<string, string?>
        {
            ["LocalAuth:Enabled"] = "true",
            ["LocalAuth:UserStorePath"] = Path.Combine(_tempDirectory, "users.json")
        });

        var created = await store.CreateUserAsync(new CreateLocalUserRequest(
            "scoped-user",
            "Scoped User",
            "S3cret!",
            AppRoles.Operator,
            true));

        Assert.Empty(created.AllowedTags);
        Assert.Empty(created.AllowedGroupIds);

        var updated = await store.UpdateUserAsync(
            created.Id,
            new UpdateLocalUserRequest(
                created.DisplayName,
                created.Role,
                created.Active,
                null,
                new[] { "prod" },
                new[] { 7 }));

        Assert.Equal(new[] { "prod" }, updated.AllowedTags);
        Assert.Equal(new[] { 7 }, updated.AllowedGroupIds);
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDirectory))
        {
            Directory.Delete(_tempDirectory, recursive: true);
        }
    }

    private static LocalUserStore CreateStore(IReadOnlyDictionary<string, string?> values)
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(values)
            .Build();

        return new LocalUserStore(configuration, NullLogger<LocalUserStore>.Instance);
    }
}

using System.DirectoryServices.Protocols;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace DBADashWebView.Auth;

public sealed class ActiveDirectoryAuthService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly IDataProtector _protector;
    private readonly ILogger<ActiveDirectoryAuthService> _logger;
    private readonly SemaphoreSlim _mutex = new(1, 1);
    private readonly string _configPath;

    public ActiveDirectoryAuthService(IDataProtectionProvider dataProtectionProvider, ILogger<ActiveDirectoryAuthService> logger)
    {
        _protector = dataProtectionProvider.CreateProtector("DBADashWebView.ActiveDirectory.BindPassword");
        _logger = logger;
        _configPath = Path.Combine(AppContext.BaseDirectory, "config", "ad-config.json");
    }

    public async Task<AdConfigResponse> GetEditableConfigurationAsync(CancellationToken cancellationToken = default)
    {
        var configuration = await LoadAsync(cancellationToken);
        return ToResponse(configuration);
    }

    public async Task SaveAsync(AdConfigRequest request, CancellationToken cancellationToken = default)
    {
        await _mutex.WaitAsync(cancellationToken);
        try
        {
            var current = await LoadUnsafeAsync(cancellationToken);
            current.Enabled = request.Enabled;
            current.Server = request.Server?.Trim() ?? string.Empty;
            current.Port = request.Port > 0 ? request.Port : (request.UseSsl ? 636 : 389);
            current.UseSsl = request.UseSsl;
            current.Domain = request.Domain?.Trim() ?? string.Empty;
            current.BaseDn = request.BaseDn?.Trim() ?? string.Empty;
            current.RequiredGroup = request.RequiredGroup?.Trim() ?? string.Empty;
            current.OperatorGroup = request.OperatorGroup?.Trim() ?? string.Empty;
            current.AdminGroup = request.AdminGroup?.Trim() ?? string.Empty;
            current.AllowLocalFallback = request.AllowLocalFallback;
            current.BindUser = request.BindUser?.Trim() ?? string.Empty;

            if (!string.IsNullOrWhiteSpace(request.BindPassword))
            {
                current.ProtectedBindPassword = _protector.Protect(request.BindPassword);
            }

            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
            await using var stream = File.Create(_configPath);
            await JsonSerializer.SerializeAsync(stream, current, JsonOptions, cancellationToken);
        }
        finally
        {
            _mutex.Release();
        }
    }

    public async Task<AdLoginTestResponse> TestLoginAsync(LoginRequest request, CancellationToken cancellationToken = default)
    {
        var result = await TryAuthenticateAsync(request.Username, request.Password, cancellationToken);
        return result is null
            ? new AdLoginTestResponse(false, "AD login failed. Check credentials and AD configuration.", null, AppRoles.Viewer, [])
            : new AdLoginTestResponse(true, $"Login successful as {result.DisplayName ?? result.Username}", result.DisplayName, result.Role, result.Groups);
    }

    public async Task<AdAuthenticationResult?> TryAuthenticateAsync(string username, string password, CancellationToken cancellationToken = default)
    {
        var configuration = await LoadRuntimeAsync(cancellationToken);
        if (!configuration.Enabled || string.IsNullOrWhiteSpace(configuration.Server) || string.IsNullOrWhiteSpace(configuration.Domain))
        {
            return null;
        }

        try
        {
            var userPrincipal = $"{username}@{configuration.Domain}";
            using var validationConnection = CreateConnection(configuration.Server, configuration.Port, configuration.UseSsl, userPrincipal, password);
            validationConnection.Bind();

            using var searchConnection = CreateSearchConnection(configuration, userPrincipal, password);
            searchConnection.Bind();

            var baseDn = string.IsNullOrWhiteSpace(configuration.BaseDn)
                ? string.Join(",", configuration.Domain.Split('.').Select(part => $"DC={part}"))
                : configuration.BaseDn;
            var filter = $"(&(objectClass=user)(sAMAccountName={EscapeLdapFilter(username)}))";
            var searchRequest = new SearchRequest(baseDn, filter, SearchScope.Subtree, "displayName", "memberOf", "sAMAccountName");
            var searchResponse = (SearchResponse)searchConnection.SendRequest(searchRequest);

            string? displayName = null;
            var groups = new List<string>();
            if (searchResponse.Entries.Count > 0)
            {
                var entry = searchResponse.Entries[0];
                if (entry.Attributes.Contains("displayName"))
                {
                    displayName = entry.Attributes["displayName"][0]?.ToString();
                }

                if (entry.Attributes.Contains("memberOf"))
                {
                    foreach (var group in entry.Attributes["memberOf"])
                    {
                        var groupDn = group?.ToString() ?? string.Empty;
                        var commonName = groupDn.Split(',')
                            .FirstOrDefault(part => part.StartsWith("CN=", StringComparison.OrdinalIgnoreCase));
                        if (commonName is not null)
                        {
                            groups.Add(commonName[3..]);
                        }
                    }
                }
            }

            if (!string.IsNullOrWhiteSpace(configuration.RequiredGroup) &&
                !groups.Any(group => group.Equals(configuration.RequiredGroup, StringComparison.OrdinalIgnoreCase)))
            {
                return null;
            }

            var role = AppRoles.Viewer;
            if (!string.IsNullOrWhiteSpace(configuration.AdminGroup) &&
                groups.Any(group => group.Equals(configuration.AdminGroup, StringComparison.OrdinalIgnoreCase)))
            {
                role = AppRoles.Admin;
            }
            else if (!string.IsNullOrWhiteSpace(configuration.OperatorGroup) &&
                     groups.Any(group => group.Equals(configuration.OperatorGroup, StringComparison.OrdinalIgnoreCase)))
            {
                role = AppRoles.Operator;
            }

            return new AdAuthenticationResult(username, displayName, role, groups);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Active Directory authentication failed for user '{Username}'.", username);
            return null;
        }
    }

    public async Task<bool> IsEnabledAsync(CancellationToken cancellationToken = default) =>
        (await LoadAsync(cancellationToken)).Enabled;

    public async Task<bool> AllowsLocalFallbackAsync(CancellationToken cancellationToken = default) =>
        (await LoadAsync(cancellationToken)).AllowLocalFallback;

    private LdapConnection CreateSearchConnection(RuntimeAdConfiguration configuration, string userPrincipal, string password)
    {
        if (!string.IsNullOrWhiteSpace(configuration.BindUser) && !string.IsNullOrWhiteSpace(configuration.BindPassword))
        {
            return CreateConnection(configuration.Server, configuration.Port, configuration.UseSsl, configuration.BindUser, configuration.BindPassword);
        }

        return CreateConnection(configuration.Server, configuration.Port, configuration.UseSsl, userPrincipal, password);
    }

    private static LdapConnection CreateConnection(string server, int port, bool useSsl, string username, string password)
    {
        var identifier = new LdapDirectoryIdentifier(server, port);
        var connection = new LdapConnection(identifier, new NetworkCredential(username, password), AuthType.Basic);
        connection.SessionOptions.ProtocolVersion = 3;
        if (useSsl)
        {
            connection.SessionOptions.SecureSocketLayer = true;
        }

        return connection;
    }

    private async Task<StoredAdConfiguration> LoadAsync(CancellationToken cancellationToken)
    {
        await _mutex.WaitAsync(cancellationToken);
        try
        {
            return await LoadUnsafeAsync(cancellationToken);
        }
        finally
        {
            _mutex.Release();
        }
    }

    private async Task<StoredAdConfiguration> LoadUnsafeAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_configPath))
        {
            return new StoredAdConfiguration();
        }

        await using var stream = File.OpenRead(_configPath);
        return await JsonSerializer.DeserializeAsync<StoredAdConfiguration>(stream, JsonOptions, cancellationToken)
            ?? new StoredAdConfiguration();
    }

    private async Task<RuntimeAdConfiguration> LoadRuntimeAsync(CancellationToken cancellationToken)
    {
        var configuration = await LoadAsync(cancellationToken);
        string bindPassword = string.Empty;
        if (!string.IsNullOrWhiteSpace(configuration.ProtectedBindPassword))
        {
            try
            {
                bindPassword = _protector.Unprotect(configuration.ProtectedBindPassword);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to unprotect stored AD bind password.");
            }
        }

        return new RuntimeAdConfiguration(
            configuration.Enabled,
            configuration.Server,
            configuration.Port > 0 ? configuration.Port : (configuration.UseSsl ? 636 : 389),
            configuration.UseSsl,
            configuration.Domain,
            configuration.BaseDn,
            configuration.RequiredGroup,
            configuration.OperatorGroup,
            configuration.AdminGroup,
            configuration.AllowLocalFallback,
            configuration.BindUser,
            bindPassword);
    }

    private static AdConfigResponse ToResponse(StoredAdConfiguration configuration) =>
        new(
            configuration.Enabled,
            configuration.Server,
            configuration.Port,
            configuration.UseSsl,
            configuration.Domain,
            configuration.BaseDn,
            configuration.RequiredGroup,
            configuration.OperatorGroup,
            configuration.AdminGroup,
            configuration.AllowLocalFallback,
            configuration.BindUser,
            !string.IsNullOrWhiteSpace(configuration.ProtectedBindPassword));

    private static string EscapeLdapFilter(string value) =>
        value
            .Replace(@"\", @"\5c", StringComparison.Ordinal)
            .Replace("*", @"\2a", StringComparison.Ordinal)
            .Replace("(", @"\28", StringComparison.Ordinal)
            .Replace(")", @"\29", StringComparison.Ordinal)
            .Replace("\0", @"\00", StringComparison.Ordinal);

    private sealed class StoredAdConfiguration
    {
        public bool Enabled { get; set; }
        public string Server { get; set; } = string.Empty;
        public int Port { get; set; } = 389;
        public bool UseSsl { get; set; }
        public string Domain { get; set; } = string.Empty;
        public string BaseDn { get; set; } = string.Empty;
        public string RequiredGroup { get; set; } = string.Empty;
        public string OperatorGroup { get; set; } = string.Empty;
        public string AdminGroup { get; set; } = string.Empty;
        public bool AllowLocalFallback { get; set; } = true;
        public string BindUser { get; set; } = string.Empty;
        public string ProtectedBindPassword { get; set; } = string.Empty;
    }

    private sealed record RuntimeAdConfiguration(
        bool Enabled,
        string Server,
        int Port,
        bool UseSsl,
        string Domain,
        string BaseDn,
        string RequiredGroup,
        string OperatorGroup,
        string AdminGroup,
        bool AllowLocalFallback,
        string BindUser,
        string BindPassword);
}

public sealed record AdAuthenticationResult(
    string Username,
    string? DisplayName,
    string Role,
    IReadOnlyList<string> Groups);

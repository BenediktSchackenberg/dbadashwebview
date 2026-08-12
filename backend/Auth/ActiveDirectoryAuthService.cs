using System.DirectoryServices.Protocols;
using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace DBADashWebView.Auth;

public sealed class ActiveDirectoryAuthService
{
    private const string TransitiveEvaluationMatchingRule = "1.2.840.113556.1.4.1941";
    private const int GroupSearchPageSize = 500;

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

            var domainRootDn = string.Join(",", configuration.Domain.Split('.').Select(part => $"DC={part}"));
            var baseDn = string.IsNullOrWhiteSpace(configuration.BaseDn)
                ? domainRootDn
                : configuration.BaseDn;
            var filter = $"(&(objectClass=user)(sAMAccountName={EscapeLdapFilter(username)}))";
            var searchRequest = new SearchRequest(baseDn, filter, SearchScope.Subtree, "displayName", "memberOf", "sAMAccountName");
            var searchResponse = (SearchResponse)searchConnection.SendRequest(searchRequest);

            if (searchResponse.Entries.Count == 0)
            {
                _logger.LogWarning("Active Directory user search returned no entry for user '{Username}'.", username);
                return null;
            }

            var entry = searchResponse.Entries[0];
            var displayName = GetFirstAttributeValue(entry.Attributes, "displayName");
            var attributeNames = GetAttributeNames(entry.Attributes);
            _logger.LogDebug(
                "Active Directory user lookup for '{Username}' returned attributes: {AttributeNames}.",
                username,
                string.Join(", ", attributeNames));

            var groupResolution = ResolveGroups(searchConnection, domainRootDn, entry, cancellationToken);
            var groups = groupResolution.Groups;
            _logger.LogInformation(
                "Resolved {GroupCount} Active Directory groups for user '{Username}' using {ResolutionMethod}.",
                groups.Count,
                username,
                groupResolution.Method);

            if (!string.IsNullOrWhiteSpace(configuration.RequiredGroup) &&
                !MatchesConfiguredGroup(groups, configuration.RequiredGroup))
            {
                _logger.LogWarning(
                    "Active Directory user '{Username}' does not satisfy required group '{RequiredGroup}'.",
                    username,
                    configuration.RequiredGroup);
                return null;
            }

            var role = ResolveRole(groups, configuration.OperatorGroup, configuration.AdminGroup);
            var groupNames = groups
                .Select(group => group.Name)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(group => group, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            return new AdAuthenticationResult(username, displayName, role, groupNames);
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

    private GroupResolutionResult ResolveGroups(
        LdapConnection connection,
        string baseDn,
        SearchResultEntry userEntry,
        CancellationToken cancellationToken)
    {
        try
        {
            var groups = SearchTransitiveGroups(connection, baseDn, userEntry.DistinguishedName, cancellationToken);
            if (groups.Count > 0)
            {
                return new GroupResolutionResult(groups, "transitive member search");
            }
        }
        catch (Exception ex) when (ex is DirectoryOperationException or LdapException)
        {
            _logger.LogWarning(
                ex,
                "Transitive Active Directory group search failed for user DN '{UserDistinguishedName}'; falling back to memberOf.",
                userEntry.DistinguishedName);
        }

        try
        {
            var groups = ReadMemberOfGroups(connection, userEntry, cancellationToken);
            return new GroupResolutionResult(groups, "memberOf fallback");
        }
        catch (Exception ex) when (ex is DirectoryOperationException or LdapException)
        {
            _logger.LogWarning(
                ex,
                "Active Directory memberOf fallback failed for user DN '{UserDistinguishedName}'.",
                userEntry.DistinguishedName);
            return new GroupResolutionResult([], "unavailable group lookup");
        }
    }

    private static IReadOnlyList<AdGroupIdentity> SearchTransitiveGroups(
        LdapConnection connection,
        string baseDn,
        string userDistinguishedName,
        CancellationToken cancellationToken)
    {
        var groups = new Dictionary<string, AdGroupIdentity>(StringComparer.OrdinalIgnoreCase);
        byte[]? cookie = null;

        do
        {
            cancellationToken.ThrowIfCancellationRequested();
            var request = new SearchRequest(
                baseDn,
                BuildTransitiveGroupFilter(userDistinguishedName),
                SearchScope.Subtree,
                "cn");
            var pageControl = new PageResultRequestControl(GroupSearchPageSize)
            {
                Cookie = cookie ?? []
            };
            request.Controls.Add(pageControl);

            var response = (SearchResponse)connection.SendRequest(request);
            foreach (SearchResultEntry groupEntry in response.Entries)
            {
                var distinguishedName = groupEntry.DistinguishedName;
                var name = GetFirstAttributeValue(groupEntry.Attributes, "cn");
                if (string.IsNullOrWhiteSpace(name))
                {
                    name = GetGroupNameFromDistinguishedName(distinguishedName);
                }

                if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(distinguishedName))
                {
                    groups.TryAdd(distinguishedName, new AdGroupIdentity(name, distinguishedName));
                }
            }

            cookie = response.Controls
                .OfType<PageResultResponseControl>()
                .FirstOrDefault()
                ?.Cookie;
        }
        while (cookie is { Length: > 0 });

        return groups.Values
            .OrderBy(group => group.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static IReadOnlyList<AdGroupIdentity> ReadMemberOfGroups(
        LdapConnection connection,
        SearchResultEntry userEntry,
        CancellationToken cancellationToken)
    {
        var groups = new Dictionary<string, AdGroupIdentity>(StringComparer.OrdinalIgnoreCase);
        var attributeNames = GetAttributeNames(userEntry.Attributes);
        AddMemberOfGroups(groups, userEntry.Attributes, attributeNames);

        int? nextRangeStart = attributeNames.Any(IsMemberOfAttributeName)
            ? GetNextMemberOfRangeStart(attributeNames)
            : 0;

        while (nextRangeStart is int rangeStart)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var request = new SearchRequest(
                userEntry.DistinguishedName,
                "(objectClass=*)",
                SearchScope.Base,
                $"memberOf;range={rangeStart}-*");
            var response = (SearchResponse)connection.SendRequest(request);
            if (response.Entries.Count == 0)
            {
                break;
            }

            var attributes = response.Entries[0].Attributes;
            attributeNames = GetAttributeNames(attributes);
            AddMemberOfGroups(groups, attributes, attributeNames);

            var followingRangeStart = GetNextMemberOfRangeStart(attributeNames);
            if (followingRangeStart is null || followingRangeStart <= rangeStart)
            {
                break;
            }

            nextRangeStart = followingRangeStart;
        }

        return groups.Values
            .OrderBy(group => group.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static void AddMemberOfGroups(
        IDictionary<string, AdGroupIdentity> groups,
        SearchResultAttributeCollection attributes,
        IEnumerable<string> attributeNames)
    {
        foreach (var attributeName in attributeNames.Where(IsMemberOfAttributeName))
        {
            foreach (var value in attributes[attributeName])
            {
                var distinguishedName = ConvertAttributeValue(value);
                if (string.IsNullOrWhiteSpace(distinguishedName))
                {
                    continue;
                }

                var name = GetGroupNameFromDistinguishedName(distinguishedName);
                groups.TryAdd(distinguishedName, new AdGroupIdentity(name, distinguishedName));
            }
        }
    }

    private static string? GetFirstAttributeValue(SearchResultAttributeCollection attributes, string attributeName)
    {
        var returnedName = attributes.AttributeNames
            .Cast<string>()
            .FirstOrDefault(name => name.Equals(attributeName, StringComparison.OrdinalIgnoreCase));
        return returnedName is not null && attributes[returnedName].Count > 0
            ? ConvertAttributeValue(attributes[returnedName][0])
            : null;
    }

    internal static string? ConvertAttributeValue(object? value) => value switch
    {
        null => null,
        string text => text,
        byte[] bytes => Encoding.UTF8.GetString(bytes),
        _ => value.ToString()
    };

    private static string[] GetAttributeNames(SearchResultAttributeCollection attributes) =>
        attributes.AttributeNames
            .Cast<string>()
            .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

    internal static string BuildTransitiveGroupFilter(string userDistinguishedName) =>
        $"(&(objectCategory=group)(member:{TransitiveEvaluationMatchingRule}:={EscapeLdapFilter(userDistinguishedName)}))";

    internal static bool IsMemberOfAttributeName(string attributeName) =>
        attributeName.Equals("memberOf", StringComparison.OrdinalIgnoreCase) ||
        attributeName.StartsWith("memberOf;range=", StringComparison.OrdinalIgnoreCase);

    internal static int? GetNextMemberOfRangeStart(IEnumerable<string> attributeNames)
    {
        const string prefix = "memberOf;range=";
        int? nextRangeStart = null;

        foreach (var attributeName in attributeNames)
        {
            if (attributeName.Equals("memberOf", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (!attributeName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var range = attributeName[prefix.Length..];
            var separatorIndex = range.IndexOf('-');
            if (separatorIndex < 0)
            {
                continue;
            }

            var highValue = range[(separatorIndex + 1)..];
            if (highValue == "*")
            {
                return null;
            }

            if (int.TryParse(highValue, out var high))
            {
                nextRangeStart = Math.Max(nextRangeStart ?? 0, high + 1);
            }
        }

        return nextRangeStart;
    }

    internal static string GetGroupNameFromDistinguishedName(string distinguishedName)
    {
        var rdnEnd = distinguishedName.Length;
        for (var index = 0; index < distinguishedName.Length; index++)
        {
            if (distinguishedName[index] == '\\')
            {
                index++;
                continue;
            }

            if (distinguishedName[index] == ',')
            {
                rdnEnd = index;
                break;
            }
        }

        var firstRdn = distinguishedName[..rdnEnd].Trim();
        return firstRdn.StartsWith("CN=", StringComparison.OrdinalIgnoreCase)
            ? UnescapeDistinguishedNameValue(firstRdn[3..])
            : firstRdn;
    }

    private static string UnescapeDistinguishedNameValue(string value)
    {
        var result = new StringBuilder(value.Length);
        var encodedBytes = new List<byte>();

        void FlushEncodedBytes()
        {
            if (encodedBytes.Count == 0)
            {
                return;
            }

            result.Append(Encoding.UTF8.GetString(encodedBytes.ToArray()));
            encodedBytes.Clear();
        }

        for (var index = 0; index < value.Length; index++)
        {
            if (value[index] != '\\' || index + 1 >= value.Length)
            {
                FlushEncodedBytes();
                result.Append(value[index]);
                continue;
            }

            if (index + 2 < value.Length &&
                byte.TryParse(value.AsSpan(index + 1, 2), System.Globalization.NumberStyles.HexNumber, null, out var encodedByte))
            {
                encodedBytes.Add(encodedByte);
                index += 2;
                continue;
            }

            FlushEncodedBytes();
            result.Append(value[++index]);
        }

        FlushEncodedBytes();
        return result.ToString();
    }

    internal static bool MatchesConfiguredGroup(IEnumerable<AdGroupIdentity> groups, string configuredGroup)
    {
        var configured = configuredGroup.Trim();
        return groups.Any(group =>
            group.Name.Equals(configured, StringComparison.OrdinalIgnoreCase) ||
            group.DistinguishedName.Equals(configured, StringComparison.OrdinalIgnoreCase));
    }

    internal static string ResolveRole(
        IReadOnlyCollection<AdGroupIdentity> groups,
        string operatorGroup,
        string adminGroup)
    {
        if (!string.IsNullOrWhiteSpace(adminGroup) && MatchesConfiguredGroup(groups, adminGroup))
        {
            return AppRoles.Admin;
        }

        return !string.IsNullOrWhiteSpace(operatorGroup) && MatchesConfiguredGroup(groups, operatorGroup)
            ? AppRoles.Operator
            : AppRoles.Viewer;
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

    internal static string EscapeLdapFilter(string value) =>
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

    private sealed record GroupResolutionResult(
        IReadOnlyList<AdGroupIdentity> Groups,
        string Method);
}

internal sealed record AdGroupIdentity(string Name, string DistinguishedName);

public sealed record AdAuthenticationResult(
    string Username,
    string? DisplayName,
    string Role,
    IReadOnlyList<string> Groups);

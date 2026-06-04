using System.Text.Json;
using Microsoft.AspNetCore.Identity;

namespace DBADashWebView.Auth;

public sealed class LocalUserStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly IConfiguration _configuration;
    private readonly ILogger<LocalUserStore> _logger;
    private readonly PasswordHasher<StoredLocalUser> _passwordHasher = new();
    private readonly SemaphoreSlim _mutex = new(1, 1);

    public LocalUserStore(IConfiguration configuration, ILogger<LocalUserStore> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public async Task EnsureSeededAsync(CancellationToken cancellationToken = default)
    {
        var options = GetOptions();
        if (!options.Enabled)
        {
            return;
        }

        await _mutex.WaitAsync(cancellationToken);
        try
        {
            var document = await LoadDocumentUnsafeAsync(cancellationToken);
            if (document.Users.Count > 0)
            {
                return;
            }

            if (string.IsNullOrWhiteSpace(options.BootstrapAdminPassword))
            {
                _logger.LogWarning(
                    "Local authentication is enabled but no local users exist. Set LocalAuth__BootstrapAdminPassword to seed the first admin account.");
                return;
            }

            var admin = new StoredLocalUser
            {
                Id = Guid.NewGuid(),
                Username = options.BootstrapAdminUsername.Trim(),
                NormalizedUsername = NormalizeUsername(options.BootstrapAdminUsername),
                DisplayName = string.IsNullOrWhiteSpace(options.BootstrapAdminDisplayName) ? null : options.BootstrapAdminDisplayName.Trim(),
                Role = AppRoles.Admin,
                Active = true,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                AllowedTags = [],
                AllowedGroupIds = []
            };
            admin.PasswordHash = _passwordHasher.HashPassword(admin, options.BootstrapAdminPassword);

            document.Users.Add(admin);
            await SaveDocumentUnsafeAsync(document, cancellationToken);

            _logger.LogWarning(
                "Seeded bootstrap admin user '{Username}'. Remove the bootstrap password from configuration after first sign-in.",
                admin.Username);
        }
        finally
        {
            _mutex.Release();
        }
    }

    public async Task<LocalAuthStatus> GetStatusAsync(CancellationToken cancellationToken = default)
    {
        var options = GetOptions();
        var document = await LoadDocumentAsync(cancellationToken);
        return new LocalAuthStatus(options.Enabled, options.Enabled && document.Users.Count == 0, document.Users.Count);
    }

    public async Task<IReadOnlyList<LocalUserResponse>> GetUsersAsync(CancellationToken cancellationToken = default)
    {
        var document = await LoadDocumentAsync(cancellationToken);
        return document.Users
            .OrderBy(user => user.Username, StringComparer.OrdinalIgnoreCase)
            .Select(ToResponse)
            .ToArray();
    }

    public async Task<LocalUserResponse?> ValidateCredentialsAsync(string username, string password, CancellationToken cancellationToken = default)
    {
        if (!GetOptions().Enabled)
        {
            return null;
        }

        await _mutex.WaitAsync(cancellationToken);
        try
        {
            var document = await LoadDocumentUnsafeAsync(cancellationToken);
            var user = document.Users.FirstOrDefault(candidate =>
                candidate.Active && candidate.NormalizedUsername == NormalizeUsername(username));
            if (user is null)
            {
                return null;
            }

            var verification = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, password);
            if (verification == PasswordVerificationResult.Failed)
            {
                return null;
            }

            if (verification == PasswordVerificationResult.SuccessRehashNeeded)
            {
                user.PasswordHash = _passwordHasher.HashPassword(user, password);
            }

            user.LastLoginAtUtc = DateTimeOffset.UtcNow;
            await SaveDocumentUnsafeAsync(document, cancellationToken);
            return ToResponse(user);
        }
        finally
        {
            _mutex.Release();
        }
    }

    public async Task<LocalUserResponse> CreateUserAsync(CreateLocalUserRequest request, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Username);
        ArgumentException.ThrowIfNullOrWhiteSpace(request.Password);

        if (!AppRoles.IsSupported(request.Role))
        {
            throw new InvalidOperationException($"Unsupported role '{request.Role}'.");
        }

        await _mutex.WaitAsync(cancellationToken);
        try
        {
            var document = await LoadDocumentUnsafeAsync(cancellationToken);
            var normalizedUsername = NormalizeUsername(request.Username);
            if (document.Users.Any(user => user.NormalizedUsername == normalizedUsername))
            {
                throw new InvalidOperationException($"A local user named '{request.Username.Trim()}' already exists.");
            }

            var user = new StoredLocalUser
            {
                Id = Guid.NewGuid(),
                Username = request.Username.Trim(),
                NormalizedUsername = normalizedUsername,
                DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? null : request.DisplayName.Trim(),
                Role = AppRoles.Normalize(request.Role),
                Active = request.Active,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                AllowedTags = NormalizeTags(request.AllowedTags),
                AllowedGroupIds = NormalizeGroupIds(request.AllowedGroupIds)
            };
            user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);

            document.Users.Add(user);
            await SaveDocumentUnsafeAsync(document, cancellationToken);
            return ToResponse(user);
        }
        finally
        {
            _mutex.Release();
        }
    }

    public async Task<LocalUserResponse> UpdateUserAsync(Guid id, UpdateLocalUserRequest request, CancellationToken cancellationToken = default)
    {
        if (!AppRoles.IsSupported(request.Role))
        {
            throw new InvalidOperationException($"Unsupported role '{request.Role}'.");
        }

        await _mutex.WaitAsync(cancellationToken);
        try
        {
            var document = await LoadDocumentUnsafeAsync(cancellationToken);
            var user = document.Users.FirstOrDefault(candidate => candidate.Id == id)
                ?? throw new KeyNotFoundException("Local user not found.");

            var targetRole = AppRoles.Normalize(request.Role);
            if ((user.Role == AppRoles.Admin && (targetRole != AppRoles.Admin || !request.Active)) &&
                document.Users.Count(candidate => candidate.Active && candidate.Role == AppRoles.Admin && candidate.Id != user.Id) == 0)
            {
                throw new InvalidOperationException("At least one active admin account must remain.");
            }

            user.DisplayName = string.IsNullOrWhiteSpace(request.DisplayName) ? null : request.DisplayName.Trim();
            user.Role = targetRole;
            user.Active = request.Active;
            user.AllowedTags = NormalizeTags(request.AllowedTags);
            user.AllowedGroupIds = NormalizeGroupIds(request.AllowedGroupIds);

            if (!string.IsNullOrWhiteSpace(request.Password))
            {
                user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
            }

            await SaveDocumentUnsafeAsync(document, cancellationToken);
            return ToResponse(user);
        }
        finally
        {
            _mutex.Release();
        }
    }

    private LocalAuthOptions GetOptions() =>
        _configuration.GetSection("LocalAuth").Get<LocalAuthOptions>() ?? new LocalAuthOptions();

    private async Task<StoredLocalUserDocument> LoadDocumentAsync(CancellationToken cancellationToken)
    {
        await _mutex.WaitAsync(cancellationToken);
        try
        {
            return await LoadDocumentUnsafeAsync(cancellationToken);
        }
        finally
        {
            _mutex.Release();
        }
    }

    private async Task<StoredLocalUserDocument> LoadDocumentUnsafeAsync(CancellationToken cancellationToken)
    {
        var path = ResolveStorePath();
        if (!File.Exists(path))
        {
            return new StoredLocalUserDocument();
        }

        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<StoredLocalUserDocument>(stream, JsonOptions, cancellationToken)
            ?? new StoredLocalUserDocument();
    }

    private async Task SaveDocumentUnsafeAsync(StoredLocalUserDocument document, CancellationToken cancellationToken)
    {
        var path = ResolveStorePath();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using var stream = File.Create(path);
        await JsonSerializer.SerializeAsync(stream, document, JsonOptions, cancellationToken);
    }

    private string ResolveStorePath()
    {
        var configuredPath = GetOptions().UserStorePath;
        return Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.Combine(AppContext.BaseDirectory, configuredPath);
    }

    private static string NormalizeUsername(string username) =>
        username.Trim().ToUpperInvariant();

    private static List<string> NormalizeTags(IReadOnlyList<string>? tags)
    {
        if (tags is null || tags.Count == 0)
        {
            return [];
        }

        return tags
            .Where(tag => !string.IsNullOrWhiteSpace(tag))
            .Select(tag => tag.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(tag => tag, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static List<int> NormalizeGroupIds(IReadOnlyList<int>? groupIds)
    {
        if (groupIds is null || groupIds.Count == 0)
        {
            return [];
        }

        return groupIds.Distinct().OrderBy(id => id).ToList();
    }

    private static LocalUserResponse ToResponse(StoredLocalUser user) =>
        new(
            user.Id,
            user.Username,
            user.DisplayName,
            user.Role,
            user.Active,
            user.CreatedAtUtc,
            user.LastLoginAtUtc,
            user.AllowedTags?.ToArray() ?? [],
            user.AllowedGroupIds?.ToArray() ?? []);

    private sealed class StoredLocalUserDocument
    {
        public List<StoredLocalUser> Users { get; init; } = [];
    }

    private sealed class StoredLocalUser
    {
        public Guid Id { get; set; }
        public string Username { get; set; } = string.Empty;
        public string NormalizedUsername { get; set; } = string.Empty;
        public string? DisplayName { get; set; }
        public string Role { get; set; } = AppRoles.Viewer;
        public bool Active { get; set; } = true;
        public string PasswordHash { get; set; } = string.Empty;
        public DateTimeOffset CreatedAtUtc { get; set; }
        public DateTimeOffset? LastLoginAtUtc { get; set; }
        public List<string> AllowedTags { get; set; } = [];
        public List<int> AllowedGroupIds { get; set; } = [];
    }
}

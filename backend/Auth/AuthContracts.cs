namespace DBADashWebView.Auth;

public sealed record LoginRequest(string Username, string Password);

public sealed record LoginResponse(
    string Token,
    string Username,
    string? DisplayName,
    string Role,
    string Source);

public sealed record AuthStatusResponse(
    bool LocalAuthEnabled,
    bool AdEnabled,
    bool BootstrapRequired,
    string[] SupportedRoles);

public sealed record LocalAuthStatus(
    bool Enabled,
    bool BootstrapRequired,
    int UserCount);

public sealed record LocalUserResponse(
    Guid Id,
    string Username,
    string? DisplayName,
    string Role,
    bool Active,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? LastLoginAtUtc);

public sealed record CreateLocalUserRequest(
    string Username,
    string? DisplayName,
    string Password,
    string Role,
    bool Active = true);

public sealed record UpdateLocalUserRequest(
    string? DisplayName,
    string Role,
    bool Active,
    string? Password);

public sealed record AdConfigRequest(
    bool Enabled,
    string? Server,
    int Port,
    bool UseSsl,
    string? Domain,
    string? BaseDn,
    string? RequiredGroup,
    string? OperatorGroup,
    string? AdminGroup,
    bool AllowLocalFallback,
    string? BindUser,
    string? BindPassword);

public sealed record AdConfigResponse(
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
    bool HasBindPassword);

public sealed record AdLoginTestResponse(
    bool Success,
    string Message,
    string? DisplayName,
    string Role,
    IReadOnlyList<string> Groups);

public sealed record ThresholdValue(double Warning, double Critical);

public sealed record ThresholdUpdateRequest(Dictionary<string, ThresholdValue> Thresholds);

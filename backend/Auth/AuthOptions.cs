namespace DBADashWebView.Auth;

public sealed class JwtOptions
{
    public const string DevelopmentFallbackSecret = "DBADashWebView-Development-Only-Secret-Change-Me";

    public string Secret { get; set; } = string.Empty;
    public string Issuer { get; set; } = "DBADashWebView";
    public string Audience { get; set; } = "DBADashWebView";
    public int ExpirationHours { get; set; } = 12;
}

public sealed class LocalAuthOptions
{
    public bool Enabled { get; set; } = true;
    public string UserStorePath { get; set; } = "config/local-users.json";
    public string BootstrapAdminUsername { get; set; } = "admin";
    public string BootstrapAdminDisplayName { get; set; } = "Administrator";
    public string BootstrapAdminPassword { get; set; } = string.Empty;
}

public sealed class CorsSettings
{
    public string[] AllowedOrigins { get; set; } = [];
}

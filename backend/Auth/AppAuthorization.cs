namespace DBADashWebView.Auth;

public static class AppRoles
{
    public const string Admin = "Admin";
    public const string Operator = "Operator";
    public const string Viewer = "Viewer";

    public static readonly string[] All = [Admin, Operator, Viewer];

    public static bool IsSupported(string? role) =>
        All.Contains(role, StringComparer.OrdinalIgnoreCase);

    public static string Normalize(string? role) =>
        All.FirstOrDefault(candidate => candidate.Equals(role, StringComparison.OrdinalIgnoreCase)) ?? Viewer;
}

public static class AppPolicies
{
    public const string AdminOnly = "AdminOnly";
    public const string OperatorOrAdmin = "OperatorOrAdmin";
}

using System.Security.Claims;
using Microsoft.Extensions.Primitives;

namespace DBADashWebView.Auth;

/// <summary>
/// Adds an optional, request-scoped tag filter for administrators. The filter
/// is deliberately stored in separate claims from the user's persisted access
/// scope so it can only narrow the current view and never grant access.
/// </summary>
internal sealed class AdminViewTagFilterMiddleware(RequestDelegate next)
{
    internal const string HeaderName = "X-DBADash-View-Tags";
    internal const int MaxTagCount = 50;
    internal const int MaxTagLength = 128;

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.User.Identity?.IsAuthenticated == true
            && context.User.IsInRole(AppRoles.Admin))
        {
            var tags = ParseHeader(context.Request.Headers[HeaderName]);
            if (tags.Count > 0)
            {
                context.User.AddIdentity(new ClaimsIdentity(
                    tags.Select(tag => new Claim(AppClaimTypes.ViewTag, tag)),
                    authenticationType: "admin-view-filter"));
            }
        }

        await next(context);
    }

    internal static IReadOnlyList<string> ParseHeader(StringValues values)
    {
        return values
            .SelectMany(value => (value ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries))
            .Select(value => Uri.UnescapeDataString(value).Trim())
            .Where(value => value.Length is > 0 and <= MaxTagLength)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(MaxTagCount)
            .ToArray();
    }
}

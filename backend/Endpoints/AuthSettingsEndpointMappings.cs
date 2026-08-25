using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;
using DBADashWebView.Settings;

namespace DBADashWebView.Endpoints;

public static class AuthSettingsEndpointMappings
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

        endpoints.MapGet("/api/version", (ApplicationVersionProvider versionProvider) =>
            Results.Ok(versionProvider.GetCurrentVersion()));

        endpoints.MapGet("/api/auth/status", async (LocalUserStore localUsers, ActiveDirectoryAuthService adAuth, CancellationToken cancellationToken) =>
        {
            var localStatus = await localUsers.GetStatusAsync(cancellationToken);
            var adEnabled = await adAuth.IsEnabledAsync(cancellationToken);
            return Results.Ok(new AuthStatusResponse(localStatus.Enabled, adEnabled, localStatus.BootstrapRequired, AppRoles.All));
        });

        endpoints.MapPost("/api/auth/login", async (
            LoginRequest request,
            LocalUserStore localUsers,
            ActiveDirectoryAuthService adAuth,
            JwtTokenService tokenService,
            CancellationToken cancellationToken) =>
        {
            var adEnabled = await adAuth.IsEnabledAsync(cancellationToken);
            var adResult = await adAuth.TryAuthenticateAsync(request.Username, request.Password, cancellationToken);
            if (adResult is not null)
            {
                // AD users are not yet scoped per tag/group in the local store.
                // Empty scope = unrestricted, which keeps current behaviour.
                IReadOnlyList<string> adTags = [];
                IReadOnlyList<int> adGroupIds = [];
                return Results.Ok(new LoginResponse(
                    tokenService.CreateToken(adResult.Username, adResult.DisplayName, adResult.Role, adTags, adGroupIds),
                    adResult.Username,
                    adResult.DisplayName,
                    adResult.Role,
                    "ad",
                    adTags,
                    adGroupIds));
            }

            var allowLocalFallback = !adEnabled || await adAuth.AllowsLocalFallbackAsync(cancellationToken);
            var localUser = allowLocalFallback
                ? await localUsers.ValidateCredentialsAsync(request.Username, request.Password, cancellationToken)
                : null;
            if (localUser is not null)
            {
                return Results.Ok(new LoginResponse(
                    tokenService.CreateToken(
                        localUser.Username,
                        localUser.DisplayName,
                        localUser.Role,
                        localUser.AllowedTags,
                        localUser.AllowedGroupIds),
                    localUser.Username,
                    localUser.DisplayName,
                    localUser.Role,
                    "local",
                    localUser.AllowedTags,
                    localUser.AllowedGroupIds));
            }

            var localStatus = await localUsers.GetStatusAsync(cancellationToken);
            if (localStatus.Enabled && localStatus.BootstrapRequired)
            {
                return Results.Problem(
                    title: "Local authentication is not initialized",
                    detail: "Set LocalAuth__BootstrapAdminPassword and restart the application to seed the first admin account.",
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            return Results.Unauthorized();
        });

        return endpoints;
    }

    public static IEndpointRouteBuilder MapSettingsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/settings/ad", async (ActiveDirectoryAuthService adAuth, CancellationToken cancellationToken) =>
            Results.Ok(await adAuth.GetEditableConfigurationAsync(cancellationToken)))
            .RequireAuthorization(AppPolicies.AdminOnly);

        endpoints.MapPost("/api/settings/ad", async (
            AdConfigRequest request,
            ActiveDirectoryAuthService adAuth,
            CancellationToken cancellationToken) =>
        {
            await adAuth.SaveAsync(request, cancellationToken);
            return Results.Ok(new { success = true, message = "AD configuration saved" });
        }).RequireAuthorization(AppPolicies.AdminOnly);

        endpoints.MapPost("/api/settings/ad/test", async (
            LoginRequest request,
            ActiveDirectoryAuthService adAuth,
            CancellationToken cancellationToken) =>
        {
            var result = await adAuth.TestLoginAsync(request, cancellationToken);
            return Results.Ok(result);
        }).RequireAuthorization(AppPolicies.AdminOnly);

        endpoints.MapGet("/api/settings/users", async (LocalUserStore localUsers, CancellationToken cancellationToken) =>
            Results.Ok(await localUsers.GetUsersAsync(cancellationToken)))
            .RequireAuthorization(AppPolicies.AdminOnly);

        endpoints.MapPost("/api/settings/users", async (
            CreateLocalUserRequest request,
            LocalUserStore localUsers,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var createdUser = await localUsers.CreateUserAsync(request, cancellationToken);
                return Results.Ok(createdUser);
            }
            catch (InvalidOperationException ex)
            {
                return Results.Problem(title: "Unable to create local user", detail: ex.Message, statusCode: StatusCodes.Status409Conflict);
            }
        }).RequireAuthorization(AppPolicies.AdminOnly);

        endpoints.MapPut("/api/settings/users/{id:guid}", async (
            Guid id,
            UpdateLocalUserRequest request,
            LocalUserStore localUsers,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var updatedUser = await localUsers.UpdateUserAsync(id, request, cancellationToken);
                return Results.Ok(updatedUser);
            }
            catch (KeyNotFoundException ex)
            {
                return Results.Problem(title: "Local user not found", detail: ex.Message, statusCode: StatusCodes.Status404NotFound);
            }
            catch (InvalidOperationException ex)
            {
                return Results.Problem(title: "Unable to update local user", detail: ex.Message, statusCode: StatusCodes.Status409Conflict);
            }
        }).RequireAuthorization(AppPolicies.AdminOnly);

        endpoints.MapGet("/api/settings/thresholds", async (ThresholdSettingsStore thresholds, CancellationToken cancellationToken) =>
        {
            var (global, overrides) = await thresholds.GetSettingsAsync(cancellationToken);
            return Results.Ok(new { thresholds = global, overrides });
        }).RequireAuthorization();

        endpoints.MapPost("/api/settings/thresholds", async (
            ThresholdUpdateRequest request,
            ThresholdSettingsStore thresholds,
            CancellationToken cancellationToken) =>
        {
            await thresholds.SaveAsync(request.Thresholds, cancellationToken);
            return Results.Ok(new { success = true });
        }).RequireAuthorization(AppPolicies.AdminOnly);

        // Per-instance/per-tag threshold overrides: the global thresholds above stay
        // the fallback, but a warning/critical pair here for a more specific scope
        // (one instance, or every instance carrying a tag) wins over it.
        endpoints.MapPost("/api/settings/thresholds/overrides", async (
            ThresholdOverridesUpdateRequest request,
            ThresholdSettingsStore thresholds,
            CancellationToken cancellationToken) =>
        {
            await thresholds.SaveOverridesAsync(request.Overrides, cancellationToken);
            return Results.Ok(new { success = true });
        }).RequireAuthorization(AppPolicies.AdminOnly);

        // Tag options for the override scope picker, and the tag/instance membership
        // the dashboard needs to resolve tag-scoped overrides client-side. Any
        // authenticated user can read this (not just admins) since color-coding on
        // the dashboard depends on it for every role; only saving overrides is
        // admin-gated above. Kept separate from a general "list tags" endpoint so
        // this feature doesn't depend on one existing yet.
        endpoints.MapGet("/api/settings/thresholds/tags", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("IT.InstanceID");
                var rows = await sql.QueryAsync(
                    $"""
                    SELECT T.TagID, T.TagName, T.TagValue, IT.InstanceID
                    FROM dbo.Tags T
                    JOIN dbo.InstanceIDsTags IT ON T.TagID = IT.TagID
                    JOIN dbo.Instances I ON IT.InstanceID = I.InstanceID
                    WHERE I.IsActive = 1
                      {scopeSnippet}
                    ORDER BY T.TagName, T.TagValue
                    """,
                    cancellationToken, scopeParameters);

                var tags = rows
                    .GroupBy(row => Convert.ToInt32(row["TagID"]))
                    .Select(group =>
                    {
                        var first = group.First();
                        var tagName = (string)first["TagName"]!;
                        return new
                        {
                            tagId = group.Key,
                            tagName,
                            tagValue = first["TagValue"] as string,
                            isSystem = tagName.StartsWith('{'),
                            instanceIds = group.Select(row => Convert.ToInt32(row["InstanceID"])).Distinct().ToArray()
                        };
                    })
                    .ToList();

                return Results.Ok(new { data = tags });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
            }
        }).RequireAuthorization();

        return endpoints;
    }
}

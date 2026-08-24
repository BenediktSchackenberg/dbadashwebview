using System.Data;
using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;
using DBADashWebView.Settings;
using Microsoft.Data.SqlClient;
using Microsoft.Data.SqlClient.Server;

namespace DBADashWebView.Endpoints;

public sealed record AcknowledgeAlertsRequest(long[] AlertIds, bool IsAcknowledged);

public sealed record CloseAlertsRequest(long[] AlertIds);

public sealed record UpdateAlertNotesRequest(string? Notes);

/// <summary>
/// Surfaces DBA Dash's real alert lifecycle (Alert.ActiveAlerts / Alert.ClosedAlerts)
/// instead of the synthetic "collection errors + failed jobs" feed used elsewhere.
/// All writes go through DBA Dash's own stored procedures (Alert.ActiveAlertsAck_Upd,
/// Alert.ClosedAlerts_Add, Alert.Alerts_Notes_Upd) rather than direct table writes, per
/// dba-dash's alert schema (introduced in DBA Dash 3.17.0). On older repositories these
/// objects don't exist yet, so every call is guarded and reports that distinctly rather
/// than as a generic error.
/// </summary>
public static class AlertsEndpointMappings
{
    public static IEndpointRouteBuilder MapAlertsEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/alerts/active", async (int? instanceId, ClaimsPrincipal user, SqlDataService sql, WriteCapabilityOptions writeCapabilities, ILogger<Program> logger, CancellationToken cancellationToken) =>
        {
            if (instanceId is int requestedInstanceId)
            {
                var deny = await user.EnsureInstanceAccessAsync(requestedInstanceId, sql, cancellationToken);
                if (deny is not null) return deny;
            }

            try
            {
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                if (IsEmptyScope(allowedIds))
                {
                    return Results.Ok(EmptyScopeResponse(writeCapabilities));
                }

                await using var connection = await sql.OpenConnectionAsync(cancellationToken);
                await using var command = new SqlCommand("Alert.ActiveAlerts_Get", connection)
                {
                    CommandType = CommandType.StoredProcedure,
                    CommandTimeout = 30
                };
                command.Parameters.Add(BuildIntIdsParameter("@InstanceIDs", allowedIds));
                command.Parameters.AddWithValue("@InstanceID", (object?)instanceId ?? DBNull.Value);

                var data = await EndpointResultMapper.ReadRowsAsync(command, cancellationToken, camelCase: true);
                return Results.Ok(new { supported = true, canWrite = writeCapabilities.AlertLifecycle, data });
            }
            catch (SqlException ex) when (IsMissingAlertSchema(ex))
            {
                return Results.Ok(AlertSchemaMissingResponse);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Active alerts endpoint failed");
                return Results.Problem(title: "Unable to read active alerts", statusCode: StatusCodes.Status500InternalServerError);
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/alerts/closed", async (int? instanceId, int? top, ClaimsPrincipal user, SqlDataService sql, WriteCapabilityOptions writeCapabilities, ILogger<Program> logger, CancellationToken cancellationToken) =>
        {
            if (instanceId is int requestedInstanceId)
            {
                var deny = await user.EnsureInstanceAccessAsync(requestedInstanceId, sql, cancellationToken);
                if (deny is not null) return deny;
            }

            try
            {
                var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
                if (IsEmptyScope(allowedIds))
                {
                    return Results.Ok(EmptyScopeResponse(writeCapabilities));
                }

                await using var connection = await sql.OpenConnectionAsync(cancellationToken);
                await using var command = new SqlCommand("Alert.ClosedAlerts_Get", connection)
                {
                    CommandType = CommandType.StoredProcedure,
                    CommandTimeout = 30
                };
                command.Parameters.Add(BuildIntIdsParameter("@InstanceIDs", allowedIds));
                command.Parameters.AddWithValue("@InstanceID", (object?)instanceId ?? DBNull.Value);
                command.Parameters.AddWithValue("@Top", Math.Clamp(top ?? 500, 1, 5000));

                var data = await EndpointResultMapper.ReadRowsAsync(command, cancellationToken, camelCase: true);
                return Results.Ok(new { supported = true, canWrite = writeCapabilities.AlertLifecycle, data });
            }
            catch (SqlException ex) when (IsMissingAlertSchema(ex))
            {
                return Results.Ok(AlertSchemaMissingResponse);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Closed alerts endpoint failed");
                return Results.Problem(title: "Unable to read closed alerts", statusCode: StatusCodes.Status500InternalServerError);
            }
        }).RequireAuthorization();

        endpoints.MapPost("/api/alerts/acknowledge", async (
            AcknowledgeAlertsRequest request,
            ClaimsPrincipal user,
            SqlDataService sql,
            WriteCapabilityOptions writeCapabilities,
            CancellationToken cancellationToken) =>
        {
            if (WriteDisabledResult(writeCapabilities) is { } disabled) return disabled;

            if (request.AlertIds is null || request.AlertIds.Length == 0)
            {
                return Results.Problem(title: "At least one alert id is required", statusCode: StatusCodes.Status400BadRequest);
            }

            try
            {
                // Kept inside the guarded block: on a pre-3.17 repository the scope
                // check itself reads Alert.ActiveAlerts / Alert.ClosedAlerts, and
                // outside the try it would throw straight past the compatibility
                // handling below and surface as a 500 instead of supported = false.
                var scopeDenied = await EnsureAlertsInScopeAsync(user, sql, request.AlertIds, cancellationToken);
                if (scopeDenied is not null) return scopeDenied;

                await using var connection = await sql.OpenConnectionAsync(cancellationToken);
                await using var command = new SqlCommand("Alert.ActiveAlertsAck_Upd", connection)
                {
                    CommandType = CommandType.StoredProcedure,
                    CommandTimeout = 30
                };
                command.Parameters.Add(BuildBigIntIdsParameter("@AlertIDs", request.AlertIds));
                command.Parameters.AddWithValue("@AlertID", DBNull.Value);
                command.Parameters.AddWithValue("@IsAcknowledged", request.IsAcknowledged);
                await command.ExecuteNonQueryAsync(cancellationToken);

                return Results.Ok(new { success = true });
            }
            catch (SqlException ex) when (IsMissingAlertSchema(ex))
            {
                return Results.Ok(AlertSchemaMissingResponse);
            }
        }).RequireAuthorization(AppPolicies.OperatorOrAdmin);

        endpoints.MapPost("/api/alerts/close", async (
            CloseAlertsRequest request,
            ClaimsPrincipal user,
            SqlDataService sql,
            WriteCapabilityOptions writeCapabilities,
            CancellationToken cancellationToken) =>
        {
            if (WriteDisabledResult(writeCapabilities) is { } disabled) return disabled;

            if (request.AlertIds is null || request.AlertIds.Length == 0)
            {
                return Results.Problem(title: "At least one alert id is required", statusCode: StatusCodes.Status400BadRequest);
            }

            try
            {
                // Kept inside the guarded block: on a pre-3.17 repository the scope
                // check itself reads Alert.ActiveAlerts / Alert.ClosedAlerts, and
                // outside the try it would throw straight past the compatibility
                // handling below and surface as a 500 instead of supported = false.
                var scopeDenied = await EnsureAlertsInScopeAsync(user, sql, request.AlertIds, cancellationToken);
                if (scopeDenied is not null) return scopeDenied;

                await using var connection = await sql.OpenConnectionAsync(cancellationToken);
                await using var command = new SqlCommand("Alert.ClosedAlerts_Add", connection)
                {
                    CommandType = CommandType.StoredProcedure,
                    CommandTimeout = 30
                };
                command.Parameters.Add(BuildBigIntIdsParameter("@AlertIDs", request.AlertIds));
                command.Parameters.AddWithValue("@AlertID", DBNull.Value);
                await command.ExecuteNonQueryAsync(cancellationToken);

                return Results.Ok(new { success = true });
            }
            catch (SqlException ex) when (IsMissingAlertSchema(ex))
            {
                return Results.Ok(AlertSchemaMissingResponse);
            }
        }).RequireAuthorization(AppPolicies.OperatorOrAdmin);

        endpoints.MapPut("/api/alerts/{alertId:long}/notes", async (
            long alertId,
            UpdateAlertNotesRequest request,
            ClaimsPrincipal user,
            SqlDataService sql,
            WriteCapabilityOptions writeCapabilities,
            CancellationToken cancellationToken) =>
        {
            if (WriteDisabledResult(writeCapabilities) is { } disabled) return disabled;

            try
            {
                // Kept inside the guarded block: on a pre-3.17 repository the scope
                // check itself reads Alert.ActiveAlerts / Alert.ClosedAlerts, and
                // outside the try it would throw straight past the compatibility
                // handling below and surface as a 500 instead of supported = false.
                var scopeDenied = await EnsureAlertsInScopeAsync(user, sql, [alertId], cancellationToken);
                if (scopeDenied is not null) return scopeDenied;

                await using var connection = await sql.OpenConnectionAsync(cancellationToken);
                await using var command = new SqlCommand("Alert.Alerts_Notes_Upd", connection)
                {
                    CommandType = CommandType.StoredProcedure,
                    CommandTimeout = 30
                };
                command.Parameters.AddWithValue("@AlertID", alertId);
                command.Parameters.AddWithValue("@Notes", (object?)request.Notes ?? DBNull.Value);
                await command.ExecuteNonQueryAsync(cancellationToken);

                return Results.Ok(new { success = true });
            }
            catch (SqlException ex) when (IsMissingAlertSchema(ex))
            {
                return Results.Ok(AlertSchemaMissingResponse);
            }
        }).RequireAuthorization(AppPolicies.OperatorOrAdmin);

        return endpoints;
    }

    private static readonly object AlertSchemaMissingResponse = new
    {
        supported = false,
        canWrite = false,
        error = "This DBADashDB doesn't have DBA Dash's alert lifecycle schema (Alert.*). Alert acknowledge/close/notes requires DBA Dash 3.17.0 or later.",
        data = Array.Empty<object>()
    };

    /// <summary>
    /// True when the caller is scope-restricted (non-null set) but that scope
    /// resolves to no instances at all.
    ///
    /// This must short-circuit before the stored procedure runs.
    /// <c>Alert.ActiveAlerts_Get</c> derives its own flag with
    /// <c>@AllInstances = CASE WHEN EXISTS(SELECT 1 FROM @InstanceIDs) THEN 0 ELSE 1 END</c>
    /// and then filters with <c>... OR @AllInstances = 1</c>, so an empty
    /// table-valued parameter does not mean "no instances" — it means "every
    /// instance". Passing an empty scope through would hand a restricted user the
    /// entire fleet's alerts. <c>Alert.ClosedAlerts_Get</c> follows the same shape.
    /// </summary>
    private static bool IsEmptyScope(HashSet<int>? allowedIds) => allowedIds is { Count: 0 };

    private static object EmptyScopeResponse(WriteCapabilityOptions writeCapabilities) =>
        new { supported = true, canWrite = writeCapabilities.AlertLifecycle, data = Array.Empty<object>() };

    /// <summary>
    /// Returns a 403 when the alert write capability is off, or <c>null</c> to let
    /// the request through. Role alone is not enough: the deployment also has to be
    /// provisioned with the EXECUTE grants these procedures need.
    /// </summary>
    private static IResult? WriteDisabledResult(WriteCapabilityOptions writeCapabilities) =>
        writeCapabilities.AlertLifecycle
            ? null
            : Results.Problem(
                title: "Alert write operations are disabled",
                detail: "Set WriteCapabilities:AlertLifecycle to true and grant the EXECUTE permissions documented in the README.",
                statusCode: StatusCodes.Status403Forbidden);

    private static bool IsMissingAlertSchema(SqlException ex) => IsMissingAlertSchema(ex.Number, ex.Message);

    /// <summary>
    /// 208 = "Invalid object name" (proc/table doesn't exist), 2812 = "Could not find
    /// stored procedure". Split out from the <see cref="SqlException"/> overload so it
    /// can be unit tested without needing to construct a real SqlException.
    /// </summary>
    internal static bool IsMissingAlertSchema(int errorNumber, string message) =>
        (errorNumber == 208 || errorNumber == 2812) && message.Contains("Alert.", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Verifies every alert id belongs to an instance the caller is allowed to see
    /// (checking both ActiveAlerts and ClosedAlerts, since notes can target either).
    /// No-op when the caller is unrestricted.
    /// </summary>
    private static async Task<IResult?> EnsureAlertsInScopeAsync(
        ClaimsPrincipal user,
        SqlDataService sql,
        long[] alertIds,
        CancellationToken cancellationToken)
    {
        var allowedIds = await user.AllowedInstanceIdsAsync(sql, cancellationToken);
        if (allowedIds is null)
        {
            return null;
        }

        await using var connection = await sql.OpenConnectionAsync(cancellationToken);
        await using var command = new SqlCommand(
            """
            SELECT DISTINCT InstanceID FROM Alert.ActiveAlerts WHERE AlertID IN (SELECT ID FROM @AlertIDs)
            UNION
            SELECT DISTINCT InstanceID FROM Alert.ClosedAlerts WHERE AlertID IN (SELECT ID FROM @AlertIDs)
            """,
            connection)
        {
            CommandTimeout = 30
        };
        command.Parameters.Add(BuildBigIntIdsParameter("@AlertIDs", alertIds));

        var rows = await EndpointResultMapper.ReadRowsAsync(command, cancellationToken, camelCase: false);
        foreach (var row in rows)
        {
            if (row.TryGetValue("InstanceID", out var value) && value is not null && !allowedIds.Contains(Convert.ToInt32(value)))
            {
                return Results.Forbid();
            }
        }

        return null;
    }

    internal static SqlParameter BuildIntIdsParameter(string parameterName, HashSet<int>? ids)
    {
        var records = (ids ?? []).Select(id =>
        {
            var record = new SqlDataRecord(new SqlMetaData("ID", SqlDbType.Int));
            record.SetInt32(0, id);
            return record;
        }).ToList();

        // SqlClient rejects an empty IEnumerable<SqlDataRecord> for a structured
        // parameter ("There are no records in the SqlDataRecord enumeration...") -
        // a zero-row table-valued parameter must be sent as null instead.
        return new SqlParameter(parameterName, SqlDbType.Structured)
        {
            TypeName = "dbo.IDs",
            Value = records.Count > 0 ? records : null
        };
    }

    internal static SqlParameter BuildBigIntIdsParameter(string parameterName, IEnumerable<long> ids)
    {
        var records = ids.Distinct().Select(id =>
        {
            var record = new SqlDataRecord(new SqlMetaData("ID", SqlDbType.BigInt));
            record.SetInt64(0, id);
            return record;
        }).ToList();

        return new SqlParameter(parameterName, SqlDbType.Structured)
        {
            TypeName = "dbo.BigIDs",
            Value = records.Count > 0 ? records : null
        };
    }
}

using System.Security.Claims;
using DBADashWebView.Auth;
using DBADashWebView.Data;

namespace DBADashWebView.Endpoints;

/// <summary>
/// Surfaces DBA Dash's real security/audit collection that's currently completely unused:
/// dbo.FailedLogins (parsed SQL error-log failed-login entries), dbo.KillSessionLog (audit
/// trail of session-kill attempts made via DBA Dash's desktop client), and sysadmin fixed
/// server-role membership from dbo.ServerPrincipals/dbo.ServerRoleMembers.
///
/// Deliberately read-only and deliberately scoped down: DBA Dash's own KillSessionLog feature
/// is tied to a live "kill session" action that messages the collector agent over Service
/// Broker - that's a real operational action with real risk, not requested, and not built here.
/// Likewise dbo.ServerPermissions/DatabasePermissions (raw GRANT/DENY/REVOKE state) and
/// DatabasePrincipals/DatabaseRoleMembers have no existing DBA Dash report to ground a query
/// against, so they're left out rather than guessing at permission-resolution semantics.
/// </summary>
public static class SecurityEndpointMappings
{
    public static IEndpointRouteBuilder MapSecurityEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/instances/{id:int}/security", async (int id, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(id, sql, cancellationToken);
            if (deny is not null) return deny;

            string note = string.Empty;
            object failedLogins = new { count = 0, firstLogDate = (object?)null, lastLogDate = (object?)null, recent = Array.Empty<object>() };
            var killedSessions = new List<object>();
            var sysadminMembers = new List<object>();

            try
            {
                var summaryRows = await sql.QueryAsync(
                    "SELECT COUNT(*) AS Cnt, MIN(LogDate) AS FirstLogDate, MAX(LogDate) AS LastLogDate FROM dbo.FailedLogins WHERE InstanceID = @id",
                    cancellationToken, ("@id", id));

                var recentRows = await sql.QueryAsync(
                    "SELECT TOP 100 LogDate, Text FROM dbo.FailedLogins WHERE InstanceID = @id ORDER BY LogDate DESC",
                    cancellationToken, ("@id", id));

                var summary = summaryRows[0];
                failedLogins = new
                {
                    count = Convert.ToInt32(summary["Cnt"]),
                    firstLogDate = summary["FirstLogDate"],
                    lastLogDate = summary["LastLogDate"],
                    recent = recentRows.Select(row => (object)new
                    {
                        logDate = row["LogDate"],
                        text = row["Text"]?.ToString(),
                    }).ToList(),
                };
            }
            catch (Exception ex)
            {
                note = $"Failed logins unavailable: {ex.Message}";
            }

            try
            {
                var rows = await sql.QueryAsync(
                    "SELECT TOP 100 session_id, killed_by, log_date, status FROM dbo.KillSessionLog WHERE InstanceID = @id ORDER BY log_date DESC",
                    cancellationToken, ("@id", id));

                killedSessions = rows.Select(row => (object)new
                {
                    sessionId = Convert.ToInt32(row["session_id"]),
                    killedBy = row["killed_by"]?.ToString(),
                    logDate = row["log_date"],
                    status = row["status"]?.ToString(),
                }).ToList();
            }
            catch (Exception ex)
            {
                note += (note.Length > 0 ? " " : string.Empty) + $"Kill session log unavailable: {ex.Message}";
            }

            try
            {
                var rows = await sql.QueryAsync(
                    """
                    SELECT m.name AS MemberName, m.type_desc AS MemberType, m.is_disabled AS IsDisabled,
                           m.create_date AS CreateDate, m.modify_date AS ModifyDate
                    FROM dbo.ServerRoleMembers rm
                    JOIN dbo.ServerPrincipals r ON rm.role_principal_id = r.principal_id AND r.InstanceID = rm.InstanceID
                    JOIN dbo.ServerPrincipals m ON rm.member_principal_id = m.principal_id AND m.InstanceID = rm.InstanceID
                    WHERE rm.InstanceID = @id AND r.name = 'sysadmin'
                    ORDER BY m.name
                    """, cancellationToken, ("@id", id));

                sysadminMembers = rows.Select(row => (object)new
                {
                    memberName = row["MemberName"]?.ToString(),
                    memberType = row["MemberType"]?.ToString(),
                    isDisabled = Convert.ToBoolean(row["IsDisabled"]),
                    createDate = row["CreateDate"],
                    modifyDate = row["ModifyDate"],
                }).ToList();
            }
            catch (Exception ex)
            {
                note += (note.Length > 0 ? " " : string.Empty) + $"Sysadmin membership unavailable: {ex.Message}";
            }

            return Results.Ok(new { failedLogins, killedSessions, sysadminMembers, note });
        }).RequireAuthorization();

        return endpoints;
    }
}

using System.Security.Claims;
using DBADashWebView.Data;
using Microsoft.Data.SqlClient;

namespace DBADashWebView.Endpoints;

public static class AvailabilityEndpointMappings
{
    public static IEndpointRouteBuilder MapAvailabilityEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/availability-groups", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("ag.InstanceID");
                var data = await sql.QueryAsync($"""
                    SELECT ag.*, i.InstanceDisplayName
                    FROM dbo.AvailabilityGroups ag
                    JOIN dbo.Instances i ON ag.InstanceID = i.InstanceID
                    WHERE 1=1 {scopeSnippet}
                    """, cancellationToken, scopeParameters);
                return Results.Ok(data);
            }
            catch
            {
                return Results.Ok(Array.Empty<object>());
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/instances/{id:int}/hadr", async (int id, ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            var deny = await user.EnsureInstanceAccessAsync(id, sql, cancellationToken);
            if (deny is not null) return deny;
            try
            {
                var ags = await sql.QueryAsync("""
                    SELECT ag.group_id, ag.name, ag.failure_condition_level, ag.health_check_timeout,
                           ag.automated_backup_preference_desc, ag.basic_features, ag.dtc_support,
                           ag.db_failover, ag.is_distributed, ag.cluster_type, ag.is_contained
                    FROM dbo.AvailabilityGroups ag
                    WHERE ag.InstanceID = @id
                    """, cancellationToken, ("@id", id));

                var replicas = await sql.QueryAsync("""
                    SELECT ar.replica_id, ar.group_id, ar.replica_server_name, ar.endpoint_url,
                           ar.availability_mode_desc, ar.failover_mode_desc,
                           ar.primary_role_allow_connections_desc, ar.secondary_role_allow_connections_desc,
                           ar.backup_priority, ar.seeding_mode_desc, ar.session_timeout,
                           ar.read_only_routing_url
                    FROM dbo.AvailabilityReplicas ar
                    WHERE ar.group_id IN (
                        SELECT ag.group_id FROM dbo.AvailabilityGroups ag WHERE ag.InstanceID = @id
                    )
                    """, cancellationToken, ("@id", id));

                var databases = await sql.QueryAsync("""
                    SELECT dh.DatabaseID, dh.group_id, dh.replica_id, dh.is_primary_replica,
                           dh.synchronization_state_desc, dh.synchronization_health_desc,
                           dh.is_suspended, dh.suspend_reason_desc, dh.database_state_desc,
                           dh.secondary_lag_seconds, dh.log_send_queue_size, dh.log_send_rate,
                           dh.redo_queue_size, dh.redo_rate,
                           dh.last_sent_time, dh.last_received_time, dh.last_hardened_time,
                           dh.last_redone_time,
                           d.name AS DatabaseName
                    FROM dbo.DatabasesHADR dh
                    JOIN dbo.Databases d ON dh.DatabaseID = d.DatabaseID
                    WHERE dh.group_id IN (
                        SELECT ag.group_id FROM dbo.AvailabilityGroups ag WHERE ag.InstanceID = @id
                    )
                    """, cancellationToken, ("@id", id));

                return Results.Ok(new { ags, replicas, databases });
            }
            catch (Exception ex)
            {
                return Results.Ok(new
                {
                    error = ex.Message,
                    ags = Array.Empty<object>(),
                    replicas = Array.Empty<object>(),
                    databases = Array.Empty<object>()
                });
            }
        }).RequireAuthorization();

        endpoints.MapGet("/api/hadr/overview", async (ClaimsPrincipal user, SqlDataService sql, CancellationToken cancellationToken) =>
        {
            try
            {
                var (scopeSnippet, scopeParameters) = user.ScopedInstanceFilter("ag.InstanceID");
                await using var connection = await sql.OpenConnectionAsync(cancellationToken);

                await using var agCommand = new SqlCommand($"""
                    SELECT ag.group_id, ag.name AS AGName, ag.InstanceID,
                           COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                           ag.automated_backup_preference_desc, ag.basic_features,
                           ag.db_failover, ag.is_distributed, ag.cluster_type,
                           i.ProductMajorVersion, i.Edition, i.cpu_count, i.physical_memory_kb
                    FROM dbo.AvailabilityGroups ag
                    JOIN dbo.Instances i ON ag.InstanceID = i.InstanceID
                    WHERE i.IsActive = 1 {scopeSnippet}
                    ORDER BY ag.name
                    """, connection)
                {
                    CommandTimeout = 60
                };
                foreach (var (name, value) in scopeParameters)
                {
                    agCommand.Parameters.AddWithValue(name, value ?? DBNull.Value);
                }
                var ags = await ReadRowsAsync(agCommand, cancellationToken);

                await using var replicaCommand = new SqlCommand("""
                    SELECT ar.group_id, ar.replica_id, ar.replica_server_name,
                           ar.availability_mode_desc, ar.failover_mode_desc,
                           ar.backup_priority, ar.seeding_mode_desc, ar.endpoint_url,
                           ar.session_timeout
                    FROM dbo.AvailabilityReplicas ar
                    """, connection)
                {
                    CommandTimeout = 60
                };
                var replicas = await ReadRowsAsync(replicaCommand, cancellationToken);

                await using var databaseCommand = new SqlCommand("""
                    SELECT dh.group_id, dh.replica_id, dh.DatabaseID,
                           dh.is_primary_replica, dh.synchronization_state_desc,
                           dh.synchronization_health_desc, dh.is_suspended,
                           dh.suspend_reason_desc, dh.secondary_lag_seconds,
                           dh.log_send_queue_size, dh.log_send_rate,
                           dh.redo_queue_size, dh.redo_rate,
                           d.name AS DatabaseName
                    FROM dbo.DatabasesHADR dh
                    JOIN dbo.Databases d ON dh.DatabaseID = d.DatabaseID
                    """, connection)
                {
                    CommandTimeout = 60
                };
                var databases = await ReadRowsAsync(databaseCommand, cancellationToken);

                await using var cpuCommand = new SqlCommand("""
                    SELECT c.InstanceID, c.SQLProcessCPU, c.SystemIdleCPU
                    FROM dbo.CPU c
                    INNER JOIN (
                        SELECT InstanceID, MAX(EventTime) AS MaxTime
                        FROM dbo.CPU
                        WHERE EventTime >= DATEADD(minute, -15, GETUTCDATE())
                        GROUP BY InstanceID
                    ) latest ON c.InstanceID = latest.InstanceID AND c.EventTime = latest.MaxTime
                    """, connection)
                {
                    CommandTimeout = 60
                };

                var cpuMap = new Dictionary<int, (int sqlCpu, int idleCpu)>();
                await using (var reader = await cpuCommand.ExecuteReaderAsync(cancellationToken))
                {
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        var instanceId = reader.GetInt32(0);
                        var sqlCpu = reader.IsDBNull(1) ? 0 : Convert.ToInt32(reader.GetValue(1));
                        var idleCpu = reader.IsDBNull(2) ? 0 : Convert.ToInt32(reader.GetValue(2));
                        cpuMap[instanceId] = (sqlCpu, idleCpu);
                    }
                }

                foreach (var ag in ags)
                {
                    var instanceId = Convert.ToInt32(ag["InstanceID"]);
                    if (cpuMap.TryGetValue(instanceId, out var cpu))
                    {
                        ag["currentCPU"] = cpu.sqlCpu;
                        ag["systemIdle"] = cpu.idleCpu;
                    }
                    else
                    {
                        ag["currentCPU"] = null;
                        ag["systemIdle"] = null;
                    }
                }

                return Results.Ok(new { ags, replicas, databases });
            }
            catch (Exception ex)
            {
                return Results.Ok(new
                {
                    error = ex.Message,
                    ags = Array.Empty<object>(),
                    replicas = Array.Empty<object>(),
                    databases = Array.Empty<object>()
                });
            }
        }).RequireAuthorization();

        return endpoints;
    }

    private static async Task<List<Dictionary<string, object?>>> ReadRowsAsync(SqlCommand command, CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var rows = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var row = new Dictionary<string, object?>();
            for (var index = 0; index < reader.FieldCount; index++)
            {
                row[reader.GetName(index)] = reader.IsDBNull(index) ? null : reader.GetValue(index);
            }

            rows.Add(row);
        }

        return rows;
    }
}

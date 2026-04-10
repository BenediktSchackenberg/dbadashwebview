using System.Data;
using DBADashWebView.Auth;
using DBADashWebView.Data;
using DBADashWebView.Endpoints;
using DBADashWebView.Settings;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Data.SqlClient;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

var jwtOptions = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (string.IsNullOrWhiteSpace(jwtOptions.Secret))
{
    if (builder.Environment.IsDevelopment())
    {
        jwtOptions.Secret = JwtOptions.DevelopmentFallbackSecret;
    }
    else
    {
        throw new InvalidOperationException("Jwt:Secret must be configured for non-development environments.");
    }
}

var signingKey = new SymmetricSecurityKey(System.Text.Encoding.UTF8.GetBytes(jwtOptions.Secret));
var corsSettings = builder.Configuration.GetSection("Cors").Get<CorsSettings>() ?? new CorsSettings();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = signingKey
        };
    });
builder.Services.AddAuthorizationBuilder()
    .AddPolicy(AppPolicies.AdminOnly, policy => policy.RequireRole(AppRoles.Admin));

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
{
    if (corsSettings.AllowedOrigins.Length > 0)
    {
        p.WithOrigins(corsSettings.AllowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    }
}));

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddDataProtection();
builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton(signingKey);
builder.Services.AddSingleton<JwtTokenService>();
builder.Services.AddSingleton<LocalUserStore>();
builder.Services.AddSingleton<ActiveDirectoryAuthService>();
builder.Services.AddSingleton<ThresholdSettingsStore>();
builder.Services.AddSingleton<SqlDataService>();

var app = builder.Build();
app.UseExceptionHandler("/api/error");
app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();

    if (jwtOptions.Secret == JwtOptions.DevelopmentFallbackSecret)
    {
        app.Logger.LogWarning("Using the development fallback JWT secret. Configure Jwt:Secret before deploying.");
    }
}

var connStr = builder.Configuration.GetConnectionString("DBADashDB") ?? string.Empty;

await app.Services.GetRequiredService<LocalUserStore>().EnsureSeededAsync();

app.Map("/api/error", () => Results.Problem(
    title: "Unexpected server error",
    detail: "The server failed to process the request."));

async Task<List<Dictionary<string, object?>>> QueryAsync(string sql, params (string name, object? value)[] parameters)
{
    using var conn = new SqlConnection(connStr);
    await conn.OpenAsync();
    using var cmd = new SqlCommand(sql, conn);
    cmd.CommandTimeout = 30;
    foreach (var (name, value) in parameters)
        cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
    using var reader = await cmd.ExecuteReaderAsync();
    var results = new List<Dictionary<string, object?>>();
    while (await reader.ReadAsync())
    {
        var row = new Dictionary<string, object?>();
        for (int i = 0; i < reader.FieldCount; i++)
            row[reader.GetName(i)] = reader.IsDBNull(i) ? null : reader.GetValue(i);
        results.Add(row);
    }
    return results;
}

app.MapAuthEndpoints();
app.MapSettingsEndpoints();
app.MapDashboardEndpoints();
app.MapInstanceEndpoints();

// ── Protected endpoints ──────────────────────────────────────────────────

// ── Availability Groups ──────────────────────────────────────────────────

app.MapGet("/api/availability-groups", async () =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT ag.*, i.InstanceDisplayName
            FROM dbo.AvailabilityGroups ag
            JOIN dbo.Instances i ON ag.InstanceID = i.InstanceID");
        return Results.Ok(data);
    }
    catch
    {
        return Results.Ok(Array.Empty<object>());
    }
}).RequireAuthorization();

// ── HA/DR per instance ──
app.MapGet("/api/instances/{id:int}/hadr", async (int id) =>
{
    try
    {
        var ags = await QueryAsync(@"
            SELECT ag.group_id, ag.name, ag.failure_condition_level, ag.health_check_timeout,
                   ag.automated_backup_preference_desc, ag.basic_features, ag.dtc_support,
                   ag.db_failover, ag.is_distributed, ag.cluster_type, ag.is_contained
            FROM dbo.AvailabilityGroups ag
            WHERE ag.InstanceID = @id", ("@id", id));

        var replicas = await QueryAsync(@"
            SELECT ar.replica_id, ar.group_id, ar.replica_server_name, ar.endpoint_url,
                   ar.availability_mode_desc, ar.failover_mode_desc,
                   ar.primary_role_allow_connections_desc, ar.secondary_role_allow_connections_desc,
                   ar.backup_priority, ar.seeding_mode_desc, ar.session_timeout,
                   ar.read_only_routing_url
            FROM dbo.AvailabilityReplicas ar
            WHERE ar.group_id IN (
                SELECT ag.group_id FROM dbo.AvailabilityGroups ag WHERE ag.InstanceID = @id
            )", ("@id", id));

        var databases = await QueryAsync(@"
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
            )", ("@id", id));

        return Results.Ok(new { ags, replicas, databases });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, ags = Array.Empty<object>(), replicas = Array.Empty<object>(), databases = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/hadr/overview", async () =>
{
    try
    {
        using var conn = new SqlConnection(connStr);
        await conn.OpenAsync();

        // 1. All AGs with instance info
        using var cmd1 = new SqlCommand(@"
            SELECT ag.group_id, ag.name AS AGName, ag.InstanceID,
                   COALESCE(i.InstanceDisplayName, i.Instance) AS InstanceName,
                   ag.automated_backup_preference_desc, ag.basic_features,
                   ag.db_failover, ag.is_distributed, ag.cluster_type,
                   i.ProductMajorVersion, i.Edition, i.cpu_count, i.physical_memory_kb
            FROM dbo.AvailabilityGroups ag
            JOIN dbo.Instances i ON ag.InstanceID = i.InstanceID
            WHERE i.IsActive = 1
            ORDER BY ag.name", conn);
        cmd1.CommandTimeout = 60;
        var ags = new List<Dictionary<string, object?>>();
        using (var r1 = await cmd1.ExecuteReaderAsync())
        {
            while (await r1.ReadAsync())
            {
                var row = new Dictionary<string, object?>();
                for (int i = 0; i < r1.FieldCount; i++)
                    row[r1.GetName(i)] = r1.IsDBNull(i) ? null : r1.GetValue(i);
                ags.Add(row);
            }
        }

        // 2. All replicas
        using var cmd2 = new SqlCommand(@"
            SELECT ar.group_id, ar.replica_id, ar.replica_server_name,
                   ar.availability_mode_desc, ar.failover_mode_desc,
                   ar.backup_priority, ar.seeding_mode_desc, ar.endpoint_url,
                   ar.session_timeout
            FROM dbo.AvailabilityReplicas ar", conn);
        cmd2.CommandTimeout = 60;
        var replicas = new List<Dictionary<string, object?>>();
        using (var r2 = await cmd2.ExecuteReaderAsync())
        {
            while (await r2.ReadAsync())
            {
                var row = new Dictionary<string, object?>();
                for (int i = 0; i < r2.FieldCount; i++)
                    row[r2.GetName(i)] = r2.IsDBNull(i) ? null : r2.GetValue(i);
                replicas.Add(row);
            }
        }

        // 3. All HADR database states
        using var cmd3 = new SqlCommand(@"
            SELECT dh.group_id, dh.replica_id, dh.DatabaseID,
                   dh.is_primary_replica, dh.synchronization_state_desc,
                   dh.synchronization_health_desc, dh.is_suspended,
                   dh.suspend_reason_desc, dh.secondary_lag_seconds,
                   dh.log_send_queue_size, dh.log_send_rate,
                   dh.redo_queue_size, dh.redo_rate,
                   d.name AS DatabaseName
            FROM dbo.DatabasesHADR dh
            JOIN dbo.Databases d ON dh.DatabaseID = d.DatabaseID", conn);
        cmd3.CommandTimeout = 60;
        var databases = new List<Dictionary<string, object?>>();
        using (var r3 = await cmd3.ExecuteReaderAsync())
        {
            while (await r3.ReadAsync())
            {
                var row = new Dictionary<string, object?>();
                for (int i = 0; i < r3.FieldCount; i++)
                    row[r3.GetName(i)] = r3.IsDBNull(i) ? null : r3.GetValue(i);
                databases.Add(row);
            }
        }

        // 4. Current CPU per instance (latest reading)
        using var cmd4 = new SqlCommand(@"
            SELECT c.InstanceID, c.SQLProcessCPU, c.SystemIdleCPU
            FROM dbo.CPU c
            INNER JOIN (
                SELECT InstanceID, MAX(EventTime) AS MaxTime
                FROM dbo.CPU
                WHERE EventTime >= DATEADD(minute, -15, GETUTCDATE())
                GROUP BY InstanceID
            ) latest ON c.InstanceID = latest.InstanceID AND c.EventTime = latest.MaxTime", conn);
        cmd4.CommandTimeout = 60;
        var cpuMap = new Dictionary<int, (int sqlCpu, int idle)>();
        using (var r4 = await cmd4.ExecuteReaderAsync())
        {
            while (await r4.ReadAsync())
            {
                var instId = r4.GetInt32(0);
                var sqlCpu = r4.IsDBNull(1) ? 0 : Convert.ToInt32(r4.GetValue(1));
                var idle = r4.IsDBNull(2) ? 0 : Convert.ToInt32(r4.GetValue(2));
                cpuMap[instId] = (sqlCpu, idle);
            }
        }

        // Build response: include CPU in ags data
        foreach (var ag in ags)
        {
            var instId = Convert.ToInt32(ag["InstanceID"]);
            if (cpuMap.TryGetValue(instId, out var cpu))
            {
                ag["currentCPU"] = cpu.sqlCpu;
                ag["systemIdle"] = cpu.idle;
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
        return Results.Ok(new { error = ex.Message, ags = Array.Empty<object>(), replicas = Array.Empty<object>(), databases = Array.Empty<object>() });
    }
}).RequireAuthorization();

// ── Queries ──────────────────────────────────────────────────────────────

app.MapGet("/api/instances/{id:int}/queries", async (int id) =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT TOP 50 qs.query_hash, qs.total_worker_time AS TotalCPU,
                   qs.total_logical_reads + qs.total_logical_writes AS TotalIO,
                   qs.execution_count AS Executions,
                   CASE WHEN qs.execution_count > 0
                        THEN qs.total_elapsed_time / qs.execution_count / 1000
                        ELSE 0 END AS AvgDurationMs,
                   SUBSTRING(st.text, 1, 4000) AS QueryText
            FROM sys.dm_exec_query_stats qs
            CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
            ORDER BY qs.total_worker_time DESC");
        return Results.Ok(data);
    }
    catch
    {
        return Results.Ok(Array.Empty<object>());
    }
}).RequireAuthorization();

// ── Estate-wide Backups ──────────────────────────────────────────────────

app.MapGet("/api/backups/estate", async () =>
{
    var connStr = app.Configuration.GetConnectionString("DBADashDB");
    try
    {
        using var conn = new SqlConnection(connStr);
        await conn.OpenAsync();
        using var cmd = new SqlCommand(@"
            ;WITH LatestFull AS (
                SELECT DatabaseID, backup_start_date, backup_size, compressed_backup_size,
                       ROW_NUMBER() OVER (PARTITION BY DatabaseID ORDER BY backup_start_date DESC) as rn
                FROM dbo.Backups WHERE type='D'
            ), LatestDiff AS (
                SELECT DatabaseID, backup_start_date,
                       ROW_NUMBER() OVER (PARTITION BY DatabaseID ORDER BY backup_start_date DESC) as rn
                FROM dbo.Backups WHERE type='I'
            ), LatestLog AS (
                SELECT DatabaseID, backup_start_date,
                       ROW_NUMBER() OVER (PARTITION BY DatabaseID ORDER BY backup_start_date DESC) as rn
                FROM dbo.Backups WHERE type='L'
            )
            SELECT i.InstanceID, COALESCE(i.InstanceDisplayName, i.Instance) as InstanceDisplayName,
                   d.DatabaseID, d.name AS DatabaseName,
                   f.backup_start_date as FullBackupDate, f.backup_size as FullBackupSize,
                   df.backup_start_date as DiffBackupDate,
                   l.backup_start_date as LogBackupDate
            FROM dbo.Instances i
            JOIN dbo.Databases d ON i.InstanceID = d.InstanceID
            LEFT JOIN LatestFull f ON d.DatabaseID = f.DatabaseID AND f.rn = 1
            LEFT JOIN LatestDiff df ON d.DatabaseID = df.DatabaseID AND df.rn = 1
            LEFT JOIN LatestLog l ON d.DatabaseID = l.DatabaseID AND l.rn = 1
            WHERE i.IsActive = 1 AND d.IsActive = 1
            ORDER BY COALESCE(i.InstanceDisplayName, i.Instance), d.name", conn);
        cmd.CommandTimeout = 60;
        using var r = await cmd.ExecuteReaderAsync();
        var list = new List<object>();
        while (await r.ReadAsync())
        {
            var dict = new Dictionary<string, object?>();
            for (int i2 = 0; i2 < r.FieldCount; i2++)
            {
                var name = r.GetName(i2);
                var key = char.ToLowerInvariant(name[0]) + name.Substring(1);
                dict[key] = r.IsDBNull(i2) ? null : r.GetValue(i2);
            }
            list.Add(dict);
        }
        return Results.Ok(list);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

// ── Estate-wide Drives ───────────────────────────────────────────────────

app.MapGet("/api/drives", async () =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT d.*, i.InstanceDisplayName
            FROM dbo.Drives d
            JOIN dbo.Instances i ON d.InstanceID = i.InstanceID
            WHERE d.IsActive = 1");
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

// ── Performance: Running Queries ─────────────────────────────────────────

app.MapGet("/api/performance/running-queries", async (int? instanceId) =>
{
    try
    {
        var filter = instanceId.HasValue ? "AND rq.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT TOP 200 rq.InstanceID, i.InstanceDisplayName, rq.session_id, rq.start_time_utc,
                   rq.status, rq.command, rq.wait_type, rq.wait_resource,
                   rq.blocking_session_id, rq.cpu_time, rq.reads, rq.writes,
                   rq.logical_reads, rq.SnapshotDateUTC,
                   rq.database_id, d.name AS database_name
            FROM dbo.RunningQueries rq
            JOIN dbo.Instances i ON rq.InstanceID = i.InstanceID
            LEFT JOIN dbo.Databases d ON rq.database_id = d.database_id AND rq.InstanceID = d.InstanceID
            WHERE rq.SnapshotDateUTC > DATEADD(hour,-1,GETUTCDATE()) {filter}
            ORDER BY rq.SnapshotDateUTC DESC";
        var data = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value));
        return Results.Ok(new { data, note = "" });
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning("Running queries endpoint error: {Error}", ex.Message);
        return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
    }
}).RequireAuthorization();

// ── Performance: Blocking ────────────────────────────────────────────────

app.MapGet("/api/performance/blocking", async (int? instanceId) =>
{
    try
    {
        var filter = instanceId.HasValue ? "AND rq.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT rq.InstanceID, i.InstanceDisplayName, rq.session_id, rq.start_time_utc,
                   rq.status, rq.command, rq.wait_type, rq.wait_resource,
                   rq.blocking_session_id, rq.cpu_time, rq.reads, rq.writes,
                   rq.SnapshotDateUTC
            FROM dbo.RunningQueries rq
            JOIN dbo.Instances i ON rq.InstanceID = i.InstanceID
            WHERE rq.SnapshotDateUTC > DATEADD(hour,-1,GETUTCDATE())
              AND (rq.blocking_session_id > 0
                   OR rq.session_id IN (SELECT blocking_session_id FROM dbo.RunningQueries WHERE blocking_session_id > 0 AND SnapshotDateUTC > DATEADD(hour,-1,GETUTCDATE())))
              {filter}
            ORDER BY rq.SnapshotDateUTC DESC";
        var data = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value));
        return Results.Ok(new { data, note = "" });
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning("Blocking endpoint error: {Error}", ex.Message);
        return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
    }
}).RequireAuthorization();

// ── Performance: Slow Queries ────────────────────────────────────────────

app.MapGet("/api/performance/slow-queries", async (int? instanceId, int? hours) =>
{
    var h = hours ?? 24;
    try
    {
        var filter = instanceId.HasValue ? "AND sq.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT TOP 200 sq.InstanceID, i.InstanceDisplayName, sq.object_name, sq.DatabaseID,
                   sq.text, sq.duration, sq.cpu_time, sq.logical_reads,
                   sq.physical_reads, sq.writes, sq.timestamp,
                   sq.client_hostname, sq.client_app_name, sq.username
            FROM dbo.SlowQueries sq
            JOIN dbo.Instances i ON sq.InstanceID = i.InstanceID
            WHERE sq.timestamp > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY sq.duration DESC";
        var data = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@hours", h));
        return Results.Ok(new { data, note = "" });
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning("Slow queries endpoint error: {Error}", ex.Message);
        return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
    }
}).RequireAuthorization();

// ── Performance: Memory ──────────────────────────────────────────────────

app.MapGet("/api/performance/memory", async (int? instanceId, int? hours) =>
{
    var h = Math.Min(hours ?? 24, 336);
    var clerks = Array.Empty<object>() as object;
    var counters = Array.Empty<object>() as object;
    var clerkNote = "";
    var counterNote = "";

    // Memory clerk stats
    try
    {
        var filter = instanceId.HasValue ? "AND mc.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT TOP 200 mu.InstanceID, i.InstanceDisplayName, mct.MemoryClerkType AS clerk_type,
                   mct.MemoryClerkDescription AS clerk_name, mu.pages_kb, mu.SnapshotDate
            FROM dbo.MemoryUsage mu
            JOIN dbo.Instances i ON mu.InstanceID = i.InstanceID
            JOIN dbo.MemoryClerkType mct ON mu.MemoryClerkTypeID = mct.MemoryClerkTypeID
            WHERE mu.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY mu.pages_kb DESC";
        clerks = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@hours", h));
    }
    catch (Exception ex)
    {
        clerkNote = $"MemoryClerkStats not found: {ex.Message}";
    }

    // Performance counters (memory)
    try
    {
        var filter = instanceId.HasValue ? "AND pc.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT TOP 500 pc.InstanceID, i.InstanceDisplayName, c.counter_name, pc.Value AS cntr_value, pc.SnapshotDate
            FROM dbo.PerformanceCounters pc
            JOIN dbo.Instances i ON pc.InstanceID = i.InstanceID
            JOIN dbo.Counters c ON pc.CounterID = c.CounterID
            WHERE c.object_name LIKE '%Memory%'
              AND pc.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY pc.SnapshotDate DESC";
        counters = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@hours", h));
    }
    catch (Exception ex)
    {
        counterNote = $"PerformanceCounters not found: {ex.Message}";
    }

    return Results.Ok(new { clerks, counters, clerkNote, counterNote });
}).RequireAuthorization();

// ── Performance: IO ──────────────────────────────────────────────────────

app.MapGet("/api/performance/io", async (int? instanceId, int? hours) =>
{
    var h = Math.Min(hours ?? 24, 336);
    var fileStats = Array.Empty<object>() as object;
    var drivePerf = Array.Empty<object>() as object;
    var fileNote = "";
    var driveNote = "";

    // File IO stats
    try
    {
        var filter = instanceId.HasValue ? "AND ios.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT TOP 200 ios.InstanceID, i.InstanceDisplayName, d.name AS database_name, df.name AS file_name,
                   ios.io_stall_read_ms, ios.io_stall_write_ms, ios.num_of_reads, ios.num_of_writes,
                   ios.num_of_bytes_read, ios.num_of_bytes_written, ios.SnapshotDate
            FROM dbo.DBIOStats ios
            JOIN dbo.Instances i ON ios.InstanceID = i.InstanceID
            JOIN dbo.DBFiles df ON ios.FileID = df.FileID
            JOIN dbo.Databases d ON df.DatabaseID = d.DatabaseID
            WHERE ios.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY (ios.io_stall_read_ms + ios.io_stall_write_ms) DESC";
        fileStats = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@hours", h));
    }
    catch (Exception ex1)
    {
        fileNote = $"DBIOStats not found: {ex1.Message}";
    }

    // Drive performance
    try
    {
        var filter = instanceId.HasValue ? "AND dp.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT TOP 200 dp.*, i.InstanceDisplayName
            FROM dbo.DriveSnapshot dp
            JOIN dbo.Instances i ON dp.InstanceID = i.InstanceID
            WHERE dp.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY dp.SnapshotDate DESC";
        drivePerf = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@hours", h));
    }
    catch (Exception ex)
    {
        driveNote = $"DriveSnapshot not found: {ex.Message}";
    }

    return Results.Ok(new { fileStats, drivePerf, fileNote, driveNote });
}).RequireAuthorization();

// ── Exec Stats ───────────────────────────────────────────────────────────
app.MapGet("/api/performance/exec-stats", async (int? instanceId, int? hours) =>
{
    var h = hours ?? 24;
    var data = Array.Empty<object>() as object;
    var note = "";
    var filter = instanceId.HasValue ? "AND os.InstanceID = @instanceId" : "";

    try
    {
        var sql = $@"
            SELECT TOP 500 os.InstanceID, i.InstanceDisplayName, dbo_obj.ObjectName AS object_name, dbo_obj.SchemaName,
                   os.execution_count, os.total_worker_time, os.total_elapsed_time,
                   os.total_logical_reads, os.total_logical_writes, os.total_physical_reads, os.SnapshotDate
            FROM dbo.ObjectExecutionStats os
            JOIN dbo.Instances i ON os.InstanceID=i.InstanceID
            JOIN dbo.DBObjects dbo_obj ON os.ObjectID=dbo_obj.ObjectID
            WHERE os.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY os.total_worker_time DESC";
        data = await QueryAsync(sql, ("@hours", h), ("@instanceId", instanceId ?? (object)DBNull.Value));
    }
    catch (Exception ex)
    {
        note = $"ObjectExecutionStats not found: {ex.Message}";
    }
    return Results.Ok(new { data, note });
}).RequireAuthorization();

// ── Waits Timeline ───────────────────────────────────────────────────────
app.MapGet("/api/performance/waits-timeline", async (int? instanceId, int? hours) =>
{
    var h = hours ?? 24;
    var data = Array.Empty<object>() as object;
    var note = "";

    if (!instanceId.HasValue) return Results.Ok(new { data, note = "instanceId required" });

    try
    {
        var sql = @"
            SELECT w.InstanceID, w.SnapshotDate, wt.WaitType, w.wait_time_ms,
                   w.waiting_tasks_count, w.signal_wait_time_ms
            FROM dbo.Waits w
            JOIN dbo.WaitType wt ON w.WaitTypeID=wt.WaitTypeID
            WHERE w.InstanceID=@instanceId AND w.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE())
            ORDER BY w.SnapshotDate";
        data = await QueryAsync(sql, ("@instanceId", instanceId.Value), ("@hours", h));
    }
    catch (Exception ex)
    {
        note = $"Waits/WaitType not found: {ex.Message}";
    }
    return Results.Ok(new { data, note });
}).RequireAuthorization();

// ── Performance Counters ─────────────────────────────────────────────────
app.MapGet("/api/performance/counters", async (int? instanceId, int? hours) =>
{
    var h = hours ?? 24;
    var data = Array.Empty<object>() as object;
    var note = "";

    if (!instanceId.HasValue) return Results.Ok(new { data, note = "instanceId required" });

    try
    {
        var sql = @"
            SELECT pc.InstanceID, i.InstanceDisplayName, c.object_name, c.counter_name,
                   c.instance_name, pc.Value AS cntr_value, pc.SnapshotDate
            FROM dbo.PerformanceCounters pc
            JOIN dbo.Instances i ON pc.InstanceID=i.InstanceID
            JOIN dbo.Counters c ON pc.CounterID=c.CounterID
            WHERE pc.InstanceID=@instanceId AND pc.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE())
            ORDER BY pc.SnapshotDate";
        data = await QueryAsync(sql, ("@instanceId", instanceId.Value), ("@hours", h));
    }
    catch (Exception ex)
    {
        note = $"PerformanceCounters/Counters not found: {ex.Message}";
    }
    return Results.Ok(new { data, note });
}).RequireAuthorization();

// ── Job Timeline ─────────────────────────────────────────────────────────
app.MapGet("/api/monitoring/job-timeline", async (int? instanceId, int? hours) =>
{
    var h = hours ?? 24;
    var data = Array.Empty<object>() as object;
    var note = "";

    if (!instanceId.HasValue) return Results.Ok(new { data, note = "instanceId required" });

    try
    {
        var sql = @"
            SELECT jh.InstanceID, i.InstanceDisplayName, j.name as job_name,
                   jh.step_id, jh.step_name, jh.run_status, jh.RunDateTime,
                   jh.RunDurationSec, DATEADD(second, jh.RunDurationSec, jh.RunDateTime) as EndDateTime
            FROM dbo.JobHistory jh
            JOIN dbo.Instances i ON jh.InstanceID=i.InstanceID
            JOIN dbo.Jobs j ON jh.job_id=j.job_id AND jh.InstanceID=j.InstanceID
            WHERE jh.InstanceID=@instanceId AND jh.RunDateTime > DATEADD(hour,-@hours,GETUTCDATE()) AND jh.step_id=0
            ORDER BY jh.RunDateTime";
        data = await QueryAsync(sql, ("@instanceId", instanceId.Value), ("@hours", h));
    }
    catch (Exception ex)
    {
        note = $"JobHistory/Jobs not found: {ex.Message}";
    }
    return Results.Ok(new { data, note });
}).RequireAuthorization();

// ── Configuration ────────────────────────────────────────────────────────
app.MapGet("/api/monitoring/configuration", async (int? instanceId) =>
{
    var data = Array.Empty<object>() as object;
    var note = "";

    if (!instanceId.HasValue) return Results.Ok(new { data, note = "instanceId required" });

    try
    {
        var sql = @"
            SELECT sc.InstanceID, i.InstanceDisplayName, sco.name, sc.value, sc.value_in_use,
                   sco.minimum, sco.maximum, sco.is_dynamic, sco.is_advanced, sc.ValidFrom
            FROM dbo.SysConfig sc
            JOIN dbo.Instances i ON sc.InstanceID=i.InstanceID
            JOIN dbo.SysConfigOptions sco ON sc.configuration_id=sco.configuration_id
            WHERE sc.InstanceID=@instanceId
              AND sc.ValidFrom = (SELECT MAX(ValidFrom) FROM dbo.SysConfig sc2 WHERE sc2.InstanceID=sc.InstanceID AND sc2.configuration_id=sc.configuration_id)
            ORDER BY sco.name";
        data = await QueryAsync(sql, ("@instanceId", instanceId.Value));
    }
    catch (Exception ex)
    {
        note = $"SysConfig not found: {ex.Message}";
    }
    return Results.Ok(new { data, note });
}).RequireAuthorization();

app.MapGet("/api/monitoring/configuration/changes", async (int? instanceId, int? days) =>
{
    var d = days ?? 30;
    var data = Array.Empty<object>() as object;
    var note = "";

    if (!instanceId.HasValue) return Results.Ok(new { data, note = "instanceId required" });

    try
    {
        var sql = @"
            ;WITH Ranked AS (
                SELECT sco.name, sc.value, sc.value_in_use, sc.ValidFrom,
                       LAG(sc.value) OVER (PARTITION BY sc.configuration_id ORDER BY sc.ValidFrom) as prev_value
                FROM dbo.SysConfig sc
                JOIN dbo.SysConfigOptions sco ON sc.configuration_id=sco.configuration_id
                WHERE sc.InstanceID=@instanceId AND sc.ValidFrom > DATEADD(day,-@days,GETUTCDATE())
            )
            SELECT name, prev_value as old_value, value as new_value, ValidFrom as ChangeDate
            FROM Ranked
            WHERE prev_value IS NOT NULL AND prev_value <> value
            ORDER BY ValidFrom DESC";
        data = await QueryAsync(sql, ("@instanceId", instanceId.Value), ("@days", d));
    }
    catch (Exception ex)
    {
        note = $"Configuration change detection failed: {ex.Message}";
    }
    return Results.Ok(new { data, note });
}).RequireAuthorization();

// ── Batch 3: Patching, Schema Changes, Query Store, Identity, TempDB, DB Space ──

app.MapGet("/api/monitoring/patching", async (HttpContext ctx) =>
{
    var connStr = app.Configuration.GetConnectionString("DBADashDB");
    try
    {
        using var conn = new SqlConnection(connStr); await conn.OpenAsync();
        using var cmd = new SqlCommand("SELECT i.InstanceID, i.InstanceDisplayName, i.ProductVersion, i.ProductMajorVersion, i.Edition FROM dbo.Instances i WHERE i.IsActive=1 ORDER BY i.ProductVersion", conn);
        using var r = await cmd.ExecuteReaderAsync();
        var list = new List<object>();
        while (await r.ReadAsync()) list.Add(new { instanceId = r["InstanceID"], instanceName = r["InstanceDisplayName"]?.ToString(), productVersion = r["ProductVersion"]?.ToString(), productMajorVersion = r["ProductMajorVersion"] is DBNull ? 0 : Convert.ToInt32(r["ProductMajorVersion"]), edition = r["Edition"]?.ToString() });
        return Results.Ok(new { data = list, note = "" });
    }
    catch (Exception ex) { return Results.Ok(new { data = Array.Empty<object>(), note = ex.Message }); }
}).RequireAuthorization();

app.MapGet("/api/monitoring/schema-changes", async (HttpContext ctx, int instanceId, int days = 30) =>
{
    var connStr = app.Configuration.GetConnectionString("DBADashDB");
    var tables = new[] { "DDLHistory" };
    foreach (var tbl in tables)
    {
        try
        {
            using var conn = new SqlConnection(connStr); await conn.OpenAsync();
            var sql = $"SELECT TOP 200 d.DatabaseID, dbo_obj.ObjectName, dbo_obj.SchemaName, dbo_obj.ObjectType, d.ObjectDateCreated, d.ObjectDateModified, d.SnapshotValidFrom FROM dbo.DDLHistory d JOIN dbo.DBObjects dbo_obj ON d.ObjectID=dbo_obj.ObjectID WHERE dbo_obj.DatabaseID IN (SELECT DatabaseID FROM dbo.Databases WHERE InstanceID=@id) AND d.SnapshotValidFrom > DATEADD(day,-@days,GETUTCDATE()) ORDER BY d.SnapshotValidFrom DESC";
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", instanceId); cmd.Parameters.AddWithValue("@days", days);
            using var r = await cmd.ExecuteReaderAsync();
            var list = new List<object>();
            while (await r.ReadAsync())
            {
                var dict = new Dictionary<string, object?>();
                for (int i = 0; i < r.FieldCount; i++) dict[ToCamelCase(r.GetName(i))] = r.IsDBNull(i) ? null : r.GetValue(i);
                list.Add(dict);
            }
            return Results.Ok(new { data = list, note = "" });
        }
        catch { continue; }
    }
    return Results.Ok(new { data = Array.Empty<object>(), note = "No schema change tables found" });
}).RequireAuthorization();

app.MapGet("/api/performance/query-store", async (HttpContext ctx, int instanceId) =>
{
    var connStr = app.Configuration.GetConnectionString("DBADashDB");
    var tables = new[] { "QueryStoreStats", "TopQueries" };
    foreach (var tbl in tables)
    {
        try
        {
            using var conn = new SqlConnection(connStr); await conn.OpenAsync();
            using var cmd = new SqlCommand($"SELECT TOP 100 * FROM dbo.{tbl} WHERE InstanceID=@id ORDER BY 1 DESC", conn);
            cmd.Parameters.AddWithValue("@id", instanceId);
            using var r = await cmd.ExecuteReaderAsync();
            var list = new List<object>();
            while (await r.ReadAsync())
            {
                var dict = new Dictionary<string, object?>();
                for (int i = 0; i < r.FieldCount; i++) dict[ToCamelCase(r.GetName(i))] = r.IsDBNull(i) ? null : r.GetValue(i);
                list.Add(dict);
            }
            return Results.Ok(new { data = list, note = "" });
        }
        catch { continue; }
    }
    return Results.Ok(new { data = Array.Empty<object>(), note = "Query Store tables not found" });
}).RequireAuthorization();

app.MapGet("/api/monitoring/identity-columns", async (HttpContext ctx, int instanceId) =>
{
    var connStr = app.Configuration.GetConnectionString("DBADashDB");
    try
    {
        using var conn = new SqlConnection(connStr); await conn.OpenAsync();
        using var cmd = new SqlCommand(@"SELECT ic.InstanceID, d.name as DatabaseName, ic.schema_name AS SchemaName, ic.object_name AS TableName, ic.column_name AS ColumnName, ic.seed_value AS SeedValue, ic.increment_value AS IncrementValue, ic.last_value AS LastValue, ic.max_ident AS MaxValue, CASE WHEN ic.max_ident > 0 THEN CAST(ic.last_value AS FLOAT) / CAST(ic.max_ident AS FLOAT) * 100.0 ELSE 0 END as PercentUsed FROM dbo.IdentityColumns ic JOIN dbo.Databases d ON ic.DatabaseID=d.DatabaseID WHERE ic.InstanceID=@id ORDER BY PercentUsed DESC", conn);
        cmd.Parameters.AddWithValue("@id", instanceId);
        using var r = await cmd.ExecuteReaderAsync();
        var list = new List<object>();
        while (await r.ReadAsync())
        {
            var dict = new Dictionary<string, object?>();
            for (int i = 0; i < r.FieldCount; i++) dict[ToCamelCase(r.GetName(i))] = r.IsDBNull(i) ? null : r.GetValue(i);
            list.Add(dict);
        }
        return Results.Ok(new { data = list, note = "" });
    }
    catch (Exception ex) { return Results.Ok(new { data = Array.Empty<object>(), note = ex.Message }); }
}).RequireAuthorization();

app.MapGet("/api/monitoring/tempdb", async (HttpContext ctx, int instanceId) =>
{
    var connStr = app.Configuration.GetConnectionString("DBADashDB");
    var sqls = new[] {
        "SELECT df.file_id as FileId, df.name as Name, df.size*8 as SizeKb, df.space_used*8 as UsedKb FROM dbo.DBFiles df JOIN dbo.Databases d ON df.DatabaseID=d.DatabaseID WHERE d.InstanceID=@id AND d.name='tempdb'"
    };
    foreach (var sql in sqls)
    {
        try
        {
            using var conn = new SqlConnection(connStr); await conn.OpenAsync();
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", instanceId);
            using var r = await cmd.ExecuteReaderAsync();
            var list = new List<object>();
            while (await r.ReadAsync())
            {
                var dict = new Dictionary<string, object?>();
                for (int i = 0; i < r.FieldCount; i++) dict[ToCamelCase(r.GetName(i))] = r.IsDBNull(i) ? null : r.GetValue(i);
                list.Add(dict);
            }
            if (list.Count > 0) return Results.Ok(new { data = list, note = "" });
        }
        catch { continue; }
    }
    return Results.Ok(new { data = Array.Empty<object>(), note = "TempDB data not available" });
}).RequireAuthorization();

app.MapGet("/api/monitoring/db-space", async (HttpContext ctx, int instanceId) =>
{
    var connStr = app.Configuration.GetConnectionString("DBADashDB");
    var sqls = new[] {
        "SELECT d.name as DatabaseName, df.name as FileName, CASE df.type WHEN 0 THEN 'ROWS' WHEN 1 THEN 'LOG' ELSE 'OTHER' END as TypeDesc, df.size*8 as SizeKb, df.space_used*8 as UsedKb, df.growth, df.is_percent_growth as IsPercentGrowth FROM dbo.DBFiles df JOIN dbo.Databases d ON df.DatabaseID=d.DatabaseID WHERE d.InstanceID=@id AND d.IsActive=1 ORDER BY df.size DESC"
    };
    foreach (var sql in sqls)
    {
        try
        {
            using var conn = new SqlConnection(connStr); await conn.OpenAsync();
            using var cmd = new SqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@id", instanceId);
            using var r = await cmd.ExecuteReaderAsync();
            var list = new List<object>();
            while (await r.ReadAsync())
            {
                var dict = new Dictionary<string, object?>();
                for (int i = 0; i < r.FieldCount; i++) dict[ToCamelCase(r.GetName(i))] = r.IsDBNull(i) ? null : r.GetValue(i);
                list.Add(dict);
            }
            if (list.Count > 0) return Results.Ok(new { data = list, note = "" });
        }
        catch { continue; }
    }
    return Results.Ok(new { data = Array.Empty<object>(), note = "DB space data not available" });
}).RequireAuthorization();

static string ToCamelCase(string s) => string.IsNullOrEmpty(s) ? s : char.ToLowerInvariant(s[0]) + s.Substring(1);

app.MapGet("/api/tree", async () =>
{
    try
    {
        var rows = await QueryAsync(@"
            SELECT i.InstanceID, COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                   i.ProductVersion, i.ProductMajorVersion,
                   d.DatabaseID, d.name as DatabaseName,
                   CASE WHEN d.database_id <= 4 THEN 1 ELSE 0 END as IsSystem
            FROM dbo.Instances i
            LEFT JOIN dbo.Databases d ON i.InstanceID = d.InstanceID AND d.IsActive = 1
            WHERE i.IsActive = 1
            ORDER BY COALESCE(i.InstanceDisplayName, i.Instance),
                     CASE WHEN d.database_id <= 4 THEN 0 ELSE 1 END, d.name");

        var instances = new Dictionary<int, Dictionary<string, object?>>();
        var dbLists = new Dictionary<int, List<object>>();

        foreach (var row in rows)
        {
            var instId = Convert.ToInt32(row["InstanceID"]);
            if (!instances.ContainsKey(instId))
            {
                instances[instId] = new Dictionary<string, object?>
                {
                    ["instanceId"] = instId,
                    ["instanceName"] = row["InstanceName"],
                    ["productVersion"] = row["ProductVersion"],
                    ["productMajorVersion"] = row["ProductMajorVersion"] != null ? Convert.ToInt32(row["ProductMajorVersion"]) : 0
                };
                dbLists[instId] = new List<object>();
            }
            if (row["DatabaseID"] != null)
            {
                dbLists[instId].Add(new
                {
                    databaseId = Convert.ToInt32(row["DatabaseID"]),
                    name = row["DatabaseName"]?.ToString(),
                    isSystem = Convert.ToInt32(row["IsSystem"]) == 1
                });
            }
        }

        var result = instances.Values.Select(inst =>
        {
            var id = Convert.ToInt32(inst["instanceId"]!);
            inst["databases"] = dbLists[id];
            return inst;
        }).ToList();

        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

// ── Reports ──────────────────────────────────────────────────────────────

app.MapGet("/api/reports/licenses", async () =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT i.InstanceID, 
                   COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                   i.Edition, i.ProductVersion, i.ProductMajorVersion,
                   i.cpu_count, i.cores_per_socket, i.socket_count,
                   i.physical_memory_kb,
                   i.sqlserver_start_time,
                   i.LicenseType
            FROM dbo.InstanceInfo i
            WHERE i.IsActive = 1
            ORDER BY i.ProductMajorVersion DESC, COALESCE(i.InstanceDisplayName, i.Instance)");
        return Results.Ok(data);
    }
    catch
    {
        // Fallback to Instances table if InstanceInfo view doesn't exist
        try
        {
            var data = await QueryAsync(@"
                SELECT i.InstanceID, 
                       COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                       i.Edition, i.ProductVersion, i.ProductMajorVersion,
                       i.cpu_count, NULL as cores_per_socket, NULL as socket_count,
                       i.physical_memory_kb,
                       i.sqlserver_start_time,
                       NULL as LicenseType
                FROM dbo.Instances i
                WHERE i.IsActive = 1
                ORDER BY i.ProductMajorVersion DESC, COALESCE(i.InstanceDisplayName, i.Instance)");
            return Results.Ok(data);
        }
        catch (Exception ex2)
        {
            return Results.Ok(new { error = ex2.Message, data = Array.Empty<object>() });
        }
    }
}).RequireAuthorization();

app.MapGet("/api/reports/underutilized", async () =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT i.InstanceID, 
                   COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                   i.Edition, i.ProductVersion, i.cpu_count, i.socket_count, i.cores_per_socket,
                   i.physical_memory_kb,
                   AVG(CAST(c.SQLProcessCPU as float)) as AvgCPU,
                   MAX(c.SQLProcessCPU) as MaxCPU
            FROM dbo.InstanceInfo i
            JOIN dbo.CPU c ON i.InstanceID = c.InstanceID
            WHERE c.EventTime >= DATEADD(day, -14, GETUTCDATE())
              AND i.IsActive = 1
            GROUP BY i.InstanceID, i.InstanceDisplayName, i.Instance, i.Edition, 
                     i.ProductVersion, i.cpu_count, i.socket_count, i.cores_per_socket, i.physical_memory_kb
            HAVING AVG(CAST(c.SQLProcessCPU as float)) < 5
            ORDER BY AVG(CAST(c.SQLProcessCPU as float)) ASC");
        return Results.Ok(data);
    }
    catch
    {
        try
        {
            var data = await QueryAsync(@"
                SELECT i.InstanceID, 
                       COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                       i.Edition, i.ProductVersion, i.cpu_count, NULL as socket_count, NULL as cores_per_socket,
                       i.physical_memory_kb,
                       AVG(CAST(c.SQLProcessCPU as float)) as AvgCPU,
                       MAX(c.SQLProcessCPU) as MaxCPU
                FROM dbo.Instances i
                JOIN dbo.CPU c ON i.InstanceID = c.InstanceID
                WHERE c.EventTime >= DATEADD(day, -14, GETUTCDATE())
                  AND i.IsActive = 1
                GROUP BY i.InstanceID, i.InstanceDisplayName, i.Instance, i.Edition, 
                         i.ProductVersion, i.cpu_count, i.physical_memory_kb
                HAVING AVG(CAST(c.SQLProcessCPU as float)) < 5
                ORDER BY AVG(CAST(c.SQLProcessCPU as float)) ASC");
            return Results.Ok(data);
        }
        catch (Exception ex2)
        {
            return Results.Ok(new { error = ex2.Message, data = Array.Empty<object>() });
        }
    }
}).RequireAuthorization();

app.MapGet("/api/reports/fleet-stats", async (int? hours) =>
{
    var h = Math.Min(hours ?? 24, 336);
    try
    {
        var cpuData = await QueryAsync(@"
            SELECT i.InstanceID,
                   COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                   i.Edition, i.ProductVersion,
                   i.cpu_count, i.physical_memory_kb,
                   AVG(CAST(c.SQLProcessCPU as float)) as AvgCPU24h,
                   MAX(c.SQLProcessCPU) as MaxCPU24h
            FROM dbo.InstanceInfo i
            LEFT JOIN dbo.CPU c ON i.InstanceID = c.InstanceID AND c.EventTime >= DATEADD(hour, -@hours, GETUTCDATE())
            WHERE i.IsActive = 1
            GROUP BY i.InstanceID, i.InstanceDisplayName, i.Instance, i.Edition, i.ProductVersion, i.cpu_count, i.physical_memory_kb
            ORDER BY AVG(CAST(c.SQLProcessCPU as float)) DESC", ("@hours", h));

        // Get storage data
        var storageData = new Dictionary<int, (long capacity, long free, long used)>();
        try
        {
            var storage = await QueryAsync(@"
                SELECT d.InstanceID, 
                       SUM(d.Capacity) as TotalCapacity, 
                       SUM(d.FreeSpace) as TotalFree
                FROM dbo.Drives d 
                WHERE d.IsActive = 1 
                GROUP BY d.InstanceID");
            foreach (var row in storage)
            {
                var instId = Convert.ToInt32(row["InstanceID"]);
                var cap = row["TotalCapacity"] != null ? Convert.ToInt64(row["TotalCapacity"]) : 0;
                var free = row["TotalFree"] != null ? Convert.ToInt64(row["TotalFree"]) : 0;
                storageData[instId] = (cap, free, cap - free);
            }
        }
        catch { }

        // Merge
        var result = cpuData.Select(row =>
        {
            var instId = Convert.ToInt32(row["InstanceID"]);
            storageData.TryGetValue(instId, out var stor);
            row["TotalCapacity"] = stor.capacity;
            row["TotalFree"] = stor.free;
            row["TotalUsed"] = stor.used;
            return row;
        }).ToList();

        return Results.Ok(result);
    }
    catch
    {
        try
        {
            var cpuData = await QueryAsync(@"
                SELECT i.InstanceID,
                       COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                       i.Edition, i.ProductVersion,
                       i.cpu_count, i.physical_memory_kb,
                       AVG(CAST(c.SQLProcessCPU as float)) as AvgCPU24h,
                       MAX(c.SQLProcessCPU) as MaxCPU24h
                FROM dbo.Instances i
                LEFT JOIN dbo.CPU c ON i.InstanceID = c.InstanceID AND c.EventTime >= DATEADD(hour, -@hours, GETUTCDATE())
                WHERE i.IsActive = 1
                GROUP BY i.InstanceID, i.InstanceDisplayName, i.Instance, i.Edition, i.ProductVersion, i.cpu_count, i.physical_memory_kb
                ORDER BY AVG(CAST(c.SQLProcessCPU as float)) DESC", ("@hours", h));

            var storageData = new Dictionary<int, (long capacity, long free, long used)>();
            try
            {
                var storage = await QueryAsync(@"
                    SELECT d.InstanceID, SUM(d.Capacity) as TotalCapacity, SUM(d.FreeSpace) as TotalFree
                    FROM dbo.Drives d WHERE d.IsActive = 1 GROUP BY d.InstanceID");
                foreach (var row in storage)
                {
                    var instId = Convert.ToInt32(row["InstanceID"]);
                    var cap = row["TotalCapacity"] != null ? Convert.ToInt64(row["TotalCapacity"]) : 0;
                    var free = row["TotalFree"] != null ? Convert.ToInt64(row["TotalFree"]) : 0;
                    storageData[instId] = (cap, free, cap - free);
                }
            }
            catch { }

            var result = cpuData.Select(row =>
            {
                var instId = Convert.ToInt32(row["InstanceID"]);
                storageData.TryGetValue(instId, out var stor);
                row["TotalCapacity"] = stor.capacity;
                row["TotalFree"] = stor.free;
                row["TotalUsed"] = stor.used;
                return row;
            }).ToList();

            return Results.Ok(result);
        }
        catch (Exception ex2)
        {
            return Results.Ok(new { error = ex2.Message, data = Array.Empty<object>() });
        }
    }
}).RequireAuthorization();

// ── Backups Management Overview ───────────────────────────────────────────

app.MapGet("/api/backups/management", async () =>
{
    try
    {
        using var conn = new SqlConnection(connStr);
        await conn.OpenAsync();
        
        // 1. Per-instance backup summary
        using var cmd1 = new SqlCommand(@"
            ;WITH LatestBackups AS (
                SELECT b.DatabaseID, b.type, b.backup_start_date, b.backup_finish_date,
                       b.backup_size, b.compressed_backup_size,
                       ROW_NUMBER() OVER (PARTITION BY b.DatabaseID, b.type ORDER BY b.backup_start_date DESC) as rn
                FROM dbo.Backups b
            ),
            DbBackups AS (
                SELECT d.InstanceID, d.DatabaseID, d.name as DatabaseName,
                       lb.type, lb.backup_start_date, lb.backup_finish_date,
                       lb.backup_size, lb.compressed_backup_size,
                       DATEDIFF(second, lb.backup_start_date, lb.backup_finish_date) as backup_duration_sec
                FROM dbo.Databases d
                LEFT JOIN LatestBackups lb ON d.DatabaseID = lb.DatabaseID AND lb.rn = 1
                WHERE d.IsActive = 1
            )
            SELECT 
                i.InstanceID,
                COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                i.Edition,
                db.DatabaseID, db.DatabaseName, db.type, 
                db.backup_start_date, db.backup_finish_date,
                db.backup_size, db.compressed_backup_size, db.backup_duration_sec
            FROM dbo.Instances i
            JOIN DbBackups db ON i.InstanceID = db.InstanceID
            WHERE i.IsActive = 1
            ORDER BY COALESCE(i.InstanceDisplayName, i.Instance), db.DatabaseName, db.type", conn);
        cmd1.CommandTimeout = 120;
        
        var rows1 = new List<Dictionary<string, object?>>();
        using (var reader1 = await cmd1.ExecuteReaderAsync())
        {
            while (await reader1.ReadAsync())
            {
                var row = new Dictionary<string, object?>();
                for (int i = 0; i < reader1.FieldCount; i++)
                    row[reader1.GetName(i)] = reader1.IsDBNull(i) ? null : reader1.GetValue(i);
                rows1.Add(row);
            }
        }
        
        // 2. CPU avg 24h per instance for sorting
        using var cmd2 = new SqlCommand(@"
            SELECT c.InstanceID, AVG(CAST(c.SQLProcessCPU as float)) as AvgCPU24h
            FROM dbo.CPU c
            WHERE c.EventTime >= DATEADD(hour, -24, GETUTCDATE())
            GROUP BY c.InstanceID", conn);
        cmd2.CommandTimeout = 60;
        
        var cpuMap = new Dictionary<int, double>();
        using (var reader2 = await cmd2.ExecuteReaderAsync())
        {
            while (await reader2.ReadAsync())
            {
                var instId = reader2.GetInt32(0);
                var avg = reader2.IsDBNull(1) ? 0.0 : reader2.GetDouble(1);
                cpuMap[instId] = avg;
            }
        }
        
        // 3. Backups in last 24h stats
        using var cmd3 = new SqlCommand(@"
            SELECT COUNT(*) as BackupCount24h,
                   SUM(backup_size) as TotalSize24h,
                   AVG(DATEDIFF(second, backup_start_date, backup_finish_date)) as AvgDurationSec24h
            FROM dbo.Backups
            WHERE backup_start_date >= DATEADD(hour, -24, GETUTCDATE())", conn);
        cmd3.CommandTimeout = 60;
        
        int backupCount24h = 0; decimal totalSize24h = 0; int avgDuration24h = 0;
        using (var reader3 = await cmd3.ExecuteReaderAsync())
        {
            if (await reader3.ReadAsync())
            {
                backupCount24h = reader3.IsDBNull(0) ? 0 : reader3.GetInt32(0);
                totalSize24h = reader3.IsDBNull(1) ? 0 : reader3.GetDecimal(1);
                avgDuration24h = reader3.IsDBNull(2) ? 0 : reader3.GetInt32(2);
            }
        }
        
        // Build response
        var result = new Dictionary<string, object?>
        {
            ["backups"] = rows1.Select(r => new Dictionary<string, object?>
            {
                ["instanceId"] = Convert.ToInt32(r["InstanceID"]),
                ["instanceName"] = r["InstanceName"]?.ToString(),
                ["edition"] = r["Edition"]?.ToString(),
                ["databaseId"] = r["DatabaseID"] != null ? Convert.ToInt32(r["DatabaseID"]) : null,
                ["databaseName"] = r["DatabaseName"]?.ToString(),
                ["type"] = r["type"]?.ToString()?.Trim(),
                ["backupStartDate"] = r["backup_start_date"],
                ["backupFinishDate"] = r["backup_finish_date"],
                ["backupSize"] = r["backup_size"],
                ["compressedBackupSize"] = r["compressed_backup_size"],
                ["backupDurationSec"] = r["backup_duration_sec"] != null ? Convert.ToInt32(r["backup_duration_sec"]) : (int?)null,
            }).ToList(),
            ["cpuByInstance"] = cpuMap.Select(kv => new { instanceId = kv.Key, avgCpu24h = Math.Round(kv.Value, 1) }).ToList(),
            ["stats"] = new
            {
                backupCount24h,
                totalSize24h,
                avgDurationSec24h = avgDuration24h
            }
        };
        
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, backups = Array.Empty<object>(), cpuByInstance = Array.Empty<object>(), stats = new { backupCount24h = 0, totalSize24h = 0m, avgDurationSec24h = 0 } });
    }
}).RequireAuthorization();

// ── Backup Ampel Report (mirrors Send_DBInventory_AmpelReport SP) ────────

app.MapGet("/api/reports/backup-ampel", async () =>
{
    try
    {
        // Per-instance backup health
        List<Dictionary<string, object?>> instances;
        try
        {
            instances = await QueryAsync(@"
                ;WITH PerDbFull AS (
                    SELECT d.InstanceID, d.DatabaseID,
                           MAX(b.backup_start_date) as LatestFull
                    FROM dbo.Databases d
                    LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                    LEFT JOIN dbo.Backups b ON d.DatabaseID = b.DatabaseID AND b.type = 'D'
                    WHERE d.IsActive = 1 AND d.name NOT IN ('master','model','msdb','tempdb')
                      AND (h.is_primary_replica IS NULL OR h.is_primary_replica = 1)
                    GROUP BY d.InstanceID, d.DatabaseID
                ),
                PerDbLog AS (
                    SELECT d.InstanceID, d.DatabaseID,
                           MAX(b.backup_start_date) as LatestLog
                    FROM dbo.Databases d
                    LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                    LEFT JOIN dbo.Backups b ON d.DatabaseID = b.DatabaseID AND b.type = 'L'
                    WHERE d.IsActive = 1 AND d.name NOT IN ('master','model','msdb','tempdb')
                      AND (h.is_primary_replica IS NULL OR h.is_primary_replica = 1)
                      AND d.recovery_model IN (1, 2)  -- Only FULL and BULK_LOGGED need log backups
                    GROUP BY d.InstanceID, d.DatabaseID
                )
                SELECT 
                    i.InstanceID,
                    COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                    i.Edition, i.ProductVersion,
                    (SELECT COUNT(*) FROM dbo.Databases d2
                     LEFT JOIN dbo.DatabasesHADR h2 ON d2.DatabaseID=h2.DatabaseID AND h2.is_local=1
                     WHERE d2.InstanceID=i.InstanceID AND d2.IsActive=1 AND d2.name NOT IN ('master','model','msdb','tempdb')
                       AND (h2.is_primary_replica IS NULL OR h2.is_primary_replica=1)) as DatabaseCount,
                    -- Per-DB aggregated: oldest latest-full across all DBs (worst case)
                    MIN(pf.LatestFull) as LastFullBackup,
                    -- Per-DB aggregated: oldest latest-log, but ONLY for Full/Bulk-Logged recovery DBs
                    MIN(pl.LatestLog) as LastLogBackup,
                    -- Newest for context
                    MAX(pf.LatestFull) as NewestFullBackup,
                    MAX(pl.LatestLog) as NewestLogBackup,
                    -- Volume & count
                    ISNULL((SELECT SUM(CAST(COALESCE(b.backup_size,0) as float)/1024/1024/1024)
                     FROM dbo.Backups b
                     JOIN dbo.Databases d ON b.DatabaseID = d.DatabaseID
                     LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                     WHERE d.InstanceID = i.InstanceID AND d.IsActive = 1
                       AND d.name NOT IN ('master','model','msdb','tempdb')
                       AND (h.is_primary_replica IS NULL OR h.is_primary_replica = 1)
                       AND b.backup_start_date >= DATEADD(hour,-24,GETUTCDATE())), 0) as BackupVolumeGB24h,
                    (SELECT COUNT(DISTINCT b.DatabaseID)
                     FROM dbo.Backups b
                     JOIN dbo.Databases d ON b.DatabaseID = d.DatabaseID
                     LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                     WHERE d.InstanceID = i.InstanceID AND d.IsActive = 1
                       AND d.name NOT IN ('master','model','msdb','tempdb')
                       AND (h.is_primary_replica IS NULL OR h.is_primary_replica = 1)
                       AND b.backup_start_date >= DATEADD(hour,-24,GETUTCDATE())) as BackedUpDBs24h,
                    -- Count DBs with full backup older than 24h or no backup at all
                    (SELECT COUNT(*) FROM PerDbFull pf2
                     WHERE pf2.InstanceID = i.InstanceID
                       AND (pf2.LatestFull IS NULL OR pf2.LatestFull < DATEADD(hour,-24,GETUTCDATE()))) as DbsWithOldFullBackup,
                    -- Count Full/Bulk-Logged DBs with log backup older than 30min or none
                    (SELECT COUNT(*) FROM PerDbLog pl2
                     WHERE pl2.InstanceID = i.InstanceID
                       AND (pl2.LatestLog IS NULL OR pl2.LatestLog < DATEADD(minute,-30,GETUTCDATE()))) as DbsWithOldLogBackup
                FROM dbo.Instances i
                LEFT JOIN PerDbFull pf ON i.InstanceID = pf.InstanceID
                LEFT JOIN PerDbLog pl ON i.InstanceID = pl.InstanceID
                WHERE i.IsActive = 1
                GROUP BY i.InstanceID, i.InstanceDisplayName, i.Instance, i.Edition, i.ProductVersion
                ORDER BY COALESCE(i.InstanceDisplayName, i.Instance)");
        }
        catch
        {
            // Fallback without backup join
            instances = await QueryAsync(@"
                SELECT i.InstanceID,
                       COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                       i.Edition, i.ProductVersion,
                       (SELECT COUNT(*) FROM dbo.Databases d2 LEFT JOIN dbo.DatabasesHADR h2 ON d2.DatabaseID=h2.DatabaseID AND h2.is_local=1 WHERE d2.InstanceID=i.InstanceID AND d2.IsActive=1 AND d2.name NOT IN ('master','model','msdb','tempdb') AND (h2.is_primary_replica IS NULL OR h2.is_primary_replica=1)) as DatabaseCount,
                       NULL as LastFullBackup, NULL as LastDiffBackup, NULL as LastLogBackup,
                       0 as BackupVolumeGB24h, 0 as BackedUpDBs24h
                FROM dbo.Instances i WHERE i.IsActive = 1
                ORDER BY COALESCE(i.InstanceDisplayName, i.Instance)");
        }

        // Log backup interval stats
        var logMap = new Dictionary<int, (double avg, int max)>();
        try
        {
            var logStats = await QueryAsync(@"
                ;WITH LogBackups AS (
                    SELECT b.DatabaseID, d.InstanceID, b.backup_start_date,
                           LAG(b.backup_start_date) OVER (PARTITION BY b.DatabaseID ORDER BY b.backup_start_date) as prev_backup
                    FROM dbo.Backups b
                    JOIN dbo.Databases d ON b.DatabaseID = d.DatabaseID
                    WHERE b.type = 'L' AND b.backup_start_date >= DATEADD(hour, -24, GETUTCDATE())
                )
                SELECT InstanceID,
                       AVG(CAST(DATEDIFF(minute, prev_backup, backup_start_date) as float)) as AvgLogIntervalMin,
                       MAX(DATEDIFF(minute, prev_backup, backup_start_date)) as MaxLogIntervalMin
                FROM LogBackups
                WHERE prev_backup IS NOT NULL
                GROUP BY InstanceID");
            foreach (var row in logStats)
            {
                var instId = Convert.ToInt32(row["InstanceID"]);
                var avg = row["AvgLogIntervalMin"] != null ? Convert.ToDouble(row["AvgLogIntervalMin"]) : 0;
                var max = row["MaxLogIntervalMin"] != null ? Convert.ToInt32(row["MaxLogIntervalMin"]) : 0;
                logMap[instId] = (avg, max);
            }
        }
        catch { }

        // Per-database detail (with fallback for missing columns)
        List<Dictionary<string, object?>> dbDetails = new();
        try
        {
            dbDetails = await QueryAsync(@"
                ;WITH LatestBackups AS (
                    SELECT b.DatabaseID, b.type, b.backup_start_date, b.backup_size,
                           ROW_NUMBER() OVER (PARTITION BY b.DatabaseID, b.type ORDER BY b.backup_start_date DESC) as rn
                    FROM dbo.Backups b
                )
                SELECT d.InstanceID, d.DatabaseID, d.name as DatabaseName,
                       CASE d.recovery_model WHEN 1 THEN 'FULL' WHEN 2 THEN 'BULK_LOGGED' WHEN 3 THEN 'SIMPLE' ELSE 'UNKNOWN' END as RecoveryModel,
                       d.compatibility_level as CompatLevel,
                       d.is_encrypted as IsEncrypted,
                       h.is_primary_replica as IsPrimaryReplica,
                       ag.name as AGName,
                       f.backup_start_date as LastFullDate, f.backup_size as FullBackupSize,
                       df.backup_start_date as LastDiffDate,
                       l.backup_start_date as LastLogDate
                FROM dbo.Databases d
                LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                LEFT JOIN dbo.AvailabilityGroups ag ON h.group_id = ag.group_id AND ag.InstanceID = d.InstanceID
                LEFT JOIN LatestBackups f ON d.DatabaseID = f.DatabaseID AND f.type='D' AND f.rn=1
                LEFT JOIN LatestBackups df ON d.DatabaseID = df.DatabaseID AND df.type='I' AND df.rn=1
                LEFT JOIN LatestBackups l ON d.DatabaseID = l.DatabaseID AND l.type='L' AND l.rn=1
                WHERE d.IsActive = 1 AND d.name NOT IN ('master','model','msdb','tempdb')
                ORDER BY d.InstanceID, d.name");
        }
        catch
        {
            try
            {
                dbDetails = await QueryAsync(@"
                    ;WITH LatestBackups AS (
                        SELECT b.DatabaseID, b.type, b.backup_start_date, b.backup_size,
                               ROW_NUMBER() OVER (PARTITION BY b.DatabaseID, b.type ORDER BY b.backup_start_date DESC) as rn
                        FROM dbo.Backups b
                    )
                    SELECT d.InstanceID, d.DatabaseID, d.name as DatabaseName,
                           h.is_primary_replica as IsPrimaryReplica,
                           f.backup_start_date as LastFullDate, f.backup_size as FullBackupSize,
                           df.backup_start_date as LastDiffDate,
                           l.backup_start_date as LastLogDate
                    FROM dbo.Databases d
                    LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
                    LEFT JOIN LatestBackups f ON d.DatabaseID = f.DatabaseID AND f.type='D' AND f.rn=1
                    LEFT JOIN LatestBackups df ON d.DatabaseID = df.DatabaseID AND df.type='I' AND df.rn=1
                    LEFT JOIN LatestBackups l ON d.DatabaseID = l.DatabaseID AND l.type='L' AND l.rn=1
                    WHERE d.IsActive = 1 AND d.name NOT IN ('master','model','msdb','tempdb')
                    ORDER BY d.InstanceID, d.name");
            }
            catch { }
        }

        // Merge log stats into instances
        var result = instances.Select(row =>
        {
            var instId = Convert.ToInt32(row["InstanceID"]);
            if (logMap.TryGetValue(instId, out var ls))
            {
                row["AvgLogIntervalMin"] = Math.Round(ls.avg, 1);
                row["MaxLogIntervalMin"] = ls.max;
            }
            else
            {
                row["AvgLogIntervalMin"] = null;
                row["MaxLogIntervalMin"] = null;
            }
            return row;
        }).ToList();

        return Results.Ok(new { instances = result, databases = dbDetails });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, instances = Array.Empty<object>(), databases = Array.Empty<object>() });
    }
}).RequireAuthorization();



// Debug: raw Summary table for an instance
app.MapGet("/api/debug/summary/{id:int}", async (int id) =>
{
    try
    {
        var raw = await QueryAsync(@"
            SELECT *
            FROM dbo.Summary
            WHERE InstanceID = @id", ("@id", id));
        return Results.Ok(raw.Count > 0 ? raw[0] : new Dictionary<string, object?>{ ["error"] = "No summary row for this instance" });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message });
    }
}).RequireAuthorization(AppPolicies.AdminOnly);

// SPA fallback — serve index.html for all non-API routes
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program
{
}


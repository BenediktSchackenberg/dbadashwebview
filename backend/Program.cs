using System.Data;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Data.SqlClient;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// JWT
var jwtSecret = builder.Configuration["Jwt:Secret"]!;
var jwtIssuer = builder.Configuration["Jwt:Issuer"]!;
var jwtAudience = builder.Configuration["Jwt:Audience"]!;
var jwtExpHours = int.Parse(builder.Configuration["Jwt:ExpirationHours"] ?? "12");
var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = key
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();
app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

var connStr = builder.Configuration.GetConnectionString("DBADashDB")!;

// ── Helpers ──────────────────────────────────────────────────────────────

string GenerateToken(string username)
{
    var claims = new[] {
        new Claim(ClaimTypes.Name, username),
        new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
    };
    var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
    var token = new JwtSecurityToken(jwtIssuer, jwtAudience, claims,
        expires: DateTime.UtcNow.AddHours(jwtExpHours), signingCredentials: creds);
    return new JwtSecurityTokenHandler().WriteToken(token);
}

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

async Task<List<Dictionary<string, object?>>> SpAsync(string sp, params (string name, object? value)[] parameters)
{
    using var conn = new SqlConnection(connStr);
    await conn.OpenAsync();
    using var cmd = new SqlCommand(sp, conn) { CommandType = CommandType.StoredProcedure, CommandTimeout = 30 };
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

// ── Public endpoints ─────────────────────────────────────────────────────

app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

app.MapPost("/api/auth/login", (LoginRequest req) =>
{
    if (req.Username == "admin" && req.Password == "admin")
        return Results.Ok(new { token = GenerateToken(req.Username), username = req.Username });
    return Results.Unauthorized();
});

// ── Protected endpoints ──────────────────────────────────────────────────

app.MapGet("/api/dashboard/summary", async () =>
{
    try
    {
        var data = await SpAsync("dbo.Summary_Get");
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/instances", async () =>
{
    try
    {
        var instances = await QueryAsync(@"
            SELECT i.InstanceID, i.Instance, i.ConnectionID, i.IsActive, i.Edition, 
                   i.ProductVersion, i.cpu_count, i.physical_memory_kb, i.sqlserver_start_time,
                   i.InstanceDisplayName, i.ShowInSummary
            FROM dbo.Instances i WHERE i.IsActive = 1 ORDER BY i.InstanceDisplayName");
        return Results.Ok(instances);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/instances/{id:int}", async (int id) =>
{
    try
    {
        var inst = await QueryAsync(@"
            SELECT i.InstanceID, i.Instance, i.ConnectionID, i.IsActive, i.Edition,
                   i.ProductVersion, i.cpu_count, i.physical_memory_kb, i.sqlserver_start_time,
                   i.InstanceDisplayName, i.Alias
            FROM dbo.Instances i WHERE i.InstanceID = @id", ("@id", id));
        if (inst.Count == 0) return Results.NotFound();

        List<Dictionary<string, object?>>? summary = null;
        try { summary = await SpAsync("dbo.Summary_Get"); } catch { }
        var instanceSummary = summary?.FirstOrDefault(s =>
            s.ContainsKey("InstanceID") && Convert.ToInt32(s["InstanceID"]) == id);

        return Results.Ok(new { instance = inst[0], summary = instanceSummary });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message });
    }
}).RequireAuthorization();

app.MapGet("/api/instances/{id:int}/cpu", async (int id) =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT TOP 1440 EventTime, SQLProcessCPU, SystemIdleCPU,
                   (100 - SQLProcessCPU - SystemIdleCPU) AS OtherCPU,
                   (100 - SystemIdleCPU) AS TotalCPU
            FROM dbo.CPU WHERE InstanceID = @id AND EventTime > DATEADD(hour, -24, GETUTCDATE())
            ORDER BY EventTime DESC", ("@id", id));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/instances/{id:int}/waits", async (int id) =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT TOP 20 w.WaitTypeID, wt.WaitType, 
                   SUM(w.wait_time_ms) as TotalWaitMs,
                   SUM(w.waiting_tasks_count) as TotalWaitCount,
                   SUM(w.signal_wait_time_ms) as TotalSignalWaitMs
            FROM dbo.Waits w
            LEFT JOIN dbo.WaitType wt ON w.WaitTypeID = wt.WaitTypeID
            WHERE w.InstanceID = @id AND w.SnapshotDate > DATEADD(hour, -1, GETUTCDATE())
            GROUP BY w.WaitTypeID, wt.WaitType
            ORDER BY SUM(w.wait_time_ms) DESC", ("@id", id));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/instances/{id:int}/drives", async (int id) =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT DriveID, Name, Label, Capacity, FreeSpace,
                   (Capacity - FreeSpace) AS UsedSpace
            FROM dbo.Drives WHERE InstanceID = @id", ("@id", id));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/instances/{id:int}/databases", async (int id) =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT DatabaseID, name, state, recovery_model, LastGoodCheckDbTime, IsActive
            FROM dbo.Databases WHERE InstanceID = @id AND IsActive = 1
            ORDER BY name", ("@id", id));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/instances/{id:int}/backups", async (int id) =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT d.DatabaseID, d.name AS DatabaseName, b.type, 
                   b.backup_start_date, b.backup_finish_date,
                   b.backup_size, b.compressed_backup_size
            FROM dbo.Databases d
            LEFT JOIN dbo.Backups b ON d.DatabaseID = b.DatabaseID
            WHERE d.InstanceID = @id AND d.IsActive = 1
            ORDER BY d.name, b.backup_start_date DESC", ("@id", id));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/instances/{id:int}/jobs", async (int id) =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT TOP 50 job_id, step_id, step_name, run_status,
                   RunDateTime, RunDurationSec, message
            FROM dbo.JobHistory WHERE InstanceID = @id
            ORDER BY RunDateTime DESC", ("@id", id));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/jobs/recent", async () =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT TOP 100 jh.job_id, jh.step_id, jh.step_name, jh.run_status,
                   jh.RunDateTime, jh.RunDurationSec, jh.message,
                   jh.InstanceID, i.InstanceDisplayName
            FROM dbo.JobHistory jh
            JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
            WHERE jh.step_id = 0
            ORDER BY jh.RunDateTime DESC");
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/jobs/failures", async () =>
{
    try
    {
        var data = await QueryAsync(@"
            SELECT TOP 100 jh.job_id, jh.step_id, jh.step_name, jh.run_status,
                   jh.RunDateTime, jh.RunDurationSec, jh.message,
                   jh.InstanceID, i.InstanceDisplayName
            FROM dbo.JobHistory jh
            JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
            WHERE jh.run_status = 0 AND jh.RunDateTime > DATEADD(hour, -24, GETUTCDATE())
            ORDER BY jh.RunDateTime DESC");
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/alerts/recent", async () =>
{
    try
    {
        // Try common alert table names
        var data = await QueryAsync(@"
            SELECT TOP 50 * FROM (
                SELECT TOP 50 * FROM dbo.Alerts ORDER BY 1 DESC
            ) t ORDER BY 1 DESC");
        return Results.Ok(data);
    }
    catch
    {
        try
        {
            // Fallback: check if CollectionErrors can serve as alerts
            var data = await QueryAsync(@"
                SELECT TOP 50 InstanceID, ErrorDate, ErrorMessage, ErrorContext
                FROM dbo.CollectionErrorLog
                ORDER BY ErrorDate DESC");
            return Results.Ok(data);
        }
        catch
        {
            return Results.Ok(Array.Empty<object>());
        }
    }
}).RequireAuthorization();

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

app.MapGet("/api/availability-groups/{id:int}", async (int id) =>
{
    try
    {
        var ag = await QueryAsync(@"
            SELECT ag.*, i.InstanceDisplayName
            FROM dbo.AvailabilityGroups ag
            JOIN dbo.Instances i ON ag.InstanceID = i.InstanceID
            WHERE ag.AGId = @id", ("@id", id));
        if (ag.Count == 0) return Results.NotFound();

        List<Dictionary<string, object?>> replicas = new();
        try
        {
            replicas = await QueryAsync(@"
                SELECT ar.*, i.InstanceDisplayName
                FROM dbo.AvailabilityReplicas ar
                LEFT JOIN dbo.Instances i ON ar.InstanceID = i.InstanceID
                WHERE ar.AGId = @id", ("@id", id));
        }
        catch { }

        List<Dictionary<string, object?>> databases = new();
        try
        {
            databases = await QueryAsync(@"
                SELECT dh.*, d.name AS DatabaseName
                FROM dbo.DatabasesHADR dh
                LEFT JOIN dbo.Databases d ON dh.DatabaseID = d.DatabaseID
                WHERE dh.AGId = @id", ("@id", id));
        }
        catch { }

        return Results.Ok(new { ag = ag[0], replicas, databases });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message });
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
    try
    {
        var data = await QueryAsync(@"
            SELECT i.InstanceID, i.InstanceDisplayName, d.DatabaseID, d.name AS DatabaseName,
                   b.type, b.backup_start_date, b.backup_finish_date,
                   b.backup_size, b.compressed_backup_size
            FROM dbo.Instances i
            JOIN dbo.Databases d ON i.InstanceID = d.InstanceID
            LEFT JOIN dbo.Backups b ON d.DatabaseID = b.DatabaseID
            WHERE i.IsActive = 1 AND d.IsActive = 1
            ORDER BY i.InstanceDisplayName, d.name, b.backup_start_date DESC");
        return Results.Ok(data);
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

// SPA fallback — serve index.html for all non-API routes
app.MapFallbackToFile("index.html");

app.Run();

record LoginRequest(string Username, string Password);

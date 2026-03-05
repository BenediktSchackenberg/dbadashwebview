using System.Data;
using System.DirectoryServices.Protocols;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
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

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
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

// ── AD/LDAP Config ───────────────────────────────────────────────────────

var configDir = Path.Combine(AppContext.BaseDirectory, "config");
Directory.CreateDirectory(configDir);
var adConfigPath = Path.Combine(configDir, "ad-config.json");

AdConfig LoadAdConfig()
{
    if (!File.Exists(adConfigPath)) return new AdConfig();
    var json = File.ReadAllText(adConfigPath);
    return JsonSerializer.Deserialize<AdConfig>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new AdConfig();
}

void SaveAdConfig(AdConfig cfg)
{
    var json = JsonSerializer.Serialize(cfg, new JsonSerializerOptions { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
    File.WriteAllText(adConfigPath, json);
}

bool TryAdLogin(string username, string password, AdConfig cfg, out string? displayName, out List<string> groups)
{
    displayName = null;
    groups = new List<string>();
    if (!cfg.Enabled || string.IsNullOrEmpty(cfg.Server) || string.IsNullOrEmpty(cfg.Domain)) return false;

    try
    {
        var userPrincipal = $"{username}@{cfg.Domain}";
        var ldapServer = cfg.Server;
        var port = cfg.Port > 0 ? cfg.Port : (cfg.UseSsl ? 636 : 389);

        var ldapId = new LdapDirectoryIdentifier(ldapServer, port);
        var cred = new NetworkCredential(userPrincipal, password);
        using var conn = new LdapConnection(ldapId, cred, AuthType.Basic);
        conn.SessionOptions.ProtocolVersion = 3;
        if (cfg.UseSsl) conn.SessionOptions.SecureSocketLayer = true;
        conn.Bind(); // throws on bad creds

        // Search for user to get display name and groups
        var baseDn = cfg.BaseDn;
        if (string.IsNullOrEmpty(baseDn))
            baseDn = string.Join(",", cfg.Domain.Split('.').Select(p => $"DC={p}"));

        var filter = $"(&(objectClass=user)(sAMAccountName={username}))";
        var searchReq = new SearchRequest(baseDn, filter, SearchScope.Subtree, "displayName", "memberOf", "sAMAccountName");
        var searchRes = (SearchResponse)conn.SendRequest(searchReq);

        if (searchRes.Entries.Count > 0)
        {
            var entry = searchRes.Entries[0];
            if (entry.Attributes.Contains("displayName"))
                displayName = entry.Attributes["displayName"][0]?.ToString();
            if (entry.Attributes.Contains("memberOf"))
            {
                foreach (var g in entry.Attributes["memberOf"])
                {
                    var groupDn = g?.ToString() ?? "";
                    var cn = groupDn.Split(',').FirstOrDefault(p => p.StartsWith("CN=", StringComparison.OrdinalIgnoreCase));
                    if (cn != null) groups.Add(cn[3..]);
                }
            }
        }

        // Check required group
        if (!string.IsNullOrEmpty(cfg.RequiredGroup))
        {
            if (!groups.Any(g => g.Equals(cfg.RequiredGroup, StringComparison.OrdinalIgnoreCase)))
                return false;
        }

        return true;
    }
    catch
    {
        return false;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────

string GenerateToken(string username, string? displayName = null, string role = "User")
{
    var claims = new List<Claim> {
        new(ClaimTypes.Name, username),
        new(ClaimTypes.Role, role),
        new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
    };
    if (!string.IsNullOrEmpty(displayName))
        claims.Add(new Claim("displayName", displayName));
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
    // Try AD first
    var adCfg = LoadAdConfig();
    if (adCfg.Enabled)
    {
        if (TryAdLogin(req.Username, req.Password, adCfg, out var displayName, out var groups))
        {
            var role = groups.Any(g => g.Equals(adCfg.AdminGroup, StringComparison.OrdinalIgnoreCase)) ? "Admin" : "User";
            return Results.Ok(new { token = GenerateToken(req.Username, displayName, role), username = req.Username, displayName, role, source = "ad" });
        }
    }

    // Fallback to local admin
    if (adCfg.AllowLocalFallback || !adCfg.Enabled)
    {
        if (req.Username == "admin" && req.Password == "admin")
            return Results.Ok(new { token = GenerateToken(req.Username, "Administrator", "Admin"), username = req.Username, displayName = "Administrator", role = "Admin", source = "local" });
    }

    return Results.Unauthorized();
});

// ── AD Config endpoints ──────────────────────────────────────────────────

app.MapGet("/api/settings/ad", () =>
{
    var cfg = LoadAdConfig();
    // Don't return bind password
    return Results.Ok(new
    {
        cfg.Enabled,
        cfg.Server,
        cfg.Port,
        cfg.UseSsl,
        cfg.Domain,
        cfg.BaseDn,
        cfg.RequiredGroup,
        cfg.AdminGroup,
        cfg.AllowLocalFallback,
        cfg.BindUser,
        hasBindPassword = !string.IsNullOrEmpty(cfg.BindPassword)
    });
}).RequireAuthorization();

app.MapPost("/api/settings/ad", (AdConfigRequest req) =>
{
    var cfg = new AdConfig
    {
        Enabled = req.Enabled,
        Server = req.Server ?? "",
        Port = req.Port,
        UseSsl = req.UseSsl,
        Domain = req.Domain ?? "",
        BaseDn = req.BaseDn ?? "",
        RequiredGroup = req.RequiredGroup ?? "",
        AdminGroup = req.AdminGroup ?? "",
        AllowLocalFallback = req.AllowLocalFallback,
        BindUser = req.BindUser ?? "",
        BindPassword = req.BindPassword ?? ""
    };
    // Preserve old bind password if not provided
    if (string.IsNullOrEmpty(cfg.BindPassword))
    {
        var old = LoadAdConfig();
        cfg.BindPassword = old.BindPassword;
    }
    SaveAdConfig(cfg);
    return Results.Ok(new { success = true, message = "AD configuration saved" });
}).RequireAuthorization();

app.MapPost("/api/settings/ad/test", (LoginRequest req) =>
{
    var adCfg = LoadAdConfig();
    if (!adCfg.Enabled)
        return Results.Ok(new { success = false, message = "AD is not enabled" });

    if (TryAdLogin(req.Username, req.Password, adCfg, out var displayName, out var groups))
        return Results.Ok(new { success = true, message = $"Login successful as {displayName ?? req.Username}", displayName, groups });

    return Results.Ok(new { success = false, message = "AD login failed. Check credentials and AD configuration." });
}).RequireAuthorization();

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

app.MapGet("/api/dashboard/stats", async () =>
{
    try
    {
        // Get recently-active instance IDs (data received within 24h)
        var activeIds = new HashSet<int>();
        try
        {
            var activeRows = await QueryAsync(@"
                SELECT DISTINCT InstanceID FROM dbo.CollectionDates
                WHERE SnapshotDate > DATEADD(hour, -24, GETUTCDATE())");
            foreach (var r in activeRows)
                if (r.TryGetValue("InstanceID", out var v) && v != null)
                    activeIds.Add(Convert.ToInt32(v));
        }
        catch { }

        // Status counts from Summary_Get, filtered to active instances
        var summary = await SpAsync("dbo.Summary_Get");
        var activeSummary = activeIds.Count > 0
            ? summary.Where(r => r.TryGetValue("InstanceID", out var v) && v != null && activeIds.Contains(Convert.ToInt32(v))).ToList()
            : summary;
        int totalInstances = activeSummary.Count;
        int healthy = 0, warning = 0, critical = 0;
        foreach (var row in activeSummary)
        {
            var statusKeys = new[] { "FullBackupStatus", "DriveStatus", "JobStatus", "AGStatus",
                "CorruptionStatus", "LastGoodCheckDBStatus", "LogBackupStatus" };
            int worst = 1;
            foreach (var k in statusKeys)
            {
                if (row.TryGetValue(k, out var v) && v != null)
                {
                    var val = Convert.ToInt32(v);
                    if (val == 4) { worst = 4; break; }
                    if (val == 2 && worst < 2) worst = 2;
                }
            }
            if (worst == 4) critical++;
            else if (worst == 2) warning++;
            else healthy++;
        }

        // Total databases (only from recently-active instances)
        int totalDatabases = 0;
        try
        {
            var dbCount = await QueryAsync(@"
                SELECT COUNT(*) AS Cnt FROM dbo.Databases d
                WHERE d.IsActive=1
                  AND d.InstanceID IN (SELECT DISTINCT InstanceID FROM dbo.CollectionDates WHERE SnapshotDate > DATEADD(hour,-24,GETUTCDATE()))");
            if (dbCount.Count > 0) totalDatabases = Convert.ToInt32(dbCount[0]["Cnt"]);
        }
        catch { }

        // Failed jobs 24h count (only from recently-active instances)
        int failedJobs24h = 0;
        try
        {
            var fjCount = await QueryAsync(@"
                SELECT COUNT(*) AS Cnt FROM dbo.JobHistory
                WHERE run_status=0 AND RunDateTime > DATEADD(hour,-24,GETUTCDATE())
                  AND InstanceID IN (SELECT DISTINCT InstanceID FROM dbo.CollectionDates WHERE SnapshotDate > DATEADD(hour,-24,GETUTCDATE()))");
            if (fjCount.Count > 0) failedJobs24h = Convert.ToInt32(fjCount[0]["Cnt"]);
        }
        catch { }

        // Top 10 CPU
        List<object> top10Cpu = new();
        try
        {
            var cpuData = await QueryAsync(@"
                SELECT TOP 10 c.InstanceID, i.InstanceDisplayName, AVG(CAST(c.SQLProcessCPU AS FLOAT)) AS AvgCpu
                FROM dbo.CPU c
                JOIN dbo.Instances i ON c.InstanceID = i.InstanceID
                WHERE c.EventTime > DATEADD(hour,-1,GETUTCDATE())
                  AND c.InstanceID IN (SELECT DISTINCT InstanceID FROM dbo.CollectionDates WHERE SnapshotDate > DATEADD(hour,-24,GETUTCDATE()))
                GROUP BY c.InstanceID, i.InstanceDisplayName
                ORDER BY AVG(CAST(c.SQLProcessCPU AS FLOAT)) DESC");
            foreach (var r in cpuData)
                top10Cpu.Add(new { instanceId = r["InstanceID"], instanceName = r["InstanceDisplayName"], avgCpu = Math.Round(Convert.ToDouble(r["AvgCpu"]), 1) });
        }
        catch { }

        // Top 10 largest databases
        List<object> top10LargestDbs = new();
        try
        {
            var dbData = await QueryAsync(@"
                SELECT TOP 10 d.name AS DatabaseName, i.InstanceDisplayName,
                       SUM(CAST(f.size AS BIGINT)) * 8 / 1024 AS SizeMB
                FROM dbo.Databases d
                JOIN dbo.Instances i ON d.InstanceID = i.InstanceID
                JOIN dbo.DBFiles f ON d.DatabaseID = f.DatabaseID
                WHERE d.IsActive = 1
                GROUP BY d.name, i.InstanceDisplayName
                ORDER BY SUM(CAST(f.size AS BIGINT)) DESC");
            foreach (var r in dbData)
                top10LargestDbs.Add(new { instanceName = r["InstanceDisplayName"], databaseName = r["DatabaseName"], sizeMb = r["SizeMB"] });
        }
        catch
        {
            try
            {
                var dbData = await QueryAsync(@"
                    SELECT TOP 10 d.name AS DatabaseName, i.InstanceDisplayName,
                           SUM(CAST(f.size AS BIGINT)) * 8 / 1024 AS SizeMB
                    FROM dbo.Databases d
                    JOIN dbo.Instances i ON d.InstanceID = i.InstanceID
                    JOIN dbo.DatabaseFiles f ON d.DatabaseID = f.DatabaseID
                    WHERE d.IsActive = 1
                    GROUP BY d.name, i.InstanceDisplayName
                    ORDER BY SUM(CAST(f.size AS BIGINT)) DESC");
                foreach (var r in dbData)
                    top10LargestDbs.Add(new { instanceName = r["InstanceDisplayName"], databaseName = r["DatabaseName"], sizeMb = r["SizeMB"] });
            }
            catch { }
        }

        // Recent alerts
        List<Dictionary<string, object?>> recentAlerts = new();
        try
        {
            recentAlerts = await QueryAsync(@"
                SELECT TOP 10 InstanceID, ErrorDate, ErrorMessage, ErrorContext
                FROM dbo.CollectionErrorLog ORDER BY ErrorDate DESC");
        }
        catch { }

        // Failed jobs detail
        List<Dictionary<string, object?>> failedJobs = new();
        try
        {
            failedJobs = await QueryAsync(@"
                SELECT TOP 10 jh.job_id, jh.step_name, jh.RunDateTime, jh.message,
                       jh.InstanceID, i.InstanceDisplayName
                FROM dbo.JobHistory jh
                JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
                WHERE jh.run_status = 0 AND jh.RunDateTime > DATEADD(hour,-24,GETUTCDATE())
                ORDER BY jh.RunDateTime DESC");
        }
        catch { }

        return Results.Ok(new
        {
            totalInstances,
            healthy,
            warning,
            critical,
            totalDatabases,
            failedJobs24h,
            top10Cpu,
            top10LargestDbs,
            recentAlerts,
            failedJobs
        });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message });
    }
}).RequireAuthorization();

app.MapGet("/api/instances", async () =>
{
    try
    {
        var instances = await QueryAsync(@"
            SELECT i.InstanceID, i.Instance, i.ConnectionID, i.IsActive, i.Edition, 
                   i.ProductVersion, i.cpu_count, i.physical_memory_kb, i.sqlserver_start_time,
                   i.InstanceDisplayName, i.ShowInSummary, cd.LastCollected
            FROM dbo.Instances i
            OUTER APPLY (
                SELECT MAX(SnapshotDate) AS LastCollected
                FROM dbo.CollectionDates c WHERE c.InstanceID = i.InstanceID
            ) cd
            WHERE i.IsActive = 1
              AND cd.LastCollected > DATEADD(hour, -24, GETUTCDATE())
            ORDER BY i.InstanceDisplayName");
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
                   i.InstanceDisplayName, i.Alias, cd.LastCollected
            FROM dbo.Instances i
            OUTER APPLY (
                SELECT MAX(SnapshotDate) AS LastCollected
                FROM dbo.CollectionDates c WHERE c.InstanceID = i.InstanceID
            ) cd
            WHERE i.InstanceID = @id", ("@id", id));
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

app.MapGet("/api/performance/memory", async (int? instanceId) =>
{
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
            WHERE mu.SnapshotDate > DATEADD(hour,-24,GETUTCDATE()) {filter}
            ORDER BY mu.pages_kb DESC";
        clerks = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value));
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
              AND pc.SnapshotDate > DATEADD(hour,-24,GETUTCDATE()) {filter}
            ORDER BY pc.SnapshotDate DESC";
        counters = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value));
    }
    catch (Exception ex)
    {
        counterNote = $"PerformanceCounters not found: {ex.Message}";
    }

    return Results.Ok(new { clerks, counters, clerkNote, counterNote });
}).RequireAuthorization();

// ── Performance: IO ──────────────────────────────────────────────────────

app.MapGet("/api/performance/io", async (int? instanceId) =>
{
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
            WHERE ios.SnapshotDate > DATEADD(hour,-24,GETUTCDATE()) {filter}
            ORDER BY (ios.io_stall_read_ms + ios.io_stall_write_ms) DESC";
        fileStats = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value));
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
            WHERE dp.SnapshotDate > DATEADD(hour,-24,GETUTCDATE()) {filter}
            ORDER BY dp.SnapshotDate DESC";
        drivePerf = await QueryAsync(sql, ("@instanceId", instanceId ?? (object)DBNull.Value));
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

app.MapGet("/api/dashboard/performance-summary", async () =>
{
    var connStr = app.Configuration.GetConnectionString("DBADashDB");
    try
    {
        using var conn = new SqlConnection(connStr);
        await conn.OpenAsync();
        
        var sql = @"
        ;WITH LatestCPU AS (
            SELECT c.InstanceID,
                   AVG(c.SQLProcessCPU) as AvgCPU,
                   MAX(c.MaxSQLProcessCPU) as MaxCPU,
                   MAX(c.MaxTotalCPU) as MaxTotalCPU
            FROM dbo.CPU c
            WHERE c.EventTime > DATEADD(minute,-10,GETUTCDATE())
            GROUP BY c.InstanceID
        ),
        LatestIO AS (
            SELECT io.InstanceID,
                   MAX(io.MaxReadLatency) as ReadLatency,
                   MAX(io.MaxWriteLatency) as WriteLatency,
                   SUM(io.MaxMBsec) as MBsec,
                   SUM(io.MaxIOPs) as IOPs
            FROM dbo.DBIOStats io
            WHERE io.SnapshotDate > DATEADD(minute,-10,GETUTCDATE())
              AND io.Drive = '*' AND io.FileID = -1
            GROUP BY io.InstanceID
        ),
        LatestWaits AS (
            SELECT w.InstanceID,
                   SUM(CASE WHEN wt.IsCriticalWait=1 THEN w.wait_time_ms ELSE 0 END) as CriticalWaitMs,
                   SUM(CASE WHEN wt.WaitType LIKE 'LCK%' THEN w.wait_time_ms ELSE 0 END) as LockWaitMs,
                   SUM(CASE WHEN wt.WaitType LIKE 'PAGEIO%' OR wt.WaitType LIKE 'IO_%' OR wt.WaitType LIKE 'WRITELOG%' THEN w.wait_time_ms ELSE 0 END) as IOWaitMs,
                   SUM(w.wait_time_ms) as TotalWaitMs,
                   CASE WHEN SUM(w.wait_time_ms)>0 THEN SUM(w.signal_wait_time_ms)*100.0/SUM(w.wait_time_ms) ELSE 0 END as SignalWaitPct,
                   SUM(CASE WHEN wt.WaitType LIKE 'LATCH%' THEN w.wait_time_ms ELSE 0 END) as LatchWaitMs
            FROM dbo.Waits w
            JOIN dbo.WaitType wt ON w.WaitTypeID = wt.WaitTypeID
            WHERE w.SnapshotDate > DATEADD(minute,-10,GETUTCDATE())
              AND wt.IsExcluded = 0
            GROUP BY w.InstanceID
        )
        SELECT i.InstanceID, i.InstanceDisplayName,
               COALESCE(cpu.AvgCPU, 0) as AvgCPU,
               COALESCE(cpu.MaxCPU, 0) as MaxCPU,
               COALESCE(cpu.MaxTotalCPU, 0) as MaxTotalCPU,
               COALESCE(wt.CriticalWaitMs, 0) as CriticalWaitMs,
               COALESCE(wt.LockWaitMs, 0) as LockWaitMs,
               COALESCE(wt.IOWaitMs, 0) as IOWaitMs,
               COALESCE(wt.TotalWaitMs, 0) as TotalWaitMs,
               ROUND(COALESCE(wt.SignalWaitPct, 0), 1) as SignalWaitPct,
               COALESCE(wt.LatchWaitMs, 0) as LatchWaitMs,
               ROUND(COALESCE(io.ReadLatency, 0), 2) as ReadLatency,
               ROUND(COALESCE(io.WriteLatency, 0), 2) as WriteLatency,
               ROUND(COALESCE(io.MBsec, 0), 2) as MBsec,
               ROUND(COALESCE(io.IOPs, 0), 1) as IOPs
        FROM dbo.Instances i
        LEFT JOIN LatestCPU cpu ON i.InstanceID = cpu.InstanceID
        LEFT JOIN LatestIO io ON i.InstanceID = io.InstanceID
        LEFT JOIN LatestWaits wt ON i.InstanceID = wt.InstanceID
        WHERE i.IsActive = 1
        ORDER BY i.InstanceDisplayName";

        using var cmd = new SqlCommand(sql, conn);
        cmd.CommandTimeout = 30;
        using var r = await cmd.ExecuteReaderAsync();
        var list = new List<object>();
        while (await r.ReadAsync())
        {
            var dict = new Dictionary<string, object?>();
            for (int i2 = 0; i2 < r.FieldCount; i2++)
                dict[char.ToLowerInvariant(r.GetName(i2)[0]) + r.GetName(i2).Substring(1)] = r.IsDBNull(i2) ? null : r.GetValue(i2);
            list.Add(dict);
        }
        return Results.Ok(new { data = list, note = "" });
    }
    catch (Exception ex) { return Results.Ok(new { data = Array.Empty<object>(), note = ex.Message }); }
}).RequireAuthorization();

app.MapGet("/api/settings/thresholds", () =>
{
    var path = Path.Combine(AppContext.BaseDirectory, "config", "thresholds.json");
    if (!System.IO.File.Exists(path))
        return Results.Ok(new { thresholds = new Dictionary<string, object>() });
    var json = System.IO.File.ReadAllText(path);
    return Results.Ok(System.Text.Json.JsonSerializer.Deserialize<object>(json));
}).RequireAuthorization();

app.MapPost("/api/settings/thresholds", async (HttpContext ctx) =>
{
    using var reader = new StreamReader(ctx.Request.Body);
    var body = await reader.ReadToEndAsync();
    var dir = Path.Combine(AppContext.BaseDirectory, "config");
    Directory.CreateDirectory(dir);
    System.IO.File.WriteAllText(Path.Combine(dir, "thresholds.json"), body);
    return Results.Ok(new { success = true });
}).RequireAuthorization();

// SPA fallback — serve index.html for all non-API routes
app.MapFallbackToFile("index.html");

app.Run();

// ── Records ──────────────────────────────────────────────────────────────

record LoginRequest(
    [property: System.Text.Json.Serialization.JsonPropertyName("username")] string Username,
    [property: System.Text.Json.Serialization.JsonPropertyName("password")] string Password);

record AdConfigRequest(
    [property: System.Text.Json.Serialization.JsonPropertyName("enabled")] bool Enabled,
    [property: System.Text.Json.Serialization.JsonPropertyName("server")] string? Server,
    [property: System.Text.Json.Serialization.JsonPropertyName("port")] int Port,
    [property: System.Text.Json.Serialization.JsonPropertyName("useSsl")] bool UseSsl,
    [property: System.Text.Json.Serialization.JsonPropertyName("domain")] string? Domain,
    [property: System.Text.Json.Serialization.JsonPropertyName("baseDn")] string? BaseDn,
    [property: System.Text.Json.Serialization.JsonPropertyName("requiredGroup")] string? RequiredGroup,
    [property: System.Text.Json.Serialization.JsonPropertyName("adminGroup")] string? AdminGroup,
    [property: System.Text.Json.Serialization.JsonPropertyName("allowLocalFallback")] bool AllowLocalFallback,
    [property: System.Text.Json.Serialization.JsonPropertyName("bindUser")] string? BindUser,
    [property: System.Text.Json.Serialization.JsonPropertyName("bindPassword")] string? BindPassword);

class AdConfig
{
    public bool Enabled { get; set; }
    public string Server { get; set; } = "";
    public int Port { get; set; } = 389;
    public bool UseSsl { get; set; }
    public string Domain { get; set; } = "";
    public string BaseDn { get; set; } = "";
    public string RequiredGroup { get; set; } = "";
    public string AdminGroup { get; set; } = "";
    public bool AllowLocalFallback { get; set; } = true;
    public string BindUser { get; set; } = "";
    public string BindPassword { get; set; } = "";
}

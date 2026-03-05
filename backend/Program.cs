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

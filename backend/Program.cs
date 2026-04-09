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

static int WorstSummaryStatus(Dictionary<string, object?>? row, string[] keys)
{
    var worst = 4; // OK in DBADashStatusEnum
    if (row == null) return worst;
    foreach (var k in keys)
    {
        if (!row.TryGetValue(k, out var v) || v == null) continue;
        var val = Convert.ToInt32(v);
        if (val == 3) continue; // N/A
        if (val < worst) worst = val;
    }
    return worst;
}

static void AppendActiveSummaryAlerts(Dictionary<string, object?>? sum, List<string> target)
{
    if (sum == null) return;
    foreach (var (key, label) in SummaryStatusKeys.CheckAlertLabels)
    {
        if (!sum.TryGetValue(key, out var v) || v == null) continue;
        var val = Convert.ToInt32(v);
        if (val == 1 || val == 2) target.Add(label);
    }
}

static int ClampLimit(int? requested, int defaultValue, int maxValue) =>
    requested is > 0 ? Math.Min(requested.Value, maxValue) : defaultValue;

static int ClampOffset(int? requested) =>
    requested is >= 0 ? requested.Value : 0;

async Task<List<Dictionary<string, object?>>> QueryAsync(string sql, int commandTimeoutSeconds = 30, params (string name, object? value)[] parameters)
{
    using var conn = new SqlConnection(connStr);
    await conn.OpenAsync();
    using var cmd = new SqlCommand(sql, conn);
    cmd.CommandTimeout = commandTimeoutSeconds;
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

async Task<List<Dictionary<string, object?>>> SpAsync(string sp, int commandTimeoutSeconds = 30, params (string name, object? value)[] parameters)
{
    using var conn = new SqlConnection(connStr);
    await conn.OpenAsync();
    using var cmd = new SqlCommand(sp, conn) { CommandType = CommandType.StoredProcedure, CommandTimeout = commandTimeoutSeconds };
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
        var data = await SpAsync("dbo.Summary_Get", 120);
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
        var summary = await SpAsync("dbo.Summary_Get", 120);
        var activeSummary = activeIds.Count > 0
            ? summary.Where(r => r.TryGetValue("InstanceID", out var v) && v != null && activeIds.Contains(Convert.ToInt32(v))).ToList()
            : summary;
        int totalInstances = activeSummary.Count;
        int healthy = 0, warning = 0, critical = 0;
        foreach (var row in activeSummary)
        {
            // DBA Dash enum: Critical=1, Warning=2, NA=3, OK=4, Acknowledged=5
            var worst = WorstSummaryStatus(row, SummaryStatusKeys.ColumnKeys);
            if (worst == 1) critical++;
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

app.MapGet("/api/instances", async (bool all = false) =>
{
    try
    {
        var recencyFilter = all ? "" : "AND cd.LastCollected > DATEADD(hour, -24, GETUTCDATE())";
        var instances = await QueryAsync($@"
            SELECT i.InstanceID, i.Instance, i.ConnectionID, i.IsActive, i.Edition, 
                   i.ProductVersion, i.ProductMajorVersion, i.cpu_count, i.physical_memory_kb, i.sqlserver_start_time,
                   i.InstanceDisplayName, i.ShowInSummary, cd.LastCollected
            FROM dbo.Instances i
            OUTER APPLY (
                SELECT MAX(SnapshotDate) AS LastCollected
                FROM dbo.CollectionDates c WHERE c.InstanceID = i.InstanceID
            ) cd
            WHERE i.IsActive = 1
              {recencyFilter}
            ORDER BY i.InstanceDisplayName", 60);
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
            WHERE i.InstanceID = @id", 30, ("@id", id));
        if (inst.Count == 0) return Results.NotFound();

        List<Dictionary<string, object?>>? summary = null;
        try { summary = await SpAsync("dbo.Summary_Get", 120); } catch { }
        var instanceSummary = summary?.FirstOrDefault(s =>
            s.ContainsKey("InstanceID") && Convert.ToInt32(s["InstanceID"]) == id);

        return Results.Ok(new { instance = inst[0], summary = instanceSummary });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message });
    }
}).RequireAuthorization();

app.MapGet("/api/instances/{id:int}/cpu", async (int id, int? hours) =>
{
    var h = Math.Min(hours ?? 24, 336);
    try
    {
        // ~1 sample/minute typical; cap rows for chart performance (full range still bounded by hours)
        var maxPoints = Math.Min(h * 60 + 120, 100_000);
        var data = await QueryAsync($@"
            SELECT TOP ({maxPoints}) EventTime, SQLProcessCPU, SystemIdleCPU,
                   (100 - SQLProcessCPU - SystemIdleCPU) AS OtherCPU,
                   (100 - SystemIdleCPU) AS TotalCPU
            FROM dbo.CPU WHERE InstanceID = @id AND EventTime > DATEADD(hour, -@hours, GETUTCDATE())
            ORDER BY EventTime DESC", 120, ("@id", id), ("@hours", h));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/instances/{id:int}/waits", async (int id, int? hours, int? top) =>
{
    var h = Math.Min(hours ?? 24, 336);
    var topN = ClampLimit(top, 200, 5000);
    try
    {
        var data = await QueryAsync($@"
            SELECT TOP ({topN}) w.WaitTypeID, wt.WaitType, 
                   SUM(w.wait_time_ms) as TotalWaitMs,
                   SUM(w.waiting_tasks_count) as TotalWaitCount,
                   SUM(w.signal_wait_time_ms) as TotalSignalWaitMs
            FROM dbo.Waits w
            LEFT JOIN dbo.WaitType wt ON w.WaitTypeID = wt.WaitTypeID
            WHERE w.InstanceID = @id AND w.SnapshotDate > DATEADD(hour, -@hours, GETUTCDATE())
            GROUP BY w.WaitTypeID, wt.WaitType
            ORDER BY SUM(w.wait_time_ms) DESC", 120, ("@id", id), ("@hours", h));
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
            FROM dbo.Drives WHERE InstanceID = @id", 30, ("@id", id));
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
            SELECT d.DatabaseID, d.name, d.state, d.recovery_model, d.LastGoodCheckDbTime, d.IsActive,
                   h.is_primary_replica, h.synchronization_state, h.synchronization_health,
                   ag.name as ag_name
            FROM dbo.Databases d
            LEFT JOIN dbo.DatabasesHADR h ON d.DatabaseID = h.DatabaseID AND h.is_local = 1
            LEFT JOIN dbo.AvailabilityGroups ag ON h.group_id = ag.group_id AND ag.InstanceID = d.InstanceID
            WHERE d.InstanceID = @id AND d.IsActive = 1
            ORDER BY d.name", 30, ("@id", id));
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
            ORDER BY d.name, b.backup_start_date DESC", 30, ("@id", id));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/instances/{id:int}/jobs", async (int id, int? limit, int? offset) =>
{
    try
    {
        var take = ClampLimit(limit, 5000, 100_000);
        var skip = ClampOffset(offset);
        var data = await QueryAsync($@"
            SELECT job_id, step_id, step_name, run_status,
                   RunDateTime, RunDurationSec, message
            FROM dbo.JobHistory WHERE InstanceID = @id
            ORDER BY RunDateTime DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY", 120, ("@id", id), ("@skip", skip), ("@take", take));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/jobs/recent", async (int? limit, int? offset) =>
{
    try
    {
        var take = ClampLimit(limit, 2000, 50_000);
        var skip = ClampOffset(offset);
        var data = await QueryAsync($@"
            SELECT jh.job_id, jh.step_id, jh.step_name, jh.run_status,
                   jh.RunDateTime, jh.RunDurationSec, jh.message,
                   jh.InstanceID, i.InstanceDisplayName
            FROM dbo.JobHistory jh
            JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
            WHERE jh.step_id = 0
            ORDER BY jh.RunDateTime DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY", 120, ("@skip", skip), ("@take", take));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/jobs/failures", async (int? limit, int? offset) =>
{
    try
    {
        var take = ClampLimit(limit, 2000, 50_000);
        var skip = ClampOffset(offset);
        var data = await QueryAsync($@"
            SELECT jh.job_id, jh.step_id, jh.step_name, jh.run_status,
                   jh.RunDateTime, jh.RunDurationSec, jh.message,
                   jh.InstanceID, i.InstanceDisplayName
            FROM dbo.JobHistory jh
            JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
            WHERE jh.run_status = 0 AND jh.RunDateTime > DATEADD(hour, -24, GETUTCDATE())
            ORDER BY jh.RunDateTime DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY", 120, ("@skip", skip), ("@take", take));
        return Results.Ok(data);
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message, data = Array.Empty<object>() });
    }
}).RequireAuthorization();

app.MapGet("/api/alerts/recent", async (int? limit, int? offset) =>
{
    try
    {
        var take = ClampLimit(limit, 2000, 20_000);
        var skip = ClampOffset(offset);
        // Collection errors + failed job steps (48h), merged like DBA Dash alert feed
        var combined = await QueryAsync($@"
            ;WITH errors AS (
                SELECT e.InstanceID, 
                       COALESCE(i.InstanceDisplayName, i.Instance, CAST(e.InstanceID as VARCHAR)) as InstanceName,
                       e.ErrorDate, e.ErrorMessage, e.ErrorContext,
                       CAST('error' AS VARCHAR(32)) as AlertType
                FROM dbo.CollectionErrorLog e
                LEFT JOIN dbo.Instances i ON e.InstanceID = i.InstanceID
            ),
            jobFails AS (
                SELECT jh.InstanceID,
                       COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                       jh.RunDateTime as ErrorDate,
                       CONCAT('Job step failed: ', jh.step_name, ' - ', LEFT(CAST(jh.message AS VARCHAR(500)), 500)) as ErrorMessage,
                       jh.step_name as ErrorContext,
                       CAST('job_failure' AS VARCHAR(32)) as AlertType
                FROM dbo.JobHistory jh
                JOIN dbo.Instances i ON jh.InstanceID = i.InstanceID
                WHERE jh.run_status = 0 AND jh.RunDateTime > DATEADD(hour,-48,GETUTCDATE())
            ),
            merged AS (
                SELECT * FROM errors
                UNION ALL
                SELECT * FROM jobFails
            )
            SELECT InstanceID, InstanceName, ErrorDate, ErrorMessage, ErrorContext, AlertType
            FROM merged
            ORDER BY ErrorDate DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY", 120, ("@skip", skip), ("@take", take));
        return Results.Ok(combined);
    }
    catch
    {
        return Results.Ok(Array.Empty<object>());
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
            WHERE ag.InstanceID = @id", 30, ("@id", id));

        var replicas = await QueryAsync(@"
            SELECT ar.replica_id, ar.group_id, ar.replica_server_name, ar.endpoint_url,
                   ar.availability_mode_desc, ar.failover_mode_desc,
                   ar.primary_role_allow_connections_desc, ar.secondary_role_allow_connections_desc,
                   ar.backup_priority, ar.seeding_mode_desc, ar.session_timeout,
                   ar.read_only_routing_url
            FROM dbo.AvailabilityReplicas ar
            WHERE ar.group_id IN (
                SELECT ag.group_id FROM dbo.AvailabilityGroups ag WHERE ag.InstanceID = @id
            )", 30, ("@id", id));

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
            )", 30, ("@id", id));

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

app.MapGet("/api/instances/{id:int}/queries", async (int id, int? limit) =>
{
    try
    {
        var take = ClampLimit(limit, 200, 10_000);
        var data = await QueryAsync($@"
            SELECT TOP ({take}) qs.query_hash, qs.total_worker_time AS TotalCPU,
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

app.MapGet("/api/performance/running-queries", async (int? instanceId, int? limit, int? offset) =>
{
    try
    {
        var take = ClampLimit(limit, 2000, 50_000);
        var skip = ClampOffset(offset);
        var filter = instanceId.HasValue ? "AND rq.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT rq.*, i.InstanceDisplayName, d.name AS database_name
            FROM dbo.RunningQueries rq
            JOIN dbo.Instances i ON rq.InstanceID = i.InstanceID
            LEFT JOIN dbo.Databases d ON rq.database_id = d.database_id AND rq.InstanceID = d.InstanceID
            WHERE rq.SnapshotDateUTC > DATEADD(hour,-1,GETUTCDATE()) {filter}
            ORDER BY rq.SnapshotDateUTC DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY";
        var data = await QueryAsync(sql, 120, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@skip", skip), ("@take", take));
        return Results.Ok(new { data, note = "" });
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning("Running queries endpoint error: {Error}", ex.Message);
        return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
    }
}).RequireAuthorization();

// ── Performance: Blocking ────────────────────────────────────────────────

app.MapGet("/api/performance/blocking", async (int? instanceId, int? limit, int? offset) =>
{
    try
    {
        var take = ClampLimit(limit, 2000, 50_000);
        var skip = ClampOffset(offset);
        var filter = instanceId.HasValue ? "AND rq.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT rq.*, i.InstanceDisplayName
            FROM dbo.RunningQueries rq
            JOIN dbo.Instances i ON rq.InstanceID = i.InstanceID
            WHERE rq.SnapshotDateUTC > DATEADD(hour,-1,GETUTCDATE())
              AND (rq.blocking_session_id > 0
                   OR rq.session_id IN (SELECT blocking_session_id FROM dbo.RunningQueries WHERE blocking_session_id > 0 AND SnapshotDateUTC > DATEADD(hour,-1,GETUTCDATE())))
              {filter}
            ORDER BY rq.SnapshotDateUTC DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY";
        var data = await QueryAsync(sql, 120, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@skip", skip), ("@take", take));
        return Results.Ok(new { data, note = "" });
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning("Blocking endpoint error: {Error}", ex.Message);
        return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
    }
}).RequireAuthorization();

// ── Performance: Slow Queries ────────────────────────────────────────────

app.MapGet("/api/performance/slow-queries", async (int? instanceId, int? hours, int? limit, int? offset) =>
{
    var h = hours ?? 24;
    try
    {
        var take = ClampLimit(limit, 2000, 50_000);
        var skip = ClampOffset(offset);
        var filter = instanceId.HasValue ? "AND sq.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT sq.*, i.InstanceDisplayName, d.name AS database_name
            FROM dbo.SlowQueries sq
            JOIN dbo.Instances i ON sq.InstanceID = i.InstanceID
            LEFT JOIN dbo.Databases d ON sq.DatabaseID = d.DatabaseID AND sq.InstanceID = d.InstanceID
            WHERE sq.timestamp > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY sq.duration DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY";
        var data = await QueryAsync(sql, 120, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@hours", h), ("@skip", skip), ("@take", take));
        return Results.Ok(new { data, note = "" });
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning("Slow queries endpoint error: {Error}", ex.Message);
        return Results.Ok(new { data = Array.Empty<object>(), note = $"Table not found: {ex.Message}" });
    }
}).RequireAuthorization();

// ── Performance: Memory ──────────────────────────────────────────────────

app.MapGet("/api/performance/memory", async (int? instanceId, int? hours, int? limit) =>
{
    var h = Math.Min(hours ?? 24, 336);
    var take = ClampLimit(limit, 5000, 100_000);
    var clerks = Array.Empty<object>() as object;
    var counters = Array.Empty<object>() as object;
    var clerkNote = "";
    var counterNote = "";

    // Memory clerk stats
    try
    {
        var filter = instanceId.HasValue ? "AND mu.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT mu.InstanceID, i.InstanceDisplayName, mct.MemoryClerkType AS clerk_type,
                   mct.MemoryClerkDescription AS clerk_name, mu.pages_kb, mu.SnapshotDate
            FROM dbo.MemoryUsage mu
            JOIN dbo.Instances i ON mu.InstanceID = i.InstanceID
            JOIN dbo.MemoryClerkType mct ON mu.MemoryClerkTypeID = mct.MemoryClerkTypeID
            WHERE mu.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY mu.pages_kb DESC
            OFFSET 0 ROWS FETCH NEXT @take ROWS ONLY";
        clerks = await QueryAsync(sql, 120, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@hours", h), ("@take", take));
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
            SELECT pc.InstanceID, i.InstanceDisplayName, c.counter_name, pc.Value AS cntr_value, pc.SnapshotDate
            FROM dbo.PerformanceCounters pc
            JOIN dbo.Instances i ON pc.InstanceID = i.InstanceID
            JOIN dbo.Counters c ON pc.CounterID = c.CounterID
            WHERE c.object_name LIKE '%Memory%'
              AND pc.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY pc.SnapshotDate DESC
            OFFSET 0 ROWS FETCH NEXT @take ROWS ONLY";
        counters = await QueryAsync(sql, 120, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@hours", h), ("@take", take));
    }
    catch (Exception ex)
    {
        counterNote = $"PerformanceCounters not found: {ex.Message}";
    }

    return Results.Ok(new { clerks, counters, clerkNote, counterNote });
}).RequireAuthorization();

// ── Performance: IO ──────────────────────────────────────────────────────

app.MapGet("/api/performance/io", async (int? instanceId, int? hours, int? limit) =>
{
    var h = Math.Min(hours ?? 24, 336);
    var take = ClampLimit(limit, 5000, 100_000);
    var fileStats = Array.Empty<object>() as object;
    var drivePerf = Array.Empty<object>() as object;
    var fileNote = "";
    var driveNote = "";

    // File IO stats
    try
    {
        var filter = instanceId.HasValue ? "AND ios.InstanceID = @instanceId" : "";
        var sql = $@"
            SELECT ios.InstanceID, i.InstanceDisplayName, d.name AS database_name, df.name AS file_name,
                   ios.io_stall_read_ms, ios.io_stall_write_ms, ios.num_of_reads, ios.num_of_writes,
                   ios.num_of_bytes_read, ios.num_of_bytes_written, ios.SnapshotDate
            FROM dbo.DBIOStats ios
            JOIN dbo.Instances i ON ios.InstanceID = i.InstanceID
            JOIN dbo.DBFiles df ON ios.FileID = df.FileID
            JOIN dbo.Databases d ON df.DatabaseID = d.DatabaseID
            WHERE ios.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY (ios.io_stall_read_ms + ios.io_stall_write_ms) DESC
            OFFSET 0 ROWS FETCH NEXT @take ROWS ONLY";
        fileStats = await QueryAsync(sql, 120, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@hours", h), ("@take", take));
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
            SELECT dp.*, i.InstanceDisplayName
            FROM dbo.DriveSnapshot dp
            JOIN dbo.Instances i ON dp.InstanceID = i.InstanceID
            WHERE dp.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY dp.SnapshotDate DESC
            OFFSET 0 ROWS FETCH NEXT @take ROWS ONLY";
        drivePerf = await QueryAsync(sql, 120, ("@instanceId", instanceId ?? (object)DBNull.Value), ("@hours", h), ("@take", take));
    }
    catch (Exception ex)
    {
        driveNote = $"DriveSnapshot not found: {ex.Message}";
    }

    return Results.Ok(new { fileStats, drivePerf, fileNote, driveNote });
}).RequireAuthorization();

// ── Exec Stats ───────────────────────────────────────────────────────────
app.MapGet("/api/performance/exec-stats", async (int? instanceId, int? hours, int? limit, int? offset) =>
{
    var h = hours ?? 24;
    var take = ClampLimit(limit, 5000, 100_000);
    var skip = ClampOffset(offset);
    var data = Array.Empty<object>() as object;
    var note = "";
    var filter = instanceId.HasValue ? "AND os.InstanceID = @instanceId" : "";

    try
    {
        var sql = $@"
            SELECT os.InstanceID, i.InstanceDisplayName, dbo_obj.ObjectName AS object_name, dbo_obj.SchemaName,
                   os.execution_count, os.total_worker_time, os.total_elapsed_time,
                   os.total_logical_reads, os.total_logical_writes, os.total_physical_reads, os.SnapshotDate
            FROM dbo.ObjectExecutionStats os
            JOIN dbo.Instances i ON os.InstanceID=i.InstanceID
            JOIN dbo.DBObjects dbo_obj ON os.ObjectID=dbo_obj.ObjectID
            WHERE os.SnapshotDate > DATEADD(hour,-@hours,GETUTCDATE()) {filter}
            ORDER BY os.total_worker_time DESC
            OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY";
        data = await QueryAsync(sql, 120, ("@hours", h), ("@instanceId", instanceId ?? (object)DBNull.Value), ("@skip", skip), ("@take", take));
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
        data = await QueryAsync(sql, 120, ("@instanceId", instanceId.Value), ("@hours", h));
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
        data = await QueryAsync(sql, 120, ("@instanceId", instanceId.Value), ("@hours", h));
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
        data = await QueryAsync(sql, 120, ("@instanceId", instanceId.Value), ("@hours", h));
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
        data = await QueryAsync(sql, 120, ("@instanceId", instanceId.Value));
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
        data = await QueryAsync(sql, 120, ("@instanceId", instanceId.Value), ("@days", d));
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

        // Step 1: Get all active instances
        var instances = new List<Dictionary<string, object?>>();
        using (var cmd = new SqlCommand("SELECT InstanceID, COALESCE(InstanceDisplayName, Instance) as Name FROM dbo.Instances WHERE IsActive=1 ORDER BY COALESCE(InstanceDisplayName, Instance)", conn))
        {
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                instances.Add(new Dictionary<string, object?> { ["instanceID"] = r.GetInt32(0), ["instanceDisplayName"] = r.GetString(1) });
        }

        // Step 2: CPU (last 60 min for reliability with collection gaps)
        var cpuData = new Dictionary<int, (double avg, int max, int maxTotal)>();
        try
        {
            using var cmd = new SqlCommand(@"SELECT InstanceID, AVG(SQLProcessCPU) as AvgCPU, MAX(MaxSQLProcessCPU) as MaxCPU, MAX(MaxTotalCPU) as MaxTotal FROM dbo.CPU WHERE EventTime > DATEADD(hour,-1,GETUTCDATE()) GROUP BY InstanceID", conn);
            cmd.CommandTimeout = 30;
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                cpuData[r.GetInt32(0)] = (r.IsDBNull(1) ? 0 : Convert.ToDouble(r[1]), r.IsDBNull(2) ? 0 : Convert.ToInt32(r[2]), r.IsDBNull(3) ? 0 : Convert.ToInt32(r[3]));
        }
        catch { /* CPU table might differ */ }

        // Step 3: IO (aggregate across all drives/files per instance)
        var ioData = new Dictionary<int, (double readLat, double writeLat, double mbSec, double iops)>();
        try
        {
            using var cmd = new SqlCommand(@"SELECT InstanceID, MAX(MaxReadLatency) as RL, MAX(MaxWriteLatency) as WL, SUM(MaxMBsec) as MB, SUM(MaxIOPs) as IO FROM dbo.DBIOStats WHERE SnapshotDate > DATEADD(hour,-1,GETUTCDATE()) GROUP BY InstanceID", conn);
            cmd.CommandTimeout = 30;
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                ioData[r.GetInt32(0)] = (r.IsDBNull(1) ? 0 : Convert.ToDouble(r[1]), r.IsDBNull(2) ? 0 : Convert.ToDouble(r[2]), r.IsDBNull(3) ? 0 : Convert.ToDouble(r[3]), r.IsDBNull(4) ? 0 : Convert.ToDouble(r[4]));
        }
        catch { /* IO table might differ */ }

        // Step 4: Waits
        var waitData = new Dictionary<int, (long critical, long lockW, long ioW, long total, double signal, long latch)>();
        try
        {
            using var cmd = new SqlCommand(@"
                SELECT w.InstanceID,
                    SUM(CASE WHEN wt.IsCriticalWait=1 THEN w.wait_time_ms ELSE 0 END),
                    SUM(CASE WHEN wt.WaitType LIKE 'LCK%' THEN w.wait_time_ms ELSE 0 END),
                    SUM(CASE WHEN wt.WaitType LIKE 'PAGEIO%' OR wt.WaitType LIKE 'IO_%' OR wt.WaitType LIKE 'WRITELOG%' THEN w.wait_time_ms ELSE 0 END),
                    SUM(w.wait_time_ms),
                    CASE WHEN SUM(w.wait_time_ms)>0 THEN SUM(w.signal_wait_time_ms)*100.0/SUM(w.wait_time_ms) ELSE 0 END,
                    SUM(CASE WHEN wt.WaitType LIKE 'LATCH%' THEN w.wait_time_ms ELSE 0 END)
                FROM dbo.Waits w
                JOIN dbo.WaitType wt ON w.WaitTypeID=wt.WaitTypeID
                WHERE w.SnapshotDate > DATEADD(hour,-1,GETUTCDATE()) AND wt.IsExcluded=0
                GROUP BY w.InstanceID", conn);
            cmd.CommandTimeout = 60;
            using var r = await cmd.ExecuteReaderAsync();
            while (await r.ReadAsync())
                waitData[r.GetInt32(0)] = (r.IsDBNull(1)?0:Convert.ToInt64(r[1]), r.IsDBNull(2)?0:Convert.ToInt64(r[2]), r.IsDBNull(3)?0:Convert.ToInt64(r[3]), r.IsDBNull(4)?0:Convert.ToInt64(r[4]), r.IsDBNull(5)?0:Convert.ToDouble(r[5]), r.IsDBNull(6)?0:Convert.ToInt64(r[6]));
        }
        catch { /* Waits might differ */ }

        // Combine
        var result = instances.Select(inst =>
        {
            var id = (int)inst["instanceID"]!;
            cpuData.TryGetValue(id, out var cpu);
            ioData.TryGetValue(id, out var io);
            waitData.TryGetValue(id, out var wt);
            return new Dictionary<string, object?>
            {
                ["instanceID"] = id,
                ["instanceDisplayName"] = inst["instanceDisplayName"],
                ["avgCPU"] = Math.Round(cpu.avg, 0),
                ["maxCPU"] = cpu.max,
                ["maxTotalCPU"] = cpu.maxTotal,
                ["criticalWaitMs"] = wt.critical,
                ["lockWaitMs"] = wt.lockW,
                ["ioWaitMs"] = wt.ioW,
                ["totalWaitMs"] = wt.total,
                ["signalWaitPct"] = Math.Round(wt.signal, 1),
                ["latchWaitMs"] = wt.latch,
                ["readLatency"] = Math.Round(io.readLat, 2),
                ["writeLatency"] = Math.Round(io.writeLat, 2),
                ["mBsec"] = Math.Round(io.mbSec, 2),
                ["iOPs"] = Math.Round(io.iops, 1)
            };
        }).ToList();

        return Results.Ok(new { data = result, note = "" });
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

// ── Tree endpoint ────────────────────────────────────────────────────────
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
    catch (Exception)
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
            ORDER BY AVG(CAST(c.SQLProcessCPU as float)) DESC", 120, ("@hours", h));

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
                ORDER BY AVG(CAST(c.SQLProcessCPU as float)) DESC", 120, ("@hours", h));

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


// ── SQL Monitor Overview (SQLMonitor-style dashboard) ─────────────────────

app.MapGet("/api/dashboard/monitor", async () =>
{
    try
    {
        // 1. Summary_Get gives us per-instance health statuses
        List<Dictionary<string, object?>> summary = new();
        try { summary = await SpAsync("dbo.Summary_Get", 120); } catch { }

        // 2. Active instance list with versions
        var instances = await QueryAsync(@"
            SELECT i.InstanceID, COALESCE(i.InstanceDisplayName, i.Instance) as InstanceName,
                   i.Edition, i.ProductVersion, i.cpu_count, i.physical_memory_kb,
                   i.sqlserver_start_time,
                   CASE WHEN cd.LastCollected > DATEADD(minute, -10, GETUTCDATE()) THEN 1 ELSE 0 END as IsOnline
            FROM dbo.Instances i
            OUTER APPLY (
                SELECT MAX(SnapshotDate) AS LastCollected
                FROM dbo.CollectionDates c WHERE c.InstanceID = i.InstanceID
            ) cd
            WHERE i.IsActive = 1
            ORDER BY COALESCE(i.InstanceDisplayName, i.Instance)");

        // 3. Latest CPU per instance (last 5 min avg)
        var cpuData = await QueryAsync(@"
            SELECT c.InstanceID,
                   AVG(CAST(c.SQLProcessCPU as float)) as AvgCPU,
                   AVG(CAST((100 - c.SystemIdleCPU - c.SQLProcessCPU) as float)) as SysCPU
            FROM dbo.CPU c
            WHERE c.EventTime >= DATEADD(minute, -5, GETUTCDATE())
            GROUP BY c.InstanceID");
        var cpuMap = new Dictionary<int, (double sql, double sys)>();
        foreach (var r in cpuData)
        {
            var id = Convert.ToInt32(r["InstanceID"]);
            var sql = r["AvgCPU"] != null ? Convert.ToDouble(r["AvgCPU"]) : 0;
            var sys = r["SysCPU"] != null ? Convert.ToDouble(r["SysCPU"]) : 0;
            cpuMap[id] = (Math.Round(sql, 1), Math.Round(sys, 1));
        }

        // 4. Latest waits per instance (last 5 min)
        List<Dictionary<string, object?>> waitsData = new();
        try
        {
            waitsData = await QueryAsync(@"
                SELECT InstanceID,
                       SUM(CAST(wait_time_ms as float)) / 1000.0 as WaitSec,
                       SUM(CAST(signal_wait_time_ms as float)) / 1000.0 as SignalWaitSec
                FROM dbo.Waits
                WHERE SnapshotDate >= DATEADD(minute, -5, GETUTCDATE())
                GROUP BY InstanceID");
        }
        catch { }
        var waitsMap = new Dictionary<int, double>();
        foreach (var r in waitsData)
        {
            var id = Convert.ToInt32(r["InstanceID"]);
            waitsMap[id] = r["WaitSec"] != null ? Math.Round(Convert.ToDouble(r["WaitSec"]), 0) : 0;
        }

        // 5. Disk I/O per instance
        List<Dictionary<string, object?>> ioData = new();
        try
        {
            ioData = await QueryAsync(@"
                SELECT io.InstanceID,
                       SUM(CAST(COALESCE(io.num_of_bytes_read,0) + COALESCE(io.num_of_bytes_written,0) as float)) / 1024.0 as DiskIOKB
                FROM dbo.DBIOStats io
                WHERE io.SnapshotDate >= DATEADD(minute, -5, GETUTCDATE())
                GROUP BY io.InstanceID");
        }
        catch { }
        var ioMap = new Dictionary<int, double>();
        foreach (var r in ioData)
        {
            var id = Convert.ToInt32(r["InstanceID"]);
            ioMap[id] = r["DiskIOKB"] != null ? Math.Round(Convert.ToDouble(r["DiskIOKB"]), 0) : 0;
        }

        // 6. AG membership
        List<Dictionary<string, object?>> agData = new();
        try
        {
            agData = await QueryAsync(@"
                SELECT DISTINCT ar.InstanceID, ag.name as group_name
                FROM dbo.AvailabilityReplicas ar
                JOIN dbo.AvailabilityGroups ag ON ar.group_id = ag.group_id
                WHERE ar.InstanceID IS NOT NULL");
        }
        catch { }
        var agMap = new Dictionary<int, (string name, string role)>();
        foreach (var r in agData)
        {
            var id = Convert.ToInt32(r["InstanceID"]);
            var name = r["group_name"]?.ToString() ?? "";
            agMap[id] = (name, "");
        }

        // 7. Active alerts
        List<Dictionary<string, object?>> alerts = new();
        try
        {
            alerts = await QueryAsync(@"
                SELECT TOP 100 InstanceID, ErrorDate, ErrorMessage, ErrorContext
                FROM dbo.CollectionErrorLog
                ORDER BY ErrorDate DESC");
        }
        catch { }

        // Build summary map
        var summaryMap = new Dictionary<int, Dictionary<string, object?>>();
        foreach (var s in summary)
        {
            if (s.TryGetValue("InstanceID", out var v) && v != null)
                summaryMap[Convert.ToInt32(v)] = s;
        }

        // Merge into unified response
        var result = instances.Select(inst =>
        {
            var id = Convert.ToInt32(inst["InstanceID"]);
            var (sqlCpu, sysCpu) = cpuMap.GetValueOrDefault(id, (0, 0));
            var waitMs = waitsMap.GetValueOrDefault(id, 0);
            var diskIO = ioMap.GetValueOrDefault(id, 0);
            var ag = agMap.GetValueOrDefault(id, ("", ""));
            var agName = ag.Item1;
            var agRole = ag.Item2;
            var sum = summaryMap.GetValueOrDefault(id);

            // DBA Dash enum: Critical=1, Warning=2, NA=3, OK=4, Acknowledged=5 — all Summary_Get checks
            var worstStatus = WorstSummaryStatus(sum, SummaryStatusKeys.ColumnKeys);
            var activeAlerts = new List<string>();
            AppendActiveSummaryAlerts(sum, activeAlerts);

            return new
            {
                instanceId = id,
                instanceName = inst["InstanceName"],
                edition = inst["Edition"],
                productVersion = inst["ProductVersion"],
                cpuCount = inst["cpu_count"],
                memoryKb = inst["physical_memory_kb"],
                startTime = inst["sqlserver_start_time"],
                isOnline = Convert.ToInt32(inst["IsOnline"] ?? 0) == 1,
                sqlCpu,
                sysCpu,
                waitMs,
                diskIOKB = diskIO,
                agName = agName,
                agRole = agRole,
                status = worstStatus,
                activeAlerts
            };
        }).ToList();

        var alertCounts = new Dictionary<string, int>
        {
            ["Monitoring stopped"] = result.Count(r => !(bool)r.isOnline),
        };
        foreach (var (_, label) in SummaryStatusKeys.CheckAlertLabels)
            alertCounts[label] = result.Count(r => r.activeAlerts.Contains(label));

        return Results.Ok(new { instances = result, alertCounts, recentErrors = alerts.Take(20) });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message });
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
            WHERE InstanceID = @id", 30, ("@id", id));
        return Results.Ok(raw.Count > 0 ? raw[0] : new Dictionary<string, object?>{ ["error"] = "No summary row for this instance" });
    }
    catch (Exception ex)
    {
        return Results.Ok(new { error = ex.Message });
    }
}).RequireAuthorization();

// SPA fallback — serve index.html for all non-API routes
app.MapFallbackToFile("index.html");

app.Run();

// ── Summary_Get metadata (type must follow top-level statements) ─────────

static class SummaryStatusKeys
{
    /// <summary>All Summary_Get status columns used for worst-status / alerting (matches DBA Dash GUI checks).</summary>
    public static readonly string[] ColumnKeys =
    {
        "FullBackupStatus", "DiffBackupStatus", "LogBackupStatus", "LogShippingStatus",
        "DriveStatus", "FileFreeSpaceStatus", "LogFreeSpaceStatus", "JobStatus", "AGStatus",
        "CorruptionStatus", "LastGoodCheckDBStatus", "MemoryDumpStatus", "SnapshotAgeStatus",
        "UptimeStatus", "IsAgentRunningStatus", "DBMailStatus", "QueryStoreStatus",
        "AlertStatus", "PctMaxSizeStatus", "CollectionErrorStatus", "DatabaseStateStatus",
        "IdentityStatus", "CustomCheckStatus", "MirroringStatus", "ElasticPoolStorageStatus"
    };

    /// <summary>Maps Summary column to a short alert label for SQL Monitor / badges.</summary>
    public static readonly (string Key, string Label)[] CheckAlertLabels =
    {
        ("FullBackupStatus", "Backup"),
        ("DiffBackupStatus", "Diff backup"),
        ("LogBackupStatus", "Log backup"),
        ("LogShippingStatus", "Log shipping"),
        ("DriveStatus", "Disk space"),
        ("FileFreeSpaceStatus", "File space"),
        ("LogFreeSpaceStatus", "Log space"),
        ("JobStatus", "Job failing"),
        ("AGStatus", "AG"),
        ("CorruptionStatus", "Corruption"),
        ("LastGoodCheckDBStatus", "DBCC"),
        ("MemoryDumpStatus", "Memory dump"),
        ("SnapshotAgeStatus", "Snapshot age"),
        ("UptimeStatus", "Uptime"),
        ("IsAgentRunningStatus", "SQL Agent"),
        ("DBMailStatus", "DB Mail"),
        ("QueryStoreStatus", "Query Store"),
        ("AlertStatus", "Agent alerts"),
        ("PctMaxSizeStatus", "% Max size"),
        ("CollectionErrorStatus", "Collection errors"),
        ("DatabaseStateStatus", "Database state"),
        ("IdentityStatus", "Identity columns"),
        ("CustomCheckStatus", "Custom check"),
        ("MirroringStatus", "Mirroring"),
        ("ElasticPoolStorageStatus", "Elastic pool"),
    };
}

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

using Microsoft.Data.SqlClient;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddScoped<SqlConnection>(_ =>
    new SqlConnection(builder.Configuration.GetConnectionString("DBADashDB")));

var app = builder.Build();

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();

// --- API Endpoints ---

app.MapGet("/api/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

app.MapGet("/api/instances", async (SqlConnection db) =>
{
    try
    {
        await db.OpenAsync();
        var instances = new List<object>();
        using var cmd = new SqlCommand(
            "SELECT InstanceID, Instance AS Name, ConnectionID FROM dbo.Instances ORDER BY Instance", db);
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            instances.Add(new
            {
                id = reader.GetInt32(0),
                name = reader.GetString(1),
                connectionId = reader.IsDBNull(2) ? null : reader.GetString(2)
            });
        }
        return Results.Ok(instances);
    }
    catch (Exception ex)
    {
        return Results.Problem($"Database query failed: {ex.Message}", statusCode: 503);
    }
});

app.MapGet("/api/instances/{id}/status", async (int id, SqlConnection db) =>
{
    // TODO: Query actual status tables once schema is confirmed
    return Results.StatusCode(501);
});

app.MapGet("/api/performance/summary", async (SqlConnection db) =>
{
    // TODO: Query performance counters once schema is confirmed
    return Results.StatusCode(501);
});

app.MapGet("/api/jobs/recent", async (SqlConnection db) =>
{
    try
    {
        await db.OpenAsync();
        var jobs = new List<object>();
        using var cmd = new SqlCommand(@"
            SELECT TOP 50 j.JobID, j.name AS JobName, jh.InstanceID,
                   jh.run_status, jh.run_date, jh.run_time, jh.run_duration
            FROM dbo.Jobs j
            INNER JOIN dbo.JobHistory jh ON j.JobID = jh.JobID
            ORDER BY jh.run_date DESC, jh.run_time DESC", db);
        using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            jobs.Add(new
            {
                jobId = reader.GetInt32(0),
                jobName = reader.GetString(1),
                instanceId = reader.GetInt32(2),
                runStatus = reader.GetInt32(3),
                runDate = reader.GetInt32(4),
                runTime = reader.GetInt32(5),
                runDuration = reader.GetInt32(6)
            });
        }
        return Results.Ok(jobs);
    }
    catch (Exception ex)
    {
        return Results.Problem($"Database query failed: {ex.Message}", statusCode: 503);
    }
});

// SPA fallback for production
app.MapFallbackToFile("index.html");

app.Run();

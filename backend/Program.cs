using DBADashWebView;
using DBADashWebView.Auth;
using DBADashWebView.Data;
using DBADashWebView.Endpoints;
using DBADashWebView.Settings;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
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

builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    if (corsSettings.AllowedOrigins.Length > 0)
    {
        policy.WithOrigins(corsSettings.AllowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    }
}));

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
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
builder.Services.AddSingleton<ApplicationVersionProvider>();

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

await app.Services.GetRequiredService<LocalUserStore>().EnsureSeededAsync();

app.Map("/api/error", () => Results.Problem(
    title: "Unexpected server error",
    detail: "The server failed to process the request."));

app.MapAuthEndpoints();
app.MapSettingsEndpoints();
app.MapDashboardEndpoints();
app.MapInstanceEndpoints();
app.MapAvailabilityEndpoints();
app.MapPerformanceEndpoints();
app.MapMonitoringEndpoints();
app.MapEstateEndpoints();
app.MapReportEndpoints();

app.MapFallbackToFile("index.html");

app.Run();

public partial class Program
{
}

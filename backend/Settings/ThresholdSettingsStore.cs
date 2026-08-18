using System.Text.Json;
using DBADashWebView.Auth;

namespace DBADashWebView.Settings;

public sealed class ThresholdSettingsStore
{
    private const string InstanceScope = "instance";
    private const string TagScope = "tag";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly string _path;
    private readonly SemaphoreSlim _mutex = new(1, 1);

    public ThresholdSettingsStore(string? path = null)
    {
        _path = path ?? Path.Combine(AppContext.BaseDirectory, "config", "thresholds.json");
    }

    public async Task<Dictionary<string, ThresholdValue>> GetAsync(CancellationToken cancellationToken = default) =>
        (await GetSettingsAsync(cancellationToken)).Global;

    public async Task<List<ThresholdOverride>> GetOverridesAsync(CancellationToken cancellationToken = default) =>
        (await GetSettingsAsync(cancellationToken)).Overrides;

    public async Task<(Dictionary<string, ThresholdValue> Global, List<ThresholdOverride> Overrides)> GetSettingsAsync(
        CancellationToken cancellationToken = default)
    {
        await _mutex.WaitAsync(cancellationToken);
        try
        {
            var file = await ReadFileAsync(cancellationToken);
            return (file.Global, file.Overrides);
        }
        finally
        {
            _mutex.Release();
        }
    }

    public async Task SaveAsync(IDictionary<string, ThresholdValue> thresholds, CancellationToken cancellationToken = default)
    {
        var sanitized = SanitizeGlobal(thresholds);

        await _mutex.WaitAsync(cancellationToken);
        try
        {
            var file = await ReadFileAsync(cancellationToken);
            await WriteFileAsync(file with { Global = sanitized }, cancellationToken);
        }
        finally
        {
            _mutex.Release();
        }
    }

    /// <summary>
    /// Replaces the full set of per-instance/per-tag overrides. Like <see cref="SaveAsync"/>,
    /// the caller is expected to send the complete desired list each time.
    /// </summary>
    public async Task SaveOverridesAsync(IEnumerable<ThresholdOverride> overrides, CancellationToken cancellationToken = default)
    {
        var sanitized = SanitizeOverrides(overrides);

        await _mutex.WaitAsync(cancellationToken);
        try
        {
            var file = await ReadFileAsync(cancellationToken);
            await WriteFileAsync(file with { Overrides = sanitized }, cancellationToken);
        }
        finally
        {
            _mutex.Release();
        }
    }

    private static Dictionary<string, ThresholdValue> SanitizeGlobal(IDictionary<string, ThresholdValue> thresholds) =>
        thresholds
            .Where(entry => !string.IsNullOrWhiteSpace(entry.Key))
            .ToDictionary(
                entry => entry.Key.Trim(),
                entry => new ThresholdValue(Math.Max(0, entry.Value.Warning), Math.Max(0, entry.Value.Critical)));

    /// <summary>
    /// Drops overrides with no metric key, an unrecognised scope type, or a
    /// non-positive scope id, clamps warning/critical to non-negative, and
    /// collapses duplicates for the same (scope, metric) to the last one supplied.
    /// </summary>
    private static List<ThresholdOverride> SanitizeOverrides(IEnumerable<ThresholdOverride> overrides)
    {
        var byKey = new Dictionary<(string ScopeType, int ScopeId, string MetricKey), ThresholdOverride>();
        foreach (var entry in overrides)
        {
            if (entry is null || string.IsNullOrWhiteSpace(entry.MetricKey) || entry.ScopeId <= 0)
            {
                continue;
            }

            var scopeType = entry.ScopeType?.Trim().ToLowerInvariant();
            if (scopeType != InstanceScope && scopeType != TagScope)
            {
                continue;
            }

            var metricKey = entry.MetricKey.Trim();
            byKey[(scopeType, entry.ScopeId, metricKey)] = new ThresholdOverride(
                metricKey, scopeType, entry.ScopeId, Math.Max(0, entry.Warning), Math.Max(0, entry.Critical));
        }

        return byKey.Values.ToList();
    }

    private async Task<ThresholdSettingsFile> ReadFileAsync(CancellationToken cancellationToken)
    {
        if (!File.Exists(_path))
        {
            return new ThresholdSettingsFile([], []);
        }

        var json = await File.ReadAllTextAsync(_path, cancellationToken);
        if (string.IsNullOrWhiteSpace(json))
        {
            return new ThresholdSettingsFile([], []);
        }

        var parsed = JsonSerializer.Deserialize<ThresholdSettingsFileDto>(json, JsonOptions);
        if (parsed?.Global is not null)
        {
            return new ThresholdSettingsFile(parsed.Global, parsed.Overrides ?? []);
        }

        // Legacy format written before overrides existed: a flat
        // { metricKey: { warning, critical } } dictionary with no wrapper object.
        var legacy = JsonSerializer.Deserialize<Dictionary<string, ThresholdValue>>(json, JsonOptions) ?? [];
        return new ThresholdSettingsFile(legacy, []);
    }

    private async Task WriteFileAsync(ThresholdSettingsFile file, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        await using var stream = File.Create(_path);
        await JsonSerializer.SerializeAsync(
            stream,
            new ThresholdSettingsFileDto(file.Global, file.Overrides),
            JsonOptions,
            cancellationToken);
    }

    private sealed record ThresholdSettingsFile(Dictionary<string, ThresholdValue> Global, List<ThresholdOverride> Overrides);

    private sealed record ThresholdSettingsFileDto(Dictionary<string, ThresholdValue>? Global, List<ThresholdOverride>? Overrides);
}

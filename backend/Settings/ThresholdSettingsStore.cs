using System.Text.Json;
using DBADashWebView.Auth;

namespace DBADashWebView.Settings;

public sealed class ThresholdSettingsStore
{
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

    public async Task<Dictionary<string, ThresholdValue>> GetAsync(CancellationToken cancellationToken = default)
    {
        await _mutex.WaitAsync(cancellationToken);
        try
        {
            if (!File.Exists(_path))
            {
                return [];
            }

            await using var stream = File.OpenRead(_path);
            return await JsonSerializer.DeserializeAsync<Dictionary<string, ThresholdValue>>(stream, JsonOptions, cancellationToken)
                ?? [];
        }
        finally
        {
            _mutex.Release();
        }
    }

    public async Task SaveAsync(IDictionary<string, ThresholdValue> thresholds, CancellationToken cancellationToken = default)
    {
        var sanitized = thresholds
            .Where(entry => !string.IsNullOrWhiteSpace(entry.Key))
            .ToDictionary(
                entry => entry.Key.Trim(),
                entry => new ThresholdValue(
                    Math.Max(0, entry.Value.Warning),
                    Math.Max(0, entry.Value.Critical)));

        await _mutex.WaitAsync(cancellationToken);
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            await using var stream = File.Create(_path);
            await JsonSerializer.SerializeAsync(stream, sanitized, JsonOptions, cancellationToken);
        }
        finally
        {
            _mutex.Release();
        }
    }
}

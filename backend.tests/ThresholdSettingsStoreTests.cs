using DBADashWebView.Auth;
using DBADashWebView.Settings;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class ThresholdSettingsStoreTests
{
    [Fact]
    public async Task SaveAsync_PersistsThresholds_WithSanitizedValues()
    {
        await WithTempStore(async store =>
        {
            await store.SaveAsync(new Dictionary<string, ThresholdValue>
            {
                ["cpu"] = new(-5, 90),
                ["waits"] = new(10, 25)
            });

            var saved = await store.GetAsync();

            Assert.Equal(0, saved["cpu"].Warning);
            Assert.Equal(90, saved["cpu"].Critical);
            Assert.Equal(10, saved["waits"].Warning);
            Assert.Equal(25, saved["waits"].Critical);
        });
    }

    [Fact]
    public async Task SaveOverridesAsync_PersistsOverrides_WithSanitizedValues()
    {
        await WithTempStore(async store =>
        {
            await store.SaveOverridesAsync(
            [
                new ThresholdOverride("avgCPU", "instance", 7, -5, 95),
                new ThresholdOverride("avgCPU", "TAG", 3, 20, 40)
            ]);

            var saved = await store.GetOverridesAsync();

            Assert.Equal(2, saved.Count);
            var instanceOverride = Assert.Single(saved, o => o.ScopeType == "instance");
            Assert.Equal(7, instanceOverride.ScopeId);
            Assert.Equal(0, instanceOverride.Warning);
            Assert.Equal(95, instanceOverride.Critical);

            var tagOverride = Assert.Single(saved, o => o.ScopeType == "tag");
            Assert.Equal(3, tagOverride.ScopeId);
        });
    }

    [Fact]
    public async Task SaveOverridesAsync_DropsInvalidEntries()
    {
        await WithTempStore(async store =>
        {
            await store.SaveOverridesAsync(
            [
                new ThresholdOverride("avgCPU", "instance", 0, 10, 20), // non-positive scope id
                new ThresholdOverride("", "instance", 1, 10, 20), // empty metric key
                new ThresholdOverride("avgCPU", "group", 1, 10, 20), // unrecognised scope type
                new ThresholdOverride("avgCPU", "instance", 1, 10, 20) // valid
            ]);

            var saved = await store.GetOverridesAsync();

            var kept = Assert.Single(saved);
            Assert.Equal("avgCPU", kept.MetricKey);
            Assert.Equal(1, kept.ScopeId);
        });
    }

    [Fact]
    public async Task SaveOverridesAsync_DuplicateScopeAndMetric_LastOneWins()
    {
        await WithTempStore(async store =>
        {
            await store.SaveOverridesAsync(
            [
                new ThresholdOverride("avgCPU", "instance", 1, 10, 20),
                new ThresholdOverride("avgCPU", "instance", 1, 30, 40)
            ]);

            var saved = await store.GetOverridesAsync();

            var kept = Assert.Single(saved);
            Assert.Equal(30, kept.Warning);
            Assert.Equal(40, kept.Critical);
        });
    }

    [Fact]
    public async Task SaveAsync_AndSaveOverridesAsync_DoNotClobberEachOther()
    {
        await WithTempStore(async store =>
        {
            await store.SaveAsync(new Dictionary<string, ThresholdValue> { ["cpu"] = new(10, 90) });
            await store.SaveOverridesAsync([new ThresholdOverride("cpu", "instance", 1, 5, 95)]);
            await store.SaveAsync(new Dictionary<string, ThresholdValue> { ["cpu"] = new(15, 85) });

            var (global, overrides) = await store.GetSettingsAsync();

            Assert.Equal(15, global["cpu"].Warning);
            Assert.Single(overrides);
        });
    }

    [Fact]
    public async Task GetAsync_MigratesLegacyFlatDictionaryFile()
    {
        await WithTempStore(async (store, path) =>
        {
            await File.WriteAllTextAsync(path, """{ "cpu": { "warning": 10, "critical": 90 } }""");

            var (global, overrides) = await store.GetSettingsAsync();

            Assert.Equal(10, global["cpu"].Warning);
            Assert.Equal(90, global["cpu"].Critical);
            Assert.Empty(overrides);
        });
    }

    private static async Task WithTempStore(Func<ThresholdSettingsStore, Task> test) =>
        await WithTempStore((store, _) => test(store));

    private static async Task WithTempStore(Func<ThresholdSettingsStore, string, Task> test)
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "dbadashwebview-threshold-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);
        var thresholdPath = Path.Combine(tempRoot, "thresholds.json");

        try
        {
            await test(new ThresholdSettingsStore(thresholdPath), thresholdPath);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }
}

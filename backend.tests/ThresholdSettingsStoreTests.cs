using DBADashWebView.Auth;
using DBADashWebView.Settings;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class ThresholdSettingsStoreTests
{
    [Fact]
    public async Task SaveAsync_PersistsThresholds_WithSanitizedValues()
    {
        var tempRoot = Path.Combine(Path.GetTempPath(), "dbadashwebview-threshold-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempRoot);
        var thresholdPath = Path.Combine(tempRoot, "thresholds.json");

        try
        {
            var store = new ThresholdSettingsStore(thresholdPath);
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
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }
}

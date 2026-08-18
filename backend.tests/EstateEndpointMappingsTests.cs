using DBADashWebView.Endpoints;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class EstateEndpointMappingsTests
{
    [Fact]
    public void ParseDriveIds_ParsesAndDedupes()
    {
        var ids = EstateEndpointMappings.ParseDriveIds("1,2,2,3, 4");

        Assert.Equal([1, 2, 3, 4], ids);
    }

    [Fact]
    public void ParseDriveIds_DropsNonNumericEntries()
    {
        var ids = EstateEndpointMappings.ParseDriveIds("1,abc,,3");

        Assert.Equal([1, 3], ids);
    }

    [Fact]
    public void ParseDriveIds_NullOrEmpty_ReturnsEmptyList()
    {
        Assert.Empty(EstateEndpointMappings.ParseDriveIds(null));
        Assert.Empty(EstateEndpointMappings.ParseDriveIds(""));
        Assert.Empty(EstateEndpointMappings.ParseDriveIds("   "));
    }

    [Fact]
    public void ParseDriveIds_CapsAtMaxCount()
    {
        var raw = string.Join(",", Enumerable.Range(1, 100));

        var ids = EstateEndpointMappings.ParseDriveIds(raw, maxCount: 10);

        Assert.Equal(10, ids.Count);
        Assert.Equal(Enumerable.Range(1, 10), ids);
    }

    [Theory]
    [InlineData(null, 30)]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    [InlineData(400, 365)]
    [InlineData(90, 90)]
    public void ClampGrowthWindowDays_ClampsToValidRange(int? input, int expected)
    {
        Assert.Equal(expected, EstateEndpointMappings.ClampGrowthWindowDays(input));
    }
}

using DBADashWebView;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class ApplicationVersionProviderTests
{
    [Fact]
    public void Resolve_UsesTrimmedVersionMarker_WhenPresent()
    {
        var tempRoot = CreateTempDirectory();

        try
        {
            File.WriteAllText(Path.Combine(tempRoot, "version.txt"), "  v0.2.6\r\n");

            var result = ApplicationVersionProvider.Resolve(tempRoot, "1.0.0+fallback");

            Assert.Equal("v0.2.6", result.Version);
            Assert.Equal("version-file", result.Source);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    [Fact]
    public void Resolve_UsesAssemblyMetadata_WhenVersionMarkerIsMissing()
    {
        var tempRoot = CreateTempDirectory();

        try
        {
            var result = ApplicationVersionProvider.Resolve(tempRoot, "1.0.0+abc123");

            Assert.Equal("1.0.0+abc123", result.Version);
            Assert.Equal("assembly", result.Source);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    [Fact]
    public void Resolve_UsesUnknown_WhenNoVersionInformationExists()
    {
        var tempRoot = CreateTempDirectory();

        try
        {
            var result = ApplicationVersionProvider.Resolve(tempRoot, "  ");

            Assert.Equal("unknown", result.Version);
            Assert.Equal("assembly", result.Source);
        }
        finally
        {
            Directory.Delete(tempRoot, recursive: true);
        }
    }

    private static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), "dbadashwebview-version-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(path);
        return path;
    }
}

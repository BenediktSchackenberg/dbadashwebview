using System.Reflection;

namespace DBADashWebView;

public sealed record ApplicationVersionInfo(string Version, string Source);

public sealed class ApplicationVersionProvider
{
    private const string VersionFileName = "version.txt";
    private readonly string _contentRootPath;
    private readonly string _assemblyVersion;

    public ApplicationVersionProvider(IHostEnvironment environment)
    {
        _contentRootPath = environment.ContentRootPath;
        _assemblyVersion = GetAssemblyVersion();
    }

    public ApplicationVersionInfo GetCurrentVersion() => Resolve(_contentRootPath, _assemblyVersion);

    public static ApplicationVersionInfo Resolve(string contentRootPath, string assemblyVersion)
    {
        var versionPath = Path.Combine(contentRootPath, VersionFileName);

        try
        {
            if (File.Exists(versionPath))
            {
                var releaseVersion = File.ReadAllText(versionPath).Trim();
                if (!string.IsNullOrWhiteSpace(releaseVersion))
                {
                    return new ApplicationVersionInfo(releaseVersion, "version-file");
                }
            }
        }
        catch (IOException)
        {
            // Fall back to the assembly metadata when the marker can't be read.
        }
        catch (UnauthorizedAccessException)
        {
            // Fall back to the assembly metadata when the marker can't be read.
        }

        var fallback = string.IsNullOrWhiteSpace(assemblyVersion) ? "unknown" : assemblyVersion.Trim();
        return new ApplicationVersionInfo(fallback, "assembly");
    }

    private static string GetAssemblyVersion()
    {
        var assembly = typeof(ApplicationVersionProvider).Assembly;
        return assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
            ?? assembly.GetName().Version?.ToString()
            ?? "unknown";
    }
}

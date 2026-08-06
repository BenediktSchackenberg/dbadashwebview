[CmdletBinding()]
param(
    [string]$Version,
    [string]$OutputDirectory,
    [switch]$SkipTests,
    [switch]$SkipE2E,
    [switch]$KeepPublish,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$frontendPath = Join-Path $repoRoot 'frontend'
$backendPath = Join-Path $repoRoot 'backend'
$backendTestsProject = Join-Path $repoRoot 'backend.tests\DBADashWebView.Tests.csproj'

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command,
        [string[]]$Arguments = @(),
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        Write-Host "`n> $Command $($Arguments -join ' ')" -ForegroundColor Cyan
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

foreach ($command in @('git', 'npm', 'npx', 'dotnet')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command '$command' was not found in PATH."
    }
}

$commit = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($commit)) {
    throw 'Unable to determine the current Git commit.'
}

$workingTreeChanges = @(& git -C $repoRoot status --porcelain)
if ($workingTreeChanges.Count -gt 0) {
    Write-Warning 'The working tree contains uncommitted changes. The package version still refers to the current HEAD commit.'
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    $headTags = @(& git -C $repoRoot tag --points-at HEAD)
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to determine whether the current commit has a release tag.'
    }

    $exactTag = $headTags | Sort-Object | Select-Object -First 1
    if (-not [string]::IsNullOrWhiteSpace($exactTag)) {
        $Version = $exactTag.Trim()
    }
    else {
        $Version = $commit
    }
}

$safeVersion = $Version -replace '[^A-Za-z0-9._-]', '-'
if ([string]::IsNullOrWhiteSpace($safeVersion)) {
    throw 'Version must contain at least one letter, number, dot, underscore, or hyphen.'
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot 'artifacts'
}

$outputRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
$releaseDirectory = [System.IO.Path]::GetFullPath((Join-Path $outputRoot $safeVersion))
$expectedPrefix = $outputRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $releaseDirectory.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Release directory must stay below the output directory: $releaseDirectory"
}

if (Test-Path -LiteralPath $releaseDirectory) {
    if (-not $Force) {
        throw "Output already exists: $releaseDirectory. Use -Force to replace it."
    }

    Remove-Item -LiteralPath $releaseDirectory -Recurse -Force
}

$publishDirectory = Join-Path $releaseDirectory 'publish'
$wwwrootDirectory = Join-Path $publishDirectory 'wwwroot'
$zipPath = Join-Path $releaseDirectory 'dbadash-webview.zip'
$checksumPath = Join-Path $releaseDirectory 'dbadash-webview.zip.sha256'
$metadataPath = Join-Path $releaseDirectory 'release-metadata.json'
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)

New-Item -ItemType Directory -Path $publishDirectory -Force | Out-Null

Write-Host "Building DBA Dash WebView $Version from $commit" -ForegroundColor Green

Invoke-External -Command 'npm' -Arguments @('ci') -WorkingDirectory $frontendPath

if (-not $SkipTests) {
    Invoke-External -Command 'npm' -Arguments @('run', 'test:run') -WorkingDirectory $frontendPath

    if (-not $SkipE2E) {
        Invoke-External -Command 'npx' -Arguments @('playwright', 'install', 'chromium') -WorkingDirectory $frontendPath
        Invoke-External -Command 'npm' -Arguments @('run', 'test:e2e') -WorkingDirectory $frontendPath
    }

    Invoke-External -Command 'dotnet' -Arguments @('restore', $backendTestsProject) -WorkingDirectory $repoRoot
    Invoke-External -Command 'dotnet' -Arguments @(
        'test',
        $backendTestsProject,
        '--configuration', 'Release',
        '--no-restore'
    ) -WorkingDirectory $repoRoot
}

Invoke-External -Command 'npm' -Arguments @('run', 'build') -WorkingDirectory $frontendPath
Invoke-External -Command 'dotnet' -Arguments @(
    'publish',
    (Join-Path $backendPath 'DBADashWebView.csproj'),
    '--configuration', 'Release',
    '--output', $publishDirectory
) -WorkingDirectory $repoRoot

if (Test-Path -LiteralPath $wwwrootDirectory) {
    Remove-Item -LiteralPath $wwwrootDirectory -Recurse -Force
}

New-Item -ItemType Directory -Path $wwwrootDirectory -Force | Out-Null
Copy-Item -Path (Join-Path $frontendPath 'dist\*') -Destination $wwwrootDirectory -Recurse -Force

$webConfig = @'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <location path="." inheritInChildApplications="false">
    <system.webServer>
      <handlers>
        <add name="aspNetCore" path="*" verb="*" modules="AspNetCoreModuleV2" resourceType="Unspecified" />
      </handlers>
      <aspNetCore processPath="dotnet" arguments=".\DBADashWebView.dll" stdoutLogEnabled="false" hostingModel="InProcess">
        <environmentVariables>
          <environmentVariable name="ASPNETCORE_ENVIRONMENT" value="Production" />
        </environmentVariables>
      </aspNetCore>
    </system.webServer>
  </location>
</configuration>
'@

[System.IO.File]::WriteAllText((Join-Path $publishDirectory 'web.config'), $webConfig, $utf8WithoutBom)
[System.IO.File]::WriteAllText((Join-Path $publishDirectory 'version.txt'), $Version, $utf8WithoutBom)

Compress-Archive -Path (Join-Path $publishDirectory '*') -DestinationPath $zipPath -CompressionLevel Optimal
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash
[System.IO.File]::WriteAllText($checksumPath, "$hash  dbadash-webview.zip`n", $utf8WithoutBom)

$metadata = [ordered]@{
    version = $Version
    commit = $commit
    generatedAtUtc = [DateTime]::UtcNow.ToString('o')
    testsRun = -not $SkipTests
    e2eTestsRun = -not $SkipTests -and -not $SkipE2E
    artifact = 'dbadash-webview.zip'
    sha256 = $hash
}
[System.IO.File]::WriteAllText($metadataPath, ($metadata | ConvertTo-Json) + "`n", $utf8WithoutBom)

if (-not $KeepPublish) {
    Remove-Item -LiteralPath $publishDirectory -Recurse -Force
}

Write-Host "`nManual release package created successfully." -ForegroundColor Green
Write-Host "ZIP:      $zipPath"
Write-Host "SHA-256:  $hash"
Write-Host "Metadata: $metadataPath"

[pscustomobject]@{
    Version = $Version
    Commit = $commit
    ZipPath = $zipPath
    Sha256 = $hash
    MetadataPath = $metadataPath
}

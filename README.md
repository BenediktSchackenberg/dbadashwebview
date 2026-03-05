<div align="center">

<img src="docs/logo.svg" alt="DBA Dash WebView" width="120" />

# DBA Dash WebView

**A modern web dashboard for SQL Server fleet monitoring**

*Browser-based companion to [DBA Dash](https://github.com/trimble-oss/DBADash) — monitor hundreds of SQL Servers from any device.*

[![Build](https://github.com/BenediktSchackenberg/dbadashwebview/actions/workflows/build.yml/badge.svg)](https://github.com/BenediktSchackenberg/dbadashwebview/actions/workflows/build.yml)
[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![.NET 8](https://img.shields.io/badge/.NET-8.0-purple.svg)](https://dotnet.microsoft.com/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![DBA Dash](https://img.shields.io/badge/Powered%20by-DBA%20Dash-green.svg)](https://dbadash.com)

[Features](#features) · [Screenshots](#screenshots) · [Quick Start](#quick-start) · [IIS Deployment](#iis-deployment) · [Configuration](#configuration) · [API Reference](#api-reference) · [Contributing](#contributing)

---

**DBA Dash** is an outstanding open-source SQL Server monitoring tool by [Trimble](https://github.com/trimble-oss/dba-dash). **DBA Dash WebView** gives it a web UI — access your fleet's health from any browser, any device, anywhere.

</div>

## Why DBA Dash WebView?

| Problem | Solution |
|---------|----------|
| DBA Dash GUI is Windows-only | WebView runs in any browser — Mac, Linux, iPad, phone |
| Can't share dashboards with the team | One URL, everyone sees the same live data |
| VPN required to check server health | Deploy on an internal web server, access from anywhere on your network |
| No mobile-friendly monitoring | Responsive design works on tablets and phones |
| Setting up monitoring views takes time | Pre-built pages for the most common DBA workflows |

**Zero impact on your existing setup** — WebView reads from the same `DBADashDB` your collectors already write to. No additional agents, no schema changes, no configuration needed on monitored servers.

---

## Features

### Performance Summary Dashboard
Real-time overview of your entire fleet in a single table — CPU, waits, IO latency, IOPs per instance. Sortable columns, auto-refresh every 30 seconds, configurable color thresholds. Server tree sidebar grouped by SQL Server version.

### Performance Deep-Dive
- **Running Queries** — Live view of executing queries with blocking detection
- **Blocking Analysis** — Tree view of blocking chains, root blockers highlighted
- **Slow Queries** — Extended Events data with duration/DB/application filters
- **Wait Statistics** — Stacked area chart of wait types over time
- **Memory** — Buffer pool, PLE trends, memory clerk breakdown
- **IO Performance** — Read/write latency charts, IOPS, throughput per file
- **Object Execution Stats** — Stored procedure and function performance
- **Performance Counters** — Custom counter monitoring with trend charts
- **Query Store** — Top resource consumers from Query Store data

### Daily Health Checks
- **Backup Status** — Full/Diff/Log backup age per database, RPO compliance chart
- **Agent Jobs** — Job history with Gantt-style timeline visualization
- **Drive Space** — Capacity monitoring with usage projections
- **Database Space** — File-level space tracking with growth analysis
- **TempDB** — File configuration and usage monitoring
- **Alerts** — Alert inbox with severity filtering and acknowledgement

### Tracking & Compliance
- **Configuration Tracking** — Detect sp_configure changes with before/after diff
- **SQL Patching** — Version distribution across fleet, patch history
- **Schema Changes** — DDL change history timeline
- **Identity Columns** — Usage percentage with threshold alerts

### Administration
- **Configurable Thresholds** — Define warning/critical levels for dashboard color-coding
- **Active Directory Authentication** — LDAP integration with group-based roles
- **Server Management** — Add/remove monitored instances
- **Groups & Tags** — Organize instances for filtering
- **Users & RBAC** — Admin/Operator/Viewer roles
- **Data Retention** — Configure cleanup per data category

### User Experience
- **Command Palette** (Ctrl+K) — Instant search across instances, databases, jobs
- **Auto-Refresh** — Configurable intervals with countdown display
- **Dark Theme** — Optimized for NOC/SOC wall displays and extended monitoring
- **Responsive** — Collapsible sidebar, works on tablets
- **Fast** — React 19 + Vite, sub-second page transitions

---

## Screenshots

> *Coming soon — the project is actively being developed.*

---

## Quick Start

### Prerequisites

| Requirement | Version |
|-------------|---------|
| [DBA Dash](https://github.com/trimble-oss/DBADash) | Any (populated DBADashDB required) |
| [.NET 8 Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) | 8.0+ |
| SQL Server | 2014+ |

### Download & Run

1. Download the latest release from [Releases](https://github.com/BenediktSchackenberg/dbadashwebview/releases)
2. Extract the ZIP
3. Edit `appsettings.json` with your DBADashDB connection string:

```json
{
  "ConnectionStrings": {
    "DBADashDB": "Server=YOUR_SQL_SERVER;Database=DBADashDB;User Id=YOUR_USER;Password=YOUR_PASSWORD;TrustServerCertificate=true;"
  }
}
```

4. Deploy to IIS (see below) or run standalone:
```bash
dotnet DBADashWebView.dll
# Open http://localhost:5000
```

5. Login with `admin` / `admin` (change this in production)

---

## IIS Deployment

### 1. Install the ASP.NET Core Hosting Bundle

Download from [Microsoft](https://dotnet.microsoft.com/download/dotnet/8.0) → **Hosting Bundle** (not just Runtime).

```powershell
iisreset  # Restart IIS after installing
```

### 2. Create the IIS Site

```powershell
# Extract release
Expand-Archive -Path dbadash-webview.zip -DestinationPath C:\inetpub\dbadash

# Create App Pool + Site
Import-Module WebAdministration
New-WebAppPool -Name "DBADashWebView"
Set-ItemProperty "IIS:\AppPools\DBADashWebView" -Name "managedRuntimeVersion" -Value ""
New-Website -Name "DBADashWebView" -PhysicalPath "C:\inetpub\dbadash" -ApplicationPool "DBADashWebView" -Port 8080

# Grant permissions
icacls "C:\inetpub\dbadash" /grant "IIS AppPool\DBADashWebView:(OI)(CI)R" /T
```

### 3. Configure Connection String

Edit `C:\inetpub\dbadash\appsettings.json` with your DBADashDB credentials.

### 4. Browse to `http://your-server:8080`

### Troubleshooting

| Problem | Fix |
|---------|-----|
| 502.5 / 500.30 | Install the Hosting Bundle, then `iisreset` |
| Blank page | Check connection string in `appsettings.json` |
| No instances showing | Verify SQL user has `db_datareader` on DBADashDB |
| "HTTP Error 500.19" | Hosting Bundle missing or web.config invalid |

Enable detailed logs:
```xml
<!-- In web.config, set stdoutLogEnabled="true" -->
<aspNetCore stdoutLogEnabled="true" stdoutLogFile=".\logs\stdout" ... />
```

---

## Configuration

### SQL Server Permissions

WebView needs **read-only** access:

```sql
USE DBADashDB;
CREATE LOGIN [dbadashweb] WITH PASSWORD = 'YourSecurePassword';
CREATE USER [dbadashweb] FOR LOGIN [dbadashweb];
ALTER ROLE db_datareader ADD MEMBER [dbadashweb];
GRANT EXECUTE ON SCHEMA::dbo TO [dbadashweb];
```

### Active Directory Authentication

Configure via Settings → Users → LDAP tab, or edit `config/ad-config.json`:

```json
{
  "Enabled": true,
  "Server": "ldap://dc01.corp.local",
  "BaseDN": "DC=corp,DC=local",
  "BindUser": "CN=svc-dbadash,OU=Service,DC=corp,DC=local",
  "AdminGroup": "CN=DBA-Admins,OU=Groups,DC=corp,DC=local",
  "AllowLocalFallback": true
}
```

### Threshold Configuration

Configure dashboard color-coding via Settings → Thresholds. Define warning and critical levels per metric (CPU, latency, IOPs, etc.). Cells remain uncolored until you set thresholds.

---

## API Reference

All endpoints require JWT authentication (except `/api/auth/login` and `/api/health`).

<details>
<summary><strong>Authentication</strong></summary>

```
POST /api/auth/login    { "username": "admin", "password": "admin" }  →  { "token": "..." }
```
</details>

<details>
<summary><strong>Dashboard & Instances</strong></summary>

```
GET /api/health
GET /api/dashboard/stats
GET /api/dashboard/performance-summary
GET /api/instances
GET /api/instances/{id}
GET /api/instances/{id}/cpu
GET /api/instances/{id}/waits
GET /api/instances/{id}/drives
GET /api/instances/{id}/databases
GET /api/instances/{id}/backups
GET /api/instances/{id}/jobs
GET /api/instances/{id}/queries
```
</details>

<details>
<summary><strong>Performance</strong></summary>

```
GET /api/performance/running-queries?instanceId=
GET /api/performance/blocking?instanceId=
GET /api/performance/slow-queries?instanceId=&hours=24
GET /api/performance/memory?instanceId=
GET /api/performance/io?instanceId=
GET /api/performance/exec-stats?instanceId=&hours=24
GET /api/performance/waits-timeline?instanceId=&hours=24
GET /api/performance/counters?instanceId=&hours=24
GET /api/performance/query-store?instanceId=
```
</details>

<details>
<summary><strong>Monitoring & Tracking</strong></summary>

```
GET /api/monitoring/job-timeline?instanceId=&hours=24
GET /api/monitoring/configuration?instanceId=
GET /api/monitoring/configuration/changes?instanceId=&days=30
GET /api/monitoring/patching
GET /api/monitoring/schema-changes?instanceId=&days=30
GET /api/monitoring/identity-columns?instanceId=
GET /api/monitoring/tempdb?instanceId=
GET /api/monitoring/db-space?instanceId=
```
</details>

<details>
<summary><strong>Estate & Reports</strong></summary>

```
GET /api/alerts/recent
GET /api/jobs/recent
GET /api/jobs/failures
GET /api/drives
GET /api/backups/estate
GET /api/availability-groups
GET /api/availability-groups/{id}
```
</details>

<details>
<summary><strong>Settings</strong></summary>

```
GET  /api/settings/ad
POST /api/settings/ad
POST /api/settings/ad/test
GET  /api/settings/thresholds
POST /api/settings/thresholds
```
</details>

---

## Architecture

```
┌──────────────┐       ┌──────────────────┐       ┌─────────────┐
│  Browser     │──────▶│  ASP.NET Core 8  │──────▶│  DBADashDB  │
│  (React SPA) │       │  (Minimal API)   │       │  (SQL Server)│
└──────────────┘       └──────────────────┘       └──────┬──────┘
                              │                          │
                         IIS / Kestrel              DBA Dash
                         JWT Auth                   Collectors
                         Read-only queries               │
                                                  ┌──────┴──────┐
                                                  │ Your SQL    │
                                                  │ Servers     │
                                                  └─────────────┘
```

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, Framer Motion |
| Backend | ASP.NET Core 8 Minimal API, Microsoft.Data.SqlClient |
| Auth | JWT + optional LDAP/AD |
| Deployment | IIS with ASP.NET Core Module |
| CI/CD | GitHub Actions → ZIP artifact + GitHub Release |

---

## Building from Source

```bash
git clone https://github.com/BenediktSchackenberg/dbadashwebview.git
cd dbadashwebview

# Frontend
cd frontend && npm install && npm run build && cd ..

# Backend
cd backend && dotnet publish -c Release -o ../publish && cd ..

# Combine
cp -r frontend/dist/* publish/wwwroot/
```

---

## Roadmap

- [ ] Scheduled PDF reports via email
- [ ] Multi-tenant support (multiple DBADashDB repositories)
- [ ] Custom dashboard layouts
- [ ] Webhook notifications
- [ ] Dark/Light theme toggle
- [ ] Grafana-style alerting rules
- [ ] REST API for external integrations

---

## Contributing

Contributions welcome! Fork, create a feature branch, and submit a PR.

```bash
git checkout -b feature/my-feature
git commit -m 'feat: add my feature'
git push origin feature/my-feature
```

---

## Acknowledgements

**[DBA Dash](https://github.com/trimble-oss/DBADash)** by [Trimble](https://github.com/trimble-oss) — the engine behind all the monitoring data. DBA Dash is one of the best open-source SQL Server monitoring tools available. If you're not using it yet, [check it out](https://dbadash.com).

DBA Dash WebView is an independent project that provides a web frontend for DBA Dash data. It is not affiliated with or endorsed by Trimble or the DBA Dash project.

---

## License

[MIT](LICENSE) — DBA Dash WebView

[Apache 2.0](https://github.com/trimble-oss/DBADash/blob/main/LICENSE) — DBA Dash

---

<div align="center">

**Built by [Benedikt Schackenberg](https://github.com/BenediktSchackenberg)**

*If this project helps you, give it a star!*

</div>

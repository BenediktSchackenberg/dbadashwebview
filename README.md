<div align="center">

# 🖥️ DBA Dash Web View

**Enterprise-class web dashboard for SQL Server monitoring**

Built on top of [DBA Dash](https://github.com/trimble-oss/DBADash) — the open-source SQL Server monitoring tool.

[![Build & Release](https://github.com/BenediktSchackenberg/dbadashwebview/actions/workflows/build.yml/badge.svg)](https://github.com/BenediktSchackenberg/dbadashwebview/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Features](#-features) · [Quick Start](#-quick-start) · [IIS Deployment](#-iis-deployment) · [Configuration](#-configuration) · [API Reference](#-api-reference) · [Screenshots](#-screenshots)

</div>

---

## 📋 Overview

DBA Dash Web View provides a modern, browser-based UI for your existing DBA Dash repository database. It reads from the same `DBADashDB` that your DBA Dash collectors write to — no additional agents or collectors required.

**What you get:**
- Real-time estate health at a glance (dashboard heatmap, status cards)
- Deep-dive into any instance (CPU, waits, drives, databases, backups, jobs)
- Alert inbox with triage workflows
- Multi-metric analysis graphs with zoom and baseline comparison
- Estate-wide views for disk capacity, backup compliance, and Availability Groups
- Configurable reports with CSV export
- Full settings UI (servers, groups, users, retention, alerting)

**What you need:**
- A running [DBA Dash](https://github.com/trimble-oss/DBADash) setup with a populated `DBADashDB`
- A Windows Server with IIS (or any machine with .NET 8 for dev/testing)

---

## ✨ Features

### Overviews
| Feature | Description |
|---------|-------------|
| **Global Dashboard** | Heatmap grid of all instances, stat cards (healthy/warning/critical), failed jobs & alerts panels |
| **Instance Detail** | 6 tabs: Overview, Performance (CPU/Waits charts), Backups, Jobs, Databases, Drives |
| **Database Detail** | Per-database status, backup age, properties, recovery model |
| **Availability Groups** | Topology diagram (Primary → Secondaries), sync state, failover readiness |

### Monitoring
| Feature | Description |
|---------|-------------|
| **Alert Inbox** | Email-style inbox with severity filters, search, detail panel, acknowledge workflow |
| **Analysis Graph** | Multi-metric time series (CPU, IO, Memory) with Recharts brush/zoom and baseline overlay |
| **Query Analysis** | Top queries by CPU/IO/Duration, expandable query text, instance selector |

### Estate Views
| Feature | Description |
|---------|-------------|
| **Disk Usage & Projection** | All drives estate-wide, capacity bars, "days until full" linear projection |
| **Backups & RPO** | Backup matrix by instance, RPO distribution chart, compliance score |
| **AG Overview** | Aggregated AG health, failover readiness, sync status |

### Reports & Configuration
| Feature | Description |
|---------|-------------|
| **Report Center** | 5 built-in reports (Health, Backups, Disk, Jobs, Resources) with CSV export |
| **Server Management** | Add/edit/remove monitored servers |
| **Groups & Tags** | Organize instances into groups, apply tags for filtering |
| **Users & RBAC** | Local users, LDAP/OIDC placeholders, Admin/Operator/Viewer roles |
| **Data Retention** | Configure retention periods per data category |
| **Alert Configuration** | Alert types catalog, thresholds, notification channels, maintenance windows |

### UX
- 🔍 **Cmd+K Search** — find instances, databases, jobs instantly
- ⏱️ **Time Range Picker** — consistent focus window across all views
- 🌙 **Dark/Light Mode** — toggle in top bar, persistent
- 🧭 **Breadcrumbs** — always know where you are
- 🔄 **Auto-Refresh** — configurable 60s/120s interval
- 📱 **Responsive** — collapsible sidebar, works on tablets

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) | 8.0+ | For building the backend |
| [Node.js](https://nodejs.org/) | 18+ | For building the frontend |
| [DBA Dash](https://github.com/trimble-oss/DBADash) | Any | Must have a populated DBADashDB |
| SQL Server | 2016+ | Where DBADashDB lives |

### Option A: Download Release (recommended)

1. Go to [Releases](https://github.com/BenediktSchackenberg/dbadashwebview/releases)
2. Download the latest `dbadash-webview.zip`
3. Extract to your desired location (e.g. `C:\inetpub\dbadash`)
4. Edit `appsettings.json` with your connection string
5. Run or deploy to IIS (see below)

### Option B: Build from Source

```bash
# Clone
git clone https://github.com/BenediktSchackenberg/dbadashwebview.git
cd dbadashwebview

# Build frontend
cd frontend
npm install
npm run build
cd ..

# Build backend
cd backend
dotnet publish -c Release -o ../publish

# Copy frontend into publish folder
cp -r frontend/dist/* publish/wwwroot/
# (Windows: xcopy /E /I frontend\dist publish\wwwroot)
```

### Run in Development Mode

```bash
# Terminal 1: Backend
cd backend
dotnet run
# Runs on http://localhost:5000

# Terminal 2: Frontend (hot reload)
cd frontend
npm run dev
# Runs on http://localhost:5173, proxies /api to backend
```

Login: `admin` / `admin`

---

## 🌐 IIS Deployment

### Step 1: Install Prerequisites on the IIS Server

```powershell
# Install ASP.NET Core 8.0 Hosting Bundle (includes .NET Runtime + IIS module)
# Download from: https://dotnet.microsoft.com/download/dotnet/8.0
# → Look for "Hosting Bundle" under ASP.NET Core Runtime

# After installing, restart IIS:
iisreset
```

> **Important:** You need the **Hosting Bundle**, not just the Runtime. The Hosting Bundle includes the ASP.NET Core IIS Module.

### Step 2: Deploy the Application

**From Release ZIP:**
```powershell
# Extract the release ZIP
Expand-Archive -Path dbadash-webview.zip -DestinationPath C:\inetpub\dbadash
```

**From Source:**
```powershell
# Or copy your publish output
Copy-Item -Recurse publish\* C:\inetpub\dbadash
```

### Step 3: Configure the Connection String

Edit `C:\inetpub\dbadash\appsettings.json`:

```json
{
  "ConnectionStrings": {
    "DBADashDB": "Server=YOUR_SQL_SERVER;Database=DBADashDB;User Id=YOUR_USER;Password=YOUR_PASSWORD;TrustServerCertificate=true;Encrypt=false;"
  },
  "Jwt": {
    "Secret": "CHANGE-THIS-TO-A-RANDOM-STRING-AT-LEAST-32-CHARS!",
    "Issuer": "DBADashWebView",
    "Audience": "DBADashWebView",
    "ExpirationHours": 12
  }
}
```

> **Security:** Change the JWT secret to a random string. The default is for development only.

#### Connection String Examples

| Scenario | Connection String |
|----------|------------------|
| SQL Auth | `Server=sql01;Database=DBADashDB;User Id=dbadash;Password=MyPassword;TrustServerCertificate=true;` |
| Windows Auth | `Server=sql01;Database=DBADashDB;Trusted_Connection=true;TrustServerCertificate=true;` |
| Named Instance | `Server=sql01\DBADash;Database=DBADashDB;User Id=dbadash;Password=MyPassword;TrustServerCertificate=true;` |
| Non-default Port | `Server=sql01,1444;Database=DBADashDB;User Id=dbadash;Password=MyPassword;TrustServerCertificate=true;` |

### Step 4: Create the IIS Site

**Via IIS Manager (GUI):**

1. Open **IIS Manager** (`inetmgr`)
2. Right-click **Application Pools** → **Add Application Pool**
   - Name: `DBADashWebView`
   - .NET CLR version: **No Managed Code**
   - Managed pipeline mode: **Integrated**
3. Right-click **Sites** → **Add Website**
   - Site name: `DBADashWebView`
   - Application pool: `DBADashWebView`
   - Physical path: `C:\inetpub\dbadash`
   - Binding: `http`, Port `8080` (or your preferred port)
4. Click **OK**

**Via PowerShell (one-liner):**

```powershell
# Run as Administrator
Import-Module WebAdministration

# Create App Pool
New-WebAppPool -Name "DBADashWebView"
Set-ItemProperty "IIS:\AppPools\DBADashWebView" -Name "managedRuntimeVersion" -Value ""

# Create Site
New-Website -Name "DBADashWebView" `
  -PhysicalPath "C:\inetpub\dbadash" `
  -ApplicationPool "DBADashWebView" `
  -Port 8080

Write-Host "Site created! Browse to http://localhost:8080"
```

### Step 5: Set Folder Permissions

```powershell
# Grant IIS App Pool identity read access
icacls "C:\inetpub\dbadash" /grant "IIS AppPool\DBADashWebView:(OI)(CI)R" /T
```

### Step 6: Test

1. Browse to `http://your-server:8080`
2. Login with `admin` / `admin`
3. You should see the dashboard with your DBA Dash data

### Troubleshooting

| Problem | Solution |
|---------|----------|
| 502.5 / 500.30 error | Hosting Bundle not installed or IIS not restarted (`iisreset`) |
| Blank page, no data | Check connection string in `appsettings.json` |
| Login works but no instances | Verify the SQL user has `db_datareader` on `DBADashDB` |
| CORS errors in browser console | Shouldn't happen in production (SPA served from same origin) |
| Port already in use | Change the port in IIS bindings |
| "HTTP Error 500.19" | Check that `web.config` is valid XML, Hosting Bundle is installed |

#### Enable Logging

To debug issues, enable stdout logging in `web.config`:

```xml
<aspNetCore processPath="dotnet" arguments=".\DBADashWebView.dll"
  stdoutLogEnabled="true"
  stdoutLogFile=".\logs\stdout"
  hostingModel="InProcess">
```

Then check `C:\inetpub\dbadash\logs\` for detailed error logs.

---

## ⚙️ Configuration

### appsettings.json Reference

```json
{
  "ConnectionStrings": {
    "DBADashDB": "Server=...;Database=DBADashDB;..."
  },
  "Jwt": {
    "Secret": "your-secret-key-min-32-chars",
    "Issuer": "DBADashWebView",
    "Audience": "DBADashWebView",
    "ExpirationHours": 12
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  }
}
```

### SQL Server Permissions

The SQL user needs **read-only** access to DBADashDB:

```sql
USE DBADashDB;
CREATE LOGIN dbadash WITH PASSWORD = 'YourPassword';
CREATE USER dbadash FOR LOGIN dbadash;
ALTER ROLE db_datareader ADD MEMBER dbadash;

-- Grant execute on stored procedures used by the dashboard
GRANT EXECUTE ON SCHEMA::dbo TO dbadash;
```

### Authentication

Currently supports local authentication with a hardcoded user (`admin`/`admin`). The Settings → Users page provides the UI framework for:
- Local user management
- LDAP/Active Directory integration
- OpenID Connect (OIDC) SSO

These require backend implementation for your specific environment.

---

## 📡 API Reference

All endpoints require a valid JWT token (except `/api/auth/login` and `/api/health`).

### Authentication
```
POST /api/auth/login
Body: { "username": "admin", "password": "admin" }
Returns: { "token": "eyJ...", "username": "admin" }
```

### Dashboard
```
GET /api/health              — Health check
GET /api/dashboard/summary   — Estate summary (all instances + status)
```

### Instances
```
GET /api/instances                    — List all instances
GET /api/instances/{id}               — Instance detail + summary
GET /api/instances/{id}/cpu           — CPU history (24h)
GET /api/instances/{id}/waits         — Top waits (1h)
GET /api/instances/{id}/drives        — Instance drives
GET /api/instances/{id}/databases     — Instance databases
GET /api/instances/{id}/backups       — Instance backups
GET /api/instances/{id}/jobs          — Instance job history
GET /api/instances/{id}/queries       — Top queries
```

### Jobs
```
GET /api/jobs/recent     — Recent job executions
GET /api/jobs/failures   — Failed jobs (24h)
```

### Alerts
```
GET /api/alerts/recent   — Recent alerts
```

### Availability Groups
```
GET /api/availability-groups       — All AGs with instance names
GET /api/availability-groups/{id}  — AG detail with replicas + databases
```

### Drives & Backups
```
GET /api/drives            — Estate-wide drive status
GET /api/backups/estate    — Estate-wide backup status
```

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│                  │     │                  │     │                  │
│  React SPA       │────▶│  ASP.NET Core 8  │────▶│  DBADashDB       │
│  (Vite + TS)     │     │  (Minimal API)   │     │  (SQL Server)    │
│                  │     │                  │     │                  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
       │                        │                        ▲
       │  Static files          │  JWT Auth              │
       │  served by IIS         │  SqlClient             │  DBA Dash
       │  or Kestrel            │                        │  Collectors
       └────────────────────────┘                        │
                                                  ┌──────┴────────┐
                                                  │ Your SQL      │
                                                  │ Servers       │
                                                  └───────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, Framer Motion, Lucide Icons |
| Backend | ASP.NET Core 8 Minimal API, Microsoft.Data.SqlClient |
| Auth | JWT Bearer Tokens |
| Database | SQL Server (DBADashDB, read-only) |
| Deployment | IIS with ASP.NET Core Module, or standalone Kestrel |
| CI/CD | GitHub Actions (build on Windows, ZIP release artifact) |

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

DBA Dash is licensed under [Apache 2.0](https://github.com/trimble-oss/DBADash/blob/main/LICENSE) by Trimble. This project is an independent frontend that reads from the DBA Dash repository database — it is not a fork of DBA Dash.

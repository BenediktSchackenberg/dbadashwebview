# DBA Dash Web View

A modern web dashboard for [DBA Dash](https://github.com/trimble-oss/DBADash) SQL Server monitoring data.

## Tech Stack

- **Backend:** ASP.NET Core 8 (Minimal API) + Microsoft.Data.SqlClient
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Recharts
- **Deployment:** IIS (with SPA fallback)
- **Database:** DBADashDB (SQL Server, read-only access)

## Quick Start

### Prerequisites
- .NET 8 SDK
- Node.js 18+
- Access to a DBADashDB SQL Server database

### Backend
```bash
cd backend
# Edit appsettings.json — set your DBADashDB connection string
dotnet run
```

### Frontend (Dev)
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — the Vite dev server proxies `/api` to the backend.

### Production Build
```bash
cd frontend && npm run build
# Copy frontend/dist/* into backend/wwwroot/
cd ../backend && dotnet publish -c Release
# Deploy to IIS using the web.config
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health` | Health check |
| `GET /api/instances` | List all SQL Server instances |
| `GET /api/instances/{id}/status` | Instance status (backup, DBCC, disk) |
| `GET /api/performance/summary` | Performance overview |
| `GET /api/jobs/recent` | Recent SQL Agent jobs |

## License

MIT

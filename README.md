# DBA Dash Web View 🖥️

A modern web dashboard for [DBA Dash](https://github.com/trimble-oss/dba-dash) — providing a Redgate Monitor-style web interface for your SQL Server monitoring data.

## What is this?

DBA Dash collects SQL Server health, performance, and configuration data into a repository database. This project provides a **web-based frontend** to visualize that data — no WinForms client needed.

## Features (Planned)

### Phase 1 — Core Dashboard
- 🟢 Instance health overview (backup status, DBCC, disk space, AG health)
- 📊 Performance monitoring (CPU, memory, waits, IO over time)
- ⏱️ Agent job timeline & failure tracking
- 💾 Disk space overview across all instances
- 🔍 Quick search across instances

### Phase 2 — Deep Dive
- 🐌 Slow query analysis
- 📝 Schema change history
- ⚙️ Configuration drift detection
- 🔔 Alerting (Email, Discord, Teams)
- 📈 Historical trend analysis

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend  | React + TypeScript, Tailwind CSS, Recharts |
| Backend   | Python FastAPI |
| Database  | DBA Dash Repository DB (SQL Server, read-only) |
| Auth      | Optional — Windows Auth / API Key |

## Prerequisites

- A running DBA Dash setup with a populated repository database
- Python 3.11+
- Node.js 20+
- Network access to the DBADashDB SQL Server instance

## Quick Start

```bash
# Clone
git clone https://github.com/BenediktSchackenberg/dbadashwebview.git
cd dbadashwebview

# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # Configure your DB connection
uvicorn main:app --reload

# Frontend
cd ../frontend
npm install
npm run dev
```

## Project Structure

```
dbadashwebview/
├── backend/           # FastAPI backend
│   ├── main.py
│   ├── routers/       # API route modules
│   ├── models/        # DB models / schemas
│   └── requirements.txt
├── frontend/          # React frontend
│   ├── src/
│   └── package.json
└── docs/              # Documentation & schema notes
```

## License

MIT — This is an independent project, not affiliated with Trimble or DBA Dash.  
DBA Dash data is read in read-only mode from the existing repository database.

## Acknowledgements

- [DBA Dash](https://github.com/trimble-oss/dba-dash) by Trimble (Apache 2.0) — the excellent SQL Server monitoring tool this project builds upon
- Inspired by [Redgate SQL Monitor](https://www.red-gate.com/products/sql-monitor/)

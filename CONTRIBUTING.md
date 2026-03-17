# Contributing to DBA Dash WebView

Thanks for your interest in contributing! This project is a web frontend for [DBA Dash](https://github.com/trimble-oss/dba-dash) — the outstanding open-source SQL Server monitoring tool by Trimble.

## How to Contribute

### Reporting Bugs

- Open an [Issue](https://github.com/BenediktSchackenberg/dbadashwebview/issues) with:
  - Steps to reproduce
  - Expected vs actual behavior
  - Browser, OS, and DBA Dash version
  - Screenshots if applicable

### Suggesting Features

- Open an Issue tagged with `enhancement`
- Describe the use case and why it's useful

### Code Contributions

1. **Fork** the repository
2. **Clone** your fork
3. **Create a branch** for your change (`git checkout -b feature/my-feature`)
4. **Make your changes**
5. **Test** — ensure both frontend and backend build:
   ```bash
   cd frontend && npm install && npm run build
   cd ../backend && dotnet build
   ```
6. **Commit** with a clear message (`feat:`, `fix:`, `docs:` prefixes)
7. **Push** and create a **Pull Request**

### Development Setup

```bash
git clone https://github.com/YOUR_FORK/dbadashwebview.git
cd dbadashwebview

# Frontend (React + TypeScript + Vite)
cd frontend
npm install
npm run dev          # Dev server on http://localhost:5173

# Backend (ASP.NET Core 8)
cd ../backend
dotnet run           # API on http://localhost:5000
```

You need a running DBA Dash database — configure the connection string in `backend/appsettings.json`.

### Code Style

- **Frontend**: TypeScript strict mode, Tailwind CSS, functional components
- **Backend**: C# Minimal API pattern, parameterized SQL queries (no string interpolation!)
- **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`)

### What We Look For in PRs

- Clean, readable code
- No regressions — existing pages still work
- Dark theme consistency (glassmorphism, `bg-white/5`, etc.)
- SQL queries use parameters (`@param`), never string concatenation

## Questions?

Open a [Discussion](https://github.com/BenediktSchackenberg/dbadashwebview/discussions) or reach out via Issues.

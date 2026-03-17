# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | ✅ Yes             |
| older   | ❌ No              |

## Reporting a Vulnerability

If you discover a security vulnerability in DBA Dash WebView, please report it responsibly:

1. **Do NOT open a public Issue**
2. **Email**: [benedikt@schackenberg.dev](mailto:benedikt@schackenberg.dev)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

I'll respond within 48 hours and work on a fix before any public disclosure.

## Scope

This policy covers the DBA Dash WebView application (backend API + frontend SPA). It does **not** cover:

- DBA Dash itself (report to [trimble-oss/dba-dash](https://github.com/trimble-oss/dba-dash))
- Your SQL Server infrastructure
- Third-party dependencies (report upstream)

## Security Best Practices

When deploying DBA Dash WebView:

- **Change the default admin password** immediately
- Use a **dedicated SQL login** with `db_datareader` + `EXECUTE` only
- Deploy behind a **reverse proxy** with TLS
- Restrict network access to trusted subnets
- Enable **AD authentication** for production environments

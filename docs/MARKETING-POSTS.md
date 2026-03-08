# Marketing Posts — Ready to Copy & Paste

## 1. DBA Dash GitHub Discussion (Show and tell)

**Post here:** https://github.com/trimble-oss/dba-dash/discussions/new?category=show-and-tell

**Title:** `DBA Dash WebView — Free web dashboard for your DBA Dash data`

**Body:**

```
Hey everyone,

I've been using DBA Dash to monitor our SQL Server fleet (~200 instances) and it's been fantastic. The one thing I kept running into was that the GUI is Windows-only — our team uses a mix of platforms, and I wanted something I could pull up in a browser from anywhere.

So I built **[DBA Dash WebView](https://github.com/BenediktSchackenberg/dbadashwebview)** — a web frontend that reads directly from your existing DBADashDB. No additional agents, no schema changes, no impact on your DBA Dash setup.

### What it does

- **Performance Summary Dashboard** — Fleet-wide overview with CPU, waits, IO per instance
- **DBA Dash-style instance tree** — Grouped by SQL Server version, expandable categories
- **Management Reporting** — License overview, underutilized servers (with cost estimates), fleet stats
- **Backup & Recovery** — RPO analysis, estimated recovery times, sorted by business criticality
- **AlwaysOn HA/DR** — Cluster view with replica topology, live sync status, database trees
- **40+ pages total** — Running queries, blocking, waits, memory, IO, jobs, drives, patching, schema changes, and more

### Tech stack

ASP.NET Core 8 + React. Deploy to IIS, point at your DBADashDB, done. Everything is read-only.

### Important

All the heavy lifting is done by DBA Dash — this project just provides an alternative way to look at the data you're already collecting. Full credit to David Wiseman and the Trimble team for building such a solid foundation.

It's MIT licensed and completely free. Would love to hear feedback — what's useful, what's missing, what could be better.

**GitHub:** https://github.com/BenediktSchackenberg/dbadashwebview

Cheers,
Benedikt
```

---

## 2. Reddit r/SQLServer

**Post here:** https://www.reddit.com/r/SQLServer/submit

**Title:** `Built a free web dashboard for DBA Dash — monitor your SQL Servers from any browser`

**Body:**

```
We run ~200 SQL Servers monitored by DBA Dash (fantastic tool). My only gripe: the GUI is Windows-only. I wanted to check fleet health from my browser — on any device, any OS.

So I built DBA Dash WebView: a React + ASP.NET Core web app that reads from your existing DBADashDB. No agents, no schema changes, just a web frontend.

What's in it:
- Fleet performance dashboard with configurable thresholds
- Instance tree navigation (like native DBA Dash)
- Management reports: license overview, underutilized servers with estimated savings, fleet stats
- Backup & recovery overview with RPO analysis and recovery time estimates
- AlwaysOn HA/DR with cluster visualization and live sync status
- 40+ pages total (queries, blocking, waits, IO, jobs, drives, patching...)

Deploy: extract ZIP to IIS, set your connection string, go. 5 minutes.

It's free, MIT licensed, and open source. All credit for the actual monitoring goes to DBA Dash by Trimble.

GitHub: https://github.com/BenediktSchackenberg/dbadashwebview

Would love feedback from other DBAs!
```

---

## 3. Reddit r/sysadmin

**Post here:** https://www.reddit.com/r/sysadmin/submit

**Title:** `Open-source web dashboard for SQL Server fleet monitoring (companion to DBA Dash)`

**Body:**

```
If you manage SQL Servers and use DBA Dash for monitoring — I built a free web frontend that reads from your existing DBADashDB.

Why: DBA Dash has a great Windows GUI, but our team needed browser access. Now anyone with a link can see fleet health — no RDP, no VPN, no Windows required.

Key features:
- 40+ monitoring pages (performance, backups, jobs, drives, HA/DR, etc.)
- Management dashboards — license costs, underutilized servers, recovery time estimates
- Dark theme, works great on NOC displays
- IIS deployment, 5 minutes setup
- Read-only, zero impact on existing DBA Dash setup

Free, MIT licensed: https://github.com/BenediktSchackenberg/dbadashwebview

All the hard work is DBA Dash (Apache 2.0, by Trimble) — this just makes it browser-accessible.
```

---

## 4. Reddit r/selfhosted

**Post here:** https://www.reddit.com/r/selfhosted/submit

**Title:** `DBA Dash WebView — self-hosted web UI for SQL Server monitoring (free, open source)`

**Body:**

```
Built a self-hosted web dashboard for monitoring SQL Server fleets. It's a companion to DBA Dash (open-source SQL Server monitoring tool) — reads from the same database, gives you a browser-based UI.

- ASP.NET Core 8 + React frontend
- 40+ pages: performance, backups, jobs, HA/DR, reports
- Dark theme, responsive
- Deploy to IIS in 5 minutes
- MIT licensed

Requires an existing DBA Dash setup (which collects the data). If you run SQL Servers and don't know DBA Dash yet — check that out first, it's excellent.

GitHub: https://github.com/BenediktSchackenberg/dbadashwebview
```

---

## 5. Twitter/X

**Post here:** https://twitter.com/compose/tweet

```
Built a free web dashboard for @DBADashMonitor 🖥️

Monitor 200+ SQL Servers from any browser — performance, backups, HA/DR, license costs, recovery estimates.

React + ASP.NET Core, reads your existing DBADashDB. Zero additional setup.

MIT licensed → github.com/BenediktSchackenberg/dbadashwebview

#SQLServer #DBA #OpenSource #Monitoring
```

---

## 6. dev.to Article

**Post here:** https://dev.to/new

**Title:** `Building a Web Dashboard for SQL Server Fleet Monitoring`

*Use the blog post from schackenberg.com as the basis, expand with code snippets and architecture details.*

---

## 7. Hacker News (Show HN)

**Post here:** https://news.ycombinator.com/submit

**Title:** `Show HN: Open-source web dashboard for SQL Server monitoring (DBA Dash WebView)`

**URL:** `https://github.com/BenediktSchackenberg/dbadashwebview`

---

## 8. SQLServerCentral

**Post here:** https://www.sqlservercentral.com/ (forum or article submission)

Use the blog post content, adapted for a DBA audience.

---

## Posting Strategy

### This Week (Priority)
1. ⭐ **DBA Dash Discussion** — This is #1. Their community IS our target audience.
2. ⭐ **Reddit r/SQLServer** — High-relevance community
3. **Twitter/X** — Quick reach, use screenshot

### Next Week
4. **Reddit r/sysadmin** — Broader IT audience
5. **Reddit r/selfhosted** — Self-hosting community
6. **dev.to article** — Developer audience, SEO

### Later
7. **Hacker News** — Wait until we have screenshots + v0.1.0 proven stable
8. **SQLServerCentral** — Professional DBA audience
9. **YouTube demo** — 5-minute screencast

### Tips
- **Screenshots are CRITICAL** — Take 4-6 screenshots of the best pages and add them to the README before posting
- Post on Reddit Tues-Thurs for best visibility
- Don't post everywhere on the same day — spread it out
- Always credit DBA Dash prominently — the community will respect that
- Be honest about limitations — "it's early, we'd love feedback"
- Respond to every comment/question quickly

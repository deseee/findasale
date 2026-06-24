# Database Audit & Backup Strategy

**Date:** 2026-05-23  
**Database:** Railway PostgreSQL (Hobby plan), US East  
**Volume:** 1000 MB (resized from default)

---

## DB Space Audit Results

### Overview

| Metric | Value |
|--------|-------|
| Total database size | 281.1 MB |
| Table data | 172.5 MB |
| Indexes | 93.9 MB |
| System overhead | 13.3 MB |
| Other | 1.5 MB |
| WAL (write-ahead log) | 240.0 MB |
| Volume capacity | 1000 MB |
| Volume snapshot size | ~485 MB |
| Connections | 10/100 (10%) |
| Cache hit ratio | 92.82% |

### Top Tables by Size

| Table | Rows | Data | Indexes | Notes |
|-------|------|------|---------|-------|
| Organizer | 60.2K | 93.9 MB | 46.8 MB | Largest table by far — scraped organizer directory |
| User | 0 | 20.2 MB | 18.6 MB | **0 rows but 38.8 MB** — severe bloat from deleted/migrated data |
| Purchase | 0 | 120 KB | 120 KB | Empty, minimal space |
| All others | 0 | — | — | Empty tables, no space concern |

### Key Findings

**1. Organizer table dominates (140.7 MB = 50% of DB)**  
60.2K scraped organizer records with 93.9 MB data + 46.8 MB indexes. This is legitimate data — the organizer directory is a core feature. No action needed unless we want to archive old/inactive organizers.

**2. User table bloat (38.8 MB for 0 rows)**  
The User table has ZERO rows but consumes 38.8 MB (20.2 MB data + 18.6 MB indexes). This is dead space from the region migration or previous data wipes. A `VACUUM FULL` on this table would reclaim ~38 MB.

**3. WAL is 240 MB — nearly as large as the database itself**  
Write-ahead logs at 240 MB indicate either high write activity or WAL not being recycled efficiently. On Hobby plan, WAL management is limited. Consider running `CHECKPOINT` followed by monitoring if WAL shrinks.

**4. 20 unused indexes consuming 50.9 MB**  
Railway identified 20 indexes with zero scans. Top offenders:

| Index | Table | Size |
|-------|-------|------|
| User_email_key | User | 7.5 MB |
| Organizer_userId_key | Organizer | 5.8 MB |
| idx_Organizer_cashFeeBalance_updatedAt | Organizer | 5.5 MB |
| Organizer_dedupeKey_idx | Organizer | 5.3 MB |
| Organizer_corroborationScore_idx | Organizer | 4.0 MB |
| Sale_sourceUrl_idx | Sale | 3.8 MB |
| 14 more Organizer indexes | Organizer | ~19 MB |

**WARNING:** Some of these may be needed for future features or are Prisma `@unique` constraints. Don't blindly drop — review against schema.prisma first. But the `idx_Organizer_*` custom indexes that serve scraping/directory logic can likely be evaluated.

**5. 622 dead rows (minor, mostly in Sale table)**  
Sale has 615 dead rows but 0.0% dead ratio — autovacuum will handle this. No tables have been manually vacuumed ever, but bloat is minimal (Railway reports 0 tables with bloat).

**6. _prisma_migrations has 300% dead ratio**  
Only 1 live row, 3 dead — trivial space but indicative that migrations were run and rolled back during the region migration.

### Immediate Space Recovery Actions

| Action | Space recovered | Risk | How |
|--------|----------------|------|-----|
| VACUUM FULL on User table | ~38 MB | Low (0 rows) | Railway query editor: `VACUUM FULL "User";` |
| Drop unused indexes (after review) | Up to 50.9 MB | Medium — verify against schema first | `DROP INDEX IF EXISTS "index_name";` |
| VACUUM FULL on all tables | ~5-10 MB | Low | `VACUUM FULL;` (locks tables briefly) |
| **Total potential recovery** | **~90 MB** | | |

This would bring the DB from 281 MB to ~190 MB, giving much more breathing room on the 1 GB volume.

---

## Backup Strategy

### Railway Plan Constraint

Railway Hobby plan does **not** include scheduled backups or PITR (Point-in-Time Recovery). Those are Pro plan ($20/month) features. The only backup option on Hobby is manual volume snapshots (one at a time, each replaces previous).

### Two-Layer System (Active)

**Layer 1: Manual Railway Snapshots (before risky operations)**  
Before any migration or schema change, take a manual snapshot via Railway dashboard → Postgres → Backups tab. Instant, free, but only one retained on Hobby.

**Layer 2: Automated Comprehensive Daily Backup**  
Windows Task Scheduler runs `scripts\backup-everything.ps1` daily at 3 AM. Covers everything — not just the database.

### What Gets Backed Up (6 categories)

| # | Category | What's Included | Notes |
|---|----------|-----------------|-------|
| 1 | **Database** | pg_dump (custom format, compress 9) | Requires PostgreSQL client tools. Falls back to connection-info file if pg_dump missing |
| 2 | **Environment Variables** | All .env files (root, backend, frontend, database) + Railway env vars via CLI | Railway CLI export optional |
| 3 | **Infrastructure Config** | railway.toml, Dockerfile, docker-compose, schema.prisma, package.json, pnpm-workspace.yaml, .vercel/, full service inventory snapshot | Service inventory auto-documents all account IDs and endpoints |
| 4 | **Project Documentation** | All CLAUDE.md files, entire claude_docs/ directory, global Cowork CLAUDE.md | Complete project brain |
| 5 | **Skills** | All 35+ custom skills from Cowork skills directory | Full SKILL.md + supporting files |
| 6 | **Memory Files** | Cowork memory directory (MEMORY.md + all memory files) | Cross-session knowledge base |

### Scripts

| Script | Purpose | Location |
|--------|---------|----------|
| `backup-everything.ps1` | The backup itself — runs all 6 categories, compresses to zip, rotates old | `scripts\backup-everything.ps1` |
| `setup-backup-schedule.ps1` | One-time setup — registers Task Scheduler job for daily 3 AM runs | `scripts\setup-backup-schedule.ps1` |

### Schedule & Retention

- **Frequency:** Daily at 3:00 AM (Windows Task Scheduler)
- **Retention:** 7 days (auto-rotates older zips)
- **Storage:** `C:\Users\desee\ClaudeProjects\FindaSale\backups\`
- **Estimated size:** ~30–60 MB per zip (DB dump is largest component at ~30–50 MB compressed)
- **Max disk usage:** ~210–420 MB (7 days × 30–60 MB)

### Restore Procedure

```powershell
# Database restore from a dump file
$env:PGPASSWORD = "[current Railway password — check Railway dashboard Variables tab]"
pg_restore --host=maglev.proxy.rlwy.net --port=13949 --username=postgres --dbname=railway --clean --if-exists [path-to-dump-file]

# Then regenerate Prisma client
cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database
npx prisma generate
```

For non-DB restores: unzip the backup, copy files back to their original locations. Service inventory file documents all account IDs and endpoints needed to reconnect services.

### What Patrick Does Day-to-Day

**Nothing.** Task Scheduler handles it. Patrick only intervenes if:
- Before a migration: click "Create Backup" in Railway dashboard (30 seconds)
- If a backup failure appears in `backups\backup-log.txt`

### Setup (one-time)

Run from elevated PowerShell:
```powershell
cd C:\Users\desee\ClaudeProjects\FindaSale\scripts
.\setup-backup-schedule.ps1
```

### Cost

$0. Everything runs locally on Patrick's machine. Railway manual snapshots are free on Hobby.

---

## Upgrade Path

If/when FindA.Sale upgrades to Railway Pro ($20/month), enable:
1. Daily + Weekly + Monthly volume snapshots (automatic, ~$0.50/month extra)
2. PITR — continuous WAL archiving for second-precision recovery (~$0.50/month extra)

This would make the pg_dump portion redundant, but the non-DB backup categories (env vars, config, docs, skills, memory) would still run locally.

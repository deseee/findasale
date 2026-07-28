# FindA.Sale Comprehensive Daily Backup Script
# Backs up: Git repo, Database, env vars, Railway config, skills, CLAUDE.md, claude_docs
# Runs daily via Task Scheduler. Keeps 7 days of backups.
# Created: 2026-05-23
# SECURITY (2026-07-26, S1078 follow-up): this script no longer hardcodes credentials.
# RAILWAY_TOKEN and (for the direct-pg_dump fallback path only) PGPASSWORD are loaded
# below from the project's gitignored .secrets.env (see .secrets.env.template) if not
# already present in the environment. This works the same for an interactive run and
# for the unattended Task Scheduler run (which uses -NoProfile and inherits neither a
# PowerShell profile nor any $env: value set only in an open terminal).
# A prior version of this file had both hardcoded in cleartext; that Railway token has
# been revoked and rotated. If you are restoring this script from an old backup or an
# old git ref, do NOT reintroduce hardcoded values here.
# FIX 2026-07-28: the RAILWAY_TOKEN check below was failing every night because nothing
# ever actually loaded it for the unattended run -- this loader is the fix. See
# .secrets.env for where to paste a fresh Railway project token (the previous one is dead).

param(
    [int]$RetentionDays = 7,
    [switch]$SkipDB
)

$ErrorActionPreference = "Continue"
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$projectRoot = "C:\Users\desee\ClaudeProjects\FindaSale"
$backupRoot = "C:\Users\desee\ClaudeProjects\FindaSale\backups"
$backupDir = "$backupRoot\$timestamp"
$logFile = "$backupRoot\backup-log.txt"
$errorLogFile = "$backupRoot\backup-log-error.txt"

# Ensure backup root exists before anything else
if (!(Test-Path $backupRoot)) { New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null }

# Load secrets from the project's gitignored .secrets.env (export KEY="value" lines),
# for any key not already set in this process's environment. Doing this here -- as a
# file read, not an inherited env var -- means it works identically whether this script
# is run interactively or via Task Scheduler (-NoProfile, no inherited shell state).
$secretsFile = "$projectRoot\.secrets.env"
if (Test-Path $secretsFile) {
    Get-Content $secretsFile | ForEach-Object {
        if ($_ -match '^\s*export\s+([A-Z_]+)=(.*)$') {
            $name = $matches[1]
            $value = $matches[2].Trim('"').Trim("'")
            if ($value -and -not (Get-Item "Env:$name" -ErrorAction SilentlyContinue)) {
                Set-Item "Env:$name" $value
            }
        }
    }
    Write-Host "  Loaded secrets from .secrets.env (existing env vars take precedence)"
} else {
    Write-Host "  NOTE: .secrets.env not found at $secretsFile -- RAILWAY_TOKEN/PGPASSWORD must already be in the environment"
}

# --- Helpers ---
function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | $msg"
    Write-Host $line
    # Robust write: retry a few times to survive transient locks (AV scan,
    # OneDrive sync, a concurrent run), then fall back to a separate
    # error-log file so a logging failure is never completely silent.
    $writeOk = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Add-Content -Path $logFile -Value $line -ErrorAction Stop
            $writeOk = $true
            break
        } catch {
            if ($attempt -lt 3) {
                Start-Sleep -Milliseconds (200 * $attempt)
            }
        }
    }
    if (-not $writeOk) {
        # Best-effort fallback — must never throw and must never interrupt
        # the actual backup steps, even if this write also fails.
        try {
            Add-Content -Path $errorLogFile -Value "$line [PRIMARY LOG WRITE FAILED after 3 attempts]" -ErrorAction Stop
        } catch {
            # Swallow — logging is best-effort only, never fatal to the backup.
        }
    }
}

function Safe-Copy($src, $dest) {
    if (Test-Path $src) {
        $destDir = Split-Path $dest -Parent
        if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item -Path $src -Destination $dest -Force
        Log "  OK: $src"
    } else {
        Log "  SKIP (not found): $src"
    }
}

function Safe-CopyDir($src, $dest) {
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $dest -Recurse -Force
        $count = (Get-ChildItem $dest -Recurse -File).Count
        Log "  OK: $src ($count files)"
    } else {
        Log "  SKIP (not found): $src"
    }
}

# --- Top-level error trap ---
# Ensures ANY terminating exception anywhere below gets a diagnostic write
# to both log files and causes the script to exit 1 (so Task Scheduler's
# "Last Run Result" reflects real failures instead of always showing success).
$script:BackupFailureReason = $null

try {

# --- Start ---
Log "=========================================="
Log "FindA.Sale Backup Started: $timestamp"
Log "=========================================="

# Create backup directory
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

# ============================================
# 0. GIT REPO (full bundle — all branches, all history)
# ============================================
Log "[0/6] Git repo bundle..."
$gitDir = "$backupDir\git"
New-Item -ItemType Directory -Path $gitDir -Force | Out-Null
$gitExe = Get-Command git -ErrorAction SilentlyContinue
if ($gitExe) {
    $bundleFile = "$gitDir\findasale.bundle"
    Push-Location $projectRoot
    git bundle create $bundleFile --all 2>&1
    Pop-Location
    if ($LASTEXITCODE -eq 0 -and (Test-Path $bundleFile)) {
        $bundleMB = [math]::Round((Get-Item $bundleFile).Length / 1MB, 1)
        Log "  Git bundle: $bundleMB MB (all branches)"
    } else {
        Log "  ERROR: git bundle failed (exit $LASTEXITCODE)"
    }
} else {
    Log "  SKIP: git not found"
}

# ============================================
# 1. DATABASE (pg_dump)
# ============================================
if (-not $SkipDB) {
    Log "[1/6] Database backup..."
    $dbDir = "$backupDir\database"
    New-Item -ItemType Directory -Path $dbDir -Force | Out-Null

    # Check if pg_dump and Railway CLI are available
    $pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
    $railwayCli = Get-Command railway -ErrorAction SilentlyContinue
    $dumpFile = "$dbDir\findasale.dump"

    if ($pgDump -and $railwayCli -and -not $env:RAILWAY_TOKEN) {
        Log "  ERROR: RAILWAY_TOKEN not set in environment -- cannot use Railway CLI path. Set it before running this script (see header comment)."
    } elseif ($pgDump -and $railwayCli) {
        # Best path: get current public URL from Railway CLI (password auto-updates)
        # Pass full connection string directly to pg_dump — no parsing, no escaping issues
        $connStr = (railway run --service Postgres -- cmd /c "echo %DATABASE_PUBLIC_URL%" 2>$null).Trim()
        if ($connStr) {
            # Append sslmode if not already present
            if ($connStr -notmatch 'sslmode=') { $connStr = "$connStr`?sslmode=require" }
            pg_dump "$connStr" --format=custom --compress=9 --file=$dumpFile 2>&1
            if ($LASTEXITCODE -eq 0) {
                $sizeMB = [math]::Round((Get-Item $dumpFile).Length / 1MB, 1)
                Log "  DB dump via Railway CLI: $sizeMB MB"
            } else {
                Log "  ERROR: pg_dump with connection string failed (exit $LASTEXITCODE)"
            }
        } else {
            Log "  ERROR: Could not get DATABASE_PUBLIC_URL from Railway CLI"
        }
    } elseif ($pgDump -and -not $env:PGPASSWORD) {
        Log "  ERROR: PGPASSWORD not set in environment -- skipping direct pg_dump fallback. Set it before running this script (see header comment)."
    } elseif ($pgDump) {
        # Fallback: direct connection. PGPASSWORD must already be set in the
        # environment (e.g. sourced from a local, gitignored secrets file) --
        # this script never hardcodes it. Password rotates periodically; get the
        # current value from the Railway dashboard (Postgres service > Variables).
        $env:PGSSLMODE = "require"
        pg_dump --host=maglev.proxy.rlwy.net --port=13949 --username=postgres --dbname=railway --format=custom --compress=9 --file=$dumpFile 2>&1
        if ($LASTEXITCODE -eq 0) {
            $sizeMB = [math]::Round((Get-Item $dumpFile).Length / 1MB, 1)
            Log "  DB dump: $sizeMB MB"
        } else {
            Log "  ERROR: pg_dump failed (exit code $LASTEXITCODE). Password may have rotated - check Railway dashboard."
        }
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    } else {
        Log "  SKIP: pg_dump not found. Install PostgreSQL client tools to enable DB backups."
        Log "  Download: https://www.postgresql.org/download/windows/"
        # Fallback: save connection info so restore is possible from Railway snapshot
        @"
Railway PostgreSQL Connection (for manual restore):
Host: maglev.proxy.rlwy.net
Port: 13949
User: postgres
Database: railway
Password: [stored in Railway dashboard > Postgres > Variables]
Hobby plan — manual snapshots only (Railway dashboard > Postgres > Backups)
"@ | Out-File "$dbDir\connection-info.txt" -Encoding UTF8
    }
} else {
    Log "[1/6] Database backup SKIPPED (flag)"
}

# ============================================
# 2. ENVIRONMENT VARIABLES (all .env files)
# ============================================
Log "[2/6] Environment variables..."
$envDir = "$backupDir\env-vars"
New-Item -ItemType Directory -Path $envDir -Force | Out-Null

Safe-Copy "$projectRoot\.env" "$envDir\root.env"
Safe-Copy "$projectRoot\packages\backend\.env" "$envDir\backend.env"
Safe-Copy "$projectRoot\packages\frontend\.env" "$envDir\frontend.env"
Safe-Copy "$projectRoot\packages\frontend\.env.local" "$envDir\frontend.env.local"
Safe-Copy "$projectRoot\packages\database\.env" "$envDir\database.env"

# Railway env vars via CLI (if available)
$railwayCli = Get-Command railway -ErrorAction SilentlyContinue
if ($railwayCli -and -not $env:RAILWAY_TOKEN) {
    Log "  ERROR: RAILWAY_TOKEN not set in environment -- skipping Railway env var export. Set it before running this script (see header comment)."
} elseif ($railwayCli) {
    try {
        railway vars --service Postgres 2>$null | Out-File "$envDir\railway-postgres-vars.txt" -Encoding UTF8
        railway vars --service backend 2>$null | Out-File "$envDir\railway-backend-vars.txt" -Encoding UTF8
        Log "  Railway env vars exported"
    } catch {
        Log "  Railway CLI vars export failed: $_"
    }
} else {
    Log "  SKIP: Railway CLI not installed (env vars not exported)"
}

# ============================================
# 3. INFRASTRUCTURE CONFIG
# ============================================
Log "[3/6] Infrastructure config..."
$infraDir = "$backupDir\infra"
New-Item -ItemType Directory -Path $infraDir -Force | Out-Null

# Railway
Safe-Copy "$projectRoot\railway.toml" "$infraDir\railway.toml"
Safe-Copy "$projectRoot\railway.staging.toml" "$infraDir\railway.staging.toml"

# Vercel
if (Test-Path "$projectRoot\.vercel") {
    Safe-CopyDir "$projectRoot\.vercel" "$infraDir\vercel"
}

# Docker
Safe-Copy "$projectRoot\packages\backend\Dockerfile.production" "$infraDir\Dockerfile.production"
Safe-Copy "$projectRoot\docker-compose.yml" "$infraDir\docker-compose.yml"
Safe-Copy "$projectRoot\docker-compose.prod.yml" "$infraDir\docker-compose.prod.yml"

# Prisma schema (the schema IS the DB structure backup)
Safe-Copy "$projectRoot\packages\database\prisma\schema.prisma" "$infraDir\schema.prisma"

# Package configs
Safe-Copy "$projectRoot\package.json" "$infraDir\root-package.json"
Safe-Copy "$projectRoot\pnpm-workspace.yaml" "$infraDir\pnpm-workspace.yaml"

# Service account info snapshot
@"
=== FindA.Sale Service Inventory (auto-generated $timestamp) ===

RAILWAY (keen-wisdom project)
  Project ID: 84959dd6-58d1-487c-8b75-2fe6207c8108
  Backend: backend-production-153c9.up.railway.app
  Postgres: maglev.proxy.rlwy.net:13949/railway (US East)
  Redis: redis-volume
  MCP Server: mcp.finda.sale
  Plan: Hobby

VERCEL
  Frontend: finda.sale
  Dashboard: vercel.com/patricks-projects

STRIPE
  Account: acct_1T3kXhLIWHQCHu75
  Mode: TEST (sk_test_...)
  Dashboard: dashboard.stripe.com/acct_1T3kXhLIWHQCHu75

MAILERLITE
  Account ID: 2169788
  Email: $env:ADMIN_SEED_EMAIL

DOMAIN
  Registrar: Spaceship
  DNS: Vercel (Patrick's projects)
  Domain: finda.sale

SENTRY
  Error tracking enabled

CLOUDINARY
  Cloud: db8yhzjdq

RESEND
  From: noreply@finda.sale

TWILIO
  SID: [see Railway env TWILIO_ACCOUNT_SID]
  Phone: +18556943115
"@ | Out-File "$infraDir\service-inventory.txt" -Encoding UTF8
Log "  Service inventory snapshot saved"

# ============================================
# 4. CLAUDE DOCS & PROJECT DOCS
# ============================================
Log "[4/6] Project documentation..."
$docsDir = "$backupDir\docs"
New-Item -ItemType Directory -Path $docsDir -Force | Out-Null

# CLAUDE.md files
Safe-Copy "$projectRoot\CLAUDE.md" "$docsDir\CLAUDE.md"
Safe-Copy "$projectRoot\packages\backend\CLAUDE.md" "$docsDir\backend-CLAUDE.md"
Safe-Copy "$projectRoot\packages\frontend\CLAUDE.md" "$docsDir\frontend-CLAUDE.md"
Safe-Copy "$projectRoot\packages\database\CLAUDE.md" "$docsDir\database-CLAUDE.md"

# claude_docs directory (full copy)
if (Test-Path "$projectRoot\claude_docs") {
    Safe-CopyDir "$projectRoot\claude_docs" "$docsDir\claude_docs"
}

# Rolling per-file snapshots of the load-bearing docs (STATE.md, session-log.md,
# patrick-dashboard.md, roadmap.md). claude_docs/ is gitignored -- no git history --
# so the full zip above (once/day) plus these rolling per-file snapshots are the
# only recovery path. Added 2026-07-27 after a real STATE.md truncation was found
# on disk with no way to recover the original text.
$pythonExe = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonExe) { $pythonExe = Get-Command python3 -ErrorAction SilentlyContinue }
if ($pythonExe) {
    Push-Location $projectRoot
    & $pythonExe.Source "claude_docs\operations\backup-claude-docs.py" 2>&1 | ForEach-Object { Log "  [rolling-backup] $_" }
    Pop-Location
} else {
    Log "  SKIP: python/python3 not found -- rolling per-file claude_docs snapshots not run this pass (full claude_docs/ zip above still covers it once per day)"
}

# Global Cowork CLAUDE.md
$globalClaude = "$env:APPDATA\Claude\local-agent-mode-sessions\42d3662d-10d1-4e34-9d2d-01726cdad063\5685eb83-5389-4313-9ba3-a01c604a25c3\local_a60b6242-9fd7-48ea-b234-9f3be1454c97\.claude\CLAUDE.md"
if (Test-Path $globalClaude) {
    Safe-Copy $globalClaude "$docsDir\global-cowork-CLAUDE.md"
}

# ============================================
# 5. SKILLS (all 35 custom skills)
# ============================================
Log "[5/6] Skills backup..."
$skillsDir = "$backupDir\skills"
# Try both possible locations (standard AppData and Windows package sandbox)
$skillsPaths = @(
    "$env:APPDATA\Claude\local-agent-mode-sessions\skills-plugin\5685eb83-5389-4313-9ba3-a01c604a25c3\42d3662d-10d1-4e34-9d2d-01726cdad063\skills",
    "$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\local-agent-mode-sessions\skills-plugin\5685eb83-5389-4313-9ba3-a01c604a25c3\42d3662d-10d1-4e34-9d2d-01726cdad063\skills"
)
$skillsFound = $false
foreach ($sp in $skillsPaths) {
    if (Test-Path $sp) {
        Safe-CopyDir $sp $skillsDir
        $skillsFound = $true
        break
    }
}
if (-not $skillsFound) {
    # Search broadly for any skills-plugin directory
    $search = Get-ChildItem "$env:LOCALAPPDATA\Packages\Claude_*" -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Get-ChildItem $_.FullName -Recurse -Directory -Filter "skills-plugin" -ErrorAction SilentlyContinue } |
        Select-Object -First 1
    if ($search) {
        $found = Get-ChildItem $search.FullName -Recurse -Directory -Filter "skills" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            Safe-CopyDir $found.FullName $skillsDir
            Log "  Found skills at: $($found.FullName)"
            $skillsFound = $true
        }
    }
    if (-not $skillsFound) {
        Log "  SKIP: Skills directory not found in either Roaming or Package sandbox"
    }
}

# ============================================
# 6. MEMORY FILES
# ============================================
Log "[6/6] Memory files..."
$memDir = "$backupDir\memory"
$memPaths = @(
    "$env:APPDATA\Claude\local-agent-mode-sessions\42d3662d-10d1-4e34-9d2d-01726cdad063\5685eb83-5389-4313-9ba3-a01c604a25c3\spaces\a6969354-47f4-4603-9410-66b9e5e9e0f2\memory",
    "$env:LOCALAPPDATA\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\local-agent-mode-sessions\42d3662d-10d1-4e34-9d2d-01726cdad063\5685eb83-5389-4313-9ba3-a01c604a25c3\spaces\a6969354-47f4-4603-9410-66b9e5e9e0f2\memory"
)
$memFound = $false
foreach ($mp in $memPaths) {
    if (Test-Path $mp) {
        Safe-CopyDir $mp $memDir
        $memFound = $true
        break
    }
}
if (-not $memFound) {
    Log "  SKIP: Memory directory not found in either Roaming or Package sandbox"
}

# ============================================
# COMPRESS & CLEANUP
# ============================================
Log "Compressing backup..."
$zipFile = "$backupRoot\findasale-backup-$timestamp.zip"
Compress-Archive -Path "$backupDir\*" -DestinationPath $zipFile -CompressionLevel Optimal
$zipSizeMB = [math]::Round((Get-Item $zipFile).Length / 1MB, 1)
Log "Compressed: $zipFile ($zipSizeMB MB)"

# Remove uncompressed folder (keep only zip)
Remove-Item -Path $backupDir -Recurse -Force
Log "Cleaned up uncompressed folder"

# Rotate old backups (keep last N days)
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$old = Get-ChildItem $backupRoot -Filter "findasale-backup-*.zip" |
    Where-Object { $_.LastWriteTime -lt $cutoff }
if ($old) {
    $old | Remove-Item -Force
    Log "Rotated $($old.Count) old backup(s) (older than $RetentionDays days)"
} else {
    Log "No old backups to rotate"
}

# Summary
$allBackups = Get-ChildItem $backupRoot -Filter "findasale-backup-*.zip"
$totalMB = [math]::Round(($allBackups | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
Log ""
Log "=========================================="
Log "Backup Complete!"
Log "  File: $zipFile"
Log "  Size: $zipSizeMB MB"
Log "  Total backups: $($allBackups.Count) ($totalMB MB)"
Log "  Retention: $RetentionDays days"
Log "=========================================="

}
catch {
    $script:BackupFailureReason = $_.Exception.Message
    $diagLines = @(
        "EXCEPTION: $($_.Exception.Message)",
        "STACK TRACE: $($_.ScriptStackTrace)"
    )
    foreach ($d in $diagLines) {
        try { Add-Content -Path $logFile -Value $d -ErrorAction Stop } catch {}
        try { Add-Content -Path $errorLogFile -Value $d -ErrorAction Stop } catch {}
    }
    Log "  FATAL ERROR: $($_.Exception.Message)"
}
finally {
    if ($script:BackupFailureReason) {
        Log "RUN ENDED - FAILURE: $($script:BackupFailureReason)"
    } else {
        Log "RUN ENDED - SUCCESS"
    }
}

if ($script:BackupFailureReason) {
    exit 1
}

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
# FIX 2026-07-28 (part 2, S1176): the loader above was only half the bug. The OTHER half
# was that the failure was SILENT -- on 2026-07-27 and 2026-07-28 the DB dump was skipped,
# yet the script logged "RUN ENDED - SUCCESS" and exited 0, so Task Scheduler reported
# SUCCESS on two consecutive dumpless backups and backup-log-error.txt was never created.
# Every category that can fail to produce its artifact now records that failure, the DB
# dump is verified by SIZE (not just pg_dump's exit code), rotation is skipped on a failed
# run so a bad night cannot purge the last good backup, and the script exits non-zero.

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

# NOTE (S1176): the .secrets.env loader used to run HERE, above the Log helper, so its
# result only ever reached Write-Host and never backup-log.txt -- under Task Scheduler
# that output goes nowhere at all. It now runs inside the try block below, after Log and
# the failure helpers exist. See "--- Load secrets (.secrets.env) ---".

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
$script:ExitCode = 0

# --- Failure / warning tracking (added S1176) ---
# A category that cannot produce its artifact MUST make the run non-zero. Before this,
# a skipped DB dump only called Log "  ERROR: ..." and the run still ended SUCCESS.
#   Add-Failure -> hard failure, exit 1, no rotation of old backups
#   Add-Warning -> degraded/partial, exit 2, backup still usable
$script:BackupFailures = New-Object System.Collections.ArrayList
$script:BackupWarnings = New-Object System.Collections.ArrayList

# DB dump size gates. Known-good custom-format dump is ~38 MB (the 2026-07-26 zip
# contains database\findasale.dump at 38.2 MB). The hard floor is 5 MB -- about 13% of
# known-good: far below any plausible legitimate shrinkage of this database, but well
# above a 0-byte, truncated, or aborted dump, which is what we actually need to catch.
# 20 MB (~half of known-good) is a warn-only tripwire for "still writing, but suspicious".
$script:DbDumpMinBytes  = 5MB
$script:DbDumpWarnBytes = 20MB

function Add-Failure($category, $msg) {
    [void]$script:BackupFailures.Add("$category - $msg")
    Log "  FAIL [$category] $msg"
}

function Add-Warning($category, $msg) {
    [void]$script:BackupWarnings.Add("$category - $msg")
    Log "  WARN [$category] $msg"
}

# Verify an artifact landed on disk at a plausible size. Exit codes lie; file size does not.
function Assert-Artifact($category, $path, $minBytes) {
    if (!(Test-Path $path)) {
        Add-Failure $category "artifact was never created at $path"
        return
    }
    $len = (Get-Item $path).Length
    $mb = [math]::Round($len / 1MB, 2)
    if ($len -lt $minBytes) {
        Add-Failure $category "artifact is only $mb MB at $path (hard floor $([math]::Round($minBytes / 1MB, 2)) MB) -- treating as truncated/failed"
        return
    }
    Log "  VERIFIED [$category] $mb MB at $path"
}

function Assert-Dir($category, $path, $minFiles) {
    if (!(Test-Path $path)) {
        Add-Failure $category "directory was never created at $path"
        return
    }
    $count = (Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue).Count
    if ($count -lt $minFiles) {
        Add-Failure $category "only $count file(s) at $path (expected at least $minFiles) -- incomplete copy"
        return
    }
    Log "  VERIFIED [$category] $count files at $path"
}

# The DB dump has no other recovery path, so it gets its own check: pg_dump can exit 0
# having written a 0-byte or partial file (disk full, killed connection, SSL reset).
function Assert-DbDump($path) {
    if (!(Test-Path $path)) {
        Add-Failure "DATABASE" "pg_dump reported success but no dump file exists at $path. NO DATABASE DUMP IN THIS BACKUP."
        return
    }
    $len = (Get-Item $path).Length
    $mb = [math]::Round($len / 1MB, 2)
    if ($len -lt $script:DbDumpMinBytes) {
        Add-Failure "DATABASE" "dump is only $mb MB (hard floor $([math]::Round($script:DbDumpMinBytes / 1MB, 0)) MB, known-good ~38 MB) -- empty or truncated. NOT A USABLE BACKUP."
        return
    }
    if ($len -lt $script:DbDumpWarnBytes) {
        Add-Warning "DATABASE" "dump is $mb MB, far below the ~38 MB norm -- verify the database is intact"
    }
    Log "  VERIFIED [DATABASE] dump is $mb MB at $path"
}

try {

# --- Start ---
Log "=========================================="
Log "FindA.Sale Backup Started: $timestamp"
Log "=========================================="

# --- Load secrets (.secrets.env) ---
# Load secrets from the project's gitignored .secrets.env (KEY=value or `export KEY=value`
# lines) for any key not already set in this process's environment. Doing this as a file
# read, not an inherited env var, means it works identically for an interactive run and
# for Task Scheduler (-NoProfile, no inherited shell state).
# Hardened S1176 -- the previous regex was ^\s*export\s+([A-Z_]+)=(.*)$ with
# .Trim('"').Trim("'"), which silently dropped or mangled: keys containing digits
# (API_KEY_2), lines without the `export` prefix, whitespace around `=`, and -- the
# dangerous one on Windows -- it relied entirely on Get-Content to strip CRLF. A stray
# \r or trailing space inside a token value produces a token that LOOKS present and
# fails auth with no useful error. Everything below is now explicit.
$secretsFile = "$projectRoot\.secrets.env"
$loadedKeys = @()
if (Test-Path $secretsFile) {
    foreach ($rawLine in (Get-Content $secretsFile)) {
        $line = $rawLine -replace '[\r\n]', ''
        if ($line -match '^\s*$') { continue }
        if ($line -match '^\s*#') { continue }
        if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            $name  = $matches[1]
            $value = $matches[2]
            # Strip exactly ONE matched pair of surrounding quotes. The old
            # .Trim('"') stripped EVERY leading/trailing quote character.
            if ($value.Length -ge 2 -and
                (($value.StartsWith('"') -and $value.EndsWith('"')) -or
                 ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $value = ($value -replace '[\r\n]', '')
            if (-not $value) { continue }
            if (Get-Item "Env:$name" -ErrorAction SilentlyContinue) { continue }
            Set-Item "Env:$name" $value
            $loadedKeys += $name
        } else {
            Log "  NOTE: ignoring unparseable line in .secrets.env (no KEY=value match)"
        }
    }
    Log "  Loaded $($loadedKeys.Count) key(s) from .secrets.env: $($loadedKeys -join ', ') (existing env vars take precedence)"
} else {
    Add-Failure "SECRETS" ".secrets.env not found at $secretsFile -- RAILWAY_TOKEN/PGPASSWORD cannot be loaded"
}

# NEVER log a token VALUE -- presence and length only. That is enough to diagnose an
# empty, truncated, or whitespace-mangled token without writing the secret to disk.
if ($env:RAILWAY_TOKEN) {
    Log "  RAILWAY_TOKEN present (length $($env:RAILWAY_TOKEN.Length))"
    if ($env:RAILWAY_TOKEN -match '\s') {
        Add-Failure "SECRETS" "RAILWAY_TOKEN contains whitespace or a line break -- Railway auth will fail. Re-paste it in .secrets.env with no trailing space and no wrapped line."
    }
} else {
    Log "  RAILWAY_TOKEN NOT present after secret load"
}

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
        # Size-verify as well as exit-code-verify. Last good bundle was 36 MB.
        Assert-Artifact "GIT" $bundleFile 1MB
    } else {
        Add-Failure "GIT" "git bundle failed (exit $LASTEXITCODE) -- NO REPO BUNDLE IN THIS BACKUP"
    }
} else {
    Add-Failure "GIT" "git not found on PATH -- NO REPO BUNDLE IN THIS BACKUP"
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
        Add-Failure "DATABASE" "RAILWAY_TOKEN not set in environment -- cannot use Railway CLI path. Paste a fresh Railway project token into .secrets.env. NO DATABASE DUMP IN THIS BACKUP."
    } elseif ($pgDump -and $railwayCli) {
        # Best path: get current public URL from Railway CLI (password auto-updates)
        # Pass full connection string directly to pg_dump — no parsing, no escaping issues
        $connStr = (railway run --service Postgres -- cmd /c "echo %DATABASE_PUBLIC_URL%" 2>$null).Trim()
        if ($connStr) {
            # Append sslmode if not already present
            if ($connStr -notmatch 'sslmode=') { $connStr = "$connStr`?sslmode=require" }
            pg_dump "$connStr" --format=custom --compress=9 --file=$dumpFile 2>&1
            if ($LASTEXITCODE -eq 0) {
                Log "  pg_dump via Railway CLI returned exit 0 -- verifying artifact size"
                Assert-DbDump $dumpFile
            } else {
                Add-Failure "DATABASE" "pg_dump with Railway connection string failed (exit $LASTEXITCODE). NO DATABASE DUMP IN THIS BACKUP."
            }
        } else {
            Add-Failure "DATABASE" "could not get DATABASE_PUBLIC_URL from Railway CLI. NO DATABASE DUMP IN THIS BACKUP."
        }
    } elseif ($pgDump -and -not $env:PGPASSWORD) {
        Add-Failure "DATABASE" "PGPASSWORD not set in environment -- direct pg_dump fallback unavailable. NO DATABASE DUMP IN THIS BACKUP."
    } elseif ($pgDump) {
        # Fallback: direct connection. PGPASSWORD must already be set in the
        # environment (e.g. sourced from a local, gitignored secrets file) --
        # this script never hardcodes it. Password rotates periodically; get the
        # current value from the Railway dashboard (Postgres service > Variables).
        $env:PGSSLMODE = "require"
        pg_dump --host=maglev.proxy.rlwy.net --port=13949 --username=postgres --dbname=railway --format=custom --compress=9 --file=$dumpFile 2>&1
        if ($LASTEXITCODE -eq 0) {
            Log "  pg_dump (direct) returned exit 0 -- verifying artifact size"
            Assert-DbDump $dumpFile
        } else {
            Add-Failure "DATABASE" "pg_dump failed (exit code $LASTEXITCODE). Password may have rotated - check Railway dashboard. NO DATABASE DUMP IN THIS BACKUP."
        }
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    } else {
        Add-Failure "DATABASE" "pg_dump not found on PATH -- install PostgreSQL client tools. NO DATABASE DUMP IN THIS BACKUP (only connection-info.txt below)."
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
    Add-Warning "RAILWAY-VARS" "RAILWAY_TOKEN not set -- Railway env vars not exported (recoverable from the Railway dashboard, so PARTIAL not FATAL)"
} elseif ($railwayCli) {
    try {
        railway vars --service Postgres 2>$null | Out-File "$envDir\railway-postgres-vars.txt" -Encoding UTF8
        railway vars --service backend 2>$null | Out-File "$envDir\railway-backend-vars.txt" -Encoding UTF8
        # Out-File creates the file even when the railway call emitted nothing, so an
        # existence check would always pass. Check for real content instead.
        $emptyVarFiles = @("$envDir\railway-postgres-vars.txt", "$envDir\railway-backend-vars.txt") |
            Where-Object { -not (Test-Path $_) -or (Get-Item $_).Length -lt 50 }
        if ($emptyVarFiles) {
            Add-Warning "RAILWAY-VARS" "Railway env var export produced empty file(s): $($emptyVarFiles -join ', ')"
        } else {
            Log "  Railway env vars exported"
        }
    } catch {
        Add-Warning "RAILWAY-VARS" "Railway CLI vars export threw: $_"
    }
} else {
    Add-Warning "RAILWAY-VARS" "Railway CLI not installed -- env vars not exported"
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
    # claude_docs is gitignored -- this zip is its ONLY recovery path, so an incomplete
    # copy is a hard failure, not a note. Last good copy: 1,312 files (2026-07-28 run).
    Assert-Dir "DOCS" "$docsDir\claude_docs" 500
} else {
    Add-Failure "DOCS" "claude_docs not found at $projectRoot\claude_docs -- it is gitignored, so this backup has NO copy of STATE.md / roadmap.md / session logs"
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
    $rollingExit = $LASTEXITCODE
    Pop-Location
    if ($rollingExit -ne 0) {
        Add-Warning "ROLLING-DOCS" "backup-claude-docs.py exited $rollingExit -- rolling per-file snapshots may be incomplete"
    }
} else {
    Add-Warning "ROLLING-DOCS" "python/python3 not found -- rolling per-file claude_docs snapshots not run this pass (full claude_docs/ zip above still covers it once per day)"
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
        Add-Warning "SKILLS" "skills directory not found in either Roaming or Package sandbox -- no skills in this backup"
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
    Add-Warning "MEMORY" "memory directory not found in either Roaming or Package sandbox -- no memory files in this backup"
}

# ============================================
# COMPRESS & CLEANUP
# ============================================
Log "Compressing backup..."
$zipFile = "$backupRoot\findasale-backup-$timestamp.zip"
$zipSizeMB = 0
$zipOk = $false
try {
    # -ErrorAction Stop because $ErrorActionPreference is "Continue" for this script:
    # without it a failed Compress-Archive is non-terminating and execution falls
    # straight through to the Remove-Item that deletes the staging folder.
    Compress-Archive -Path "$backupDir\*" -DestinationPath $zipFile -CompressionLevel Optimal -ErrorAction Stop
    $zipOk = $true
} catch {
    Add-Failure "ARCHIVE" "Compress-Archive failed: $($_.Exception.Message)"
}
if ($zipOk -and (Test-Path $zipFile)) {
    $zipSizeMB = [math]::Round((Get-Item $zipFile).Length / 1MB, 1)
    Log "Compressed: $zipFile ($zipSizeMB MB)"
    # Smallest legitimate zip on record is 43.1 MB; 5 MB is a truncation tripwire only.
    Assert-Artifact "ARCHIVE" $zipFile 5MB
} else {
    $zipOk = $false
    Add-Failure "ARCHIVE" "no zip produced at $zipFile"
}

# Remove uncompressed folder (keep only zip) -- ONLY when the zip actually exists.
# Deleting the staging folder after a failed Compress-Archive would destroy the entire
# night's backup with nothing to show for it.
if ($zipOk) {
    Remove-Item -Path $backupDir -Recurse -Force
    Log "Cleaned up uncompressed folder"
} else {
    Log "KEEPING uncompressed folder $backupDir -- compression failed; staged files preserved for manual recovery"
}

# Rotate old backups (keep last N days) -- SKIPPED whenever this run had a hard failure,
# so a broken night can never purge the last good backup. On 2026-07-28 the dumpless run
# rotated away findasale-backup-2026-07-20 while producing a zip with no database dump.
if ($script:BackupFailures.Count -gt 0) {
    Log "SKIPPING rotation -- this run recorded $($script:BackupFailures.Count) failure(s); old backups are preserved"
} else {
    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    $old = Get-ChildItem $backupRoot -Filter "findasale-backup-*.zip" |
        Where-Object { $_.LastWriteTime -lt $cutoff }
    if ($old) {
        $old | Remove-Item -Force
        Log "Rotated $($old.Count) old backup(s) (older than $RetentionDays days)"
    } else {
        Log "No old backups to rotate"
    }
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
    # Fold the per-category failures recorded by Add-Failure into the single reason
    # string that drives the RUN ENDED line and the process exit code. A terminating
    # exception caught above still leads the message.
    $failCount = $script:BackupFailures.Count
    $warnCount = $script:BackupWarnings.Count

    if ($failCount -gt 0) {
        $catReason = ($script:BackupFailures -join ' | ')
        if ($script:BackupFailureReason) {
            $script:BackupFailureReason = "$($script:BackupFailureReason) | $catReason"
        } else {
            $script:BackupFailureReason = $catReason
        }
    }

    if ($script:BackupFailureReason) {
        $script:ExitCode = 1
        $outcome = "RUN ENDED - FAILED: $($script:BackupFailureReason)"
    } elseif ($warnCount -gt 0) {
        $script:ExitCode = 2
        $outcome = "RUN ENDED - PARTIAL: $($script:BackupWarnings -join ' | ')"
    } else {
        $script:ExitCode = 0
        $outcome = "RUN ENDED - SUCCESS"
    }

    if ($failCount -gt 0 -and $warnCount -gt 0) {
        Log "ALSO WARNINGS ($warnCount): $($script:BackupWarnings -join ' | ')"
    }
    Log $outcome

    # Durable failure record. backup-log-error.txt is the file an operator (or the next
    # session) checks to answer "did last night's backup actually work?" -- before S1176
    # it was never created, because only a terminating exception ever wrote to it, and a
    # missing DB dump is not a terminating exception.
    if ($script:ExitCode -ne 0) {
        $errBlock = @(
            "==========================================",
            "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | BACKUP RUN $timestamp | EXIT $($script:ExitCode)",
            $outcome,
            "Zip: $zipFile",
            "Full log: $logFile"
        )
        foreach ($d in $errBlock) {
            try { Add-Content -Path $errorLogFile -Value $d -ErrorAction Stop } catch {}
        }
    }
}

# Exit code drives Task Scheduler's "Last Run Result":
#   0 = SUCCESS
#   2 = PARTIAL  (a non-critical category was skipped: Railway vars, skills, memory,
#                 rolling doc snapshots -- the backup itself is usable)
#   1 = FAILED   (a critical artifact is missing or too small -- DB dump, git bundle,
#                 claude_docs, the zip itself -- or a terminating exception was caught)
# This `exit` sits at script top level, deliberately NOT inside a function (where `exit`
# would only unwind the script if the script is the caller) and NOT inside the finally
# block (where it can mask the real code). Invoked as
# `powershell.exe -NoProfile -File backup-everything.ps1`, this sets the process exit
# code that Task Scheduler records.
exit $script:ExitCode

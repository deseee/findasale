# FindA.Sale Database Restore Script
# Restores a pg_dump custom-format backup (produced by scripts\backup-everything.ps1,
# database\findasale.dump inside a findasale-backup-*.zip) to a target Postgres database.
# Created: 2026-08-08, in response to two disaster-recovery gaps found in the Blocked Queue:
#
#   GAP 1 - Missing pgvector extension on restore target.
#     schema.prisma's ProductReferenceEmbedding.embedding column is Unsupported("vector(768)")
#     (see migration 20260707100000_add_pgvector_product_reference and
#     claude_docs/feature-notes/ADR-reverse-image-product-index-2026-07-01.md). pg_dump DOES
#     include a `CREATE EXTENSION IF NOT EXISTS vector;` statement in the dump's schema section,
#     but that statement only succeeds if the pgvector extension files are actually available on
#     the TARGET Postgres server/image -- and on a fresh/different target, ordering and
#     availability quirks around extension-owned types are a known class of pg_restore footgun.
#     This script removes the ambiguity by explicitly running CREATE EXTENSION IF NOT EXISTS
#     vector as its own psql step BEFORE pg_restore runs, so the vector(768) column type is
#     guaranteed to exist before any data (or the CREATE TABLE for ProductReferenceEmbedding)
#     is loaded. This was previously an undocumented prerequisite -- nothing in
#     claude_docs/operations/db-audit-and-backup-strategy.md's old one-line restore command
#     mentioned it at all.
#
#   GAP 2 - 71 of 253 FK constraints fail to re-attach on restore.
#     Root cause: some child rows in the source production database reference a parent row that
#     no longer exists (the orphan already exists in prod -- pg_dump faithfully copies whatever
#     is there, it does not introduce the orphan). This is NOT a transaction-ordering problem --
#     SET CONSTRAINTS ALL DEFERRED only postpones a check within a single transaction until
#     COMMIT; it does nothing for a parent row that is genuinely absent, the check still fails at
#     commit time. The actual fix for THIS restore script is to make sure that a known, existing
#     data-quality issue in a minority of constraints (71/253) cannot block the other ~182 valid
#     constraints or any of the ~250+ tables' worth of data from restoring. That means
#     deliberately NOT using pg_restore's --single-transaction/-1 flag (which would roll back the
#     ENTIRE restore -- ALL data, ALL 253 constraints -- over a handful of already-known orphaned
#     rows). Instead this script runs pg_restore in its normal per-object mode, captures every
#     line of output, and greps it afterward for constraint-violation errors so operators get an
#     exact, actionable list of which constraints failed and why -- instead of that being buried
#     in scrollback or silently unnoticed (which is how this became a Blocked Queue item in the
#     first place).
#     This script does NOT attempt to silently delete or re-parent orphaned rows itself. Deciding
#     whether an orphaned child row should be deleted vs. re-parented to a different valid parent
#     is a data judgment call that needs a live-DB audit -- out of scope for this script, and
#     explicitly flagged below as a follow-up for Patrick/ops.
#
# Usage:
#   cd C:\Users\desee\ClaudeProjects\FindaSale\scripts
#   .\restore-database.ps1 -DumpFile "C:\path\to\findasale.dump"
#
# PGPASSWORD must be set in the environment before running (same convention as
# backup-everything.ps1 -- get the current value from the Railway dashboard, Postgres service >
# Variables, or from packages\database\.env if it is current). This script does not hardcode or
# fetch it automatically to avoid ever writing a live credential into a script file.

param(
    [Parameter(Mandatory = $true)]
    [string]$DumpFile,

    [string]$PgHost = "maglev.proxy.rlwy.net",
    [string]$PgPort = "13949",
    [string]$PgUser = "postgres",
    [string]$PgDatabase = "railway",

    # Skip the CREATE EXTENSION step -- only if you have already confirmed the vector
    # extension exists on the target (e.g. re-running this script against the same target twice).
    [switch]$SkipExtensionCreate
)

$ErrorActionPreference = "Continue"

if (-not (Test-Path $DumpFile)) {
    Write-Error "Dump file not found: $DumpFile"
    exit 1
}

if (-not $env:PGPASSWORD) {
    Write-Error "PGPASSWORD is not set in the environment. Set it to the current Railway Postgres password (Railway dashboard > Postgres > Variables) before running this script:  `$env:PGPASSWORD = '...'"
    exit 1
}
$env:PGSSLMODE = "require"

$timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$reportDir = Split-Path $DumpFile -Parent
if (-not $reportDir) { $reportDir = "." }
$restoreLog = Join-Path $reportDir "restore-log-$timestamp.txt"
$constraintReport = Join-Path $reportDir "restore-fk-failures-$timestamp.txt"

Write-Host "=========================================="
Write-Host "FindA.Sale Database Restore: $timestamp"
Write-Host "  Dump:   $DumpFile"
Write-Host "  Target: $PgUser@$PgHost:$PgPort/$PgDatabase"
Write-Host "  Log:    $restoreLog"
Write-Host "=========================================="

# ============================================
# STEP 1: pgvector extension (GAP 1 fix)
# ============================================
Write-Host ""
Write-Host "[1/3] Ensuring pgvector extension exists on target database..."
if (-not $SkipExtensionCreate) {
    $psqlExe = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $psqlExe) {
        Write-Error "psql not found on PATH -- cannot create the pgvector extension. Install PostgreSQL client tools, or if you have already manually run `"CREATE EXTENSION IF NOT EXISTS vector;`" on the target, re-run with -SkipExtensionCreate."
        exit 1
    }
    $extOutput = & psql "--host=$PgHost" "--port=$PgPort" "--username=$PgUser" "--dbname=$PgDatabase" -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>&1
    $extExit = $LASTEXITCODE
    $extOutput | Out-File $restoreLog -Append -Encoding UTF8
    if ($extExit -ne 0) {
        Write-Error "Failed to create the pgvector extension (psql exit $extExit). ProductReferenceEmbedding restore WILL fail without it (its embedding column is vector(768)). See $restoreLog for the psql error. Aborting before pg_restore runs."
        exit 1
    }
    Write-Host "  OK: pgvector extension present (CREATE EXTENSION IF NOT EXISTS is idempotent -- safe if it already existed)"
} else {
    Write-Host "  SKIPPED (-SkipExtensionCreate) -- assuming the vector extension already exists on the target"
}

# ============================================
# STEP 2: pg_restore (GAP 2 mitigation)
# ============================================
Write-Host ""
Write-Host "[2/3] Restoring $DumpFile ..."
$pgRestoreExe = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestoreExe) {
    Write-Error "pg_restore not found on PATH. Install PostgreSQL client tools."
    exit 1
}

# --clean --if-exists: drop existing objects before recreating (safe to re-run against a
#   partially-restored or previously-restored target).
# --no-owner --no-privileges: the Railway restore user is not necessarily the dump's original
#   owner; without these flags ALTER OWNER / GRANT statements in the dump can fail with
#   permission errors unrelated to the actual data.
# Deliberately NOT using -1/--single-transaction: see the GAP 2 note at the top of this file.
#   A single-transaction restore means ANY error -- including the known, already-existing
#   orphaned-row FK failures -- rolls back the ENTIRE restore (zero tables, zero rows). Running
#   in pg_restore's normal per-object mode means the ~182 unaffected constraints and all table
#   data still land even when a known subset of constraints cannot re-attach.
$restoreArgs = @(
    "--host=$PgHost", "--port=$PgPort", "--username=$PgUser", "--dbname=$PgDatabase",
    "--clean", "--if-exists", "--no-owner", "--no-privileges",
    "--verbose",
    $DumpFile
)
& pg_restore @restoreArgs 2>&1 | Tee-Object -FilePath $restoreLog -Append
$restoreExit = $LASTEXITCODE

# ============================================
# STEP 3: Report FK constraint failures explicitly (GAP 2 reporting)
# ============================================
Write-Host ""
Write-Host "[3/3] Checking restore log for constraint failures..."
$fkFailureLines = Select-String -Path $restoreLog -Pattern "violates foreign key constraint", "is violated by some row", "referenced table.*does not exist" -ErrorAction SilentlyContinue

if ($fkFailureLines) {
    $fkFailureLines | ForEach-Object { $_.Line } | Out-File $constraintReport -Encoding UTF8
    $failCount = $fkFailureLines.Count
    Write-Warning "$failCount FK constraint error line(s) found during restore (matches the known orphaned-row issue -- historically ~71/253 constraints)."
    Write-Warning "  Full restore log:    $restoreLog"
    Write-Warning "  FK failure extract:  $constraintReport"
    Write-Warning "ACTION REQUIRED (Patrick/ops, needs live-DB access this script deliberately does not have):"
    Write-Warning "  These constraints did NOT re-attach. The tables/rows involved are listed in $constraintReport."
    Write-Warning "  Root cause is orphaned child rows referencing a deleted/missing parent in the SOURCE database --"
    Write-Warning "  this is a pre-existing production data-quality issue, not something introduced by backup or restore."
    Write-Warning "  A live-DB audit is needed to decide, per orphaned row, whether to delete it or re-parent it, then"
    Write-Warning "  re-run: ALTER TABLE ... ADD CONSTRAINT ... (or re-run this whole script) to re-attach the constraint."
} else {
    Write-Host "  No FK constraint failures detected in restore log."
}

if ($restoreExit -eq 0) {
    Write-Host ""
    Write-Host "pg_restore completed with exit 0."
} else {
    Write-Host ""
    Write-Warning "pg_restore exited $restoreExit. This is EXPECTED if the FK constraint failures above were reported -- pg_restore returns non-zero whenever ANY object fails to restore, even in this normal per-object (non-transactional) mode, even though the rest of the data restored successfully. Review $restoreLog to confirm the ONLY failures are the known orphaned-row FK constraints listed in $constraintReport, and not something else (e.g. a connection drop, disk full, permission error)."
}

Write-Host ""
Write-Host "Next step (always required after any restore):"
Write-Host "  cd C:\Users\desee\ClaudeProjects\FindaSale\packages\database"
Write-Host "  npx prisma generate"
Write-Host ""

exit $restoreExit

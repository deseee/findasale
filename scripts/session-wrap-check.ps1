# FindA.Sale session-wrap-check.ps1
# Runs at session end to verify all work has been committed.
# Exit code: 1 if uncommitted work found, 0 if clean.

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path | Split-Path -Parent
Set-Location $ProjectRoot

$Fail = $false
$Issues = @()

Write-Host ""
Write-Host "FindA.Sale Session Wrap Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor DarkGray

# ── 1. Check for uncommitted changes ────────────────────────────────────────
Write-Host "[1/6] Checking for uncommitted changes..." -ForegroundColor Yellow

$Uncommitted = git diff --name-only 2>$null
if ($Uncommitted) {
  $Fail = $true
  $Issues += "Uncommitted changes (tracked files):"
  $Uncommitted | ForEach-Object {
    $Issues += "  - $_"
    Write-Host "  - $_" -ForegroundColor Red
  }
} else {
  Write-Host "  OK - No uncommitted changes." -ForegroundColor Green
}

# ── 2. Check for untracked files in key directories ─────────────────────────
Write-Host "[2/6] Checking for untracked files in key directories..." -ForegroundColor Yellow

$KeyDirs = @("claude_docs", "packages", "scripts", "public")
$Untracked = @()

foreach ($dir in $KeyDirs) {
  if (Test-Path $dir) {
    $UntrackedInDir = git ls-files --others --exclude-standard "$dir" 2>$null
    if ($UntrackedInDir) {
      $Untracked += $UntrackedInDir
    }
  }
}

if ($Untracked.Count -gt 0) {
  $Fail = $true
  $Issues += "Untracked files in key directories:"
  $Untracked | ForEach-Object {
    $Issues += "  - $_"
    Write-Host "  - $_" -ForegroundColor Red
  }
} else {
  Write-Host "  OK - No untracked files in key directories." -ForegroundColor Green
}

# ── 3. Check for unpushed commits ───────────────────────────────────────────
Write-Host "[3/6] Checking for unpushed commits..." -ForegroundColor Yellow

$Behind = (git rev-list --count HEAD..origin/main 2>$null) -as [int]
if ($null -eq $Behind) {
  $Behind = (git rev-list --count @{u}..HEAD 2>$null) -as [int]
}
if ($null -eq $Behind) {
  $Behind = 0
}

if ($Behind -gt 0) {
  $Fail = $true
  $Issues += "Unpushed commits: $Behind commit(s) ahead of origin/main"
  Write-Host "  FAILED - $Behind unpushed commit(s)." -ForegroundColor Red
} else {
  Write-Host "  OK - No unpushed commits." -ForegroundColor Green
}

# ── 4. Check if next-session-prompt.md was modified but not committed ───────
Write-Host "[4/6] Checking session prompt file..." -ForegroundColor Yellow

if (Test-Path "claude_docs/next-session-prompt.md") {
  $DiffOutput = git diff --quiet claude_docs/next-session-prompt.md 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - next-session-prompt.md is clean." -ForegroundColor Green
  } else {
    $Fail = $true
    $Issues += "claude_docs/next-session-prompt.md has uncommitted changes"
    Write-Host "  FAILED - next-session-prompt.md has uncommitted changes." -ForegroundColor Red
  }
} else {
  Write-Host "  INFO - next-session-prompt.md not found (OK if first session)." -ForegroundColor DarkGray
}

# ── 5. Check if session-log.md was modified but not committed ───────────────
Write-Host "[5/6] Checking session log file..." -ForegroundColor Yellow

if (Test-Path "claude_docs/session-log.md") {
  $DiffOutput = git diff --quiet claude_docs/session-log.md 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - session-log.md is clean." -ForegroundColor Green
  } else {
    $Fail = $true
    $Issues += "claude_docs/session-log.md has uncommitted changes"
    Write-Host "  FAILED - session-log.md has uncommitted changes." -ForegroundColor Red
  }
} else {
  Write-Host "  INFO - session-log.md not found (OK if first session)." -ForegroundColor DarkGray
}

# ── 6. Check if STATE.md was modified but not committed ────────────────────
Write-Host "[6/6] Checking STATE.md..." -ForegroundColor Yellow

if (Test-Path "claude_docs/STATE.md") {
  $DiffOutput = git diff --quiet claude_docs/STATE.md 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - STATE.md is clean." -ForegroundColor Green
  } else {
    $Fail = $true
    $Issues += "claude_docs/STATE.md has uncommitted changes"
    Write-Host "  FAILED - STATE.md has uncommitted changes." -ForegroundColor Red
  }
} else {
  Write-Host "  INFO - STATE.md not found (OK if first session)." -ForegroundColor DarkGray
}

# ── Summary ────────────────────────────────────────────────────────────────
Write-Host ""
if (-not $Fail) {
  Write-Host "PASS - Session wrap check PASSED" -ForegroundColor Green
  Write-Host "========================================" -ForegroundColor DarkGray
  Write-Host ""
  exit 0
} else {
  Write-Host "FAIL - Session wrap check FAILED" -ForegroundColor Red
  Write-Host "========================================" -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "Issues found:" -ForegroundColor Yellow
  $Issues | ForEach-Object { Write-Host "$_" -ForegroundColor Red }
  Write-Host ""
  Write-Host "Next steps:" -ForegroundColor Yellow
  Write-Host "1. Review uncommitted files above" -ForegroundColor DarkGray
  Write-Host "2. Run: git status" -ForegroundColor DarkGray
  Write-Host "3. Stage files: git add <file>" -ForegroundColor DarkGray
  Write-Host "4. Commit: git commit -m ""...""" -ForegroundColor DarkGray
  Write-Host "5. Push: .\push.ps1" -ForegroundColor DarkGray
  Write-Host ""
  exit 1
}

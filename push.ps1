# push.ps1 - FindA.Sale safe push
# Replaces manual git push. Self-heals: index.lock, CRLF phantoms, remote divergence.
# Uses merge (not rebase) because rebase + core.autocrlf=true on Windows is broken.
# Usage: .\push.ps1

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "FindA.Sale safe push" -ForegroundColor Cyan
Write-Host "-----------------------------------------" -ForegroundColor DarkGray

# 1. Clear stale lock file
$lockFile = ".git\index.lock"
if (Test-Path $lockFile) {
    Write-Host "[1/5] Clearing stale index.lock..." -ForegroundColor Yellow
    Remove-Item $lockFile -Force
    if (Test-Path $lockFile) {
        Write-Host "  FAILED - Could not remove lock file." -ForegroundColor Red
        Write-Host "  Close VS Code, GitHub Desktop, or any git tool and retry." -ForegroundColor DarkGray
        exit 1
    }
    Write-Host "  OK - Lock cleared." -ForegroundColor Green
}

# 2. Warn about staged-but-uncommitted changes
$staged = git diff --cached --name-only 2>$null
if ($staged) {
    Write-Host "[!] Staged but uncommitted changes:" -ForegroundColor Yellow
    $staged | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
    Write-Host "    Commit these first, then re-run .\push.ps1" -ForegroundColor DarkGray
    exit 1
}

# 3. Clear CRLF phantom changes on tracked files
# Windows git (core.autocrlf=true) marks files as modified due to line-ending
# normalisation even when content is identical. These block merge/rebase.
$phantomFiles = git diff --name-only 2>$null
if ($phantomFiles) {
    # SAFETY CHECK: Before running checkout, verify these are only line-ending changes
    # If there are real content changes, warn and abort to prevent data loss.
    $hasRealChanges = $false
    foreach ($file in $phantomFiles) {
        # Count non-whitespace-only diffs. --ignore-cr-at-eol excludes CRLF-only changes
        # so files that differ only in line endings (common after git reset --hard on Windows)
        # are not flagged as real changes and can be safely cleaned up by checkout.
        $diff = git diff --ignore-cr-at-eol -- "$file" 2>$null | Where-Object { $_ -match "^[+\-]" -and $_ -notmatch "^[+\-][\s]*$" }
        if ($diff) {
            $hasRealChanges = $true
            break
        }
    }

    if ($hasRealChanges) {
        Write-Host ""
        Write-Host "[!] WARNING: Uncommitted changes detected" -ForegroundColor Red
        Write-Host "    Running checkout would destroy your work. Modified files:" -ForegroundColor Yellow
        $phantomFiles | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
        Write-Host ""
        Write-Host "    Commit or stash these changes first:" -ForegroundColor Yellow
        Write-Host "      git add <files>" -ForegroundColor DarkGray
        Write-Host "      git commit -m 'your message'" -ForegroundColor DarkGray
        Write-Host "    Then re-run .\push.ps1" -ForegroundColor DarkGray
        Write-Host ""
        exit 1
    }

    Write-Host "[2/5] Clearing CRLF phantom changes..." -ForegroundColor Yellow
    git checkout -- . 2>$null
    Write-Host "  OK - Working tree normalised." -ForegroundColor Green
}

# 4. Fetch + merge (NOT rebase - rebase is broken with autocrlf on Windows)
Write-Host "[3/5] Fetching from origin..." -ForegroundColor Yellow
git fetch origin 2>$null
$fetchExit = $LASTEXITCODE

if ($fetchExit -ne 0) {
    $fetchOutput = git fetch origin 2>&1
    $isCredential = $fetchOutput | Where-Object { $_ -match "credential|authentication|403|could not read" }
    if ($isCredential) {
        Write-Host "  FAILED - Authentication error." -ForegroundColor Red
        Write-Host "  Run: git credential-manager erase" -ForegroundColor DarkGray
        Write-Host "  Then retry .\push.ps1" -ForegroundColor DarkGray
    } else {
        Write-Host "  FAILED - Could not fetch. Check network." -ForegroundColor Red
    }
    exit 1
}
Write-Host "  OK - Fetched." -ForegroundColor Green

# Check if we're behind origin/main
$behind = git rev-list --count HEAD..origin/main 2>$null
if ($behind -gt 0) {
    Write-Host "[4/5] Merging $behind remote commit(s)..." -ForegroundColor Yellow

    # Handle untracked files that exist on remote (add/add conflicts)
    $mergeOutput = git merge origin/main --no-edit 2>&1
    $mergeExit = $LASTEXITCODE
    $mergeOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

    if ($mergeExit -ne 0) {
        $isConflict = $mergeOutput | Where-Object { $_ -match "CONFLICT|Merge conflict" }
        $isUntracked = $mergeOutput | Where-Object { $_ -match "untracked working tree files would be overwritten" }

        if ($isUntracked) {
            Write-Host ""
            Write-Host "  FAILED - Untracked files conflict with remote." -ForegroundColor Red
            Write-Host "  Files listed above exist locally AND on remote." -ForegroundColor DarkGray
            Write-Host "  Delete or rename the local copies, then re-run .\push.ps1" -ForegroundColor DarkGray
            exit 1
        } elseif ($isConflict) {
            # Auto-resolve doc file conflicts (claude_docs/, context.md, .last-wrap).
            # Code file conflicts still require Cowork intervention.
            $conflictFiles = git diff --name-only --diff-filter=U 2>$null
            $docConflicts = @()
            $codeConflicts = @()
            foreach ($cf in $conflictFiles) {
                if ($cf -match "^claude_docs/" -or $cf -eq "context.md" -or $cf -match "\.last-wrap$") {
                    $docConflicts += $cf
                } else {
                    $codeConflicts += $cf
                }
            }
            if ($codeConflicts) {
                Write-Host ""
                Write-Host "  FAILED - Merge conflicts in code files." -ForegroundColor Red
                Write-Host "  Paste this output into Cowork and say: fix the merge conflict" -ForegroundColor Yellow
                $codeConflicts | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
                Write-Host "  Claude handles it - no manual editing needed." -ForegroundColor DarkGray
                exit 1
            }
            if ($docConflicts) {
                Write-Host "  Auto-resolving $($docConflicts.Count) doc conflict(s)..." -ForegroundColor Yellow
                foreach ($cf in $docConflicts) {
                    git checkout --theirs -- "$cf" 2>$null
                    git add "$cf" 2>$null
                    Write-Host "    OK - $cf" -ForegroundColor Green
                }
                git commit --no-edit 2>$null
                Write-Host "  OK - Doc conflicts auto-resolved." -ForegroundColor Green
            }
        } else {
            Write-Host ""
            Write-Host "  FAILED - Merge error. See output above." -ForegroundColor Red
            Write-Host "  To undo: git merge --abort" -ForegroundColor DarkGray
            exit 1
        }
    }
    Write-Host "  OK - Merged." -ForegroundColor Green
} else {
    Write-Host "[4/5] Already up to date." -ForegroundColor Green
}


# SECRET SCAN - block push if any credential/secret pattern is found in changed files.
# Broadened 2026-07-06 (repo went public): scans the full set of changed/staged
# files across all text types - not just STATE.md / patrick-dashboard.md - against
# the same pattern set as the .githooks/pre-commit hook. Any real hit blocks the push.
Write-Host "[pre-push] Scanning changed files for secrets..." -ForegroundColor Yellow

# name = regex. Placeholder/example lines are excluded before a hit is recorded.
$secretPatterns = [ordered]@{
    "DB-connection-string"    = '(postgres(ql)?|mysql|mongodb(\+srv)?|redis|rediss)://[^ ''"@/]+:[^ ''"@/]+@'
    "PGPASSWORD"              = 'PGPASSWORD\s*=\s*[^\s''"]+'
    "GitHub-PAT-classic"      = 'ghp_[A-Za-z0-9]{20,}'
    "GitHub-PAT-fine"         = 'github_pat_[A-Za-z0-9_]{20,}'
    "Anthropic-key"           = 'sk-ant-[A-Za-z0-9_-]{20,}'
    "OpenAI-key"              = 'sk-[A-Za-z0-9]{20,}'
    "Google-API-key"          = 'AIza[0-9A-Za-z_-]{30,}'
    "Google-OAuth-secret"     = 'GOCSPX-[A-Za-z0-9_-]{10,}'
    "AWS-access-key"          = 'AKIA[0-9A-Z]{16}'
    "Slack-bot-token"         = 'xoxb-[A-Za-z0-9-]{10,}'
    "Slack-user-token"        = 'xoxp-[A-Za-z0-9-]{10,}'
    "Sentry-user-token"       = 'sntryu_[A-Za-z0-9]{20,}'
    "GitGuardian-PAT"         = 'gg_pat_[A-Za-z0-9]{20,}'
    "Resend-key"              = 're_[A-Za-z0-9]{20,}'
    "SendGrid-key"            = 'SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
    "Stripe-live-secret"      = 'sk_live_[A-Za-z0-9]{10,}'
    "Stripe-live-publishable" = 'pk_live_[A-Za-z0-9]{10,}'
    "Stripe-live-restricted"  = 'rk_live_[A-Za-z0-9]{10,}'
    "Stripe-webhook-secret"   = 'whsec_[A-Za-z0-9]{20,}'
    "Twilio-account-sid"      = 'AC[0-9a-f]{32}'
    "Private-key-block"       = '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----'
    "Generic-JWT"             = 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'
}
$placeholderRe = '(example|sample|placeholder|your-|your_|dummy|localhost|127\.0\.0\.1|REDACTED|redacted|xxxx|XXXX|<[A-Za-z_ -]+>|CHANGEME|changeme|test_key|fake)'
$scanExt = @(".ts",".tsx",".js",".jsx",".py",".md",".json",".yml",".yaml",".sh",".ps1",".txt")

# Build the candidate file list: staged + unstaged changes + committed-but-unpushed diff.
$changed = @()
$changed += (git diff --cached --name-only --diff-filter=ACM 2>$null)
$changed += (git diff --name-only --diff-filter=ACM 2>$null)
$changed += (git diff --name-only --diff-filter=ACM "@{u}..HEAD" 2>$null)
$changed = $changed | Where-Object { $_ -and ($_.Trim().Length -gt 0) } | Sort-Object -Unique

$secretFound = $false
foreach ($cf in $changed) {
    $ext = [System.IO.Path]::GetExtension($cf)
    $hasExt = ($cf -match '\.[^\\/]+$')
    if ($hasExt -and ($scanExt -notcontains $ext.ToLower())) { continue }  # skip unscanned extensions; extensionless in scope
    if (-not (Test-Path -LiteralPath $cf)) { continue }
    $lines = Get-Content -LiteralPath $cf -ErrorAction SilentlyContinue
    if (-not $lines) { continue }
    $lineNo = 0
    foreach ($ln in $lines) {
        $lineNo++
        if ($ln -match $placeholderRe) { continue }
        foreach ($name in $secretPatterns.Keys) {
            if ($ln -match $secretPatterns[$name]) {
                Write-Host "  BLOCKED - possible secret [$name] in ${cf}:${lineNo}" -ForegroundColor Red
                $secretFound = $true
            }
        }
    }
}
if ($secretFound) {
    Write-Host ""
    Write-Host "Push blocked to prevent secret exposure." -ForegroundColor Red
    Write-Host "Replace the value with a placeholder (or load it from env), re-stage, and re-run .\push.ps1" -ForegroundColor DarkGray
    exit 1
}
Write-Host "  OK - No secrets found in changed files." -ForegroundColor Green

# 5. Push
Write-Host "[5/5] Pushing to origin/main..." -ForegroundColor Yellow
$pushOutput = git push origin main 2>&1
$pushExit = $LASTEXITCODE
$pushOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

if ($pushExit -ne 0) {
    $isTsError  = $pushOutput | Where-Object { $_ -match "TS\d+|TypeScript errors|tsc" }
    $isRejected = $pushOutput | Where-Object { $_ -match "rejected|fetch first|non-fast-forward" }

    Write-Host ""
    if ($isTsError) {
        Write-Host "  FAILED - TypeScript errors blocking push." -ForegroundColor Red
        Write-Host "  Fix the errors above, commit fixes, re-run .\push.ps1" -ForegroundColor DarkGray
    } elseif ($isRejected) {
        Write-Host "  Remote moved during push - retrying..." -ForegroundColor Yellow
        git fetch origin 2>$null
        git merge origin/main --no-edit 2>$null
        git push origin main 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  FAILED after retry." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "  FAILED - See output above." -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "Push complete." -ForegroundColor Green
Write-Host "-----------------------------------------" -ForegroundColor DarkGray
Write-Host ""

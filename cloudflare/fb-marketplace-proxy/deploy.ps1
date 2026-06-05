# Cloudflare Worker — Facebook Marketplace Proxy — One-Shot Deploy
#
# Run this from PowerShell. It will:
#   1. Prompt for your Cloudflare API token
#      (create one at https://dash.cloudflare.com/profile/api-tokens with
#       "Workers Scripts:Edit" — or reuse an existing one)
#   2. Generate a fresh PROXY_TOKEN
#   3. Deploy the worker
#   4. Set the PROXY_TOKEN secret on the worker
#   5. Print the Railway env-var values to copy into the dashboard
#
# Usage:
#   cd C:\Users\desee\ClaudeProjects\FindaSale\cloudflare\fb-marketplace-proxy
#   .\deploy.ps1

$ErrorActionPreference = 'Stop'

Write-Host "=== Cloudflare FB Proxy Deploy ===" -ForegroundColor Cyan
Write-Host ""

# 1) Get CF API token
$tokenSecure = Read-Host "Paste your Cloudflare API token (Workers Scripts: Edit)" -AsSecureString
$bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure)
$env:CLOUDFLARE_API_TOKEN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) | Out-Null

if (-not $env:CLOUDFLARE_API_TOKEN) {
    Write-Error "No token provided. Aborting."
    exit 1
}

# 2) Generate a fresh PROXY_TOKEN (shared secret between Worker and Railway).
#    32 random bytes hex-encoded — same strength as openssl rand -hex 32.
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$PROXY_TOKEN = -join ($bytes | ForEach-Object { $_.ToString('x2') })

# 3) Deploy the worker
Write-Host ""
Write-Host "Deploying worker..." -ForegroundColor Yellow
$deployOutput = & npx --yes wrangler@latest deploy 2>&1 | Out-String
Write-Host $deployOutput

if ($LASTEXITCODE -ne 0) {
    Write-Error "Wrangler deploy failed. See output above."
    exit 1
}

# Extract the worker URL from output (looks like "https://findasale-fb-proxy.<sub>.workers.dev")
$workerUrl = $null
if ($deployOutput -match 'https://findasale-fb-proxy\.[a-z0-9-]+\.workers\.dev') {
    $workerUrl = $matches[0]
}

# 4) Set the PROXY_TOKEN secret on the worker
Write-Host "Setting PROXY_TOKEN secret on the worker..." -ForegroundColor Yellow
$PROXY_TOKEN | & npx --yes wrangler@latest secret put PROXY_TOKEN
if ($LASTEXITCODE -ne 0) {
    Write-Error "Setting PROXY_TOKEN failed."
    exit 1
}

# 5) Output Railway env-var values
Write-Host ""
Write-Host "=== DONE — Worker deployed ===" -ForegroundColor Green
Write-Host ""
Write-Host "Copy these into Railway -> backend service -> Variables:" -ForegroundColor Cyan
Write-Host ""
if ($workerUrl) {
    Write-Host "  FB_MARKETPLACE_PROXY_URL = $workerUrl/fb-graphql" -ForegroundColor White
} else {
    Write-Host "  FB_MARKETPLACE_PROXY_URL = https://findasale-fb-proxy.<your-subdomain>.workers.dev/fb-graphql" -ForegroundColor White
    Write-Host "    (subdomain shown in wrangler output above)" -ForegroundColor DarkGray
}
Write-Host "  FB_MARKETPLACE_PROXY_TOKEN = $PROXY_TOKEN" -ForegroundColor White
Write-Host ""
Write-Host "Once set, Railway will auto-redeploy with the new env vars." -ForegroundColor Cyan
Write-Host ""
if ($workerUrl) {
    Write-Host "Health check:  curl $workerUrl/health" -ForegroundColor DarkGray
}

# Clear the API token from env
$env:CLOUDFLARE_API_TOKEN = $null

# Fix send.finda.sale SPF record — swap amazonses.com for _spf.google.com
# Run this from PowerShell in the project root
# Requires: vercel CLI logged in (run `vercel login` first if needed)

$teamId = "team_4pRTF78Z5fjPe8LNzTDZuJgZ"
$domain = "finda.sale"

Write-Host "Listing current DNS records for send.finda.sale..."
$records = vercel dns ls $domain --team $teamId --json 2>$null | ConvertFrom-Json

# Find the send TXT record with amazonses
$oldRecord = $records | Where-Object { $_.name -eq "send" -and $_.type -eq "TXT" -and $_.value -like "*amazonses*" }

if ($oldRecord) {
    Write-Host "Found old record: $($oldRecord.id) — $($oldRecord.value)"
    Write-Host "Removing old record..."
    vercel dns rm $domain $oldRecord.id --team $teamId --yes
    Write-Host "Old record removed."
} else {
    Write-Host "No amazonses TXT record found for 'send' — may already be updated or record has different format."
}

Write-Host "Adding new SPF record..."
vercel dns add $domain send TXT "v=spf1 include:_spf.google.com ~all" --team $teamId
Write-Host "Done. New SPF record: v=spf1 include:_spf.google.com ~all"
Write-Host "Verify at: https://mxtoolbox.com/SuperTool.aspx?action=txt%3asend.finda.sale&run=toolpage"

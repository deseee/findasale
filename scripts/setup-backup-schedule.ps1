# FindA.Sale - Register Daily Backup with Windows Task Scheduler
# Run this ONCE (elevated) to set up automatic daily backups at 3 AM.
# Created: 2026-05-23

$taskName = "FindaSale-DailyBackup"
$scriptPath = "C:\Users\desee\ClaudeProjects\FindaSale\scripts\backup-everything.ps1"

# Check if already registered
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Task already exists. Removing old version..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Action: run PowerShell with the backup script
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File ""$scriptPath"""

# Trigger: daily at 3:00 AM
$trigger = New-ScheduledTaskTrigger -Daily -At "3:00AM"

# Settings: start if missed, 30 min timeout
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

# Register
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "FindA.Sale daily backup - DB, env vars, infra, docs, skills, memory. 7-day retention."

Write-Host ""
Write-Host "Done! Task registered." -ForegroundColor Green
Write-Host "  Schedule: Daily at 3:00 AM"
Write-Host "  Script:   $scriptPath"
Write-Host "  Retention: 7 days"
Write-Host ""
Write-Host "To test now:  .\backup-everything.ps1"
Write-Host "To view task: Get-ScheduledTask -TaskName FindaSale-DailyBackup"
Write-Host "To remove:    Unregister-ScheduledTask -TaskName FindaSale-DailyBackup"

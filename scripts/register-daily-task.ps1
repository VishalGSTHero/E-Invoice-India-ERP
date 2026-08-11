# Register a Windows Scheduled Task to run E-Invoice daily tests + email report.
# Run PowerShell as Administrator once:
#   powershell -ExecutionPolicy Bypass -File .\scripts\register-daily-task.ps1

param(
  [string]$TaskName = "EInvoice-India-Daily-Automation",
  [string]$Time = "10:00"   # 24h local time, e.g. 10:00 or 18:30
)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Node = (Get-Command node -ErrorAction Stop).Source
$Script = Join-Path $ProjectRoot "scripts\daily-run.js"

$Action = New-ScheduledTaskAction `
  -Execute $Node `
  -Argument "`"$Script`"" `
  -WorkingDirectory $ProjectRoot

$Trigger = New-ScheduledTaskTrigger -Daily -At $Time

$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

$Principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Description "Daily E-Invoice India Playwright submit suite + email report" `
  -Force | Out-Null

Write-Host "Scheduled task registered: $TaskName"
Write-Host "Runs daily at $Time"
Write-Host "Working directory: $ProjectRoot"
Write-Host "Command: $Node `"$Script`""
Write-Host ""
Write-Host "Verify:  Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "Run now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Remove:  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"

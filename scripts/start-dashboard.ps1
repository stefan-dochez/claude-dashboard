# Start Claude Dashboard backend + frontend
# Usage: .\scripts\start-dashboard.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

# Kill any existing instance on port 3200
$procs = Get-NetTCPConnection -LocalPort 3200 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid in $procs) {
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}

# Start in background, log to ~/.claude-dashboard/
$logDir = Join-Path $env:USERPROFILE ".claude-dashboard\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$logFile = Join-Path $logDir "dashboard.log"
$pidFile = Join-Path $logDir "dashboard.pid"

$proc = Start-Process -FilePath "npm" -ArgumentList "run", "dev" -PassThru -RedirectStandardOutput $logFile -RedirectStandardError (Join-Path $logDir "dashboard-err.log") -WindowStyle Hidden
$proc.Id | Out-File -FilePath $pidFile -Encoding ascii

Write-Host "Claude Dashboard started (PID: $($proc.Id))"
Write-Host "Frontend: http://localhost:5173"
Write-Host "Backend:  http://localhost:3200"
Write-Host "Logs:     $logFile"

# Stop Claude Dashboard
$ports = @(3200, 5173)
foreach ($port in $ports) {
    $procs = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $procs) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
}

$pidFile = Join-Path $env:USERPROFILE ".claude-dashboard\logs\dashboard.pid"
Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue

Write-Host "Claude Dashboard stopped"

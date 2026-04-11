# Launch backend + frontend dev servers, then start Electron when ready
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot)

# Kill old processes on dev ports
foreach ($port in @(3200, 5173)) {
    $procs = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $procs) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
}

# Start backend + frontend in background
$devJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    npm run dev
}

# Wait for both servers
Write-Host "Waiting for servers..."
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    try {
        $backend = (Invoke-WebRequest -Uri "http://localhost:3200/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue).StatusCode
    } catch { $backend = 0 }
    try {
        $frontend = (Invoke-WebRequest -Uri "http://localhost:5173/" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue).StatusCode
    } catch { $frontend = 0 }

    if ($backend -eq 200 -and $frontend -eq 200) {
        Write-Host "Servers ready"
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    Write-Host "Warning: servers may not be fully ready"
}

# Build and start Electron
Set-Location packages\electron
npx tsc
npx electron dist\main.js --dev

# When Electron closes, kill dev servers
Stop-Job -Job $devJob -ErrorAction SilentlyContinue
Remove-Job -Job $devJob -Force -ErrorAction SilentlyContinue

foreach ($port in @(3200, 5173)) {
    $procs = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $procs) {
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
}

# Prepare backend for Electron packaging:
# Install production dependencies in a standalone folder
$ErrorActionPreference = "Stop"
Set-Location (Join-Path (Split-Path $PSScriptRoot) "packages\backend")

# Clean previous
if (Test-Path "_pkg") {
    Remove-Item -Path "_pkg" -Recurse -Force
}
New-Item -ItemType Directory -Path "_pkg" | Out-Null

# Copy package.json and postinstall script
Copy-Item "package.json" "_pkg\"
Copy-Item -Recurse "scripts" "_pkg\scripts"

# Install production deps
Set-Location "_pkg"
npm install --omit=dev 2>&1 | Select-Object -Last 3
Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue

# On Windows, no chmod needed — binaries are executable by default

Write-Host "Backend production deps ready in packages\backend\_pkg\node_modules\"

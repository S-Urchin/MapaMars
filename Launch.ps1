# Launches the Vite dev server for the frontend and opens it in the browser.
# Accounts and missions live in Supabase (configured in .env.local).
# Usage: .\Launch.ps1 [-Port 5173] [-NoOpen] [-Install] [-Share]
#   -Share  lets other devices on your network open the site

param(
    [int]$Port = 5173,
    [switch]$NoOpen,
    [switch]$Install,
    [switch]$Share
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error 'npm was not found on PATH. Install Node.js from https://nodejs.org and try again.'
    exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.env.local'))) {
    Write-Warning '.env.local not found: sign-in and missions will not work until you add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
}

if ($Install -or -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Host 'Installing dependencies...' -ForegroundColor Cyan
    if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'package-lock.json')) {
        npm ci
    } else {
        npm install
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Dependency install failed (exit code $LASTEXITCODE)."
        exit $LASTEXITCODE
    }
}

$viteArgs = @('--port', $Port)
if (-not $NoOpen) { $viteArgs += '--open' }
if ($Share) { $viteArgs += '--host' }

Write-Host "Starting frontend on http://localhost:$Port ..." -ForegroundColor Green
npm run dev -- @viteArgs
exit $LASTEXITCODE

$ErrorActionPreference = 'Stop'
Write-Host 'Crime Track setup' -ForegroundColor Green
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 20+ is required.' }
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw 'PostgreSQL 14+ (psql) is required and must be on PATH.' }
if (-not (Test-Path '.\backend\.env')) { Copy-Item '.\backend\.env.example' '.\backend\.env'; Write-Host 'Created backend/.env. Update DATABASE_URL and ADMIN_PASSWORD before continuing.' -ForegroundColor Yellow }
if (-not (Test-Path '.\frontend\.env')) { Copy-Item '.\frontend\.env.example' '.\frontend\.env' }
Push-Location backend
npm install
Pop-Location
Push-Location frontend
npm install
Pop-Location
Write-Host 'Creating database if it does not exist...'
$envFile = Get-Content '.\backend\.env' | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$databaseUrl = $envFile -replace '^DATABASE_URL=', ''
if ($databaseUrl -match '/([^/?]+)(\?.*)?$') { $databaseName = $Matches[1] } else { $databaseName = 'crime_track' }
$adminDbUrl = $databaseUrl -replace "/$databaseName(\?.*)?$", '/postgres$1'
$env:PGCONNECT_TIMEOUT = '5'
try { psql -c "SELECT 1" $adminDbUrl | Out-Null } catch { throw 'Could not connect to PostgreSQL. Check backend/.env DATABASE_URL and PostgreSQL service.' }
$exists = (psql -tAc "SELECT 1 FROM pg_database WHERE datname='$databaseName'" $adminDbUrl 2>$null | Out-String).Trim()
if ($exists -ne '1') { psql -c "CREATE DATABASE $databaseName" $adminDbUrl }
Push-Location backend
node scripts/setup-db.js
Pop-Location
Write-Host 'Setup complete. Run .\start.ps1 to launch Crime Track.' -ForegroundColor Green

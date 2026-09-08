$ErrorActionPreference = 'Stop'
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'Set-Location "$PWD\backend"; npm run dev'
Start-Process powershell -ArgumentList '-NoExit', '-Command', 'Set-Location "$PWD\frontend"; npm run dev -- --host 0.0.0.0'
Write-Host 'Backend: http://localhost:4000' -ForegroundColor Green
Write-Host 'Frontend: http://localhost:5173' -ForegroundColor Green

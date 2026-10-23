# Fireball — Windows Monitoring Agent Automated Setup Script
# Run in Windows PowerShell: .\windows_setup.ps1

Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "🔥 FIREBALL — WINDOWS SYSTEM MONITORING AGENT SETUP" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow

# 1. Verify Python Installation
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    $pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}

if (-not $pythonCmd) {
    Write-Host "[ERROR] Python 3 was not found in your PATH." -ForegroundColor Red
    Write-Host "Please install Python 3.8+ from https://www.python.org/downloads/windows/" -ForegroundColor White
    Write-Host "Make sure to check the box: 'Add Python to PATH' during installation." -ForegroundColor Yellow
    Exit 1
}

$pyVersion = & $pythonCmd.Source --version
Write-Host "[OK] Detected: $pyVersion" -ForegroundColor Green

# 2. Virtual Environment Setup
$venvPath = Join-Path $PSScriptRoot ".venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "[*] Creating virtual environment in $venvPath..." -ForegroundColor Cyan
    & $pythonCmd.Source -m venv $venvPath
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to create virtual environment." -ForegroundColor Red
        Exit 1
    }
}
Write-Host "[OK] Virtual environment ready." -ForegroundColor Green

# 3. Activate Virtual Environment & Install Dependencies
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$venvPip = Join-Path $venvPath "Scripts\pip.exe"

Write-Host "[*] Installing required packages (psutil, requests)..." -ForegroundColor Cyan
& $venvPip install --upgrade pip --quiet
& $venvPip install -r (Join-Path $PSScriptRoot "requirements.txt") --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Pip installation had warnings, proceeding with install verification..." -ForegroundColor Yellow
}
Write-Host "[OK] Dependencies installed successfully." -ForegroundColor Green

# 4. Generate Machine Config if not present
$configFile = Join-Path $PSScriptRoot "agent_config.json"
if (-not (Test-Path $configFile)) {
    $computerName = $env:COMPUTERNAME.ToLower()
    $token = "fb_win_" + [System.Guid]::NewGuid().ToString("N").Substring(0, 16)
    
    $configContent = @"
{
  "backendUrl": "http://localhost:3000/api/telemetry/ingest",
  "machineId": "win-$computerName",
  "machineName": "Windows Laptop ($($env:COMPUTERNAME))",
  "enrollmentToken": "$token",
  "samplingIntervalSec": 3,
  "probeEndpointUrl": null,
  "alertRules": {
    "cpuWarningPercent": 75,
    "cpuCriticalPercent": 90,
    "cpuSustainedCycles": 3,
    "memoryWarningPercent": 80,
    "memoryCriticalPercent": 90,
    "destinations": {
      "emails": [],
      "webhooks": []
    }
  }
}
"@
    Set-Content -Path $configFile -Value $configContent -Encoding UTF8
    Write-Host "[OK] Created initial configuration: $configFile" -ForegroundColor Green
    Write-Host "     Assigned Machine ID: win-$computerName" -ForegroundColor Cyan
    Write-Host "     Enrollment Token:    $token" -ForegroundColor Cyan
} else {
    Write-Host "[OK] Existing configuration found at $configFile" -ForegroundColor Green
}

# 5. Run Self-Diagnostic Health Audit
Write-Host "`n[*] Running Windows Hardware & Telemetry Audit..." -ForegroundColor Cyan
& $venvPython (Join-Path $PSScriptRoot "fireball_windows_agent.py") --health

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "✓ SETUP COMPLETE! You are ready to start live monitoring." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "To launch continuous telemetry ingestion, run:" -ForegroundColor Yellow
Write-Host "  .venv\Scripts\python.exe fireball_windows_agent.py --run" -ForegroundColor White
Write-Host "Or if virtualenv is activated:" -ForegroundColor Yellow
Write-Host "  python fireball_windows_agent.py --run" -ForegroundColor White
Write-Host "==========================================================`n" -ForegroundColor Green

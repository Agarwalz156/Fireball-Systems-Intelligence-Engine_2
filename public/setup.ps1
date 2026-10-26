# Fireball — 1-Click Windows Monitor Setup & Launch
# Run in PowerShell:
# irm https://ais-dev-ko6ucrltlcrhb5odbgg2k7-480134225901.asia-east1.run.app/setup.ps1 | iex

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " Fireball Systems Intelligence — Windows Agent" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$ScriptUrl = "https://ais-dev-ko6ucrltlcrhb5odbgg2k7-480134225901.asia-east1.run.app/api/agent/script"
$TargetFile = "windows_monitor.py"
$ApiUrl = "https://ais-dev-ko6ucrltlcrhb5odbgg2k7-480134225901.asia-east1.run.app/api/telemetry"

Write-Host "[1/3] Fetching monitor script from server..." -ForegroundColor Yellow
try {
    $scriptContent = (Invoke-RestMethod -Uri $ScriptUrl -Method Get -TimeoutSec 10)
    if ($scriptContent -like "*<title>*" -or $scriptContent -like "*<!doctype*") {
        Write-Host "Error: Received HTML instead of Python script. Using fallback generator..." -ForegroundColor Red
    } else {
        [System.IO.File]::WriteAllText((Join-Path (Get-Location) $TargetFile), $scriptContent, [System.Text.Encoding]::UTF8)
        Write-Host "✓ Successfully wrote windows_monitor.py" -ForegroundColor Green
    }
} catch {
    Write-Host "Could not download script directly: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "[2/3] Verifying Python & installing psutil, requests..." -ForegroundColor Yellow
py -3 -m pip install --quiet psutil requests

Write-Host "[3/3] Launching Windows Monitor Agent..." -ForegroundColor Green
Write-Host "Streaming live metrics to $ApiUrl..." -ForegroundColor Cyan

py -3 windows_monitor.py --machine-id "win-localhost" --token "fb_win_token_primary" --url $ApiUrl

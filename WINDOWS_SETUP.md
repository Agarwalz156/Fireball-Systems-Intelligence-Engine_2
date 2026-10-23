# 🔥 Fireball — Real Windows System Monitoring Setup Guide

This guide walks you through running the **Fireball Windows Monitoring Agent** on your actual Windows laptop to stream live hardware telemetry directly into the Fireball dashboard.

---

## 1. Prerequisites

1. **Python 3.8+ for Windows**:
   - If not already installed, download from [python.org/downloads/windows](https://www.python.org/downloads/windows/).
   - ⚠️ **Important**: During installation, check the box: **"Add python.exe to PATH"**.

2. **Windows PowerShell**:
   - Built into Windows 10 & 11 (Start Menu → search `PowerShell`).

---

## 2. Fast Setup (Automated PowerShell Script)

1. Open PowerShell and navigate to the project's `agent` directory:
   ```powershell
   cd C:\path\to\Fireball-Systems-Intelligence-Engine\agent
   ```

2. If PowerShell restricts script execution on your machine, temporarily permit the current process:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

3. Run the automated setup script:
   ```powershell
   .\windows_setup.ps1
   ```

   This script automatically:
   - Verifies your Python 3 environment.
   - Creates an isolated virtual environment (`.venv`).
   - Installs `psutil` and `requests`.
   - Generates your initial `agent_config.json` with a secure enrollment token.
   - Runs a self-diagnostic hardware audit.

---

## 3. Manual Step-by-Step Setup (If Preferred)

If you prefer to configure manually without running the script:

```powershell
cd agent

# 1. Create virtual environment
python -m venv .venv

# 2. Activate virtual environment
.\.venv\Scripts\Activate.ps1

# 3. Install dependencies
pip install -r requirements.txt

# 4. Copy example configuration
Copy-Item agent_config.example.json agent_config.json
```

Edit `agent_config.json` in Notepad or VS Code:
```json
{
  "backendUrl": "http://localhost:3000/api/telemetry/ingest",
  "machineId": "win-my-laptop",
  "machineName": "My Windows Laptop",
  "enrollmentToken": "YOUR_TOKEN_FROM_DASHBOARD",
  "samplingIntervalSec": 3
}
```

> **Note for deployed/cloud dashboards:**
> If accessing a remote or Vercel dashboard, replace `http://localhost:3000/api/telemetry/ingest` with your production backend ingestion URL (e.g. `https://your-domain.com/api/telemetry/ingest`).

---

## 4. Operating the Windows Agent

### A. Run Hardware Capabilities & Health Audit
Verify that your laptop hardware counters are reading accurately:
```powershell
python fireball_windows_agent.py --health
```

### B. Capture a Single Telemetry Sample (Inspect JSON)
```powershell
python fireball_windows_agent.py --once
```

### C. Launch Continuous Monitoring
```powershell
python fireball_windows_agent.py --run
```

You will see live console confirmation:
```
2026-10-23 10:00:00 [INFO] Fireball Windows Agent v2.1.0-windows started on DESKTOP-LAPTOP
2026-10-23 10:00:00 [INFO] Target backend: http://localhost:3000/api/telemetry/ingest
2026-10-23 10:00:00 [INFO] Sampling rate: Every 3 seconds
2026-10-23 10:00:03 [INFO] ✓ Ingested sample: CPU=12.4% | RAM=48.2% | Status=200
```

To stop the agent at any time, press `Ctrl + C`.

---

## 5. What Real Metrics Are Collected?

| Subsystem | Actual Measurements Collected |
| :--- | :--- |
| **CPU** | Total CPU %, per-core breakdown, user/system processor time |
| **Memory** | Physical RAM total, used, available, and percentage |
| **Pagefile** | Windows Virtual Memory Pagefile total, committed, and usage % |
| **Storage** | Primary drive (`C:\`) capacity, free space %, read/write throughput rates |
| **Network** | Network interface RX & TX throughput bytes/sec, error counts |
| **Processes** | Top 5–10 active processes by CPU and RAM (PID, process name, RSS bytes) |
| **System** | Laptop hostname, Windows build version, system uptime |

*Privacy Guarantee: The agent runs with unprivileged user rights. It never inspects command-line parameters, user documents, environment variables, or passwords.*

---

## 6. Troubleshooting

- **"Execution of scripts is disabled on this system"**:
  Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in your PowerShell window.
- **HTTP 401 Unauthorized**:
  The `enrollmentToken` in `agent_config.json` does not match the token in the Fireball dashboard. Check the token in the **Linux & Windows Agent** tab in the dashboard and update `agent_config.json`.
- **HTTP 403 Forbidden**:
  The machine token has been revoked in the dashboard. Click **Re-enroll** in the dashboard to generate a new token.
- **Connection Refused**:
  Ensure the Fireball dashboard/server is running (`npm run dev` or production server).

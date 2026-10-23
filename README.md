# Fireball — Systems Intelligence Engine

[![Build & Deploy Ready](https://img.shields.io/badge/Deploy-Production%20Ready-emerald.svg)](#deployment-guide)
[![License: MIT](https://img.shields.io/badge/License-MIT-amber.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/Node.js-22%20LTS-blue.svg)](https://nodejs.org)
[![Agent](https://img.shields.io/badge/Agent-Python%203.10%2B-cyan.svg)](agent/)

**Fireball** turns Linux performance anomalies into reproducible, evidence-backed investigations. Rather than simply plotting graphs, Fireball correlates measurements across the Linux kernel scheduler, memory page tables, storage queues, and application HTTP latencies to formulate explainable diagnostic hypotheses, route external alerts (webhooks & email), and evaluate controlled interventions.

Repository: **[https://github.com/Agarwalz156/Fireball-Systems-Intelligence-Engine](https://github.com/Agarwalz156/Fireball-Systems-Intelligence-Engine)**

---

## 1. System Architecture & Data Flow

```text
[ Linux Host / WSL2 Ubuntu 24.04 ]
  │
  ├── /proc/stat, /proc/meminfo, /proc/loadavg
  ├── /proc/diskstats, /proc/net/dev
  ├── /proc/pressure/* (PSI: CPU, Memory, I/O)
  └── /proc/[pid]/stat (Top Resident Processes)
         │
         ▼
  [ fireball_agent.py ] (Zero-privilege Python 3 collector)
         │  (Authenticated HTTP POST + Bounded Ring Buffer)
         ▼
  [ Cloud Backend / Ingest Endpoint ] (/api/telemetry/ingest)
         │
         ├── 1. Schema Validation & Rate Limiting
         ├── 2. Modular Anomaly Detector (Custom Thresholds & Alert Rules)
         ├── 3. External Alert Router (Webhooks & Email Notifications)
         ├── 4. Diagnostic Engine (Correlates subsystems & isolates uncertainty)
         └── 5. Persistent Storage (Cloud Firestore + In-memory stream)
                 │
                 ▼
          [ Fireball Web Dashboard ] (React, TypeScript, Tailwind CSS)
            - Live Telemetry & Historical Scrubbing Charts
            - Active Anomaly Alerts Feed
            - Alert Rules & Destinations Configuration
            - Evidence-Backed Diagnostic Hypotheses
            - Controlled Experiment Pre/Post Comparators
            - Incident Report Exporters (Markdown & JSON)
```

---

## 2. Key Subsystems

### A. Python Linux Monitoring Agent (`agent/fireball_agent.py`)
- **Native `/proc` and `/sys` Parsers:** Reads raw kernel scheduler jiffies, memory pages, disk sectors, and socket counters with zero external pip dependencies.
- **Linux PSI (Pressure Stall Information):** Reads `/proc/pressure/cpu`, `memory`, and `io`. When running on kernels without `CONFIG_PSI=y` or unprivileged containers, explicitly records `null` (never false zeroes).
- **Graceful Failure Handling:** Handles monotonic counter resets, disappearing short-lived processes (`ProcessLookupError`), unmounted block devices, and network dropouts with a FIFO bounded ring buffer (up to 100 samples) and exponential backoff retry.
- **Safe Benchmark Workloads:** Provides safe, bounded demo workloads (`--workload cpu --duration 10` and `--workload memory --duration 10`) that never touch kernel parameters or require root.

### B. Custom Alert Rules & External Destinations
- **Custom Percentage-Based Thresholds:** Configurable warning and critical thresholds for CPU utilization (%) and physical memory allocation (%), with sustained cycle damping (1–10 samples).
- **Email Alert Routing:** Configurable team email distribution lists with instant verification ping.
- **Webhook Integrations:** Direct HTTP POST dispatch to Slack, PagerDuty, Discord, or automated incident responders with trigger severity filters (`Warning & Critical` or `Critical Only`).

### C. Diagnostic Engine (`src/engine/diagnosticEngine.ts`)
- Formulates hypotheses with:
  - **Problem Summary & Underlying Cause Hypothesis**
  - **Supporting Measurements** (corroborating timeseries metrics)
  - **Conflicting or Missing Evidence** (unmeasured subsystems or counter-indicators)
  - **Transparent Heuristic Confidence** (High, Medium, Low, Inconclusive)
  - **Transparent Rule Rationale**
  - **Recommended Next Steps & Controlled Experiments**
- Includes explicit **Insufficient Evidence** outcome (`Rule #0`) when sample depth is sparse (<3 samples).
- Implements the requested decoupled utilization scenario where **CPU rises but application latency remains normal** (`Rule #1: Decoupled Utilization vs QoS`).

### D. Controlled Experiment Engine (`src/engine/experimentEngine.ts`)
- Evaluates baseline vs. post-intervention observation windows.
- Calculates sample sufficiency, minimum sample requirements, absolute deltas, and percentage changes.
- Categorizes outcomes into `Supported`, `Refuted`, or `Inconclusive`.
- Emphasizes scientific rigor: *"An improvement supports a hypothesis but does not automatically prove causation."*

---

## 3. Deployment Guide (Make it Live)

Fireball is packaged for multiple zero-downtime deployment paths:

### Option 1: Docker Container (Google Cloud Run / AWS ECS / Fly.io / DigitalOcean)

The repository includes a production multi-stage `Dockerfile`:

```bash
# 1. Build Docker image
docker build -t fireball-engine:latest .

# 2. Run container on port 3000
docker run -d -p 3000:3000 --name fireball fireball-engine:latest
```

#### Deploy to Google Cloud Run:
```bash
gcloud run deploy fireball \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

---

### Option 2: 1-Click Deploy on Render

The repository includes `render.yaml`:
1. Push repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com), select **New > Blueprint**.
3. Connect your repository `https://github.com/Agarwalz156/Fireball-Systems-Intelligence-Engine`.
4. Render automatically runs `npm install && npm run build` and starts `node server.js`.

---

### Option 3: Heroku / Railway / Dokku

The repository includes `Procfile`:
```bash
# Deploy using Heroku CLI
heroku create fireball-engine
git push heroku main
```

---

### Option 4: Linux VPS / Bare Metal / Systemd

```bash
# 1. Install dependencies and build production artifacts
npm ci
npm run build

# 2. Start production server
npm start
```

For persistent systemd service (`/etc/systemd/system/fireball.service`):
```ini
[Unit]
Description=Fireball Systems Intelligence Engine
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/fireball
ExecStart=/usr/bin/node /var/www/fireball/server.js
Restart=on-failure
Environment=NODE_ENV=production PORT=3000

[Install]
WantedBy=multi-user.target
```

---

## 4. Local Quick Start

### Running the Web Dashboard
```bash
npm run dev
```
Open `http://localhost:3000` to view the Fireball dashboard.

### Running the Linux Agent
```bash
cd agent

# 1. Self-diagnostic health check
python3 fireball_agent.py --health

# 2. Single-sample capture
python3 fireball_agent.py --once

# 3. Continuous monitoring
python3 fireball_agent.py --run
```

---

## 5. Automated Test Suite

Fireball includes automated unit and integration tests across both TypeScript and Python:

```bash
npm test
```

### Verified Test Cases:
1. `anomalyDetection.test.ts`:
   - Normal baseline produces zero false positives.
   - Sustained high CPU (>85% over 3 intervals) detected.
   - Low available physical memory (<15%) detected.
   - Linux PSI scheduler pressure detected.
   - Null/unsupported PSI handled safely without defaulting to zero.
2. `diagnosticEngine.test.ts`:
   - Explicit Insufficient Evidence outcome emitted on sparse data.
   - CPU surge with normal latency diagnosed as decoupled background activity.
   - Memory starvation and swap thrashing correlated with response delay.
3. `experimentEngine.test.ts`:
   - Statistical metrics (mean, median, p95, p99) computed.
   - Sample sufficiency gate flags sparse datasets as inconclusive.
   - Verified outcome `supported` with percentage change calculation.
   - Verified outcome `refuted` when intervention degrades target metric.
4. `test_agent.py`:
   - Bounded ring buffer eviction and FIFO retention.
   - Capabilities detection across Linux/WSL2/container environments.
   - Unsupported PSI paths return `None`, never `0.0`.
   - `/proc/meminfo` parsing and validation.

---

## 6. License

This project is licensed under the [MIT License](LICENSE).

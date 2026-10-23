# Fireball Linux Telemetry Agent

High-performance, zero-privilege Linux systems intelligence agent. Runs natively on Ubuntu 24.04 LTS, WSL2 Ubuntu, and modern Linux kernels.

## 1. Quick Start

```bash
# 1. Run health check
python3 fireball_agent.py --health

# 2. Capture a single sample
python3 fireball_agent.py --once

# 3. Continuous collection (reads agent_config.json if present)
python3 fireball_agent.py --run
```

## 2. Configuration (`agent_config.json`)

Generate your machine enrollment token in the **Fireball Dashboard** under the **Agent** tab, then save as `agent_config.json`:

```json
{
  "backendUrl": "https://your-fireball-app.com/api/telemetry/ingest",
  "machineId": "host-ubuntu-prod-01",
  "enrollmentToken": "fb_token_xxxxxxxxxxxx",
  "samplingIntervalSec": 2,
  "probeEndpointUrl": "http://localhost:8080/health"
}
```

## 3. Ubuntu 24.04 & WSL2 Architecture Notes

### WSL2 Considerations
- **Kernel Pressure Stall Information (PSI):** Standard WSL2 kernels built without `CONFIG_PSI=y` will not have `/proc/pressure/*`. The agent detects this at runtime and reports `null` (never false zeroes) to prevent skewed statistics.
- **Virtualized Disk Counters:** In WSL2, `/proc/diskstats` may map to virtual `vd*` devices or loop mounts. The agent filters to active storage devices.
- **Non-Root Execution:** The agent reads `/proc` and `/sys` safely as an unprivileged user. Never run monitoring agents as root.

### Service Prerequisites & Firebase Billing
- **Ingestion Cadence:** A default 2-second sampling interval generates ~30 samples/minute. For production environments, configure `samplingIntervalSec: 5` or `10` to optimize Firestore write quota under the Spark/Blaze plan.
- **Offline Buffering:** If your network drops or the cloud backend is restarting, the agent buffers up to 100 samples in a FIFO ring buffer and automatically replays upon reconnection.

## 4. CLI Commands & Safe Benchmark Workloads

- **Health & Capabilities:**
  ```bash
  python3 fireball_agent.py --health
  ```
- **Safe CPU Demo Workload (10 seconds):**
  ```bash
  python3 fireball_agent.py --workload cpu --duration 10
  ```
- **Safe Memory Demo Workload (256 MB for 10 seconds):**
  ```bash
  python3 fireball_agent.py --workload memory --duration 10
  ```
- **Export Markdown & JSON Diagnostic Report:**
  ```bash
  python3 fireball_agent.py --export-report
  ```

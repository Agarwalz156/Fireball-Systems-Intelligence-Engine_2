#!/usr/bin/env python3
"""
Fireball — Real Windows System Monitor Script
Path: scripts/windows_monitor.py
Direct download URL: /scripts/windows_monitor.py or /windows_monitor.py

Collects live hardware performance metrics using `psutil` on Windows, Linux, or macOS:
- CPU utilization (overall and per-core breakdown)
- RAM / Physical Memory (used, available, total, percentage)
- Disk usage and I/O rates (total, used, free, read/write bytes per sec)
- Network throughput (RX/TX bytes per sec, error counts)
- System uptime, hostname, platform, and OS release version
- Top resource-consuming processes (PID, name, CPU %, RAM %, RSS bytes)

Sends telemetry securely via HTTP POST to the Fireball API endpoint (/api/telemetry or /api/telemetry/ingest)
using an Authorization Bearer token.
"""

import sys
import os
import platform
import time
import json
import logging
import argparse
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

# Try importing psutil; handle gracefully if not yet installed
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

# Try importing requests; fallback to urllib standard library if needed
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    import urllib.request
    import urllib.error

VERSION = "2.2.0"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("fireball-monitor")


class SystemMetricsCollector:
    """Collects real-time hardware measurements across Windows, Linux, and macOS."""

    def __init__(self):
        self.prev_disk_io: Optional[Tuple[float, float, float]] = None
        self.prev_net_io: Optional[Tuple[float, float, float]] = None
        self.collection_errors: List[str] = []

        if HAS_PSUTIL:
            try:
                psutil.cpu_percent(interval=None)
                psutil.cpu_percent(percpu=True)
            except Exception:
                pass

    def get_system_info(self) -> Dict[str, Any]:
        """Returns OS, platform, architecture, and core system properties."""
        sys_name = platform.system()
        plat = "windows" if sys_name == "Windows" else ("darwin" if sys_name == "Darwin" else "linux")
        release = platform.release()
        version = platform.version()

        cpu_cores = os.cpu_count() or 1
        total_ram = 0

        if HAS_PSUTIL:
            try:
                cpu_cores = psutil.cpu_count(logical=True) or cpu_cores
                total_ram = psutil.virtual_memory().total
            except Exception as e:
                self.collection_errors.append(f"RAM metadata error: {e}")

        uptime_sec = 0.0
        if HAS_PSUTIL:
            try:
                uptime_sec = round(time.time() - psutil.boot_time(), 1)
            except Exception:
                pass

        return {
            "hostname": platform.node(),
            "os": sys_name,
            "platform": plat,
            "osVersion": f"{sys_name} {release} (Build {version})",
            "kernel": version,
            "arch": platform.machine(),
            "cpuCores": cpu_cores,
            "totalMemoryBytes": total_ram,
            "agentVersion": f"{VERSION}-{plat}",
            "uptimeSeconds": uptime_sec,
            "capabilities": {
                "hasPsi": plat == "linux" and os.path.exists("/proc/pressure/cpu"),
                "hasSwap": True,
                "hasDiskStats": True,
                "hasNetworkStats": True,
                "hasProcessStats": True,
                "isWsl": "microsoft" in version.lower() if version else False,
                "isWindows": plat == "windows",
            },
        }

    def collect_cpu(self) -> Dict[str, Any]:
        """Collects overall CPU % and per-core utilization."""
        if not HAS_PSUTIL:
            return {"cpuPercent": 0.0, "cpuPerCore": [], "userPercent": None, "systemPercent": None}

        try:
            overall = psutil.cpu_percent(interval=None)
            per_core = psutil.cpu_percent(percpu=True)
            times = psutil.cpu_times_percent(interval=None)
            return {
                "cpuPercent": round(float(overall), 1),
                "cpuPerCore": [round(float(c), 1) for c in per_core],
                "userPercent": round(float(getattr(times, "user", 0.0)), 1),
                "systemPercent": round(float(getattr(times, "system", 0.0)), 1),
            }
        except Exception as e:
            self.collection_errors.append(f"CPU error: {e}")
            return {"cpuPercent": 0.0, "cpuPerCore": [], "userPercent": None, "systemPercent": None}

    def collect_memory(self) -> Dict[str, Any]:
        """Collects RAM and swap/pagefile usage."""
        if not HAS_PSUTIL:
            return {
                "memoryTotalBytes": 0,
                "memoryUsedBytes": 0,
                "memoryAvailableBytes": 0,
                "memoryPercent": 0.0,
                "swapTotalBytes": 0,
                "swapUsedBytes": 0,
                "swapPercent": 0.0,
            }

        try:
            vm = psutil.virtual_memory()
            sm = psutil.swap_memory()
            return {
                "memoryTotalBytes": vm.total,
                "memoryUsedBytes": vm.used,
                "memoryAvailableBytes": vm.available,
                "memoryPercent": round(float(vm.percent), 1),
                "swapTotalBytes": sm.total,
                "swapUsedBytes": sm.used,
                "swapPercent": round(float(sm.percent), 1),
            }
        except Exception as e:
            self.collection_errors.append(f"Memory error: {e}")
            return {
                "memoryTotalBytes": 0,
                "memoryUsedBytes": 0,
                "memoryAvailableBytes": 0,
                "memoryPercent": 0.0,
                "swapTotalBytes": 0,
                "swapUsedBytes": 0,
                "swapPercent": 0.0,
            }

    def collect_disk(self) -> Dict[str, Any]:
        """Collects root/primary drive space and I/O transfer rates."""
        result: Dict[str, Any] = {
            "diskTotalBytes": None,
            "diskUsedBytes": None,
            "diskAvailableBytes": None,
            "diskPercent": None,
            "diskReadBytesPerSec": None,
            "diskWriteBytesPerSec": None,
        }

        drive = "C:\\" if platform.system() == "Windows" else "/"
        if HAS_PSUTIL:
            try:
                usage = psutil.disk_usage(drive)
                result["diskTotalBytes"] = usage.total
                result["diskUsedBytes"] = usage.used
                result["diskAvailableBytes"] = usage.free
                result["diskPercent"] = round(float(usage.percent), 1)
            except Exception as e:
                self.collection_errors.append(f"Disk usage error on {drive}: {e}")

            try:
                io = psutil.disk_io_counters()
                now = time.time()
                if io and self.prev_disk_io:
                    prev_r, prev_w, prev_t = self.prev_disk_io
                    dt = now - prev_t
                    if dt > 0:
                        result["diskReadBytesPerSec"] = round(max(0.0, (io.read_bytes - prev_r) / dt), 2)
                        result["diskWriteBytesPerSec"] = round(max(0.0, (io.write_bytes - prev_w) / dt), 2)
                if io:
                    self.prev_disk_io = (io.read_bytes, io.write_bytes, now)
            except Exception as e:
                self.collection_errors.append(f"Disk I/O error: {e}")

        return result

    def collect_network(self) -> Dict[str, Any]:
        """Collects aggregate network throughput (RX and TX bytes/sec)."""
        result = {
            "networkRxBytesPerSec": None,
            "networkTxBytesPerSec": None,
            "networkErrorsPerSec": None,
        }

        if not HAS_PSUTIL:
            return result

        try:
            net = psutil.net_io_counters()
            now = time.time()
            if net and self.prev_net_io:
                prev_rx, prev_tx, prev_t = self.prev_net_io
                dt = now - prev_t
                if dt > 0:
                    result["networkRxBytesPerSec"] = round(max(0.0, (net.bytes_recv - prev_rx) / dt), 2)
                    result["networkTxBytesPerSec"] = round(max(0.0, (net.bytes_sent - prev_tx) / dt), 2)
                    result["networkErrorsPerSec"] = round((net.errin + net.errout) / dt, 2)
            if net:
                self.prev_net_io = (net.bytes_recv, net.bytes_sent, now)
        except Exception as e:
            self.collection_errors.append(f"Network error: {e}")

        return result

    def collect_top_processes(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Collects top processes by RAM and CPU. Never inspects command lines or private data."""
        if not HAS_PSUTIL:
            return []

        procs = []
        try:
            for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "memory_info"]):
                try:
                    info = p.info
                    name = info.get("name") or "unknown"
                    if name.lower() in ("system idle process", "idle"):
                        continue
                    cpu = float(info.get("cpu_percent") or 0.0)
                    mem = round(float(info.get("memory_percent") or 0.0), 1)
                    mem_info = info.get("memory_info")
                    rss = getattr(mem_info, "rss", 0) if mem_info else 0

                    procs.append({
                        "pid": info["pid"],
                        "name": name,
                        "cpuPercent": round(cpu, 1),
                        "memoryPercent": mem,
                        "rssBytes": rss,
                    })
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

            procs.sort(key=lambda x: (x["memoryPercent"], x["cpuPercent"]), reverse=True)
            return procs[:limit]
        except Exception as e:
            self.collection_errors.append(f"Process list error: {e}")
            return []


class WindowsMonitorAgent:
    """Orchestrates collecting metrics and POSTing telemetry to the Fireball API."""

    def __init__(self, endpoint_url: str, machine_id: str, token: str, interval_sec: int = 3):
        self.endpoint_url = endpoint_url
        self.machine_id = machine_id
        self.token = token
        self.interval_sec = max(1, interval_sec)
        self.collector = SystemMetricsCollector()
        self.running = False

    def build_payload(self) -> Dict[str, Any]:
        """Constructs a telemetry payload compatible with both /api/telemetry and /api/telemetry/ingest."""
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        meta = self.collector.get_system_info()
        cpu = self.collector.collect_cpu()
        mem = self.collector.collect_memory()
        disk = self.collector.collect_disk()
        net = self.collector.collect_network()
        procs = self.collector.collect_top_processes(limit=5)

        uptime_sec = meta["uptimeSeconds"]

        # Encapsulate full telemetry sample
        sample_dict = {
            "machineId": self.machine_id,
            "timestamp": now_iso,
            "intervalSeconds": self.interval_sec,
            "cpuPercent": cpu["cpuPercent"],
            "cpuPerCore": cpu.get("cpuPerCore"),
            "cpuUserPercent": cpu.get("userPercent"),
            "cpuSystemPercent": cpu.get("systemPercent"),
            "load1m": None,
            "load5m": None,
            "load15m": None,
            "uptimeSeconds": uptime_sec,
            "memoryPercent": mem["memoryPercent"],
            "memoryTotalBytes": mem["memoryTotalBytes"],
            "memoryUsedBytes": mem["memoryUsedBytes"],
            "memoryAvailableBytes": mem["memoryAvailableBytes"],
            "swapPercent": mem["swapPercent"],
            "swapTotalBytes": mem["swapTotalBytes"],
            "swapUsedBytes": mem["swapUsedBytes"],
            "diskPercent": disk.get("diskPercent"),
            "diskTotalBytes": disk.get("diskTotalBytes"),
            "diskUsedBytes": disk.get("diskUsedBytes"),
            "diskAvailableBytes": disk.get("diskAvailableBytes"),
            "diskReadBytesPerSec": disk.get("diskReadBytesPerSec"),
            "diskWriteBytesPerSec": disk.get("diskWriteBytesPerSec"),
            "networkRxBytesPerSec": net.get("networkRxBytesPerSec"),
            "networkTxBytesPerSec": net.get("networkTxBytesPerSec"),
            "networkErrorsPerSec": net.get("networkErrorsPerSec"),
            "psiCpuSome10": None,
            "psiMemorySome10": None,
            "psiIoSome10": None,
            "httpLatencyMs": None,
            "httpStatusCode": None,
            "topProcesses": procs,
        }

        # Provide both top-level metric fields AND nested sample object for universal backend compatibility
        payload = {
            "machineId": self.machine_id,
            "enrollmentToken": self.token,
            "token": self.token,
            "timestamp": now_iso,
            "sample": sample_dict,
            "machineMetadata": meta,
            **sample_dict,  # also spread at top-level
        }
        return payload

    def send_telemetry(self, payload: Dict[str, Any]) -> Tuple[bool, int, str]:
        """POSTs telemetry payload with Bearer authentication."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}",
            "User-Agent": f"FireballWindowsMonitor/{VERSION}",
        }
        data_bytes = json.dumps(payload).encode("utf-8")

        if HAS_REQUESTS:
            try:
                resp = requests.post(self.endpoint_url, data=data_bytes, headers=headers, timeout=5)
                return resp.status_code in (200, 201), resp.status_code, resp.text
            except Exception as e:
                return False, 0, str(e)
        else:
            try:
                req = urllib.request.Request(self.endpoint_url, data=data_bytes, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    code = resp.getcode()
                    return code in (200, 201), code, resp.read().decode("utf-8", errors="ignore")
            except urllib.error.HTTPError as e:
                return False, e.code, e.read().decode("utf-8", errors="ignore")
            except Exception as e:
                return False, 0, str(e)

    def run(self):
        """Runs the monitoring agent loop indefinitely."""
        self.running = True
        logger.info(f"Starting Fireball Windows Monitor v{VERSION}")
        logger.info(f"Host:      {platform.node()} ({platform.system()} {platform.release()})")
        logger.info(f"Target:    {self.endpoint_url}")
        logger.info(f"Machine:   {self.machine_id}")
        logger.info(f"Interval:  {self.interval_sec}s")

        if not HAS_PSUTIL:
            logger.warning("WARNING: 'psutil' is not installed. For high-resolution hardware counters, run:")
            logger.warning("         py -3 -m pip install psutil requests")

        try:
            while self.running:
                payload = self.build_payload()
                ok, code, msg = self.send_telemetry(payload)
                cpu = payload.get("cpuPercent", 0)
                mem = payload.get("memoryPercent", 0)
                if ok:
                    logger.info(f"✓ Telemetry dispatched (HTTP {code}): CPU {cpu}% | RAM {mem}%")
                elif code == 401:
                    logger.error("✕ Authentication failed: Invalid machine token.")
                    time.sleep(5)
                elif code == 403:
                    logger.error("✕ Machine token has been revoked in dashboard.")
                    time.sleep(10)
                else:
                    logger.warning(f"⚠ Telemetry dispatch failed (HTTP {code}): {msg[:80]}")

                time.sleep(self.interval_sec)
        except KeyboardInterrupt:
            logger.info("Monitor stopped by user. Exiting cleanly.")
            self.running = False


def main():
    parser = argparse.ArgumentParser(description="Fireball Windows System Monitoring Agent")
    default_host = platform.node().lower().replace(" ", "-")
    default_id = f"win-{default_host}"

    parser.add_argument("--url", default="https://ais-dev-ko6ucrltlcrhb5odbgg2k7-480134225901.asia-east1.run.app/api/telemetry", help="Target API endpoint")
    parser.add_argument("--machine-id", default=os.getenv("FIREBALL_MACHINE_ID", default_id), help="Machine ID")
    parser.add_argument("--token", default=os.getenv("FIREBALL_TOKEN", "fb_win_token_primary"), help="Machine auth token")
    parser.add_argument("--interval", type=int, default=3, help="Sampling interval in seconds")
    parser.add_argument("--once", action="store_true", help="Capture single sample and print JSON")
    args = parser.parse_args()

    agent = WindowsMonitorAgent(
        endpoint_url=args.url,
        machine_id=args.machine_id,
        token=args.token,
        interval_sec=args.interval,
    )

    if args.once:
        payload = agent.build_payload()
        print(json.dumps(payload, indent=2))
    else:
        agent.run()


if __name__ == "__main__":
    main()

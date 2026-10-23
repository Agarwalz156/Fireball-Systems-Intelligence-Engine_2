#!/usr/bin/env python3
"""
Fireball — Real Windows System Monitoring Agent
Version: 2.1.0-windows

Collects real-time operating system telemetry from Windows machines:
- Aggregate & per-core CPU utilization
- Physical RAM (Total, Used, Available, Active %)
- Windows Pagefile / Swap memory
- Root / System Drive (C:) capacity, free space, and disk I/O rates
- Network throughput (RX/TX bytes/sec, error counts)
- Top resource-consuming processes (PID, name, CPU %, RAM %, RSS bytes)
- System uptime, hostname, OS build version, and agent health

Security & Privacy:
- Never collects sensitive process command-line arguments, environment vars, or user files.
- Uses revocable machine-specific enrollment tokens with Bearer header authentication.
- Bounded in-memory telemetry queue with exponential retry backoff.
- Runs with standard unprivileged user permissions (No Administrator required).
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

# Try importing requests; fallback to urllib if not installed
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False
    import urllib.request
    import urllib.error

AGENT_VERSION = "2.1.0-windows"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("fireball-windows-agent")


class BoundedTelemetryBuffer:
    """Ring buffer ensuring telemetry queue never exhausts memory on network disconnects."""

    def __init__(self, capacity: int = 120):
        self.capacity = capacity
        self.buffer: List[Dict[str, Any]] = []

    def push(self, sample: Dict[str, Any]) -> None:
        if len(self.buffer) >= self.capacity:
            self.buffer.pop(0)  # Evict oldest sample
        self.buffer.append(sample)

    def pop_all(self) -> List[Dict[str, Any]]:
        samples = list(self.buffer)
        self.buffer.clear()
        return samples

    def peek(self) -> Optional[Dict[str, Any]]:
        return self.buffer[-1] if self.buffer else None

    def __len__(self) -> int:
        return len(self.buffer)


class WindowsTelemetryCollector:
    """Collects actual Windows operating system measurements using psutil and Windows APIs."""

    def __init__(self):
        self.prev_disk_io: Optional[Tuple[float, float, float]] = None  # (read_bytes, write_bytes, timestamp)
        self.prev_net_io: Optional[Tuple[float, float, float]] = None   # (rx_bytes, tx_bytes, timestamp)
        self.collection_errors: List[str] = []

        # Prime psutil cpu counters on initialization
        if HAS_PSUTIL:
            try:
                psutil.cpu_percent(interval=None)
                psutil.cpu_percent(percpu=True)
            except Exception:
                pass

    def get_system_metadata(self) -> Dict[str, Any]:
        """Gathers machine hardware, OS version, and platform metadata."""
        node = platform.node()
        system = platform.system()
        release = platform.release()
        version = platform.version()
        arch = platform.machine()
        
        cpu_cores = os.cpu_count() or 1
        total_ram = 0

        if HAS_PSUTIL:
            try:
                cpu_cores = psutil.cpu_count(logical=True) or cpu_cores
                total_ram = psutil.virtual_memory().total
            except Exception as e:
                self.collection_errors.append(f"Metadata RAM error: {e}")

        # Human-friendly Windows build name
        os_version_str = f"Windows {release} (Build {version})" if system == "Windows" else f"{system} {release}"

        # Uptime in seconds
        uptime_sec = 0.0
        if HAS_PSUTIL:
            try:
                uptime_sec = round(time.time() - psutil.boot_time(), 1)
            except Exception:
                pass

        return {
            "hostname": node,
            "os": "Windows" if system == "Windows" else system,
            "platform": "windows" if system == "Windows" else "linux",
            "osVersion": os_version_str,
            "kernel": version,
            "arch": arch,
            "cpuCores": cpu_cores,
            "totalMemoryBytes": total_ram,
            "agentVersion": AGENT_VERSION,
            "uptimeSeconds": uptime_sec,
            "capabilities": {
                "hasPsi": False,  # Linux-specific; never pretend Windows has PSI
                "hasSwap": True,   # Windows Pagefile
                "hasDiskStats": True,
                "hasNetworkStats": True,
                "hasProcessStats": True,
                "isWsl": "microsoft" in version.lower() if version else False,
                "isContainer": False,
                "isWindows": True,
            },
            "availableMetrics": [
                "cpu",
                "cpu_per_core",
                "memory",
                "pagefile_swap",
                "disk_usage",
                "disk_io_rates",
                "network_io_rates",
                "processes",
                "uptime",
            ],
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
            self.collection_errors.append(f"CPU collection error: {e}")
            return {"cpuPercent": 0.0, "cpuPerCore": [], "userPercent": None, "systemPercent": None}

    def collect_memory(self) -> Dict[str, Any]:
        """Collects Windows physical RAM and pagefile swap metrics."""
        if not HAS_PSUTIL:
            # Fallback using ctypes if on Windows and psutil is not yet installed
            if platform.system() == "Windows":
                try:
                    import ctypes
                    class MEMORYSTATUSEX(ctypes.Structure):
                        _fields_ = [
                            ("dwLength", ctypes.c_ulong),
                            ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong),
                            ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong),
                            ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong),
                            ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                        ]
                    stat = MEMORYSTATUSEX()
                    stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
                    total = stat.ullTotalPhys
                    avail = stat.ullAvailPhys
                    used = total - avail
                    pct = round((used / total * 100.0), 1) if total > 0 else 0.0
                    return {
                        "memoryTotalBytes": total,
                        "memoryUsedBytes": used,
                        "memoryAvailableBytes": avail,
                        "memoryPercent": pct,
                        "swapTotalBytes": stat.ullTotalPageFile,
                        "swapUsedBytes": stat.ullTotalPageFile - stat.ullAvailPageFile,
                        "swapPercent": round(((stat.ullTotalPageFile - stat.ullAvailPageFile) / stat.ullTotalPageFile * 100), 1) if stat.ullTotalPageFile > 0 else 0.0,
                    }
                except Exception:
                    pass
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
            self.collection_errors.append(f"Memory collection error: {e}")
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
        """Collects Windows primary drive (C:\\) usage and I/O transfer rates."""
        result: Dict[str, Any] = {
            "diskTotalBytes": None,
            "diskUsedBytes": None,
            "diskAvailableBytes": None,
            "diskPercent": None,
            "diskReadBytesPerSec": None,
            "diskWriteBytesPerSec": None,
        }

        # 1. Drive capacity & free space
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

        # 2. Disk I/O rates
        if HAS_PSUTIL:
            try:
                io = psutil.disk_io_counters()
                now = time.time()
                if io and self.prev_disk_io:
                    prev_r, prev_w, prev_t = self.prev_disk_io
                    dt = now - prev_t
                    if dt > 0:
                        r_rate = max(0.0, (io.read_bytes - prev_r) / dt)
                        w_rate = max(0.0, (io.write_bytes - prev_w) / dt)
                        result["diskReadBytesPerSec"] = round(r_rate, 2)
                        result["diskWriteBytesPerSec"] = round(w_rate, 2)
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
                    rx_rate = max(0.0, (net.bytes_recv - prev_rx) / dt)
                    tx_rate = max(0.0, (net.bytes_sent - prev_tx) / dt)
                    result["networkRxBytesPerSec"] = round(rx_rate, 2)
                    result["networkTxBytesPerSec"] = round(tx_rate, 2)
                    result["networkErrorsPerSec"] = round((net.errin + net.errout) / dt, 2)
            if net:
                self.prev_net_io = (net.bytes_recv, net.bytes_sent, now)
        except Exception as e:
            self.collection_errors.append(f"Network rate error: {e}")

        return result

    def collect_top_processes(self, limit: int = 5) -> List[Dict[str, Any]]:
        """Collects top processes by CPU and memory. Avoids sensitive cmdlines."""
        if not HAS_PSUTIL:
            return []

        procs = []
        try:
            for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "memory_info"]):
                try:
                    info = p.info
                    name = info.get("name") or "unknown"
                    # Exclude Windows system idle process
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

            # Sort primarily by memory, then CPU
            procs.sort(key=lambda x: (x["memoryPercent"], x["cpuPercent"]), reverse=True)
            return procs[:limit]
        except Exception as e:
            self.collection_errors.append(f"Process list error: {e}")
            return []


class WindowsMonitoringAgent:
    """Main orchestrator for Windows system telemetry collection, buffering, and HTTP transmission."""

    def __init__(self, config_path: str = "agent_config.json"):
        self.config_path = config_path
        self.collector = WindowsTelemetryCollector()
        self.buffer = BoundedTelemetryBuffer(capacity=120)
        self.config = self.load_config()
        self.running = False

    def load_config(self) -> Dict[str, Any]:
        """Loads configuration from JSON file or generates intelligent defaults."""
        node_name = platform.node().lower().replace(" ", "-")
        default_config = {
            "backendUrl": "http://localhost:3000/api/telemetry/ingest",
            "machineId": f"win-{node_name}",
            "machineName": f"Windows Laptop ({platform.node()})",
            "enrollmentToken": f"fb_win_token_{node_name}",
            "samplingIntervalSec": 3,
            "probeEndpointUrl": None,
            "alertRules": {
                "cpuWarningPercent": 75,
                "cpuCriticalPercent": 90,
                "cpuSustainedCycles": 3,
                "memoryWarningPercent": 80,
                "memoryCriticalPercent": 90,
                "destinations": {"emails": [], "webhooks": []},
            },
        }

        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    user_cfg = json.load(f)
                    default_config.update(user_cfg)
                    logger.info(f"Loaded configuration from {self.config_path}")
            except Exception as e:
                logger.warning(f"Failed to read {self.config_path}, using defaults: {e}")
        else:
            logger.info(f"No config found at {self.config_path}. Using default configuration.")

        return default_config

    def capture_sample(self) -> Dict[str, Any]:
        """Captures a pristine telemetry sample with real Windows hardware metrics."""
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        cpu = self.collector.collect_cpu()
        mem = self.collector.collect_memory()
        disk = self.collector.collect_disk()
        net = self.collector.collect_network()
        procs = self.collector.collect_top_processes(limit=5)

        uptime_sec = 0.0
        if HAS_PSUTIL:
            try:
                uptime_sec = round(time.time() - psutil.boot_time(), 1)
            except Exception:
                pass

        sample = {
            "machineId": self.config["machineId"],
            "timestamp": now_iso,
            "intervalSeconds": self.config.get("samplingIntervalSec", 3),
            "cpuPercent": cpu["cpuPercent"],
            "cpuPerCore": cpu.get("cpuPerCore"),
            "cpuUserPercent": cpu.get("userPercent"),
            "cpuSystemPercent": cpu.get("systemPercent"),
            "load1m": None,  # Explicitly null on Windows (avoids fabricating UNIX load averages)
            "load5m": None,
            "load15m": None,
            "uptimeSeconds": uptime_sec,
            "memoryTotalBytes": mem["memoryTotalBytes"],
            "memoryUsedBytes": mem["memoryUsedBytes"],
            "memoryAvailableBytes": mem["memoryAvailableBytes"],
            "memoryPercent": mem["memoryPercent"],
            "swapTotalBytes": mem["swapTotalBytes"],
            "swapUsedBytes": mem["swapUsedBytes"],
            "swapPercent": mem["swapPercent"],
            "diskTotalBytes": disk.get("diskTotalBytes"),
            "diskUsedBytes": disk.get("diskUsedBytes"),
            "diskAvailableBytes": disk.get("diskAvailableBytes"),
            "diskPercent": disk.get("diskPercent"),
            "diskReadBytesPerSec": disk.get("diskReadBytesPerSec"),
            "diskWriteBytesPerSec": disk.get("diskWriteBytesPerSec"),
            "networkRxBytesPerSec": net.get("networkRxBytesPerSec"),
            "networkTxBytesPerSec": net.get("networkTxBytesPerSec"),
            "networkErrorsPerSec": net.get("networkErrorsPerSec"),
            "psiCpuSome10": None,  # Transparently null; Windows kernel does not have Linux PSI
            "psiMemorySome10": None,
            "psiIoSome10": None,
            "httpLatencyMs": None,
            "httpStatusCode": None,
            "topProcesses": procs,
        }
        return sample

    def send_payload(self, sample: Dict[str, Any]) -> Tuple[bool, int, str]:
        """Transmits telemetry to the Fireball ingestion endpoint with authentication."""
        backend_url = self.config["backendUrl"]
        token = self.config.get("enrollmentToken", "")
        meta = self.collector.get_system_metadata()
        meta["name"] = self.config.get("machineName", f"Windows Laptop ({platform.node()})")
        meta["collectionErrors"] = list(self.collector.collection_errors)

        payload = {
            "machineId": self.config["machineId"],
            "enrollmentToken": token,
            "sample": sample,
            "machineMetadata": meta,
        }

        # Clear transient errors after sending
        self.collector.collection_errors.clear()

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "User-Agent": f"FireballWindowsAgent/{AGENT_VERSION}",
        }

        data_bytes = json.dumps(payload).encode("utf-8")

        if HAS_REQUESTS:
            try:
                resp = requests.post(backend_url, data=data_bytes, headers=headers, timeout=5)
                return resp.status_code in (200, 201), resp.status_code, resp.text
            except Exception as e:
                return False, 0, str(e)
        else:
            # Fallback to urllib standard library
            try:
                req = urllib.request.Request(backend_url, data=data_bytes, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=5) as resp:
                    code = resp.getcode()
                    body = resp.read().decode("utf-8")
                    return code in (200, 201), code, body
            except urllib.error.HTTPError as e:
                return False, e.code, e.read().decode("utf-8", errors="ignore")
            except Exception as e:
                return False, 0, str(e)

    def print_health_check(self) -> None:
        """Runs a self-diagnostic check on Windows OS metrics and prints report."""
        meta = self.collector.get_system_metadata()
        sample = self.capture_sample()

        print("=" * 60)
        print(f"🔥 FIREBALL WINDOWS AGENT — HEALTH & CAPABILITIES AUDIT")
        print("=" * 60)
        print(f"Agent Version:     v{AGENT_VERSION}")
        print(f"Hostname:          {meta['hostname']}")
        print(f"Operating System:  {meta['osVersion']}")
        print(f"Architecture:      {meta['arch']} ({meta['cpuCores']} logical CPU cores)")
        print(f"psutil Installed:  {'✓ Yes (High-Performance C-Bindings)' if HAS_PSUTIL else '✕ No (Standard Library fallback)'}")
        print(f"Total Physical RAM: {meta['totalMemoryBytes'] / (1024**3):.1f} GB")
        print(f"System Uptime:     {meta['uptimeSeconds'] / 3600:.1f} hours")
        print("-" * 60)
        print("CURRENT HARDWARE OBSERVATIONS:")
        print(f"  CPU Total:       {sample['cpuPercent']}%")
        if sample.get('cpuPerCore'):
            core_str = ", ".join([f"Core {i}: {c}%" for i, c in enumerate(sample['cpuPerCore'][:8])])
            print(f"  Per-Core CPU:    {core_str}")
        print(f"  RAM Usage:       {sample['memoryPercent']}% ({sample['memoryUsedBytes'] / (1024**3):.2f} / {sample['memoryTotalBytes'] / (1024**3):.2f} GB)")
        print(f"  Pagefile Swap:   {sample['swapPercent']}% ({sample['swapUsedBytes'] / (1024**3):.2f} GB used)")
        if sample.get('diskPercent') is not None:
            print(f"  Disk Space (C:): {sample['diskPercent']}% ({sample['diskAvailableBytes'] / (1024**3):.1f} GB free)")
        if sample.get('networkRxBytesPerSec') is not None:
            print(f"  Network Rates:   RX: {sample['networkRxBytesPerSec'] / 1024:.1f} KB/s | TX: {sample['networkTxBytesPerSec'] / 1024:.1f} KB/s")
        print(f"  Top Processes:   {len(sample['topProcesses'])} active processes inspected")
        for p in sample['topProcesses']:
            print(f"    - PID {p['pid']:<6} {p['name']:<24} CPU: {p['cpuPercent']}%  RAM: {p['memoryPercent']}% ({p['rssBytes'] // (1024*1024)} MB)")
        print("=" * 60)

    def run(self) -> None:
        """Starts the continuous telemetry collection and transmission loop."""
        self.running = True
        interval = max(1, self.config.get("samplingIntervalSec", 3))
        rules = self.config.get("alertRules", {})
        cpu_warn = rules.get("cpuWarningPercent", 75)
        cpu_crit = rules.get("cpuCriticalPercent", 90)

        logger.info(f"Fireball Windows Agent v{AGENT_VERSION} started on {platform.node()}")
        logger.info(f"Target backend: {self.config['backendUrl']}")
        logger.info(f"Machine ID:     {self.config['machineId']}")
        logger.info(f"Sampling rate:  Every {interval} seconds")
        logger.info(f"Alert Rules:    CPU Warn={cpu_warn}%, Crit={cpu_crit}%")

        if not HAS_PSUTIL:
            logger.warning("NOTE: 'psutil' is not installed. To unlock high-resolution counters, run:")
            logger.warning("      pip install -r requirements.txt")

        retry_backoff = 1.0

        try:
            while self.running:
                # Capture real system sample
                sample = self.capture_sample()
                self.buffer.push(sample)

                # Local threshold monitoring log
                if sample["cpuPercent"] >= cpu_crit:
                    logger.error(f"[ALERT: CRITICAL] CPU utilization {sample['cpuPercent']}% exceeded critical threshold ({cpu_crit}%)!")
                elif sample["cpuPercent"] >= cpu_warn:
                    logger.warning(f"[ALERT: WARNING] CPU utilization {sample['cpuPercent']}% exceeded warning threshold ({cpu_warn}%)!")

                # Transmit to backend
                ok, status, msg = self.send_payload(sample)
                if ok:
                    logger.info(f"✓ Ingested sample: CPU={sample['cpuPercent']}% | RAM={sample['memoryPercent']}% | Status={status}")
                    retry_backoff = 1.0
                elif status == 401:
                    logger.error("✕ Authentication failed! The enrollment token was rejected by the backend.")
                    logger.error("  Please check 'enrollmentToken' in agent_config.json.")
                    time.sleep(5)
                elif status == 403:
                    logger.error("✕ Forbidden! This machine enrollment has been revoked in the dashboard.")
                    time.sleep(10)
                else:
                    logger.warning(f"⚠ Backend transmission failed (HTTP {status}): {msg[:100]}. Backing off {retry_backoff:.1f}s")
                    time.sleep(retry_backoff)
                    retry_backoff = min(30.0, retry_backoff * 1.5)

                time.sleep(interval)
        except KeyboardInterrupt:
            logger.info("Agent stopped by user (Ctrl+C). Exiting cleanly.")
            self.running = False


def main():
    parser = argparse.ArgumentParser(description="Fireball Windows Monitoring Agent")
    parser.add_argument("--run", action="store_true", help="Start continuous monitoring loop")
    parser.add_argument("--once", action="store_true", help="Capture single sample and print JSON")
    parser.add_argument("--health", action="store_true", help="Run local hardware and capability audit")
    parser.add_argument("--config", type=str, default="agent_config.json", help="Path to config file")
    args = parser.parse_args()

    agent = WindowsMonitoringAgent(config_path=args.config)

    if args.health:
        agent.print_health_check()
    elif args.once:
        sample = agent.capture_sample()
        print(json.dumps(sample, indent=2))
    elif args.run:
        agent.run()
    else:
        # Default to interactive health check if no args provided
        agent.print_health_check()
        print("\nTo start continuous monitoring, execute:")
        print("  python fireball_windows_agent.py --run\n")


if __name__ == "__main__":
    main()

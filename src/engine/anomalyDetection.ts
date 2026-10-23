import { TelemetrySample, Anomaly, AnomalySeverity, AlertRulesConfig } from '../types/telemetry';

export interface AnomalyDetectionConfig {
  cpuThresholdPercent: number;
  cpuSustainedSamples: number;
  memoryLowPercent: number;
  swapThrashingThresholdBytesSec: number;
  diskIoThresholdBytesSec: number;
  latencyHighThresholdMs: number;
  psiPressureThreshold: number; // e.g. 20%
}

export const DEFAULT_DETECTION_CONFIG: AnomalyDetectionConfig = {
  cpuThresholdPercent: 85,
  cpuSustainedSamples: 3,
  memoryLowPercent: 15,
  swapThrashingThresholdBytesSec: 10 * 1024 * 1024, // 10 MB/s
  diskIoThresholdBytesSec: 60 * 1024 * 1024, // 60 MB/s
  latencyHighThresholdMs: 400, // 400ms
  psiPressureThreshold: 25.0, // 25% stall
};

export function mapAlertRulesToDetectionConfig(
  rules?: Partial<AlertRulesConfig>
): AnomalyDetectionConfig {
  if (!rules) return DEFAULT_DETECTION_CONFIG;
  return {
    cpuThresholdPercent: rules.cpuWarningPercent ?? DEFAULT_DETECTION_CONFIG.cpuThresholdPercent,
    cpuSustainedSamples: rules.cpuSustainedCycles ?? DEFAULT_DETECTION_CONFIG.cpuSustainedSamples,
    memoryLowPercent: rules.memoryWarningPercent ? Math.max(1, 100 - rules.memoryWarningPercent) : DEFAULT_DETECTION_CONFIG.memoryLowPercent,
    swapThrashingThresholdBytesSec: DEFAULT_DETECTION_CONFIG.swapThrashingThresholdBytesSec,
    diskIoThresholdBytesSec: rules.diskIoThresholdMBs ? rules.diskIoThresholdMBs * 1024 * 1024 : DEFAULT_DETECTION_CONFIG.diskIoThresholdBytesSec,
    latencyHighThresholdMs: rules.latencyThresholdMs ?? DEFAULT_DETECTION_CONFIG.latencyHighThresholdMs,
    psiPressureThreshold: DEFAULT_DETECTION_CONFIG.psiPressureThreshold,
  };
}

/**
 * Evaluates recent window of telemetry samples to detect performance anomalies.
 * Operates purely without external LLMs, ensuring deterministic, testable, and explainable results.
 */
export function detectAnomalies(
  recentSamples: TelemetrySample[],
  config: AnomalyDetectionConfig = DEFAULT_DETECTION_CONFIG
): Anomaly[] {
  if (!recentSamples || recentSamples.length === 0) {
    return [];
  }

  // Sort chronologically ascending
  const sorted = [...recentSamples].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const detected: Anomaly[] = [];

  const timeWindow = `${sorted[0].timestamp.substring(11, 19)} - ${latest.timestamp.substring(11, 19)}`;

  // 1. Sustained High CPU Utilization
  const recentWindow = sorted.slice(-config.cpuSustainedSamples);
  if (
    recentWindow.length >= config.cpuSustainedSamples &&
    recentWindow.every((s) => s.cpuPercent >= config.cpuThresholdPercent)
  ) {
    const avgCpu = Math.round(
      (recentWindow.reduce((acc, s) => acc + s.cpuPercent, 0) / recentWindow.length) * 10
    ) / 10;
    const severity: AnomalySeverity = avgCpu >= 95 ? 'critical' : 'warning';
    detected.push({
      id: `anom-cpu-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      machineId: latest.machineId,
      ownerId: latest.ownerId,
      metricName: 'cpu_utilization',
      severity,
      observedValue: avgCpu,
      threshold: config.cpuThresholdPercent,
      unit: '%',
      explanation: `Sustained high CPU usage averaging ${avgCpu}% over last ${recentWindow.length} intervals (threshold: ${config.cpuThresholdPercent}%).`,
      timeWindow,
      status: 'active',
      detectedAt: latest.timestamp,
      createdAt: new Date().toISOString(),
      relatedMetrics: {
        load1m: latest.load1m ?? null,
        cpuIowaitPercent: latest.cpuIowaitPercent ?? null,
      },
    });
  }

  // 2. Low Available Physical Memory
  // Calculate available memory percentage
  const availablePercent =
    latest.memoryTotalBytes > 0
      ? (latest.memoryAvailableBytes / latest.memoryTotalBytes) * 100
      : null;

  if (availablePercent !== null && availablePercent <= config.memoryLowPercent) {
    const mbAvail = Math.round(latest.memoryAvailableBytes / (1024 * 1024));
    const severity: AnomalySeverity = availablePercent <= 5 ? 'critical' : 'warning';
    detected.push({
      id: `anom-mem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      machineId: latest.machineId,
      ownerId: latest.ownerId,
      metricName: 'memory_available',
      severity,
      observedValue: Math.round(availablePercent * 10) / 10,
      threshold: config.memoryLowPercent,
      unit: '% available',
      explanation: `Physical memory exhaustion risk: only ${Math.round(availablePercent * 10) / 10}% (${mbAvail} MB) available (threshold: ${config.memoryLowPercent}%).`,
      timeWindow,
      status: 'active',
      detectedAt: latest.timestamp,
      createdAt: new Date().toISOString(),
      relatedMetrics: {
        memoryPercent: latest.memoryPercent,
        swapPercent: latest.swapPercent,
      },
    });
  }

  // 3. Swap Thrashing Activity
  const swapRate = (latest.swapSinBytesPerSec || 0) + (latest.swapSoutBytesPerSec || 0);
  if (latest.swapPercent > 50 && swapRate > config.swapThrashingThresholdBytesSec) {
    const rateMb = Math.round((swapRate / (1024 * 1024)) * 10) / 10;
    detected.push({
      id: `anom-swap-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      machineId: latest.machineId,
      ownerId: latest.ownerId,
      metricName: 'swap_activity',
      severity: 'critical',
      observedValue: rateMb,
      threshold: Math.round(config.swapThrashingThresholdBytesSec / (1024 * 1024)),
      unit: 'MB/s paging',
      explanation: `Kernel paging / swap thrashing detected: active swap I/O rate at ${rateMb} MB/s with swap capacity ${latest.swapPercent}% utilized.`,
      timeWindow,
      status: 'active',
      detectedAt: latest.timestamp,
      createdAt: new Date().toISOString(),
      relatedMetrics: {
        swapPercent: latest.swapPercent,
        memoryAvailableBytes: latest.memoryAvailableBytes,
      },
    });
  }

  // 4. Unusual Disk I/O Saturation or I/O Wait
  const diskTotalRate = (latest.diskReadBytesPerSec || 0) + (latest.diskWriteBytesPerSec || 0);
  const iowait = latest.cpuIowaitPercent ?? null;
  if (
    diskTotalRate > config.diskIoThresholdBytesSec ||
    (iowait !== null && iowait > 20.0)
  ) {
    const diskRateMb = Math.round((diskTotalRate / (1024 * 1024)) * 10) / 10;
    detected.push({
      id: `anom-disk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      machineId: latest.machineId,
      ownerId: latest.ownerId,
      metricName: 'disk_io_saturation',
      severity: iowait !== null && iowait > 40.0 ? 'critical' : 'warning',
      observedValue: diskRateMb,
      threshold: Math.round(config.diskIoThresholdBytesSec / (1024 * 1024)),
      unit: 'MB/s total I/O',
      explanation: `Elevated disk throughput (${diskRateMb} MB/s)${iowait !== null ? ` with ${iowait.toFixed(1)}% CPU iowait stall` : ''}.`,
      timeWindow,
      status: 'active',
      detectedAt: latest.timestamp,
      createdAt: new Date().toISOString(),
      relatedMetrics: {
        diskReadBytesPerSec: latest.diskReadBytesPerSec,
        diskWriteBytesPerSec: latest.diskWriteBytesPerSec,
        cpuIowaitPercent: latest.cpuIowaitPercent ?? null,
      },
    });
  }

  // 5. Linux PSI (Pressure Stall Information) Pressure
  if (latest.psiMemorySome10 !== null && latest.psiMemorySome10 >= config.psiPressureThreshold) {
    detected.push({
      id: `anom-psi-mem-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      machineId: latest.machineId,
      ownerId: latest.ownerId,
      metricName: 'psi_memory_pressure',
      severity: latest.psiMemorySome10 >= 50.0 ? 'critical' : 'warning',
      observedValue: Math.round(latest.psiMemorySome10 * 10) / 10,
      threshold: config.psiPressureThreshold,
      unit: '% stalled (10s)',
      explanation: `Linux PSI kernel pressure: tasks delayed ${latest.psiMemorySome10.toFixed(1)}% of execution time waiting for memory allocation.`,
      timeWindow,
      status: 'active',
      detectedAt: latest.timestamp,
      createdAt: new Date().toISOString(),
      relatedMetrics: {
        psiMemorySome10: latest.psiMemorySome10,
        memoryAvailableBytes: latest.memoryAvailableBytes,
      },
    });
  }

  if (latest.psiCpuSome10 !== null && latest.psiCpuSome10 >= config.psiPressureThreshold) {
    detected.push({
      id: `anom-psi-cpu-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      machineId: latest.machineId,
      ownerId: latest.ownerId,
      metricName: 'psi_cpu_pressure',
      severity: latest.psiCpuSome10 >= 50.0 ? 'critical' : 'warning',
      observedValue: Math.round(latest.psiCpuSome10 * 10) / 10,
      threshold: config.psiPressureThreshold,
      unit: '% stalled (10s)',
      explanation: `Linux PSI CPU scheduling pressure: runnable tasks delayed ${latest.psiCpuSome10.toFixed(1)}% of time waiting for CPU slice.`,
      timeWindow,
      status: 'active',
      detectedAt: latest.timestamp,
      createdAt: new Date().toISOString(),
    });
  }

  // 6. Application HTTP Latency Spike
  if (
    latest.httpLatencyMs !== null &&
    latest.httpLatencyMs >= config.latencyHighThresholdMs
  ) {
    const severity: AnomalySeverity =
      latest.httpLatencyMs >= config.latencyHighThresholdMs * 2.5 ? 'critical' : 'warning';
    detected.push({
      id: `anom-lat-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      machineId: latest.machineId,
      ownerId: latest.ownerId,
      metricName: 'http_latency',
      severity,
      observedValue: Math.round(latest.httpLatencyMs),
      threshold: config.latencyHighThresholdMs,
      unit: 'ms',
      explanation: `Monitored application endpoint latency degraded to ${Math.round(latest.httpLatencyMs)} ms (threshold: ${config.latencyHighThresholdMs} ms).`,
      timeWindow,
      status: 'active',
      detectedAt: latest.timestamp,
      createdAt: new Date().toISOString(),
      relatedMetrics: {
        httpStatusCode: latest.httpStatusCode,
        cpuPercent: latest.cpuPercent,
      },
    });
  }

  return detected;
}

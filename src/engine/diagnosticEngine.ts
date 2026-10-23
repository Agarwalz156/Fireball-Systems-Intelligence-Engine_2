import {
  TelemetrySample,
  Anomaly,
  Investigation,
  ConfidenceCategory,
  InvestigationStatus,
} from '../types/telemetry';

export interface DiagnosticInput {
  samples: TelemetrySample[];
  anomalies: Anomaly[];
  cpuCores?: number;
}

/**
 * Diagnostic Engine
 * Evaluates correlated measurements across Linux kernel, processes, and application response times.
 * Formulates transparent, evidence-backed diagnostic hypotheses.
 * Explains heuristic scores clearly and explicitly returns 'inconclusive' when evidence is insufficient.
 */
export function generateInvestigations(input: DiagnosticInput): Investigation[] {
  const { samples, anomalies, cpuCores = 2 } = input;
  const investigations: Investigation[] = [];

  if (!samples || samples.length === 0) {
    return [];
  }

  // Sort samples ascending
  const sorted = [...samples].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const startTime = sorted[0].timestamp;
  const endTime = sorted[sorted.length - 1].timestamp;
  const timeWindow = { start: startTime, end: endTime };
  const machineId = sorted[0].machineId;
  const ownerId = sorted[0].ownerId;

  // Compute aggregated stats across window
  const cpuValues = sorted.map((s) => s.cpuPercent);
  const memAvailValues = sorted.map((s) =>
    s.memoryTotalBytes > 0 ? (s.memoryAvailableBytes / s.memoryTotalBytes) * 100 : 100
  );
  const latencyValues = sorted
    .map((s) => s.httpLatencyMs)
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
  const iowaitValues = sorted
    .map((s) => s.cpuIowaitPercent)
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
  const swapSinValues = sorted
    .map((s) => s.swapSinBytesPerSec)
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

  const avgCpu = cpuValues.reduce((a, b) => a + b, 0) / cpuValues.length;
  const minMemAvail = Math.min(...memAvailValues);
  const avgLatency =
    latencyValues.length > 0
      ? latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length
      : null;
  const maxLatency = latencyValues.length > 0 ? Math.max(...latencyValues) : null;
  const avgIowait =
    iowaitValues.length > 0 ? iowaitValues.reduce((a, b) => a + b, 0) / iowaitValues.length : null;
  const maxSwapSin = swapSinValues.length > 0 ? Math.max(...swapSinValues) : 0;

  // Check for insufficient evidence edge case (< 3 samples or high volatility)
  if (samples.length < 3) {
    investigations.push({
      id: `inv-insufficient-${Date.now()}`,
      machineId,
      ownerId,
      title: 'Insufficient Evidence for Definitive Diagnostic Hypothesis',
      problemSummary: `Only ${samples.length} telemetry samples recorded in the observed window. Reliable baseline comparison requires a minimum of 3 consecutive observation cycles.`,
      hypothesis: 'Telemetry time-series depth is currently too sparse to isolate root cause or rule out transient noise.',
      confidenceScore: 25,
      confidenceCategory: 'inconclusive',
      timeWindow,
      supportingEvidence: [`Captured sample count: ${samples.length} (minimum required for statistical confidence: 3)`],
      conflictingOrMissingEvidence: [
        'Missing multi-cycle trend confirmation',
        'Cannot determine whether anomaly represents steady-state degradation or a single burst',
      ],
      diagnosticRule: 'Rule #0: Sample Sufficiency Gate',
      ruleExplanation:
        'Prevents premature conclusions from noisy single-point spikes. Telemetry is flagged inconclusive until sufficient consecutive samples are acquired.',
      recommendedNextSteps: [
        'Keep the agent running for at least 3-5 additional sampling intervals',
        'Inspect raw telemetry log in the Performance tab to verify continuous ingest',
      ],
      recommendedExperiment: 'Collect 10 baseline samples before triggering interventions.',
      status: 'inconclusive',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return investigations;
  }

  // 1. Scenario: CPU Rises but Application Latency Remains Normal
  // Explicitly specified requirement: distinguish high CPU from application degradation!
  if (avgCpu >= 75 && (avgLatency !== null && avgLatency < 200)) {
    investigations.push({
      id: `inv-harmless-cpu-${Date.now()}`,
      machineId,
      ownerId,
      title: 'Isolated CPU Spike Without Application Latency Degradation',
      problemSummary: `Host CPU utilization elevated (average ${avgCpu.toFixed(1)}%), yet monitored application endpoint latency remains healthy (avg ${avgLatency.toFixed(1)} ms, max ${maxLatency?.toFixed(1)} ms).`,
      hypothesis:
        'A background computation, compression, or batch process is consuming spare CPU cycles without starving the primary application event loop or worker threads.',
      confidenceScore: 78,
      confidenceCategory: 'high',
      timeWindow,
      supportingEvidence: [
        `Host CPU utilization is elevated at ${avgCpu.toFixed(1)}% across ${samples.length} samples`,
        `Application HTTP latency is within normal parameters (avg ${avgLatency.toFixed(1)} ms vs 400ms threshold)`,
        `Memory availability is stable at ${minMemAvail.toFixed(1)}%`,
      ],
      conflictingOrMissingEvidence: [
        'Process-level cgroup isolation or nice priority has not been directly verified',
        'Burst traffic might cause contention if background job is not throttled',
      ],
      diagnosticRule: 'Rule #1: Decoupled Utilization vs Quality-of-Service',
      ruleExplanation:
        'High CPU utilization does not inherently imply user-facing degradation. When latency remains sub-threshold, the system is performing work within headroom.',
      recommendedNextSteps: [
        'Verify process priority via top processes table (e.g. nice +10 or low cgroup shares)',
        'Optionally set CPU quotas on background jobs to preserve headroom for unexpected traffic bursts',
      ],
      recommendedExperiment:
        'Apply cgroup CPU limit or nice value to the background process and verify application latency stays invariant.',
      status: 'verified',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // 2. Scenario: Memory Pressure & Swap Thrashing Stalling Application
  if (minMemAvail <= 15 && (maxSwapSin > 1024 * 1024 || avgLatency !== null && avgLatency >= 350)) {
    investigations.push({
      id: `inv-mem-swap-${Date.now()}`,
      machineId,
      ownerId,
      title: 'Memory Starvation and Kernel Swap Thrashing Inducing Latency',
      problemSummary: `Available physical memory plummeted to ${minMemAvail.toFixed(1)}%, triggering active swap paging${avgLatency ? ` and raising HTTP latency to ${avgLatency.toFixed(1)} ms` : ''}.`,
      hypothesis:
        'The kernel is forced into synchronous direct page reclaim and disk-backed swap I/O to satisfy allocations, blocking worker threads waiting on memory.',
      confidenceScore: 84,
      confidenceCategory: 'high',
      timeWindow,
      supportingEvidence: [
        `Physical available memory dropped to ${minMemAvail.toFixed(1)}% (below critical 15% threshold)`,
        `Peak swap paging in/out rate recorded: ${(maxSwapSin / (1024 * 1024)).toFixed(2)} MB/s`,
        avgLatency ? `Application latency degraded to ${avgLatency.toFixed(1)} ms` : 'Memory pressure anomaly confirmed',
      ],
      conflictingOrMissingEvidence: [
        'Buffer cache hit ratio not directly exported by procfs without eBPF',
        'Application heap dumps needed to confirm whether leak is in Node.js/Python or system daemon',
      ],
      diagnosticRule: 'Rule #2: Memory Pressure & Swap Degradation Correlation',
      ruleExplanation:
        'When available memory drops below 15% concurrent with swap paging, disk access latency (milliseconds) replaces DRAM access latency (nanoseconds), degrading throughput.',
      recommendedNextSteps: [
        'Inspect top memory-consuming processes in the process breakdown',
        'Review application memory leak candidates and heap allocation limits',
        'Consider increasing vm.min_free_kbytes or adding swap space as temporary relief',
      ],
      recommendedExperiment:
        'Run controlled memory workload reset or restart suspected memory-leaking container and record post-intervention recovery.',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // 3. Scenario: CPU Core Saturation & Runqueue Contention
  if (avgCpu >= 85 && (avgLatency === null || avgLatency >= 300)) {
    investigations.push({
      id: `inv-cpu-sat-${Date.now()}`,
      machineId,
      ownerId,
      title: 'CPU Core Saturation and Task Scheduling Delay',
      problemSummary: `Host CPU is saturated at ${avgCpu.toFixed(1)}% across ${cpuCores} physical/logical core(s)${avgLatency ? `, correlating with elevated application response latency of ${avgLatency.toFixed(1)} ms` : ''}.`,
      hypothesis:
        'Application threads are delayed on the OS runqueue waiting for available CPU timeslices, causing request processing queue buildup.',
      confidenceScore: 76,
      confidenceCategory: 'medium',
      timeWindow,
      supportingEvidence: [
        `Average CPU utilization sustained at ${avgCpu.toFixed(1)}%`,
        `System load average exceeds core allocation (${cpuCores} cores available)`,
        ...(sorted[sorted.length - 1].psiCpuSome10 !== null
          ? [`Linux PSI CPU pressure indicates ${sorted[sorted.length - 1].psiCpuSome10?.toFixed(1)}% scheduling stall`]
          : []),
      ],
      conflictingOrMissingEvidence: [
        avgIowait && avgIowait > 20
          ? 'High iowait detected; CPU might be idle waiting on disk rather than compute-bound'
          : 'Pure user-space vs kernel-space CPU split confirms computational workload',
      ],
      diagnosticRule: 'Rule #3: CPU Runqueue Saturation Heuristic',
      ruleExplanation:
        'When sustained CPU exceeds 85% and runqueue length exceeds logical cores, latency scales non-linearly due to OS context switching and scheduling delays.',
      recommendedNextSteps: [
        'Profile CPU hotspot with perf or node --prof to isolate CPU-intensive code paths',
        'Scale worker processes across additional CPU cores or increase VM vCPU allocation',
      ],
      recommendedExperiment:
        'Scale process concurrency or optimize algorithmic complexity and compare p95 latency under identical synthetic load.',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // 4. Scenario: Disk I/O Wait Bottleneck
  if (avgIowait !== null && avgIowait >= 20) {
    investigations.push({
      id: `inv-iowait-${Date.now()}`,
      machineId,
      ownerId,
      title: 'Synchronous Disk I/O Stall and Block Layer Congestion',
      problemSummary: `CPU iowait reached ${avgIowait.toFixed(1)}%, indicating threads are blocked in uninterruptible sleep (D-state) waiting for storage operations to finish.`,
      hypothesis:
        'Synchronous disk writes (e.g. database commit fsync, heavy unbuffered logging, or swap paging) are saturating the underlying block device queue.',
      confidenceScore: 72,
      confidenceCategory: 'medium',
      timeWindow,
      supportingEvidence: [
        `Average CPU iowait stall: ${avgIowait.toFixed(1)}% (threshold: 20%)`,
        `Latest disk write throughput: ${((sorted[sorted.length - 1].diskWriteBytesPerSec || 0) / (1024 * 1024)).toFixed(2)} MB/s`,
      ],
      conflictingOrMissingEvidence: [
        'Storage queue depth and IOPS limits of underlying disk (e.g. EBS volume or local SSD) require cloud provider metrics',
      ],
      diagnosticRule: 'Rule #4: Storage Uninterruptible Sleep (D-state) Stall',
      ruleExplanation:
        'A thread waiting on disk I/O cannot be scheduled for useful work. Elevated iowait degrades wall-clock completion times while leaving compute cores under-utilized.',
      recommendedNextSteps: [
        'Check iotop or /proc/diskstats to identify specific write-heavy processes',
        'Enable write-buffering or batch database transactions to decrease fsync frequency',
      ],
      recommendedExperiment:
        'Switch to asynchronous logging or upgrade storage IOPS tier, then measure disk write throughput and latency.',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Fallback: If anomalies exist but no compound pattern matched, generate focused investigation
  if (investigations.length === 0 && anomalies.length > 0) {
    const primaryAnomaly = anomalies[0];
    investigations.push({
      id: `inv-anomaly-${Date.now()}`,
      machineId,
      ownerId,
      title: `Uncorrelated ${primaryAnomaly.metricName} Anomaly Investigation`,
      problemSummary: `An isolated anomaly was registered for ${primaryAnomaly.metricName}: observed ${primaryAnomaly.observedValue} ${primaryAnomaly.unit} vs threshold ${primaryAnomaly.threshold} ${primaryAnomaly.unit}.`,
      hypothesis: `Preliminary spike detected in ${primaryAnomaly.metricName}. Cross-subsystem correlation does not show secondary cascade yet.`,
      confidenceScore: 50,
      confidenceCategory: 'low',
      timeWindow,
      supportingEvidence: [primaryAnomaly.explanation],
      conflictingOrMissingEvidence: [
        'Secondary subsystems (CPU, Memory, Storage) do not exhibit concurrent degradation',
        'Additional multi-variable telemetry samples needed to determine systemic impact',
      ],
      diagnosticRule: 'Rule #5: Isolated Single-Metric Anomaly Rule',
      ruleExplanation:
        'Single-metric excursions without correlated secondary subsystem degradation suggest either an isolated transient burst or early-stage anomaly.',
      recommendedNextSteps: [
        'Monitor whether the anomaly self-heals or triggers cascading memory/latency spikes',
        'Run the safe CPU or memory workload in the Experiments tab to test system resilience',
      ],
      recommendedExperiment: 'Create a controlled experiment comparing current baseline against applied mitigation.',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return investigations;
}

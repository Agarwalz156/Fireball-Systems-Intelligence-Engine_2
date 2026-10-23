export interface ProcessMetric {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryPercent: number;
  rssBytes: number;
  readBytes?: number;
  writeBytes?: number;
  user?: string;
}

export interface PsiPressure {
  some10?: number | null;
  some60?: number | null;
  some300?: number | null;
  full10?: number | null;
  full60?: number | null;
  full300?: number | null;
}

export interface HttpProbeResult {
  endpointUrl: string;
  durationMs: number | null;
  statusCode: number | null;
  timedOut: boolean;
  error?: string | null;
  timestamp: string;
}

export interface TelemetrySample {
  id: string;
  machineId: string;
  ownerId: string;
  timestamp: string; // ISO string
  intervalSeconds: number;

  // CPU
  cpuPercent: number;
  cpuUserPercent?: number | null;
  cpuSystemPercent?: number | null;
  cpuIowaitPercent?: number | null;
  cpuStealPercent?: number | null;

  // System Load
  load1m?: number | null;
  load5m?: number | null;
  load15m?: number | null;

  // Physical Memory
  memoryPercent: number;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  memoryAvailableBytes: number;
  memoryFreeBytes?: number | null;
  memoryCachedBytes?: number | null;
  memoryBuffersBytes?: number | null;

  // Swap
  swapPercent: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
  swapFreeBytes?: number | null;
  swapSinBytesPerSec?: number | null;
  swapSoutBytesPerSec?: number | null;

  // Disk I/O (rates in bytes/sec computed over sampling interval)
  diskReadBytesPerSec: number | null;
  diskWriteBytesPerSec: number | null;
  diskReadIops?: number | null;
  diskWriteIops?: number | null;

  // Network I/O (rates in bytes/sec)
  networkRxBytesPerSec: number | null;
  networkTxBytesPerSec: number | null;
  networkErrorsPerSec?: number | null;

  // Linux PSI (Pressure Stall Information) - null if unsupported (e.g. non-PSI kernel or container)
  psiCpuSome10: number | null;
  psiMemorySome10: number | null;
  psiIoSome10: number | null;
  psiMemoryFull10?: number | null;

  // HTTP Endpoint probing
  httpLatencyMs: number | null;
  httpStatusCode: number | null;
  httpError?: string | null;

  // Top resource hogs
  topProcesses?: ProcessMetric[];

  createdAt: string;
}

export type MachineStatus = 'online' | 'degraded' | 'offline';

export interface Machine {
  id: string;
  ownerId: string;
  hostname: string;
  os: string;
  kernel: string;
  arch: string;
  cpuCores: number;
  totalMemoryBytes: number;
  agentVersion: string;
  enrollmentToken: string;
  lastHeartbeatAt: string;
  status: MachineStatus;
  capabilities: {
    hasPsi: boolean;
    hasSwap: boolean;
    hasDiskStats: boolean;
    hasNetworkStats: boolean;
    hasProcessStats: boolean;
    isWsl: boolean;
    isContainer: boolean;
  };
  alertRules?: AlertRulesConfig;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDestination {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  minSeverity: 'warning' | 'critical';
  secretHeader?: string;
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failed';
}

export interface AlertDestinationsConfig {
  emails: string[];
  webhooks: WebhookDestination[];
}

export interface AlertRulesConfig {
  cpuWarningPercent: number;
  cpuCriticalPercent: number;
  cpuSustainedCycles: number;
  memoryWarningPercent: number;
  memoryCriticalPercent: number;
  diskIoThresholdMBs?: number;
  latencyThresholdMs?: number;
  notifyInApp: boolean;
  notifyBrowser: boolean;
  destinations?: AlertDestinationsConfig;
}

export const DEFAULT_ALERT_RULES: AlertRulesConfig = {
  cpuWarningPercent: 75,
  cpuCriticalPercent: 90,
  cpuSustainedCycles: 3,
  memoryWarningPercent: 80,
  memoryCriticalPercent: 90,
  diskIoThresholdMBs: 60,
  latencyThresholdMs: 400,
  notifyInApp: true,
  notifyBrowser: false,
  destinations: {
    emails: [],
    webhooks: [],
  },
};

export type AnomalySeverity = 'critical' | 'warning' | 'info';
export type AnomalyStatus = 'active' | 'resolved' | 'acknowledged';

export interface Anomaly {
  id: string;
  machineId: string;
  ownerId: string;
  metricName: string;
  severity: AnomalySeverity;
  observedValue: number;
  threshold: number;
  unit: string;
  explanation: string;
  timeWindow: string;
  status: AnomalyStatus;
  detectedAt: string;
  createdAt: string;
  relatedMetrics?: Record<string, number | null>;
}

export type ConfidenceCategory = 'high' | 'medium' | 'low' | 'inconclusive';
export type InvestigationStatus = 'open' | 'investigating' | 'verified' | 'inconclusive';

export interface Investigation {
  id: string;
  machineId: string;
  ownerId: string;
  title: string;
  problemSummary: string;
  hypothesis: string;
  confidenceScore: number; // 0-100 heuristic
  confidenceCategory: ConfidenceCategory;
  timeWindow: {
    start: string;
    end: string;
  };
  supportingEvidence: string[];
  conflictingOrMissingEvidence: string[];
  diagnosticRule: string;
  ruleExplanation: string;
  recommendedNextSteps: string[];
  recommendedExperiment?: string;
  status: InvestigationStatus;
  createdAt: string;
  updatedAt: string;
}

export type ExperimentOutcome = 'supported' | 'refuted' | 'inconclusive';

export interface MetricSummary {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  p95: number | null;
  p99: number | null;
  unit: string;
}

export interface ExperimentDelta {
  metricName: string;
  baseline: MetricSummary;
  postIntervention: MetricSummary;
  absoluteChange: number | null;
  percentageChange: number | null;
  isImprovement: boolean | null;
  hasSufficientSamples: boolean;
}

export interface Experiment {
  id: string;
  machineId: string;
  ownerId: string;
  title: string;
  description: string;
  hypothesis: string;
  intervention: string;
  baselineStartTime: string;
  baselineEndTime: string;
  postStartTime: string;
  postEndTime: string;
  baselineSampleCount: number;
  postSampleCount: number;
  minimumRequiredSamples: number;
  isStatisticallyComparable: boolean;
  incomparableReason?: string;
  deltas: ExperimentDelta[];
  outcome: ExperimentOutcome;
  evaluationNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface IngestPayload {
  machineId: string;
  enrollmentToken: string;
  sample: Omit<TelemetrySample, 'id' | 'ownerId' | 'createdAt'>;
  machineMetadata?: Partial<Machine>;
}

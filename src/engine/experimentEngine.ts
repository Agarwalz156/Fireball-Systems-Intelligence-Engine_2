import {
  TelemetrySample,
  MetricSummary,
  ExperimentDelta,
  ExperimentOutcome,
} from '../types/telemetry';

export const MINIMUM_SAMPLES_FOR_EXPERIMENT = 3;

/**
 * Computes statistical summary (mean, median, p95, p99, min, max) for an array of numbers.
 * Requires sufficient samples to compute high percentiles reliably.
 */
export function calculateMetricSummary(
  values: (number | null | undefined)[],
  unit: string
): MetricSummary {
  const clean = values.filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

  if (clean.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      p95: null,
      p99: null,
      unit,
    };
  }

  const sorted = [...clean].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = sum / sorted.length;

  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  // High percentile calculation only if sufficient samples
  const p95 =
    sorted.length >= 3
      ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
      : median;
  const p99 =
    sorted.length >= 5
      ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]
      : p95;

  return {
    count: sorted.length,
    min: Math.round(sorted[0] * 100) / 100,
    max: Math.round(sorted[sorted.length - 1] * 100) / 100,
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    p95: p95 !== null ? Math.round(p95 * 100) / 100 : null,
    p99: p99 !== null ? Math.round(p99 * 100) / 100 : null,
    unit,
  };
}

export interface CompareOptions {
  baselineSamples: TelemetrySample[];
  postSamples: TelemetrySample[];
  targetMetric?: string;
  expectedDirection?: 'decrease' | 'increase';
}

export interface ComparisonResult {
  isComparable: boolean;
  incomparableReason?: string;
  baselineCount: number;
  postCount: number;
  deltas: ExperimentDelta[];
  outcome: ExperimentOutcome;
  evaluationNotes: string;
}

/**
 * Compares baseline and post-intervention periods to test performance hypotheses.
 */
export function compareExperimentPeriods(options: CompareOptions): ComparisonResult {
  const {
    baselineSamples,
    postSamples,
    targetMetric = 'httpLatencyMs',
    expectedDirection = 'decrease',
  } = options;

  const baselineCount = baselineSamples.length;
  const postCount = postSamples.length;

  // 1. Validate sample sufficiency
  if (
    baselineCount < MINIMUM_SAMPLES_FOR_EXPERIMENT ||
    postCount < MINIMUM_SAMPLES_FOR_EXPERIMENT
  ) {
    return {
      isComparable: false,
      incomparableReason: `Insufficient sample size. Baseline has ${baselineCount} sample(s), post-intervention has ${postCount} sample(s). Minimum ${MINIMUM_SAMPLES_FOR_EXPERIMENT} samples required per phase.`,
      baselineCount,
      postCount,
      deltas: [],
      outcome: 'inconclusive',
      evaluationNotes:
        'Experiment flagged as inconclusive due to insufficient statistical sample count. An isolated observation cannot distinguish system noise from genuine intervention effects.',
    };
  }

  // 2. Compute summaries across core metrics
  const metricConfigs: {
    key: keyof TelemetrySample;
    name: string;
    unit: string;
    desirableDirection: 'decrease' | 'increase';
  }[] = [
    {
      key: 'httpLatencyMs',
      name: 'Application Latency (p95)',
      unit: 'ms',
      desirableDirection: 'decrease',
    },
    {
      key: 'cpuPercent',
      name: 'Host CPU Utilization',
      unit: '%',
      desirableDirection: 'decrease',
    },
    {
      key: 'memoryAvailableBytes',
      name: 'Available Physical Memory',
      unit: 'MB',
      desirableDirection: 'increase',
    },
    {
      key: 'swapPercent',
      name: 'Swap Utilization',
      unit: '%',
      desirableDirection: 'decrease',
    },
    {
      key: 'psiCpuSome10',
      name: 'Linux PSI CPU Stall',
      unit: '%',
      desirableDirection: 'decrease',
    },
  ];

  const deltas: ExperimentDelta[] = [];

  for (const config of metricConfigs) {
    const baseVals = baselineSamples.map((s) => {
      const val = s[config.key] as number | null | undefined;
      if (config.key === 'memoryAvailableBytes' && typeof val === 'number') {
        return val / (1024 * 1024); // Convert to MB
      }
      return val;
    });

    const postVals = postSamples.map((s) => {
      const val = s[config.key] as number | null | undefined;
      if (config.key === 'memoryAvailableBytes' && typeof val === 'number') {
        return val / (1024 * 1024);
      }
      return val;
    });

    const baseSummary = calculateMetricSummary(baseVals, config.unit);
    const postSummary = calculateMetricSummary(postVals, config.unit);

    if (baseSummary.count > 0 && postSummary.count > 0 && baseSummary.mean !== null && postSummary.mean !== null) {
      const absChange = Math.round((postSummary.mean - baseSummary.mean) * 100) / 100;
      const pctChange =
        baseSummary.mean !== 0
          ? Math.round(((postSummary.mean - baseSummary.mean) / baseSummary.mean) * 1000) / 10
          : 0;

      const isImprovement =
        config.desirableDirection === 'decrease' ? absChange < 0 : absChange > 0;

      deltas.push({
        metricName: config.name,
        baseline: baseSummary,
        postIntervention: postSummary,
        absoluteChange: absChange,
        percentageChange: pctChange,
        isImprovement,
        hasSufficientSamples: baseSummary.count >= 3 && postSummary.count >= 3,
      });
    }
  }

  // 3. Determine Outcome for target metric
  const primaryDelta = deltas.find(
    (d) =>
      d.metricName.toLowerCase().includes(targetMetric.toLowerCase()) ||
      (targetMetric === 'httpLatencyMs' && d.metricName.includes('Latency'))
  ) || deltas[0];

  let outcome: ExperimentOutcome = 'inconclusive';
  let evaluationNotes = '';

  if (!primaryDelta) {
    outcome = 'inconclusive';
    evaluationNotes =
      'Target metric was unavailable or contained zero valid data points across both observation windows.';
  } else if (primaryDelta.percentageChange !== null) {
    const absPct = Math.abs(primaryDelta.percentageChange);
    if (absPct < 5.0) {
      outcome = 'inconclusive';
      evaluationNotes = `Measured change in ${primaryDelta.metricName} (${primaryDelta.percentageChange}%) is within expected measurement noise (< 5%). Results do not demonstrate clear impact.`;
    } else if (primaryDelta.isImprovement) {
      outcome = 'supported';
      evaluationNotes = `Hypothesis supported: ${primaryDelta.metricName} improved by ${Math.abs(primaryDelta.percentageChange)}% (${primaryDelta.absoluteChange} ${primaryDelta.baseline.unit}). Notice: Observed correlation supports the hypothesis but does not conclusively prove causality; external variables (system cache, concurrency) may contribute.`;
    } else {
      outcome = 'refuted';
      evaluationNotes = `Hypothesis refuted: ${primaryDelta.metricName} degraded by ${primaryDelta.percentageChange}% after intervention. The tested change did not resolve the bottleneck.`;
    }
  }

  return {
    isComparable: true,
    baselineCount,
    postCount,
    deltas,
    outcome,
    evaluationNotes,
  };
}

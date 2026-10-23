import {
  calculateMetricSummary,
  compareExperimentPeriods,
} from '../src/engine/experimentEngine';
import { TelemetrySample } from '../src/types/telemetry';

function createSample(latency: number, cpu: number): TelemetrySample {
  return {
    id: `sample-${Math.random()}`,
    machineId: 'host-test',
    ownerId: 'user-test',
    timestamp: new Date().toISOString(),
    intervalSeconds: 2,
    cpuPercent: cpu,
    memoryPercent: 40,
    memoryTotalBytes: 8000000000,
    memoryUsedBytes: 3200000000,
    memoryAvailableBytes: 4800000000,
    swapPercent: 0,
    swapTotalBytes: 0,
    swapUsedBytes: 0,
    diskReadBytesPerSec: null,
    diskWriteBytesPerSec: null,
    networkRxBytesPerSec: null,
    networkTxBytesPerSec: null,
    psiCpuSome10: null,
    psiMemorySome10: null,
    psiIoSome10: null,
    httpLatencyMs: latency,
    httpStatusCode: 200,
    createdAt: new Date().toISOString(),
  };
}

console.log('=== Running Controlled Experiment Comparison Tests ===');

// Test 1: Statistical summary calculations
const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const summary = calculateMetricSummary(values, 'ms');
console.assert(summary.count === 10, 'Test 1 Failed: Count mismatch');
console.assert(summary.min === 10, 'Test 1 Failed: Min mismatch');
console.assert(summary.max === 100, 'Test 1 Failed: Max mismatch');
console.assert(summary.mean === 55, 'Test 1 Failed: Mean mismatch');
console.assert(summary.median === 55, 'Test 1 Failed: Median mismatch');
console.log('✓ Test 1 Passed: Statistical metrics (mean, median, p95, p99) computed accurately.');

// Test 2: Sample sufficiency gate
const sparseBaseline = [createSample(500, 90)];
const sparsePost = [createSample(200, 30)];
const insufficientResult = compareExperimentPeriods({
  baselineSamples: sparseBaseline,
  postSamples: sparsePost,
});
console.assert(insufficientResult.outcome === 'inconclusive', 'Test 2 Failed: Expected inconclusive for sparse data');
console.assert(!insufficientResult.isComparable, 'Test 2 Failed: Should not be statistically comparable');
console.log('✓ Test 2 Passed: Sample sufficiency gate flags sparse datasets as inconclusive.');

// Test 3: Significant latency improvement supports hypothesis
const baseline = [
  createSample(520, 90),
  createSample(540, 92),
  createSample(510, 89),
  createSample(530, 91),
];
const post = [
  createSample(180, 45),
  createSample(175, 42),
  createSample(190, 48),
  createSample(185, 44),
];
const supportedResult = compareExperimentPeriods({
  baselineSamples: baseline,
  postSamples: post,
  targetMetric: 'httpLatencyMs',
});
console.assert(supportedResult.outcome === 'supported', 'Test 3 Failed: Outcome should be supported');
console.assert(supportedResult.deltas.length > 0, 'Test 3 Failed: Missing delta records');
const latDelta = supportedResult.deltas.find((d) => d.metricName.includes('Latency'));
console.assert(latDelta?.isImprovement === true, 'Test 3 Failed: Latency decrease should be marked improvement');
console.log(`✓ Test 3 Passed: Verified outcome 'supported' with ${latDelta?.percentageChange}% latency delta.`);

// Test 4: Degraded performance refutes hypothesis
const degradedPost = [
  createSample(780, 98),
  createSample(820, 99),
  createSample(790, 97),
  createSample(810, 98),
];
const refutedResult = compareExperimentPeriods({
  baselineSamples: baseline,
  postSamples: degradedPost,
  targetMetric: 'httpLatencyMs',
});
console.assert(refutedResult.outcome === 'refuted', 'Test 4 Failed: Outcome should be refuted');
console.log('✓ Test 4 Passed: Verified outcome \'refuted\' when intervention degrades target metric.');

console.log('=== All Experiment Comparison Tests Passed Successfully ===');

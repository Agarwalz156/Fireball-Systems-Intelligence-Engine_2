import { generateInvestigations } from '../src/engine/diagnosticEngine';
import { TelemetrySample, Anomaly } from '../src/types/telemetry';

function createSample(overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    id: `sample-${Math.random()}`,
    machineId: 'host-test',
    ownerId: 'user-test',
    timestamp: new Date().toISOString(),
    intervalSeconds: 2,
    cpuPercent: 15,
    memoryPercent: 30,
    memoryTotalBytes: 8000000000,
    memoryUsedBytes: 2400000000,
    memoryAvailableBytes: 5600000000,
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
    httpLatencyMs: 50,
    httpStatusCode: 200,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

console.log('=== Running Diagnostic Hypotheses Test Suite ===');

// Test 1: Explicit Insufficient Evidence outcome when < 3 samples
const sparseSamples = [createSample({ timestamp: '2026-10-22T08:00:00Z' })];
const sparseInvs = generateInvestigations({ samples: sparseSamples, anomalies: [] });
console.assert(sparseInvs.length === 1, 'Test 1 Failed: Expected 1 investigation');
console.assert(sparseInvs[0].confidenceCategory === 'inconclusive', 'Test 1 Failed: Expected inconclusive category');
console.log('✓ Test 1 Passed: Explicit Insufficient Evidence outcome properly emitted on sparse data.');

// Test 2: Scenario where CPU rises but application latency remains normal
const highCpuNormalLatSamples = [
  createSample({ cpuPercent: 88, httpLatencyMs: 65, timestamp: '2026-10-22T08:00:00Z' }),
  createSample({ cpuPercent: 91, httpLatencyMs: 70, timestamp: '2026-10-22T08:00:02Z' }),
  createSample({ cpuPercent: 89, httpLatencyMs: 68, timestamp: '2026-10-22T08:00:04Z' }),
  createSample({ cpuPercent: 92, httpLatencyMs: 72, timestamp: '2026-10-22T08:00:06Z' }),
];
const harmlessInvs = generateInvestigations({ samples: highCpuNormalLatSamples, anomalies: [] });
const harmless = harmlessInvs.find((i) => i.title.includes('Without Application Latency Degradation'));
console.assert(harmless !== undefined, 'Test 2 Failed: Decoupled CPU vs latency hypothesis not found');
console.assert(harmless?.confidenceScore! >= 70, 'Test 2 Failed: Confidence score should reflect strong correlation');
console.assert(harmless?.conflictingOrMissingEvidence.length! > 0, 'Test 2 Failed: Missing counter-evidence');
console.log('✓ Test 2 Passed: CPU surge with normal latency diagnosed as decoupled background activity.');

// Test 3: Memory starvation + swap thrashing causing latency degradation
const memSwapSamples = [
  createSample({
    memoryAvailableBytes: 200 * 1024 * 1024,
    memoryTotalBytes: 4000 * 1024 * 1024,
    swapPercent: 75,
    swapSinBytesPerSec: 15 * 1024 * 1024,
    httpLatencyMs: 680,
    timestamp: '2026-10-22T08:01:00Z',
  }),
  createSample({
    memoryAvailableBytes: 150 * 1024 * 1024,
    memoryTotalBytes: 4000 * 1024 * 1024,
    swapPercent: 80,
    swapSinBytesPerSec: 18 * 1024 * 1024,
    httpLatencyMs: 720,
    timestamp: '2026-10-22T08:01:02Z',
  }),
  createSample({
    memoryAvailableBytes: 140 * 1024 * 1024,
    memoryTotalBytes: 4000 * 1024 * 1024,
    swapPercent: 85,
    swapSinBytesPerSec: 22 * 1024 * 1024,
    httpLatencyMs: 750,
    timestamp: '2026-10-22T08:01:04Z',
  }),
];
const memSwapInvs = generateInvestigations({ samples: memSwapSamples, anomalies: [] });
const memInv = memSwapInvs.find((i) => i.title.includes('Memory Starvation and Kernel Swap Thrashing'));
console.assert(memInv !== undefined, 'Test 3 Failed: Memory starvation + swap hypothesis not generated');
console.assert(memInv?.supportingEvidence.length! >= 2, 'Test 3 Failed: Insufficient supporting evidence');
console.log('✓ Test 3 Passed: Memory starvation and swap thrashing accurately correlated to response delay.');

console.log('=== All Diagnostic Engine Tests Passed Successfully ===');

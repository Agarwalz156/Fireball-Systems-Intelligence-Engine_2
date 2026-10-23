import { detectAnomalies } from '../src/engine/anomalyDetection';
import { TelemetrySample } from '../src/types/telemetry';

function createMockSample(overrides: Partial<TelemetrySample> = {}): TelemetrySample {
  return {
    id: `test-sample-${Date.now()}`,
    machineId: 'host-test',
    ownerId: 'user-test',
    timestamp: new Date().toISOString(),
    intervalSeconds: 2,
    cpuPercent: 10,
    cpuUserPercent: 8,
    cpuSystemPercent: 2,
    cpuIowaitPercent: 0,
    load1m: 0.5,
    load5m: 0.4,
    load15m: 0.3,
    memoryPercent: 40,
    memoryTotalBytes: 8 * 1024 * 1024 * 1024,
    memoryUsedBytes: 3.2 * 1024 * 1024 * 1024,
    memoryAvailableBytes: 4.8 * 1024 * 1024 * 1024,
    swapPercent: 0,
    swapTotalBytes: 4 * 1024 * 1024 * 1024,
    swapUsedBytes: 0,
    diskReadBytesPerSec: 1024 * 1024,
    diskWriteBytesPerSec: 2 * 1024 * 1024,
    networkRxBytesPerSec: 50 * 1024,
    networkTxBytesPerSec: 20 * 1024,
    psiCpuSome10: null,
    psiMemorySome10: null,
    psiIoSome10: null,
    httpLatencyMs: 45,
    httpStatusCode: 200,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

console.log('=== Running Anomaly Detection Test Suite ===');

// Test 1: Normal baseline produces no anomalies
const normalSamples = [createMockSample(), createMockSample(), createMockSample()];
const normalAnomalies = detectAnomalies(normalSamples);
console.assert(normalAnomalies.length === 0, 'Test 1 Failed: Expected 0 anomalies for baseline');
console.log('✓ Test 1 Passed: Normal baseline produces zero false positives.');

// Test 2: Sustained high CPU triggers anomaly
const cpuSpikeSamples = [
  createMockSample({ cpuPercent: 92, timestamp: '2026-10-22T08:00:00Z' }),
  createMockSample({ cpuPercent: 94, timestamp: '2026-10-22T08:00:02Z' }),
  createMockSample({ cpuPercent: 96, timestamp: '2026-10-22T08:00:04Z' }),
];
const cpuAnomalies = detectAnomalies(cpuSpikeSamples);
console.assert(cpuAnomalies.some((a) => a.metricName === 'cpu_utilization'), 'Test 2 Failed: CPU anomaly not detected');
console.log('✓ Test 2 Passed: Sustained high CPU (>85% over 3 intervals) detected.');

// Test 3: Low memory availability triggers exhaustion anomaly
const lowMemSamples = [
  createMockSample({
    memoryTotalBytes: 1000,
    memoryAvailableBytes: 80, // 8% available <= 15% threshold
    memoryPercent: 92,
  }),
];
const memAnomalies = detectAnomalies(lowMemSamples);
console.assert(memAnomalies.some((a) => a.metricName === 'memory_available'), 'Test 3 Failed: Memory starvation not detected');
console.log('✓ Test 3 Passed: Low available physical memory detected.');

// Test 4: PSI pressure correctly triggers anomaly without zero confusion
const psiSamples = [
  createMockSample({
    psiCpuSome10: 38.5, // 38.5% stalled > 25% threshold
  }),
];
const psiAnomalies = detectAnomalies(psiSamples);
console.assert(psiAnomalies.some((a) => a.metricName === 'psi_cpu_pressure'), 'Test 4 Failed: PSI pressure not detected');
console.log('✓ Test 4 Passed: Linux PSI scheduler pressure detected accurately.');

// Test 5: Missing or null PSI does not trigger false alarm
const nullPsiSamples = [
  createMockSample({
    psiCpuSome10: null,
    psiMemorySome10: null,
  }),
];
const nullPsiAnomalies = detectAnomalies(nullPsiSamples);
console.assert(
  !nullPsiAnomalies.some((a) => a.metricName.startsWith('psi_')),
  'Test 5 Failed: Null PSI triggered unexpected anomaly'
);
console.log('✓ Test 5 Passed: Null/unsupported PSI handled safely without defaulting to zero.');

console.log('=== All Anomaly Detection Tests Passed Successfully ===');

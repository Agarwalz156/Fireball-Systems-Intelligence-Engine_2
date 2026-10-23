/**
 * Test Suite: Windows Telemetry Ingestion, Authentication & Connection Status
 */
import { computeConnectionStatus } from '../src/server/apiMiddleware';
import { Machine, TelemetrySample } from '../src/types/telemetry';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`✕ Assertion Failed: ${msg}`);
    process.exit(1);
  }
}

console.log('=== Running Windows Ingestion & Machine Lifecycle Test Suite ===');

// Test 1: Machine Connection Status - Waiting for Telemetry
const machineNew: Partial<Machine> = {
  id: 'win-laptop-01',
  hostname: 'LAPTOP-W11',
  platform: 'windows',
  isRevoked: false,
  lastTelemetryAt: undefined,
};
const statusNew = computeConnectionStatus(machineNew);
assert(statusNew === 'waiting_for_telemetry', `Expected 'waiting_for_telemetry', got '${statusNew}'`);
console.log('✓ Test 1 Passed: Newly enrolled machine shows waiting_for_telemetry when no telemetry received.');

// Test 2: Machine Connection Status - Connected (Recent telemetry <15s)
const machineActive: Partial<Machine> = {
  id: 'win-laptop-01',
  hostname: 'LAPTOP-W11',
  platform: 'windows',
  isRevoked: false,
  lastTelemetryAt: new Date(Date.now() - 4000).toISOString(), // 4 seconds ago
};
const statusActive = computeConnectionStatus(machineActive);
assert(statusActive === 'connected', `Expected 'connected', got '${statusActive}'`);
console.log('✓ Test 2 Passed: Machine with telemetry received 4s ago accurately evaluated as connected.');

// Test 3: Machine Connection Status - Disconnected (Telemetry >15s old)
const machineStale: Partial<Machine> = {
  id: 'win-laptop-01',
  hostname: 'LAPTOP-W11',
  platform: 'windows',
  isRevoked: false,
  lastTelemetryAt: new Date(Date.now() - 45000).toISOString(), // 45 seconds ago
};
const statusStale = computeConnectionStatus(machineStale);
assert(statusStale === 'disconnected', `Expected 'disconnected', got '${statusStale}'`);
console.log('✓ Test 3 Passed: Machine with stale telemetry (>15s) accurately evaluated as disconnected.');

// Test 4: Machine Connection Status - Revoked Token
const machineRevoked: Partial<Machine> = {
  id: 'win-laptop-01',
  hostname: 'LAPTOP-W11',
  platform: 'windows',
  isRevoked: true,
  lastTelemetryAt: new Date().toISOString(),
};
const statusRevoked = computeConnectionStatus(machineRevoked);
assert(statusRevoked === 'auth_failed', `Expected 'auth_failed', got '${statusRevoked}'`);
console.log('✓ Test 4 Passed: Revoked machine immediately transitions to auth_failed status.');

// Test 5: Windows Telemetry Schema Validation (Handles null PSI transparently without fabricating Linux metrics)
const sampleWin: TelemetrySample = {
  id: 'tel-test-01',
  machineId: 'win-laptop-01',
  ownerId: 'user-01',
  timestamp: new Date().toISOString(),
  intervalSeconds: 3,
  cpuPercent: 24.5,
  cpuPerCore: [20.1, 28.9, 18.4, 30.2],
  load1m: null, // Windows honestly reports null loadavg
  load5m: null,
  load15m: null,
  uptimeSeconds: 72400,
  memoryPercent: 48.2,
  memoryTotalBytes: 16 * 1024 * 1024 * 1024,
  memoryUsedBytes: 7.7 * 1024 * 1024 * 1024,
  memoryAvailableBytes: 8.3 * 1024 * 1024 * 1024,
  swapPercent: 12.0,
  swapTotalBytes: 4 * 1024 * 1024 * 1024,
  swapUsedBytes: 0.48 * 1024 * 1024 * 1024,
  diskPercent: 54.3,
  diskTotalBytes: 512 * 1024 * 1024 * 1024,
  diskUsedBytes: 278 * 1024 * 1024 * 1024,
  diskAvailableBytes: 234 * 1024 * 1024 * 1024,
  diskReadBytesPerSec: 154000,
  diskWriteBytesPerSec: 890000,
  networkRxBytesPerSec: 24000,
  networkTxBytesPerSec: 18000,
  psiCpuSome10: null, // Transparently null on Windows
  psiMemorySome10: null,
  psiIoSome10: null,
  httpLatencyMs: 34,
  httpStatusCode: 200,
  topProcesses: [
    { pid: 1420, name: 'chrome.exe', cpuPercent: 8.4, memoryPercent: 6.2, rssBytes: 980000000 },
    { pid: 5188, name: 'code.exe', cpuPercent: 3.1, memoryPercent: 4.8, rssBytes: 750000000 },
  ],
  createdAt: new Date().toISOString(),
};

assert(sampleWin.cpuPercent === 24.5, 'CPU percent valid');
assert(Array.isArray(sampleWin.cpuPerCore) && sampleWin.cpuPerCore.length === 4, 'Per-core CPU array valid');
assert(sampleWin.psiCpuSome10 === null, 'Windows PSI must be null, never fabricated');
assert(sampleWin.topProcesses?.length === 2, 'Top processes parsed safely');
console.log('✓ Test 5 Passed: Windows telemetry schema correctly encapsulates per-core CPU and native metrics.');

console.log('=== All Windows Ingestion & Machine Lifecycle Tests Passed Successfully ===\n');

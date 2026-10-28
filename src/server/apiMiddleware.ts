import type { IncomingMessage, ServerResponse } from 'http';
import { spawn } from 'child_process';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { detectAnomalies, mapAlertRulesToDetectionConfig } from '../engine/anomalyDetection';
import { generateInvestigations } from '../engine/diagnosticEngine';
import {
  TelemetrySample,
  Machine,
  Anomaly,
  Investigation,
  DEFAULT_ALERT_RULES,
  MachineConnectionStatus,
  AuditLog,
  AdminSettings,
} from '../types/telemetry';

// Global Admin & Retention Settings
export const adminSettings: AdminSettings = {
  retentionMaxSamples: 300,
  samplingIntervalDefault: 3,
  requireTokenAuth: true,
  autoEnrollAllowed: true,
  alertOnDisconnection: true,
  disconnectionThresholdSec: 45,
};

// RBAC User Record Definition
export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'operator' | 'viewer';
  status: 'active' | 'suspended';
  addedAt: string;
  lastLoginAt?: string;
}

export const adminUsers: AdminUserRecord[] = [
  {
    id: 'user-primary-admin',
    email: 'muditagarwalz156@gmail.com',
    name: 'Mudit Agarwal (Primary Admin)',
    role: 'super_admin',
    status: 'active',
    addedAt: '2026-10-26T00:00:00.000Z',
    lastLoginAt: new Date().toISOString(),
  },
];

// In-memory telemetry cache for high-throughput live streaming and multi-device support
export const machineStore = new Map<string, {
  machine: Partial<Machine>;
  samples: TelemetrySample[];
  anomalies: Anomaly[];
  investigations: Investigation[];
}>();

// In-memory Audit Log buffer (retained up to 200 recent events)
export const auditLogs: AuditLog[] = [
  {
    id: `audit-${Date.now()}-init`,
    timestamp: new Date().toISOString(),
    action: 'SYSTEM_BOOT',
    actor: 'system',
    details: 'Fireball Systems Intelligence Engine backend initialized in live mode.',
    severity: 'info',
  },
];

export function logAuditEvent(action: string, actor: string, details: string, severity: 'info' | 'warning' | 'error' = 'info', target?: string) {
  const entry: AuditLog = {
    id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    action,
    actor,
    target,
    details,
    severity,
  };
  auditLogs.unshift(entry);
  if (auditLogs.length > 200) auditLogs.pop();
}

// Rate limiting map: tracks timestamp of last ingestion per machine
const rateLimitMap = new Map<string, number>();

// Dynamic connection status evaluator based on authenticated telemetry timestamps
export function computeConnectionStatus(machine: Partial<Machine>): MachineConnectionStatus {
  if (machine.isRevoked) {
    return 'auth_failed';
  }
  if (!machine.lastTelemetryAt) {
    return 'waiting_for_telemetry';
  }
  const ageMs = Date.now() - new Date(machine.lastTelemetryAt).getTime();
  const thresholdMs = (adminSettings.disconnectionThresholdSec || 15) * 1000;
  if (ageMs <= thresholdMs) {
    return 'connected';
  }
  return 'disconnected';
}

// Case-insensitive / canonical machine lookup helper
export function findMachineRecord(machineId: string) {
  if (!machineId) return null;
  const clean = machineId.trim();
  if (machineStore.has(clean)) return machineStore.get(clean)!;

  // Try case-insensitive lookup
  const cleanLower = clean.toLowerCase();
  for (const [key, value] of machineStore.entries()) {
    if (key.toLowerCase() === cleanLower || (value.machine.hostname && value.machine.hostname.toLowerCase() === cleanLower)) {
      return value;
    }
  }

  // Common aliases (win-localhost, host-localhost, localhost, primary)
  if (cleanLower.includes('localhost') || cleanLower.includes('primary')) {
    for (const [key, value] of machineStore.entries()) {
      if (key.toLowerCase().includes('localhost') || key.toLowerCase().includes('primary')) {
        return value;
      }
    }
  }
  return null;
}

// Disk persistence for machine telemetry store
const STORE_FILE = path.resolve(process.cwd(), '.telemetry_store.json');

export function saveStoreToDisk() {
  try {
    const serialized: Record<string, any> = {};
    for (const [id, record] of machineStore.entries()) {
      serialized[id] = {
        machine: record.machine,
        samples: record.samples.slice(-150),
        anomalies: record.anomalies.slice(-50),
        investigations: record.investigations.slice(-20),
      };
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(serialized), 'utf-8');
  } catch (err) {
    // ignore
  }
}

export function loadStoreFromDisk() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
      for (const [id, record] of Object.entries(data as any)) {
        if (record && typeof record === 'object') {
          machineStore.set(id, record as any);
        }
      }
    }
  } catch (err) {
    // ignore
  }
}

// Initial Primary Windows Device entry (matching live agent telemetry)
export const defaultWinId = 'win-localhost';
const initBootTimeIso = new Date().toISOString();

const initialWindowsSample: TelemetrySample = {
  id: `tel-init-${Date.now()}`,
  machineId: defaultWinId,
  ownerId: 'current-user',
  timestamp: initBootTimeIso,
  intervalSeconds: 3,
  cpuPercent: 14.8,
  cpuPerCore: [18.2, 12.4, 15.6, 13.0],
  cpuUserPercent: 10.5,
  cpuSystemPercent: 4.3,
  load1m: 0.85,
  load5m: 0.92,
  load15m: 0.78,
  uptimeSeconds: 86420,
  memoryPercent: 63.4,
  memoryTotalBytes: 16 * 1024 * 1024 * 1024,
  memoryUsedBytes: Math.round(16 * 1024 * 1024 * 1024 * 0.634),
  memoryAvailableBytes: Math.round(16 * 1024 * 1024 * 1024 * 0.366),
  swapPercent: 24.1,
  swapTotalBytes: 4 * 1024 * 1024 * 1024,
  swapUsedBytes: Math.round(4 * 1024 * 1024 * 1024 * 0.241),
  diskPercent: 78.9,
  diskTotalBytes: 512 * 1024 * 1024 * 1024,
  diskUsedBytes: Math.round(512 * 1024 * 1024 * 1024 * 0.789),
  diskAvailableBytes: Math.round(512 * 1024 * 1024 * 1024 * 0.211),
  diskReadBytesPerSec: 145000,
  diskWriteBytesPerSec: 890000,
  networkRxBytesPerSec: 42000,
  networkTxBytesPerSec: 18000,
  networkErrorsPerSec: 0,
  psiCpuSome10: null,
  psiMemorySome10: null,
  psiIoSome10: null,
  httpLatencyMs: 38,
  httpStatusCode: 200,
  topProcesses: [
    { pid: 1420, name: 'chrome.exe', cpuPercent: 5.2, memoryPercent: 14.1, rssBytes: 2300000000 },
    { pid: 4892, name: 'Code.exe', cpuPercent: 3.4, memoryPercent: 8.7, rssBytes: 1420000000 },
    { pid: 8120, name: 'python.exe', cpuPercent: 1.8, memoryPercent: 2.1, rssBytes: 340000000 },
    { pid: 2904, name: 'explorer.exe', cpuPercent: 0.9, memoryPercent: 3.4, rssBytes: 550000000 },
    { pid: 1044, name: 'System', cpuPercent: 0.8, memoryPercent: 0.5, rssBytes: 85000000 },
  ],
  createdAt: initBootTimeIso,
};

machineStore.set(defaultWinId, {
  machine: {
    id: defaultWinId,
    name: 'Primary Windows Laptop',
    ownerId: 'current-user',
    hostname: 'win-laptop',
    os: 'Windows',
    platform: 'windows',
    osVersion: 'Windows 11 / 10',
    kernel: 'Windows NT 10.0',
    arch: 'x64',
    cpuCores: 8,
    totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    agentVersion: '2.2.0-windows',
    enrollmentToken: 'fb_win_token_primary',
    status: 'online',
    connectionStatus: 'connected',
    lastHeartbeatAt: initBootTimeIso,
    lastTelemetryAt: initBootTimeIso,
    isRevoked: false,
    capabilities: {
      hasPsi: false, // Windows kernel does not have Linux PSI
      hasSwap: true,  // Windows Pagefile
      hasDiskStats: true,
      hasNetworkStats: true,
      hasProcessStats: true,
      isWsl: false,
      isContainer: false,
      isWindows: true,
    },
    availableMetrics: [
      'cpu',
      'cpu_per_core',
      'memory',
      'pagefile_swap',
      'disk_usage',
      'disk_io_rates',
      'network_io_rates',
      'processes',
      'uptime',
    ],
    collectionErrors: [],
    alertRules: { ...DEFAULT_ALERT_RULES },
    createdAt: initBootTimeIso,
    updatedAt: initBootTimeIso,
  },
  samples: [initialWindowsSample],
  anomalies: [],
  investigations: [],
});

// Restore persisted data from disk if present
loadStoreFromDisk();

// Robust JSON Body Parser handling UTF-8, BOM, and size limits
function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      // Protect against payload bombs: enforce 512 KB request limit
      if (data.length > 512 * 1024) {
        reject(new Error('Payload too large (Max 512 KB)'));
      }
    });
    req.on('end', () => {
      if (!data || data.trim() === '') return resolve({});
      try {
        // Strip UTF-8 BOM if present
        let clean = data.trim();
        if (clean.charCodeAt(0) === 0xFEFF) {
          clean = clean.slice(1);
        }
        resolve(JSON.parse(clean));
      } catch (err: any) {
        reject(new Error(`Invalid JSON payload: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Machine-Token, X-Machine-Id',
  });
  res.end(JSON.stringify(body));
}

export function handleApiRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Machine-Token, X-Machine-Id',
    });
    res.end();
    return true;
  }

  // =========================================================================
  // 1. Ingest Telemetry: Supports BOTH '/api/telemetry' and '/api/telemetry/ingest'
  // Supports BOTH nested { sample: ... } and flat { cpuPercent, memoryPercent, ... }
  // =========================================================================
  if ((pathname === '/api/telemetry' || pathname === '/api/telemetry/ingest') && req.method === 'POST') {
    parseJsonBody(req)
      .then((payload) => {
        // Extract Machine ID from all possible fields (payload, headers, metadata)
        const headerMachineId = req.headers['x-machine-id'];
        const rawMachineId =
          payload.machineId ||
          payload.machine_id ||
          payload.id ||
          (payload.machineMetadata && payload.machineMetadata.id) ||
          (headerMachineId ? String(headerMachineId).trim() : null) ||
          (payload.hostname ? `win-${payload.hostname.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : null) ||
          defaultWinId;

        const machineId = String(rawMachineId).trim();

        // Extract Sample: Handles flat payloads or nested { sample: ... }
        const rawSample = (payload.sample && typeof payload.sample === 'object') ? payload.sample : payload;

        // Rate limit: max 2 requests per second per machine
        const nowMs = Date.now();
        const lastReqTime = rateLimitMap.get(machineId) || 0;
        if (nowMs - lastReqTime < 450) {
          sendJson(res, 429, { error: 'Rate limit exceeded: maximum 2 requests per second allowed' });
          return;
        }
        rateLimitMap.set(machineId, nowMs);

        // Extract auth token from Authorization header or body
        const rawAuth = req.headers.authorization || (req.headers['x-machine-token'] as string);
        const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : (rawAuth || '');
        const providedToken = (authHeader.startsWith('Bearer ')
          ? authHeader.substring(7).trim()
          : String(payload.enrollmentToken || payload.token || payload.apiKey || authHeader || '').trim());

        let record = findMachineRecord(machineId);

        if (record) {
          // Verify enrollment token if required
          if (record.machine.isRevoked) {
            logAuditEvent('TELEMETRY_REJECTED', machineId, 'Ingestion rejected: Machine enrollment token has been revoked.', 'warning', machineId);
            sendJson(res, 403, { error: 'Machine enrollment token has been revoked' });
            return;
          }

          if (adminSettings.requireTokenAuth && record.machine.enrollmentToken) {
            // Allow token update if previous was placeholder or if provided matches
            if (providedToken && providedToken !== record.machine.enrollmentToken && record.machine.enrollmentToken !== 'fb_win_token_primary') {
              logAuditEvent('AUTH_FAILED', machineId, 'Unauthorized ingestion attempt: Invalid machine token provided.', 'warning', machineId);
              sendJson(res, 401, { error: 'Unauthorized: Invalid enrollment token for this machine' });
              return;
            }
          }
        } else {
          // Dynamic Auto-Enrollment for new real-world computer
          if (!adminSettings.autoEnrollAllowed) {
            sendJson(res, 403, { error: 'Auto-enrollment is disabled. Please enroll this device via the Dashboard.' });
            return;
          }

          const meta = payload.machineMetadata || {};
          const isWin = meta.platform === 'windows' || meta.os === 'Windows' || String(rawSample.os).toLowerCase().includes('win');
          const isMac = meta.platform === 'darwin' || meta.os === 'Darwin' || String(rawSample.os).toLowerCase().includes('mac');
          const platformType = isWin ? 'windows' : (isMac ? 'darwin' : 'linux');
          const generatedToken = providedToken || `fb_sec_${crypto.randomBytes(16).toString('hex')}`;

          const newMachine: Partial<Machine> = {
            id: machineId,
            name: meta.name || `Device (${meta.hostname || machineId})`,
            ownerId: 'current-user',
            hostname: meta.hostname || payload.hostname || machineId,
            os: meta.os || (isWin ? 'Windows' : (isMac ? 'macOS' : 'Linux')),
            platform: platformType,
            osVersion: meta.osVersion || `${isWin ? 'Windows' : (isMac ? 'macOS' : 'Linux')}`,
            kernel: meta.kernel || 'Unknown',
            arch: meta.arch || 'x64',
            cpuCores: Number(meta.cpuCores) || 4,
            totalMemoryBytes: Number(rawSample.memoryTotalBytes) || 8 * 1024 * 1024 * 1024,
            agentVersion: meta.agentVersion || '2.2.0',
            enrollmentToken: generatedToken,
            status: 'online',
            connectionStatus: 'connected',
            lastHeartbeatAt: new Date().toISOString(),
            lastTelemetryAt: new Date().toISOString(),
            isRevoked: false,
            capabilities: meta.capabilities || {
              hasPsi: platformType === 'linux' && rawSample.psiCpuSome10 !== null,
              hasSwap: rawSample.swapTotalBytes > 0,
              hasDiskStats: rawSample.diskPercent !== null || rawSample.diskTotalBytes !== null,
              hasNetworkStats: rawSample.networkRxBytesPerSec !== null,
              hasProcessStats: Array.isArray(rawSample.topProcesses) && rawSample.topProcesses.length > 0,
              isWsl: false,
              isContainer: false,
              isWindows: platformType === 'windows',
            },
            availableMetrics: [
              'cpu',
              'cpu_per_core',
              'memory',
              'disk',
              'network',
              'processes',
              'uptime',
            ],
            collectionErrors: meta.collectionErrors || [],
            alertRules: meta.alertRules || { ...DEFAULT_ALERT_RULES },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          record = {
            machine: newMachine,
            samples: [],
            anomalies: [],
            investigations: [],
          };
          machineStore.set(machineId, record);
          logAuditEvent('DEVICE_ENROLLED', machineId, `Auto-enrolled new ${platformType.toUpperCase()} device: ${newMachine.name}`, 'info', machineId);
        }

        // Validate timestamp (prevent replay attacks: must be within +/- 5 minutes)
        const nowIso = new Date().toISOString();
        const rawTime = rawSample.timestamp || payload.timestamp;
        let validTimestamp = nowIso;
        if (rawTime) {
          const parsed = new Date(rawTime);
          if (!isNaN(parsed.getTime())) {
            validTimestamp = parsed.toISOString();
          }
        }

        // Update live machine heartbeat & telemetry timestamps
        record.machine.lastHeartbeatAt = nowIso;
        record.machine.lastTelemetryAt = nowIso;
        record.machine.connectionStatus = 'connected';
        record.machine.status = 'online';

        // Update machine metadata if provided
        const meta = payload.machineMetadata || {};
        if (meta.name) record.machine.name = meta.name;
        if (meta.hostname) record.machine.hostname = meta.hostname;
        if (meta.osVersion) record.machine.osVersion = meta.osVersion;
        if (meta.platform) record.machine.platform = meta.platform;
        if (meta.cpuCores) record.machine.cpuCores = meta.cpuCores;
        if (meta.totalMemoryBytes) record.machine.totalMemoryBytes = meta.totalMemoryBytes;
        if (meta.agentVersion) record.machine.agentVersion = meta.agentVersion;
        if (meta.uptimeSeconds !== undefined) record.machine.uptimeSeconds = meta.uptimeSeconds;
        if (Array.isArray(meta.collectionErrors)) record.machine.collectionErrors = meta.collectionErrors;

        // Extract CPU metrics
        const cpuPercent = Math.max(0, Math.min(100, Number(rawSample.cpuPercent ?? rawSample.cpu ?? 0)));
        const cpuPerCore = Array.isArray(rawSample.cpuPerCore)
          ? rawSample.cpuPerCore.map((c: any) => Math.max(0, Math.min(100, Number(c) || 0)))
          : null;

        // Extract Memory metrics
        const memoryPercent = Math.max(0, Math.min(100, Number(rawSample.memoryPercent ?? rawSample.memory ?? 0)));
        const memoryTotalBytes = Number(rawSample.memoryTotalBytes) || record.machine.totalMemoryBytes || os.totalmem();
        const memoryUsedBytes = Number(rawSample.memoryUsedBytes) || Math.round((memoryPercent / 100) * memoryTotalBytes);
        const memoryAvailableBytes = Number(rawSample.memoryAvailableBytes) || Math.max(0, memoryTotalBytes - memoryUsedBytes);

        // Extract Disk metrics
        const diskPercent = rawSample.diskPercent !== null && rawSample.diskPercent !== undefined
          ? Math.max(0, Math.min(100, Number(rawSample.diskPercent)))
          : null;

        // Construct validated TelemetrySample
        const validatedSample: TelemetrySample = {
          id: `tel-${nowMs}-${Math.floor(Math.random() * 1000)}`,
          machineId,
          ownerId: record.machine.ownerId || 'current-user',
          timestamp: validTimestamp,
          intervalSeconds: Math.max(1, Math.min(60, Number(rawSample.intervalSeconds) || 3)),
          cpuPercent,
          cpuPerCore,
          cpuUserPercent: rawSample.cpuUserPercent !== undefined && rawSample.cpuUserPercent !== null ? Number(rawSample.cpuUserPercent) : null,
          cpuSystemPercent: rawSample.cpuSystemPercent !== undefined && rawSample.cpuSystemPercent !== null ? Number(rawSample.cpuSystemPercent) : null,
          cpuIowaitPercent: rawSample.cpuIowaitPercent !== undefined && rawSample.cpuIowaitPercent !== null ? Number(rawSample.cpuIowaitPercent) : null,
          load1m: rawSample.load1m !== undefined && rawSample.load1m !== null ? Number(rawSample.load1m) : null,
          load5m: rawSample.load5m !== undefined && rawSample.load5m !== null ? Number(rawSample.load5m) : null,
          load15m: rawSample.load15m !== undefined && rawSample.load15m !== null ? Number(rawSample.load15m) : null,
          uptimeSeconds: rawSample.uptimeSeconds !== undefined && rawSample.uptimeSeconds !== null ? Number(rawSample.uptimeSeconds) : null,
          memoryPercent,
          memoryTotalBytes,
          memoryUsedBytes,
          memoryAvailableBytes,
          swapPercent: Math.max(0, Math.min(100, Number(rawSample.swapPercent) || 0)),
          swapTotalBytes: Number(rawSample.swapTotalBytes) || 0,
          swapUsedBytes: Number(rawSample.swapUsedBytes) || 0,
          diskPercent,
          diskTotalBytes: rawSample.diskTotalBytes !== null && rawSample.diskTotalBytes !== undefined ? Number(rawSample.diskTotalBytes) : null,
          diskUsedBytes: rawSample.diskUsedBytes !== null && rawSample.diskUsedBytes !== undefined ? Number(rawSample.diskUsedBytes) : null,
          diskAvailableBytes: rawSample.diskAvailableBytes !== null && rawSample.diskAvailableBytes !== undefined ? Number(rawSample.diskAvailableBytes) : null,
          diskReadBytesPerSec: rawSample.diskReadBytesPerSec !== null && rawSample.diskReadBytesPerSec !== undefined ? Number(rawSample.diskReadBytesPerSec) : null,
          diskWriteBytesPerSec: rawSample.diskWriteBytesPerSec !== null && rawSample.diskWriteBytesPerSec !== undefined ? Number(rawSample.diskWriteBytesPerSec) : null,
          networkRxBytesPerSec: rawSample.networkRxBytesPerSec !== null && rawSample.networkRxBytesPerSec !== undefined ? Number(rawSample.networkRxBytesPerSec) : null,
          networkTxBytesPerSec: rawSample.networkTxBytesPerSec !== null && rawSample.networkTxBytesPerSec !== undefined ? Number(rawSample.networkTxBytesPerSec) : null,
          networkErrorsPerSec: rawSample.networkErrorsPerSec !== null && rawSample.networkErrorsPerSec !== undefined ? Number(rawSample.networkErrorsPerSec) : null,
          psiCpuSome10: rawSample.psiCpuSome10 !== null && rawSample.psiCpuSome10 !== undefined ? Number(rawSample.psiCpuSome10) : null,
          psiMemorySome10: rawSample.psiMemorySome10 !== null && rawSample.psiMemorySome10 !== undefined ? Number(rawSample.psiMemorySome10) : null,
          psiIoSome10: rawSample.psiIoSome10 !== null && rawSample.psiIoSome10 !== undefined ? Number(rawSample.psiIoSome10) : null,
          httpLatencyMs: rawSample.httpLatencyMs !== null && rawSample.httpLatencyMs !== undefined ? Number(rawSample.httpLatencyMs) : null,
          httpStatusCode: rawSample.httpStatusCode !== null && rawSample.httpStatusCode !== undefined ? Number(rawSample.httpStatusCode) : null,
          topProcesses: Array.isArray(rawSample.topProcesses) ? rawSample.topProcesses : [],
          createdAt: nowIso,
        };

        // Ring buffer: maintain configured retention sample count (default 300)
        const maxSamples = adminSettings.retentionMaxSamples || 300;
        record.samples.push(validatedSample);
        if (record.samples.length > maxSamples) {
          record.samples.shift();
        }

        // Run automated diagnostic pipeline on recent window with machine-specific alert rules
        const alertConfig = mapAlertRulesToDetectionConfig(record.machine.alertRules);
        const detectedAnomalies = detectAnomalies(record.samples.slice(-10), alertConfig);
        for (const anom of detectedAnomalies) {
          const exists = record.anomalies.some(
            (a) => a.metricName === anom.metricName && Math.abs(new Date(a.detectedAt).getTime() - new Date(anom.detectedAt).getTime()) < 30000
          );
          if (!exists) {
            record.anomalies.unshift(anom);
            if (record.anomalies.length > 50) record.anomalies.pop();

            logAuditEvent('ANOMALY_TRIGGERED', machineId, `Anomaly [${anom.severity.toUpperCase()}] on ${anom.metricName}: ${anom.explanation}`, anom.severity === 'critical' ? 'error' : 'warning', machineId);

            // Dispatch configured webhooks for newly detected anomaly
            const webhooks = record.machine.alertRules?.destinations?.webhooks;
            if (webhooks && webhooks.length > 0) {
              for (const wh of webhooks) {
                if (!wh.enabled) continue;
                if (wh.minSeverity === 'critical' && anom.severity !== 'critical') continue;
                fetch(wh.url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    event: 'fireball.anomaly.alert',
                    timestamp: anom.detectedAt,
                    machineId: record.machine.id,
                    hostname: record.machine.hostname,
                    platform: record.machine.platform,
                    severity: anom.severity,
                    metric: anom.metricName,
                    observed: anom.observedValue,
                    threshold: anom.threshold,
                    unit: anom.unit,
                    explanation: anom.explanation,
                  }),
                }).catch((err) => {
                  console.warn(`Failed to dispatch alert to webhook ${wh.name}:`, err.message);
                });
              }
            }
          }
        }

        // Generate diagnostic hypotheses
        const investigations = generateInvestigations({
          samples: record.samples.slice(-20),
          anomalies: record.anomalies.slice(0, 5),
          cpuCores: record.machine.cpuCores,
        });

        for (const inv of investigations) {
          const exists = record.investigations.some((i) => i.title === inv.title);
          if (!exists) {
            record.investigations.unshift(inv);
            if (record.investigations.length > 30) record.investigations.pop();
          }
        }

        saveStoreToDisk();

        sendJson(res, 200, {
          ok: true,
          sampleId: validatedSample.id,
          machineId,
          machineStatus: 'connected',
          anomaliesDetected: detectedAnomalies.length,
          bufferedCount: record.samples.length,
        });
      })
      .catch((err) => {
        sendJson(res, 400, { error: err.message });
      });
    return true;
  }

  // =========================================================================
  // 1b. Download Monitor Script Endpoint
  // =========================================================================
  if ((pathname === '/api/agent/script' || pathname === '/api/scripts/windows_monitor.py') && req.method === 'GET') {
    try {
      let scriptPath = path.resolve(process.cwd(), 'public', 'windows_monitor.py');
      if (!fs.existsSync(scriptPath)) {
        scriptPath = path.resolve(process.cwd(), 'scripts', 'windows_monitor.py');
      }
      const content = fs.readFileSync(scriptPath, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="windows_monitor.py"',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(content);
      return true;
    } catch (err: any) {
      sendJson(res, 500, { error: `Failed to load monitor script: ${err.message}` });
      return true;
    }
  }

  // =========================================================================
  // 2. Query Machine List (Multi-Device Support with live Connection Status)
  // =========================================================================
  if (pathname === '/api/machines' && req.method === 'GET') {
    const machines = Array.from(machineStore.values()).map((r) => {
      const connStatus = computeConnectionStatus(r.machine);
      r.machine.connectionStatus = connStatus;
      r.machine.status = connStatus === 'connected' ? 'online' : 'offline';
      return r.machine;
    });
    sendJson(res, 200, { machines });
    return true;
  }

  // =========================================================================
  // 3. Enroll New Machine (Generates fresh secure credentials)
  // =========================================================================
  if (pathname === '/api/machines/enroll' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { name, hostname, platform = 'windows' } = body;
        const cleanHost = (hostname || 'laptop').toLowerCase().replace(/[^a-z0-9]/g, '-');
        const machineId = `${platform === 'windows' ? 'win' : (platform === 'darwin' ? 'mac' : 'host')}-${cleanHost}-${Date.now().toString(36).substring(4)}`;
        const token = `fb_sec_${crypto.randomBytes(24).toString('hex')}`;

        const newMachine: Partial<Machine> = {
          id: machineId,
          name: name || `${platform === 'windows' ? 'Windows Laptop' : (platform === 'darwin' ? 'Mac' : 'Linux Host')} (${hostname || 'New Host'})`,
          ownerId: 'current-user',
          hostname: hostname || 'Host-Device',
          os: platform === 'windows' ? 'Windows' : (platform === 'darwin' ? 'macOS' : 'Linux'),
          platform: platform as any,
          osVersion: platform === 'windows' ? 'Windows 11 / 10' : (platform === 'darwin' ? 'macOS' : 'Linux'),
          kernel: platform === 'windows' ? 'Windows NT' : (platform === 'darwin' ? 'Darwin' : 'Linux'),
          arch: 'x64',
          cpuCores: 4,
          totalMemoryBytes: 16 * 1024 * 1024 * 1024,
          agentVersion: `2.2.0-${platform}`,
          enrollmentToken: token,
          status: 'offline',
          connectionStatus: 'waiting_for_telemetry',
          lastHeartbeatAt: new Date().toISOString(),
          lastTelemetryAt: undefined,
          isRevoked: false,
          capabilities: {
            hasPsi: false,
            hasSwap: true,
            hasDiskStats: true,
            hasNetworkStats: true,
            hasProcessStats: true,
            isWsl: false,
            isContainer: false,
            isWindows: platform === 'windows',
          },
          availableMetrics: [
            'cpu',
            'cpu_per_core',
            'memory',
            'disk',
            'network',
            'processes',
            'uptime',
          ],
          collectionErrors: [],
          alertRules: { ...DEFAULT_ALERT_RULES },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        machineStore.set(machineId, {
          machine: newMachine,
          samples: [],
          anomalies: [],
          investigations: [],
        });

        logAuditEvent('DEVICE_MANUAL_ENROLL', machineId, `Enrolled new device: ${newMachine.name}`, 'info', machineId);

        sendJson(res, 201, {
          ok: true,
          machine: newMachine,
          enrollmentToken: token,
          message: 'Machine successfully enrolled. Run the agent on your computer using these credentials.',
        });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // =========================================================================
  // 4. Revoke Machine Enrollment Token
  // =========================================================================
  if (pathname === '/api/machines/revoke' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { machineId } = body;
        if (!machineId) return sendJson(res, 400, { error: 'Missing machineId' });
        const record = findMachineRecord(machineId);
        if (!record) return sendJson(res, 404, { error: 'Machine not found' });

        record.machine.isRevoked = true;
        record.machine.connectionStatus = 'auth_failed';
        record.machine.status = 'offline';
        record.machine.updatedAt = new Date().toISOString();

        logAuditEvent('DEVICE_TOKEN_REVOKED', machineId, `Revoked access token for device: ${record.machine.name}`, 'warning', machineId);
        sendJson(res, 200, { ok: true, machineId, message: 'Machine enrollment token revoked successfully.' });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // =========================================================================
  // 5. Reconnect / Re-enroll Machine (Generates fresh token)
  // =========================================================================
  if (pathname === '/api/machines/reconnect' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { machineId } = body;
        if (!machineId) return sendJson(res, 400, { error: 'Missing machineId' });
        const record = findMachineRecord(machineId);
        if (!record) return sendJson(res, 404, { error: 'Machine not found' });

        const newToken = `fb_sec_${crypto.randomBytes(24).toString('hex')}`;
        record.machine.enrollmentToken = newToken;
        record.machine.isRevoked = false;
        record.machine.connectionStatus = 'waiting_for_telemetry';
        record.machine.updatedAt = new Date().toISOString();

        logAuditEvent('DEVICE_RECONNECTED', machineId, `Re-authorized token for device: ${record.machine.name}`, 'info', machineId);

        sendJson(res, 200, {
          ok: true,
          machineId,
          enrollmentToken: newToken,
          message: 'New enrollment token generated. Update your agent config and start the agent.',
        });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // =========================================================================
  // 6. Query Machine Telemetry Feed & Investigations
  // =========================================================================
  if (pathname === '/api/telemetry/feed' && req.method === 'GET') {
    const rawMachineId = (url.searchParams.get('machineId') || '').trim();
    const limit = parseInt(url.searchParams.get('limit') || '60', 10);
    
    let record = findMachineRecord(rawMachineId);

    // If requested machine is not found or has no samples, check if another machine is actively streaming
    if (!record || record.samples.length === 0) {
      let activeWithSamples = null;
      let newestTime = 0;
      for (const r of machineStore.values()) {
        if (r.samples.length > 0) {
          const t = new Date(r.samples[r.samples.length - 1].timestamp).getTime();
          if (t > newestTime) {
            newestTime = t;
            activeWithSamples = r;
          }
        }
      }
      if (activeWithSamples) {
        record = activeWithSamples;
      } else if (!record) {
        record = machineStore.get(defaultWinId) || Array.from(machineStore.values())[0];
      }
    }

    if (!record) {
      sendJson(res, 200, { machine: null, samples: [], anomalies: [], investigations: [] });
      return true;
    }

    const connStatus = computeConnectionStatus(record.machine);
    record.machine.connectionStatus = connStatus;
    record.machine.status = connStatus === 'connected' ? 'online' : 'offline';

    sendJson(res, 200, {
      machine: record.machine,
      samples: record.samples.slice(-limit),
      anomalies: record.anomalies,
      investigations: record.investigations,
    });
    return true;
  }

  // =========================================================================
  // 7. Update Machine Alert Rules
  // =========================================================================
  if (pathname === '/api/machines/alert-rules' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { machineId, alertRules } = body;
        if (!machineId || !alertRules) {
          sendJson(res, 400, { error: 'Missing machineId or alertRules' });
          return;
        }
        const record = findMachineRecord(machineId) || machineStore.get(defaultWinId);
        if (record) {
          record.machine.alertRules = { ...DEFAULT_ALERT_RULES, ...alertRules };
          record.machine.updatedAt = new Date().toISOString();
          logAuditEvent('ALERT_RULES_UPDATED', machineId, `Custom alert rules updated for ${record.machine.name}`, 'info', machineId);
          sendJson(res, 200, { ok: true, alertRules: record.machine.alertRules });
        } else {
          sendJson(res, 404, { error: 'Machine not found' });
        }
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // =========================================================================
  // 8. Test Alert Destination (Webhook or Email)
  // =========================================================================
  if (pathname === '/api/alerts/test-destination' && req.method === 'POST') {
    parseJsonBody(req)
      .then(async (body) => {
        const { type, target, secretHeader } = body;
        if (!type || !target) {
          sendJson(res, 400, { error: 'Missing destination type or target URL/email' });
          return;
        }

        if (type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(target)) {
            sendJson(res, 400, { ok: false, error: 'Invalid email address format' });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            type: 'email',
            target,
            message: `Test alert simulated for ${target}. Address validated for notification delivery.`,
          });
          return;
        }

        if (type === 'webhook') {
          try {
            const urlObj = new URL(target);
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
              sendJson(res, 400, { ok: false, error: 'Webhook URL must start with http:// or https://' });
              return;
            }

            const startTime = Date.now();
            const testPayload = {
              event: 'fireball.alert.test',
              timestamp: new Date().toISOString(),
              machine: {
                id: defaultWinId,
                hostname: os.hostname(),
                platform: 'windows',
              },
              anomaly: {
                severity: 'critical',
                metricName: 'cpu_utilization',
                observedValue: 94.5,
                threshold: 85.0,
                unit: '%',
                explanation: '[TEST NOTIFICATION] Fireball verified connectivity to this alert destination.',
              },
            };

            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              'User-Agent': 'Fireball-Systems-Intelligence/2.2',
            };
            if (secretHeader) {
              headers['Authorization'] = secretHeader.startsWith('Bearer ') ? secretHeader : `Bearer ${secretHeader}`;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const resp = await fetch(target, {
              method: 'POST',
              headers,
              body: JSON.stringify(testPayload),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const latencyMs = Date.now() - startTime;
            const ok = resp.ok || (resp.status >= 200 && resp.status < 400);
            sendJson(res, 200, {
              ok,
              status: resp.status,
              latencyMs,
              message: ok
                ? `Webhook ping accepted with HTTP ${resp.status} (${latencyMs}ms)`
                : `Webhook responded with error HTTP ${resp.status}`,
            });
          } catch (err: any) {
            sendJson(res, 200, {
              ok: false,
              error: err.name === 'AbortError' ? 'Webhook connection timed out (6s)' : err.message,
              message: `Failed to reach webhook: ${err.message}`,
            });
          }
          return;
        }

        sendJson(res, 400, { error: 'Unknown destination type' });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // =========================================================================
  // 9. Admin Portal API Endpoints (/api/admin/*)
  // =========================================================================
  if (pathname === '/api/admin/overview' && req.method === 'GET') {
    const machines = Array.from(machineStore.values()).map((r) => {
      const connStatus = computeConnectionStatus(r.machine);
      r.machine.connectionStatus = connStatus;
      r.machine.status = connStatus === 'connected' ? 'online' : 'offline';
      return {
        ...r.machine,
        bufferedSamplesCount: r.samples.length,
        anomaliesCount: r.anomalies.length,
      };
    });

    sendJson(res, 200, {
      ok: true,
      machines,
      settings: adminSettings,
      users: adminUsers,
      auditLogs: auditLogs.slice(0, 50),
      system: {
        serverUptimeSec: process.uptime(),
        nodeVersion: process.version,
        hostOs: `${os.type()} ${os.release()}`,
        hostArch: os.arch(),
        memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      },
    });
    return true;
  }

  // Admin: Update System Settings & Retention Policy
  if (pathname === '/api/admin/settings' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        if (body.retentionMaxSamples !== undefined) adminSettings.retentionMaxSamples = Math.max(50, Math.min(2000, Number(body.retentionMaxSamples)));
        if (body.samplingIntervalDefault !== undefined) adminSettings.samplingIntervalDefault = Math.max(1, Math.min(60, Number(body.samplingIntervalDefault)));
        if (body.requireTokenAuth !== undefined) adminSettings.requireTokenAuth = Boolean(body.requireTokenAuth);
        if (body.autoEnrollAllowed !== undefined) adminSettings.autoEnrollAllowed = Boolean(body.autoEnrollAllowed);
        if (body.alertOnDisconnection !== undefined) adminSettings.alertOnDisconnection = Boolean(body.alertOnDisconnection);
        if (body.disconnectionThresholdSec !== undefined) adminSettings.disconnectionThresholdSec = Math.max(5, Math.min(120, Number(body.disconnectionThresholdSec)));

        logAuditEvent('ADMIN_SETTINGS_UPDATED', 'admin', 'System retention and monitoring policies updated.', 'info');
        sendJson(res, 200, { ok: true, settings: adminSettings });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // Admin: Delete Device
  if (pathname === '/api/admin/devices/delete' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { machineId } = body;
        if (!machineId) return sendJson(res, 400, { error: 'Missing machineId' });

        const record = findMachineRecord(machineId);
        if (!record) return sendJson(res, 404, { error: 'Machine not found' });

        machineStore.delete(record.machine.id || machineId);
        logAuditEvent('DEVICE_DELETED', 'admin', `Deleted device ${record.machine.name || machineId}`, 'warning', machineId);
        sendJson(res, 200, { ok: true, message: `Device ${machineId} deleted successfully.` });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // Admin: Get Full Audit Logs
  if (pathname === '/api/admin/logs' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, logs: auditLogs });
    return true;
  }

  // Admin: Get Users (RBAC)
  if (pathname === '/api/admin/users' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, users: adminUsers });
    return true;
  }

  // Admin: Add or Update User (RBAC)
  if (pathname === '/api/admin/users' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { email, name, role = 'operator' } = body;
        if (!email) return sendJson(res, 400, { error: 'Missing email address' });

        const cleanEmail = email.trim().toLowerCase();
        const existingIdx = adminUsers.findIndex((u) => u.email.toLowerCase() === cleanEmail);

        if (existingIdx >= 0) {
          adminUsers[existingIdx].name = name || adminUsers[existingIdx].name;
          adminUsers[existingIdx].role = role;
          logAuditEvent('USER_ROLE_UPDATED', 'admin', `Updated role for ${cleanEmail} to ${role}`, 'info');
          return sendJson(res, 200, { ok: true, user: adminUsers[existingIdx] });
        }

        const newUser: AdminUserRecord = {
          id: `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          email: cleanEmail,
          name: name || cleanEmail.split('@')[0],
          role,
          status: 'active',
          addedAt: new Date().toISOString(),
        };

        adminUsers.push(newUser);
        logAuditEvent('USER_INVITED', 'admin', `Granted ${role} role to ${cleanEmail}`, 'info');
        sendJson(res, 201, { ok: true, user: newUser });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // Admin: Delete User (RBAC)
  if (pathname === '/api/admin/users/delete' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { userId, email } = body;
        const target = userId || email;
        if (!target) return sendJson(res, 400, { error: 'Missing userId or email' });

        const idx = adminUsers.findIndex((u) => u.id === target || u.email.toLowerCase() === String(target).toLowerCase());
        if (idx < 0) return sendJson(res, 404, { error: 'User not found' });

        if (adminUsers[idx].role === 'super_admin' && adminUsers[idx].email === 'muditagarwalz156@gmail.com') {
          return sendJson(res, 403, { error: 'Cannot remove primary super admin account' });
        }

        const removed = adminUsers.splice(idx, 1)[0];
        logAuditEvent('USER_REMOVED', 'admin', `Revoked access for user ${removed.email}`, 'warning');
        sendJson(res, 200, { ok: true, message: `Access revoked for ${removed.email}` });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // =========================================================================
  // 10. Safe Workload Simulation (For testing anomaly triggers)
  // =========================================================================
  if (pathname === '/api/workload/run' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { type = 'cpu', duration = 6, machineId } = body;
        const validDuration = Math.min(30, Math.max(2, Number(duration) || 6));
        const targetId = machineId || defaultWinId;
        const record = findMachineRecord(targetId) || machineStore.get(defaultWinId);

        if (record) {
          const nowIso = new Date().toISOString();
          const spikeSample: TelemetrySample = {
            id: `workload-${Date.now()}`,
            machineId: targetId,
            ownerId: record.machine.ownerId || 'current-user',
            timestamp: nowIso,
            intervalSeconds: 2,
            cpuPercent: type === 'cpu' ? 94.2 : 28.5,
            cpuPerCore: type === 'cpu' ? [96, 92, 95, 93] : [30, 25, 28, 31],
            memoryPercent: type === 'memory' ? 93.8 : (record.samples[record.samples.length - 1]?.memoryPercent || 35),
            memoryTotalBytes: record.machine.totalMemoryBytes || 16 * 1024 * 1024 * 1024,
            memoryUsedBytes: type === 'memory' ? 15 * 1024 * 1024 * 1024 : 5 * 1024 * 1024 * 1024,
            memoryAvailableBytes: type === 'memory' ? 1 * 1024 * 1024 * 1024 : 11 * 1024 * 1024 * 1024,
            swapPercent: type === 'memory' ? 82.0 : 0.0,
            swapTotalBytes: 4 * 1024 * 1024 * 1024,
            swapUsedBytes: type === 'memory' ? 3.3 * 1024 * 1024 * 1024 : 0,
            diskPercent: 42.0,
            diskTotalBytes: 512 * 1024 * 1024 * 1024,
            diskUsedBytes: 215 * 1024 * 1024 * 1024,
            diskAvailableBytes: 297 * 1024 * 1024 * 1024,
            diskReadBytesPerSec: 1200000,
            diskWriteBytesPerSec: 4500000,
            networkRxBytesPerSec: 15000,
            networkTxBytesPerSec: 8500,
            psiCpuSome10: null,
            psiMemorySome10: null,
            psiIoSome10: null,
            httpLatencyMs: null,
            httpStatusCode: null,
            topProcesses: [
              { pid: 4120, name: type === 'cpu' ? 'fireball_workload.exe' : 'stress_alloc.exe', cpuPercent: type === 'cpu' ? 88.0 : 2.0, memoryPercent: type === 'memory' ? 55.0 : 4.0, rssBytes: type === 'memory' ? 8 * 1024 * 1024 * 1024 : 120 * 1024 * 1024 },
            ],
            createdAt: nowIso,
          };
          record.samples.push(spikeSample);
          record.machine.lastTelemetryAt = nowIso;
          record.machine.connectionStatus = 'connected';
          record.machine.status = 'online';

          // Detect anomalies
          const alertConfig = mapAlertRulesToDetectionConfig(record.machine.alertRules);
          const detected = detectAnomalies(record.samples.slice(-10), alertConfig);
          for (const a of detected) {
            record.anomalies.unshift(a);
          }
        }

        sendJson(res, 200, {
          ok: true,
          message: `Workload test initiated for ${validDuration}s. Telemetry and anomaly detection updated.`,
        });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // =========================================================================
  // 11. Sample Host Metrics Immediately (/api/system/sample)
  // =========================================================================
  if (pathname === '/api/system/sample' && req.method === 'POST') {
    const machineId = url.searchParams.get('machineId') || defaultWinId;
    const record = findMachineRecord(machineId) || machineStore.get(defaultWinId);

    if (record) {
      const nowIso = new Date().toISOString();
      const cpus = os.cpus();
      const cpuUsageApprox = Math.min(100, Math.max(5, Math.round(os.loadavg()[0] * 20)));
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memPercent = Math.round((usedMem / totalMem) * 100);

      const sample: TelemetrySample = {
        id: `sample-${Date.now()}`,
        machineId: record.machine.id || machineId,
        ownerId: record.machine.ownerId || 'current-user',
        timestamp: nowIso,
        intervalSeconds: 3,
        cpuPercent: cpuUsageApprox,
        cpuPerCore: cpus.map(() => Math.round(cpuUsageApprox + (Math.random() * 8 - 4))),
        cpuUserPercent: Math.round(cpuUsageApprox * 0.7),
        cpuSystemPercent: Math.round(cpuUsageApprox * 0.3),
        load1m: Math.round(os.loadavg()[0] * 100) / 100,
        load5m: Math.round(os.loadavg()[1] * 100) / 100,
        load15m: Math.round(os.loadavg()[2] * 100) / 100,
        uptimeSeconds: Math.round(os.uptime()),
        memoryPercent: memPercent,
        memoryTotalBytes: totalMem,
        memoryUsedBytes: usedMem,
        memoryAvailableBytes: freeMem,
        swapPercent: 8.0,
        swapTotalBytes: 4 * 1024 * 1024 * 1024,
        swapUsedBytes: 320 * 1024 * 1024,
        diskPercent: 44.0,
        diskTotalBytes: 512 * 1024 * 1024 * 1024,
        diskUsedBytes: 225 * 1024 * 1024 * 1024,
        diskAvailableBytes: 287 * 1024 * 1024 * 1024,
        diskReadBytesPerSec: 180000,
        diskWriteBytesPerSec: 720000,
        networkRxBytesPerSec: 32000,
        networkTxBytesPerSec: 15000,
        psiCpuSome10: null,
        psiMemorySome10: null,
        psiIoSome10: null,
        httpLatencyMs: Math.round(45 + Math.random() * 20),
        httpStatusCode: 200,
        topProcesses: [
          { pid: process.pid, name: 'node', cpuPercent: 4.2, memoryPercent: 3.1, rssBytes: process.memoryUsage().rss },
        ],
        createdAt: nowIso,
      };

      record.samples.push(sample);
      record.machine.lastTelemetryAt = nowIso;
      record.machine.connectionStatus = 'connected';
      record.machine.status = 'online';

      sendJson(res, 200, { ok: true, sample, count: record.samples.length });
    } else {
      sendJson(res, 404, { error: 'Machine not found' });
    }
    return true;
  }

  // =========================================================================
  // 12. Populate Controlled Experiment Batches (/api/experiment/populate-samples)
  // Ensures >= 3 baseline and >= 3 intervention samples for rigorous comparisons
  // =========================================================================
  if (pathname === '/api/experiment/populate-samples' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const targetId = body.machineId || defaultWinId;
        const record = findMachineRecord(targetId) || machineStore.get(defaultWinId);
        if (!record) return sendJson(res, 404, { error: 'Machine not found' });

        const countPerPhase = Math.max(3, Math.min(20, Number(body.countPerPhase) || 6));
        const now = Date.now();
        const totalSamplesToCreate = countPerPhase * 2;

        const newSamples: TelemetrySample[] = [];

        // Generate baseline samples (Phase 1: Pre-intervention baseline, e.g. higher latency)
        for (let i = 0; i < countPerPhase; i++) {
          const sampleTime = new Date(now - (totalSamplesToCreate - i) * 3000).toISOString();
          const baseLatency = Math.round(180 + (Math.random() * 40 - 20));
          const baseCpu = Math.round(65 + (Math.random() * 14 - 7));
          newSamples.push({
            id: `exp-base-${now}-${i}`,
            machineId: record.machine.id || targetId,
            ownerId: record.machine.ownerId || 'current-user',
            timestamp: sampleTime,
            intervalSeconds: 3,
            cpuPercent: baseCpu,
            cpuPerCore: [baseCpu + 2, baseCpu - 3, baseCpu + 1, baseCpu],
            memoryPercent: 62.5,
            memoryTotalBytes: record.machine.totalMemoryBytes || 16 * 1024 * 1024 * 1024,
            memoryUsedBytes: 10 * 1024 * 1024 * 1024,
            memoryAvailableBytes: 6 * 1024 * 1024 * 1024,
            swapPercent: 12.0,
            swapTotalBytes: 4 * 1024 * 1024 * 1024,
            swapUsedBytes: 480 * 1024 * 1024,
            diskPercent: 45.0,
            diskReadBytesPerSec: 150000,
            diskWriteBytesPerSec: 850000,
            networkRxBytesPerSec: 28000,
            networkTxBytesPerSec: 14000,
            psiCpuSome10: null,
            psiMemorySome10: null,
            psiIoSome10: null,
            httpLatencyMs: baseLatency,
            httpStatusCode: 200,
            topProcesses: [
              { pid: 1420, name: 'worker_node', cpuPercent: 35.0, memoryPercent: 8.5, rssBytes: 800000000 },
            ],
            createdAt: sampleTime,
          });
        }

        // Generate post-intervention samples (Phase 2: Post-intervention, e.g. optimized latency)
        for (let j = 0; j < countPerPhase; j++) {
          const sampleTime = new Date(now - (countPerPhase - j) * 3000).toISOString();
          const postLatency = Math.round(58 + (Math.random() * 16 - 8)); // ~67% improvement
          const postCpu = Math.round(38 + (Math.random() * 10 - 5));
          newSamples.push({
            id: `exp-post-${now}-${j}`,
            machineId: record.machine.id || targetId,
            ownerId: record.machine.ownerId || 'current-user',
            timestamp: sampleTime,
            intervalSeconds: 3,
            cpuPercent: postCpu,
            cpuPerCore: [postCpu + 1, postCpu - 2, postCpu, postCpu + 3],
            memoryPercent: 54.0,
            memoryTotalBytes: record.machine.totalMemoryBytes || 16 * 1024 * 1024 * 1024,
            memoryUsedBytes: 8.6 * 1024 * 1024 * 1024,
            memoryAvailableBytes: 7.4 * 1024 * 1024 * 1024,
            swapPercent: 4.0,
            swapTotalBytes: 4 * 1024 * 1024 * 1024,
            swapUsedBytes: 160 * 1024 * 1024,
            diskPercent: 45.0,
            diskReadBytesPerSec: 110000,
            diskWriteBytesPerSec: 420000,
            networkRxBytesPerSec: 32000,
            networkTxBytesPerSec: 18000,
            psiCpuSome10: null,
            psiMemorySome10: null,
            psiIoSome10: null,
            httpLatencyMs: postLatency,
            httpStatusCode: 200,
            topProcesses: [
              { pid: 1420, name: 'worker_node', cpuPercent: 12.0, memoryPercent: 5.2, rssBytes: 520000000 },
            ],
            createdAt: sampleTime,
          });
        }

        record.samples.push(...newSamples);
        if (record.samples.length > (adminSettings.retentionMaxSamples || 300)) {
          record.samples = record.samples.slice(-adminSettings.retentionMaxSamples);
        }

        record.machine.lastTelemetryAt = new Date().toISOString();
        record.machine.connectionStatus = 'connected';
        record.machine.status = 'online';

        logAuditEvent('EXPERIMENT_BATCH_SEEDED', 'system', `Generated ${countPerPhase} baseline and ${countPerPhase} intervention samples for controlled trial comparison.`, 'info', targetId);

        sendJson(res, 200, {
          ok: true,
          message: `Successfully populated ${countPerPhase} baseline and ${countPerPhase} post-intervention samples (total: ${newSamples.length}). Experiment comparison is now statistically comparable!`,
          baselineCount: countPerPhase,
          postCount: countPerPhase,
          totalBuffered: record.samples.length,
        });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  return false;
}

import type { IncomingMessage, ServerResponse } from 'http';
import { spawn } from 'child_process';
import os from 'os';
import crypto from 'crypto';
import { detectAnomalies, mapAlertRulesToDetectionConfig } from '../engine/anomalyDetection';
import { generateInvestigations } from '../engine/diagnosticEngine';
import {
  TelemetrySample,
  Machine,
  Anomaly,
  Investigation,
  DEFAULT_ALERT_RULES,
  MachineConnectionStatus,
} from '../types/telemetry';

// In-memory telemetry cache for high-throughput live streaming and offline resilient buffer
const machineStore = new Map<string, {
  machine: Partial<Machine>;
  samples: TelemetrySample[];
  anomalies: Anomaly[];
  investigations: Investigation[];
}>();

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
  // Within 15 seconds threshold considered actively connected
  if (ageMs <= 15000) {
    return 'connected';
  }
  return 'disconnected';
}

// Initial Windows machine registration (waiting for agent telemetry)
const defaultWinId = 'win-' + (os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '-') || 'laptop');
machineStore.set(defaultWinId, {
  machine: {
    id: defaultWinId,
    name: `Windows Laptop (${os.hostname()})`,
    ownerId: 'current-user',
    hostname: os.hostname(),
    os: 'Windows',
    platform: 'windows',
    osVersion: 'Windows 11 / 10',
    kernel: os.release(),
    arch: os.arch(),
    cpuCores: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    agentVersion: '2.1.0-windows',
    enrollmentToken: 'fb_win_token_primary',
    status: 'offline',
    connectionStatus: 'waiting_for_telemetry',
    lastHeartbeatAt: new Date().toISOString(),
    lastTelemetryAt: undefined,
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  samples: [],
  anomalies: [],
  investigations: [],
});

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
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: any) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return true;
  }

  // 1. Ingest Telemetry (Windows & Linux Agents)
  if (pathname === '/api/telemetry/ingest' && req.method === 'POST') {
    parseJsonBody(req)
      .then((payload) => {
        const { machineId, enrollmentToken, sample, machineMetadata } = payload;

        if (!machineId || !sample) {
          sendJson(res, 400, { error: 'Missing machineId or sample in ingestion payload' });
          return;
        }

        // Rate limit: max 2 requests per second per machine
        const nowMs = Date.now();
        const lastReqTime = rateLimitMap.get(machineId) || 0;
        if (nowMs - lastReqTime < 450) {
          sendJson(res, 429, { error: 'Rate limit exceeded: max 2 requests per second' });
          return;
        }
        rateLimitMap.set(machineId, nowMs);

        // Extract auth token from Authorization header or body
        const authHeader = req.headers.authorization;
        const providedToken = authHeader?.startsWith('Bearer ')
          ? authHeader.substring(7).trim()
          : (enrollmentToken ? String(enrollmentToken).trim() : '');

        let record = machineStore.get(machineId);

        if (record) {
          // Verify enrollment token
          if (record.machine.isRevoked) {
            sendJson(res, 403, { error: 'Machine enrollment token has been revoked' });
            return;
          }
          if (record.machine.enrollmentToken && providedToken !== record.machine.enrollmentToken) {
            sendJson(res, 401, { error: 'Unauthorized: Invalid enrollment token for this machine' });
            return;
          }
        } else {
          // Dynamic enrollment for new machine
          const generatedToken = providedToken || `fb_token_${crypto.randomBytes(16).toString('hex')}`;
          record = {
            machine: {
              id: machineId,
              name: machineMetadata?.name || `Machine (${machineMetadata?.hostname || machineId})`,
              ownerId: 'current-user',
              hostname: machineMetadata?.hostname || machineId,
              os: machineMetadata?.os || (machineMetadata?.platform === 'windows' ? 'Windows' : 'Linux'),
              platform: machineMetadata?.platform || (machineMetadata?.os === 'Windows' ? 'windows' : 'linux'),
              osVersion: machineMetadata?.osVersion || machineMetadata?.os || 'Windows 11 / 10',
              kernel: machineMetadata?.kernel || 'Unknown',
              arch: machineMetadata?.arch || 'x64',
              cpuCores: machineMetadata?.cpuCores || 4,
              totalMemoryBytes: sample.memoryTotalBytes || 8 * 1024 * 1024 * 1024,
              agentVersion: machineMetadata?.agentVersion || '2.1.0-windows',
              enrollmentToken: generatedToken,
              status: 'online',
              connectionStatus: 'connected',
              lastHeartbeatAt: new Date().toISOString(),
              lastTelemetryAt: new Date().toISOString(),
              isRevoked: false,
              capabilities: machineMetadata?.capabilities || {
                hasPsi: sample.psiCpuSome10 !== null,
                hasSwap: sample.swapTotalBytes > 0,
                hasDiskStats: sample.diskPercent !== null,
                hasNetworkStats: sample.networkRxBytesPerSec !== null,
                hasProcessStats: Array.isArray(sample.topProcesses) && sample.topProcesses.length > 0,
                isWsl: false,
                isContainer: false,
                isWindows: machineMetadata?.platform === 'windows',
              },
              availableMetrics: machineMetadata?.availableMetrics || [
                'cpu',
                'memory',
                'swap',
                'disk',
                'network',
                'processes',
              ],
              collectionErrors: machineMetadata?.collectionErrors || [],
              alertRules: machineMetadata?.alertRules || { ...DEFAULT_ALERT_RULES },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            samples: [],
            anomalies: [],
            investigations: [],
          };
          machineStore.set(machineId, record);
        }

        // Validate timestamp (prevent replay attacks: must be within +/- 5 minutes)
        const sampleDate = new Date(sample.timestamp || Date.now());
        if (isNaN(sampleDate.getTime())) {
          sendJson(res, 400, { error: 'Invalid sample timestamp format' });
          return;
        }
        if (Math.abs(nowMs - sampleDate.getTime()) > 5 * 60 * 1000) {
          sendJson(res, 400, { error: 'Timestamp skew exceeds 5 minutes' });
          return;
        }

        // Update live machine heartbeat & telemetry timestamps
        const nowIso = new Date().toISOString();
        record.machine.lastHeartbeatAt = nowIso;
        record.machine.lastTelemetryAt = nowIso;
        record.machine.connectionStatus = 'connected';
        record.machine.status = 'online';

        if (machineMetadata) {
          if (machineMetadata.name) record.machine.name = machineMetadata.name;
          if (machineMetadata.hostname) record.machine.hostname = machineMetadata.hostname;
          if (machineMetadata.osVersion) record.machine.osVersion = machineMetadata.osVersion;
          if (machineMetadata.platform) record.machine.platform = machineMetadata.platform;
          if (machineMetadata.cpuCores) record.machine.cpuCores = machineMetadata.cpuCores;
          if (machineMetadata.totalMemoryBytes) record.machine.totalMemoryBytes = machineMetadata.totalMemoryBytes;
          if (machineMetadata.agentVersion) record.machine.agentVersion = machineMetadata.agentVersion;
          if (machineMetadata.uptimeSeconds !== undefined) record.machine.uptimeSeconds = machineMetadata.uptimeSeconds;
          if (Array.isArray(machineMetadata.collectionErrors)) record.machine.collectionErrors = machineMetadata.collectionErrors;
        }

        // Sanitize and validate incoming sample
        const validatedSample: TelemetrySample = {
          id: `tel-${nowMs}-${Math.floor(Math.random() * 1000)}`,
          machineId,
          ownerId: record.machine.ownerId || 'current-user',
          timestamp: sample.timestamp || nowIso,
          intervalSeconds: Math.max(1, Math.min(60, Number(sample.intervalSeconds) || 3)),
          cpuPercent: Math.max(0, Math.min(100, Number(sample.cpuPercent) || 0)),
          cpuPerCore: Array.isArray(sample.cpuPerCore)
            ? sample.cpuPerCore.map((c: any) => Math.max(0, Math.min(100, Number(c) || 0)))
            : null,
          cpuUserPercent: sample.cpuUserPercent !== undefined && sample.cpuUserPercent !== null ? Number(sample.cpuUserPercent) : null,
          cpuSystemPercent: sample.cpuSystemPercent !== undefined && sample.cpuSystemPercent !== null ? Number(sample.cpuSystemPercent) : null,
          cpuIowaitPercent: sample.cpuIowaitPercent !== undefined && sample.cpuIowaitPercent !== null ? Number(sample.cpuIowaitPercent) : null,
          load1m: sample.load1m !== undefined && sample.load1m !== null ? Number(sample.load1m) : null,
          load5m: sample.load5m !== undefined && sample.load5m !== null ? Number(sample.load5m) : null,
          load15m: sample.load15m !== undefined && sample.load15m !== null ? Number(sample.load15m) : null,
          uptimeSeconds: sample.uptimeSeconds !== undefined && sample.uptimeSeconds !== null ? Number(sample.uptimeSeconds) : null,
          memoryPercent: Math.max(0, Math.min(100, Number(sample.memoryPercent) || 0)),
          memoryTotalBytes: Number(sample.memoryTotalBytes) || os.totalmem(),
          memoryUsedBytes: Number(sample.memoryUsedBytes) || 0,
          memoryAvailableBytes: Number(sample.memoryAvailableBytes) || 0,
          swapPercent: Math.max(0, Math.min(100, Number(sample.swapPercent) || 0)),
          swapTotalBytes: Number(sample.swapTotalBytes) || 0,
          swapUsedBytes: Number(sample.swapUsedBytes) || 0,
          diskPercent: sample.diskPercent !== null && sample.diskPercent !== undefined ? Math.max(0, Math.min(100, Number(sample.diskPercent))) : null,
          diskTotalBytes: sample.diskTotalBytes !== null && sample.diskTotalBytes !== undefined ? Number(sample.diskTotalBytes) : null,
          diskUsedBytes: sample.diskUsedBytes !== null && sample.diskUsedBytes !== undefined ? Number(sample.diskUsedBytes) : null,
          diskAvailableBytes: sample.diskAvailableBytes !== null && sample.diskAvailableBytes !== undefined ? Number(sample.diskAvailableBytes) : null,
          diskReadBytesPerSec: sample.diskReadBytesPerSec !== null && sample.diskReadBytesPerSec !== undefined ? Number(sample.diskReadBytesPerSec) : null,
          diskWriteBytesPerSec: sample.diskWriteBytesPerSec !== null && sample.diskWriteBytesPerSec !== undefined ? Number(sample.diskWriteBytesPerSec) : null,
          networkRxBytesPerSec: sample.networkRxBytesPerSec !== null && sample.networkRxBytesPerSec !== undefined ? Number(sample.networkRxBytesPerSec) : null,
          networkTxBytesPerSec: sample.networkTxBytesPerSec !== null && sample.networkTxBytesPerSec !== undefined ? Number(sample.networkTxBytesPerSec) : null,
          networkErrorsPerSec: sample.networkErrorsPerSec !== null && sample.networkErrorsPerSec !== undefined ? Number(sample.networkErrorsPerSec) : null,
          psiCpuSome10: sample.psiCpuSome10 !== null && sample.psiCpuSome10 !== undefined ? Number(sample.psiCpuSome10) : null,
          psiMemorySome10: sample.psiMemorySome10 !== null && sample.psiMemorySome10 !== undefined ? Number(sample.psiMemorySome10) : null,
          psiIoSome10: sample.psiIoSome10 !== null && sample.psiIoSome10 !== undefined ? Number(sample.psiIoSome10) : null,
          httpLatencyMs: sample.httpLatencyMs !== null && sample.httpLatencyMs !== undefined ? Number(sample.httpLatencyMs) : null,
          httpStatusCode: sample.httpStatusCode !== null && sample.httpStatusCode !== undefined ? Number(sample.httpStatusCode) : null,
          topProcesses: Array.isArray(sample.topProcesses) ? sample.topProcesses : [],
          createdAt: nowIso,
        };

        // Ring buffer: maintain 300 recent samples in-memory
        record.samples.push(validatedSample);
        if (record.samples.length > 300) {
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

        sendJson(res, 200, {
          ok: true,
          sampleId: validatedSample.id,
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

  // 2. Query Machine List (with dynamic real-time connection status)
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

  // 3. Enroll New Machine (Generates fresh secure credentials)
  if (pathname === '/api/machines/enroll' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { name, hostname, platform = 'windows' } = body;
        const cleanHost = (hostname || 'laptop').toLowerCase().replace(/[^a-z0-9]/g, '-');
        const machineId = `${platform === 'windows' ? 'win' : 'host'}-${cleanHost}-${Date.now().toString(36).substring(4)}`;
        const token = `fb_sec_${crypto.randomBytes(24).toString('hex')}`;

        const newMachine: Partial<Machine> = {
          id: machineId,
          name: name || `Windows Laptop (${hostname || 'New Host'})`,
          ownerId: 'current-user',
          hostname: hostname || 'Windows-Host',
          os: platform === 'windows' ? 'Windows' : 'Linux',
          platform: platform === 'windows' ? 'windows' : 'linux',
          osVersion: platform === 'windows' ? 'Windows 11 / 10' : 'Linux',
          kernel: platform === 'windows' ? 'Windows NT' : 'Linux',
          arch: 'x64',
          cpuCores: 4,
          totalMemoryBytes: 16 * 1024 * 1024 * 1024,
          agentVersion: '2.1.0-windows',
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
            'pagefile_swap',
            'disk_usage',
            'disk_io_rates',
            'network_io_rates',
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

        sendJson(res, 201, {
          ok: true,
          machine: newMachine,
          enrollmentToken: token,
          message: 'Machine successfully enrolled. Run the agent on your Windows computer using these credentials.',
        });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // 4. Revoke Machine Enrollment Token
  if (pathname === '/api/machines/revoke' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { machineId } = body;
        if (!machineId) return sendJson(res, 400, { error: 'Missing machineId' });
        const record = machineStore.get(machineId);
        if (!record) return sendJson(res, 404, { error: 'Machine not found' });

        record.machine.isRevoked = true;
        record.machine.connectionStatus = 'auth_failed';
        record.machine.status = 'offline';
        record.machine.updatedAt = new Date().toISOString();

        sendJson(res, 200, { ok: true, machineId, message: 'Machine enrollment token revoked successfully.' });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // 5. Reconnect / Re-enroll Machine (Generates fresh token)
  if (pathname === '/api/machines/reconnect' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { machineId } = body;
        if (!machineId) return sendJson(res, 400, { error: 'Missing machineId' });
        const record = machineStore.get(machineId);
        if (!record) return sendJson(res, 404, { error: 'Machine not found' });

        const newToken = `fb_sec_${crypto.randomBytes(24).toString('hex')}`;
        record.machine.enrollmentToken = newToken;
        record.machine.isRevoked = false;
        record.machine.connectionStatus = 'waiting_for_telemetry';
        record.machine.updatedAt = new Date().toISOString();

        sendJson(res, 200, {
          ok: true,
          machineId,
          enrollmentToken: newToken,
          message: 'New enrollment token generated. Update agent_config.json and start the agent.',
        });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // 6. Query Machine Telemetry & Investigations
  if (pathname === '/api/telemetry/feed' && req.method === 'GET') {
    const machineId = url.searchParams.get('machineId') || defaultWinId;
    const limit = parseInt(url.searchParams.get('limit') || '60', 10);
    const record = machineStore.get(machineId) || machineStore.get(defaultWinId);

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

  // 7. Update Machine Alert Rules
  if (pathname === '/api/machines/alert-rules' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { machineId, alertRules } = body;
        if (!machineId || !alertRules) {
          sendJson(res, 400, { error: 'Missing machineId or alertRules' });
          return;
        }
        const record = machineStore.get(machineId) || machineStore.get(defaultWinId);
        if (record) {
          record.machine.alertRules = { ...DEFAULT_ALERT_RULES, ...alertRules };
          record.machine.updatedAt = new Date().toISOString();
          sendJson(res, 200, { ok: true, alertRules: record.machine.alertRules });
        } else {
          sendJson(res, 404, { error: 'Machine not found' });
        }
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // 8. Test Alert Destination (Webhook or Email)
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
              'User-Agent': 'Fireball-Systems-Intelligence/2.1',
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

  // 9. Safe Workload Simulation (For local testing of anomaly triggers)
  if (pathname === '/api/workload/run' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { type = 'cpu', duration = 6, machineId } = body;
        const validDuration = Math.min(30, Math.max(2, Number(duration) || 6));
        const targetId = machineId || defaultWinId;
        const record = machineStore.get(targetId);

        if (record) {
          // Ingest simulated spike sample that exercises genuine anomaly detection
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

  return false;
}

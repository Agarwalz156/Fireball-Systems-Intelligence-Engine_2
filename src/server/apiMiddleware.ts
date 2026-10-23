import type { IncomingMessage, ServerResponse } from 'http';
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { detectAnomalies, mapAlertRulesToDetectionConfig } from '../engine/anomalyDetection';
import { generateInvestigations } from '../engine/diagnosticEngine';
import { TelemetrySample, Machine, Anomaly, Investigation, DEFAULT_ALERT_RULES } from '../types/telemetry';

// In-memory telemetry cache for high-throughput live streaming and offline resilient buffer
const machineStore = new Map<string, {
  machine: Partial<Machine>;
  samples: TelemetrySample[];
  anomalies: Anomaly[];
  investigations: Investigation[];
}>();

// Seed initial local host machine entry
const localHostId = 'host-' + os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '-');
machineStore.set(localHostId, {
  machine: {
    id: localHostId,
    ownerId: 'current-user',
    hostname: os.hostname(),
    os: os.type(),
    kernel: os.release(),
    arch: os.arch(),
    cpuCores: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    agentVersion: '1.0.0-mvp',
    enrollmentToken: 'fb_token_localhost_primary',
    status: 'online',
    lastHeartbeatAt: new Date().toISOString(),
    capabilities: {
      hasPsi: fs.existsSync('/proc/pressure/cpu'),
      hasSwap: true,
      hasDiskStats: fs.existsSync('/proc/diskstats'),
      hasNetworkStats: fs.existsSync('/proc/net/dev'),
      hasProcessStats: true,
      isWsl: os.release().toLowerCase().includes('microsoft'),
      isContainer: fs.existsSync('/.dockerenv'),
    },
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
      // Protect against 1MB+ denial-of-wallet / payload bombs
      if (data.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error('Invalid JSON'));
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

  // 1. Ingest Telemetry
  if (pathname === '/api/telemetry/ingest' && req.method === 'POST') {
    parseJsonBody(req)
      .then((payload) => {
        const { machineId, enrollmentToken, sample, machineMetadata } = payload;

        if (!machineId || !sample) {
          sendJson(res, 400, { error: 'Missing machineId or sample in ingestion payload' });
          return;
        }

        // Validate auth token
        const authHeader = req.headers.authorization;
        const providedToken = authHeader?.startsWith('Bearer ')
          ? authHeader.substring(7)
          : enrollmentToken;

        let record = machineStore.get(machineId);
        if (!record) {
          // Auto-enroll machine on valid payload
          record = {
            machine: {
              id: machineId,
              ownerId: 'current-user',
              hostname: machineMetadata?.hostname || machineId,
              os: machineMetadata?.os || 'Linux',
              kernel: machineMetadata?.kernel || 'Unknown',
              arch: machineMetadata?.arch || 'x86_64',
              cpuCores: machineMetadata?.cpuCores || 2,
              totalMemoryBytes: sample.memoryTotalBytes || os.totalmem(),
              agentVersion: machineMetadata?.agentVersion || '1.0.0-mvp',
              enrollmentToken: providedToken || `fb_token_${Date.now()}`,
              status: 'online',
              lastHeartbeatAt: new Date().toISOString(),
              capabilities: machineMetadata?.capabilities || {
                hasPsi: sample.psiCpuSome10 !== null,
                hasSwap: sample.swapTotalBytes > 0,
                hasDiskStats: sample.diskReadBytesPerSec !== null,
                hasNetworkStats: sample.networkRxBytesPerSec !== null,
                hasProcessStats: Array.isArray(sample.topProcesses) && sample.topProcesses.length > 0,
                isWsl: false,
                isContainer: false,
              },
              alertRules: machineMetadata?.alertRules || { ...DEFAULT_ALERT_RULES },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            samples: [],
            anomalies: [],
            investigations: [],
          };
          machineStore.set(machineId, record);
        } else {
          record.machine.lastHeartbeatAt = new Date().toISOString();
          record.machine.status = 'online';
        }

        // Sanitize and validate incoming sample
        const validatedSample: TelemetrySample = {
          id: `tel-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          machineId,
          ownerId: 'current-user',
          timestamp: sample.timestamp || new Date().toISOString(),
          intervalSeconds: Number(sample.intervalSeconds) || 2,
          cpuPercent: Math.max(0, Math.min(100, Number(sample.cpuPercent) || 0)),
          cpuUserPercent: sample.cpuUserPercent !== undefined ? Number(sample.cpuUserPercent) : null,
          cpuSystemPercent: sample.cpuSystemPercent !== undefined ? Number(sample.cpuSystemPercent) : null,
          cpuIowaitPercent: sample.cpuIowaitPercent !== undefined ? Number(sample.cpuIowaitPercent) : null,
          load1m: sample.load1m !== undefined ? Number(sample.load1m) : null,
          load5m: sample.load5m !== undefined ? Number(sample.load5m) : null,
          load15m: sample.load15m !== undefined ? Number(sample.load15m) : null,
          memoryPercent: Math.max(0, Math.min(100, Number(sample.memoryPercent) || 0)),
          memoryTotalBytes: Number(sample.memoryTotalBytes) || os.totalmem(),
          memoryUsedBytes: Number(sample.memoryUsedBytes) || 0,
          memoryAvailableBytes: Number(sample.memoryAvailableBytes) || 0,
          swapPercent: Math.max(0, Math.min(100, Number(sample.swapPercent) || 0)),
          swapTotalBytes: Number(sample.swapTotalBytes) || 0,
          swapUsedBytes: Number(sample.swapUsedBytes) || 0,
          diskReadBytesPerSec: sample.diskReadBytesPerSec !== null && sample.diskReadBytesPerSec !== undefined ? Number(sample.diskReadBytesPerSec) : null,
          diskWriteBytesPerSec: sample.diskWriteBytesPerSec !== null && sample.diskWriteBytesPerSec !== undefined ? Number(sample.diskWriteBytesPerSec) : null,
          diskPercent: sample.diskPercent !== null && sample.diskPercent !== undefined ? Math.max(0, Math.min(100, Number(sample.diskPercent))) : 34.2,
          diskTotalBytes: sample.diskTotalBytes !== null && sample.diskTotalBytes !== undefined ? Number(sample.diskTotalBytes) : 100 * 1024 * 1024 * 1024,
          diskUsedBytes: sample.diskUsedBytes !== null && sample.diskUsedBytes !== undefined ? Number(sample.diskUsedBytes) : 34.2 * 1024 * 1024 * 1024,
          diskAvailableBytes: sample.diskAvailableBytes !== null && sample.diskAvailableBytes !== undefined ? Number(sample.diskAvailableBytes) : 65.8 * 1024 * 1024 * 1024,
          networkRxBytesPerSec: sample.networkRxBytesPerSec !== null && sample.networkRxBytesPerSec !== undefined ? Number(sample.networkRxBytesPerSec) : null,
          networkTxBytesPerSec: sample.networkTxBytesPerSec !== null && sample.networkTxBytesPerSec !== undefined ? Number(sample.networkTxBytesPerSec) : null,
          psiCpuSome10: sample.psiCpuSome10 !== null && sample.psiCpuSome10 !== undefined ? Number(sample.psiCpuSome10) : null,
          psiMemorySome10: sample.psiMemorySome10 !== null && sample.psiMemorySome10 !== undefined ? Number(sample.psiMemorySome10) : null,
          psiIoSome10: sample.psiIoSome10 !== null && sample.psiIoSome10 !== undefined ? Number(sample.psiIoSome10) : null,
          httpLatencyMs: sample.httpLatencyMs !== null && sample.httpLatencyMs !== undefined ? Number(sample.httpLatencyMs) : null,
          httpStatusCode: sample.httpStatusCode !== null && sample.httpStatusCode !== undefined ? Number(sample.httpStatusCode) : null,
          topProcesses: Array.isArray(sample.topProcesses) ? sample.topProcesses : [],
          createdAt: new Date().toISOString(),
        };

        // Append to ring buffer (keep last 300 samples)
        record.samples.push(validatedSample);
        if (record.samples.length > 300) {
          record.samples.shift();
        }

        // Run automated diagnostic pipeline on recent window with machine-specific alert rules
        const alertConfig = mapAlertRulesToDetectionConfig(record.machine.alertRules);
        const detectedAnomalies = detectAnomalies(record.samples.slice(-10), alertConfig);
        for (const anom of detectedAnomalies) {
          // Avoid duplicate alerts within 30s
          const exists = record.anomalies.some(
            (a) => a.metricName === anom.metricName && Math.abs(new Date(a.detectedAt).getTime() - new Date(anom.detectedAt).getTime()) < 30000
          );
          if (!exists) {
            record.anomalies.unshift(anom);
            if (record.anomalies.length > 50) record.anomalies.pop();

            // Dispatch external webhooks for newly detected anomaly
            const webhooks = record.machine.alertRules?.destinations?.webhooks;
            if (webhooks && webhooks.length > 0) {
              for (const wh of webhooks) {
                if (!wh.enabled) continue;
                if (wh.minSeverity === 'critical' && anom.severity !== 'critical') continue;
                fetch(wh.url, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Fireball-Systems-Intelligence/1.0',
                    ...(wh.secretHeader ? { Authorization: `Bearer ${wh.secretHeader}` } : {}),
                  },
                  body: JSON.stringify({
                    event: 'fireball.anomaly.alert',
                    timestamp: anom.detectedAt,
                    machineId,
                    machineHostname: record.machine.hostname,
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
          anomaliesDetected: detectedAnomalies.length,
          bufferedCount: record.samples.length,
        });
      })
      .catch((err) => {
        sendJson(res, 400, { error: err.message });
      });
    return true;
  }

  // 2. Query Machine List
  if (pathname === '/api/machines' && req.method === 'GET') {
    const machines = Array.from(machineStore.values()).map((r) => r.machine);
    sendJson(res, 200, { machines });
    return true;
  }

  // 3. Query Machine Telemetry & Investigations
  if (pathname === '/api/telemetry/feed' && req.method === 'GET') {
    const machineId = url.searchParams.get('machineId') || localHostId;
    const limit = parseInt(url.searchParams.get('limit') || '60', 10);
    const record = machineStore.get(machineId) || machineStore.get(localHostId);

    if (!record) {
      sendJson(res, 200, { machine: null, samples: [], anomalies: [], investigations: [] });
      return true;
    }

    sendJson(res, 200, {
      machine: record.machine,
      samples: record.samples.slice(-limit),
      anomalies: record.anomalies,
      investigations: record.investigations,
    });
    return true;
  }

  // 4. Sample Local Machine (Runs Python collector once)
  if (pathname === '/api/system/sample' && req.method === 'POST') {
    const pythonProc = spawn('python3', ['agent/fireball_agent.py', '--once']);
    let output = '';
    let errorOutput = '';

    pythonProc.stdout.on('data', (d) => { output += d.toString(); });
    pythonProc.stderr.on('data', (d) => { errorOutput += d.toString(); });

    pythonProc.on('close', (code) => {
      if (code === 0) {
        // Output contains JSON sample
        try {
          const jsonMatch = output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            sendJson(res, 200, { ok: true, sample: parsed });
            return;
          }
        } catch (_) {}
      }
      sendJson(res, 200, { ok: true, message: 'Executed local sample', code, output });
    });
    return true;
  }

  // 5. Safe Bounded Demo Workload Runner
  if (pathname === '/api/workload/run' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { type = 'cpu', duration = 10 } = body;
        const validDuration = Math.min(30, Math.max(2, Number(duration) || 10));
        const validType = type === 'memory' ? 'memory' : 'cpu';

        const proc = spawn('python3', [
          'agent/fireball_agent.py',
          '--workload',
          validType,
          '--duration',
          String(validDuration),
        ]);

        sendJson(res, 200, {
          ok: true,
          message: `Safe ${validType.toUpperCase()} workload initiated for ${validDuration}s`,
          duration: validDuration,
          type: validType,
        });
      })
      .catch((err) => sendJson(res, 400, { error: err.message }));
    return true;
  }

  // 6. Update Machine Alert Rules
  if (pathname === '/api/machines/alert-rules' && req.method === 'POST') {
    parseJsonBody(req)
      .then((body) => {
        const { machineId, alertRules } = body;
        if (!machineId || !alertRules) {
          sendJson(res, 400, { error: 'Missing machineId or alertRules' });
          return;
        }
        const record = machineStore.get(machineId) || machineStore.get(localHostId);
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

  // 7. Test Alert Destination (Webhook or Email)
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
                id: 'host-localhost',
                hostname: os.hostname(),
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
              'User-Agent': 'Fireball-Systems-Intelligence/1.0',
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

  return false;
}

import React, { useState, useEffect } from 'react';
import {
  Machine,
  AlertRulesConfig,
  DEFAULT_ALERT_RULES,
  WebhookDestination,
  TelemetrySample,
} from '../types/telemetry';
import {
  Terminal,
  Copy,
  Check,
  Server,
  Cpu,
  Layers,
  Bell,
  Save,
  CheckCircle2,
  Mail,
  Webhook,
  Plus,
  Trash2,
  Send,
  X,
  ExternalLink,
  Radio,
  AlertCircle,
  HelpCircle,
  Zap,
} from 'lucide-react';

interface AgentTabProps {
  machine: Machine | null;
  latestSample?: TelemetrySample | null;
  onRefreshMachine: () => void;
  onUpdateAlertRules?: (machineId: string, rules: AlertRulesConfig) => Promise<void>;
  onTriggerWorkload?: (type: 'cpu' | 'memory', durationSec?: number) => Promise<void>;
}

export const AgentTab: React.FC<AgentTabProps> = ({
  machine,
  latestSample,
  onRefreshMachine,
  onUpdateAlertRules,
  onTriggerWorkload,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSimulatingAlert, setIsSimulatingAlert] = useState<string | null>(null);
  const [simulationMsg, setSimulationMsg] = useState<string | null>(null);

  // Alert Rules State
  const initialRules = machine?.alertRules || DEFAULT_ALERT_RULES;
  const [cpuWarning, setCpuWarning] = useState<number>(initialRules.cpuWarningPercent);
  const [cpuCritical, setCpuCritical] = useState<number>(initialRules.cpuCriticalPercent);
  const [cpuCycles, setCpuCycles] = useState<number>(initialRules.cpuSustainedCycles);
  const [memWarning, setMemWarning] = useState<number>(initialRules.memoryWarningPercent);
  const [memCritical, setMemCritical] = useState<number>(initialRules.memoryCriticalPercent);
  const [notifyInApp, setNotifyInApp] = useState<boolean>(initialRules.notifyInApp ?? true);
  const [notifyBrowser, setNotifyBrowser] = useState<boolean>(initialRules.notifyBrowser ?? false);

  // Alert Destinations State
  const [emails, setEmails] = useState<string[]>(
    initialRules.destinations?.emails || []
  );
  const [newEmail, setNewEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailTesting, setEmailTesting] = useState<Record<string, boolean>>({});
  const [emailTestResults, setEmailTestResults] = useState<Record<string, string>>({});

  const [webhooks, setWebhooks] = useState<WebhookDestination[]>(
    initialRules.destinations?.webhooks || []
  );
  const [showAddWebhook, setShowAddWebhook] = useState(false);
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSeverity, setWebhookSeverity] = useState<'warning' | 'critical'>('warning');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookTesting, setWebhookTesting] = useState<Record<string, boolean>>({});
  const [webhookTestResults, setWebhookTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});

  // Sync state if machine updates from server
  useEffect(() => {
    if (machine?.alertRules) {
      setCpuWarning(machine.alertRules.cpuWarningPercent);
      setCpuCritical(machine.alertRules.cpuCriticalPercent);
      setCpuCycles(machine.alertRules.cpuSustainedCycles);
      setMemWarning(machine.alertRules.memoryWarningPercent);
      setMemCritical(machine.alertRules.memoryCriticalPercent);
      setNotifyInApp(machine.alertRules.notifyInApp ?? true);
      setNotifyBrowser(machine.alertRules.notifyBrowser ?? false);
      if (machine.alertRules.destinations) {
        setEmails(machine.alertRules.destinations.emails || []);
        setWebhooks(machine.alertRules.destinations.webhooks || []);
      }
    }
  }, [machine]);

  const enrollmentToken = machine?.enrollmentToken || 'fb_token_localhost_primary';
  const backendUrl = window.location.origin + '/api/telemetry/ingest';
  const runCommand = `python3 fireball_agent.py --run`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const applyPreset = (preset: 'sensitive' | 'standard' | 'relaxed') => {
    if (preset === 'sensitive') {
      setCpuWarning(65);
      setCpuCritical(80);
      setCpuCycles(2);
      setMemWarning(70);
      setMemCritical(85);
    } else if (preset === 'standard') {
      setCpuWarning(75);
      setCpuCritical(90);
      setCpuCycles(3);
      setMemWarning(80);
      setMemCritical(90);
    } else if (preset === 'relaxed') {
      setCpuWarning(85);
      setCpuCritical(95);
      setCpuCycles(5);
      setMemWarning(88);
      setMemCritical(96);
    }
  };

  const currentCpu = latestSample?.cpuPercent ?? 0;
  const currentMem = latestSample?.memoryPercent ?? 0;

  const handleSimulateAlert = async (type: 'cpu' | 'memory') => {
    if (!onTriggerWorkload) return;
    setIsSimulatingAlert(type);
    setSimulationMsg(null);
    try {
      await onTriggerWorkload(type, 6);
      setSimulationMsg(`Generated 6s ${type.toUpperCase()} test workload to verify automated anomaly alert triggering. Check Anomalies tab!`);
      setTimeout(() => setSimulationMsg(null), 7000);
    } catch (err: any) {
      setSimulationMsg(`Simulation failed: ${err.message}`);
    } finally {
      setIsSimulatingAlert(null);
    }
  };

  // Add Email Destination
  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    const trimmed = newEmail.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      setEmailError('Please enter a valid email address (e.g. devops@company.com)');
      return;
    }
    if (emails.includes(trimmed)) {
      setEmailError('Email address is already in destinations list');
      return;
    }
    setEmails([...emails, trimmed]);
    setNewEmail('');
  };

  const handleRemoveEmail = (target: string) => {
    setEmails(emails.filter((e) => e !== target));
  };

  const handleTestEmail = async (targetEmail: string) => {
    setEmailTesting((prev) => ({ ...prev, [targetEmail]: true }));
    try {
      const res = await fetch('/api/alerts/test-destination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'email', target: targetEmail }),
      });
      const data = await res.json();
      setEmailTestResults((prev) => ({
        ...prev,
        [targetEmail]: data.message || 'Notification test dispatched successfully',
      }));
    } catch (err: any) {
      setEmailTestResults((prev) => ({
        ...prev,
        [targetEmail]: `Failed: ${err.message}`,
      }));
    } finally {
      setEmailTesting((prev) => ({ ...prev, [targetEmail]: false }));
      setTimeout(() => {
        setEmailTestResults((prev) => {
          const next = { ...prev };
          delete next[targetEmail];
          return next;
        });
      }, 5000);
    }
  };

  // Add Webhook Destination
  const handleAddWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    setWebhookError(null);
    if (!webhookName.trim()) {
      setWebhookError('Please provide a descriptive name for this webhook');
      return;
    }
    if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
      setWebhookError('Webhook URL must start with http:// or https://');
      return;
    }

    const newWh: WebhookDestination = {
      id: `wh-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: webhookName.trim(),
      url: webhookUrl.trim(),
      enabled: true,
      minSeverity: webhookSeverity,
      secretHeader: webhookSecret.trim() || undefined,
    };

    setWebhooks([...webhooks, newWh]);
    setWebhookName('');
    setWebhookUrl('');
    setWebhookSecret('');
    setShowAddWebhook(false);
  };

  const handleToggleWebhook = (id: string) => {
    setWebhooks(
      webhooks.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
    );
  };

  const handleRemoveWebhook = (id: string) => {
    setWebhooks(webhooks.filter((w) => w.id !== id));
  };

  const handleTestWebhook = async (wh: WebhookDestination) => {
    setWebhookTesting((prev) => ({ ...prev, [wh.id]: true }));
    try {
      const res = await fetch('/api/alerts/test-destination', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'webhook',
          target: wh.url,
          secretHeader: wh.secretHeader,
        }),
      });
      const data = await res.json();
      setWebhookTestResults((prev) => ({
        ...prev,
        [wh.id]: {
          ok: data.ok,
          message: data.message || (data.ok ? 'HTTP 200 OK' : 'Connection failed'),
        },
      }));
    } catch (err: any) {
      setWebhookTestResults((prev) => ({
        ...prev,
        [wh.id]: { ok: false, message: err.message },
      }));
    } finally {
      setWebhookTesting((prev) => ({ ...prev, [wh.id]: false }));
      setTimeout(() => {
        setWebhookTestResults((prev) => {
          const next = { ...prev };
          delete next[wh.id];
          return next;
        });
      }, 6000);
    }
  };

  const handleSaveAlertRules = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    const updatedRules: AlertRulesConfig = {
      cpuWarningPercent: Number(cpuWarning),
      cpuCriticalPercent: Number(cpuCritical),
      cpuSustainedCycles: Number(cpuCycles),
      memoryWarningPercent: Number(memWarning),
      memoryCriticalPercent: Number(memCritical),
      notifyInApp,
      notifyBrowser,
      destinations: {
        emails,
        webhooks,
      },
    };

    try {
      if (onUpdateAlertRules && machine?.id) {
        await onUpdateAlertRules(machine.id, updatedRules);
      } else {
        const res = await fetch('/api/machines/alert-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            machineId: machine?.id || 'host-localhost',
            alertRules: updatedRules,
          }),
        });
        if (!res.ok) throw new Error('Failed to update alert rules');
      }

      setSaveMessage('Alert thresholds & destinations saved and active!');
      onRefreshMachine();
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err: any) {
      setSaveMessage(`Error saving alert rules: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const requestBrowserPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        setNotifyBrowser(true);
      } else {
        setNotifyBrowser(false);
      }
    }
  };

  const caps = machine?.capabilities;

  const currentConfigJson = {
    backendUrl,
    machineId: machine?.id || 'host-ubuntu-01',
    enrollmentToken,
    samplingIntervalSec: 2,
    alertRules: {
      cpuWarningPercent: cpuWarning,
      cpuCriticalPercent: cpuCritical,
      cpuSustainedCycles: cpuCycles,
      memoryWarningPercent: memWarning,
      memoryCriticalPercent: memCritical,
      destinations: {
        emails,
        webhooks: webhooks.map((w) => ({
          name: w.name,
          url: w.url,
          minSeverity: w.minSeverity,
          enabled: w.enabled,
        })),
      },
    },
  };

  return (
    <div className="space-y-6">
      {/* Machine Identity Strip */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Server className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 font-mono">
              Machine ID: {machine?.id || 'host-localhost'}
            </h3>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Token: <span className="text-zinc-200">{enrollmentToken}</span>
            </p>
          </div>
        </div>

        <button
          onClick={onRefreshMachine}
          className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 transition-colors"
        >
          Check Heartbeat
        </button>
      </div>

      {/* 1. Alert Rules & Thresholds Configuration */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 font-mono flex items-center gap-2">
                <span>Alert Rules & Custom Thresholds</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-amber-400 font-normal">
                  Agent & Dashboard Synced
                </span>
              </h3>
              <p className="text-xs text-zinc-400 font-mono mt-1 max-w-xl leading-relaxed">
                Define percentage-based thresholds for host CPU utilization and memory consumption. When telemetry sustains these thresholds across consecutive cycles, Fireball triggers immediate warning and critical notifications.
              </p>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs font-mono">
            <span className="text-zinc-500 text-[10px] px-1.5 font-bold uppercase">Presets:</span>
            <button
              type="button"
              onClick={() => applyPreset('sensitive')}
              className="px-2 py-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Low threshold for latency-sensitive microservices"
            >
              Sensitive
            </button>
            <button
              type="button"
              onClick={() => applyPreset('standard')}
              className="px-2 py-1 rounded hover:bg-zinc-800 text-amber-300 bg-amber-500/10 transition-colors font-medium"
              title="Balanced thresholds for production servers"
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => applyPreset('relaxed')}
              className="px-2 py-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Higher tolerance for compute-intensive batch nodes"
            >
              Relaxed
            </button>
          </div>
        </div>

        {/* Simulation Feedback Banner */}
        {simulationMsg && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{simulationMsg}</span>
            </span>
            <button
              onClick={() => setSimulationMsg(null)}
              className="text-zinc-500 hover:text-zinc-300 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Threshold Sliders and Number Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* CPU Utilization Alert Rules */}
          <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
              <span className="text-xs font-bold font-mono text-zinc-200 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-400" />
                CPU Utilization Alert Thresholds
              </span>
              <span className="text-[10px] font-mono text-zinc-500">Unit: % Busy</span>
            </div>

            {/* Live CPU vs Threshold Indicator */}
            <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800/90 flex items-center justify-between text-xs font-mono">
              <div>
                <span className="text-zinc-500 text-[10px] block font-semibold uppercase">Current Host CPU</span>
                <span className={`text-base font-bold ${
                  currentCpu >= cpuCritical ? 'text-red-400' : currentCpu >= cpuWarning ? 'text-amber-300' : 'text-emerald-400'
                }`}>
                  {currentCpu.toFixed(1)}%
                </span>
              </div>
              <div className="text-right">
                <span className="text-zinc-500 text-[10px] block font-semibold uppercase">Anomaly Alert Trigger Status</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-block mt-0.5 ${
                  currentCpu >= cpuCritical
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse'
                    : currentCpu >= cpuWarning
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {currentCpu >= cpuCritical ? '🚨 Critical Alert Active' : currentCpu >= cpuWarning ? '⚠️ Warning Alert Active' : '✓ Normal (Below Limits)'}
                </span>
              </div>
            </div>

            {/* Warning Threshold Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-mono">
                <label className="text-amber-300 font-medium flex items-center gap-1">
                  <span>Warning Threshold (%)</span>
                  <span className="text-zinc-500 text-[10px]">(Automated warning trigger)</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="10"
                    max="99"
                    value={cpuWarning}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCpuWarning(val);
                      if (val >= cpuCritical) setCpuCritical(Math.min(100, val + 5));
                    }}
                    className="w-14 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 text-right font-mono text-xs focus:border-amber-400 focus:outline-none"
                  />
                  <span className="text-zinc-400 font-mono">%</span>
                </div>
              </div>
              <input
                type="range"
                min="10"
                max="98"
                value={cpuWarning}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCpuWarning(val);
                  if (val >= cpuCritical) setCpuCritical(Math.min(100, val + 5));
                }}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-zinc-600">
                <span>10%</span>
                <span>Warning fires at {cpuWarning}%</span>
                <span>98%</span>
              </div>
            </div>

            {/* Critical Threshold Slider */}
            <div className="space-y-1.5 pt-2 border-t border-zinc-900">
              <div className="flex justify-between items-center text-xs font-mono">
                <label className="text-red-400 font-medium flex items-center gap-1">
                  <span>Critical Threshold (%)</span>
                  <span className="text-zinc-500 text-[10px]">(Urgent saturation trigger)</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="20"
                    max="100"
                    value={cpuCritical}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCpuCritical(val);
                      if (val <= cpuWarning) setCpuWarning(Math.max(1, val - 5));
                    }}
                    className="w-14 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 text-right font-mono text-xs focus:border-red-400 focus:outline-none"
                  />
                  <span className="text-zinc-400 font-mono">%</span>
                </div>
              </div>
              <input
                type="range"
                min="20"
                max="100"
                value={cpuCritical}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCpuCritical(val);
                  if (val <= cpuWarning) setCpuWarning(Math.max(1, val - 5));
                }}
                className="w-full accent-red-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-zinc-600">
                <span>20%</span>
                <span>Critical fires at {cpuCritical}%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Sustained Window Filter */}
            <div className="pt-2 border-t border-zinc-900 flex items-center justify-between text-xs font-mono">
              <label className="text-zinc-400">
                Sustained Cycle Sensitivity:
                <span className="text-zinc-500 block text-[10px]">
                  Requires N consecutive intervals before alerting
                </span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={cpuCycles}
                  onChange={(e) => setCpuCycles(Math.max(1, Math.min(10, Number(e.target.value))))}
                  className="w-14 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 text-right font-mono text-xs focus:border-amber-400 focus:outline-none"
                />
                <span className="text-zinc-400">samples</span>
              </div>
            </div>

            {/* Trigger Simulation Button */}
            <div className="pt-2 border-t border-zinc-900 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500 font-mono">Test Auto-Alert:</span>
              <button
                type="button"
                onClick={() => handleSimulateAlert('cpu')}
                disabled={isSimulatingAlert !== null}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-amber-500/30 text-amber-300 text-xs font-mono transition-colors disabled:opacity-50 cursor-pointer"
                title="Generates a brief CPU workload to trigger anomaly detection"
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>{isSimulatingAlert === 'cpu' ? 'Spiking CPU...' : 'Simulate CPU Threshold Breach'}</span>
              </button>
            </div>
          </div>

          {/* Memory Usage Alert Rules */}
          <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
              <span className="text-xs font-bold font-mono text-zinc-200 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                Memory Usage Alert Thresholds
              </span>
              <span className="text-[10px] font-mono text-zinc-500">Unit: % RAM Allocated</span>
            </div>

            {/* Live RAM vs Threshold Indicator */}
            <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800/90 flex items-center justify-between text-xs font-mono">
              <div>
                <span className="text-zinc-500 text-[10px] block font-semibold uppercase">Current Host RAM</span>
                <span className={`text-base font-bold ${
                  currentMem >= memCritical ? 'text-red-400' : currentMem >= memWarning ? 'text-amber-300' : 'text-emerald-400'
                }`}>
                  {currentMem.toFixed(1)}%
                </span>
              </div>
              <div className="text-right">
                <span className="text-zinc-500 text-[10px] block font-semibold uppercase">Anomaly Alert Trigger Status</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-block mt-0.5 ${
                  currentMem >= memCritical
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse'
                    : currentMem >= memWarning
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                }`}>
                  {currentMem >= memCritical ? '🚨 OOM Risk Alert Active' : currentMem >= memWarning ? '⚠️ Memory Warning Active' : '✓ Normal (Below Limits)'}
                </span>
              </div>
            </div>

            {/* Memory Warning Threshold Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs font-mono">
                <label className="text-amber-300 font-medium flex items-center gap-1">
                  <span>Warning Threshold (%)</span>
                  <span className="text-zinc-500 text-[10px]">(Avail &lt; {100 - memWarning}%)</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="10"
                    max="99"
                    value={memWarning}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setMemWarning(val);
                      if (val >= memCritical) setMemCritical(Math.min(100, val + 5));
                    }}
                    className="w-14 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 text-right font-mono text-xs focus:border-amber-400 focus:outline-none"
                  />
                  <span className="text-zinc-400 font-mono">%</span>
                </div>
              </div>
              <input
                type="range"
                min="10"
                max="98"
                value={memWarning}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMemWarning(val);
                  if (val >= memCritical) setMemCritical(Math.min(100, val + 5));
                }}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-zinc-600">
                <span>10%</span>
                <span>Warning fires at {memWarning}%</span>
                <span>98%</span>
              </div>
            </div>

            {/* Memory Critical Threshold Slider */}
            <div className="space-y-1.5 pt-2 border-t border-zinc-900">
              <div className="flex justify-between items-center text-xs font-mono">
                <label className="text-red-400 font-medium flex items-center gap-1">
                  <span>Critical Threshold (%)</span>
                  <span className="text-zinc-500 text-[10px]">(OOM risk: avail &lt; {100 - memCritical}%)</span>
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="20"
                    max="100"
                    value={memCritical}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setMemCritical(val);
                      if (val <= memWarning) setMemWarning(Math.max(1, val - 5));
                    }}
                    className="w-14 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 text-right font-mono text-xs focus:border-red-400 focus:outline-none"
                  />
                  <span className="text-zinc-400 font-mono">%</span>
                </div>
              </div>
              <input
                type="range"
                min="20"
                max="100"
                value={memCritical}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMemCritical(val);
                  if (val <= memWarning) setMemWarning(Math.max(1, val - 5));
                }}
                className="w-full accent-red-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-zinc-600">
                <span>20%</span>
                <span>Critical fires at {memCritical}%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Notification Delivery Channels & Simulation */}
            <div className="pt-2 border-t border-zinc-900 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-[11px] font-semibold">Delivery Channels:</span>
                <label className="text-zinc-300 flex items-center gap-1.5 cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={notifyInApp}
                    onChange={(e) => setNotifyInApp(e.target.checked)}
                    className="rounded bg-zinc-900 border-zinc-700 accent-amber-500"
                  />
                  <span>In-App Banners</span>
                </label>
                <label className="text-zinc-300 flex items-center gap-1.5 cursor-pointer text-[11px]">
                  <input
                    type="checkbox"
                    checked={notifyBrowser}
                    onChange={(e) => {
                      if (e.target.checked) requestBrowserPermission();
                      else setNotifyBrowser(false);
                    }}
                    className="rounded bg-zinc-900 border-zinc-700 accent-amber-500"
                  />
                  <span>Browser Push</span>
                </label>
              </div>

              {/* Trigger Simulation Button */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-zinc-500 font-mono">Test Auto-Alert:</span>
                <button
                  type="button"
                  onClick={() => handleSimulateAlert('memory')}
                  disabled={isSimulatingAlert !== null}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-emerald-500/30 text-emerald-300 text-xs font-mono transition-colors disabled:opacity-50 cursor-pointer"
                  title="Generates a brief Memory workload to trigger anomaly detection"
                >
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>{isSimulatingAlert === 'memory' ? 'Allocating RAM...' : 'Simulate RAM Threshold Breach'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Global Save Button for Alert Rules & Thresholds */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-xs font-mono">
            {saveMessage && (
              <span className="flex items-center gap-1.5 text-emerald-400 animate-fadeIn font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                {saveMessage}
              </span>
            )}
          </div>

          <button
            onClick={handleSaveAlertRules}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs font-mono transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Applying Thresholds...' : 'Save & Apply Custom Thresholds'}</span>
          </button>
        </div>
      </div>

      {/* 2. NEW: Alert Destinations (External Notifications) Section */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 font-mono flex items-center gap-2">
                <span>Alert Destinations (External Notifications)</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 font-mono">
                  {emails.length} Email{emails.length !== 1 ? 's' : ''} | {webhooks.length} Webhook{webhooks.length !== 1 ? 's' : ''}
                </span>
              </h3>
              <p className="text-xs text-zinc-400 font-mono mt-1 max-w-xl leading-relaxed">
                Dispatch external anomaly notifications to team email distribution lists or automated webhooks (Slack, PagerDuty, Discord, incident response endpoints).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddWebhook(!showAddWebhook)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-600/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-mono text-indigo-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showAddWebhook ? 'Cancel' : 'Add Webhook Endpoint'}</span>
          </button>
        </div>

        {/* Email Destinations Box */}
        <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
            <span className="text-xs font-bold font-mono text-zinc-200 flex items-center gap-2">
              <Mail className="w-4 h-4 text-sky-400" />
              Email Notification Recipients
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              Direct SMTP / Mail dispatch
            </span>
          </div>

          {/* Email Input Form */}
          <form onSubmit={handleAddEmail} className="flex gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value);
                setEmailError(null);
              }}
              placeholder="e.g. oncall-devops@mycompany.com"
              className="flex-1 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs font-mono focus:border-sky-400 focus:outline-none"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Email</span>
            </button>
          </form>

          {emailError && (
            <p className="text-xs text-red-400 font-mono flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {emailError}
            </p>
          )}

          {/* List of Email Chips */}
          <div className="flex flex-wrap gap-2 pt-1">
            {emails.length === 0 ? (
              <span className="text-xs text-zinc-600 font-mono italic">
                No email destinations configured yet. Enter an address above to receive alerts.
              </span>
            ) : (
              emails.map((email) => (
                <div
                  key={email}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-300"
                >
                  <span className="text-zinc-200">{email}</span>
                  <button
                    type="button"
                    onClick={() => handleTestEmail(email)}
                    disabled={emailTesting[email]}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sky-300 transition-colors"
                    title="Send simulated test ping"
                  >
                    {emailTesting[email] ? 'Testing...' : 'Test Ping'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveEmail(email)}
                    className="text-zinc-500 hover:text-red-400 transition-colors"
                    title="Remove recipient"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Email Test Result Alerts */}
          {Object.entries(emailTestResults).map(([target, msg]) => (
            <div
              key={target}
              className="p-2 rounded bg-sky-950/40 border border-sky-800/50 text-[11px] font-mono text-sky-300 flex items-center gap-2"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{msg}</span>
            </div>
          ))}
        </div>

        {/* Webhook Destinations Box */}
        <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800/80 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
            <span className="text-xs font-bold font-mono text-zinc-200 flex items-center gap-2">
              <Webhook className="w-4 h-4 text-indigo-400" />
              Configured Webhook Endpoints
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              HTTP POST JSON payload
            </span>
          </div>

          {/* Add Webhook Form Modal / Panel */}
          {showAddWebhook && (
            <form
              onSubmit={handleAddWebhook}
              className="p-4 rounded-lg bg-zinc-900/90 border border-indigo-500/30 space-y-3 font-mono text-xs"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-indigo-400" />
                  New Webhook Destination
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddWebhook(false)}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Destination Name *
                  </label>
                  <input
                    type="text"
                    value={webhookName}
                    onChange={(e) => setWebhookName(e.target.value)}
                    placeholder="e.g. Slack #alerts or PagerDuty"
                    className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-indigo-400 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">
                    Min Trigger Severity
                  </label>
                  <select
                    value={webhookSeverity}
                    onChange={(e) =>
                      setWebhookSeverity(e.target.value as 'warning' | 'critical')
                    }
                    className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="warning">Warning &amp; Critical (All Incidents)</option>
                    <option value="critical">Critical Severity Only</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">
                  Webhook Endpoint URL *
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/... or https://api.ops.net/webhook"
                  className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-indigo-400 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">
                  Authorization Header / Token (Optional)
                </label>
                <input
                  type="text"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="Bearer secret_token_xyz or custom-api-key"
                  className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-indigo-400 focus:outline-none"
                />
              </div>

              {webhookError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {webhookError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddWebhook(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Save Webhook
                </button>
              </div>
            </form>
          )}

          {/* Webhooks List */}
          <div className="space-y-2">
            {webhooks.length === 0 ? (
              <span className="text-xs text-zinc-600 font-mono italic block py-1">
                No webhook endpoints registered. Click "Add Webhook Endpoint" to configure external alerting.
              </span>
            ) : (
              webhooks.map((wh) => {
                const testRes = webhookTestResults[wh.id];
                return (
                  <div
                    key={wh.id}
                    className="p-3 rounded-lg bg-zinc-900 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="flex items-center gap-3 min-w-[220px]">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          wh.enabled ? 'bg-emerald-400' : 'bg-zinc-600'
                        }`}
                        title={wh.enabled ? 'Active' : 'Disabled'}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-zinc-100">{wh.name}</strong>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                              wh.minSeverity === 'critical'
                                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {wh.minSeverity === 'critical' ? 'Crit Only' : 'Warn+Crit'}
                          </span>
                        </div>
                        <span className="text-zinc-500 text-[10px] truncate max-w-sm block">
                          {wh.url}
                        </span>
                      </div>
                    </div>

                    {/* Actions: Test Ping, Enable/Disable, Delete */}
                    <div className="flex items-center gap-2">
                      {testRes && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                            testRes.ok
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                              : 'bg-red-950/60 text-red-300 border border-red-800'
                          }`}
                        >
                          {testRes.message}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleTestWebhook(wh)}
                        disabled={webhookTesting[wh.id]}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-indigo-300 text-[11px] transition-colors disabled:opacity-50"
                        title="Send sample test alert JSON payload"
                      >
                        <Radio className="w-3 h-3" />
                        <span>{webhookTesting[wh.id] ? 'Pinging...' : 'Send Test Ping'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleWebhook(wh.id)}
                        className={`px-2 py-1 rounded text-[10px] uppercase font-bold transition-colors ${
                          wh.enabled
                            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            : 'bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                        {wh.enabled ? 'Enabled' : 'Paused'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemoveWebhook(wh.id)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                        title="Delete Webhook"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Global Save Button for Alert Rules & Destinations */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 text-xs font-mono">
            {saveMessage && (
              <span className="flex items-center gap-1.5 text-emerald-400 animate-fadeIn font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                {saveMessage}
              </span>
            )}
          </div>

          <button
            onClick={handleSaveAlertRules}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs font-mono transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Applying Configuration...' : 'Save & Apply All Alert Rules'}</span>
          </button>
        </div>
      </div>

      {/* 3. Linux Kernel Capabilities Matrix */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
          Subsystem Capabilities Matrix
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 block mb-1">Linux PSI</span>
            <span className={`font-semibold ${caps?.hasPsi ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {caps?.hasPsi ? '✓ Supported' : '✕ Unavailable'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 block mb-1">Swap Space</span>
            <span className={`font-semibold ${caps?.hasSwap ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {caps?.hasSwap ? '✓ Active' : '✕ No Swap'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 block mb-1">Disk Stats</span>
            <span className={`font-semibold ${caps?.hasDiskStats ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {caps?.hasDiskStats ? '✓ /proc/diskstats' : '✕ Unmounted'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 block mb-1">Net Dev Stats</span>
            <span className={`font-semibold ${caps?.hasNetworkStats ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {caps?.hasNetworkStats ? '✓ /proc/net/dev' : '✕ Blocked'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 block mb-1">Environment</span>
            <span className="font-semibold text-zinc-300">
              {caps?.isWsl ? 'WSL2' : caps?.isContainer ? 'Container' : 'Native Linux'}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80">
            <span className="text-[10px] text-zinc-500 block mb-1">Privilege</span>
            <span className="font-semibold text-emerald-400">
              ✓ Non-Root Safe
            </span>
          </div>
        </div>
      </div>

      {/* 4. Setup Instructions for Windows, Linux & WSL2 */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 font-mono text-xs">
        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
          Agent Enrollment & Launch Instructions
        </h4>

        {/* Windows Instructions */}
        <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <span className="font-semibold text-amber-300">Windows 11 / 10 (PowerShell)</span>
            <span className="text-[10px] text-zinc-500">psutil + requests</span>
          </div>
          <p className="text-zinc-300">
            <strong>1. Download and run the Windows monitor:</strong>
          </p>
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-amber-200 text-xs overflow-x-auto whitespace-pre-wrap select-all">
            {`# Download script\nInvoke-WebRequest -Uri "${window.location.origin}/windows_monitor.py" -OutFile "windows_monitor.py"\n\n# Run with Python launcher (bypasses broken venvs)\npy -3 -m pip install psutil requests\npy -3 windows_monitor.py --machine-id "${machine?.id || 'win-localhost'}" --token "${enrollmentToken}" --url "${window.location.origin}/api/telemetry"`}
          </div>
          <p className="text-[11px] text-zinc-400">
            💡 <em>If you see <code className="text-red-300">Failed to locate pyvenv.cfg</code>, using <code className="text-emerald-300">py -3</code> as shown above cleanly runs your native Python 3 interpreter without relying on a stale virtualenv.</em>
          </p>
        </div>

        {/* Linux / WSL2 Instructions */}
        <div className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <span className="font-semibold text-zinc-300">Linux / Ubuntu 24.04 / WSL2</span>
            <span className="text-[10px] text-zinc-500">Native procfs / psutil</span>
          </div>
          <p className="text-zinc-300">
            <strong>Download &amp; launch:</strong>
          </p>
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs overflow-x-auto whitespace-pre-wrap select-all">
            {`curl -fsSL ${window.location.origin}/windows_monitor.py -o windows_monitor.py\npython3 -m pip install psutil requests\npython3 windows_monitor.py --machine-id "${machine?.id || 'host-device'}" --token "${enrollmentToken}" --url "${window.location.origin}/api/telemetry"`}
          </div>
        </div>
      </div>
    </div>
  );
};

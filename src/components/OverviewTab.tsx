import React, { useState } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Network,
  AlertTriangle,
  Play,
  RotateCw,
  Clock,
  Terminal,
  Copy,
  Check,
  HelpCircle,
  Radio,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  X,
  Laptop,
  Server,
} from 'lucide-react';
import { Machine, TelemetrySample, Anomaly, MachineConnectionStatus } from '../types/telemetry';

interface OverviewTabProps {
  machine: Machine | null;
  latestSample: TelemetrySample | null;
  anomalies: Anomaly[];
  onTriggerWorkload: (type: 'cpu' | 'memory') => void;
  onSampleLocal: () => void;
  isSampling: boolean;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  machine,
  latestSample,
  anomalies,
  onTriggerWorkload,
  onSampleLocal,
  isSampling,
}) => {
  const [copiedCmd, setCopiedCmd] = useState(false);
  const activeAnomalies = anomalies.filter((a) => a.status === 'active');

  const formatBytes = (bytes: number | null | undefined, unit: 'MB' | 'GB' = 'MB') => {
    if (bytes === null || bytes === undefined) return 'N/A';
    if (unit === 'GB') return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatRate = (bytesSec: number | null | undefined) => {
    if (bytesSec === null || bytesSec === undefined) return '0.0 KB/s';
    if (bytesSec >= 1024 * 1024) return (bytesSec / (1024 * 1024)).toFixed(1) + ' MB/s';
    return (bytesSec / 1024).toFixed(1) + ' KB/s';
  };

  const formatUptime = (seconds: number | null | undefined) => {
    if (!seconds) return 'N/A';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${Math.floor(seconds)}s`;
  };

  const getStatusBadge = (status?: MachineConnectionStatus) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            Live Connected
          </span>
        );
      case 'waiting_for_telemetry':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Waiting for Telemetry
          </span>
        );
      case 'auth_failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
            Token Revoked
          </span>
        );
      case 'agent_error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/30">
            Agent Error
          </span>
        );
      case 'disconnected':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            Disconnected
          </span>
        );
    }
  };

  const isWindows = machine?.platform === 'windows' || machine?.os?.toLowerCase().includes('win');
  const isMac = machine?.platform === 'darwin' || machine?.os?.toLowerCase().includes('mac');
  const isLinux = !isWindows && !isMac;

  const [activeShell, setActiveShell] = useState<'powershell' | 'cmd' | 'bash'>(isWindows ? 'powershell' : (isMac || isLinux ? 'bash' : 'powershell'));

  const [showAddPcModal, setShowAddPcModal] = useState(false);
  const [newPcName, setNewPcName] = useState('win-pc2');
  const [newPcShell, setNewPcShell] = useState<'cmd' | 'powershell'>('cmd');
  const [copiedNewPc, setCopiedNewPc] = useState(false);

  const machineId = machine?.id || 'win-localhost';
  const token = machine?.enrollmentToken || 'fb_win_token_primary';
  const apiOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-dev-ko6ucrltlcrhb5odbgg2k7-480134225901.asia-east1.run.app';

  const cleanPcId = newPcName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'win-pc2';

  const newPcCmd = `curl -L -s -o windows_monitor.py ${apiOrigin}/windows_monitor.py && py -3 -m pip install psutil requests && py -3 windows_monitor.py --machine-id "${cleanPcId}" --token "fb_win_token_primary" --url "${apiOrigin}/api/telemetry"`;

  const newPcPowerShell = `Invoke-WebRequest -Uri "${apiOrigin}/api/agent/script" -OutFile "windows_monitor.py"\npy -3 -m pip install psutil requests\npy -3 windows_monitor.py --machine-id "${cleanPcId}" --token "fb_win_token_primary" --url "${apiOrigin}/api/telemetry"`;

  const copyNewPcCommand = () => {
    navigator.clipboard.writeText(newPcShell === 'cmd' ? newPcCmd : newPcPowerShell);
    setCopiedNewPc(true);
    setTimeout(() => setCopiedNewPc(false), 2000);
  };

  const powerShellCmd = `# 1. Download monitor script directly onto your Windows laptop:\nInvoke-WebRequest -Uri "${apiOrigin}/windows_monitor.py" -OutFile "windows_monitor.py"\n\n# 2. Install dependencies & launch agent using Python Launcher:\npy -3 -m pip install psutil requests\npy -3 windows_monitor.py --machine-id "${machineId}" --token "${token}" --url "${apiOrigin}/api/telemetry"`;

  const cmdPromptCmd = `:: 1. Download monitor script\ncurl -o windows_monitor.py ${apiOrigin}/windows_monitor.py\n\n:: 2. Install dependencies & launch with py launcher\npy -3 -m pip install psutil requests\npy -3 windows_monitor.py --machine-id "${machineId}" --token "${token}" --url "${apiOrigin}/api/telemetry"`;

  const bashCmd = `# 1. Download monitor script\ncurl -fsSL ${apiOrigin}/windows_monitor.py -o windows_monitor.py\n\n# 2. Install dependencies & launch agent\npython3 -m pip install psutil requests\npython3 windows_monitor.py --machine-id "${machineId}" --token "${token}" --url "${apiOrigin}/api/telemetry"`;

  const currentCmd = activeShell === 'powershell' ? powerShellCmd : (activeShell === 'cmd' ? cmdPromptCmd : bashCmd);

  const copyCommand = () => {
    navigator.clipboard.writeText(currentCmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Modal: Connect Another PC */}
      {showAddPcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-900 p-6 space-y-4 shadow-2xl font-mono animate-fadeIn">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Laptop className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-100">Connect Another Windows PC to Fireball</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddPcModal(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-300 block mb-1 font-semibold">
                  1. Give this second PC a unique Machine ID:
                </label>
                <input
                  type="text"
                  value={newPcName}
                  onChange={(e) => setNewPcName(e.target.value)}
                  placeholder="e.g. pc-2, work-laptop, gaming-rig"
                  className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-700 text-zinc-100 font-mono text-xs focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-zinc-300 font-semibold">
                    2. Choose Terminal Shell on your other PC:
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewPcShell('cmd')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                        newPcShell === 'cmd'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                      }`}
                    >
                      Command Prompt (CMD)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPcShell('powershell')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                        newPcShell === 'powershell'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                      }`}
                    >
                      PowerShell
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2.5">
                  <pre className="text-xs text-amber-300 font-mono whitespace-pre-wrap select-all overflow-x-auto leading-relaxed">
                    {newPcShell === 'cmd' ? newPcCmd : newPcPowerShell}
                  </pre>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={copyNewPcCommand}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs font-mono transition-colors cursor-pointer shadow-sm"
                    >
                      {copiedNewPc ? <Check className="w-3.5 h-3.5 text-zinc-950" /> : <Copy className="w-3.5 h-3.5 text-zinc-950" />}
                      <span>{copiedNewPc ? 'Copied to Clipboard!' : 'Copy 1-Line Command'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-emerald-950/25 border border-emerald-800/40 text-[11px] text-zinc-300 space-y-1">
                <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  What happens when you run this on your other PC:
                </span>
                <p className="text-zinc-400 leading-relaxed">
                  Open {newPcShell === 'cmd' ? 'Command Prompt' : 'PowerShell'} on your other PC, paste this command, and press Enter. It installs <code className="text-zinc-200">psutil</code>, downloads the monitoring agent, and starts streaming. <code className="text-emerald-300 font-bold">{cleanPcId}</code> will immediately appear in your Host selector dropdown at the top of the dashboard!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Host Status & Capabilities Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-3.5 h-3.5 rounded-full ${
              machine?.connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
            }`} />
            {machine?.connectionStatus === 'connected' && (
              <div className="absolute inset-0 w-3.5 h-3.5 rounded-full bg-emerald-500 animate-ping opacity-50" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-100 text-sm font-mono">
                {machine?.name || machine?.hostname || 'Primary Host'}
              </span>

              {/* OS / Platform Tag */}
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-800 text-zinc-200 border border-zinc-700">
                {isWindows ? '🪟 Windows' : isMac ? '🍎 macOS' : '🐧 Linux'}
              </span>

              {machine?.capabilities?.isWsl && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-900/50 text-blue-300 border border-blue-700/50">
                  WSL2
                </span>
              )}

              {getStatusBadge(machine?.connectionStatus)}
            </div>

            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Host: <span className="text-zinc-300">{machine?.hostname}</span> ({machine?.id}) | Cores: {machine?.cpuCores || 4} | RAM: {formatBytes(machine?.totalMemoryBytes, 'GB')} | Uptime: {formatUptime(latestSample?.uptimeSeconds)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSampleLocal}
            disabled={isSampling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 transition-colors disabled:opacity-50"
            title="Polls local host metrics immediately"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSampling ? 'animate-spin' : ''}`} />
            {isSampling ? 'Sampling...' : 'Poll Metrics'}
          </button>

          <button
            onClick={() => onTriggerWorkload('cpu')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-600/40 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-mono font-medium text-amber-300 transition-colors"
            title="Starts safe 10-second bounded CPU workload to test anomaly detection"
          >
            <Play className="w-3.5 h-3.5" />
            Trigger Test CPU Spike
          </button>

          <button
            onClick={() => setShowAddPcModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-mono font-semibold text-emerald-300 transition-colors cursor-pointer"
            title="Connect a second laptop or desktop PC to Fireball"
          >
            <Plus className="w-3.5 h-3.5" />
            Connect Another PC
          </button>
        </div>
      </div>

      {/* Active Anomalies Notification Banner */}
      {activeAnomalies.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-200 font-mono">
                {activeAnomalies.length} Active Performance Anomaly Detected
              </h4>
              <div className="mt-2 space-y-2">
                {activeAnomalies.map((anom) => (
                  <div
                    key={anom.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/80 text-xs font-mono"
                  >
                    <div>
                      <span className="font-semibold text-red-300 uppercase tracking-wider mr-2">
                        [{anom.severity}]
                      </span>
                      <span className="text-zinc-200">{anom.explanation}</span>
                    </div>
                    <span className="text-zinc-500 text-[10px]">
                      {anom.detectedAt.substring(11, 19)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* If No Telemetry Sample Received Yet: Render Transparent Waiting Guide (No Fake Fallbacks) */}
      {!latestSample ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 text-center space-y-5 font-mono">
          <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
            <Radio className="w-6 h-6 animate-pulse" />
          </div>

          <div className="max-w-xl mx-auto space-y-2">
            <h3 className="text-base font-bold text-zinc-100">
              Waiting for Telemetry from {machine?.name || machine?.hostname || 'Registered Computer'}
            </h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Fireball does not display simulated or fake metrics. To stream live hardware telemetry from your computer into this dashboard, copy and run these commands:
            </p>
          </div>

          {/* Shell Selector Tabs */}
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveShell('powershell')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                    activeShell === 'powershell'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                >
                  Windows PowerShell (Recommended)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveShell('cmd')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                    activeShell === 'cmd'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                >
                  Windows Command Prompt (CMD)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveShell('bash')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                    activeShell === 'bash'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                  }`}
                >
                  Linux / macOS
                </button>
              </div>

              <a
                href={`${apiOrigin}/windows_monitor.py`}
                download="windows_monitor.py"
                className="text-[11px] text-zinc-400 hover:text-amber-300 underline transition-colors"
                title="Direct script download"
              >
                Direct Download Script (.py)
              </a>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start justify-between gap-3 text-left">
              <pre className="text-xs text-amber-300 font-mono overflow-x-auto whitespace-pre-wrap select-all leading-relaxed">
                {currentCmd}
              </pre>
              <button
                type="button"
                onClick={copyCommand}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                <span>{copiedCmd ? 'Copied!' : 'Copy Snippet'}</span>
              </button>
            </div>

            {/* Explanatory Resolution Note for "Failed to locate pyvenv.cfg" */}
            <div className="mt-3 p-3 rounded-lg bg-sky-950/20 border border-sky-800/30 text-left text-xs font-mono space-y-1">
              <div className="flex items-center gap-1.5 text-sky-300 font-semibold">
                <span>💡 Fixing Windows `Failed to locate pyvenv.cfg` error:</span>
              </div>
              <p className="text-zinc-400 text-[11px] leading-relaxed">
                If typing <code className="text-zinc-200">python</code> gives <code className="text-red-300 font-semibold">Failed to locate pyvenv.cfg</code>, your Windows path is pointing to an old or moved virtual environment. The commands above use <code className="text-emerald-300 font-semibold">py -3</code> (the official Windows Python launcher), which automatically connects to your clean Python 3 installation!
              </p>
            </div>
          </div>

          <div className="flex justify-center gap-3 pt-2">
            <button
              onClick={() => onTriggerWorkload('cpu')}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-300 transition-colors"
            >
              Run Test Benchmark
            </button>
            <button
              onClick={onSampleLocal}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors"
            >
              Sample Local Machine
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Core Subsystem Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* CPU Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider font-mono">CPU Utilization</span>
                <Cpu className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-zinc-100">
                  {latestSample.cpuPercent.toFixed(1)}%
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  {latestSample.load1m !== null && latestSample.load1m !== undefined ? `Load: ${latestSample.load1m}` : `${machine?.cpuCores || 4} Cores`}
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-3 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    latestSample.cpuPercent > 85 ? 'bg-red-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, latestSample.cpuPercent))}%` }}
                />
              </div>

              {/* Per-Core CPU Meters if available */}
              {latestSample.cpuPerCore && latestSample.cpuPerCore.length > 0 ? (
                <div className="mt-3 pt-2 border-t border-zinc-800/80 space-y-1">
                  <div className="text-[10px] text-zinc-500 font-mono font-semibold uppercase">Per-Core Breakdown:</div>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-zinc-400">
                    {latestSample.cpuPerCore.slice(0, 8).map((pct, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-zinc-950/60 px-1.5 py-0.5 rounded">
                        <span className="text-zinc-500">C{idx}:</span>
                        <span className={pct > 80 ? 'text-red-400 font-bold' : 'text-zinc-300'}>{pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-2">
                  <span>User: {latestSample.cpuUserPercent?.toFixed(1) ?? '--'}%</span>
                  <span>Sys: {latestSample.cpuSystemPercent?.toFixed(1) ?? '--'}%</span>
                  <span>iowait: {latestSample.cpuIowaitPercent?.toFixed(1) ?? '--'}%</span>
                </div>
              )}
            </div>

            {/* Physical Memory Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider font-mono">Physical Memory</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-zinc-100">
                  {latestSample.memoryPercent.toFixed(1)}%
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  Avail: {formatBytes(latestSample.memoryAvailableBytes)}
                </span>
              </div>
              <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-3 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    latestSample.memoryPercent > 85 ? 'bg-red-500' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, latestSample.memoryPercent))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-2">
                <span>Used: {formatBytes(latestSample.memoryUsedBytes)}</span>
                <span>Pagefile/Swap: {latestSample.swapPercent?.toFixed(0) ?? '--'}%</span>
              </div>
            </div>

            {/* Storage I/O Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider font-mono">Storage I/O &amp; Disk</span>
                <HardDrive className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold font-mono text-zinc-100">
                  {formatRate(latestSample.diskWriteBytesPerSec)}
                </span>
                <span className="text-xs text-zinc-500 font-mono">write</span>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs font-mono text-zinc-400 border-t border-zinc-800/80 pt-2">
                <span>Read: {formatRate(latestSample.diskReadBytesPerSec)}</span>
                <span>Disk: {latestSample.diskPercent ? `${latestSample.diskPercent.toFixed(0)}%` : 'N/A'}</span>
              </div>
              <div className="text-[10px] text-zinc-500 font-mono mt-1">
                Drive: {formatBytes(latestSample.diskAvailableBytes, 'GB')} free
              </div>
            </div>

            {/* Linux PSI / Windows Diagnostics Card */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-medium uppercase tracking-wider font-mono">
                  {isWindows ? 'Windows Diagnostic Interface' : 'Linux PSI Pressure'}
                </span>
                <Network className="w-4 h-4 text-indigo-400" />
              </div>
              {latestSample.psiCpuSome10 !== null ? (
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold font-mono text-zinc-100">
                      {latestSample.psiCpuSome10.toFixed(1)}%
                    </span>
                    <span className="text-xs text-zinc-500 font-mono">CPU stall</span>
                  </div>
                  <div className="mt-3 flex justify-between text-xs font-mono text-zinc-400 border-t border-zinc-800/80 pt-2">
                    <span>Mem: {latestSample.psiMemorySome10 !== null ? `${latestSample.psiMemorySome10}%` : 'N/A'}</span>
                    <span>I/O: {latestSample.psiIoSome10 !== null ? `${latestSample.psiIoSome10}%` : 'N/A'}</span>
                  </div>
                </div>
              ) : (
                <div className="py-2">
                  <span className="inline-flex items-center gap-1 text-xs text-zinc-400 font-mono bg-zinc-800/60 px-2 py-1 rounded">
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
                    {isWindows ? 'Native Windows Kernel' : isMac ? 'Darwin Kernel' : 'PSI Unsupported'}
                  </span>
                  <p className="text-[10px] text-zinc-500 font-mono mt-2 leading-tight">
                    {isWindows
                      ? 'Windows uses NT Virtual Memory & IO counters; Linux /proc/pressure is absent by design.'
                      : isMac
                      ? 'macOS Darwin kernel uses mach/vm stats.'
                      : 'Kernel lacks CONFIG_PSI.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Network Throughput Strip */}
          <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-sky-400" />
              <span className="font-semibold text-zinc-300">Network Throughput:</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <ArrowDownRight className="w-4 h-4" />
                <span>RX: {formatRate(latestSample.networkRxBytesPerSec)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-indigo-400">
                <ArrowUpRight className="w-4 h-4" />
                <span>TX: {formatRate(latestSample.networkTxBytesPerSec)}</span>
              </div>
              <div className="text-zinc-500 text-[11px]">
                Errors: {latestSample.networkErrorsPerSec ?? 0}/s
              </div>
            </div>
          </div>

          {/* Top Live Processes Table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                Live Top System Processes ({isWindows ? 'via Windows NT Process Enum' : 'via /proc/[pid]/stat'})
              </h3>
              <span className="text-[10px] font-mono text-zinc-500">
                Sorted by memory and CPU consumption
              </span>
            </div>

            {latestSample.topProcesses && latestSample.topProcesses.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500">
                      <th className="pb-2 font-medium">PID</th>
                      <th className="pb-2 font-medium">PROCESS NAME</th>
                      <th className="pb-2 font-medium text-right">CPU %</th>
                      <th className="pb-2 font-medium text-right">RESIDENT RAM</th>
                      <th className="pb-2 font-medium text-right">MEM %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                    {latestSample.topProcesses.map((p) => (
                      <tr key={p.pid} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-2 text-zinc-400">{p.pid}</td>
                        <td className="py-2 font-semibold text-zinc-100">{p.name}</td>
                        <td className="py-2 text-right">
                          <span className={p.cpuPercent > 50 ? 'text-red-400 font-bold' : 'text-zinc-300'}>
                            {p.cpuPercent.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-2 text-right text-zinc-400">{formatBytes(p.rssBytes)}</td>
                        <td className="py-2 text-right">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400">
                            {p.memoryPercent.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-zinc-500 font-mono">
                Process telemetry stream updating...
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

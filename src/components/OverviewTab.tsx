import React from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Network,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Play,
  RotateCw,
} from 'lucide-react';
import { Machine, TelemetrySample, Anomaly } from '../types/telemetry';

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
  const activeAnomalies = anomalies.filter((a) => a.status === 'active');

  const formatBytes = (bytes: number | null | undefined, unit: 'MB' | 'GB' = 'MB') => {
    if (bytes === null || bytes === undefined) return 'N/A';
    if (unit === 'GB') return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatRate = (bytesSec: number | null | undefined) => {
    if (bytesSec === null || bytesSec === undefined) return 'N/A';
    if (bytesSec >= 1024 * 1024) return (bytesSec / (1024 * 1024)).toFixed(1) + ' MB/s';
    return (bytesSec / 1024).toFixed(0) + ' KB/s';
  };

  return (
    <div className="space-y-6">
      {/* Top Host Status & Capabilities Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/70">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-3.5 h-3.5 rounded-full bg-emerald-500" />
            <div className="absolute inset-0 w-3.5 h-3.5 rounded-full bg-emerald-500 animate-ping opacity-50" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-100 text-sm">
                {machine?.hostname || 'Linux Host'}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300">
                {machine?.kernel || 'Linux'}
              </span>
              {machine?.capabilities?.isWsl && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-900/50 text-blue-300 border border-blue-700/50">
                  WSL2
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Cores: {machine?.cpuCores || 2} | RAM: {formatBytes(machine?.totalMemoryBytes, 'GB')} | Agent: v{machine?.agentVersion || '1.0.0'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSampleLocal}
            disabled={isSampling}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors disabled:opacity-50"
            title="Polls local host /proc metrics immediately"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isSampling ? 'animate-spin' : ''}`} />
            {isSampling ? 'Sampling...' : 'Sample Local Host'}
          </button>

          <button
            onClick={() => onTriggerWorkload('cpu')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-600/40 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium text-amber-300 transition-colors"
            title="Starts safe 10-second bounded CPU workload to test anomaly detection"
          >
            <Play className="w-3.5 h-3.5" />
            Trigger Test CPU Spike
          </button>
        </div>
      </div>

      {/* Active Anomalies Notification Banner */}
      {activeAnomalies.length > 0 && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-200">
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

      {/* Core Subsystem Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">CPU Utilization</span>
            <Cpu className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-100">
              {latestSample?.cpuPercent?.toFixed(1) ?? '--'}%
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              Load: {latestSample?.load1m ?? '--'}
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                (latestSample?.cpuPercent || 0) > 85 ? 'bg-red-500' : 'bg-amber-400'
              }`}
              style={{ width: `${Math.min(100, latestSample?.cpuPercent || 0)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-2">
            <span>User: {latestSample?.cpuUserPercent?.toFixed(1) ?? '--'}%</span>
            <span>Sys: {latestSample?.cpuSystemPercent?.toFixed(1) ?? '--'}%</span>
            <span>iowait: {latestSample?.cpuIowaitPercent?.toFixed(1) ?? '--'}%</span>
          </div>
        </div>

        {/* Physical Memory Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Physical Memory</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-zinc-100">
              {latestSample?.memoryPercent?.toFixed(1) ?? '--'}%
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              Avail: {formatBytes(latestSample?.memoryAvailableBytes)}
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                (latestSample?.memoryPercent || 0) > 85 ? 'bg-red-500' : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min(100, latestSample?.memoryPercent || 0)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500 font-mono mt-2">
            <span>Used: {formatBytes(latestSample?.memoryUsedBytes)}</span>
            <span>Swap: {latestSample?.swapPercent?.toFixed(0) ?? '--'}%</span>
          </div>
        </div>

        {/* Storage I/O Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Storage I/O Rates</span>
            <HardDrive className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-zinc-100">
              {formatRate(latestSample?.diskWriteBytesPerSec)}
            </span>
            <span className="text-xs text-zinc-500 font-mono">write</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-mono text-zinc-400 border-t border-zinc-800/80 pt-2">
            <span>Read: {formatRate(latestSample?.diskReadBytesPerSec)}</span>
            <span>iowait: {latestSample?.cpuIowaitPercent?.toFixed(1) ?? '0.0'}%</span>
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-1">
            Source: /proc/diskstats
          </div>
        </div>

        {/* Linux PSI Pressure Card */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Linux PSI Pressure</span>
            <Network className="w-4 h-4 text-indigo-400" />
          </div>
          {latestSample?.psiCpuSome10 !== null ? (
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-zinc-100">
                  {latestSample?.psiCpuSome10?.toFixed(1)}%
                </span>
                <span className="text-xs text-zinc-500 font-mono">CPU stall</span>
              </div>
              <div className="mt-3 flex justify-between text-xs font-mono text-zinc-400 border-t border-zinc-800/80 pt-2">
                <span>Mem: {latestSample?.psiMemorySome10 !== null ? `${latestSample?.psiMemorySome10}%` : 'N/A'}</span>
                <span>I/O: {latestSample?.psiIoSome10 !== null ? `${latestSample?.psiIoSome10}%` : 'N/A'}</span>
              </div>
            </div>
          ) : (
            <div className="py-2">
              <span className="inline-flex items-center gap-1 text-xs text-zinc-400 font-mono bg-zinc-800/60 px-2 py-1 rounded">
                <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
                PSI Unsupported
              </span>
              <p className="text-[10px] text-zinc-500 font-mono mt-2">
                Kernel lacks CONFIG_PSI or running in unprivileged container.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Top Linux Processes Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
            Live Top System Processes (via /proc/[pid]/stat)
          </h3>
          <span className="text-[10px] font-mono text-zinc-500">
            Real process page tables
          </span>
        </div>

        {latestSample?.topProcesses && latestSample.topProcesses.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="pb-2 font-medium">PID</th>
                  <th className="pb-2 font-medium">COMMAND</th>
                  <th className="pb-2 font-medium text-right">RESIDENT RAM</th>
                  <th className="pb-2 font-medium text-right">MEM %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {latestSample.topProcesses.map((p) => (
                  <tr key={p.pid} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2 text-zinc-400">{p.pid}</td>
                    <td className="py-2 font-semibold text-zinc-100">{p.name}</td>
                    <td className="py-2 text-right">{formatBytes(p.rssBytes)}</td>
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
            Process inspection telemetry updating...
          </div>
        )}
      </div>
    </div>
  );
};

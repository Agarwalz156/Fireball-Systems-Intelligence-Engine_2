import React from 'react';
import { Cpu, Activity, HardDrive, ShieldCheck, AlertTriangle } from 'lucide-react';
import { TelemetrySample, Machine, Anomaly } from '../types/telemetry';

interface QuickStatsBarProps {
  machine: Machine | null;
  latestSample: TelemetrySample | null;
  anomalies: Anomaly[];
}

export const QuickStatsBar: React.FC<QuickStatsBarProps> = ({
  machine,
  latestSample,
  anomalies,
}) => {
  const activeAnomalies = anomalies.filter((a) => a.status === 'active');

  const cpuPercent = latestSample?.cpuPercent ?? 0;
  const memPercent = latestSample?.memoryPercent ?? 0;
  const diskPercent = latestSample?.diskPercent ?? 0;

  const formatBytes = (bytes: number | null | undefined, unit: 'MB' | 'GB' = 'GB') => {
    if (bytes === null || bytes === undefined) return '--';
    if (unit === 'GB') return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
  };

  const getBarColor = (pct: number, warnThresh = 75, critThresh = 90) => {
    if (pct >= critThresh) return 'bg-red-500';
    if (pct >= warnThresh) return 'bg-amber-400';
    return 'bg-emerald-400';
  };

  const getTextColor = (pct: number, warnThresh = 75, critThresh = 90) => {
    if (pct >= critThresh) return 'text-red-400';
    if (pct >= warnThresh) return 'text-amber-300';
    return 'text-emerald-400';
  };

  const isWin = machine?.platform === 'windows' || machine?.os?.toLowerCase().includes('win');
  const isMac = machine?.platform === 'darwin' || machine?.os?.toLowerCase().includes('mac');

  return (
    <div className="border-b border-zinc-800/90 bg-zinc-900/60 backdrop-blur-md px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Left Side: 3 Horizontal Bar Stats (CPU, Memory, Disk) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1 min-w-[280px]">
          {/* 1. CPU Load Widget */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800/70">
            <Cpu className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[11px] font-mono leading-none mb-1">
                <span className="text-zinc-400 font-semibold">CPU LOAD</span>
                <span className={`font-bold ${getTextColor(cpuPercent, 75, 90)}`}>
                  {latestSample ? `${cpuPercent.toFixed(1)}%` : '--'}
                </span>
              </div>
              <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${getBarColor(cpuPercent, 75, 90)}`}
                  style={{ width: `${latestSample ? Math.min(100, Math.max(2, cpuPercent)) : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-1 leading-none">
                <span>{latestSample?.load1m !== null && latestSample?.load1m !== undefined ? `1m: ${latestSample.load1m}` : `${machine?.cpuCores || 4} Cores`}</span>
                <span>sys: {latestSample?.cpuSystemPercent?.toFixed(0) ?? '--'}%</span>
              </div>
            </div>
          </div>

          {/* 2. Memory Usage Widget */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800/70">
            <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[11px] font-mono leading-none mb-1">
                <span className="text-zinc-400 font-semibold">MEMORY</span>
                <span className={`font-bold ${getTextColor(memPercent, 80, 90)}`}>
                  {latestSample ? `${memPercent.toFixed(1)}%` : '--'}
                </span>
              </div>
              <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${getBarColor(memPercent, 80, 90)}`}
                  style={{ width: `${latestSample ? Math.min(100, Math.max(2, memPercent)) : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-1 leading-none">
                <span>{latestSample ? formatBytes(latestSample.memoryUsedBytes) : '--'} used</span>
                <span>{formatBytes(latestSample?.memoryTotalBytes ?? machine?.totalMemoryBytes)} total</span>
              </div>
            </div>
          </div>

          {/* 3. Disk Space Usage Widget */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800/70">
            <HardDrive className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[11px] font-mono leading-none mb-1">
                <span className="text-zinc-400 font-semibold">DISK USAGE</span>
                <span className={`font-bold ${getTextColor(diskPercent, 80, 90)}`}>
                  {latestSample && latestSample.diskPercent !== null && latestSample.diskPercent !== undefined ? `${latestSample.diskPercent.toFixed(1)}%` : '--'}
                </span>
              </div>
              <div className="w-full bg-zinc-800/80 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${getBarColor(diskPercent, 80, 90)}`}
                  style={{ width: `${latestSample && latestSample.diskPercent ? Math.min(100, Math.max(2, diskPercent)) : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500 mt-1 leading-none">
                <span>{latestSample?.diskAvailableBytes ? `${formatBytes(latestSample.diskAvailableBytes, 'GB')} free` : '-- free'}</span>
                <span>{latestSample?.diskTotalBytes ? `${formatBytes(latestSample.diskTotalBytes, 'GB')} total` : '-- total'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Real-time Host Health Badge */}
        <div className="hidden lg:flex items-center gap-3 shrink-0 text-xs font-mono">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
            <div className="relative">
              <div className={`w-2 h-2 rounded-full ${activeAnomalies.length > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <div className={`absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-60 ${activeAnomalies.length > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            </div>
            {activeAnomalies.length > 0 ? (
              <span className="text-amber-300 font-medium">
                {activeAnomalies.length} Alert{activeAnomalies.length > 1 ? 's' : ''} Active
              </span>
            ) : (
              <span className="text-emerald-400 font-medium">
                {latestSample ? 'Systems Nominal' : 'Waiting for Telemetry'}
              </span>
            )}
          </div>

          <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold">
              {isWin ? 'Windows' : isMac ? 'macOS' : 'Linux'}
            </span>
            <span className="text-zinc-300 font-semibold">{machine?.hostname || machine?.id || 'host'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

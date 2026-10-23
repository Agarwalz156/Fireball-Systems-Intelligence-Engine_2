import React, { useState } from 'react';
import { TelemetrySample, Anomaly } from '../types/telemetry';
import { TelemetryChart } from './TelemetryChart';
import { Pause, Play, Clock } from 'lucide-react';

interface PerformanceTabProps {
  samples: TelemetrySample[];
  anomalies: Anomaly[];
  isLive: boolean;
  onToggleLive: () => void;
}

export const PerformanceTab: React.FC<PerformanceTabProps> = ({
  samples,
  anomalies,
  isLive,
  onToggleLive,
}) => {
  const [timeRange, setTimeRange] = useState<'1m' | '5m' | '15m' | 'all'>('5m');

  // Filter samples based on time range
  const getFilteredSamples = () => {
    if (timeRange === 'all' || samples.length === 0) return samples;
    const now = new Date(samples[samples.length - 1].timestamp).getTime();
    const minutes = timeRange === '1m' ? 1 : timeRange === '5m' ? 5 : 15;
    const cutoff = now - minutes * 60 * 1000;
    const filtered = samples.filter((s) => new Date(s.timestamp).getTime() >= cutoff);
    return filtered.length > 0 ? filtered : samples;
  };

  const currentSamples = getFilteredSamples();

  return (
    <div className="space-y-6">
      {/* Performance Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl border border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-300">Observation Window:</span>
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs font-mono">
            {(['1m', '5m', '15m', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 rounded transition-colors ${
                  timeRange === range
                    ? 'bg-amber-500/20 text-amber-300 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {range.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-400">
            {currentSamples.length} samples in window
          </span>

          <button
            onClick={onToggleLive}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium font-mono transition-colors ${
              isLive
                ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {isLive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isLive ? 'Live Streaming' : 'Paused'}
          </button>
        </div>
      </div>

      {/* Historical Telemetry Charts Grid */}
      <div className="space-y-4">
        {/* Chart 1: Host CPU Utilization & System Load */}
        <TelemetryChart
          title="CPU Utilization & System Load"
          samples={currentSamples}
          series={[
            {
              key: 'cpuPercent',
              label: 'CPU Busy',
              color: '#f59e0b',
              unit: '%',
              maxValue: 100,
              threshold: 85,
            },
            {
              key: 'cpuIowaitPercent',
              label: 'iowait',
              color: '#ef4444',
              unit: '%',
              maxValue: 100,
            },
            {
              key: 'cpuSystemPercent',
              label: 'Kernel Sys',
              color: '#38bdf8',
              unit: '%',
              maxValue: 100,
            },
          ]}
          anomalies={anomalies.filter((a) => a.metricName === 'cpu_utilization')}
          height={190}
        />

        {/* Chart 2: Physical Memory & Swap Capacity */}
        <TelemetryChart
          title="Physical Memory & Swap Capacity"
          samples={currentSamples}
          series={[
            {
              key: 'memoryPercent',
              label: 'RAM Used',
              color: '#10b981',
              unit: '%',
              maxValue: 100,
              threshold: 85,
            },
            {
              key: 'swapPercent',
              label: 'Swap Utilized',
              color: '#ec4899',
              unit: '%',
              maxValue: 100,
              threshold: 50,
            },
          ]}
          anomalies={anomalies.filter((a) => a.metricName === 'memory_available' || a.metricName === 'swap_activity')}
          height={190}
        />

        {/* Chart 3: Storage Block Device I/O */}
        <TelemetryChart
          title="Storage Block Device Rates (/proc/diskstats)"
          samples={currentSamples}
          series={[
            {
              key: 'diskWriteBytesPerSec',
              label: 'Write Rate',
              color: '#06b6d4',
              unit: 'B/s',
            },
            {
              key: 'diskReadBytesPerSec',
              label: 'Read Rate',
              color: '#8b5cf6',
              unit: 'B/s',
            },
          ]}
          anomalies={anomalies.filter((a) => a.metricName === 'disk_io_saturation')}
          height={170}
        />

        {/* Chart 4: Application HTTP Endpoint Latency */}
        <TelemetryChart
          title="Monitored Application Endpoint Latency"
          samples={currentSamples}
          series={[
            {
              key: 'httpLatencyMs',
              label: 'Latency (p95)',
              color: '#6366f1',
              unit: 'ms',
              threshold: 400,
            },
          ]}
          anomalies={anomalies.filter((a) => a.metricName === 'http_latency')}
          height={170}
        />
      </div>
    </div>
  );
};

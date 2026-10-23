import React, { useState } from 'react';
import { TelemetrySample, Anomaly } from '../types/telemetry';

interface SeriesConfig {
  key: keyof TelemetrySample;
  label: string;
  color: string;
  unit: string;
  maxValue?: number;
  threshold?: number;
}

interface TelemetryChartProps {
  title: string;
  samples: TelemetrySample[];
  series: SeriesConfig[];
  anomalies?: Anomaly[];
  height?: number;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({
  title,
  samples,
  series,
  anomalies = [],
  height = 180,
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!samples || samples.length === 0) {
    return (
      <div
        className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 flex flex-col items-center justify-center text-zinc-500 font-mono text-xs"
        style={{ height }}
      >
        <span>No telemetry samples in selected time window</span>
        <span className="text-zinc-600 text-[10px] mt-1">Agent is either offline or connecting...</span>
      </div>
    );
  }

  // Width calculation
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 25;
  const paddingBottom = 25;
  const chartWidth = 600;
  const chartHeight = height;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  // Compute dynamic max value across series
  let globalMax = 10;
  for (const s of series) {
    if (s.maxValue) {
      globalMax = Math.max(globalMax, s.maxValue);
    } else {
      for (const sample of samples) {
        const val = sample[s.key] as number | null;
        if (typeof val === 'number') {
          globalMax = Math.max(globalMax, val);
        }
      }
    }
  }
  // Add 10% breathing room
  globalMax = Math.ceil(globalMax * 1.1) || 100;

  // Helper to map (index, value) to SVG (x, y)
  const getX = (i: number) => {
    if (samples.length <= 1) return paddingLeft + innerWidth / 2;
    return paddingLeft + (i / (samples.length - 1)) * innerWidth;
  };

  const getY = (val: number | null | undefined) => {
    if (val === null || val === undefined || isNaN(val)) return innerHeight + paddingTop;
    const clamped = Math.max(0, Math.min(globalMax, val));
    return paddingTop + innerHeight - (clamped / globalMax) * innerHeight;
  };

  // Build SVG path data for each series
  const paths = series.map((s) => {
    let d = '';
    let hasPoints = false;
    samples.forEach((sample, i) => {
      const val = sample[s.key] as number | null;
      if (val !== null && typeof val === 'number') {
        const x = getX(i);
        const y = getY(val);
        if (!hasPoints) {
          d += `M ${x} ${y}`;
          hasPoints = true;
        } else {
          d += ` L ${x} ${y}`;
        }
      }
    });
    return { ...s, d, hasPoints };
  });

  const activeSample = hoverIndex !== null ? samples[hoverIndex] : samples[samples.length - 1];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-all hover:border-zinc-700/80">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-200 tracking-wide">{title}</span>
          {series.map((s) => (
            <span key={s.key as string} className="flex items-center gap-1 text-[11px] font-mono text-zinc-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}:{' '}
              <strong className="text-zinc-200">
                {activeSample[s.key] !== null && activeSample[s.key] !== undefined
                  ? typeof activeSample[s.key] === 'number'
                    ? (activeSample[s.key] as number).toFixed(1)
                    : String(activeSample[s.key])
                  : 'N/A'}{' '}
                {s.unit}
              </strong>
            </span>
          ))}
        </div>
        <div className="text-[10px] font-mono text-zinc-500">
          {activeSample?.timestamp?.substring(11, 19) || ''}
        </div>
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto overflow-visible select-none"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {/* Background Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((ratio) => {
            const y = paddingTop + innerHeight * (1 - ratio);
            const val = Math.round(globalMax * ratio);
            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#27272a"
                  strokeDasharray="2 3"
                  strokeWidth="0.8"
                />
                <text
                  x={paddingLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-zinc-500 text-[9px] font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Threshold Lines */}
          {series
            .filter((s) => s.threshold)
            .map((s) => {
              const y = getY(s.threshold!);
              return (
                <g key={`thresh-${s.key as string}`}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={chartWidth - paddingRight}
                    y2={y}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    strokeWidth="1.2"
                    opacity="0.7"
                  />
                  <text
                    x={chartWidth - paddingRight}
                    y={y - 3}
                    textAnchor="end"
                    className="fill-red-400 text-[9px] font-mono font-medium"
                  >
                    Limit {s.threshold} {s.unit}
                  </text>
                </g>
              );
            })}

          {/* Series Paths */}
          {paths.map((p) => (
            <path
              key={p.key as string}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Anomaly Markers */}
          {anomalies.map((anom, idx) => {
            // Find sample index closest to anomaly detectedAt
            const sampleIdx = samples.findIndex(
              (s) => Math.abs(new Date(s.timestamp).getTime() - new Date(anom.detectedAt).getTime()) < 3000
            );
            if (sampleIdx === -1) return null;
            const x = getX(sampleIdx);
            const y = getY(anom.observedValue);
            return (
              <g key={`anom-point-${idx}`}>
                <circle
                  cx={x}
                  cy={y}
                  r="5"
                  className="fill-red-500 animate-ping opacity-60"
                />
                <circle
                  cx={x}
                  cy={y}
                  r="4"
                  className="fill-red-500 stroke-zinc-950 stroke-2"
                />
              </g>
            );
          })}

          {/* Hover Scrubbing Vertical Line */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={getX(hoverIndex)}
                y1={paddingTop}
                x2={getX(hoverIndex)}
                y2={paddingTop + innerHeight}
                stroke="#a1a1aa"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              {series.map((s) => {
                const val = samples[hoverIndex][s.key] as number | null;
                if (val === null || typeof val !== 'number') return null;
                return (
                  <circle
                    key={`hover-point-${s.key as string}`}
                    cx={getX(hoverIndex)}
                    cy={getY(val)}
                    r="4"
                    fill={s.color}
                    className="stroke-zinc-950 stroke-2"
                  />
                );
              })}
            </g>
          )}

          {/* Invisible Interactive Columns for Scrubbing */}
          {samples.map((_, i) => {
            const x = getX(i);
            const step = innerWidth / Math.max(1, samples.length - 1);
            return (
              <rect
                key={`hitbox-${i}`}
                x={x - step / 2}
                y={paddingTop}
                width={step}
                height={innerHeight}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIndex(i)}
              />
            );
          })}

          {/* Time axis labels */}
          <text
            x={paddingLeft}
            y={chartHeight - 4}
            className="fill-zinc-500 text-[9px] font-mono"
          >
            {samples[0]?.timestamp?.substring(11, 19)}
          </text>
          <text
            x={chartWidth - paddingRight}
            y={chartHeight - 4}
            textAnchor="end"
            className="fill-zinc-500 text-[9px] font-mono"
          >
            {samples[samples.length - 1]?.timestamp?.substring(11, 19)}
          </text>
        </svg>
      </div>
    </div>
  );
};

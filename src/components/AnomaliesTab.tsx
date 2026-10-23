import React, { useState } from 'react';
import { Anomaly, AnomalySeverity } from '../types/telemetry';
import { AlertCircle, CheckCircle2, Filter, ShieldAlert, ArrowRight } from 'lucide-react';

interface AnomaliesTabProps {
  anomalies: Anomaly[];
  onInvestigate: (anomaly: Anomaly) => void;
  onAcknowledge: (id: string) => void;
}

export const AnomaliesTab: React.FC<AnomaliesTabProps> = ({
  anomalies,
  onInvestigate,
  onAcknowledge,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<AnomalySeverity | 'all'>('all');

  const filtered = anomalies.filter(
    (a) => filterSeverity === 'all' || a.severity === filterSeverity
  );

  return (
    <div className="space-y-6">
      {/* Anomalies Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 rounded-xl border border-zinc-800 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-300">Severity Filter:</span>
          <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs font-mono">
            {(['all', 'critical', 'warning', 'info'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`px-2.5 py-1 rounded transition-colors uppercase ${
                  filterSeverity === sev
                    ? 'bg-amber-500/20 text-amber-300 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs font-mono text-zinc-500">
          Showing {filtered.length} of {anomalies.length} anomaly incident(s)
        </div>
      </div>

      {/* Anomalies List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-80" />
          <h4 className="text-sm font-semibold text-zinc-200">No Anomalies in Current Window</h4>
          <p className="text-xs text-zinc-500 font-mono mt-1 max-w-md mx-auto">
            All measured Linux subsystems (CPU, Memory, Swap, Storage I/O, Application Latency) are operating within normal baseline limits.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((anom) => {
            const isCritical = anom.severity === 'critical';
            return (
              <div
                key={anom.id}
                className={`rounded-xl border p-4 transition-all ${
                  isCritical
                    ? 'border-red-500/40 bg-red-950/15 hover:border-red-500/60'
                    : 'border-amber-500/30 bg-amber-950/10 hover:border-amber-500/50'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <ShieldAlert
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        isCritical ? 'text-red-400' : 'text-amber-400'
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                            isCritical
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {anom.severity}
                        </span>
                        <h4 className="text-sm font-semibold text-zinc-100 font-mono">
                          {anom.metricName}
                        </h4>
                        <span className="text-xs font-mono text-zinc-500">
                          {anom.detectedAt.substring(11, 19)} UTC
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-2 font-mono leading-relaxed">
                        {anom.explanation}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onAcknowledge(anom.id)}
                      className="px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 transition-colors font-mono"
                    >
                      Acknowledge
                    </button>
                    <button
                      onClick={() => onInvestigate(anom)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-600/40 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium text-amber-300 transition-colors font-mono"
                    >
                      <span>Investigate</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Subsystem Metric Comparison Strip */}
                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-400">
                  <div>
                    Observed:{' '}
                    <strong className="text-zinc-100">
                      {anom.observedValue} {anom.unit}
                    </strong>
                  </div>
                  <div>
                    Baseline Limit:{' '}
                    <strong className="text-zinc-400">
                      {anom.threshold} {anom.unit}
                    </strong>
                  </div>
                  <div>
                    Window: <span className="text-zinc-400">{anom.timeWindow}</span>
                  </div>
                  {anom.relatedMetrics && (
                    <div className="text-zinc-500">
                      Related: {JSON.stringify(anom.relatedMetrics)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

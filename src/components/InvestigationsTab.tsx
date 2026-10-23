import React from 'react';
import { Investigation, ConfidenceCategory } from '../types/telemetry';
import {
  HelpCircle,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  FlaskConical,
  Scale,
  BrainCircuit,
} from 'lucide-react';

interface InvestigationsTabProps {
  investigations: Investigation[];
  onStartExperiment: (investigation: Investigation) => void;
}

export const InvestigationsTab: React.FC<InvestigationsTabProps> = ({
  investigations,
  onStartExperiment,
}) => {
  const getCategoryBadge = (category: ConfidenceCategory) => {
    switch (category) {
      case 'high':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'medium':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'low':
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
      case 'inconclusive':
      default:
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
    }
  };

  return (
    <div className="space-y-6">
      {/* Engine Philosophy Banner */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 flex items-start gap-3">
        <Scale className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs font-mono text-zinc-300 leading-relaxed">
          <strong className="text-zinc-100">Causality & Uncertainty Principle:</strong> Correlation does not prove causation. Fireball isolates evidence, reports missing telemetry, and assigns transparent heuristic confidence without hardcoded assumptions or artificial certainty.
        </div>
      </div>

      {investigations.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
          <BrainCircuit className="w-10 h-10 text-zinc-500 mx-auto mb-3 opacity-60" />
          <h4 className="text-sm font-semibold text-zinc-200">No Open Diagnostic Hypotheses</h4>
          <p className="text-xs text-zinc-500 font-mono mt-1 max-w-md mx-auto">
            The diagnostic engine continuously evaluates timeseries correlation across memory, CPU, disk stats, and response latency.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {investigations.map((inv) => (
            <div
              key={inv.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4 hover:border-zinc-700 transition-all"
            >
              {/* Header with Title and Confidence */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${getCategoryBadge(
                        inv.confidenceCategory
                      )}`}
                    >
                      {inv.confidenceCategory} Confidence ({inv.confidenceScore}%)
                    </span>
                    <span className="text-xs font-mono text-zinc-500">
                      Rule: {inv.diagnosticRule}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100 mt-2 font-mono">
                    {inv.title}
                  </h3>
                </div>

                <button
                  onClick={() => onStartExperiment(inv)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-600/50 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-300 font-mono transition-colors"
                >
                  <FlaskConical className="w-4 h-4" />
                  <span>Verify via Experiment</span>
                </button>
              </div>

              {/* Problem & Hypothesis */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block mb-1">
                    Observed Problem
                  </span>
                  <p className="text-zinc-300">{inv.problemSummary}</p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/80">
                  <span className="text-[10px] uppercase font-bold text-amber-400/90 tracking-wider block mb-1">
                    Diagnostic Hypothesis
                  </span>
                  <p className="text-zinc-200">{inv.hypothesis}</p>
                </div>
              </div>

              {/* Supporting Evidence vs Conflicting/Missing Evidence */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                {/* Supporting */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Supporting Evidence ({inv.supportingEvidence.length})
                  </span>
                  <ul className="space-y-1.5 text-zinc-300 pl-1">
                    {inv.supportingEvidence.map((ev, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">•</span>
                        <span>{ev}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Conflicting or Missing */}
                <div className="space-y-2">
                  <span className="text-[11px] font-semibold text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Conflicting or Missing Evidence ({inv.conflictingOrMissingEvidence.length})
                  </span>
                  <ul className="space-y-1.5 text-zinc-400 pl-1">
                    {inv.conflictingOrMissingEvidence.map((ev, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-500 mt-0.5">•</span>
                        <span>{ev}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Explanation of Rule */}
              <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800 text-xs font-mono text-zinc-400">
                <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block mb-1">
                  Transparent Heuristic Explanation
                </span>
                <p>{inv.ruleExplanation}</p>
              </div>

              {/* Recommended Next Steps */}
              {inv.recommendedNextSteps.length > 0 && (
                <div className="text-xs font-mono pt-2 border-t border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider block mb-1">
                    Recommended Investigation Steps:
                  </span>
                  <ul className="space-y-1 text-zinc-300">
                    {inv.recommendedNextSteps.map((step, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-amber-400">→</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

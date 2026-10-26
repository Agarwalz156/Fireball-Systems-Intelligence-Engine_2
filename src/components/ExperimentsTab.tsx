import React, { useState } from 'react';
import {
  TelemetrySample,
  Experiment,
  ExperimentOutcome,
} from '../types/telemetry';
import { compareExperimentPeriods } from '../engine/experimentEngine';
import {
  FlaskConical,
  Play,
  CheckCircle,
  XCircle,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  History,
  Sparkles,
  RefreshCw,
  Layers,
} from 'lucide-react';

interface ExperimentsTabProps {
  samples: TelemetrySample[];
  experiments: Experiment[];
  onSaveExperiment: (exp: Experiment) => void;
  onTriggerWorkload: (type: 'cpu' | 'memory', durationSec?: number) => void;
  isWorkloadRunning: boolean;
  onRefreshFeed?: () => Promise<void> | void;
  selectedMachineId?: string;
}

export const ExperimentsTab: React.FC<ExperimentsTabProps> = ({
  samples,
  experiments,
  onSaveExperiment,
  onTriggerWorkload,
  isWorkloadRunning,
  onRefreshFeed,
  selectedMachineId,
}) => {
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [intervention, setIntervention] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isPopulating, setIsPopulating] = useState(false);
  const [populateSuccess, setPopulateSuccess] = useState<string | null>(null);

  // Split partition slider state
  const totalSamples = samples.length;
  const defaultSplit = Math.max(1, Math.floor(totalSamples / 2));
  const [splitIndex, setSplitIndex] = useState<number>(defaultSplit);

  // Ensure splitIndex stays within valid bounds
  const validSplit = totalSamples >= 2
    ? Math.min(totalSamples - 1, Math.max(1, splitIndex <= totalSamples ? splitIndex : defaultSplit))
    : 1;

  const liveBaseline = samples.slice(0, validSplit);
  const livePost = samples.slice(validSplit);

  const comparison = compareExperimentPeriods({
    baselineSamples: liveBaseline,
    postSamples: livePost,
    targetMetric: 'httpLatencyMs',
  });

  // Action to provide required samples (>= 3 per phase)
  const handlePopulateExperimentSamples = async (countPerPhase: number = 6) => {
    setIsPopulating(true);
    setPopulateSuccess(null);
    try {
      const res = await fetch('/api/experiment/populate-samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machineId: selectedMachineId || samples[0]?.machineId,
          countPerPhase,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPopulateSuccess(`✓ Successfully provided ${countPerPhase} baseline and ${countPerPhase} post-intervention samples! Experiment is now statistically comparable.`);
        if (onRefreshFeed) {
          await onRefreshFeed();
        }
        setSplitIndex(countPerPhase);
        setTimeout(() => setPopulateSuccess(null), 5000);
      }
    } catch (err: any) {
      console.error('Failed to populate experiment samples:', err);
    } finally {
      setIsPopulating(false);
    }
  };

  const handleCreateExperiment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !hypothesis || !intervention) return;

    const newExp: Experiment = {
      id: `exp-${Date.now()}`,
      machineId: samples[0]?.machineId || selectedMachineId || 'host-localhost',
      ownerId: 'current-user',
      title,
      description: `Controlled trial evaluating: ${hypothesis}`,
      hypothesis,
      intervention,
      baselineStartTime: liveBaseline[0]?.timestamp || new Date().toISOString(),
      baselineEndTime: liveBaseline[liveBaseline.length - 1]?.timestamp || new Date().toISOString(),
      postStartTime: livePost[0]?.timestamp || new Date().toISOString(),
      postEndTime: livePost[livePost.length - 1]?.timestamp || new Date().toISOString(),
      baselineSampleCount: liveBaseline.length,
      postSampleCount: livePost.length,
      minimumRequiredSamples: 3,
      isStatisticallyComparable: comparison.isComparable,
      incomparableReason: comparison.incomparableReason,
      deltas: comparison.deltas,
      outcome: comparison.outcome,
      evaluationNotes: comparison.evaluationNotes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSaveExperiment(newExp);
    setTitle('');
    setHypothesis('');
    setIntervention('');
    setIsFormOpen(false);
  };

  const getOutcomeBadge = (outcome: ExperimentOutcome) => {
    switch (outcome) {
      case 'supported':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle className="w-3.5 h-3.5" />
            Hypothesis Supported
          </span>
        );
      case 'refuted':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold uppercase bg-red-500/20 text-red-300 border border-red-500/40">
            <XCircle className="w-3.5 h-3.5" />
            Hypothesis Refuted
          </span>
        );
      case 'inconclusive':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-bold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            <HelpCircle className="w-3.5 h-3.5" />
            Inconclusive
          </span>
        );
    }
  };

  const isInsufficient = liveBaseline.length < 3 || livePost.length < 3;

  return (
    <div className="space-y-6">
      {/* Safe Controlled Workload Banner & Sample Generator */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-4 font-mono">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-amber-400" />
            <span>Controlled Experiment Sample Controls</span>
          </h4>
          <p className="text-xs text-zinc-400 mt-0.5">
            Statistical hypothesis verification requires a minimum of 3 baseline and 3 post-intervention samples.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* 1-Click Button to provide >= 3 samples per phase */}
          <button
            onClick={() => handlePopulateExperimentSamples(6)}
            disabled={isPopulating}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-xs font-bold text-amber-300 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            title="Populates 6 baseline and 6 post-intervention telemetry samples to satisfy statistical comparability"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isPopulating ? 'animate-spin' : ''}`} />
            <span>{isPopulating ? 'Providing Samples...' : 'Provide 6 Baseline + 6 Post Samples'}</span>
          </button>

          <button
            onClick={() => onTriggerWorkload('cpu', 10)}
            disabled={isWorkloadRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 text-amber-400" />
            <span>{isWorkloadRunning ? 'Workload Active...' : 'Run CPU Load (10s)'}</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {populateSuccess && (
        <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs font-mono flex items-center justify-between">
          <span>{populateSuccess}</span>
          <button onClick={() => setPopulateSuccess(null)} className="text-emerald-500 hover:text-emerald-300">✕</button>
        </div>
      )}

      {/* Live Pre/Post Intervention Comparator */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4 font-mono">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <span>Controlled Baseline vs Post-Intervention Comparison</span>
              {comparison.isComparable ? (
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold uppercase">
                  Statistically Valid
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold uppercase">
                  Awaiting Samples
                </span>
              )}
            </h3>
            <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1">
              <span className={`flex items-center gap-1 ${liveBaseline.length >= 3 ? 'text-emerald-400 font-semibold' : 'text-amber-300'}`}>
                Baseline: {liveBaseline.length} sample{liveBaseline.length !== 1 ? 's' : ''} {liveBaseline.length >= 3 ? '✓' : '(need 3+)'}
              </span>
              <span className="text-zinc-600">|</span>
              <span className={`flex items-center gap-1 ${livePost.length >= 3 ? 'text-emerald-400 font-semibold' : 'text-amber-300'}`}>
                Post-Intervention: {livePost.length} sample{livePost.length !== 1 ? 's' : ''} {livePost.length >= 3 ? '✓' : '(need 3+)'}
              </span>
              <span className="text-zinc-600">|</span>
              <span className="text-zinc-400">Total Buffer: {totalSamples} samples</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {getOutcomeBadge(comparison.outcome)}
            <button
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 transition-colors cursor-pointer"
            >
              {isFormOpen ? 'Cancel' : '+ Record Experiment'}
            </button>
          </div>
        </div>

        {/* Insufficient Sample Size Banner with Direct Solution */}
        {isInsufficient && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 text-xs space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-bold text-amber-200">
                  Insufficient Sample Size for Statistical Comparability
                </h4>
                <p className="text-zinc-300 leading-relaxed">
                  {comparison.incomparableReason || `Baseline currently has ${liveBaseline.length} sample(s), and intervention has ${livePost.length} sample(s). Fireball strictly enforces Rule #0 (Sample Sufficiency Gate): minimum 3 samples per phase required to eliminate random noise and calculate verified mean, median, p95 percentiles.`}
                </p>
              </div>
            </div>

            <div className="pt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handlePopulateExperimentSamples(6)}
                disabled={isPopulating}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isPopulating ? 'Providing Samples...' : 'Provide 6 Baseline + 6 Post Samples Now'}</span>
              </button>

              <span className="text-[11px] text-zinc-400">
                Immediately seeds 6 pre-intervention and 6 post-intervention cycles.
              </span>
            </div>
          </div>
        )}

        {/* Partition Adjustment Slider if totalSamples > 2 */}
        {totalSamples >= 4 && (
          <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs space-y-1.5">
            <div className="flex justify-between items-center text-zinc-400">
              <span className="font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                Phase Boundary Split (Baseline / Post Ratio)
              </span>
              <span className="text-zinc-200">
                Baseline: <strong className="text-amber-300">{validSplit}</strong> | Post: <strong className="text-sky-300">{totalSamples - validSplit}</strong>
              </span>
            </div>
            <input
              type="range"
              min="1"
              max={Math.max(2, totalSamples - 1)}
              value={validSplit}
              onChange={(e) => setSplitIndex(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-zinc-500">
              <span>Earlier (Longer Post)</span>
              <span>Split Point: Sample #{validSplit} of {totalSamples}</span>
              <span>Later (Longer Baseline)</span>
            </div>
          </div>
        )}

        {/* Experiment Creation Modal / Form */}
        {isFormOpen && (
          <form onSubmit={handleCreateExperiment} className="p-4 rounded-lg bg-zinc-950 border border-zinc-800 space-y-3">
            <div>
              <label className="text-[11px] font-mono text-zinc-400 block mb-1">
                Experiment Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Node.js heap limit increase to 2GB"
                className="w-full px-3 py-1.5 text-xs font-mono rounded bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-zinc-400 block mb-1">
                Hypothesis
              </label>
              <input
                type="text"
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder="e.g. Increasing heap limit avoids frequent V8 GC sweeps, reducing p95 latency."
                className="w-full px-3 py-1.5 text-xs font-mono rounded bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-mono text-zinc-400 block mb-1">
                Applied Intervention / Configuration Change
              </label>
              <input
                type="text"
                value={intervention}
                onChange={(e) => setIntervention(e.target.value)}
                placeholder="e.g. Set NODE_OPTIONS='--max-old-space-size=2048'"
                className="w-full px-3 py-1.5 text-xs font-mono rounded bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-amber-500"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold font-mono transition-colors cursor-pointer"
              >
                Save Experiment
              </button>
            </div>
          </form>
        )}

        {/* Delta Metrics Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="pb-2 font-medium">METRIC</th>
                <th className="pb-2 font-medium">BASELINE MEAN</th>
                <th className="pb-2 font-medium">POST MEAN</th>
                <th className="pb-2 font-medium">ABS CHANGE</th>
                <th className="pb-2 font-medium">PERCENT CHANGE</th>
                <th className="pb-2 font-medium text-right">EVALUATION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {comparison.deltas.map((d, i) => {
                const isPositive = d.percentageChange !== null && d.percentageChange > 0;
                return (
                  <tr key={i} className="hover:bg-zinc-800/40">
                    <td className="py-2.5 font-semibold text-zinc-100">{d.metricName}</td>
                    <td className="py-2.5">
                      {d.baseline.mean !== null ? `${d.baseline.mean} ${d.baseline.unit}` : '--'}
                    </td>
                    <td className="py-2.5">
                      {d.postIntervention.mean !== null ? `${d.postIntervention.mean} ${d.postIntervention.unit}` : '--'}
                    </td>
                    <td className="py-2.5 font-bold">
                      {d.absoluteChange !== null ? (d.absoluteChange > 0 ? `+${d.absoluteChange}` : d.absoluteChange) : '--'} {d.baseline.unit}
                    </td>
                    <td className="py-2.5 font-bold">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          d.isImprovement
                            ? 'text-emerald-400'
                            : d.isImprovement === false
                            ? 'text-red-400'
                            : 'text-zinc-400'
                        }`}
                      >
                        {d.isImprovement ? (
                          <TrendingDown className="w-3.5 h-3.5" />
                        ) : (
                          <TrendingUp className="w-3.5 h-3.5" />
                        )}
                        {d.percentageChange !== null ? `${d.percentageChange > 0 ? '+' : ''}${d.percentageChange}%` : '--'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                          d.isImprovement
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : d.isImprovement === false
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {d.isImprovement ? 'Improved' : d.isImprovement === false ? 'Degraded' : 'Neutral'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Evaluation Notes & Scientific Uncertainty Disclaimer */}
        <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs font-mono text-zinc-400">
          <p>{comparison.evaluationNotes}</p>
        </div>
      </div>

      {/* Recorded Historical Experiments */}
      {experiments.length > 0 && (
        <div className="space-y-4 font-mono">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <History className="w-4 h-4" />
            Saved Experiment History ({experiments.length})
          </h4>
          <div className="space-y-3">
            {experiments.map((exp) => (
              <div key={exp.id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <h5 className="font-semibold text-zinc-100 text-sm">{exp.title}</h5>
                  {getOutcomeBadge(exp.outcome)}
                </div>
                <p className="text-zinc-300"><strong>Hypothesis:</strong> {exp.hypothesis}</p>
                <p className="text-zinc-400"><strong>Intervention:</strong> {exp.intervention}</p>
                <div className="text-zinc-500 text-[10px] pt-1">
                  Recorded at: {exp.createdAt} | Baseline samples: {exp.baselineSampleCount} | Post samples: {exp.postSampleCount}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

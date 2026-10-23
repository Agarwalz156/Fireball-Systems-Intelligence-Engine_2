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
} from 'lucide-react';

interface ExperimentsTabProps {
  samples: TelemetrySample[];
  experiments: Experiment[];
  onSaveExperiment: (exp: Experiment) => void;
  onTriggerWorkload: (type: 'cpu' | 'memory', durationSec?: number) => void;
  isWorkloadRunning: boolean;
}

export const ExperimentsTab: React.FC<ExperimentsTabProps> = ({
  samples,
  experiments,
  onSaveExperiment,
  onTriggerWorkload,
  isWorkloadRunning,
}) => {
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [intervention, setIntervention] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Active experiment evaluation state
  const [baselineCount, setBaselineCount] = useState(10);
  const [postCount, setPostCount] = useState(10);

  // Compute live comparison from current sample buffer
  const totalSamples = samples.length;
  const half = Math.floor(totalSamples / 2);
  const liveBaseline = samples.slice(0, half);
  const livePost = samples.slice(half);

  const comparison = compareExperimentPeriods({
    baselineSamples: liveBaseline,
    postSamples: livePost,
    targetMetric: 'httpLatencyMs',
  });

  const handleCreateExperiment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !hypothesis || !intervention) return;

    const newExp: Experiment = {
      id: `exp-${Date.now()}`,
      machineId: samples[0]?.machineId || 'host-localhost',
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

  return (
    <div className="space-y-6">
      {/* Safe Controlled Workload Banner */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Safe Controlled Workload Generators
          </h4>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            Safely simulate system conditions (bounded CPU burn or memory touch) to test diagnostic accuracy.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onTriggerWorkload('cpu', 10)}
            disabled={isWorkloadRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-600/50 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-300 font-mono transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {isWorkloadRunning ? 'Workload Active...' : 'Run CPU Load (10s)'}
          </button>

          <button
            onClick={() => onTriggerWorkload('memory', 10)}
            disabled={isWorkloadRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-600/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-semibold text-cyan-300 font-mono transition-colors disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {isWorkloadRunning ? 'Workload Active...' : 'Run Memory Load (10s)'}
          </button>
        </div>
      </div>

      {/* Live Pre/Post Intervention Comparator */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 font-mono">
              Controlled Baseline vs Post-Intervention Comparison
            </h3>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Baseline: {liveBaseline.length} samples | Post-Intervention: {livePost.length} samples
            </p>
          </div>

          <div className="flex items-center gap-3">
            {getOutcomeBadge(comparison.outcome)}
            <button
              onClick={() => setIsFormOpen(!isFormOpen)}
              className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 transition-colors"
            >
              {isFormOpen ? 'Cancel' : '+ Record Experiment'}
            </button>
          </div>
        </div>

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
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold font-mono transition-colors"
              >
                Save Experiment
              </button>
            </div>
          </form>
        )}

        {/* Statistical Sample Count Validation */}
        {!comparison.isComparable && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/40 text-xs font-mono text-indigo-300">
            <AlertTriangle className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>{comparison.incomparableReason}</span>
          </div>
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
                      {d.baseline.mean} {d.baseline.unit}
                    </td>
                    <td className="py-2.5">
                      {d.postIntervention.mean} {d.postIntervention.unit}
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
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <History className="w-4 h-4" />
            Saved Experiment History ({experiments.length})
          </h4>
          <div className="space-y-3">
            {experiments.map((exp) => (
              <div key={exp.id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60 text-xs font-mono space-y-2">
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

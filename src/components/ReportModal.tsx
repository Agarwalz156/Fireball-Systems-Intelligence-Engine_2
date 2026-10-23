import React, { useState } from 'react';
import { TelemetrySample, Anomaly, Investigation, Experiment, Machine } from '../types/telemetry';
import { X, Copy, Download, Check, FileText } from 'lucide-react';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: Machine | null;
  samples: TelemetrySample[];
  anomalies: Anomaly[];
  investigations: Investigation[];
  experiments: Experiment[];
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  machine,
  samples,
  anomalies,
  investigations,
  experiments,
}) => {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<'markdown' | 'json'>('markdown');

  if (!isOpen) return null;

  const now = new Date().toISOString();
  const avgCpu = samples.length > 0
    ? (samples.reduce((a, s) => a + s.cpuPercent, 0) / samples.length).toFixed(1)
    : 'N/A';
  const avgMem = samples.length > 0
    ? (samples.reduce((a, s) => a + s.memoryPercent, 0) / samples.length).toFixed(1)
    : 'N/A';

  const markdownReport = `# Fireball Diagnostic & Investigation Incident Report

**Generated:** ${now}  
**Target Host:** \`${machine?.hostname || 'localhost'}\` (${machine?.kernel || 'Linux'}, ${machine?.cpuCores || 2} Cores)  
**Agent Version:** v${machine?.agentVersion || '1.0.0-mvp'}  
**Observed Sample Count:** ${samples.length}  

---

## 1. Executive Telemetry Summary
- **Average CPU Utilization:** ${avgCpu}%
- **Average Memory Allocation:** ${avgMem}%
- **Linux PSI Pressure Support:** ${machine?.capabilities?.hasPsi ? 'Active (/proc/pressure)' : 'Unavailable / Unmounted'}
- **Active Anomalies Detected:** ${anomalies.filter((a) => a.status === 'active').length}

---

## 2. Evidence-Backed Diagnostic Hypotheses
${investigations.length === 0 ? '_No diagnostic hypotheses triggered._' : investigations.map((inv, idx) => `
### Hypothesis ${idx + 1}: ${inv.title}
- **Confidence Rating:** ${inv.confidenceCategory.toUpperCase()} (${inv.confidenceScore}%)
- **Diagnostic Rule:** \`${inv.diagnosticRule}\`
- **Observed Problem:** ${inv.problemSummary}
- **Underlying Cause Hypothesis:** ${inv.hypothesis}

**Supporting Measurements:**
${inv.supportingEvidence.map((e) => `- [x] ${e}`).join('\n')}

**Conflicting or Missing Telemetry:**
${inv.conflictingOrMissingEvidence.map((e) => `- [ ] ${e}`).join('\n')}

**Scientific Uncertainty & Rule Rationale:**
> ${inv.ruleExplanation}

**Recommended Experimentation / Action:**
${inv.recommendedNextSteps.map((s) => `1. ${s}`).join('\n')}
`).join('\n')}

---

## 3. Controlled Experiment Verification
${experiments.length === 0 ? '_No controlled intervention experiments recorded yet._' : experiments.map((exp) => `
### Trial: ${exp.title}
- **Hypothesis:** ${exp.hypothesis}
- **Applied Intervention:** \`${exp.intervention}\`
- **Empirical Outcome:** **${exp.outcome.toUpperCase()}**
- **Evaluation Notes:** ${exp.evaluationNotes}
`).join('\n')}

---
*Report generated via Fireball — Systems Intelligence Engine.*
`;

  const jsonReport = JSON.stringify(
    {
      reportMetadata: {
        generatedAt: now,
        machine,
        sampleCount: samples.length,
      },
      summary: {
        avgCpu,
        avgMem,
        activeAnomaliesCount: anomalies.filter((a) => a.status === 'active').length,
      },
      anomalies,
      investigations,
      experiments,
    },
    null,
    2
  );

  const activeContent = format === 'markdown' ? markdownReport : jsonReport;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext = format === 'markdown' ? 'md' : 'json';
    const blob = new Blob([activeContent], {
      type: format === 'markdown' ? 'text/markdown' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fireball-investigation-report-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-100 font-mono">
              Export Diagnostic & Investigation Report
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selector & Actions Bar */}
        <div className="flex items-center justify-between p-3 border-b border-zinc-800/80 bg-zinc-950/40 text-xs font-mono">
          <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setFormat('markdown')}
              className={`px-3 py-1 rounded transition-colors ${
                format === 'markdown'
                  ? 'bg-amber-500/20 text-amber-300 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Markdown (.md)
            </button>
            <button
              onClick={() => setFormat('json')}
              className={`px-3 py-1 rounded transition-colors ${
                format === 'json'
                  ? 'bg-amber-500/20 text-amber-300 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              JSON (.json)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy to Clipboard'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File</span>
            </button>
          </div>
        </div>

        {/* Code Content Preview */}
        <div className="p-4 overflow-y-auto flex-1 font-mono text-xs text-zinc-300 bg-zinc-950/80 leading-relaxed whitespace-pre-wrap select-text">
          {activeContent}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import {
  Activity,
  Flame,
  LayoutDashboard,
  LineChart,
  ShieldAlert,
  BrainCircuit,
  FlaskConical,
  Terminal,
  FileDown,
  LogIn,
  LogOut,
  RefreshCw,
  Server,
  Zap,
} from 'lucide-react';
import { Machine, TelemetrySample, Anomaly, Investigation, Experiment, AlertRulesConfig } from './types/telemetry';
import { OverviewTab } from './components/OverviewTab';
import { PerformanceTab } from './components/PerformanceTab';
import { AnomaliesTab } from './components/AnomaliesTab';
import { InvestigationsTab } from './components/InvestigationsTab';
import { ExperimentsTab } from './components/ExperimentsTab';
import { AgentTab } from './components/AgentTab';
import { AdminTab } from './components/AdminTab';
import { QuickStatsBar } from './components/QuickStatsBar';
import { ReportModal } from './components/ReportModal';

type TabType = 'overview' | 'performance' | 'anomalies' | 'investigations' | 'experiments' | 'agent' | 'admin';

export default function App() {
  const { user, signInWithGoogle, signOut, isFirebaseConnected } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('win-localhost');
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  const [isLive, setIsLive] = useState<boolean>(true);
  const [isSampling, setIsSampling] = useState<boolean>(false);
  const [isWorkloadRunning, setIsWorkloadRunning] = useState<boolean>(false);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [workloadBanner, setWorkloadBanner] = useState<string | null>(null);

  // Fetch telemetry feed from backend
  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`/api/telemetry/feed?machineId=${encodeURIComponent(selectedMachineId)}&limit=120`);
      if (res.ok) {
        const data = await res.json();
        if (data.machine) {
          // If server returned live streaming machine, auto-align selection
          if (data.machine.id && data.samples && data.samples.length > 0) {
            setSelectedMachineId((cur) => (cur !== data.machine.id ? data.machine.id : cur));
          }
          setMachines((prev) => {
            const exists = prev.some((m) => m.id === data.machine.id);
            if (!exists) return [...prev, data.machine];
            return prev.map((m) => (m.id === data.machine.id ? data.machine : m));
          });
        }
        if (Array.isArray(data.samples)) {
          setSamples(data.samples);
        }
        if (Array.isArray(data.anomalies)) {
          setAnomalies(data.anomalies);
        }
        if (Array.isArray(data.investigations)) {
          setInvestigations(data.investigations);
        }
      }
    } catch (err) {
      console.warn('Telemetry feed fetch error:', err);
    }
  }, [selectedMachineId]);

  // Query machine list
  const fetchMachines = useCallback(async () => {
    try {
      const res = await fetch('/api/machines');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.machines) && data.machines.length > 0) {
          setMachines(data.machines);
          setSelectedMachineId((current) => {
            // If current machine is connected, keep it
            const currentObj = data.machines.find((m: Machine) => m.id === current);
            if (currentObj && currentObj.connectionStatus === 'connected') {
              return current;
            }
            // Auto-select whichever machine is currently connected
            const connected = data.machines.find((m: Machine) => m.connectionStatus === 'connected');
            if (connected) return connected.id;
            // Otherwise, keep current if valid, else fallback to first
            const exists = data.machines.some((m: Machine) => m.id === current);
            return exists ? current : data.machines[0].id;
          });
        }
      }
    } catch (err) {
      console.warn('Machines fetch error:', err);
    }
  }, []);

  // Check URL path/hash on mount for direct /admin navigation
  useEffect(() => {
    if (window.location.pathname === '/admin' || window.location.hash === '#admin') {
      setActiveTab('admin');
    }
  }, []);

  // Polling loop when live
  useEffect(() => {
    fetchMachines();
    fetchFeed();

    if (!isLive) return;

    const interval = setInterval(() => {
      fetchMachines();
      fetchFeed();
    }, 2000);

    return () => clearInterval(interval);
  }, [isLive, fetchFeed, fetchMachines]);

  // Sample local host immediately
  const handleSampleLocal = async () => {
    setIsSampling(true);
    try {
      await fetch('/api/system/sample', { method: 'POST' });
      await fetchFeed();
    } catch (err) {
      console.error('Failed to trigger local sample:', err);
    } finally {
      setIsSampling(false);
    }
  };

  // Safe bounded demo workload
  const handleTriggerWorkload = async (type: 'cpu' | 'memory', durationSec: number = 10) => {
    setIsWorkloadRunning(true);
    setWorkloadBanner(`Safe ${type.toUpperCase()} workload running for ${durationSec}s. Real CPU/RAM telemetry will reflect load.`);
    try {
      await fetch('/api/workload/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, duration: durationSec }),
      });
      // Poll faster during workload
      const poll = setInterval(() => fetchFeed(), 1000);
      setTimeout(() => {
        clearInterval(poll);
        setIsWorkloadRunning(false);
        setWorkloadBanner(null);
        fetchFeed();
      }, (durationSec + 2) * 1000);
    } catch (err) {
      console.error('Workload error:', err);
      setIsWorkloadRunning(false);
      setWorkloadBanner(null);
    }
  };

  const handleAcknowledgeAnomaly = (id: string) => {
    setAnomalies((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'acknowledged' } : a))
    );
  };

  const handleInvestigateAnomaly = (anomaly: Anomaly) => {
    setActiveTab('investigations');
  };

  const handleStartExperiment = (investigation: Investigation) => {
    setActiveTab('experiments');
  };

  const handleSaveExperiment = (exp: Experiment) => {
    setExperiments((prev) => [exp, ...prev]);
  };

  const handleUpdateAlertRules = async (machineId: string, rules: AlertRulesConfig) => {
    const res = await fetch('/api/machines/alert-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId, alertRules: rules }),
    });
    if (!res.ok) throw new Error('Failed to update alert rules');
    const data = await res.json();
    setMachines((prev) =>
      prev.map((m) => (m.id === machineId ? { ...m, alertRules: data.alertRules } : m))
    );
  };

  const activeMachine = machines.find((m) => m.id === selectedMachineId) || machines[0] || null;
  const latestSample = samples.length > 0 ? samples[samples.length - 1] : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/80 backdrop-blur-md sticky top-0 z-40 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Product Promise */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-600 to-red-500 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-zinc-100">FIREBALL</span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-800 text-amber-400 font-semibold border border-zinc-700">
                  SYSTEMS INTELLIGENCE
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 font-mono hidden sm:block">
                Linux telemetry anomaly detection & evidence-backed hypothesis engine
              </p>
            </div>
          </div>

          {/* Machine Selector & Global Actions */}
          <div className="flex items-center gap-2">
            {/* Machine Selector Dropdown */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-xs font-mono text-zinc-200">
              <Server className="w-3.5 h-3.5 text-zinc-400" />
              <select
                value={selectedMachineId}
                onChange={(e) => setSelectedMachineId(e.target.value)}
                className="bg-transparent focus:outline-none cursor-pointer text-xs"
              >
                {machines.map((m) => (
                  <option key={m.id} value={m.id} className="bg-zinc-900 text-zinc-100">
                    {m.hostname} ({m.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Export Report Trigger */}
            <button
              onClick={() => setIsReportOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs font-mono text-zinc-300 transition-colors cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Export Report</span>
            </button>

            {/* Quick Admin Console Header Trigger */}
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-mono font-semibold transition-all cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 shadow-sm'
                  : 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300'
              }`}
              title="Open Admin Console"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Admin Console</span>
            </button>

            {/* Firebase Auth Controls */}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-zinc-400 hidden md:inline">
                  {user.email || 'Authenticated User'}
                </span>
                <button
                  onClick={signOut}
                  className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={signInWithGoogle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs font-mono transition-colors shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Workload Active Alert Bar */}
      {workloadBanner && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs font-mono text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 animate-pulse text-amber-400" />
            <span>{workloadBanner}</span>
          </div>
          <span className="text-[10px] uppercase font-bold text-amber-400/80">Active Benchmark</span>
        </div>
      )}

      {/* Tab Navigation Navigation Bar */}
      <nav className="border-b border-zinc-800 bg-zinc-900/40 px-4">
        <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto py-2 select-none">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors shrink-0 ${
              activeTab === 'overview'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('performance')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors shrink-0 ${
              activeTab === 'performance'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>Performance & Charts</span>
          </button>

          <button
            onClick={() => setActiveTab('anomalies')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors shrink-0 ${
              activeTab === 'anomalies'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Anomalies</span>
            {anomalies.filter((a) => a.status === 'active').length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-red-500 text-white font-bold">
                {anomalies.filter((a) => a.status === 'active').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('investigations')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors shrink-0 ${
              activeTab === 'investigations'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span>Investigations</span>
            {investigations.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40">
                {investigations.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('experiments')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors shrink-0 ${
              activeTab === 'experiments'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Controlled Experiments</span>
          </button>

          <button
            onClick={() => setActiveTab('agent')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors shrink-0 ${
              activeTab === 'agent'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Cross-Platform Agent</span>
          </button>

          <button
            onClick={() => setActiveTab('admin')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors shrink-0 ${
              activeTab === 'admin'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Admin Portal</span>
          </button>
        </div>
      </nav>

      {/* Quick Stats Summary Widget */}
      <QuickStatsBar
        machine={activeMachine}
        latestSample={latestSample}
        anomalies={anomalies}
      />

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full p-4 md:p-6 flex-1">
        {activeTab === 'overview' && (
          <OverviewTab
            machine={activeMachine}
            latestSample={latestSample}
            anomalies={anomalies}
            onTriggerWorkload={handleTriggerWorkload}
            onSampleLocal={handleSampleLocal}
            isSampling={isSampling}
          />
        )}

        {activeTab === 'performance' && (
          <PerformanceTab
            samples={samples}
            anomalies={anomalies}
            isLive={isLive}
            onToggleLive={() => setIsLive(!isLive)}
          />
        )}

        {activeTab === 'anomalies' && (
          <AnomaliesTab
            anomalies={anomalies}
            onInvestigate={handleInvestigateAnomaly}
            onAcknowledge={handleAcknowledgeAnomaly}
          />
        )}

        {activeTab === 'investigations' && (
          <InvestigationsTab
            investigations={investigations}
            onStartExperiment={handleStartExperiment}
          />
        )}

        {activeTab === 'experiments' && (
          <ExperimentsTab
            samples={samples}
            experiments={experiments}
            onSaveExperiment={handleSaveExperiment}
            onTriggerWorkload={handleTriggerWorkload}
            isWorkloadRunning={isWorkloadRunning}
            onRefreshFeed={fetchFeed}
            selectedMachineId={selectedMachineId}
          />
        )}

        {activeTab === 'agent' && (
          <AgentTab
            machine={activeMachine}
            latestSample={latestSample}
            onRefreshMachine={fetchMachines}
            onUpdateAlertRules={handleUpdateAlertRules}
            onTriggerWorkload={handleTriggerWorkload}
          />
        )}

        {activeTab === 'admin' && (
          <AdminTab
            machines={machines}
            onRefreshMachines={fetchMachines}
          />
        )}
      </main>

      {/* Export Report Modal */}
      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        machine={activeMachine}
        samples={samples}
        anomalies={anomalies}
        investigations={investigations}
        experiments={experiments}
      />
    </div>
  );
}

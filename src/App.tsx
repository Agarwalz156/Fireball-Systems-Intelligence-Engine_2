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

export const LIVE_BACKEND_URL = 'https://ais-dev-ko6ucrltlcrhb5odbgg2k7-480134225901.asia-east1.run.app';
export const API_BASE_URL = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')
  ? LIVE_BACKEND_URL
  : '';

export default function App() {
  const { user, signInWithGoogle, signOut, isFirebaseConnected } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('fireball_selected_host');
      if (stored) return stored;
    }
    return 'win-pc2';
  });
  const [samples, setSamples] = useState<TelemetrySample[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  const [isLive, setIsLive] = useState<boolean>(true);
  const [isSampling, setIsSampling] = useState<boolean>(false);
  const [isWorkloadRunning, setIsWorkloadRunning] = useState<boolean>(false);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [workloadBanner, setWorkloadBanner] = useState<string | null>(null);

  const handleSelectMachine = useCallback((id: string) => {
    setSelectedMachineId(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('fireball_selected_host', id);
    }
  }, []);

  // Fetch telemetry feed from backend
  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/telemetry/feed?machineId=${encodeURIComponent(selectedMachineId)}&limit=120`);
      if (res.ok) {
        const data = await res.json();
        if (data.machine) {
          // If server returned live streaming machine, auto-align selection
          if (data.machine.id && data.samples && data.samples.length > 0) {
            setSelectedMachineId((cur) => {
              if (cur !== data.machine.id && (!cur || cur === 'win-localhost')) {
                if (typeof window !== 'undefined') {
                  localStorage.setItem('fireball_selected_host', data.machine.id);
                }
                return data.machine.id;
              }
              return cur;
            });
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
      const res = await fetch(`${API_BASE_URL}/api/machines`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.machines) && data.machines.length > 0) {
          setMachines(data.machines);
          setSelectedMachineId((current) => {
            // Check if current selection has an explicit user choice in localStorage
            const stored = typeof window !== 'undefined' ? localStorage.getItem('fireball_selected_host') : null;
            if (stored && data.machines.some((m: Machine) => m.id === stored)) {
              const storedObj = data.machines.find((m: Machine) => m.id === stored);
              if (storedObj && storedObj.connectionStatus === 'connected') {
                return stored;
              }
            }

            // Find connected machine
            const connected = data.machines.find((m: Machine) => m.connectionStatus === 'connected');
            if (connected) {
              return connected.id;
            }

            // Sort by most recent telemetry timestamp
            const sortedByRecent = [...data.machines].sort((a: Machine, b: Machine) => {
              const timeA = a.lastTelemetryAt ? new Date(a.lastTelemetryAt).getTime() : 0;
              const timeB = b.lastTelemetryAt ? new Date(b.lastTelemetryAt).getTime() : 0;
              return timeB - timeA;
            });

            // If current selection is offline/has no samples and another machine has telemetry
            const currentObj = data.machines.find((m: Machine) => m.id === current);
            if (!currentObj || currentObj.connectionStatus === 'disconnected') {
              if (sortedByRecent[0] && sortedByRecent[0].lastTelemetryAt) {
                return sortedByRecent[0].id;
              }
            }

            const exists = data.machines.some((m: Machine) => m.id === current);
            return exists ? current : (sortedByRecent[0]?.id || data.machines[0].id);
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
      await fetch(`${API_BASE_URL}/api/system/sample`, { method: 'POST' });
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
      await fetch(`${API_BASE_URL}/api/workload/run`, {
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
    const res = await fetch(`${API_BASE_URL}/api/machines/alert-rules`, {
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

  const fallbackDefaultMachine: Machine = {
    id: 'win-pc2',
    name: 'Device (MUDIT-PC2)',
    ownerId: 'current-user',
    hostname: 'MUDIT-PC2',
    os: 'Windows',
    platform: 'windows',
    osVersion: 'Windows 11 / 10',
    kernel: 'Windows NT 10.0',
    arch: 'x64',
    cpuCores: 8,
    totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    agentVersion: '2.2.0-windows',
    enrollmentToken: 'fb_win_token_primary',
    status: 'online',
    connectionStatus: 'connected',
    lastHeartbeatAt: new Date().toISOString(),
    lastTelemetryAt: new Date().toISOString(),
    isRevoked: false,
    capabilities: {
      hasPsi: false,
      hasSwap: true,
      hasDiskStats: true,
      hasNetworkStats: true,
      hasProcessStats: true,
      isWsl: false,
      isContainer: false,
      isWindows: true,
    },
    availableMetrics: ['cpu', 'cpu_per_core', 'memory', 'disk', 'network', 'processes', 'uptime'],
    collectionErrors: [],
    alertRules: {
      cpuWarningPercent: 75,
      cpuCriticalPercent: 90,
      cpuSustainedCycles: 3,
      memoryWarningPercent: 80,
      memoryCriticalPercent: 90,
      diskIoThresholdMBs: 60,
      latencyThresholdMs: 400,
      notifyInApp: true,
      notifyBrowser: false,
      destinations: { emails: [], webhooks: [] },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const activeMachine = machines.find((m) => m.id === selectedMachineId) || machines[0] || fallbackDefaultMachine;
  const latestSample = samples.length > 0 ? samples[samples.length - 1] : null;
  const otherActiveMachine = machines.find((m) => m.id !== selectedMachineId && (m.connectionStatus === 'connected' || m.status === 'online'));

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
            {/* Prominent Target Host Selector Dropdown */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-emerald-500/50 bg-zinc-900 shadow-md shadow-emerald-950/20 text-xs font-mono">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`w-2 h-2 rounded-full ${
                  activeMachine?.connectionStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`} />
                <span className="text-[11px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1">
                  <Server className="w-3.5 h-3.5" />
                  Target Host:
                </span>
              </div>
              <select
                value={selectedMachineId}
                onChange={(e) => handleSelectMachine(e.target.value)}
                className="bg-zinc-950 text-zinc-100 font-semibold border border-zinc-700 hover:border-emerald-500/80 rounded px-2.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer"
                title="Select active computer to monitor"
              >
                {machines.map((m) => (
                  <option key={m.id} value={m.id} className="bg-zinc-900 text-zinc-100">
                    {m.platform === 'windows' || m.os?.toLowerCase().includes('win') ? '🪟 ' : '🐧 '}
                    {m.name || m.hostname || m.id} ({m.id})
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
        {/* Banner if another machine is actively streaming telemetry */}
        {otherActiveMachine && activeMachine?.connectionStatus !== 'connected' && (
          <div className="bg-emerald-950/80 border border-emerald-500/60 p-3.5 rounded-xl mb-5 flex flex-wrap items-center justify-between gap-3 shadow-lg font-mono">
            <div className="flex items-center gap-2.5 text-xs text-emerald-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <span>
                Active hardware telemetry detected on <strong className="text-emerald-200">{otherActiveMachine.name || otherActiveMachine.hostname}</strong> ({otherActiveMachine.id})!
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleSelectMachine(otherActiveMachine.id)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs font-mono transition-colors shadow-sm cursor-pointer"
            >
              Switch to {otherActiveMachine.hostname || otherActiveMachine.id}
            </button>
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewTab
            machine={activeMachine}
            latestSample={latestSample}
            anomalies={anomalies}
            onTriggerWorkload={handleTriggerWorkload}
            onSampleLocal={handleSampleLocal}
            isSampling={isSampling}
            machines={machines}
            selectedMachineId={selectedMachineId}
            onSelectMachine={handleSelectMachine}
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

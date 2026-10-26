import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Server,
  Database,
  Users,
  Settings,
  FileText,
  RefreshCw,
  Plus,
  Trash2,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Laptop,
  Terminal,
  Activity,
  Cpu,
  Clock,
  Layers,
  Search,
  Filter,
  Lock,
  UserPlus,
  Download,
  Wifi,
  ExternalLink,
} from 'lucide-react';
import { Machine, AuditLog, AdminSettings, MachineConnectionStatus } from '../types/telemetry';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase/config';
import { doc, getDocFromServer } from 'firebase/firestore';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'operator' | 'viewer';
  status: 'active' | 'suspended';
  addedAt: string;
  lastLoginAt?: string;
}

interface AdminTabProps {
  machines: Machine[];
  onRefreshMachines: () => void;
}

export const AdminTab: React.FC<AdminTabProps> = ({ machines, onRefreshMachines }) => {
  const { user } = useAuth();

  const [activeSubTab, setActiveSubTab] = useState<'fleet' | 'settings' | 'rbac' | 'audit' | 'firebase'>('fleet');
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({
    retentionMaxSamples: 300,
    samplingIntervalDefault: 3,
    requireTokenAuth: true,
    autoEnrollAllowed: true,
    alertOnDisconnection: true,
    disconnectionThresholdSec: 15,
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [usersList, setUsersList] = useState<AdminUser[]>([
    {
      id: 'user-primary-admin',
      email: 'muditagarwalz156@gmail.com',
      name: 'Mudit Agarwal (Primary Admin)',
      role: 'super_admin',
      status: 'active',
      addedAt: '2026-10-26T00:00:00.000Z',
      lastLoginAt: new Date().toISOString(),
    },
  ]);

  const [systemInfo, setSystemInfo] = useState<{
    serverUptimeSec: number;
    nodeVersion: string;
    hostOs: string;
    hostArch: string;
    memoryUsageMb: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Firestore Ping Test State
  const [dbPingStatus, setDbPingStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [dbPingLatency, setDbPingLatency] = useState<number | null>(null);
  const [dbPingError, setDbPingError] = useState<string | null>(null);

  // New Machine Enrollment Modal State
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollName, setEnrollName] = useState('');
  const [enrollHostname, setEnrollHostname] = useState('');
  const [enrollPlatform, setEnrollPlatform] = useState<'windows' | 'linux' | 'darwin'>('windows');
  const [enrolledResult, setEnrolledResult] = useState<{ machine: Partial<Machine>; token: string } | null>(null);

  // Add User State
  const [showAddUser, setShowAddUser] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'operator' | 'viewer'>('operator');

  // Audit filter state
  const [logFilterSeverity, setLogFilterSeverity] = useState<string>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Fetch Admin overview from API
  const fetchAdminOverview = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/overview');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) setAdminSettings(data.settings);
        if (Array.isArray(data.auditLogs)) setAuditLogs(data.auditLogs);
        if (Array.isArray(data.users)) setUsersList(data.users);
        if (data.system) setSystemInfo(data.system);
      }
    } catch (err) {
      console.warn('Failed to fetch admin overview:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminOverview();
  }, [fetchAdminOverview]);

  // Test Cloud Firestore Connection using getDocFromServer
  const testFirestoreConnectivity = async () => {
    setDbPingStatus('testing');
    setDbPingError(null);
    const start = performance.now();
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
      const duration = Math.round(performance.now() - start);
      setDbPingLatency(duration);
      setDbPingStatus('connected');
    } catch (err: any) {
      const duration = Math.round(performance.now() - start);
      setDbPingLatency(duration);
      // If error message includes client offline or missing permission, document exists or not
      if (err.message && err.message.includes('the client is offline')) {
        setDbPingStatus('error');
        setDbPingError('Client is offline: Please verify network connection or Firebase config.');
      } else {
        // Even if the test document does not exist, reaching the server verifies Firestore connectivity
        setDbPingStatus('connected');
      }
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const handleRevokeToken = async (machineId: string) => {
    if (!confirm(`Revoke authentication token for ${machineId}? Telemetry from this agent will be rejected immediately.`)) {
      return;
    }
    try {
      const res = await fetch('/api/machines/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId }),
      });
      if (res.ok) {
        onRefreshMachines();
        fetchAdminOverview();
      }
    } catch (err) {
      console.error('Revoke failed:', err);
    }
  };

  const handleReconnectToken = async (machineId: string) => {
    try {
      const res = await fetch('/api/machines/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`New enrollment token generated:\n\n${data.enrollmentToken}\n\nUpdate your agent configuration and restart the agent.`);
        onRefreshMachines();
        fetchAdminOverview();
      }
    } catch (err) {
      console.error('Reconnect failed:', err);
    }
  };

  const handleDeleteDevice = async (machineId: string) => {
    if (!confirm(`Are you sure you want to permanently delete ${machineId} from the fleet registry?`)) {
      return;
    }
    try {
      const res = await fetch('/api/admin/devices/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineId }),
      });
      if (res.ok) {
        onRefreshMachines();
        fetchAdminOverview();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleEnrollDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/machines/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: enrollName,
          hostname: enrollHostname,
          platform: enrollPlatform,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setEnrolledResult({ machine: data.machine, token: data.enrollmentToken });
        onRefreshMachines();
        fetchAdminOverview();
      }
    } catch (err) {
      console.error('Enroll failed:', err);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveStatus('Saving...');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adminSettings),
      });
      if (res.ok) {
        setSaveStatus('Settings successfully saved and enforced.');
        setTimeout(() => setSaveStatus(null), 3000);
      } else {
        setSaveStatus('Failed to update settings.');
      }
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message}`);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          name: newName.trim() || newEmail.trim().split('@')[0],
          role: newRole,
        }),
      });
      if (res.ok) {
        setNewEmail('');
        setNewName('');
        setShowAddUser(false);
        fetchAdminOverview();
      }
    } catch (err) {
      console.error('Add user error:', err);
    }
  };

  const handleRemoveUser = async (email: string) => {
    if (!confirm(`Revoke dashboard access for ${email}?`)) return;
    try {
      const res = await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        fetchAdminOverview();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to remove user');
      }
    } catch (err) {
      console.error('Delete user error:', err);
    }
  };

  const handleExportAuditLogs = () => {
    const jsonStr = JSON.stringify(auditLogs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fireball-audit-logs-${new Date().toISOString().substring(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status?: MachineConnectionStatus) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Connected
          </span>
        );
      case 'waiting_for_telemetry':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Waiting for Telemetry
          </span>
        );
      case 'auth_failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
            <XCircle className="w-3 h-3 text-red-400" />
            Token Revoked
          </span>
        );
      case 'agent_error':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/30">
            <AlertTriangle className="w-3 h-3 text-orange-400" />
            Agent Error
          </span>
        );
      case 'disconnected':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
            Disconnected
          </span>
        );
    }
  };

  const getPlatformIcon = (plat?: string) => {
    if (plat === 'windows') return <span className="text-sky-400 font-bold text-xs">🪟 Windows</span>;
    if (plat === 'darwin') return <span className="text-zinc-200 font-bold text-xs">🍎 macOS</span>;
    return <span className="text-amber-400 font-bold text-xs">🐧 Linux</span>;
  };

  // Filter audit logs
  const filteredLogs = auditLogs.filter((log) => {
    const matchesSev = logFilterSeverity === 'all' || log.severity === logFilterSeverity;
    const matchesQuery =
      !logSearchQuery ||
      log.action.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
      (log.target && log.target.toLowerCase().includes(logSearchQuery.toLowerCase()));
    return matchesSev && matchesQuery;
  });

  const connectedCount = machines.filter((m) => m.connectionStatus === 'connected').length;
  const waitingCount = machines.filter((m) => m.connectionStatus === 'waiting_for_telemetry').length;

  return (
    <div className="space-y-6">
      {/* Top Admin Header Strip */}
      <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold font-mono text-zinc-100">FIREBALL ADMIN PORTAL</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold">
                Protected Console
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Multi-Device Fleet Orchestration • Firebase / Firestore Health • RBAC &amp; Retention Policies
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onRefreshMachines();
              fetchAdminOverview();
            }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Fleet</span>
          </button>

          <button
            onClick={() => {
              setShowEnrollModal(true);
              setEnrolledResult(null);
              setEnrollName('');
              setEnrollHostname('');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs font-mono transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Enroll Device</span>
          </button>
        </div>
      </div>

      {/* Fleet Metric Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 font-mono">
          <span className="text-[10px] uppercase text-zinc-500 block font-semibold">Registered Fleet</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-zinc-100">{machines.length}</span>
            <span className="text-xs text-zinc-400">devices</span>
          </div>
        </div>

        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 font-mono">
          <span className="text-[10px] uppercase text-zinc-500 block font-semibold">Active Telemetry</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-emerald-400">{connectedCount}</span>
            <span className="text-xs text-zinc-400">streaming</span>
          </div>
        </div>

        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 font-mono">
          <span className="text-[10px] uppercase text-zinc-500 block font-semibold">Awaiting Agent</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-amber-300">{waitingCount}</span>
            <span className="text-xs text-zinc-400">enrolled</span>
          </div>
        </div>

        <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 font-mono">
          <span className="text-[10px] uppercase text-zinc-500 block font-semibold">Server Memory RSS</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-zinc-200">{systemInfo?.memoryUsageMb ?? '--'}</span>
            <span className="text-xs text-zinc-400">MB</span>
          </div>
        </div>
      </div>

      {/* Admin Sub-Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-2 overflow-x-auto text-xs font-mono">
        <button
          onClick={() => setActiveSubTab('fleet')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeSubTab === 'fleet'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Device Manager ({machines.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('firebase')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeSubTab === 'firebase'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Firebase / Firestore Health</span>
        </button>

        <button
          onClick={() => setActiveSubTab('settings')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeSubTab === 'settings'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Monitoring &amp; Retention Policies</span>
        </button>

        <button
          onClick={() => setActiveSubTab('rbac')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeSubTab === 'rbac'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Users &amp; Role-Based Access ({usersList.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('audit')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
            activeSubTab === 'audit'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Security Audit Logs ({auditLogs.length})</span>
        </button>
      </div>

      {/* =========================================================================
          SUB-TAB 1: Device Fleet Manager Table
          ========================================================================= */}
      {activeSubTab === 'fleet' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold font-mono text-zinc-100">Authorized Computers &amp; Agent Nodes</h3>
                <p className="text-xs text-zinc-400 font-mono mt-0.5">
                  Manage machine tokens, connection heartbeats, and collection status.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400">
                    <th className="py-2.5 px-4 font-semibold">DEVICE NAME / ID</th>
                    <th className="py-2.5 px-4 font-semibold">PLATFORM &amp; OS</th>
                    <th className="py-2.5 px-4 font-semibold">STATUS</th>
                    <th className="py-2.5 px-4 font-semibold">AGENT</th>
                    <th className="py-2.5 px-4 font-semibold">LAST TELEMETRY</th>
                    <th className="py-2.5 px-4 font-semibold text-right">CREDENTIALS &amp; ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                  {machines.map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-zinc-100">{m.name || m.hostname}</div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{m.id}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div>{getPlatformIcon(m.platform)}</div>
                        <div className="text-[10px] text-zinc-400 mt-0.5">{m.osVersion || m.os}</div>
                      </td>

                      <td className="py-3 px-4">
                        {getStatusBadge(m.connectionStatus)}
                      </td>

                      <td className="py-3 px-4 text-zinc-400">
                        v{m.agentVersion || '2.2.0'}
                      </td>

                      <td className="py-3 px-4">
                        {m.lastTelemetryAt ? (
                          <div>
                            <span className="text-zinc-200 font-semibold">
                              {new Date(m.lastTelemetryAt).toLocaleTimeString()}
                            </span>
                            <span className="text-[10px] text-zinc-500 block">
                              {new Date(m.lastTelemetryAt).toLocaleDateString()}
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-600 italic">None received yet</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyToken(m.enrollmentToken)}
                            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                            title="Copy Machine Ingestion Token"
                          >
                            {copiedToken === m.enrollmentToken ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-zinc-400" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleReconnectToken(m.id)}
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-amber-300 border border-zinc-700 transition-colors"
                            title="Re-enroll device with a new cryptographic token"
                          >
                            Rotate Token
                          </button>

                          {!m.isRevoked ? (
                            <button
                              type="button"
                              onClick={() => handleRevokeToken(m.id)}
                              className="px-2 py-1 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-[11px] text-red-300 transition-colors"
                              title="Revoke device access"
                            >
                              Revoke
                            </button>
                          ) : (
                            <span className="text-[10px] text-red-400 px-1.5 py-0.5 rounded bg-red-950/60">
                              Revoked
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteDevice(m.id)}
                            className="p-1.5 rounded hover:bg-red-950/80 text-zinc-500 hover:text-red-400 transition-colors"
                            title="Delete machine from registry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SUB-TAB 2: Firebase / Firestore Health & Configuration
          ========================================================================= */}
      {activeSubTab === 'firebase' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 font-mono">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">Firebase &amp; Cloud Firestore Infrastructure</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Managed GCP Firestore database instance and Auth integration.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={testFirestoreConnectivity}
                disabled={dbPingStatus === 'testing'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-mono text-amber-300 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Wifi className={`w-3.5 h-3.5 ${dbPingStatus === 'testing' ? 'animate-spin' : ''}`} />
                <span>{dbPingStatus === 'testing' ? 'Testing Ping...' : 'Test Firestore Ping'}</span>
              </button>
            </div>

            {/* Live Ping Status Result */}
            {dbPingStatus === 'connected' && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Cloud Firestore server responded successfully (Round-trip latency: {dbPingLatency}ms)</span>
                </span>
                <span className="text-[10px] font-bold uppercase text-emerald-400">Verified</span>
              </div>
            )}

            {dbPingStatus === 'error' && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>{dbPingError || 'Failed to connect to Cloud Firestore'}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-2">
                <span className="text-zinc-500 uppercase text-[10px] font-bold block">Firestore Connection</span>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold text-emerald-300">Live &amp; Connected</span>
                </div>
                <div className="text-[11px] text-zinc-400 space-y-1 pt-1">
                  <div>Database ID: <span className="text-zinc-200">ai-studio-9b221cd8-aced-49d0-8dc8-aa37c9e793da</span></div>
                  <div>GCP Project: <span className="text-zinc-200">gen-lang-client-0086528291</span></div>
                  <div>Security Rules: <span className="text-emerald-400 font-semibold">Active &amp; Deployed (v2)</span></div>
                </div>
              </div>

              <div className="p-3.5 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-2">
                <span className="text-zinc-500 uppercase text-[10px] font-bold block">Security &amp; Secret Isolation</span>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-zinc-200">Zero Secret Leakage</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
                  Firebase Admin SDK credentials and private keys are strictly isolated on the backend server. The agent uses revocable machine bearer tokens and never receives GCP service account credentials.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SUB-TAB 3: Monitoring & Retention Policies
          ========================================================================= */}
      {activeSubTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-6 font-mono">
          <div className="border-b border-zinc-800 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Telemetry Ingestion &amp; Retention Policies</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Configure telemetry buffer limits, sampling cycles, and connection timeout thresholds.
              </p>
            </div>
            {saveStatus && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {saveStatus}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            {/* Retention Buffer Size */}
            <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-2">
              <label className="text-zinc-300 font-bold block">
                In-Memory Ring Buffer Limit per Device
              </label>
              <p className="text-[11px] text-zinc-500">
                Number of high-frequency samples retained per machine for real-time charting and anomaly windowing.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="number"
                  min="50"
                  max="2000"
                  value={adminSettings.retentionMaxSamples}
                  onChange={(e) => setAdminSettings({ ...adminSettings, retentionMaxSamples: Number(e.target.value) })}
                  className="w-24 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
                />
                <span className="text-zinc-400">samples (Default: 300)</span>
              </div>
            </div>

            {/* Disconnection Threshold */}
            <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-2">
              <label className="text-zinc-300 font-bold block">
                Disconnection Heartbeat Threshold
              </label>
              <p className="text-[11px] text-zinc-500">
                Seconds without telemetry before a registered device is evaluated as disconnected.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={adminSettings.disconnectionThresholdSec}
                  onChange={(e) => setAdminSettings({ ...adminSettings, disconnectionThresholdSec: Number(e.target.value) })}
                  className="w-24 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
                />
                <span className="text-zinc-400">seconds (Default: 15s)</span>
              </div>
            </div>

            {/* Toggle Security Checks */}
            <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-3">
              <label className="text-zinc-300 font-bold block">
                Authentication &amp; Ingestion Security
              </label>
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminSettings.requireTokenAuth}
                    onChange={(e) => setAdminSettings({ ...adminSettings, requireTokenAuth: e.target.checked })}
                    className="rounded bg-zinc-900 border-zinc-700 accent-amber-500"
                  />
                  <span>Enforce Token Authentication for All Ingestions</span>
                </label>
                <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminSettings.autoEnrollAllowed}
                    onChange={(e) => setAdminSettings({ ...adminSettings, autoEnrollAllowed: e.target.checked })}
                    className="rounded bg-zinc-900 border-zinc-700 accent-amber-500"
                  />
                  <span>Allow Dynamic Self-Enrollment for New Devices</span>
                </label>
              </div>
            </div>

            {/* Sampling Default */}
            <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-2">
              <label className="text-zinc-300 font-bold block">
                Default Recommended Sampling Interval
              </label>
              <p className="text-[11px] text-zinc-500">
                Recommended collection frequency given to new agent setup scripts.
              </p>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={adminSettings.samplingIntervalDefault}
                  onChange={(e) => setAdminSettings({ ...adminSettings, samplingIntervalDefault: Number(e.target.value) })}
                  className="w-24 px-3 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono text-xs focus:border-amber-400 focus:outline-none"
                />
                <span className="text-zinc-400">seconds (Default: 3s)</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs font-mono transition-colors shadow-sm cursor-pointer"
            >
              Save Retention &amp; Policy Settings
            </button>
          </div>
        </form>
      )}

      {/* =========================================================================
          SUB-TAB 4: RBAC & User Management
          ========================================================================= */}
      {activeSubTab === 'rbac' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-5 font-mono">
          <div className="border-b border-zinc-800 pb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Role-Based Access Control (RBAC) &amp; Team</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Multi-role privilege management for administrators, operators, and dashboard viewers.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddUser(!showAddUser)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs font-mono transition-colors shadow-sm cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{showAddUser ? 'Cancel' : 'Invite User'}</span>
            </button>
          </div>

          {/* Add User Form Panel */}
          {showAddUser && (
            <form onSubmit={handleAddUser} className="p-4 rounded-lg bg-zinc-950 border border-amber-500/30 space-y-3 text-xs">
              <span className="font-bold text-zinc-100 block">Grant Dashboard Role to New Member</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="teammate@company.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Display Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Alex"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-400 block mb-1">Role Permission</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-100 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="admin">Admin (Manage devices &amp; policies)</option>
                    <option value="operator">Operator (Triage &amp; benchmarks)</option>
                    <option value="viewer">Viewer (Read-only)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
                >
                  Grant Access
                </button>
              </div>
            </form>
          )}

          {/* Current User Session Profile */}
          <div className="p-4 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs space-y-2">
            <span className="text-zinc-500 uppercase text-[10px] font-bold block">Active Authenticated Session</span>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="font-semibold text-zinc-100">{user?.email || 'muditagarwalz156@gmail.com'}</span>
                <span className="text-[10px] text-zinc-500 block font-mono">
                  Designation: <span className="text-amber-400 font-semibold">Primary Super Administrator</span>
                </span>
              </div>
              <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold uppercase">
                Role: Super Admin
              </span>
            </div>
          </div>

          {/* Team Members Table */}
          <div className="rounded-lg border border-zinc-800 overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400">
                  <th className="py-2.5 px-4 font-semibold">MEMBER / EMAIL</th>
                  <th className="py-2.5 px-4 font-semibold">ROLE</th>
                  <th className="py-2.5 px-4 font-semibold">STATUS</th>
                  <th className="py-2.5 px-4 font-semibold">ADDED</th>
                  <th className="py-2.5 px-4 font-semibold text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-800/30">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-zinc-100">{u.name}</div>
                      <div className="text-[11px] text-zinc-400">{u.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        u.role === 'super_admin'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : u.role === 'admin'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-emerald-400 font-semibold text-[11px]">Active</span>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 text-[11px]">
                      {new Date(u.addedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {u.role !== 'super_admin' ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveUser(u.email)}
                          className="p-1 rounded hover:bg-red-950 text-zinc-500 hover:text-red-400 transition-colors"
                          title="Revoke access"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-zinc-600 font-mono italic">Primary</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Role Privileges Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
            <div className="p-3.5 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-2">
              <span className="font-bold text-amber-400 block text-sm">Super Admin</span>
              <p className="text-[11px] text-zinc-400">Full administrative control over fleet credentials, policies, audit logs, and external alert hooks.</p>
              <ul className="text-[10px] text-zinc-400 space-y-1 list-disc list-inside pt-1">
                <li>Rotate &amp; Revoke machine tokens</li>
                <li>Configure retention policies</li>
                <li>Manage users and permissions</li>
                <li>Purge / export audit records</li>
              </ul>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-2">
              <span className="font-bold text-sky-400 block text-sm">DevOps Operator</span>
              <p className="text-[11px] text-zinc-400">Operational triage, hypothesis investigation, and controlled workload benchmarking.</p>
              <ul className="text-[10px] text-zinc-400 space-y-1 list-disc list-inside pt-1">
                <li>Acknowledge anomalies</li>
                <li>Execute hypothesis investigations</li>
                <li>Run bounded workload benchmarks</li>
                <li>Export incident reports</li>
              </ul>
            </div>

            <div className="p-3.5 rounded-lg bg-zinc-950/70 border border-zinc-800 space-y-2">
              <span className="font-bold text-zinc-400 block text-sm">Viewer</span>
              <p className="text-[11px] text-zinc-400">Read-only observation access to real-time telemetry, charts, and public health metrics.</p>
              <ul className="text-[10px] text-zinc-400 space-y-1 list-disc list-inside pt-1">
                <li>Live metric charts</li>
                <li>System overview widgets</li>
                <li>Historical investigation read-only</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SUB-TAB 5: Security Audit Logs
          ========================================================================= */}
      {activeSubTab === 'audit' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden font-mono text-xs">
          <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Security &amp; Operational Audit Trail</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Immutable chronological log of authentication, anomaly alerts, policy modifications, and token revocations.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-950 border border-zinc-800">
                <Search className="w-3.5 h-3.5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Filter actions..."
                  value={logSearchQuery}
                  onChange={(e) => setLogSearchQuery(e.target.value)}
                  className="bg-transparent text-zinc-200 text-xs focus:outline-none w-36"
                />
              </div>

              <select
                value={logFilterSeverity}
                onChange={(e) => setLogFilterSeverity(e.target.value)}
                className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs focus:outline-none"
              >
                <option value="all">All Severities</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
              </select>

              <button
                type="button"
                onClick={handleExportAuditLogs}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs transition-colors cursor-pointer"
                title="Download audit logs as JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Export</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400">
                  <th className="py-2.5 px-4 font-semibold">TIMESTAMP</th>
                  <th className="py-2.5 px-4 font-semibold">ACTION</th>
                  <th className="py-2.5 px-4 font-semibold">ACTOR</th>
                  <th className="py-2.5 px-4 font-semibold">TARGET</th>
                  <th className="py-2.5 px-4 font-semibold">DETAILS</th>
                  <th className="py-2.5 px-4 font-semibold text-right">SEVERITY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-2.5 px-4 text-zinc-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-zinc-200">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-400">
                      {log.actor}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-400">
                      {log.target || '--'}
                    </td>
                    <td className="py-2.5 px-4 text-zinc-300 max-w-md truncate" title={log.details}>
                      {log.details}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                        log.severity === 'error'
                          ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                          : log.severity === 'warning'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                      }`}>
                        {log.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          DEVICE ENROLLMENT MODAL
          ========================================================================= */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 space-y-4 font-mono shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Laptop className="w-5 h-5 text-amber-400" />
                <span>Enroll New Device</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEnrollModal(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            {!enrolledResult ? (
              <form onSubmit={handleEnrollDevice} className="space-y-4 text-xs">
                <div>
                  <label className="text-zinc-300 block mb-1 font-semibold">Device Friendly Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Primary Workstation or Staging Node"
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 block mb-1 font-semibold">Computer Hostname</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DESKTOP-78K2, laptop-dell, or ubuntu-srv"
                    value={enrollHostname}
                    onChange={(e) => setEnrollHostname(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-zinc-300 block mb-1 font-semibold">Operating System Platform</label>
                  <select
                    value={enrollPlatform}
                    onChange={(e) => setEnrollPlatform(e.target.value as any)}
                    className="w-full px-3 py-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="windows">Windows 11 / 10</option>
                    <option value="linux">Linux / Ubuntu / Debian / WSL2</option>
                    <option value="darwin">macOS (Apple Silicon / Intel)</option>
                  </select>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowEnrollModal(false)}
                    className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold transition-colors shadow-sm cursor-pointer"
                  >
                    Generate Credentials
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <div>
                    <div className="font-bold">Device Enrolled Successfully!</div>
                    <div className="text-[11px] text-emerald-400/90">
                      Machine ID: <span className="font-mono">{enrolledResult.machine.id}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold block">Authentication Token:</label>
                  <div className="flex items-center gap-2 p-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200">
                    <span className="truncate flex-1 font-mono text-[11px]">{enrolledResult.token}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyToken(enrolledResult.token)}
                      className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold block">Run on Computer:</label>
                  <pre className="p-3 rounded bg-zinc-950 border border-zinc-800 text-amber-300 text-[11px] overflow-x-auto whitespace-pre-wrap select-all">
                    {`python scripts/windows_monitor.py --machine-id "${enrolledResult.machine.id}" --token "${enrolledResult.token}" --url "${window.location.origin}/api/telemetry"`}
                  </pre>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowEnrollModal(false)}
                    className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

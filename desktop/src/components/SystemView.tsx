import React, { useState } from 'react';
import {
  Activity,
  Cpu,
  Boxes,
  Database,
  ExternalLink,
  Check,
  Copy,
  Terminal,
  Zap,
  AlertTriangle,
  X,
  XCircle,
  Filter,
} from 'lucide-react';
import {
  ProcessConnection,
  RuntimeConnection,
  DockerConnection,
  CacheConnection,
} from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface SystemViewProps {
  initialTab?: 'processes' | 'runtimes' | 'containers' | 'caches';
  processes?: ProcessConnection[];
  runtimes?: RuntimeConnection[];
  containers?: DockerConnection[];
  caches?: CacheConnection[];
  onActionComplete?: () => Promise<void> | void;
}

const DEV_EXECUTABLE_KEYWORDS = [
  'node',
  'python',
  'py',
  'cargo',
  'rustc',
  'go',
  'flutter',
  'dart',
  'java',
  'javaw',
  'dotnet',
  'ruby',
  'code',
  'cursor',
  'powershell',
  'pwsh',
  'cmd',
  'bash',
  'wt',
  'git',
  'vite',
  'next',
  'ts-node',
  'nodemon',
  'webpack',
  'esbuild',
  'pip',
  'npm',
  'yarn',
  'pnpm',
];

const WINDOWS_SYSTEM_EXES = new Set([
  'svchost.exe',
  'system',
  'system idle process',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'services.exe',
  'lsass.exe',
  'fontdrvhost.exe',
  'dwm.exe',
  'memory compression',
  'sihost.exe',
  'ctfmon.exe',
  'taskmgr.exe',
  'searchhost.exe',
  'runtimebroker.exe',
  'spoolsv.exe',
  'audiodg.exe',
]);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const SystemView: React.FC<SystemViewProps> = ({
  initialTab = 'processes',
  processes = [],
  runtimes = [],
  containers = [],
  caches = [],
  onActionComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'processes' | 'runtimes' | 'containers' | 'caches'>(
    initialTab
  );
  const [procFilterMode, setProcFilterMode] = useState<'dev' | 'all'>('dev');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Action modal & status feedback
  const [actionModal, setActionModal] = useState<{
    type: 'free_port' | 'stop_process';
    port?: number;
    pid?: number;
    name?: string;
  } | null>(null);

  const [isExecuting, setIsExecuting] = useState(false);
  const [actionResult, setActionResult] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1800);
  };

  const formatSize = (bytes: number | null | undefined) => {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleExecuteAction = async () => {
    if (!actionModal) return;
    setIsExecuting(true);
    setActionResult(null);

    try {
      if (actionModal.type === 'free_port' && actionModal.port) {
        const res = await EntropyApiClient.freePort(actionModal.port, true);
        if (res.success) {
          setActionResult({
            type: 'success',
            text: res.message || `Successfully freed Port :${actionModal.port}`,
          });
          await onActionComplete?.();
        } else {
          setActionResult({
            type: 'error',
            text: res.error || `Failed to free Port :${actionModal.port}`,
          });
        }
      } else if (actionModal.type === 'stop_process' && actionModal.pid) {
        const res = await EntropyApiClient.terminateProcess(actionModal.pid, true);
        if (res.success) {
          setActionResult({
            type: 'success',
            text: res.message || `Successfully terminated process PID ${actionModal.pid}`,
          });
          await onActionComplete?.();
        } else {
          setActionResult({
            type: 'error',
            text: res.error || `Failed to terminate process PID ${actionModal.pid}`,
          });
        }
      }
    } catch (err: unknown) {
      setActionResult({
        type: 'error',
        text: errorMessage(err),
      });
    } finally {
      setIsExecuting(false);
      setActionModal(null);
      setTimeout(() => setActionResult(null), 4000);
    }
  };

  const isDevProcess = (p: ProcessConnection) => {
    if (p.ports && p.ports.length > 0) return true;
    if (p.cwd && p.cwd.length > 0) return true;
    if (p.is_shell) return true;
    const nameLower = (p.name || '').toLowerCase();
    if (WINDOWS_SYSTEM_EXES.has(nameLower)) return false;
    return DEV_EXECUTABLE_KEYWORDS.some((kw) => nameLower.includes(kw));
  };

  const query = searchQuery.toLowerCase().trim();

  const devProcessesCount = (processes || []).filter(isDevProcess).length;

  const filteredProcesses = (processes || [])
    .filter((p) => {
      if (procFilterMode === 'dev' && !isDevProcess(p)) return false;
      if (!query) return true;
      const name = (p.name || '').toLowerCase();
      const cwd = (p.cwd || '').toLowerCase();
      const cmd = (p.cmdline_preview || '').toLowerCase();
      const pid = String(p.pid || '');
      const portsStr = (p.ports || []).join(' ');
      return (
        name.includes(query) ||
        cwd.includes(query) ||
        cmd.includes(query) ||
        pid.includes(query) ||
        portsStr.includes(query)
      );
    })
    .sort((a, b) => {
      // Prioritize bound ports first, then working dir, then PID
      const aPorts = a.ports?.length || 0;
      const bPorts = b.ports?.length || 0;
      if (aPorts !== bPorts) return bPorts - aPorts;
      const aCwd = a.cwd ? 1 : 0;
      const bCwd = b.cwd ? 1 : 0;
      if (aCwd !== bCwd) return bCwd - aCwd;
      return a.pid - b.pid;
    });

  const filteredRuntimes = (runtimes || []).filter((rt) => {
    if (!query) return true;
    const name = (rt.name || rt.runtime || '').toLowerCase();
    const exe = (rt.executable_path || rt.path || '').toLowerCase();
    const install = (rt.install_path || rt.manager || '').toLowerCase();
    const ver = (rt.version || '').toLowerCase();
    return name.includes(query) || exe.includes(query) || install.includes(query) || ver.includes(query);
  });

  const filteredContainers = (containers || []).filter((c) => {
    if (!query) return true;
    const name = (c.name || '').toLowerCase();
    const image = (c.image || '').toLowerCase();
    const status = (c.status || c.state || '').toLowerCase();
    return name.includes(query) || image.includes(query) || status.includes(query);
  });

  const filteredCaches = (caches || []).filter((cache) => {
    if (!query) return true;
    const cat = (cache.category || '').toLowerCase();
    const path = (cache.path || '').toLowerCase();
    return cat.includes(query) || path.includes(query);
  });

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-surface-0)] text-[var(--color-text-primary)] p-6 space-y-6 relative">
      {/* Toast Notification */}
      {actionResult && (
        <div
          className={`fixed top-4 right-6 z-50 px-4 py-3 rounded-lg border shadow-xl flex items-center gap-3 text-xs font-medium font-mono ${
            actionResult.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-400'
          }`}
        >
          {actionResult.type === 'success' ? (
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{actionResult.text}</span>
        </div>
      )}

      {/* Action Confirmation Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] rounded-xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5 text-amber-400 font-semibold text-base">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>
                  {actionModal.type === 'free_port'
                    ? `Free Port :${actionModal.port}?`
                    : `Stop Process ${actionModal.name} (PID ${actionModal.pid})?`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-[var(--color-text-secondary)] leading-relaxed space-y-2">
              {actionModal.type === 'free_port' ? (
                <p>
                  This will safely send a termination signal to process{' '}
                  <strong className="text-[var(--color-text-primary)] font-mono">{actionModal.name || 'Process'}</strong> (PID{' '}
                  <span className="font-mono text-amber-400">{actionModal.pid}</span>) to free port{' '}
                  <strong className="text-amber-400 font-mono">:{actionModal.port}</strong>.
                </p>
              ) : (
                <p>
                  This will safely send a termination signal to process{' '}
                  <strong className="text-[var(--color-text-primary)] font-mono">{actionModal.name}</strong> (PID{' '}
                  <span className="font-mono text-amber-400">{actionModal.pid}</span>).
                </p>
              )}
              <div className="p-2.5 bg-[var(--color-surface-3)] rounded border border-[var(--color-border-subtle)] font-mono text-[11px] text-[var(--color-text-tertiary)] select-text">
                Command: <span className="text-[var(--color-text-primary)]">taskkill /F /PID {actionModal.pid}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                disabled={isExecuting}
                className="px-3.5 py-1.5 bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] text-[var(--color-text-secondary)] rounded-md text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAction}
                disabled={isExecuting}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {isExecuting ? 'Stopping…' : actionModal.type === 'free_port' ? `Free Port :${actionModal.port}` : 'Stop Process'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)] flex items-center gap-2.5">
            <span>System Details</span>
            <span className="text-xs font-mono font-normal text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              Live Machine State
            </span>
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            Developer processes, listening TCP ports, runtimes, containers, and shared build caches.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Filter system or ports..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64 bg-[var(--color-surface-2)] border border-[var(--color-border)] focus:border-[var(--color-accent)] rounded-md px-3 py-1.5 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] outline-none transition-colors"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)] pb-0">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('processes')}
            className={`px-4 py-2.5 border-b-2 font-medium transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'processes'
                ? 'border-[var(--color-accent)] text-[var(--color-text-primary)] bg-[var(--color-accent-muted)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <Activity className="w-4 h-4 text-sky-400" />
            <span>Processes ({processes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('runtimes')}
            className={`px-4 py-2.5 border-b-2 font-medium transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'runtimes'
                ? 'border-[var(--color-accent)] text-[var(--color-text-primary)] bg-[var(--color-accent-muted)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <Cpu className="w-4 h-4 text-indigo-400" />
            <span>Runtimes ({runtimes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('containers')}
            className={`px-4 py-2.5 border-b-2 font-medium transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'containers'
                ? 'border-[var(--color-accent)] text-[var(--color-text-primary)] bg-[var(--color-accent-muted)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <Boxes className="w-4 h-4 text-emerald-400" />
            <span>Containers ({containers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('caches')}
            className={`px-4 py-2.5 border-b-2 font-medium transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'caches'
                ? 'border-[var(--color-accent)] text-[var(--color-text-primary)] bg-[var(--color-accent-muted)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <Database className="w-4 h-4 text-amber-400" />
            <span>Caches ({caches.length})</span>
          </button>
        </div>

        {/* Process Filter Mode Toggle (Dev & Ports vs All System) */}
        {activeTab === 'processes' && (
          <div className="flex items-center gap-1 bg-[var(--color-surface-1)] border border-[var(--color-border)] p-1 rounded-lg text-xs mb-2 sm:mb-0">
            <button
              type="button"
              onClick={() => setProcFilterMode('dev')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer font-medium flex items-center gap-1.5 ${
                procFilterMode === 'dev'
                  ? 'bg-[var(--color-accent)] text-white shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>Dev Processes & Ports ({devProcessesCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setProcFilterMode('all')}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer font-medium ${
                procFilterMode === 'all'
                  ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <span>All Machine ({processes.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Tab 1: Processes */}
      {activeTab === 'processes' && (
        filteredProcesses.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg space-y-2">
            <div>{searchQuery ? 'No processes matching search filter.' : 'No active developer processes or listening ports observed.'}</div>
            {procFilterMode === 'dev' && (
              <button
                onClick={() => setProcFilterMode('all')}
                className="text-xs text-[var(--color-accent-strong)] hover:underline cursor-pointer"
              >
                Switch to All Machine Processes ({processes.length}) &rarr;
              </button>
            )}
          </div>
        ) : (
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-3)] border-b border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wider">
                    <th className="py-3 px-4">Process / PID</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Ports Bound</th>
                    <th className="py-3 px-4">Memory (RSS)</th>
                    <th className="py-3 px-4">Working Directory</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)] font-mono text-xs">
                  {filteredProcesses.map((p, idx) => {
                    const isSystem = WINDOWS_SYSTEM_EXES.has((p.name || '').toLowerCase());
                    const roleLabel = p.is_shell
                      ? 'Shell Terminal'
                      : isSystem
                      ? 'System Process'
                      : 'Developer Process';

                    let roleBadgeStyle = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
                    if (p.is_shell) roleBadgeStyle = 'bg-sky-500/15 text-sky-400 border-sky-500/30';
                    else if (isSystem) roleBadgeStyle = 'bg-slate-500/15 text-slate-400 border-slate-500/30';

                    return (
                      <tr key={p.entity_id || `proc-${p.pid}-${idx}`} className="hover:bg-[var(--color-surface-3)] transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Terminal className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] shrink-0" />
                            <span className="font-semibold text-[var(--color-text-primary)] text-sm">{p.name || 'Process'}</span>
                          </div>
                          <div className="text-[11px] text-[var(--color-text-tertiary)] font-mono ml-5.5">PID {p.pid}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-block text-[11px] px-2.5 py-0.5 rounded-full font-sans font-medium border whitespace-nowrap ${roleBadgeStyle}`}
                          >
                            {roleLabel}
                          </span>
                        </td>
                        {/* Listening TCP Ports Column */}
                        <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                          {p.ports && p.ports.length > 0 ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {p.ports.map((port) => (
                                <button
                                  key={port}
                                  type="button"
                                  onClick={() => setActionModal({ type: 'free_port', port, pid: p.pid, name: p.name })}
                                  title={`Click to free Port :${port}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold cursor-pointer transition-colors shadow-xs"
                                >
                                  <Zap className="w-3 h-3 text-amber-400" />
                                  <span>:{port}</span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[var(--color-text-tertiary)] font-sans italic">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-[var(--color-text-primary)] whitespace-nowrap">
                          {(p.memory_bytes ? p.memory_bytes / (1024 * 1024) : 0).toFixed(1)} MB
                        </td>
                        <td className="py-3 px-4 text-xs text-[var(--color-text-secondary)] font-mono truncate max-w-[260px]" title={p.cwd || ''}>
                          {p.cwd || '—'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {p.cwd && (
                              <button
                                type="button"
                                onClick={() => EntropyApiClient.openInExplorer(p.cwd!)}
                                title="Open in Windows Explorer"
                                className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-4)] rounded transition-colors inline-flex items-center justify-center cursor-pointer"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setActionModal({ type: 'stop_process', pid: p.pid, name: p.name })}
                              title={`Stop Process ${p.name} (PID ${p.pid})`}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded font-sans font-medium transition-colors cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Stop</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Tab 2: Runtimes */}
      {activeTab === 'runtimes' && (
        filteredRuntimes.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg">
            {searchQuery ? 'No runtimes matching search.' : 'No developer runtimes or compilers detected in system PATH.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRuntimes.map((rt, idx) => {
              const name = rt.name || rt.runtime || 'Runtime';
              const exePath = rt.executable_path || rt.path || '—';
              const installPath = rt.install_path || rt.manager || null;
              const isSystem = rt.is_system !== undefined ? rt.is_system : rt.manager === 'system';

              return (
                <div
                  key={rt.entity_id || `runtime-${idx}`}
                  className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg p-5 space-y-3 hover:border-[var(--color-border-strong)] transition-colors"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                    <div className="flex items-center gap-2.5">
                      <Cpu className="w-5 h-5 text-indigo-400" />
                      <span className="font-semibold text-[var(--color-text-primary)] capitalize text-base">{name}</span>
                    </div>
                    <span className="font-mono text-xs text-[var(--color-accent-strong)] bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/30 px-2.5 py-0.5 rounded-full font-medium">
                      v{rt.version || 'unknown'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="text-[var(--color-text-secondary)] truncate">
                      <span className="text-[var(--color-text-tertiary)] font-sans">Executable: </span>
                      <span className="text-[var(--color-text-primary)] select-all">{exePath}</span>
                    </div>
                    {installPath && (
                      <div className="text-[var(--color-text-secondary)] truncate">
                        <span className="text-[var(--color-text-tertiary)] font-sans">Prefix / Toolchain: </span>
                        <span className="text-[var(--color-text-secondary)]">{installPath}</span>
                      </div>
                    )}
                    <div className="pt-1 flex items-center justify-between text-xs text-[var(--color-text-tertiary)] font-sans">
                      <span>Scope: {isSystem ? 'System Installation' : 'User Local'}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(exePath)}
                        className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedText === exePath ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedText === exePath ? 'Copied' : 'Copy path'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Tab 3: Docker Containers */}
      {activeTab === 'containers' && (
        filteredContainers.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg">
            {searchQuery ? 'No containers matching search.' : 'Zero Docker containers observed on this machine.'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredContainers.map((c, idx) => (
              <div
                key={c.entity_id || `container-${idx}`}
                className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg p-5 space-y-3"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-2.5">
                    <Boxes className="w-5 h-5 text-emerald-400" />
                    <span className="font-semibold text-[var(--color-text-primary)] text-sm">{c.name}</span>
                  </div>
                  <span
                    className={`font-mono text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                      c.state === 'running'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                    }`}
                  >
                    {c.state || c.status || 'unknown'}
                  </span>
                </div>

                <div className="text-xs font-mono space-y-1.5 text-[var(--color-text-secondary)]">
                  <div>
                    <span className="text-[var(--color-text-tertiary)] font-sans">Image: </span>
                    <span className="text-[var(--color-text-primary)]">{c.image}</span>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-tertiary)] font-sans">Status: </span>
                    <span>{c.status}</span>
                  </div>
                </div>

                {c.bind_mounts && c.bind_mounts.length > 0 && (
                  <div className="pt-2 border-t border-[var(--color-border)] space-y-1.5">
                    <div className="text-xs text-[var(--color-text-tertiary)] font-sans">Host Bind Mounts ({c.bind_mounts.length})</div>
                    <div className="space-y-1">
                      {c.bind_mounts.map((m, mIdx) => (
                        <div key={mIdx} className="font-mono text-xs text-[var(--color-text-primary)] bg-[var(--color-surface-3)] p-2 rounded truncate">
                          {m}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* Tab 4: Package Caches */}
      {activeTab === 'caches' && (
        filteredCaches.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg">
            {searchQuery ? 'No package caches matching search.' : 'Zero package caches detected.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCaches.map((cache, idx) => (
              <div
                key={cache.entity_id || `cache-${idx}`}
                className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg p-5 space-y-3 hover:border-[var(--color-border-strong)] transition-colors"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-amber-400" />
                    <span className="font-semibold text-[var(--color-text-primary)] uppercase text-sm">
                      {cache.category} Cache
                    </span>
                    {cache.is_shared && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 font-sans">
                        Shared System
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-sm text-amber-400 font-semibold">
                    {formatSize(cache.size_bytes)}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  <div className="text-[var(--color-text-secondary)] truncate">
                    <span className="text-[var(--color-text-tertiary)] font-sans">Path: </span>
                    <span className="text-[var(--color-text-primary)] select-all">{cache.path}</span>
                  </div>
                  {cache.entry_count !== null && cache.entry_count !== undefined && (
                    <div className="text-[var(--color-text-tertiary)] font-sans">
                      Cached items: <span className="text-[var(--color-text-secondary)] font-mono">{cache.entry_count}</span> packages
                    </div>
                  )}
                  {cache.is_shared && (
                    <div className="text-[var(--color-text-tertiary)] text-xs italic font-sans pt-1">
                      {cache.scope_explanation || 'Shared across all projects on this machine.'}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[var(--color-border)] flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleCopy(cache.path)}
                    className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                  >
                    {copiedText === cache.path ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy path</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

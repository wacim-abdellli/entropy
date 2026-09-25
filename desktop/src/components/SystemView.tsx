import React, { useMemo, useState } from 'react';
import { Activity, Boxes, Check, Copy, Cpu, Database, ExternalLink, Filter, FolderGit2, FolderOpen, Terminal, SquareTerminal, X, XCircle, Zap } from 'lucide-react';
import { CacheConnection, DockerConnection, ProcessConnection, RuntimeConnection, WorkspaceSummary } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface SystemViewProps {
  initialTab?: 'processes' | 'runtimes' | 'containers' | 'caches';
  processes?: ProcessConnection[];
  runtimes?: RuntimeConnection[];
  containers?: DockerConnection[];
  caches?: CacheConnection[];
  onActionComplete?: () => Promise<void> | void;
  currentWorkspace?: WorkspaceSummary | null;
}

const developerNames = ['node', 'python', 'py', 'cargo', 'rustc', 'go', 'flutter', 'dart', 'java', 'dotnet', 'ruby', 'powershell', 'pwsh', 'cmd', 'bash', 'wt', 'vite', 'next', 'ts-node', 'nodemon', 'webpack', 'esbuild', 'npm', 'yarn', 'pnpm'];
const systemNames = new Set([
  'svchost.exe', 'system', 'system idle process', 'registry', 'smss.exe', 'csrss.exe',
  'wininit.exe', 'services.exe', 'lsass.exe', 'fontdrvhost.exe', 'dwm.exe', 'memory compression', 'sihost.exe',
  'explorer.exe', 'taskmgr.exe',
  'antigravity.exe', 'antigravity',
  'code.exe', 'code',
  'cursor.exe', 'cursor',
  'windsurf.exe', 'windsurf',
  'entropy.exe', 'entropy',
  'idea64.exe', 'pycharm64.exe', 'webstorm64.exe', 'rider64.exe', 'clion64.exe', 'devenv.exe',
  'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe',
]);

function bytes(value: number | null | undefined): string {
  if (!value) return '—';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(0)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function isDeveloperProcess(process: ProcessConnection): boolean {
  const name = (process.name || '').toLowerCase();
  if (systemNames.has(name) || systemNames.has(name.replace('.exe', ''))) return false;
  if (process.ports?.length || process.cwd || process.is_shell) return true;
  return developerNames.some((term) => name.includes(term));
}

export const SystemView: React.FC<SystemViewProps> = ({
  initialTab = 'processes',
  processes = [],
  runtimes = [],
  containers = [],
  caches = [],
  onActionComplete,
  currentWorkspace,
}) => {
  const [tab, setTab] = useState(initialTab);
  const [scope, setScope] = useState<'workspace' | 'developer' | 'all'>('developer');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'process' | 'port'; process: ProcessConnection; port?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCleanSlate, setConfirmCleanSlate] = useState(false);
  const [cleanSlateLoading, setCleanSlateLoading] = useState(false);

  const devProcesses = useMemo(() => processes.filter(isDeveloperProcess), [processes]);
  const totalDevRam = useMemo(() => devProcesses.reduce((acc, p) => acc + (p.memory_bytes || 0), 0), [devProcesses]);

  const handleExecuteCleanSlate = async () => {
    setCleanSlateLoading(true);
    try {
      const res = await EntropyApiClient.cleanSlateDevProcesses(devProcesses.map((p) => p.pid));
      if (res.success) {
        setNotice(`Clean Slate complete: Terminated ${res.terminated_count} dev processes and freed ${bytes(res.freed_memory_bytes)} RAM.`);
      } else {
        setNotice(res.errors?.[0]?.error || 'Failed to complete Clean Slate.');
      }
      await onActionComplete?.();
    } catch {
      setNotice('Error running Clean Slate.');
    } finally {
      setCleanSlateLoading(false);
      setConfirmCleanSlate(false);
      setTimeout(() => setNotice(null), 5000);
    }
  };

  const developerProcessCount = useMemo(() => devProcesses.length, [devProcesses]);

  const workspaceProcesses = useMemo(() => {
    if (!currentWorkspace?.path) return [];
    const normWs = currentWorkspace.path.toLowerCase().replace(/[\\/]+$/, '');
    return processes.filter((p) => {
      if (!p.cwd) return false;
      const normCwd = p.cwd.toLowerCase().replace(/[\\/]+$/, '');
      return normCwd === normWs || normCwd.startsWith(normWs + '\\') || normCwd.startsWith(normWs + '/');
    });
  }, [processes, currentWorkspace]);

  const matchingProcesses = useMemo(() => processes.filter((process) => {
    if (scope === 'workspace') {
      if (!currentWorkspace?.path || !process.cwd) return false;
      const normWs = currentWorkspace.path.toLowerCase().replace(/[\\/]+$/, '');
      const normCwd = process.cwd.toLowerCase().replace(/[\\/]+$/, '');
      if (normCwd !== normWs && !normCwd.startsWith(normWs + '\\') && !normCwd.startsWith(normWs + '/')) {
        return false;
      }
    } else if (scope === 'developer' && !isDeveloperProcess(process)) {
      return false;
    }
    const haystack = [process.name, process.cwd, process.cmdline_preview, String(process.pid), ...(process.ports || []).map(String)].join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase().trim());
  }).sort((a, b) => (b.ports?.length || 0) - (a.ports?.length || 0) || Number(Boolean(b.cwd)) - Number(Boolean(a.cwd)) || a.pid - b.pid), [processes, query, scope, currentWorkspace]);

  const copy = (value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(value);
    setTimeout(() => setCopied(null), 1600);
  };

  const execute = async () => {
    if (!confirm) return;
    setBusy(true);
    const result = confirm.kind === 'port' && confirm.port ? await EntropyApiClient.freePort(confirm.port) : await EntropyApiClient.terminateProcess(confirm.process.pid);
    setBusy(false);
    setConfirm(null);
    setNotice(result.success ? (result.message || 'Action complete.') : (result.error || 'Action failed.'));
    setTimeout(() => setNotice(null), 4200);
    if (result.success) await onActionComplete?.();
  };

  const match = (values: Array<string | null | undefined>) => values.join(' ').toLowerCase().includes(query.toLowerCase().trim());
  const tabButton = (id: typeof tab, label: string, Icon: typeof Activity, count: number) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`h-8 px-2.5 rounded-md text-xs flex items-center gap-1.5 transition-colors cursor-pointer ${
        tab === id
          ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] font-medium'
          : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      <span className="font-mono text-[10px]">{count}</span>
    </button>
  );

  return (
    <div className="flex-1 h-full overflow-y-auto overflow-x-hidden w-full max-w-full bg-[var(--color-surface-0)] animate-enter">
      {notice && (
        <div className="fixed z-50 right-6 top-5 px-3 py-2 rounded-md bg-[var(--color-surface-3)] border border-[var(--color-border-strong)] text-xs text-[var(--color-text-primary)] shadow-xl animate-in fade-in">
          {notice}
        </div>
      )}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-5 shadow-2xl space-y-4">
            <div className="flex justify-between gap-4">
              <div>
                <h2 className="font-semibold text-sm">
                  {confirm.kind === 'port' ? `Free port ${confirm.port}` : `Stop ${confirm.process.name}`}
                </h2>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  This stops PID <span className="font-mono font-semibold">{confirm.process.pid}</span>
                  {confirm.kind === 'port' ? ` to release port ${confirm.port}.` : '.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="text-[var(--color-text-tertiary)] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="h-8 px-3 text-xs text-[var(--color-text-secondary)] hover:text-white rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={execute}
                className="h-8 px-3 rounded-md bg-[var(--color-danger)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-medium cursor-pointer shadow-sm transition-opacity"
              >
                {busy ? 'Stopping…' : confirm.kind === 'port' ? 'Free port' : 'Stop process'}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmCleanSlate && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface-1)] p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[var(--color-success-bg)] text-[var(--color-success)] shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm text-[var(--color-text-primary)]">Clean Slate — Reclaim RAM</h2>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  Terminate <strong className="text-[var(--color-text-primary)]">{devProcesses.length}</strong> background developer processes to instantly free{' '}
                  <strong className="text-[var(--color-success)] font-semibold">{bytes(totalDevRam)}</strong> of memory?
                </p>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] p-2 divide-y divide-[var(--color-border-subtle)]">
              {devProcesses.map((p) => (
                <div key={p.pid} className="py-1.5 px-2 flex items-center justify-between text-xs font-mono">
                  <div className="truncate mr-2">
                    <span className="text-[var(--color-text-primary)] font-medium">{p.name}</span>
                    <span className="text-[var(--color-text-tertiary)] ml-2">PID {p.pid}</span>
                    {p.ports && p.ports.length > 0 && (
                      <span className="text-[var(--color-success)] ml-2">:{p.ports.join(', :')}</span>
                    )}
                  </div>
                  <span className="text-[var(--color-text-secondary)] shrink-0">{bytes(p.memory_bytes)}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmCleanSlate(false)}
                disabled={cleanSlateLoading}
                className="h-8 px-3 text-xs text-[var(--color-text-secondary)] hover:text-white rounded-md cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={cleanSlateLoading}
                onClick={handleExecuteCleanSlate}
                className="h-8 px-3.5 rounded-md bg-[var(--color-success)] hover:opacity-90 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition-opacity"
              >
                <Zap className="w-3.5 h-3.5" />
                {cleanSlateLoading ? 'Reclaiming…' : `Reclaim ${bytes(totalDevRam)}`}
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-10 h-14 px-7 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-0)]/95 backdrop-blur">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">System Details</h1>
            {currentWorkspace && (
              <>
                <span className="text-[var(--color-text-tertiary)] text-xs">/</span>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-accent-strong)]">
                  <FolderGit2 className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                  <span className="font-semibold">{currentWorkspace.name}</span>
                </div>
              </>
            )}
          </div>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            {currentWorkspace
              ? `Processes and runtimes correlated with ${currentWorkspace.name}`
              : 'Processes, runtimes, containers, and caches across this machine.'}
          </p>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by process, port, or folder"
          className="w-64 h-8 px-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] outline-none"
        />
      </header>
      <div className="max-w-6xl mx-auto px-7 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="p-1 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] flex gap-1">
            {tabButton('processes', 'Processes', Activity, processes.length)}
            {tabButton('runtimes', 'Runtimes', Cpu, runtimes.length)}
            {tabButton('containers', 'Containers', Boxes, containers.length)}
            {tabButton('caches', 'Caches', Database, caches.length)}
          </div>
          {tab === 'processes' && (
            <div className="p-1 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] flex gap-1">
              {currentWorkspace && (
                <button
                  type="button"
                  onClick={() => setScope('workspace')}
                  className={`h-7 px-2.5 text-xs rounded font-medium transition-colors cursor-pointer ${
                    scope === 'workspace'
                      ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)] border border-[var(--color-accent)]/30'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                  }`}
                  title={`Show only processes running in ${currentWorkspace.name}`}
                >
                  <FolderGit2 className="inline w-3 h-3 mr-1" />
                  {currentWorkspace.name} ({workspaceProcesses.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setScope('developer')}
                className={`h-7 px-2 text-xs rounded transition-colors cursor-pointer ${
                  scope === 'developer'
                    ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)]'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                <Filter className="inline w-3 h-3 mr-1" />
                Developer ({developerProcessCount})
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`h-7 px-2 text-xs rounded transition-colors cursor-pointer ${
                  scope === 'all'
                    ? 'bg-[var(--color-surface-3)] text-white font-medium'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                All ({processes.length})
              </button>
              {developerProcessCount > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmCleanSlate(true)}
                  className="h-7 px-2.5 text-xs font-semibold rounded bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] hover:bg-[var(--color-success)]/20 transition-colors cursor-pointer flex items-center gap-1.5 ml-auto"
                  title="Terminate background dev servers to reclaim RAM"
                  aria-label={`Clean Slate: Reclaim ${bytes(totalDevRam)} of dev server memory`}
                >
                  <Zap className="w-3 h-3 text-[var(--color-success)]" />
                  Clean Slate ({bytes(totalDevRam)})
                </button>
              )}
            </div>
          )}
        </div>
        {tab === 'processes' && (
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface-1)]">
            <div className="grid grid-cols-[1.1fr_90px_150px_1.6fr_132px] gap-4 px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)] border-b border-[var(--color-border-subtle)]">
              <span>Process</span>
              <span>Memory</span>
              <span>Ports</span>
              <span>Working directory</span>
              <span />
            </div>
            {matchingProcesses.map((process) => {
              const protectedProcess = systemNames.has((process.name || '').toLowerCase());
              return (
                <div
                  key={process.entity_id || process.pid}
                  className="group grid grid-cols-[1.1fr_90px_150px_1.6fr_132px] gap-4 items-center px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-surface-2)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{process.name}</div>
                    <div className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
                      PID {process.pid}
                    </div>
                  </div>
                  <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                    {bytes(process.memory_bytes)}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {(process.ports || []).map((port) => (
                      <button
                        type="button"
                        key={port}
                        disabled={protectedProcess}
                        onClick={() => setConfirm({ kind: 'port', process, port })}
                        title={protectedProcess ? 'Protected system process' : `Free port ${port}`}
                        aria-label={`Free port ${port}`}
                        className="h-6 px-1.5 rounded bg-[var(--color-warning-bg)] text-[var(--color-warning)] font-mono text-[11px] hover:bg-[var(--color-warning)] hover:text-black disabled:opacity-40 cursor-pointer"
                      >
                        :{port}
                      </button>
                    ))}
                    {!process.ports?.length && (
                      <span className="text-xs text-[var(--color-text-tertiary)]">—</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <span
                      className="block truncate font-mono text-xs text-[var(--color-text-secondary)]"
                      title={process.cwd || undefined}
                    >
                      {process.cwd || 'No working directory reported'}
                    </span>
                  </div>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      title="Open Command Prompt (CMD) here"
                      aria-label={`Open Command Prompt at ${process.cwd || process.name}`}
                      disabled={!process.cwd}
                      onClick={() => process.cwd && EntropyApiClient.openInCmd(process.cwd)}
                      className="w-7 h-7 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-warning)] hover:bg-[var(--color-surface-3)] disabled:opacity-30 cursor-pointer"
                    >
                      <SquareTerminal className="w-3.5 h-3.5 mx-auto" />
                    </button>
                    <button
                      type="button"
                      title="Open folder"
                      aria-label={`Reveal folder in File Explorer: ${process.cwd || process.name}`}
                      disabled={!process.cwd}
                      onClick={() => process.cwd && EntropyApiClient.openInExplorer(process.cwd)}
                      className="w-7 h-7 rounded-md text-[var(--color-text-tertiary)] hover:text-white hover:bg-[var(--color-surface-3)] disabled:opacity-30 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 mx-auto" />
                    </button>
                    <button
                      type="button"
                      disabled={protectedProcess}
                      title={protectedProcess ? 'Protected system process' : 'Stop process'}
                      aria-label={protectedProcess ? `Protected system process ${process.name}` : `Stop process ${process.name} PID ${process.pid}`}
                      onClick={() => setConfirm({ kind: 'process', process })}
                      className="w-7 h-7 rounded-md text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] disabled:opacity-30 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  </div>
                </div>
              );
            })}
            {!matchingProcesses.length && (
              <p className="px-4 py-12 text-center text-sm text-[var(--color-text-secondary)]">
                No processes match this view.
              </p>
            )}
          </div>
        )}
        {tab === 'runtimes' && (
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface-1)]">
            {runtimes
              .filter((runtime) =>
                match([
                  runtime.name,
                  runtime.runtime,
                  runtime.version,
                  runtime.executable_path,
                  runtime.path,
                ])
              )
              .map((runtime, index) => {
                const path =
                  runtime.executable_path ||
                  runtime.path ||
                  runtime.install_path ||
                  'No path reported';
                return (
                  <div
                    key={runtime.entity_id || index}
                    className="grid grid-cols-[190px_1fr_150px_34px] gap-4 items-center px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0"
                  >
                    <div>
                      <div className="font-medium">
                        {runtime.name || runtime.runtime || 'Runtime'}
                      </div>
                      <span className="font-mono text-xs text-[var(--color-accent-strong)]">
                        {runtime.version || 'Unknown version'}
                      </span>
                    </div>
                    <span className="truncate font-mono text-xs text-[var(--color-text-secondary)]">
                      {path}
                    </span>
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {runtime.is_system ? 'System install' : 'User install'}
                    </span>
                    <button
                      type="button"
                      onClick={() => copy(path)}
                      title="Copy path"
                      className="text-[var(--color-text-tertiary)] hover:text-white cursor-pointer"
                    >
                      {copied === path ? (
                        <Check className="w-3.5 h-3.5 text-[var(--color-success)]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                );
              })}
          </div>
        )}
        {tab === 'containers' && (
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface-1)]">
            {containers
              .filter((container) =>
                match([container.name, container.image, container.status, container.state])
              )
              .map((container, index) => (
                <div
                  key={container.entity_id || index}
                  className="grid grid-cols-[1fr_1fr_130px_180px] gap-4 items-center px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0"
                >
                  <span className="font-medium">{container.name}</span>
                  <span className="truncate font-mono text-xs text-[var(--color-text-secondary)]">
                    {container.image}
                  </span>
                  <span
                    className={
                      container.state === 'running'
                        ? 'text-xs text-[var(--color-success)]'
                        : 'text-xs text-[var(--color-text-tertiary)]'
                    }
                  >
                    {container.status || container.state}
                  </span>
                  <span className="truncate font-mono text-xs text-[var(--color-text-tertiary)]">
                    {container.ports?.join(', ') || 'No ports'}
                  </span>
                </div>
              ))}
            {!containers.length && (
              <p className="px-4 py-12 text-center text-sm text-[var(--color-text-secondary)]">
                No containers found.
              </p>
            )}
          </div>
        )}
        {tab === 'caches' && (
          <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface-1)]">
            {caches
              .filter((cache) => match([cache.category, cache.path]))
              .map((cache, index) => (
                <div
                  key={cache.entity_id || index}
                  className="grid grid-cols-[190px_1fr_100px_34px] gap-4 items-center px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0"
                >
                  <div>
                    <div className="font-medium">{cache.category} cache</div>
                    <span className="text-xs text-[var(--color-text-tertiary)]">
                      {cache.is_shared ? 'Shared across projects' : 'Project cache'}
                    </span>
                  </div>
                  <span className="truncate font-mono text-xs text-[var(--color-text-secondary)]">
                    {cache.path}
                  </span>
                  <span className="font-mono text-xs text-[var(--color-accent-strong)]">
                    {bytes(cache.size_bytes)}
                  </span>
                  <button
                    type="button"
                    onClick={() => EntropyApiClient.openInExplorer(cache.path)}
                    title="Open folder"
                    className="text-[var(--color-text-tertiary)] hover:text-white cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            {!caches.length && (
              <p className="px-4 py-12 text-center text-sm text-[var(--color-text-secondary)]">
                No caches found.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { Activity, Boxes, Check, Copy, Cpu, Database, ExternalLink, Filter, FolderOpen, Terminal, X, XCircle, Zap } from 'lucide-react';
import { CacheConnection, DockerConnection, ProcessConnection, RuntimeConnection } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface SystemViewProps {
  initialTab?: 'processes' | 'runtimes' | 'containers' | 'caches';
  processes?: ProcessConnection[];
  runtimes?: RuntimeConnection[];
  containers?: DockerConnection[];
  caches?: CacheConnection[];
  onActionComplete?: () => Promise<void> | void;
}

const developerNames = ['node', 'python', 'py', 'cargo', 'rustc', 'go', 'flutter', 'dart', 'java', 'dotnet', 'ruby', 'code', 'cursor', 'powershell', 'pwsh', 'cmd', 'bash', 'wt', 'vite', 'next', 'ts-node', 'nodemon', 'webpack', 'esbuild', 'npm', 'yarn', 'pnpm'];
const systemNames = new Set(['svchost.exe', 'system', 'system idle process', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'fontdrvhost.exe', 'dwm.exe', 'memory compression', 'sihost.exe']);

function bytes(value: number | null | undefined): string {
  if (!value) return '—';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(0)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function isDeveloperProcess(process: ProcessConnection): boolean {
  if (process.ports?.length || process.cwd || process.is_shell) return true;
  const name = (process.name || '').toLowerCase();
  return !systemNames.has(name) && developerNames.some((term) => name.includes(term));
}

export const SystemView: React.FC<SystemViewProps> = ({ initialTab = 'processes', processes = [], runtimes = [], containers = [], caches = [], onActionComplete }) => {
  const [tab, setTab] = useState(initialTab);
  const [scope, setScope] = useState<'developer' | 'all'>('developer');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'process' | 'port'; process: ProcessConnection; port?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const developerProcessCount = useMemo(() => processes.filter(isDeveloperProcess).length, [processes]);
  const matchingProcesses = useMemo(() => processes.filter((process) => {
    if (scope === 'developer' && !isDeveloperProcess(process)) return false;
    const haystack = [process.name, process.cwd, process.cmdline_preview, String(process.pid), ...(process.ports || []).map(String)].join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase().trim());
  }).sort((a, b) => (b.ports?.length || 0) - (a.ports?.length || 0) || Number(Boolean(b.cwd)) - Number(Boolean(a.cwd)) || a.pid - b.pid), [processes, query, scope]);

  const copy = (value: string) => { navigator.clipboard.writeText(value); setCopied(value); setTimeout(() => setCopied(null), 1600); };
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
  const tabButton = (id: typeof tab, label: string, Icon: typeof Activity, count: number) => <button type="button" onClick={() => setTab(id)} className={`h-8 px-2.5 rounded-md text-xs flex items-center gap-1.5 transition-colors ${tab === id ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'}`}><Icon className="w-3.5 h-3.5" />{label}<span className="font-mono text-[10px]">{count}</span></button>;

  return <div className="flex-1 h-full overflow-y-auto bg-[var(--color-surface-0)] animate-enter">
    {notice && <div className="fixed z-50 right-6 top-5 px-3 py-2 rounded-md bg-[var(--color-surface-3)] border border-[var(--color-border-strong)] text-xs text-[var(--color-text-primary)] shadow-xl">{notice}</div>}
    {confirm && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"><div className="w-full max-w-sm rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-5 shadow-2xl"><div className="flex justify-between gap-4"><div><h2 className="font-semibold text-sm">{confirm.kind === 'port' ? `Free port ${confirm.port}` : `Stop ${confirm.process.name}`}</h2><p className="mt-1 text-xs text-[var(--color-text-secondary)]">This stops PID <span className="font-mono">{confirm.process.pid}</span>{confirm.kind === 'port' ? ` to release port ${confirm.port}.` : '.'}</p></div><button type="button" onClick={() => setConfirm(null)} className="text-[var(--color-text-tertiary)] hover:text-white"><X className="w-4 h-4" /></button></div><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setConfirm(null)} className="h-8 px-3 text-xs text-[var(--color-text-secondary)] hover:text-white">Cancel</button><button type="button" disabled={busy} onClick={execute} className="h-8 px-3 rounded-md bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white text-xs font-medium">{busy ? 'Stopping…' : confirm.kind === 'port' ? 'Free port' : 'Stop process'}</button></div></div></div>}
    <header className="sticky top-0 z-10 h-14 px-7 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-0)]/95 backdrop-blur"><div><h1 className="text-sm font-semibold">Processes</h1><p className="text-[11px] text-[var(--color-text-tertiary)]">See what is running and act on the processes tied to your work.</p></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by process, port, or folder" className="w-64 h-8 px-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] outline-none" /></header>
    <div className="max-w-6xl mx-auto px-7 py-6 space-y-5">
      <div className="flex items-center justify-between"><div className="p-1 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] flex gap-1">{tabButton('processes', 'Processes', Activity, processes.length)}{tabButton('runtimes', 'Runtimes', Cpu, runtimes.length)}{tabButton('containers', 'Containers', Boxes, containers.length)}{tabButton('caches', 'Caches', Database, caches.length)}</div>{tab === 'processes' && <div className="p-1 rounded-md bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] flex gap-1"><button type="button" onClick={() => setScope('developer')} className={`h-7 px-2 text-xs rounded ${scope === 'developer' ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)]' : 'text-[var(--color-text-tertiary)]'}`}><Filter className="inline w-3 h-3 mr-1" />Developer {developerProcessCount}</button><button type="button" onClick={() => setScope('all')} className={`h-7 px-2 text-xs rounded ${scope === 'all' ? 'bg-[var(--color-surface-3)] text-white' : 'text-[var(--color-text-tertiary)]'}`}>All {processes.length}</button></div>}</div>
      {tab === 'processes' && <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface-1)]"><div className="grid grid-cols-[1.1fr_90px_150px_1.6fr_132px] gap-4 px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)] border-b border-[var(--color-border-subtle)]"><span>Process</span><span>Memory</span><span>Ports</span><span>Working directory</span><span /></div>{matchingProcesses.map((process) => { const protectedProcess = systemNames.has((process.name || '').toLowerCase()); return <div key={process.entity_id || process.pid} className="group grid grid-cols-[1.1fr_90px_150px_1.6fr_132px] gap-4 items-center px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0 hover:bg-[var(--color-surface-2)]"><div className="min-w-0"><div className="truncate text-sm font-medium">{process.name}</div><div className="font-mono text-[11px] text-[var(--color-text-tertiary)]">PID {process.pid}</div></div><span className="font-mono text-xs text-[var(--color-text-secondary)]">{bytes(process.memory_bytes)}</span><div className="flex flex-wrap gap-1">{(process.ports || []).map((port) => <button type="button" key={port} disabled={protectedProcess} onClick={() => setConfirm({ kind: 'port', process, port })} title={protectedProcess ? 'Protected system process' : `Free port ${port}`} className="h-6 px-1.5 rounded bg-[var(--color-warning-bg)] text-[var(--color-warning)] font-mono text-[11px] hover:bg-[var(--color-warning)] hover:text-black disabled:opacity-40">:{port}</button>)}{!process.ports?.length && <span className="text-xs text-[var(--color-text-tertiary)]">—</span>}</div><div className="min-w-0"><span className="block truncate font-mono text-xs text-[var(--color-text-secondary)]">{process.cwd || 'No working directory reported'}</span></div><div className="flex justify-end gap-1"><button type="button" title="Open terminal here" disabled={!process.cwd} onClick={() => process.cwd && EntropyApiClient.openInTerminal(process.cwd)} className="w-7 h-7 rounded-md text-[var(--color-text-tertiary)] hover:text-white hover:bg-[var(--color-surface-3)] disabled:opacity-30"><Terminal className="w-3.5 h-3.5 mx-auto" /></button><button type="button" title="Open folder" disabled={!process.cwd} onClick={() => process.cwd && EntropyApiClient.openInExplorer(process.cwd)} className="w-7 h-7 rounded-md text-[var(--color-text-tertiary)] hover:text-white hover:bg-[var(--color-surface-3)] disabled:opacity-30"><FolderOpen className="w-3.5 h-3.5 mx-auto" /></button><button type="button" disabled={protectedProcess} title={protectedProcess ? 'Protected system process' : 'Stop process'} onClick={() => setConfirm({ kind: 'process', process })} className="w-7 h-7 rounded-md text-rose-400 hover:bg-rose-500/15 disabled:opacity-30"><XCircle className="w-3.5 h-3.5 mx-auto" /></button></div></div>; })}{!matchingProcesses.length && <p className="px-4 py-12 text-center text-sm text-[var(--color-text-secondary)]">No processes match this view.</p>}</div>}
      {tab === 'runtimes' && <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface-1)]">{runtimes.filter((runtime) => match([runtime.name, runtime.runtime, runtime.version, runtime.executable_path, runtime.path])).map((runtime, index) => { const path = runtime.executable_path || runtime.path || runtime.install_path || 'No path reported'; return <div key={runtime.entity_id || index} className="grid grid-cols-[190px_1fr_150px_34px] gap-4 items-center px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0"><div><div className="font-medium">{runtime.name || runtime.runtime || 'Runtime'}</div><span className="font-mono text-xs text-[var(--color-accent-strong)]">{runtime.version || 'Unknown version'}</span></div><span className="truncate font-mono text-xs text-[var(--color-text-secondary)]">{path}</span><span className="text-xs text-[var(--color-text-tertiary)]">{runtime.is_system ? 'System install' : 'User install'}</span><button type="button" onClick={() => copy(path)} title="Copy path" className="text-[var(--color-text-tertiary)] hover:text-white">{copied === path ? <Check className="w-3.5 h-3.5 text-[var(--color-success)]" /> : <Copy className="w-3.5 h-3.5" />}</button></div>; })}</div>}
      {tab === 'containers' && <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface-1)]">{containers.filter((container) => match([container.name, container.image, container.status, container.state])).map((container, index) => <div key={container.entity_id || index} className="grid grid-cols-[1fr_1fr_130px_180px] gap-4 items-center px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0"><span className="font-medium">{container.name}</span><span className="truncate font-mono text-xs text-[var(--color-text-secondary)]">{container.image}</span><span className={container.state === 'running' ? 'text-xs text-[var(--color-success)]' : 'text-xs text-[var(--color-text-tertiary)]'}>{container.status || container.state}</span><span className="truncate font-mono text-xs text-[var(--color-text-tertiary)]">{container.ports?.join(', ') || 'No ports'}</span></div>)}{!containers.length && <p className="px-4 py-12 text-center text-sm text-[var(--color-text-secondary)]">No containers found.</p>}</div>}
      {tab === 'caches' && <div className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface-1)]">{caches.filter((cache) => match([cache.category, cache.path])).map((cache, index) => <div key={cache.entity_id || index} className="grid grid-cols-[190px_1fr_100px_34px] gap-4 items-center px-4 py-3 border-b border-[var(--color-border-subtle)] last:border-b-0"><div><div className="font-medium">{cache.category} cache</div><span className="text-xs text-[var(--color-text-tertiary)]">{cache.is_shared ? 'Shared across projects' : 'Project cache'}</span></div><span className="truncate font-mono text-xs text-[var(--color-text-secondary)]">{cache.path}</span><span className="font-mono text-xs text-[var(--color-accent-strong)]">{bytes(cache.size_bytes)}</span><button type="button" onClick={() => EntropyApiClient.openInExplorer(cache.path)} title="Open folder" className="text-[var(--color-text-tertiary)] hover:text-white"><ExternalLink className="w-3.5 h-3.5" /></button></div>)}{!caches.length && <p className="px-4 py-12 text-center text-sm text-[var(--color-text-secondary)]">No caches found.</p>}</div>}
    </div>
  </div>;
};

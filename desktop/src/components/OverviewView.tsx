import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDot,
  ExternalLink,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitMerge,
  Globe,
  HardDrive,
  RefreshCw,
  Shield,
  ShieldAlert,
  SquareTerminal,
  Terminal,
  Zap,
} from 'lucide-react';
import { EnvironmentOverview, WorkspaceSummary } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface OverviewViewProps {
  overview?: EnvironmentOverview | null;
  onRefresh: () => void;
  isLoading: boolean;
  onSelectWorkspace: (path: string) => void;
  onInspectFolder: () => void;
  currentWorkspace?: WorkspaceSummary | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatWipAge(timestamp: number | null | undefined): string {
  if (!timestamp) return '';
  const ts = timestamp > 1e11 ? timestamp / 1000 : timestamp;
  const seconds = Math.floor(Date.now() / 1000 - ts);
  const days = Math.floor(seconds / 86400);
  if (days < 1) return 'today';
  if (days === 1) return '1 day old';
  return `${days} days old`;
}

function typeName(type: string): string {
  const names: Record<string, string> = { node: 'Node', python: 'Python', rust: 'Rust', flutter: 'Flutter', dotnet: '.NET', java: 'Java', ruby: 'Ruby', go: 'Go' };
  return names[type.toLowerCase()] || type;
}

function WorkspaceRow({
  workspace,
  onOpen,
  isActive,
}: {
  workspace: WorkspaceSummary;
  onOpen: () => void;
  isActive?: boolean;
}) {
  const dirty = workspace.has_uncommitted_changes;
  const running = workspace.process_count > 0;
  return (
    <div
      className={`group grid grid-cols-[minmax(160px,1.5fr)_minmax(140px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_84px] items-center gap-4 px-4 py-3.5 border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-2)] transition-colors ${
        isActive ? 'bg-[var(--color-surface-2)]/70 relative border-l-2 border-l-[var(--color-accent)]' : ''
      }`}
    >
      <button type="button" onClick={onOpen} className="min-w-0 text-left cursor-pointer">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              running
                ? 'bg-[var(--color-success)] shadow-[0_0_8px_rgba(52,211,153,.7)]'
                : dirty
                ? 'bg-[var(--color-warning)]'
                : 'bg-[var(--color-text-tertiary)]'
            }`}
          />
          <span className="truncate font-medium text-[var(--color-text-primary)]">
            {workspace.name}
          </span>
          {isActive && (
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent-strong)] border border-[var(--color-accent)]/30">
              Active
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
          <span className="ml-3.5 text-[11px] font-mono text-[var(--color-text-tertiary)]">
            {typeName(workspace.project_type)}
          </span>
          {workspace.unprotected_env_files && workspace.unprotected_env_files.length > 0 && (
            <span
              title={`Unprotected secrets: ${workspace.unprotected_env_files.join(', ')}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.2 text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded"
            >
              <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />
              .env
            </span>
          )}
          {workspace.merged_branches && workspace.merged_branches.length > 0 && (
            <span
              title={`${workspace.merged_branches.length} merged branch(es) safe to prune`}
              className="inline-flex items-center gap-1 px-1.5 py-0.2 text-[10px] font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded"
            >
              <GitMerge className="w-2.5 h-2.5 text-blue-400" />
              {workspace.merged_branches.length} merged
            </span>
          )}
          {workspace.ports && workspace.ports.length > 0 && (
            <div className="flex items-center gap-1">
              {workspace.ports.map((port) => (
                <span
                  key={port}
                  onClick={(e) => {
                    e.stopPropagation();
                    EntropyApiClient.openUrl(`http://localhost:${port}`);
                  }}
                  title={`Open http://localhost:${port} in browser`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 rounded cursor-pointer transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  :{port}
                  <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
      <span className="truncate font-mono text-xs text-[var(--color-text-secondary)]" title={workspace.path}>
        {workspace.path}
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
        <GitBranch className="w-3.5 h-3.5" />
        {workspace.git_branch || 'No Git branch'}
      </span>
      <span
        className={`text-xs ${
          dirty
            ? 'text-[var(--color-warning)]'
            : running
            ? 'text-[var(--color-success)]'
            : 'text-[var(--color-text-tertiary)]'
        }`}
      >
        {dirty
          ? `${workspace.dirty_count || 1} unsaved file${(workspace.dirty_count || 1) === 1 ? '' : 's'}`
          : running
          ? `${workspace.process_count} process${workspace.process_count === 1 ? '' : 'es'} running`
          : 'No active process'}
      </span>
      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          title="Open Windows Terminal"
          onClick={() => EntropyApiClient.openInTerminal(workspace.path)}
          className="w-7 h-7 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center justify-center cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="Open in PowerShell"
          onClick={() => EntropyApiClient.openInPowerShell(workspace.path)}
          className="w-7 h-7 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-sky-400 flex items-center justify-center cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="Open in Command Prompt (CMD)"
          onClick={() => EntropyApiClient.openInCmd(workspace.path)}
          className="w-7 h-7 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-amber-400 flex items-center justify-center cursor-pointer"
        >
          <SquareTerminal className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          title="Inspect workspace"
          onClick={onOpen}
          className="w-7 h-7 rounded-md hover:bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)] flex items-center justify-center cursor-pointer"
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  overview,
  onRefresh,
  isLoading,
  onSelectWorkspace,
  onInspectFolder,
  currentWorkspace,
}) => {
  const artifacts = overview?.system?.artifacts || [];
  const reclaimable = artifacts.reduce((sum, artifact) => sum + (artifact.size_bytes || 0), 0);
  const dirty = (overview?.workspaces || []).filter((workspace) => workspace.has_uncommitted_changes);
  const running = (overview?.workspaces || []).filter((workspace) => workspace.process_count > 0);
  const ordered = useMemo(
    () =>
      [...(overview?.workspaces || [])].sort(
        (a, b) =>
          Number(b.has_uncommitted_changes) - Number(a.has_uncommitted_changes) ||
          b.process_count - a.process_count ||
          (b.last_modified || 0) - (a.last_modified || 0)
      ),
    [overview?.workspaces]
  );
  const firstAction = dirty[0] || running[0] || ordered[0];

  const devServers = useMemo(() => {
    const list: { workspace: WorkspaceSummary; port: number }[] = [];
    (overview?.workspaces || []).forEach((w) => {
      (w.ports || []).forEach((port) => {
        list.push({ workspace: w, port });
      });
    });
    return list;
  }, [overview?.workspaces]);

  const [confirmCleanSlate, setConfirmCleanSlate] = useState(false);
  const [cleanSlateLoading, setCleanSlateLoading] = useState(false);
  const [cleanSlateNotice, setCleanSlateNotice] = useState<string | null>(null);

  const [gitNotice, setGitNotice] = useState<string | null>(null);
  const [gitLoadingPath, setGitLoadingPath] = useState<string | null>(null);

  const secretLeakWorkspaces = useMemo(() => {
    return (overview?.workspaces || []).filter(
      (w) => w.unprotected_env_files && w.unprotected_env_files.length > 0
    );
  }, [overview?.workspaces]);

  const wipRadarWorkspaces = useMemo(() => {
    const scanTs = overview?.metadata?.timestamp ? overview.metadata.timestamp / 1000 : 0;
    return (overview?.workspaces || []).filter((w) => {
      if (!w.has_uncommitted_changes) return false;
      if (!w.oldest_dirty_timestamp) return true;
      const ts = w.oldest_dirty_timestamp > 1e11 ? w.oldest_dirty_timestamp / 1000 : w.oldest_dirty_timestamp;
      const refTs = scanTs || ts;
      const days = Math.floor((refTs - ts) / 86400);
      return days >= 1; // 1+ days old uncommitted changes
    });
  }, [overview?.workspaces, overview?.metadata?.timestamp]);

  const handleQuickIgnoreEnv = async (workspacePath: string) => {
    setGitLoadingPath(workspacePath);
    try {
      const res = await EntropyApiClient.addToGitignore(workspacePath, '.env*');
      if (res.success) {
        setGitNotice(`Protected secrets: Added .env* to .gitignore`);
      } else {
        setGitNotice(res.error || 'Failed to update .gitignore');
      }
      onRefresh();
    } catch {
      setGitNotice('Failed to update .gitignore');
    } finally {
      setGitLoadingPath(null);
      setTimeout(() => setGitNotice(null), 5000);
    }
  };

  const handleQuickStash = async (workspacePath: string) => {
    setGitLoadingPath(workspacePath);
    try {
      const res = await EntropyApiClient.stashWorkspace(workspacePath);
      if (res.success) {
        setGitNotice(res.message || 'Safely stashed working tree.');
      } else {
        setGitNotice(res.error || 'Failed to stash workspace.');
      }
      onRefresh();
    } catch {
      setGitNotice('Failed to stash workspace.');
    } finally {
      setGitLoadingPath(null);
      setTimeout(() => setGitNotice(null), 5000);
    }
  };

  const devProcesses = useMemo(() => {
    const procs = overview?.system?.processes || [];
    return procs.filter((p) => {
      const name = (p.name || '').toLowerCase();
      return (
        ['node', 'python', 'bun', 'deno', 'cargo', 'rustc', 'go', 'java', 'dotnet', 'ruby', 'tsc', 'vite', 'webpack', 'esbuild'].some((term) => name.includes(term)) ||
        (p.ports && p.ports.length > 0)
      );
    });
  }, [overview?.system?.processes]);

  const totalDevRam = useMemo(() => {
    return devProcesses.reduce((acc, p) => acc + (p.memory_bytes || 0), 0);
  }, [devProcesses]);

  const handleExecuteCleanSlate = async () => {
    setCleanSlateLoading(true);
    try {
      const res = await EntropyApiClient.cleanSlateDevProcesses(devProcesses.map((p) => p.pid));
      if (res.success) {
        setCleanSlateNotice(`Clean Slate complete: Terminated ${res.terminated_count} dev processes and freed ${formatSize(res.freed_memory_bytes)} RAM.`);
      } else {
        setCleanSlateNotice(res.errors?.[0]?.error || 'Failed to complete Clean Slate.');
      }
      onRefresh();
    } catch {
      setCleanSlateNotice('Error running Clean Slate.');
    } finally {
      setCleanSlateLoading(false);
      setConfirmCleanSlate(false);
      setTimeout(() => setCleanSlateNotice(null), 5000);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto overflow-x-hidden w-full max-w-full bg-[var(--color-surface-0)] animate-enter">
      <header className="sticky top-0 z-10 h-14 px-4 sm:px-7 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-0)]/95 backdrop-blur w-full min-w-0">
        <div className="min-w-0 flex-1 mr-4">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-[var(--color-text-primary)] shrink-0">Workspaces</h1>
            {currentWorkspace && (
              <>
                <span className="text-[var(--color-text-tertiary)] text-xs">/</span>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-accent-strong)] max-w-xs truncate">
                  <FolderGit2 className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0" />
                  <span className="font-semibold truncate">{currentWorkspace.name}</span>
                  {currentWorkspace.git_branch && (
                    <span className="font-mono text-[10px] text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-1.5 py-0.2 rounded border border-[var(--color-border-subtle)] shrink-0">
                      {currentWorkspace.git_branch}
                    </span>
                  )}
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      currentWorkspace.has_uncommitted_changes
                        ? 'bg-[var(--color-warning)]'
                        : 'bg-[var(--color-success)] shadow-[0_0_6px_rgba(52,211,153,.6)]'
                    }`}
                  />
                </div>
              </>
            )}
          </div>
          <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono truncate max-w-lg">
            {currentWorkspace ? currentWorkspace.path : 'Your local developer working set'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onInspectFolder}
            className="h-8 px-2.5 rounded-md text-xs bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] text-[var(--color-text-primary)] flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="Add or open workspace folder"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[var(--color-accent)]" />
            Add folder…
          </button>
          <button
            type="button"
            title="Refresh workspaces"
            onClick={onRefresh}
            disabled={isLoading}
            className="w-8 h-8 rounded-md hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] flex items-center justify-center disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-7 py-7 space-y-7 min-w-0">
        <section className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-5 min-w-0">
          <div className="border border-[var(--color-border)] bg-[var(--color-surface-1)] rounded-lg p-5 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)] font-semibold">
              Up next
            </p>
            {firstAction ? (
              <>
                <div className="mt-3 flex items-start gap-3 min-w-0">
                  <div
                    className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                      firstAction.has_uncommitted_changes
                        ? 'bg-[var(--color-warning)]'
                        : 'bg-[var(--color-success)]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-semibold truncate">
                      {firstAction.has_uncommitted_changes
                        ? `${firstAction.name} has changes to review`
                        : `${firstAction.name} is running`}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                      {firstAction.has_uncommitted_changes
                        ? 'Open the workspace to stash, inspect changes, or continue coding.'
                        : `${firstAction.process_count} local process${
                            firstAction.process_count === 1 ? '' : 'es'
                          } linked to this workspace.`}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectWorkspace(firstAction.path)}
                    className="h-8 px-3 rounded-md bg-[var(--color-accent)] hover:bg-blue-500 text-white text-xs font-medium cursor-pointer shrink-0"
                  >
                    Open workspace
                  </button>
                  <button
                    type="button"
                    onClick={() => EntropyApiClient.openInTerminal(firstAction.path)}
                    title="Open in Windows Terminal"
                    className="h-8 px-3 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Terminal
                  </button>
                  <button
                    type="button"
                    onClick={() => EntropyApiClient.openInPowerShell(firstAction.path)}
                    title="Open in PowerShell"
                    className="h-8 px-3 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Terminal className="w-3.5 h-3.5 text-sky-400" />
                    PowerShell
                  </button>
                  <button
                    type="button"
                    onClick={() => EntropyApiClient.openInCmd(firstAction.path)}
                    title="Open in Command Prompt (CMD)"
                    className="h-8 px-3 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <SquareTerminal className="w-3.5 h-3.5 text-amber-400" />
                    CMD
                  </button>
                  {firstAction.ports && firstAction.ports.length > 0 && firstAction.ports.map((port) => (
                    <button
                      key={port}
                      type="button"
                      onClick={() => EntropyApiClient.openUrl(`http://localhost:${port}`)}
                      title={`Open http://localhost:${port} in default browser`}
                      className="h-8 px-3 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/35 hover:bg-emerald-500/30 text-xs flex items-center gap-1.5 cursor-pointer font-medium transition-colors shrink-0"
                    >
                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                      <span>localhost:{port}</span>
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </button>
                  ))}
                </div>
              </>
            ) : !overview ? (
              <div className="mt-3 flex items-start gap-3">
                <RefreshCw className="mt-1 w-4 h-4 text-[var(--color-accent)] animate-spin shrink-0" />
                <div>
                  <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                    Discovering developer workspaces…
                  </h2>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    Scanning configured directories for Git repositories, processes, and dependencies.
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                Add a folder to start tracking a workspace.
              </p>
            )}
          </div>
          <div className="border border-[var(--color-border)] bg-[var(--color-surface-1)] rounded-lg divide-y divide-[var(--color-border-subtle)] min-w-0">
            <button
              type="button"
              onClick={() => dirty[0] && onSelectWorkspace(dirty[0].path)}
              disabled={!dirty.length}
              className="w-full text-left px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer disabled:cursor-default"
            >
              <span className="text-xl font-semibold text-[var(--color-warning)]">
                {overview ? dirty.length : '—'}
              </span>
              <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
                workspace{dirty.length === 1 ? '' : 's'} with changes
              </span>
            </button>
            <button
              type="button"
              onClick={() => running[0] && onSelectWorkspace(running[0].path)}
              disabled={!running.length}
              className="w-full text-left px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer disabled:cursor-default"
            >
              <span className="text-xl font-semibold text-[var(--color-success)]">
                {overview ? running.length : '—'}
              </span>
              <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
                workspace{running.length === 1 ? '' : 's'} currently running
              </span>
            </button>
            <button
              type="button"
              onClick={() => onSelectWorkspace(artifacts[0]?.project_path || '')}
              disabled={!artifacts.length}
              className="w-full text-left px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors disabled:cursor-default"
            >
              <span className="text-xl font-semibold text-[var(--color-accent-strong)]">
                {overview ? formatSize(reclaimable) : '—'}
              </span>
              <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
                safe project cleanup available
              </span>
            </button>
            {totalDevRam > 0 && (
              <button
                type="button"
                onClick={() => setConfirmCleanSlate(true)}
                className="w-full text-left px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer group"
                title="Terminate background dev servers to reclaim RAM"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xl font-semibold text-emerald-400 group-hover:underline">
                      {formatSize(totalDevRam)}
                    </span>
                    <span className="ml-2 text-xs text-[var(--color-text-secondary)]">
                      RAM in {devProcesses.length} dev server{devProcesses.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                    <Zap className="w-3 h-3" />
                    Clean Slate
                  </span>
                </div>
              </button>
            )}
          </div>
        </section>

        {devServers.length > 0 && (
          <section className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{devServers.length} Active Localhost Dev Server{devServers.length > 1 ? 's' : ''}:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {devServers.map(({ workspace, port }) => (
                <div
                  key={`${workspace.id}-${port}`}
                  className="flex items-center gap-2 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] px-3 py-1.5 rounded-lg text-xs"
                >
                  <span className="font-semibold text-[var(--color-text-primary)]">{workspace.name}</span>
                  <button
                    type="button"
                    onClick={() => EntropyApiClient.openUrl(`http://localhost:${port}`)}
                    title={`Open http://localhost:${port} in default browser`}
                    className="inline-flex items-center gap-1 font-mono font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                  >
                    <Globe className="w-3 h-3" />
                    :{port}
                    <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                  </button>
                  <span className="text-[var(--color-border-subtle)]">|</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await EntropyApiClient.freePort(port);
                      onRefresh();
                    }}
                    title={`Free port ${port} by terminating owner process`}
                    className="text-amber-400 hover:text-amber-300 hover:underline cursor-pointer font-medium"
                  >
                    Free
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Secret Leak Watchdog Banner ── */}
        {secretLeakWorkspaces.length > 0 && (
          <section className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <h3 className="text-xs font-semibold text-rose-300">
                  Secret Leak Watchdog: {secretLeakWorkspaces.length} workspace{secretLeakWorkspaces.length > 1 ? 's' : ''} have unprotected .env secrets
                </h3>
              </div>
              <span className="text-[11px] text-rose-300/80">Never commit secrets to Git</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {secretLeakWorkspaces.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-xs"
                >
                  <div className="min-w-0 mr-2">
                    <span className="font-semibold text-[var(--color-text-primary)] block truncate">{w.name}</span>
                    <span className="font-mono text-[11px] text-rose-400 truncate block">
                      {w.unprotected_env_files?.join(', ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickIgnoreEnv(w.path)}
                    disabled={gitLoadingPath === w.path}
                    className="shrink-0 px-2.5 py-1 text-xs font-medium bg-rose-500 hover:bg-rose-600 text-white rounded-md transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {gitLoadingPath === w.path ? 'Adding...' : 'Add to .gitignore'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── WIP Radar (Work In Progress Safety Net) ── */}
        {wipRadarWorkspaces.length > 0 && (
          <section className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-semibold text-amber-300">
                  WIP Radar: Stale uncommitted changes in {wipRadarWorkspaces.length} workspace{wipRadarWorkspaces.length > 1 ? 's' : ''}
                </h3>
              </div>
              <span className="text-[11px] text-amber-300/80">Stash or commit to prevent data loss</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {wipRadarWorkspaces.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-xs"
                >
                  <div className="min-w-0 mr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[var(--color-text-primary)] truncate">{w.name}</span>
                      {w.oldest_dirty_timestamp && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                          {formatWipAge(w.oldest_dirty_timestamp)}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-[var(--color-text-tertiary)] truncate block">
                      {w.dirty_count || 1} uncommitted file{(w.dirty_count || 1) === 1 ? '' : 's'} on {w.git_branch || 'HEAD'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleQuickStash(w.path)}
                      disabled={gitLoadingPath === w.path}
                      title="Safely stash changes"
                      className="px-2.5 py-1 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/35 hover:bg-amber-500/30 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {gitLoadingPath === w.path ? 'Stashing...' : 'Safe Stash'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectWorkspace(w.path)}
                      className="px-2 py-1 text-xs text-[var(--color-accent-strong)] hover:underline cursor-pointer"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface-1)] min-w-0">
          <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--color-border-subtle)] flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-semibold">All workspaces</h2>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                {overview
                  ? `${overview.summary.total_workspaces} detected · ${overview.summary.total_processes} processes on this machine`
                  : 'Scanning developer environment…'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
              <span className="flex items-center gap-1">
                <CircleDot className="w-3.5 h-3.5 text-[var(--color-success)]" />
                Running
              </span>
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                Review
              </span>
              <span className="flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-[var(--color-accent-strong)]" />
                Cleanup
              </span>
            </div>
          </div>
          <div className="w-full overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[minmax(160px,1.5fr)_minmax(140px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_84px] gap-4 px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)] border-b border-[var(--color-border-subtle)]">
                <span>Workspace</span>
                <span>Path</span>
                <span>Branch</span>
                <span>State</span>
                <span />
              </div>
              {overview ? (
                <>
                  {ordered.map((workspace) => {
                    const isRowActive = currentWorkspace?.path
                      ? workspace.path.toLowerCase().replace(/[\\/]+$/, '') ===
                        currentWorkspace.path.toLowerCase().replace(/[\\/]+$/, '')
                      : false;
                    return (
                      <WorkspaceRow
                        key={workspace.id}
                        workspace={workspace}
                        isActive={isRowActive}
                        onOpen={() => onSelectWorkspace(workspace.path)}
                      />
                    );
                  })}
                  {!ordered.length && (
                    <div className="px-5 py-12 text-center text-sm text-[var(--color-text-secondary)]">
                      No workspaces found.{' '}
                      <button
                        type="button"
                        onClick={onInspectFolder}
                        className="text-[var(--color-accent-strong)] hover:underline cursor-pointer"
                      >
                        Add a folder
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="divide-y divide-[var(--color-border-subtle)]">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(160px,1.5fr)_minmax(140px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_84px] items-center gap-4 px-4 py-4 animate-pulse"
                    >
                      <div className="h-4 w-32 bg-[var(--color-surface-2)] rounded" />
                      <div className="h-3 w-48 bg-[var(--color-surface-2)] rounded font-mono" />
                      <div className="h-3 w-20 bg-[var(--color-surface-2)] rounded" />
                      <div className="h-3 w-24 bg-[var(--color-surface-2)] rounded" />
                      <div className="h-6 w-12 bg-[var(--color-surface-2)] rounded ml-auto" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {cleanSlateNotice && (
          <div className="fixed bottom-6 right-6 z-50 bg-[var(--color-surface-2)] border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-lg shadow-xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
            <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{cleanSlateNotice}</span>
          </div>
        )}

        {gitNotice && (
          <div className="fixed bottom-6 left-6 z-50 bg-[var(--color-surface-2)] border border-[var(--color-accent)]/40 text-[var(--color-text-primary)] px-4 py-3 rounded-lg shadow-xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
            <Shield className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
            <span>{gitNotice}</span>
          </div>
        )}

        {confirmCleanSlate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                  <Zap className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Clean Slate — Reclaim RAM</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    Terminate <strong className="text-[var(--color-text-primary)]">{devProcesses.length}</strong> background developer processes to instantly free{' '}
                    <strong className="text-emerald-400 font-semibold">{formatSize(totalDevRam)}</strong> of memory?
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
                        <span className="text-emerald-400 ml-2">:{p.ports.join(', :')}</span>
                      )}
                    </div>
                    <span className="text-[var(--color-text-secondary)] shrink-0">{formatSize(p.memory_bytes || 0)}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmCleanSlate(false)}
                  disabled={cleanSlateLoading}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteCleanSlate}
                  disabled={cleanSlateLoading}
                  className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  {cleanSlateLoading ? 'Reclaiming...' : `Reclaim ${formatSize(totalDevRam)}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

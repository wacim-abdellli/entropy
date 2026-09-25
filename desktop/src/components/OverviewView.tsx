import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitMerge,
  HardDrive,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  SquareTerminal,
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
  onNavigateToSettings?: () => void;
}

type WorkspaceFilter = 'all' | 'running' | 'dirty' | 'cleanup';

function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
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
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

function typeName(type: string): string {
  const names: Record<string, string> = {
    node: 'Node.js',
    python: 'Python',
    rust: 'Rust',
    flutter: 'Flutter',
    dotnet: '.NET',
    java: 'Java',
    ruby: 'Ruby',
    go: 'Go',
  };
  return names[type.toLowerCase()] || type;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  overview,
  onRefresh,
  isLoading,
  onSelectWorkspace,
  onInspectFolder,
  currentWorkspace,
  onNavigateToSettings,
}) => {
  const [filter, setFilter] = useState<WorkspaceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const [confirmCleanSlate, setConfirmCleanSlate] = useState(false);
  const [cleanSlateLoading, setCleanSlateLoading] = useState(false);
  const [cleanSlateNotice, setCleanSlateNotice] = useState<string | null>(null);

  const [gitNotice, setGitNotice] = useState<string | null>(null);
  const [gitLoadingPath, setGitLoadingPath] = useState<string | null>(null);

  const workspaces = useMemo(() => overview?.workspaces || [], [overview?.workspaces]);
  const artifacts = useMemo(() => overview?.system?.artifacts || [], [overview?.system?.artifacts]);

  const dirtyList = useMemo(() => workspaces.filter((w) => w.has_uncommitted_changes), [workspaces]);
  const runningList = useMemo(() => workspaces.filter((w) => w.process_count > 0), [workspaces]);

  const workspaceArtifactSizeMap = useMemo(() => {
    const map = new Map<string, number>();
    artifacts.forEach((a) => {
      if (a.project_path) {
        const norm = a.project_path.toLowerCase().replace(/[\\/]+$/, '');
        map.set(norm, (map.get(norm) || 0) + (a.size_bytes || 0));
      }
    });
    return map;
  }, [artifacts]);

  const cleanupList = useMemo(() => {
    return workspaces.filter((w) => {
      const norm = w.path.toLowerCase().replace(/[\\/]+$/, '');
      return (workspaceArtifactSizeMap.get(norm) || 0) > 0;
    });
  }, [workspaces, workspaceArtifactSizeMap]);

  const devProcesses = useMemo(() => {
    const procs = overview?.system?.processes || [];
    return procs.filter((p) => {
      const name = (p.name || '').toLowerCase();
      const isProtected = ['antigravity', 'cursor', 'code', 'windsurf', 'entropy', 'chrome', 'msedge', 'firefox', 'brave', 'devenv', 'idea', 'pycharm', 'webstorm', 'explorer', 'taskmgr', 'svchost'].some((term) => name.includes(term));
      if (isProtected) return false;
      return (
        ['node', 'python', 'bun', 'deno', 'cargo', 'rustc', 'go', 'java', 'dotnet', 'ruby', 'tsc', 'vite', 'webpack', 'esbuild'].some((term) => name.includes(term)) ||
        (p.ports && p.ports.length > 0)
      );
    });
  }, [overview?.system?.processes]);

  const totalDevRam = useMemo(() => {
    return devProcesses.reduce((acc, p) => acc + (p.memory_bytes || 0), 0);
  }, [devProcesses]);

  // Filter and sort
  const filteredWorkspaces = useMemo(() => {
    let list = workspaces;

    if (filter === 'running') {
      list = runningList;
    } else if (filter === 'dirty') {
      list = dirtyList;
    } else if (filter === 'cleanup') {
      list = cleanupList;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.path.toLowerCase().includes(q) ||
          (w.git_branch && w.git_branch.toLowerCase().includes(q)) ||
          w.project_type.toLowerCase().includes(q)
      );
    }

    return [...list].sort(
      (a, b) =>
        Number(b.process_count > 0) - Number(a.process_count > 0) ||
        Number(b.has_uncommitted_changes) - Number(a.has_uncommitted_changes) ||
        (b.last_modified || 0) - (a.last_modified || 0)
    );
  }, [workspaces, filter, runningList, dirtyList, cleanupList, searchQuery]);

  const handleCopyPath = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  const handleQuickIgnoreEnv = async (e: React.MouseEvent, workspacePath: string) => {
    e.stopPropagation();
    setGitLoadingPath(workspacePath);
    try {
      const res = await EntropyApiClient.addToGitignore(workspacePath, '.env*');
      if (res.success) {
        setGitNotice(`Protected: Added .env* to .gitignore`);
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

  const handleQuickStash = async (e: React.MouseEvent, workspacePath: string) => {
    e.stopPropagation();
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

  const handleExecuteCleanSlate = async () => {
    setCleanSlateLoading(true);
    try {
      const res = await EntropyApiClient.cleanSlateDevProcesses(devProcesses.map((p) => p.pid));
      if (res.success) {
        setCleanSlateNotice(
          `Clean Slate complete: Terminated ${res.terminated_count} dev processes and freed ${formatSize(res.freed_memory_bytes)} RAM.`
        );
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
    <div className="flex-1 h-full overflow-y-auto overflow-x-hidden w-full max-w-full bg-[var(--color-surface-0)] text-[var(--color-text-primary)]">
      {/* ── Minimal Linear-style Toolbar ── */}
      <header className="sticky top-0 z-20 px-6 sm:px-8 py-3.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-0)]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Title & Filter Tabs */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight text-[var(--color-text-primary)]">
                Workspaces
              </h1>
              {isLoading && workspaces.length === 0 ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-[var(--color-accent-strong)] px-2 py-0.5 rounded-full bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/30">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  <span>Scanning…</span>
                </span>
              ) : (
                <span className="text-[11px] font-mono text-[var(--color-text-tertiary)] px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
                  {workspaces.length}
                </span>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 p-0.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filter === 'all'
                    ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] font-medium shadow-xs'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter('running')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  filter === 'running'
                    ? 'bg-[var(--color-surface-3)] text-[var(--color-success)] font-medium shadow-xs'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                <span>Running ({runningList.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilter('dirty')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  filter === 'dirty'
                    ? 'bg-[var(--color-surface-3)] text-[var(--color-warning)] font-medium shadow-xs'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)]" />
                <span>Unsaved ({dirtyList.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilter('cleanup')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  filter === 'cleanup'
                    ? 'bg-[var(--color-surface-3)] text-[var(--color-accent-strong)] font-medium shadow-xs'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                <HardDrive className="w-3 h-3 text-[var(--color-accent)]" />
                <span>Cleanable ({cleanupList.length})</span>
              </button>
            </div>
          </div>

          {/* Right: Search & Actions */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-44 sm:w-52 h-7.5 pl-8 pr-2.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] focus:border-[var(--color-accent)] rounded-lg text-xs placeholder-[var(--color-text-tertiary)] focus:outline-none transition-colors"
              />
            </div>

            {totalDevRam > 0 && (
              <button
                type="button"
                onClick={() => setConfirmCleanSlate(true)}
                className="h-7.5 px-2.5 rounded-lg bg-[var(--color-success-bg)] hover:bg-[var(--color-success)]/20 border border-[var(--color-success-border)] text-xs text-[var(--color-success)] flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                title="Reclaim RAM by terminating background dev processes"
              >
                <Zap className="w-3 h-3" />
                <span>Free {formatSize(totalDevRam)}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onInspectFolder}
              className="h-7.5 px-3 rounded-lg bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium flex items-center gap-1.5 transition-opacity cursor-pointer shadow-xs"
              title="Add or inspect a workspace folder"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Add Folder</span>
            </button>

            {onNavigateToSettings && (
              <button
                type="button"
                onClick={onNavigateToSettings}
                className="h-7.5 px-2 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer"
                title="Manage scanned folders"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-7.5 w-7.5 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh workspaces"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Workspaces List (Takes Full Prime Screen Space) ── */}
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-5">
        <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl overflow-hidden divide-y divide-[var(--color-border-subtle)] shadow-xs">
          {/* Subtle real-time scan progress bar when refreshing existing workspaces */}
          {isLoading && workspaces.length > 0 && (
            <div className="h-0.5 w-full bg-[var(--color-accent)]/20 overflow-hidden">
              <div className="h-full bg-[var(--color-accent)] animate-pulse w-full" />
            </div>
          )}

          {isLoading && workspaces.length === 0 ? (
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {/* Scanning status banner */}
              <div className="p-4 bg-[var(--color-surface-2)]/50 border-b border-[var(--color-border-subtle)] flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <RefreshCw className="w-4 h-4 text-[var(--color-accent)] animate-spin shrink-0" />
                  <div>
                    <span className="font-semibold text-[var(--color-text-primary)]">
                      Scanning developer directories across your PC…
                    </span>
                    <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono mt-0.5">
                      Discovering Git repositories, dev servers, and build artifacts
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-[var(--color-text-tertiary)] hidden sm:inline">
                  Please wait…
                </span>
              </div>

              {/* Shimmering Skeleton rows */}
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 animate-pulse"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-[var(--color-surface-3)] shrink-0" />
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-4 bg-[var(--color-surface-3)] rounded"
                          style={{ width: `${85 + (i * 27) % 65}px` }}
                        />
                        <div className="h-3.5 w-14 bg-[var(--color-surface-3)]/60 rounded" />
                      </div>
                      <div
                        className="h-3 bg-[var(--color-surface-3)]/40 rounded"
                        style={{ width: `${150 + (i * 45) % 130}px` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="h-4 w-16 bg-[var(--color-surface-3)]/60 rounded" />
                    <div className="h-4 w-14 bg-[var(--color-surface-3)]/40 rounded" />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-6 h-6 bg-[var(--color-surface-3)]/50 rounded-md" />
                    <div className="w-6 h-6 bg-[var(--color-surface-3)]/50 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            filteredWorkspaces.map((workspace) => {
            const isDirty = workspace.has_uncommitted_changes;
            const isRunning = workspace.process_count > 0;
            const reclaimableSize = workspaceArtifactSizeMap.get(
              workspace.path.toLowerCase().replace(/[\\/]+$/, '')
            ) || 0;
            const isCurrent = currentWorkspace?.path
              ? workspace.path.toLowerCase().replace(/[\\/]+$/, '') ===
                currentWorkspace.path.toLowerCase().replace(/[\\/]+$/, '')
              : false;

            return (
              <div
                key={workspace.id}
                onClick={() => onSelectWorkspace(workspace.path)}
                className={`group flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer ${
                  isCurrent ? 'bg-[var(--color-surface-2)]/50 border-l-2 border-l-[var(--color-accent)]' : ''
                }`}
              >
                {/* Left: Identity */}
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  {/* Status Indicator Dot */}
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      isRunning
                        ? 'bg-[var(--color-success)] shadow-[0_0_6px_rgba(52,211,153,.7)] animate-pulse'
                        : isDirty
                        ? 'bg-[var(--color-warning)]'
                        : 'bg-[var(--color-border-strong)]'
                    }`}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors truncate">
                        {workspace.name}
                      </span>

                      {isCurrent && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent-strong)] border border-[var(--color-accent)]/30">
                          Active
                        </span>
                      )}

                      <span className="text-[11px] text-[var(--color-text-tertiary)] font-mono">
                        {typeName(workspace.project_type)}
                      </span>

                      {/* Ports */}
                      {workspace.ports && workspace.ports.length > 0 && (
                        <div className="flex items-center gap-1">
                          {workspace.ports.map((port) => (
                            <span
                              key={port}
                              onClick={(e) => {
                                e.stopPropagation();
                                EntropyApiClient.openUrl(`http://localhost:${port}`);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.2 text-[10px] font-mono text-[var(--color-success)] bg-[var(--color-success-bg)] border border-[var(--color-success-border)] rounded hover:underline cursor-pointer"
                              title={`Open http://localhost:${port}`}
                            >
                              :{port}
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Path */}
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)] font-mono mt-0.5">
                      <span className="truncate max-w-md" title={workspace.path}>
                        {workspace.path}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyPath(e, workspace.path)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-opacity"
                        title="Copy path"
                      >
                        {copiedPath === workspace.path ? (
                          <CheckCircle2 className="w-3 h-3 text-[var(--color-success)]" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Center: Git & Changes */}
                <div className="flex items-center gap-3 shrink-0 text-xs">
                  {/* Branch */}
                  <span className="inline-flex items-center gap-1 font-mono text-[var(--color-text-secondary)]">
                    <GitBranch className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
                    <span>{workspace.git_branch || 'HEAD'}</span>
                  </span>

                  {/* Changes state */}
                  {isDirty ? (
                    <span className="inline-flex items-center gap-1 text-[var(--color-warning)] font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      <span>
                        {workspace.dirty_count || 1} unsaved
                        {workspace.oldest_dirty_timestamp && (
                          <span className="text-[10px] text-[var(--color-text-tertiary)] font-normal ml-1">
                            ({formatWipAge(workspace.oldest_dirty_timestamp)})
                          </span>
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-tertiary)]">
                      clean
                    </span>
                  )}

                  {/* Secret Leak Tag */}
                  {workspace.unprotected_env_files && workspace.unprotected_env_files.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => handleQuickIgnoreEnv(e, workspace.path)}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded hover:bg-[var(--color-danger)]/20 transition-colors"
                      title="Click to add .env* to .gitignore"
                    >
                      <ShieldAlert className="w-2.5 h-2.5" />
                      <span>.env</span>
                    </button>
                  )}

                  {/* Merged Branch Tag */}
                  {workspace.merged_branches && workspace.merged_branches.length > 0 && (
                    <span
                      title={`${workspace.merged_branches.length} merged branch`}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-[var(--color-accent-strong)] bg-[var(--color-surface-3)] border border-[var(--color-border-subtle)] rounded font-mono"
                    >
                      <GitMerge className="w-2.5 h-2.5" />
                      <span>{workspace.merged_branches.length}</span>
                    </span>
                  )}

                  {/* Reclaimable Junk */}
                  {reclaimableSize > 0 && (
                    <span
                      className="font-mono text-[11px] text-[var(--color-accent-strong)]"
                      title="Reclaimable build dependencies"
                    >
                      {formatSize(reclaimableSize)}
                    </span>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      EntropyApiClient.launchIde(workspace.path, 'code');
                    }}
                    className="p-1.5 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                    title="Open in VS Code"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      EntropyApiClient.openInCmd(workspace.path);
                    }}
                    className="p-1.5 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-warning)] transition-colors cursor-pointer"
                    title="Open in Command Prompt (CMD)"
                  >
                    <SquareTerminal className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      EntropyApiClient.openInExplorer(workspace.path);
                    }}
                    className="p-1.5 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                    title="Open in File Explorer"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </button>

                  {isDirty && (
                    <button
                      type="button"
                      onClick={(e) => handleQuickStash(e, workspace.path)}
                      disabled={gitLoadingPath === workspace.path}
                      className="px-2 py-1 rounded-md text-[11px] font-medium text-[var(--color-warning)] hover:bg-[var(--color-warning-bg)] transition-colors cursor-pointer disabled:opacity-50"
                      title="Safely stash working tree"
                    >
                      {gitLoadingPath === workspace.path ? '…' : 'Stash'}
                    </button>
                  )}

                  <ArrowRight className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all ml-1" />
                </div>
              </div>
            );
          })
        )}

          {!isLoading && filteredWorkspaces.length === 0 && (
            <div className="p-12 text-center space-y-3">
              <FolderGit2 className="w-9 h-9 text-[var(--color-text-tertiary)] mx-auto opacity-40" />
              {workspaces.length === 0 ? (
                <div className="space-y-3 max-w-sm mx-auto">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    No workspaces detected
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    No repositories or projects were found in your configured scan directories. Add a project folder or configure additional scan roots.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onInspectFolder}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Folder
                    </button>
                    {onNavigateToSettings && (
                      <button
                        type="button"
                        onClick={onNavigateToSettings}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] transition-colors cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        Configure Roots
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {searchQuery
                      ? `No workspaces found matching "${searchQuery}".`
                      : 'No workspaces found matching the selected filter.'}
                  </p>
                  {(searchQuery || filter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setFilter('all');
                      }}
                      className="text-xs text-[var(--color-accent)] hover:underline cursor-pointer"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Toast Notifications ── */}
      {cleanSlateNotice && (
        <div className="fixed bottom-5 right-5 z-50 bg-[var(--color-surface-2)] border border-[var(--color-success-border)] text-[var(--color-success)] px-3.5 py-2.5 rounded-lg shadow-xl text-xs flex items-center gap-2 animate-in fade-in">
          <Zap className="w-3.5 h-3.5 text-[var(--color-success)] shrink-0" />
          <span>{cleanSlateNotice}</span>
        </div>
      )}

      {gitNotice && (
        <div className="fixed bottom-5 left-5 z-50 bg-[var(--color-surface-2)] border border-[var(--color-accent)]/40 text-[var(--color-text-primary)] px-3.5 py-2.5 rounded-lg shadow-xl text-xs flex items-center gap-2 animate-in fade-in">
          <Shield className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0" />
          <span>{gitNotice}</span>
        </div>
      )}

      {/* ── Clean Slate Confirmation Modal ── */}
      {confirmCleanSlate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--color-success-bg)] border border-[var(--color-success-border)] flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-[var(--color-success)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Free RAM from Dev Processes?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                  Safely terminates <strong>{devProcesses.length} background dev servers</strong> and frees{' '}
                  <strong className="text-[var(--color-success)] font-mono">{formatSize(totalDevRam)} RAM</strong>.
                </p>
                <div className="mt-2.5 p-2 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-xs space-y-1 max-h-32 overflow-y-auto font-mono text-[var(--color-text-secondary)]">
                  {devProcesses.map((p) => (
                    <div key={p.pid} className="flex justify-between items-center text-[10px]">
                      <span className="truncate">{p.name} (PID {p.pid})</span>
                      <span className="shrink-0 ml-2">{formatSize(p.memory_bytes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmCleanSlate(false)}
                disabled={cleanSlateLoading}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteCleanSlate}
                disabled={cleanSlateLoading}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-success)] hover:opacity-90 text-black transition-opacity cursor-pointer shadow-xs disabled:opacity-50"
              >
                {cleanSlateLoading ? 'Freeing…' : 'Free RAM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

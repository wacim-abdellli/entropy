import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
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
  X,
} from 'lucide-react';
import { EnvironmentOverview, WorkspaceSummary } from '../types/entropy';
import { EntropyApiClient } from '../services/api';
import { SecretsRadarModal } from './SecretsRadarModal';

interface OverviewViewProps {
  overview?: EnvironmentOverview | null;
  onRefresh: () => void;
  isLoading: boolean;
  onSelectWorkspace: (path: string) => void;
  onInspectFolder: () => void;
  currentWorkspace?: WorkspaceSummary | null;
  onNavigateToSettings?: () => void;
  onClearCurrentWorkspace?: () => void;
}

type WorkspaceFilter = 'all' | 'running' | 'dirty' | 'unpushed' | 'cleanup' | 'secrets';

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
  onClearCurrentWorkspace,
}) => {
  const [filter, setFilter] = useState<WorkspaceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [secretsRadarOpen, setSecretsRadarOpen] = useState(false);

  const [confirmCleanSlate, setConfirmCleanSlate] = useState(false);
  const [cleanSlateLoading, setCleanSlateLoading] = useState(false);
  const [cleanSlateNotice, setCleanSlateNotice] = useState<string | null>(null);

  const [gitNotice, setGitNotice] = useState<string | null>(null);
  const [gitLoadingPath, setGitLoadingPath] = useState<string | null>(null);

  const workspaces = useMemo(() => overview?.workspaces || [], [overview?.workspaces]);
  const artifacts = useMemo(() => overview?.system?.artifacts || [], [overview?.system?.artifacts]);

  const dirtyList = useMemo(() => workspaces.filter((w) => w.has_uncommitted_changes), [workspaces]);
  const unpushedList = useMemo(() => workspaces.filter((w) => (w.commits_ahead || 0) > 0), [workspaces]);
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

  const secretsList = useMemo(() => {
    return workspaces.filter((w) => {
      const hasTracked = w.secret_issues?.some((s) => s.status === 'tracked');
      const hasUnignored =
        w.secret_issues?.some((s) => s.status === 'unignored') ||
        (w.unprotected_env_files && w.unprotected_env_files.length > 0);
      return hasTracked || hasUnignored;
    });
  }, [workspaces]);

  const devProcesses = useMemo(() => {
    const procs = overview?.system?.processes || [];
    return procs.filter((p) => {
      const name = (p.name || '').toLowerCase();
      const exe = (p.exe_path || '').toLowerCase();
      const isProtected = ['antigravity', 'language_server', 'cursor', 'code', 'windsurf', 'entropy', 'chrome', 'msedge', 'firefox', 'brave', 'devenv', 'idea', 'pycharm', 'webstorm', 'explorer', 'taskmgr', 'svchost', 'spoolsv', 'glidex', 'onedrive', 'steam', 'discord', 'spotify'].some((term) => name.includes(term) || exe.includes(term)) || name.endsWith('service.exe');
      if (isProtected) return false;
      return (
        ['node', 'python', 'bun', 'deno', 'cargo', 'rustc', 'go', 'java', 'dotnet', 'ruby', 'tsc', 'vite', 'webpack', 'esbuild'].some((term) => name.includes(term)) ||
        p.is_shell ||
        Boolean(p.cwd) ||
        (p.ports && p.ports.some((pt) => pt < 49152))
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
    } else if (filter === 'unpushed') {
      list = unpushedList;
    } else if (filter === 'cleanup') {
      list = cleanupList;
    } else if (filter === 'secrets') {
      list = secretsList;
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
  }, [workspaces, filter, runningList, dirtyList, cleanupList, unpushedList, secretsList, searchQuery]);

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

  const handleQuickPush = async (e: React.MouseEvent, workspacePath: string) => {
    e.stopPropagation();
    setGitLoadingPath(workspacePath);
    try {
      const res = await EntropyApiClient.pushBranch(workspacePath);
      if (res.success) {
        setGitNotice(res.message || 'Pushed current branch to remote.');
      } else {
        setGitNotice(res.error || 'Failed to push to remote.');
      }
      onRefresh();
    } catch {
      setGitNotice('Failed to push to remote.');
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
      <header className="sticky top-0 z-20 px-4 sm:px-8 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-0)]/95 backdrop-blur-md">
        <div className="w-full flex flex-wrap items-center justify-between gap-3">
          {/* Left: Title & Filter Tabs */}
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <div className="flex items-center gap-2 shrink-0">
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
              {currentWorkspace && onClearCurrentWorkspace && (
                <div className="hidden sm:inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 text-xs animate-in fade-in duration-150">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
                  <span className="text-[11px] font-medium text-[var(--color-accent-strong)] truncate max-w-[130px]">
                    {currentWorkspace.name}
                  </span>
                  <button
                    type="button"
                    onClick={onClearCurrentWorkspace}
                    className="p-0.5 rounded-full hover:bg-[var(--color-accent)]/20 text-[var(--color-accent-strong)] hover:text-white transition-colors cursor-pointer"
                    title="Clear active project filter (view all workspaces)"
                    aria-label="Clear active project filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 p-0.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-lg text-xs overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
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
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  filter === 'running'
                    ? 'bg-[var(--color-surface-3)] text-[var(--color-success)] font-medium shadow-xs'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] shrink-0" />
                <span>Running ({runningList.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilter('dirty')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  filter === 'dirty'
                    ? 'bg-[var(--color-surface-3)] text-[var(--color-warning)] font-medium shadow-xs'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] shrink-0" />
                <span>Unsaved ({dirtyList.length})</span>
              </button>
              {unpushedList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter('unpushed')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                    filter === 'unpushed'
                      ? 'bg-[var(--color-surface-3)] text-[var(--color-warning)] font-medium shadow-xs'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                  }`}
                >
                  <ArrowUp className="w-3 h-3 text-[var(--color-warning)] shrink-0" />
                  <span>Unpushed ({unpushedList.length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setFilter('cleanup')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  filter === 'cleanup'
                    ? 'bg-[var(--color-surface-3)] text-[var(--color-accent-strong)] font-medium shadow-xs'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                <HardDrive className="w-3 h-3 text-[var(--color-accent)] shrink-0" />
                <span>Cleanable ({cleanupList.length})</span>
              </button>
              {secretsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter('secrets')}
                  className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                    filter === 'secrets'
                      ? 'bg-[var(--color-surface-3)] text-[var(--color-danger)] font-medium shadow-xs'
                      : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                  }`}
                >
                  <ShieldAlert className="w-3 h-3 text-[var(--color-danger)] shrink-0" />
                  <span>Secrets ({secretsList.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* Right: Search & Actions */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <div className="relative shrink min-w-[120px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                aria-label="Search workspaces"
                className="w-32 sm:w-44 md:w-48 h-8 pl-8 pr-2.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] focus:border-[var(--color-accent)] rounded-lg text-xs placeholder-[var(--color-text-tertiary)] focus:outline-none transition-colors"
              />
            </div>

            {totalDevRam > 0 && (
              <button
                type="button"
                onClick={() => setConfirmCleanSlate(true)}
                className="h-8 px-3 rounded-lg bg-[var(--color-success-bg)] hover:bg-[var(--color-success)]/20 border border-[var(--color-success-border)] text-xs text-[var(--color-success)] flex items-center gap-1.5 font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap shadow-2xs select-none"
                title="Reclaim RAM by terminating background dev processes"
              >
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">Free {formatSize(totalDevRam)}</span>
              </button>
            )}

            {secretsList.length > 0 && (
              <button
                type="button"
                onClick={() => setSecretsRadarOpen(true)}
                className="h-8 px-3 rounded-lg bg-[var(--color-warning-bg)] hover:bg-[var(--color-warning-bg)]/80 border border-[var(--color-warning-border)] text-xs text-[var(--color-warning)] flex items-center gap-1.5 font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap shadow-2xs"
                title="Audit and shield exposed credentials & .env files across all repos"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-[var(--color-warning)] shrink-0" />
                <span className="whitespace-nowrap">Shield Secrets ({secretsList.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onInspectFolder}
              className="h-8 px-3.5 rounded-lg bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium flex items-center gap-1.5 transition-opacity cursor-pointer shadow-xs shrink-0 whitespace-nowrap select-none"
              title="Add or inspect a workspace folder"
            >
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Add Folder</span>
            </button>

            {onNavigateToSettings && (
              <button
                type="button"
                onClick={onNavigateToSettings}
                className="h-8 w-8 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] flex items-center justify-center transition-colors cursor-pointer shrink-0 border border-transparent hover:border-[var(--color-border-subtle)]"
                title="Manage scanned folders"
                aria-label="Manage scanned folders"
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
              </button>
            )}

            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-8 w-8 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 shrink-0 border border-transparent hover:border-[var(--color-border-subtle)]"
              title="Refresh workspaces"
              aria-label="Refresh workspaces"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Workspaces List (Takes Full Prime Screen Space) ── */}
      <div className="w-full px-4 sm:px-8 py-5">
        <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl overflow-hidden divide-y divide-[var(--color-border-subtle)] shadow-xs w-full">
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
                      <span className="truncate max-w-sm sm:max-w-md lg:max-w-xl xl:max-w-3xl 2xl:max-w-5xl" title={workspace.path}>
                        {workspace.path}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyPath(e, workspace.path)}
                        className="opacity-0 group-hover:opacity-100 h-6 w-6 inline-flex items-center justify-center rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-all cursor-pointer"
                        title="Copy path"
                        aria-label="Copy workspace path"
                      >
                        {copiedPath === workspace.path ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
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

                  {/* Unpushed / Behind Remote badges */}
                  {(workspace.commits_ahead || 0) > 0 && (
                    <span
                      title={`${workspace.commits_ahead} unpushed commit(s) on '${workspace.git_branch || 'HEAD'}' — local only, not backed up on remote`}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-warning)] bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] rounded shadow-2xs font-mono"
                    >
                      <ArrowUp className="w-2.5 h-2.5" />
                      <span>{workspace.commits_ahead} unpushed</span>
                    </span>
                  )}
                  {(workspace.commits_behind || 0) > 0 && (
                    <span
                      title={`${workspace.commits_behind} commit(s) behind remote`}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-[var(--color-accent-strong)] bg-[var(--color-surface-3)] border border-[var(--color-border-subtle)] rounded font-mono"
                    >
                      <ArrowDown className="w-2.5 h-2.5" />
                      <span>{workspace.commits_behind} behind</span>
                    </span>
                  )}

                  {/* Secret Leak Tag */}
                  {(() => {
                    const tracked = workspace.secret_issues?.filter((s) => s.status === 'tracked') || [];
                    const unignored =
                      workspace.secret_issues?.filter((s) => s.status === 'unignored') ||
                      (workspace.unprotected_env_files?.map((p) => ({ path: p })) || []);
                    const protectedSec = workspace.secret_issues?.filter((s) => s.status === 'protected') || [];

                    if (tracked.length > 0) {
                      return (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded shadow-xs"
                          title={`${tracked.length} secret file(s) tracked in Git history! Click workspace to untrack safely.`}
                        >
                          <ShieldAlert className="w-2.5 h-2.5" />
                          <span>{tracked.length} in Git</span>
                        </span>
                      );
                    }
                    if (unignored.length > 0) {
                      return (
                        <button
                          type="button"
                          onClick={(e) => handleQuickIgnoreEnv(e, workspace.path)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)] rounded hover:bg-[var(--color-warning)]/20 transition-colors cursor-pointer"
                          title="Click to protect with .gitignore"
                        >
                          <ShieldAlert className="w-2.5 h-2.5" />
                          <span>{unignored.length} exposed</span>
                        </button>
                      );
                    }
                    if (protectedSec.length > 0) {
                      return (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-[var(--color-success)] bg-[var(--color-success-bg)]/50 border border-[var(--color-success-border)]/50 rounded"
                          title={`${protectedSec.length} secret(s) protected by .gitignore`}
                        >
                          <Check className="w-2.5 h-2.5" />
                          <span>shielded</span>
                        </span>
                      );
                    }
                    return null;
                  })()}

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
                    aria-label="Open in VS Code"
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
                    aria-label="Open in Command Prompt"
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
                    aria-label="Open in File Explorer"
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

                  {(workspace.commits_ahead || 0) > 0 && (
                    <button
                      type="button"
                      onClick={(e) => handleQuickPush(e, workspace.path)}
                      disabled={gitLoadingPath === workspace.path}
                      className="px-2 py-1 rounded-md text-[11px] font-medium text-[var(--color-warning)] hover:bg-[var(--color-warning-bg)] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 font-mono"
                      title="Safely push commits to remote tracking branch"
                    >
                      <ArrowUp className="w-3 h-3" />
                      <span>{gitLoadingPath === workspace.path ? '…' : 'Push'}</span>
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

      {/* ── Floating Toasts ── */}
      {cleanSlateNotice && (
        <div className="fixed top-16 right-6 z-50 flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-lg shadow-2xl text-xs font-medium max-w-sm border backdrop-blur-sm bg-[var(--color-surface-2)] border-[var(--color-success)]/30 text-[var(--color-success)] animate-in fade-in slide-in-from-top-2">
          <Zap className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{cleanSlateNotice}</span>
        </div>
      )}

      {gitNotice && (
        <div className={`fixed ${cleanSlateNotice ? 'top-[4.5rem]' : 'top-16'} right-6 z-50 flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-lg shadow-2xl text-xs font-medium max-w-sm border backdrop-blur-sm bg-[var(--color-surface-2)] border-[var(--color-accent)]/30 text-[var(--color-text-primary)] animate-in fade-in slide-in-from-top-2`}>
          <Shield className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0" />
          <span className="truncate">{gitNotice}</span>
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

      <SecretsRadarModal
        isOpen={secretsRadarOpen}
        onClose={() => setSecretsRadarOpen(false)}
        onRefreshed={onRefresh}
      />
    </div>
  );
};

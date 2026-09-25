import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitMerge,
  Globe,
  HardDrive,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
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
  if (days === 1) return '1 day old';
  return `${days} days old`;
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
  const reclaimable = useMemo(
    () => artifacts.reduce((sum, artifact) => sum + (artifact.size_bytes || 0), 0),
    [artifacts]
  );

  const dirtyList = useMemo(() => workspaces.filter((w) => w.has_uncommitted_changes), [workspaces]);
  const runningList = useMemo(() => workspaces.filter((w) => w.process_count > 0), [workspaces]);

  // Map workspace path to reclaimable artifacts size
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

  const devServers = useMemo(() => {
    const list: { workspace: WorkspaceSummary; port: number }[] = [];
    workspaces.forEach((w) => {
      (w.ports || []).forEach((port) => {
        list.push({ workspace: w, port });
      });
    });
    return list;
  }, [workspaces]);

  const secretLeakWorkspaces = useMemo(() => {
    return workspaces.filter((w) => w.unprotected_env_files && w.unprotected_env_files.length > 0);
  }, [workspaces]);

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

  // Filtering & Sorting
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
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-20 px-6 sm:px-8 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-0)]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Workspaces</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-mono font-medium text-[var(--color-text-secondary)]">
                {workspaces.length} detected
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Real-time monitoring across your configured PC directories.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by name, branch, path..."
                className="w-56 sm:w-64 h-8 pl-8 pr-3 bg-[var(--color-surface-1)] border border-[var(--color-border)] focus:border-[var(--color-accent)] rounded-lg text-xs placeholder-[var(--color-text-tertiary)] focus:outline-none transition-colors"
              />
            </div>

            <button
              type="button"
              onClick={onInspectFolder}
              className="h-8 px-3 rounded-lg bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium flex items-center gap-1.5 transition-opacity cursor-pointer shadow-sm"
              title="Add or inspect a workspace folder from disk"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Add Folder…</span>
            </button>

            {onNavigateToSettings && (
              <button
                type="button"
                onClick={onNavigateToSettings}
                className="h-8 px-2.5 rounded-lg bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Configure monitored directories across PC"
              >
                <Settings className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
                <span className="hidden sm:inline">Scan Roots</span>
              </button>
            )}

            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh all workspaces"
              className="w-8 h-8 rounded-lg bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Dashboard Container ── */}
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-6 space-y-6">

        {/* ── Overview Metrics Strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Running Dev Servers Card */}
          <div
            onClick={() => setFilter(filter === 'running' ? 'all' : 'running')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              filter === 'running'
                ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)] shadow-xs'
                : 'bg-[var(--color-surface-1)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Dev Processes
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  runningList.length > 0
                    ? 'bg-[var(--color-success)] shadow-[0_0_8px_rgba(52,211,153,.7)] animate-pulse'
                    : 'bg-[var(--color-text-tertiary)]'
                }`}
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-[var(--color-text-primary)]">
                {runningList.length}
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">active workspace{runningList.length === 1 ? '' : 's'}</span>
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)] truncate">
              {totalDevRam > 0 ? `${formatSize(totalDevRam)} RAM in ${devProcesses.length} servers` : 'No background processes'}
            </div>
          </div>

          {/* Uncommitted Changes Card */}
          <div
            onClick={() => setFilter(filter === 'dirty' ? 'all' : 'dirty')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              filter === 'dirty'
                ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)] shadow-xs'
                : 'bg-[var(--color-surface-1)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Unsaved Work
              </span>
              <AlertTriangle
                className={`w-3.5 h-3.5 ${
                  dirtyList.length > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-tertiary)]'
                }`}
              />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-bold font-mono ${dirtyList.length > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]'}`}>
                {dirtyList.length}
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">need review / stash</span>
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)] truncate">
              {dirtyList.length > 0 ? 'Uncommitted code sitting in working tree' : 'All Git repositories clean'}
            </div>
          </div>

          {/* Reclaimable Dependencies Card */}
          <div
            onClick={() => setFilter(filter === 'cleanup' ? 'all' : 'cleanup')}
            className={`p-4 rounded-xl border transition-all cursor-pointer ${
              filter === 'cleanup'
                ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)] shadow-xs'
                : 'bg-[var(--color-surface-1)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Reclaimable Space
              </span>
              <HardDrive className="w-3.5 h-3.5 text-[var(--color-accent-strong)]" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-[var(--color-accent-strong)]">
                {formatSize(reclaimable)}
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">safe junk</span>
            </div>
            <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)] truncate">
              {cleanupList.length} project{cleanupList.length === 1 ? '' : 's'} with disposable build folders
            </div>
          </div>

          {/* Clean Slate RAM Reclaimer Card */}
          <div className="p-4 rounded-xl border bg-[var(--color-surface-1)] border-[var(--color-border)] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                RAM Recovery
              </span>
              <Zap className="w-3.5 h-3.5 text-[var(--color-success)]" />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <div className="text-base font-bold font-mono text-[var(--color-success)]">
                  {totalDevRam > 0 ? formatSize(totalDevRam) : '0 B'}
                </div>
                <div className="text-[11px] text-[var(--color-text-tertiary)]">
                  {devProcesses.length} orphaned dev server{devProcesses.length === 1 ? '' : 's'}
                </div>
              </div>
              {totalDevRam > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmCleanSlate(true)}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] hover:bg-[var(--color-success)]/20 transition-colors cursor-pointer"
                  title="Terminate background dev servers to reclaim RAM"
                >
                  Clean Slate
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Active Dev Servers Bar ── */}
        {devServers.length > 0 && (
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-success-border)] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-success)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-success)] animate-pulse" />
              <span>{devServers.length} Active Localhost Port{devServers.length > 1 ? 's' : ''}:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {devServers.map(({ workspace, port }) => (
                <div
                  key={`${workspace.id}-${port}`}
                  className="flex items-center gap-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] px-3 py-1 rounded-lg text-xs"
                >
                  <span className="font-semibold text-[var(--color-text-primary)]">{workspace.name}</span>
                  <button
                    type="button"
                    onClick={() => EntropyApiClient.openUrl(`http://localhost:${port}`)}
                    title={`Open http://localhost:${port} in web browser`}
                    className="inline-flex items-center gap-1 font-mono font-medium text-[var(--color-success)] hover:underline cursor-pointer"
                  >
                    <Globe className="w-3 h-3" />
                    <span>:{port}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                  </button>
                  <span className="text-[var(--color-border-subtle)]">|</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await EntropyApiClient.freePort(port);
                      onRefresh();
                    }}
                    title={`Free port ${port} by terminating background process`}
                    className="text-[var(--color-warning)] hover:underline cursor-pointer font-medium"
                  >
                    Free
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Secret Leak Watchdog Banner ── */}
        {secretLeakWorkspaces.length > 0 && (
          <div className="bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[var(--color-danger)]" />
                <h3 className="text-xs font-semibold text-[var(--color-danger)]">
                  Secret Leak Watchdog: {secretLeakWorkspaces.length} workspace{secretLeakWorkspaces.length > 1 ? 's' : ''} have unprotected .env secrets
                </h3>
              </div>
              <span className="text-[11px] text-[var(--color-danger)]/80">Prevent secret leaks to Git</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {secretLeakWorkspaces.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-xs"
                >
                  <div className="min-w-0 mr-2">
                    <span className="font-semibold text-[var(--color-text-primary)] block truncate">{w.name}</span>
                    <span className="font-mono text-[11px] text-[var(--color-danger)] truncate block">
                      {w.unprotected_env_files?.join(', ')}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickIgnoreEnv(w.path)}
                    disabled={gitLoadingPath === w.path}
                    className="shrink-0 px-2.5 py-1 text-xs font-medium bg-[var(--color-danger)] hover:opacity-90 text-white rounded-md transition-opacity cursor-pointer disabled:opacity-50"
                  >
                    {gitLoadingPath === w.path ? 'Adding...' : 'Add to .gitignore'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Interactive Filter Tabs ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-1.5 p-1 bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                filter === 'all'
                  ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              All ({workspaces.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('running')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                filter === 'running'
                  ? 'bg-[var(--color-surface-3)] text-[var(--color-success)] shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
              <span>Running ({runningList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('dirty')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                filter === 'dirty'
                  ? 'bg-[var(--color-surface-3)] text-[var(--color-warning)] shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)]" />
              <span>Unsaved ({dirtyList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('cleanup')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                filter === 'cleanup'
                  ? 'bg-[var(--color-surface-3)] text-[var(--color-accent-strong)] shadow-xs'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              <HardDrive className="w-3 h-3 text-[var(--color-accent)]" />
              <span>Cleanable ({cleanupList.length})</span>
            </button>
          </div>

          <div className="text-xs text-[var(--color-text-tertiary)]">
            Showing {filteredWorkspaces.length} of {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* ── Workspaces List ── */}
        <div className="space-y-2.5">
          {filteredWorkspaces.map((workspace) => {
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
                className={`group p-4 rounded-xl border transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-[var(--color-surface-1)] border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/30'
                    : 'bg-[var(--color-surface-1)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-border-subtle)]'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left: Project identity */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isRunning
                            ? 'bg-[var(--color-success)] shadow-[0_0_8px_rgba(52,211,153,.7)] animate-pulse'
                            : isDirty
                            ? 'bg-[var(--color-warning)]'
                            : 'bg-[var(--color-text-tertiary)]'
                        }`}
                      />
                      <h3 className="font-semibold text-base text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors truncate">
                        {workspace.name}
                      </h3>

                      {isCurrent && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent-strong)] border border-[var(--color-accent)]/30">
                          Active Project
                        </span>
                      )}

                      <span className="text-[11px] font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] px-2 py-0.5 rounded border border-[var(--color-border)]">
                        {typeName(workspace.project_type)}
                      </span>

                      {workspace.ports && workspace.ports.length > 0 && (
                        <div className="flex items-center gap-1">
                          {workspace.ports.map((port) => (
                            <span
                              key={port}
                              onClick={(e) => {
                                e.stopPropagation();
                                EntropyApiClient.openUrl(`http://localhost:${port}`);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-medium bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] hover:bg-[var(--color-success)]/20 rounded cursor-pointer transition-colors"
                              title={`Open localhost:${port} in browser`}
                            >
                              :{port}
                              <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Path & copy */}
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] font-mono">
                      <span className="truncate max-w-lg" title={workspace.path}>
                        {workspace.path}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleCopyPath(e, workspace.path)}
                        className="p-1 rounded hover:bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors"
                        title="Copy folder path"
                      >
                        {copiedPath === workspace.path ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Middle: Git & Status Chips */}
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 shrink-0">
                    {/* Git Branch */}
                    <div className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] px-2.5 py-1 rounded-lg border border-[var(--color-border)]">
                      <GitBranch className="w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
                      <span className="font-mono text-xs">{workspace.git_branch || 'HEAD'}</span>
                    </div>

                    {/* Git Dirty / Clean status */}
                    {isDirty ? (
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-warning)] bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] px-2.5 py-1 rounded-lg">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>{workspace.dirty_count || 1} unsaved file{(workspace.dirty_count || 1) === 1 ? '' : 's'}</span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] px-2.5 py-1 rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
                        <span>Clean</span>
                      </div>
                    )}

                    {/* Reclaimable Junk Badge */}
                    {reclaimableSize > 0 && (
                      <div
                        className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-[var(--color-accent-strong)] bg-[var(--color-accent-muted)] border border-[var(--color-border)] px-2.5 py-1 rounded-lg"
                        title="Build artifacts / dependencies safe to clean"
                      >
                        <HardDrive className="w-3 h-3 text-[var(--color-accent)]" />
                        <span>{formatSize(reclaimableSize)}</span>
                      </div>
                    )}

                    {/* Secret leak alert */}
                    {workspace.unprotected_env_files && workspace.unprotected_env_files.length > 0 && (
                      <span
                        title="Secrets unprotected in .gitignore"
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded-lg"
                      >
                        <ShieldAlert className="w-3 h-3 text-[var(--color-danger)]" />
                        <span>.env exposed</span>
                      </span>
                    )}

                    {/* Merged branches alert */}
                    {workspace.merged_branches && workspace.merged_branches.length > 0 && (
                      <span
                        title={`${workspace.merged_branches.length} merged branch(es) safe to prune`}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold bg-[var(--color-surface-2)] text-[var(--color-accent-strong)] border border-[var(--color-border)] rounded-lg"
                      >
                        <GitMerge className="w-3 h-3 text-[var(--color-accent)]" />
                        <span>{workspace.merged_branches.length} merged</span>
                      </span>
                    )}
                  </div>

                  {/* Right: Direct Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--color-border-subtle)]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        EntropyApiClient.launchIde(workspace.path, 'code');
                      }}
                      className="p-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                      title="Open in VS Code"
                    >
                      <Code2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        EntropyApiClient.openInTerminal(workspace.path);
                      }}
                      className="p-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                      title="Open in Windows Terminal"
                    >
                      <Terminal className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        EntropyApiClient.openInExplorer(workspace.path);
                      }}
                      className="p-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                      title="Open in File Explorer"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>

                    {isDirty && (
                      <button
                        type="button"
                        onClick={(e) => handleQuickStash(e, workspace.path)}
                        disabled={gitLoadingPath === workspace.path}
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--color-warning-bg)] hover:bg-[var(--color-warning)]/20 text-[var(--color-warning)] border border-[var(--color-warning-border)] text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                        title="Safely stash working tree"
                      >
                        {gitLoadingPath === workspace.path ? 'Stashing…' : 'Stash'}
                      </button>
                    )}

                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Empty State */}
          {filteredWorkspaces.length === 0 && (
            <div className="p-12 text-center bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl space-y-3">
              <FolderGit2 className="w-10 h-10 text-[var(--color-text-tertiary)] mx-auto opacity-50" />
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                {searchQuery ? 'No matching workspaces found' : 'No workspaces in this filter'}
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-sm mx-auto">
                {searchQuery
                  ? `No workspace matched "${searchQuery}". Clear your search or add a new folder.`
                  : 'Try selecting a different filter above or add a new directory to monitor.'}
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onInspectFolder}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium transition-opacity cursor-pointer shadow-sm"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Choose Folder in File Explorer</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Toast Notifications ── */}
      {cleanSlateNotice && (
        <div className="fixed bottom-6 right-6 z-50 bg-[var(--color-surface-2)] border border-[var(--color-success-border)] text-[var(--color-success)] px-4 py-3 rounded-xl shadow-xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Zap className="w-4 h-4 text-[var(--color-success)] shrink-0" />
          <span>{cleanSlateNotice}</span>
        </div>
      )}

      {gitNotice && (
        <div className="fixed bottom-6 left-6 z-50 bg-[var(--color-surface-2)] border border-[var(--color-accent)]/40 text-[var(--color-text-primary)] px-4 py-3 rounded-xl shadow-xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <Shield className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
          <span>{gitNotice}</span>
        </div>
      )}

      {/* ── Clean Slate Confirmation Modal ── */}
      {confirmCleanSlate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[var(--color-success-bg)] border border-[var(--color-success-border)] flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-[var(--color-success)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Execute Clean Slate?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                  Safely terminates <strong>{devProcesses.length} background developer servers</strong> and reclaims{' '}
                  <strong className="text-[var(--color-success)] font-mono">{formatSize(totalDevRam)} RAM</strong>.
                </p>
                <div className="mt-3 p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs space-y-1 max-h-36 overflow-y-auto font-mono text-[var(--color-text-secondary)]">
                  {devProcesses.map((p) => (
                    <div key={p.pid} className="flex justify-between items-center text-[11px]">
                      <span className="truncate">{p.name} (PID {p.pid})</span>
                      <span className="shrink-0 ml-2">{formatSize(p.memory_bytes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmCleanSlate(false)}
                disabled={cleanSlateLoading}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteCleanSlate}
                disabled={cleanSlateLoading}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-success)] hover:opacity-90 text-black font-semibold transition-opacity cursor-pointer shadow-sm disabled:opacity-50"
              >
                {cleanSlateLoading ? 'Terminating…' : 'Reclaim RAM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

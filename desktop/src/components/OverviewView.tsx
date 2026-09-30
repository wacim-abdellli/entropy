import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  Folder,
  FolderGit2,
  FolderOpen,
  GitBranch,
  HardDrive,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Terminal,
  Trash2,
  Zap,
} from 'lucide-react';
import { EnvironmentOverview } from '../types/entropy';
import { EntropyApiClient } from '../services/api';
import { SecretsRadarModal } from './SecretsRadarModal';

interface OverviewViewProps {
  overview?: EnvironmentOverview | null;
  onRefresh: () => void;
  isLoading: boolean;
  onSelectWorkspace: (path: string) => void;
  onInspectFolder: () => void;
  onNavigateToSettings?: () => void;
  scanRoots?: string[];
  initialFolderScope?: string;
  onFolderScopeChange?: (folder: string) => void;
}

type WorkspaceFilter = 'all' | 'running' | 'dirty' | 'unpushed' | 'cleanup' | 'secrets';

function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface FrameworkStyle {
  label: string;
  badge: string;
  dot: string;
}

function getFrameworkStyle(type: string): FrameworkStyle {
  const norm = (type || '').toLowerCase();
  if (norm.includes('flutter')) {
    return {
      label: 'Flutter',
      badge: 'bg-[var(--color-info-bg)] text-[var(--color-info)] border-[var(--color-info-border)]',
      dot: 'bg-[var(--color-info)]',
    };
  }
  if (norm.includes('node')) {
    return {
      label: 'Node.js',
      badge: 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]',
      dot: 'bg-[var(--color-success)]',
    };
  }
  if (norm.includes('python')) {
    return {
      label: 'Python',
      badge: 'bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)] border-[var(--color-accent)]/30',
      dot: 'bg-[var(--color-accent)]',
    };
  }
  if (norm.includes('ruby')) {
    return {
      label: 'Ruby',
      badge: 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]',
      dot: 'bg-[var(--color-danger)]',
    };
  }
  if (norm.includes('rust')) {
    return {
      label: 'Rust',
      badge: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]',
      dot: 'bg-[var(--color-warning)]',
    };
  }
  if (norm.includes('go')) {
    return {
      label: 'Go',
      badge: 'bg-[var(--color-info-bg)] text-[var(--color-info)] border-[var(--color-info-border)]',
      dot: 'bg-[var(--color-info)]',
    };
  }
  if (norm.includes('dotnet') || norm.includes('csharp')) {
    return {
      label: '.NET',
      badge: 'bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border-[var(--color-border)]',
      dot: 'bg-[var(--color-accent)]',
    };
  }
  if (norm.includes('java')) {
    return {
      label: 'Java',
      badge: 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]',
      dot: 'bg-[var(--color-warning)]',
    };
  }
  return {
    label: (type && type.toLowerCase() !== 'unknown') ? type : 'Project',
    badge: 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)]',
    dot: 'bg-[var(--color-text-tertiary)]',
  };
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  overview,
  onRefresh,
  isLoading,
  onSelectWorkspace,
  onInspectFolder,
  onNavigateToSettings,
  scanRoots,
  initialFolderScope,
  onFolderScopeChange,
}) => {
  const [filter, setFilter] = useState<WorkspaceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [secretsRadarOpen, setSecretsRadarOpen] = useState(false);

  // View mode: 'grid' cards deck or 'table' compact forensic list
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    try {
      const saved = localStorage.getItem('entropy_overview_view_mode');
      if (saved === 'grid' || saved === 'table') return saved;
    } catch {}
    return 'grid';
  });

  const handleToggleViewMode = (mode: 'grid' | 'table') => {
    setViewMode(mode);
    try {
      localStorage.setItem('entropy_overview_view_mode', mode);
    } catch {}
  };

  // Folder scope filter: 'all' or a specific folder path (e.g. 'C:\Users\pc\Desktop')
  const [selectedFolder, setSelectedFolder] = useState<string>(() => {
    if (initialFolderScope) return initialFolderScope;
    try {
      const saved = localStorage.getItem('entropy_selected_folder');
      if (saved) return saved;
    } catch {}
    return 'all';
  });

  const handleSelectFolder = (folder: string) => {
    setSelectedFolder(folder);
    try {
      localStorage.setItem('entropy_selected_folder', folder);
    } catch {}
    onFolderScopeChange?.(folder);
  };

  const [confirmCleanSlate, setConfirmCleanSlate] = useState(false);
  const [cleanSlateLoading, setCleanSlateLoading] = useState(false);
  const [cleanSlateNotice, setCleanSlateNotice] = useState<string | null>(null);

  const [gitNotice, setGitNotice] = useState<string | null>(null);
  const [gitLoadingPath, setGitLoadingPath] = useState<string | null>(null);

  const workspaces = useMemo(() => overview?.workspaces || [], [overview?.workspaces]);
  const artifacts = useMemo(() => overview?.system?.artifacts || [], [overview?.system?.artifacts]);

  // Compute workspace counts inside each scanned root folder
  const folderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const root of scanRoots || []) {
      const normRoot = root.toLowerCase().replace(/[\\/]+$/, '');
      const count = workspaces.filter((w) => {
        const normW = w.path.toLowerCase().replace(/[\\/]+$/, '');
        return normW === normRoot || normW.startsWith(normRoot + '\\') || normW.startsWith(normRoot + '/');
      }).length;
      map.set(normRoot, count);
    }
    return map;
  }, [scanRoots, workspaces]);

  // When a folder is actively selected, scope the view to projects in that directory!
  const scopedWorkspaces = useMemo(() => {
    if (!selectedFolder || selectedFolder === 'all') return workspaces;
    const activeNorm = selectedFolder.toLowerCase().replace(/[\\/]+$/, '');
    return workspaces.filter((w) => {
      const wNorm = w.path.toLowerCase().replace(/[\\/]+$/, '');
      return wNorm === activeNorm || wNorm.startsWith(activeNorm + '\\') || wNorm.startsWith(activeNorm + '/');
    });
  }, [workspaces, selectedFolder]);

  const dirtyList = useMemo(() => scopedWorkspaces.filter((w) => w.has_uncommitted_changes), [scopedWorkspaces]);
  const unpushedList = useMemo(() => scopedWorkspaces.filter((w) => (w.commits_ahead || 0) > 0), [scopedWorkspaces]);
  const runningList = useMemo(() => scopedWorkspaces.filter((w) => w.process_count > 0), [scopedWorkspaces]);

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

  const totalReclaimableBytes = useMemo(() => {
    let sum = 0;
    for (const w of scopedWorkspaces) {
      const norm = w.path.toLowerCase().replace(/[\\/]+$/, '');
      sum += workspaceArtifactSizeMap.get(norm) || 0;
    }
    return sum;
  }, [scopedWorkspaces, workspaceArtifactSizeMap]);

  const cleanupList = useMemo(() => {
    return scopedWorkspaces.filter((w) => {
      const norm = w.path.toLowerCase().replace(/[\\/]+$/, '');
      return (workspaceArtifactSizeMap.get(norm) || 0) > 0;
    });
  }, [scopedWorkspaces, workspaceArtifactSizeMap]);

  const secretsList = useMemo(() => {
    return scopedWorkspaces.filter((w) => {
      const hasTracked = w.secret_issues?.some((s) => s.status === 'tracked');
      const hasUnignored =
        w.secret_issues?.some((s) => s.status === 'unignored') ||
        (w.unprotected_env_files && w.unprotected_env_files.length > 0);
      return hasTracked || hasUnignored;
    });
  }, [scopedWorkspaces]);

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
    let list = scopedWorkspaces;

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
  }, [scopedWorkspaces, filter, runningList, dirtyList, cleanupList, unpushedList, secretsList, searchQuery]);

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

  const handleLaunchIde = async (e: React.MouseEvent, workspacePath: string) => {
    e.stopPropagation();
    try {
      const res = await EntropyApiClient.launchIde(workspacePath, 'code');
      if (res.success) {
        setGitNotice(`Launched in VS Code`);
      } else {
        await EntropyApiClient.openInExplorer(workspacePath);
      }
    } catch {
      await EntropyApiClient.openInExplorer(workspacePath);
    } finally {
      setTimeout(() => setGitNotice(null), 3000);
    }
  };

  const handleOpenExplorer = async (e: React.MouseEvent, workspacePath: string) => {
    e.stopPropagation();
    try {
      await EntropyApiClient.openInExplorer(workspacePath);
    } catch (err) {
      console.error('Failed to open explorer:', err);
    }
  };

  const handleOpenTerminal = async (e: React.MouseEvent, workspacePath: string) => {
    e.stopPropagation();
    try {
      await EntropyApiClient.openInTerminal(workspacePath);
    } catch (err) {
      console.error('Failed to open terminal:', err);
    }
  };

  const handleQuickCleanArtifacts = async (e: React.MouseEvent, workspacePath: string) => {
    e.stopPropagation();
    const norm = workspacePath.toLowerCase().replace(/[\\/]+$/, '');
    const wsArtifacts = artifacts.filter(
      (a) => a.project_path && a.project_path.toLowerCase().replace(/[\\/]+$/, '') === norm
    );
    if (!wsArtifacts.length) return;

    setGitLoadingPath(workspacePath);
    try {
      const paths = wsArtifacts.map((a) => a.path);
      const res = await EntropyApiClient.cleanArtifacts(paths);
      if (res.success) {
        setCleanSlateNotice(`Reclaimed ${formatSize(res.total_freed_bytes || 0)} from build artifacts!`);
      } else {
        setCleanSlateNotice(res.error || 'Failed to clean artifacts.');
      }
      onRefresh();
    } catch {
      setCleanSlateNotice('Failed to clean artifacts.');
    } finally {
      setGitLoadingPath(null);
      setTimeout(() => setCleanSlateNotice(null), 5000);
    }
  };

  const handleQuickTrimRam = async () => {
    setCleanSlateLoading(true);
    try {
      const report = await EntropyApiClient.trimWorkingSets();
      if (report.success) {
        setCleanSlateNotice(
          `Memory Boosted: Reclaimed ${report.total_freed_formatted || formatSize(report.total_freed_bytes || 0)} physical RAM across ${report.trimmed_count} processes!`
        );
      } else {
        setCleanSlateNotice(report.error || 'Memory trimming completed.');
      }
      onRefresh();
    } catch {
      setCleanSlateNotice('Failed to trim memory.');
    } finally {
      setCleanSlateLoading(false);
      setTimeout(() => setCleanSlateNotice(null), 5000);
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
                  {selectedFolder !== 'all'
                    ? `${scopedWorkspaces.length} of ${workspaces.length}`
                    : workspaces.length}
                </span>
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
                placeholder="Search workspaces..."
                aria-label="Search workspaces"
                className="w-32 sm:w-44 md:w-52 h-8 pl-8 pr-2.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] focus:border-[var(--color-accent)] rounded-lg text-xs placeholder-[var(--color-text-tertiary)] focus:outline-none transition-colors"
              />
            </div>

            {/* View Mode Toggle: Grid vs Table */}
            <div className="flex items-center p-0.5 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => handleToggleViewMode('grid')}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] shadow-xs'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
                title="Grid View (Project Cards Deck)"
                aria-label="Grid View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleToggleViewMode('table')}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)] shadow-xs'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
                title="Table View (Compact Forensic List)"
                aria-label="Table View"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

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

      {/* ── Folder Scope Switcher Bar ── */}
      <div className="w-full px-4 sm:px-8 pt-4 pb-0">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none text-xs">
          <span className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
            <Folder className="w-3.5 h-3.5 text-[var(--color-accent)]" />
            Folder:
          </span>

          <button
            type="button"
            onClick={() => handleSelectFolder('all')}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              selectedFolder === 'all'
                ? 'bg-[var(--color-accent)]/15 border-[var(--color-accent)] text-[var(--color-accent-strong)] font-semibold shadow-xs'
                : 'bg-[var(--color-surface-2)]/60 hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <span>All Scanned Folders</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                selectedFolder === 'all'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]'
              }`}
            >
              {workspaces.length}
            </span>
          </button>

          {(scanRoots || []).map((root) => {
            const normRoot = root.toLowerCase().replace(/[\\/]+$/, '');
            const folderName = root.split(/[\\/]/).filter(Boolean).pop() || root;
            const count = folderCounts.get(normRoot) || 0;
            const isSelected = selectedFolder.toLowerCase().replace(/[\\/]+$/, '') === normRoot;

            return (
              <button
                key={root}
                type="button"
                onClick={() => handleSelectFolder(root)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-[var(--color-accent)]/15 border-[var(--color-accent)] text-[var(--color-accent-strong)] font-semibold shadow-xs'
                    : 'bg-[var(--color-surface-2)]/60 hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)] hover:text-[var(--color-text-primary)]'
                }`}
                title={root}
              >
                <FolderOpen className="w-3.5 h-3.5 opacity-75 shrink-0" />
                <span className="truncate max-w-[140px]">{folderName}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isSelected
                      ? 'bg-[var(--color-accent)] text-white'
                      : 'bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {onNavigateToSettings && (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:underline ml-auto pl-2 shrink-0 cursor-pointer flex items-center gap-1"
              title="Configure and manage scan roots"
            >
              <span>Manage Folders</span>
            </button>
          )}
        </div>
      </div>

      {/* ── PC Level-Up Command Hub (Hero Strip) ── */}
      <div className="w-full px-4 sm:px-8 pt-3 pb-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Reclaimable Disk Junk */}
          <div className="bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/80 border border-[var(--color-border)] hover:border-[var(--color-border-strong)] rounded-xl p-3.5 transition-all shadow-xs flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                  Disk Reclaimable
                </span>
                <div className="text-xl font-bold font-mono text-[var(--color-text-primary)]">
                  {formatSize(totalReclaimableBytes)}
                </div>
              </div>
              {totalReclaimableBytes > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter('cleanup')}
                  className="px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)] hover:bg-[var(--color-accent)] hover:text-white transition-colors cursor-pointer"
                  title="Filter to cleanable workspaces"
                >
                  View ({cleanupList.length})
                </button>
              )}
            </div>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2">
              {cleanupList.length > 0
                ? `${cleanupList.length} workspace${cleanupList.length === 1 ? '' : 's'} with disposable build artifacts`
                : 'All workspace build folders are clean'}
            </p>
          </div>

          {/* Card 2: Live Dev RAM & Servers */}
          <div className="bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/80 border border-[var(--color-border)] hover:border-[var(--color-border-strong)] rounded-xl p-3.5 transition-all shadow-xs flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[var(--color-success)]" />
                  Dev Servers & RAM
                </span>
                <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] flex items-center gap-2">
                  <span>{runningList.length} Active</span>
                  {totalDevRam > 0 && (
                    <span className="text-xs font-normal text-[var(--color-success)]">
                      • {formatSize(totalDevRam)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleQuickTrimRam}
                  disabled={cleanSlateLoading}
                  className="px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--color-success-bg)] border border-[var(--color-success-border)] text-[var(--color-success)] hover:bg-[var(--color-success)] hover:text-white transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  title="Trim working sets to reclaim physical RAM"
                >
                  <Zap className="w-3 h-3" />
                  <span>Trim RAM</span>
                </button>
                {totalDevRam > 0 && (
                  <button
                    type="button"
                    onClick={() => setConfirmCleanSlate(true)}
                    disabled={cleanSlateLoading}
                    className="px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--color-surface-3)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-4)] transition-colors cursor-pointer disabled:opacity-50"
                    title="Terminate background dev servers to free memory"
                  >
                    <span>Free</span>
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2">
              {runningList.length > 0
                ? `Ports: ${runningList.flatMap((w) => w.ports || []).slice(0, 3).map((p) => `:${p}`).join(' ')}`
                : totalDevRam > 0
                ? `${formatSize(totalDevRam)} RAM in ${devProcesses.length} background dev process${devProcesses.length === 1 ? '' : 'es'}`
                : 'Zero background dev servers running'}
            </p>
          </div>

          {/* Card 3: Work Guardian (Git Loss Prevention) */}
          <div className="bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/80 border border-[var(--color-border)] hover:border-[var(--color-border-strong)] rounded-xl p-3.5 transition-all shadow-xs flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-[var(--color-warning)]" />
                  Work Guardian
                </span>
                <div className="text-xl font-bold font-mono text-[var(--color-text-primary)]">
                  {dirtyList.length > 0 && unpushedList.length > 0
                    ? `${dirtyList.length} Unsaved`
                    : dirtyList.length > 0
                    ? `${dirtyList.length} Unsaved`
                    : unpushedList.length > 0
                    ? `${unpushedList.length} Unpushed`
                    : 'All Synced'}
                </div>
              </div>
              {(dirtyList.length > 0 || unpushedList.length > 0) && (
                <button
                  type="button"
                  onClick={() => setFilter(dirtyList.length > 0 ? 'dirty' : 'unpushed')}
                  className="px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] text-[var(--color-warning)] hover:bg-[var(--color-warning)] hover:text-black transition-colors cursor-pointer"
                  title="Filter to repos requiring attention"
                >
                  Review
                </button>
              )}
            </div>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2">
              {unpushedList.length > 0
                ? `${unpushedList.length} repo${unpushedList.length === 1 ? '' : 's'} ahead of remote (local only!)`
                : dirtyList.length > 0
                ? `${dirtyList.length} repo${dirtyList.length === 1 ? '' : 's'} with uncommitted changes`
                : 'All repositories safely committed & in sync'}
            </p>
          </div>

          {/* Card 4: Secrets & Security Radar */}
          <div className="bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/80 border border-[var(--color-border)] hover:border-[var(--color-border-strong)] rounded-xl p-3.5 transition-all shadow-xs flex flex-col justify-between group">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[var(--color-info)]" />
                  Security Radar
                </span>
                <div className="text-xl font-bold font-mono text-[var(--color-text-primary)]">
                  {secretsList.length === 0 ? (
                    <span className="text-[var(--color-success)] flex items-center gap-1 text-lg">
                      <CheckCircle2 className="w-4 h-4" /> 100% Shielded
                    </span>
                  ) : (
                    <span className="text-[var(--color-danger)]">
                      {secretsList.length} Exposed
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSecretsRadarOpen(true)}
                className="px-2 py-1 rounded-md text-[10px] font-medium bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] text-[var(--color-text-primary)] border border-[var(--color-border)] transition-colors cursor-pointer"
                title="Scan for exposed API tokens and credentials"
              >
                Open Radar
              </button>
            </div>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2">
              {secretsList.length > 0
                ? 'Unprotected .env files or credentials found'
                : 'All environment secrets ignored & protected'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Workspaces Section ── */}
      <div className="w-full px-4 sm:px-8 py-3">
        {/* Subtle real-time scan progress bar when refreshing existing workspaces */}
        {isLoading && workspaces.length > 0 && (
          <div className="h-0.5 w-full bg-[var(--color-accent)]/20 overflow-hidden mb-3 rounded-full">
            <div className="h-full bg-[var(--color-accent)] animate-pulse w-full" />
          </div>
        )}

        {/* Loading First Run */}
        {isLoading && workspaces.length === 0 ? (
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl overflow-hidden divide-y divide-[var(--color-border-subtle)] shadow-xs w-full">
            {/* Scanning status banner */}
            <div className="p-4 bg-[var(--color-surface-2)]/50 border-b border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <RefreshCw className="w-4 h-4 text-[var(--color-accent)] animate-spin shrink-0" />
                <div>
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    Scanning developer directories across your PC…
                  </span>
                  <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono mt-0.5">
                    {scanRoots && scanRoots.length > 0
                      ? `Checking: ${scanRoots.map((r) => r.split(/[\\/]/).filter(Boolean).pop() || r).join(', ')}`
                      : 'Discovering Git repositories, dev servers, and build artifacts'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onInspectFolder}
                  className="px-3 py-1.5 rounded-lg bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] text-[var(--color-text-primary)] border border-[var(--color-border)] text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5"
                  title="Choose a specific workspace or folder to scan immediately"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                  <span>Choose Specific Folder</span>
                </button>
                <span className="text-[11px] font-mono text-[var(--color-text-tertiary)] hidden sm:inline">
                  Please wait…
                </span>
              </div>
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
        ) : filteredWorkspaces.length > 0 ? (
          viewMode === 'grid' ? (
            /* ── Modern Grid Card Deck View ── */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 w-full">
              {filteredWorkspaces.map((workspace) => {
                const isDirty = workspace.has_uncommitted_changes;
                const isRunning = workspace.process_count > 0;
                const reclaimableSize = workspaceArtifactSizeMap.get(
                  workspace.path.toLowerCase().replace(/[\\/]+$/, '')
                ) || 0;
                const fw = getFrameworkStyle(workspace.project_type);

                return (
                  <div
                    key={workspace.id}
                    onClick={() => onSelectWorkspace(workspace.path)}
                    className={`group bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/90 border rounded-xl p-3.5 transition-all duration-150 flex flex-col justify-between shadow-xs hover:shadow-md cursor-pointer relative overflow-hidden ${
                      isRunning
                        ? 'border-[var(--color-success)]/40 shadow-[0_0_14px_rgba(16,185,129,0.06)]'
                        : isDirty
                        ? 'border-[var(--color-border)] hover:border-[var(--color-warning)]/40'
                        : 'border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
                    }`}
                  >
                    {/* Top: Framework Badge & Status Indicators */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${fw.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${fw.dot}`} />
                          <span>{fw.label}</span>
                        </span>

                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {isRunning && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                              RUNNING
                            </span>
                          )}
                          {(workspace.commits_ahead || 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[var(--color-warning)] bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] rounded"
                              title={`${workspace.commits_ahead} unpushed commit(s) — local only`}
                            >
                              <ArrowUp className="w-2.5 h-2.5" />
                              <span>{workspace.commits_ahead} unpushed</span>
                            </span>
                          )}
                          {isDirty && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--color-warning)] bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)]">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              <span>{workspace.dirty_count || 1} unsaved</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Project Name & Path */}
                      <h3 className="font-semibold text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors truncate">
                        {workspace.name}
                      </h3>

                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)] font-mono mt-0.5">
                        <span className="truncate flex-1" title={workspace.path}>
                          {workspace.path}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyPath(e, workspace.path)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] transition-all cursor-pointer shrink-0"
                          title="Copy path"
                          aria-label="Copy workspace path"
                        >
                          {copiedPath === workspace.path ? (
                            <CheckCircle2 className="w-3 h-3 text-[var(--color-success)]" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>

                      {/* Telemetry Chips: Ports, Reclaimable, Secrets, Git */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {/* Branch */}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] font-mono text-[10px] text-[var(--color-text-secondary)]">
                          <GitBranch className="w-2.5 h-2.5 text-[var(--color-accent)]" />
                          <span className="truncate max-w-[90px]">{workspace.git_branch || 'HEAD'}</span>
                        </span>

                        {/* Ports */}
                        {workspace.ports && workspace.ports.length > 0 && (
                          workspace.ports.map((port) => (
                            <span
                              key={port}
                              onClick={(e) => {
                                e.stopPropagation();
                                EntropyApiClient.openUrl(`http://localhost:${port}`);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono text-[var(--color-success)] bg-[var(--color-success-bg)] border border-[var(--color-success-border)] rounded hover:underline cursor-pointer"
                              title={`Open http://localhost:${port}`}
                            >
                              :{port}
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </span>
                          ))
                        )}

                        {/* Reclaimable Space */}
                        {reclaimableSize > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/20 font-mono text-[10px] text-[var(--color-accent-strong)]">
                            <HardDrive className="w-2.5 h-2.5" />
                            <span>{formatSize(reclaimableSize)}</span>
                          </span>
                        )}

                        {/* Secret Shield Alert (only rendered when exposed/tracked) */}
                        {(() => {
                          const tracked = workspace.secret_issues?.filter((s) => s.status === 'tracked') || [];
                          const unignored =
                            workspace.secret_issues?.filter((s) => s.status === 'unignored') ||
                            (workspace.unprotected_env_files?.map((p) => ({ path: p })) || []);
                          if (tracked.length > 0) {
                            return (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded">
                                <ShieldAlert className="w-2.5 h-2.5" />
                                <span>{tracked.length} in git</span>
                              </span>
                            );
                          }
                          if (unignored.length > 0) {
                            return (
                              <button
                                type="button"
                                onClick={(e) => handleQuickIgnoreEnv(e, workspace.path)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)] rounded hover:bg-[var(--color-warning)]/20 cursor-pointer"
                                title="Click to protect with .gitignore"
                              >
                                <ShieldAlert className="w-2.5 h-2.5" />
                                <span>{unignored.length} exposed</span>
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="mt-2.5 pt-2 border-t border-[var(--color-border-subtle)] flex items-center justify-between gap-1 text-xs">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleLaunchIde(e, workspace.path)}
                          className="px-2 py-1 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                          title="Open in VS Code"
                        >
                          <Code2 className="w-3 h-3 text-[var(--color-accent)]" />
                          <span>IDE</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleOpenExplorer(e, workspace.path)}
                          className="p-1 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] transition-colors cursor-pointer"
                          title="Open in File Explorer"
                          aria-label="Open in File Explorer"
                        >
                          <FolderOpen className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleOpenTerminal(e, workspace.path)}
                          className="p-1 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-warning)] border border-[var(--color-border-subtle)] transition-colors cursor-pointer"
                          title="Open Terminal"
                          aria-label="Open Terminal"
                        >
                          <Terminal className="w-3 h-3" />
                        </button>

                        {reclaimableSize > 0 && (
                          <button
                            type="button"
                            onClick={(e) => handleQuickCleanArtifacts(e, workspace.path)}
                            disabled={gitLoadingPath === workspace.path}
                            className="px-2 py-1 rounded-md bg-[var(--color-accent-muted)] hover:bg-[var(--color-accent)] hover:text-white text-[var(--color-accent-strong)] transition-colors cursor-pointer disabled:opacity-50 text-[10px] font-medium flex items-center gap-1"
                            title="Delete build artifacts"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                            <span>Clean</span>
                          </button>
                        )}

                        {isDirty && (
                          <button
                            type="button"
                            onClick={(e) => handleQuickStash(e, workspace.path)}
                            disabled={gitLoadingPath === workspace.path}
                            className="px-2 py-1 rounded-md bg-[var(--color-warning-bg)] hover:bg-[var(--color-warning)] hover:text-black text-[var(--color-warning)] transition-colors cursor-pointer disabled:opacity-50 text-[10px] font-medium flex items-center gap-1"
                            title="Safely stash uncommitted changes"
                          >
                            <Archive className="w-2.5 h-2.5" />
                            <span>Stash</span>
                          </button>
                        )}

                        {(workspace.commits_ahead || 0) > 0 && (
                          <button
                            type="button"
                            onClick={(e) => handleQuickPush(e, workspace.path)}
                            disabled={gitLoadingPath === workspace.path}
                            className="px-2 py-1 rounded-md bg-[var(--color-warning-bg)] hover:bg-[var(--color-warning)] hover:text-black text-[var(--color-warning)] transition-colors cursor-pointer disabled:opacity-50 text-[10px] font-medium flex items-center gap-1 font-mono"
                            title="Safely push commits to remote tracking branch"
                          >
                            <ArrowUp className="w-2.5 h-2.5" />
                            <span>{gitLoadingPath === workspace.path ? '…' : 'Push'}</span>
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectWorkspace(workspace.path)}
                        className="p-1 rounded-md text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent)] hover:bg-[var(--color-surface-3)] transition-all cursor-pointer"
                        title="Inspect workspace forensic detail"
                        aria-label="Inspect workspace"
                      >
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Compact Forensic Table View ── */
            <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-xs w-full">
              {/* Table Column Headers */}
              <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-[var(--color-surface-2)]/50 border-b border-[var(--color-border-subtle)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] select-none">
                <div className="col-span-4 flex items-center gap-2">Project & Path</div>
                <div className="col-span-2">Framework & Ports</div>
                <div className="col-span-3">Git & Status</div>
                <div className="col-span-1 text-right">Reclaimable</div>
                <div className="col-span-2 text-right pr-2">Quick Actions</div>
              </div>

              <div className="divide-y divide-[var(--color-border-subtle)]">
                {filteredWorkspaces.map((workspace) => {
                  const isDirty = workspace.has_uncommitted_changes;
                  const isRunning = workspace.process_count > 0;
                  const reclaimableSize = workspaceArtifactSizeMap.get(
                    workspace.path.toLowerCase().replace(/[\\/]+$/, '')
                  ) || 0;
                  const fw = getFrameworkStyle(workspace.project_type);

                  return (
                    <div
                      key={workspace.id}
                      onClick={() => onSelectWorkspace(workspace.path)}
                      className="grid grid-cols-12 gap-3 px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer items-center group"
                    >
                      {/* Col 1-4: Project Name & Path */}
                      <div className="col-span-4 min-w-0 flex items-center gap-3">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isRunning
                              ? 'bg-[var(--color-success)] shadow-[0_0_6px_rgba(16,185,129,0.7)] animate-pulse'
                              : isDirty
                              ? 'bg-[var(--color-warning)]'
                              : 'bg-[var(--color-border-strong)]'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors truncate">
                              {workspace.name}
                            </span>
                            {isRunning && (
                              <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                                Live
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)] font-mono truncate mt-0.5">
                            <span className="truncate" title={workspace.path}>{workspace.path}</span>
                            <button
                              type="button"
                              onClick={(e) => handleCopyPath(e, workspace.path)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-[var(--color-text-primary)] transition-opacity cursor-pointer shrink-0"
                              title="Copy path"
                              aria-label="Copy workspace path"
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

                      {/* Col 5-6: Framework & Ports */}
                      <div className="col-span-2 min-w-0 flex items-center gap-2 flex-wrap text-xs">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono border ${fw.badge}`}>
                          <span className={`w-1 h-1 rounded-full ${fw.dot}`} />
                          {fw.label}
                        </span>
                        {workspace.ports && workspace.ports.length > 0 && (
                          workspace.ports.map((port) => (
                            <span
                              key={port}
                              onClick={(e) => {
                                e.stopPropagation();
                                EntropyApiClient.openUrl(`http://localhost:${port}`);
                              }}
                              className="inline-flex items-center gap-0.5 px-1 py-0.2 text-[10px] font-mono text-[var(--color-success)] bg-[var(--color-success-bg)] border border-[var(--color-success-border)] rounded hover:underline cursor-pointer"
                              title={`Open http://localhost:${port}`}
                            >
                              :{port}
                            </span>
                          ))
                        )}
                      </div>

                      {/* Col 7-9: Git Branch, Changes & Unpushed */}
                      <div className="col-span-3 min-w-0 flex items-center gap-2 flex-wrap text-xs font-mono">
                        <span className="inline-flex items-center gap-1 text-[var(--color-text-secondary)] text-[11px]">
                          <GitBranch className="w-3 h-3 text-[var(--color-accent)]" />
                          <span className="truncate max-w-[100px]">{workspace.git_branch || 'HEAD'}</span>
                        </span>

                        {isDirty ? (
                          <span className="inline-flex items-center gap-1 text-[var(--color-warning)] text-[10px]">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>{workspace.dirty_count || 1} unsaved</span>
                          </span>
                        ) : (
                          <span className="text-[var(--color-text-tertiary)] text-[10px]">clean</span>
                        )}

                        {(workspace.commits_ahead || 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.2 text-[10px] text-[var(--color-warning)] bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] rounded">
                            <ArrowUp className="w-2.5 h-2.5" />
                            <span>{workspace.commits_ahead} unpushed</span>
                          </span>
                        )}
                      </div>

                      {/* Col 10: Reclaimable Disk Space */}
                      <div className="col-span-1 text-right font-mono text-xs text-[var(--color-accent-strong)]">
                        {reclaimableSize > 0 ? (
                          <span title="Disposable build artifacts">{formatSize(reclaimableSize)}</span>
                        ) : (
                          <span className="text-[var(--color-text-tertiary)]">—</span>
                        )}
                      </div>

                      {/* Col 11-12: Quick Actions */}
                      <div className="col-span-2 flex items-center justify-end gap-1 text-xs">
                        <button
                          type="button"
                          onClick={(e) => handleLaunchIde(e, workspace.path)}
                          className="p-1.5 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                          title="Open in VS Code"
                          aria-label="Open in VS Code"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => handleOpenExplorer(e, workspace.path)}
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
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-warning-bg)] text-[var(--color-warning)] hover:bg-[var(--color-warning)] hover:text-black transition-colors cursor-pointer disabled:opacity-50"
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
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-warning-bg)] text-[var(--color-warning)] hover:bg-[var(--color-warning)] hover:text-black transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1 font-mono"
                            title="Safely push commits to remote tracking branch"
                          >
                            <ArrowUp className="w-2.5 h-2.5" />
                            <span>{gitLoadingPath === workspace.path ? '…' : 'Push'}</span>
                          </button>
                        )}

                        <ArrowRight className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] group-hover:text-[var(--color-accent)] group-hover:translate-x-0.5 transition-all ml-1" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : null}

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
                      : selectedFolder !== 'all' && scopedWorkspaces.length === 0
                      ? `No workspaces found inside "${selectedFolder.split(/[\\/]/).filter(Boolean).pop() || selectedFolder}".`
                      : 'No workspaces found matching the selected filter.'}
                  </p>
                  {(searchQuery || filter !== 'all' || (selectedFolder !== 'all' && scopedWorkspaces.length === 0)) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setFilter('all');
                        if (selectedFolder !== 'all') {
                          handleSelectFolder('all');
                        }
                      }}
                      className="text-xs text-[var(--color-accent)] hover:underline cursor-pointer"
                    >
                      {selectedFolder !== 'all' && scopedWorkspaces.length === 0 ? 'View all scanned folders' : 'Clear filters'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clean-slate-modal-title"
          onKeyDown={(e) => { if (e.key === 'Escape') setConfirmCleanSlate(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--color-success-bg)] border border-[var(--color-success-border)] flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-[var(--color-success)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="clean-slate-modal-title" className="text-sm font-semibold text-[var(--color-text-primary)]">
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

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  GitBranch,
  Code2,
  Terminal,
  SquareTerminal,
  FolderOpen,
  ExternalLink,
  Globe,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  Trash2,
  FileText,
  Zap,
  Shield,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  FileKey,
  Lock,
  GitMerge,
  Copy,
  Check,
  XCircle,
  Archive,
  RotateCcw,
  Info,
} from 'lucide-react';
import {
  WorkspaceInspection,
  GitDirtyFile,
  ProcessConnection,
  GitStashItem,
  SecretIssue,
} from '../types/entropy';
import { EntropyApiClient } from '../services/api';
import { WorkspaceAdvisorCard } from './WorkspaceAdvisorCard';

/* ───────────────────────── Types ───────────────────────── */

interface WorkspaceViewProps {
  inspection: WorkspaceInspection;
  onBack: () => void;
  onReinspect: () => void;
  isLoading: boolean;
  onActionComplete?: () => Promise<void> | void;
  onOpenFolder?: () => void;
  onNavigateToSettings?: () => void;
}

/* ───────────────────────── Helpers ───────────────────────── */

function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTimeAgo(timestamp: number | null | undefined): string {
  if (!timestamp) return 'unknown';
  const ts = timestamp > 1e11 ? timestamp / 1000 : timestamp;
  const seconds = Math.floor(Date.now() / 1000 - ts);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function projectTypeLabel(type: string): string {
  const map: Record<string, string> = {
    python: 'Python', node: 'Node.js', dotnet: '.NET', java: 'Java',
    rust: 'Rust', go: 'Go', flutter: 'Flutter', ruby: 'Ruby',
  };
  return map[type.toLowerCase()] || type;
}

function getRebuildHint(projectType: string, depName: string): string {
  const pt = projectType.toLowerCase();
  const name = depName.toLowerCase();
  if (name.includes('node_modules')) return 'Run npm install (or pnpm/yarn install) anytime to restore.';
  if (name.includes('venv')) return 'Run python -m venv .venv && pip install -r requirements.txt to restore.';
  if (name.includes('target')) return 'Run cargo build anytime to regenerate binaries.';
  if (name.includes('bin') || name.includes('obj')) return 'Run dotnet build to recreate output binaries.';
  if (pt === 'python') return 'Run pip install -r requirements.txt to recreate virtual environment.';
  if (pt === 'node') return 'Run npm install to re-download package dependencies.';
  return 'Re-run your project build or package manager command to restore.';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* ───────────────────────── Sub-components ───────────────────────── */

const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, title, badge, action, children }) => (
  <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl overflow-hidden">
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-subtle)]">
      <div className="flex items-center gap-2.5">
        <span className="text-[var(--color-text-tertiary)]">{icon}</span>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
        {badge}
      </div>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer p-1 rounded hover:bg-[var(--color-surface-2)]"
      title="Copy path"
      aria-label="Copy path to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-[var(--color-success)]" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

/* ───────────────────────── Main View ───────────────────────── */

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  inspection,
  onBack,
  onReinspect,
  isLoading,
  onActionComplete,
  onOpenFolder,
  onNavigateToSettings,
}) => {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Stashes state
  const [stashes, setStashes] = useState<GitStashItem[]>([]);

  // Modals state
  const [cleanModal, setCleanModal] = useState<{
    paths: string[];
    title: string;
    totalSize: number;
    rebuildHint: string;
    isAll: boolean;
  } | null>(null);

  const [stashModalOpen, setStashModalOpen] = useState(false);
  const [customStashNote, setCustomStashNote] = useState('');

  const [popModal, setPopModal] = useState<GitStashItem | null>(null);
  const [dropModal, setDropModal] = useState<GitStashItem | null>(null);
  const [pruneModalOpen, setPruneModalOpen] = useState(false);
  const [stopProcModal, setStopProcModal] = useState<ProcessConnection | null>(null);
  const [freePortModal, setFreePortModal] = useState<{ port: number; proc: ProcessConnection } | null>(null);
  const [untrackModal, setUntrackModal] = useState<SecretIssue | null>(null);
  const [shieldAllModalOpen, setShieldAllModalOpen] = useState(false);

  const { workspace, connections } = inspection;
  const git = connections.git;
  const PROTECTED_PROCESS_SET = useMemo(() => new Set([
    'antigravity.exe', 'antigravity',
    'code.exe', 'code',
    'cursor.exe', 'cursor',
    'windsurf.exe', 'windsurf',
    'entropy.exe', 'entropy',
    'vscodium.exe', 'vscodium',
    'idea64.exe', 'pycharm64.exe', 'webstorm64.exe', 'rider64.exe', 'clion64.exe', 'devenv.exe',
    'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'explorer.exe', 'taskmgr.exe'
  ]), []);

  const rawProcesses: ProcessConnection[] = connections.processes || [];
  const processes: ProcessConnection[] = useMemo(() => {
    return rawProcesses.filter((proc: ProcessConnection) => {
      const name = (proc.name || '').toLowerCase();
      return !PROTECTED_PROCESS_SET.has(name) && !PROTECTED_PROCESS_SET.has(name.replace('.exe', ''));
    });
  }, [rawProcesses, PROTECTED_PROCESS_SET]);

  const dependencies = connections.dependencies || [];
  const dirtyFiles = git?.dirty_files || [];

  const secretIssues: SecretIssue[] = useMemo(() => {
    if (git?.secret_issues && git.secret_issues.length > 0) {
      return git.secret_issues;
    }
    if (git?.unprotected_env_files && git.unprotected_env_files.length > 0) {
      return git.unprotected_env_files.map((p) => ({
        path: p,
        name: p.split(/[\\/]/).pop() || p,
        category: 'env' as const,
        status: 'unignored' as const,
        risk: 'medium' as const,
        action: 'ignore' as const,
      }));
    }
    return [];
  }, [git?.secret_issues, git?.unprotected_env_files]);

  const trackedSecrets = useMemo(() => secretIssues.filter((s) => s.status === 'tracked'), [secretIssues]);
  const unignoredSecrets = useMemo(() => secretIssues.filter((s) => s.status === 'unignored'), [secretIssues]);
  const protectedSecrets = useMemo(() => secretIssues.filter((s) => s.status === 'protected'), [secretIssues]);
  const needsShieldingCount = trackedSecrets.length + unignoredSecrets.length;

  useEffect(() => {
    if (workspace?.name) {
      document.title = `${workspace.name} — Entropy`;
    }
    return () => {
      document.title = 'Entropy';
    };
  }, [workspace?.name]);

  const refreshStashes = useCallback(async () => {
    if (!workspace?.path) return;
    try {
      const list = await EntropyApiClient.getGitStashes(workspace.path);
      setStashes(list || []);
    } catch (err) {
      console.warn('Failed to load git stashes:', err);
    }
  }, [workspace.path]);

  useEffect(() => {
    let ignore = false;
    EntropyApiClient.getGitStashes(workspace.path)
      .then((list) => {
        if (!ignore && list) {
          setStashes(list);
        }
      })
      .catch((err) => {
        console.warn('Failed to load git stashes:', err);
      });
    return () => {
      ignore = true;
    };
  }, [workspace.path]);

  const activePorts: number[] = Array.from(
    new Set(processes.flatMap((p: ProcessConnection) => p.ports || []))
  ).sort((a: number, b: number) => a - b);

  const totalDependencyBytes = dependencies.reduce(
    (sum, d) => sum + (d.size_bytes || 0),
    0
  );

  /* ───────────────────────── Action Handlers ───────────────────────── */

  const handleLaunchEditor = async (editorId: string) => {
    const key = `editor-${editorId}`;
    setBusyAction(key);
    setActionResult(null);
    try {
      const res = await EntropyApiClient.launchIde(workspace.path, editorId);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || `Opened in ${editorId}.`) : (res.error || `Could not open in ${editorId}.`),
      });
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleConfirmClean = async () => {
    if (!cleanModal) return;
    setBusyAction('cleaning-deps');
    setActionResult(null);
    try {
      // If there are uncommitted changes and cleaning all, auto-stash safely
      if (git?.has_uncommitted_changes && cleanModal.isAll) {
        const stashRes = await EntropyApiClient.stashWorkspace(
          workspace.path,
          'Auto-stash before dependency cleaning'
        );
        if (!stashRes.success) {
          setActionResult({
            type: 'error',
            text: stashRes.error || 'Could not create safety stash before cleaning.',
          });
          setCleanModal(null);
          return;
        }
        await refreshStashes();
      }

      const res = await EntropyApiClient.cleanArtifacts(cleanModal.paths);
      if (res.success) {
        setActionResult({
          type: 'success',
          text: `Cleaned ${res.success_count || cleanModal.paths.length} dependency folder(s). Reclaimed ${formatSize(res.total_freed_bytes || cleanModal.totalSize)}.`,
        });
        await onActionComplete?.();
      } else {
        setActionResult({
          type: 'error',
          text: res.error || `Failed to clean ${res.failed_count || 0} folder(s).`,
        });
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setCleanModal(null);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleConfirmStash = async () => {
    setBusyAction('stashing');
    setActionResult(null);
    try {
      const note = customStashNote.trim() || undefined;
      const res = await EntropyApiClient.stashWorkspace(workspace.path, note);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || 'Unsaved work safely stashed.') : (res.error || 'Stash failed.'),
      });
      if (res.success) {
        await refreshStashes();
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setStashModalOpen(false);
      setCustomStashNote('');
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleConfirmPopStash = async () => {
    if (!popModal) return;
    setBusyAction(`pop-${popModal.index}`);
    setActionResult(null);
    try {
      const res = await EntropyApiClient.popGitStash(workspace.path, popModal.index);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || 'Stashed changes restored.') : (res.error || 'Failed to restore stash.'),
      });
      if (res.success) {
        await refreshStashes();
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setPopModal(null);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleConfirmDropStash = async () => {
    if (!dropModal) return;
    setBusyAction(`drop-${dropModal.index}`);
    setActionResult(null);
    try {
      const res = await EntropyApiClient.dropGitStash(workspace.path, dropModal.index);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || 'Stash discarded.') : (res.error || 'Failed to discard stash.'),
      });
      if (res.success) {
        await refreshStashes();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setDropModal(null);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleConfirmPruneBranches = async () => {
    setBusyAction('pruning-branches');
    setActionResult(null);
    try {
      const res = await EntropyApiClient.pruneMergedBranches(workspace.path, git?.merged_branches);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || 'Pruned merged local branches.') : (res.error || 'Failed to prune branches.'),
      });
      if (res.success) {
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setPruneModalOpen(false);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleConfirmStopProcess = async () => {
    if (!stopProcModal) return;
    setBusyAction(`stop-${stopProcModal.pid}`);
    setActionResult(null);
    try {
      const res = await EntropyApiClient.terminateProcess(stopProcModal.pid, true);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || `Stopped ${stopProcModal.name}.`) : (res.error || `Could not stop process.`),
      });
      if (res.success) {
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setStopProcModal(null);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleConfirmFreePort = async () => {
    if (!freePortModal) return;
    setBusyAction(`free-port-${freePortModal.port}`);
    setActionResult(null);
    try {
      const res = await EntropyApiClient.freePort(freePortModal.port, true);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || `Port ${freePortModal.port} freed.`) : (res.error || `Could not free port.`),
      });
      if (res.success) {
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setFreePortModal(null);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleAddToGitignore = async (pattern = '.env*') => {
    setBusyAction('gitignore');
    setActionResult(null);
    try {
      const res = await EntropyApiClient.addToGitignore(workspace.path, pattern);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || `Added ${pattern} to .gitignore`) : (res.error || 'Failed to update .gitignore'),
      });
      if (res.success) {
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleConfirmUntrackSecret = async () => {
    if (!untrackModal) return;
    setBusyAction(`untrack-${untrackModal.path}`);
    setActionResult(null);
    try {
      const res = await EntropyApiClient.untrackGitSecret(workspace.path, untrackModal.path);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success
          ? (res.message || `Untracked '${untrackModal.path}' from Git index. Local file preserved.`)
          : (res.error || 'Failed to untrack file.'),
      });
      if (res.success) {
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setUntrackModal(null);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleConfirmShieldAll = async () => {
    setBusyAction('shield-all');
    setActionResult(null);
    try {
      const res = await EntropyApiClient.shieldAllSecrets(workspace.path);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success
          ? (res.message || 'All secrets shielded. Local files preserved.')
          : (res.error || 'Failed to shield secrets.'),
      });
      if (res.success) {
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setShieldAllModalOpen(false);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto overflow-x-hidden w-full max-w-full bg-[var(--color-surface-0)] text-[var(--color-text-primary)]">
      {/* ── Top Navigation Bar ── */}
      <div className="sticky top-0 z-30 bg-[var(--color-surface-0)]/90 backdrop-blur-md border-b border-[var(--color-border-subtle)] px-4 sm:px-7 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer shrink-0 py-1 px-2 rounded-md hover:bg-[var(--color-surface-2)]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Workspaces</span>
            </button>
            <span className="text-[var(--color-text-tertiary)]/40 text-xs">/</span>
            <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
              {workspace.name}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenFolder && (
              <button
                type="button"
                onClick={onOpenFolder}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg transition-colors cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Open Folder…</span>
              </button>
            )}
            <button
              type="button"
              onClick={onReinspect}
              disabled={isLoading}
              className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Re-scan</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Status Toast Banner ── */}
      {actionResult && (
        <div className="max-w-6xl mx-auto px-4 sm:px-7 pt-4">
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
              actionResult.type === 'success'
                ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success)]'
                : 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger)]'
            }`}
          >
            <div className="flex items-center gap-2">
              {actionResult.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              <span className="font-medium">{actionResult.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionResult(null)}
              className="p-1 rounded hover:bg-white/10 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-6xl mx-auto px-4 sm:px-7 py-5 space-y-5 min-w-0 pb-24">
        {/* ── Header Card ── */}
        <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">
                  {workspace.name}
                </h1>
                <span className="text-xs font-medium text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-2.5 py-0.5 rounded-full border border-[var(--color-border-subtle)]">
                  {projectTypeLabel(workspace.project_type)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] mt-1.5 font-mono">
                <span className="truncate max-w-md">{workspace.path}</span>
                <CopyButton text={workspace.path} />
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="text-[11px] text-[var(--color-text-tertiary)] font-medium">Workspace Footprint</div>
                <div className="text-sm font-mono font-semibold text-[var(--color-text-primary)]">
                  {formatSize(workspace.total_size_bytes)}
                </div>
              </div>
            </div>
          </div>

          {/* Decoupled Status Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--color-border-subtle)]">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Process / Server State */}
              {activePorts.length > 0 ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
                  <span>Dev Server Online</span>
                  <span className="font-mono text-[11px] opacity-90">({activePorts.map((p) => `:${p}`).join(' ')})</span>
                </div>
              ) : processes.length > 0 ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
                  <span>{processes.length} process{processes.length > 1 ? 'es' : ''} active</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)] border border-[var(--color-border-subtle)] text-xs">
                  <Clock className="w-3.5 h-3.5" />
                  <span>No active background processes</span>
                </div>
              )}

              {/* Git Status Pill */}
              {dirtyFiles.length > 0 ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)] text-xs font-medium">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{dirtyFiles.length} unsaved file{dirtyFiles.length > 1 ? 's' : ''}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
                  <span>Working tree clean</span>
                </div>
              )}

              {/* Saved Stashes Pill */}
              {stashes.length > 0 && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-surface-3)] text-[var(--color-accent-strong)] border border-[var(--color-border-subtle)] text-xs font-medium">
                  <Archive className="w-3.5 h-3.5" />
                  <span>{stashes.length} saved stash{stashes.length > 1 ? 'es' : ''}</span>
                </div>
              )}
            </div>

            {/* Localhost Browser Links */}
            {activePorts.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {activePorts.map((port) => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => EntropyApiClient.openUrl(`http://localhost:${port}`)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-medium bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-success)] border border-[var(--color-success-border)] rounded-md transition-colors cursor-pointer"
                    title={`Open http://localhost:${port} in web browser`}
                  >
                    <Globe className="w-3 h-3" />
                    <span>:{port}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick Launchers (Safe, Harmless Actions) */}
          <div className="pt-2">
            <div className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
              Launch Workspace in Tool
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleLaunchEditor('code')}
                disabled={busyAction === 'editor-code'}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-sm"
              >
                <Code2 className="w-4 h-4" />
                <span>{busyAction === 'editor-code' ? 'Launching…' : 'Open in VS Code'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleLaunchEditor('cursor')}
                disabled={busyAction === 'editor-cursor'}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Code2 className="w-4 h-4 text-[var(--color-accent-strong)]" />
                <span>{busyAction === 'editor-cursor' ? 'Launching…' : 'Cursor'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleLaunchEditor('cmd')}
                disabled={busyAction === 'editor-cmd'}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <SquareTerminal className="w-4 h-4 text-[var(--color-warning)]" />
                <span>{busyAction === 'editor-cmd' ? 'Opening…' : 'CMD'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleLaunchEditor('explorer')}
                disabled={busyAction === 'editor-explorer'}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <FolderOpen className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                <span>{busyAction === 'editor-explorer' ? 'Opening…' : 'Explorer'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Workspace Advisor Card ── */}
        <WorkspaceAdvisorCard
          workspacePath={workspace.path}
          workspaceName={workspace.name}
          gitBranch={git?.current_branch}
          hasUncommittedChanges={git?.has_uncommitted_changes}
          ports={activePorts}
          artifacts={dependencies.map((d) => d.path)}
          onActionCompleted={onActionComplete}
          onNavigateToSettings={onNavigateToSettings}
        />

        {/* ── Git & Version Control Section ── */}
        {git && (
          <SectionCard
            icon={<GitBranch className="w-4 h-4 text-[var(--color-accent)]" />}
            title="Git Version Control & Safety"
            badge={
              git.has_remote && git.remote_repo_id ? (
                <a
                  href={`https://${git.remote_repo_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--color-accent-strong)] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>{git.remote_repo_id}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : undefined
            }
          >
            <div className="space-y-4">
              {/* Branch & Last Commit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-[var(--color-surface-2)] p-3.5 rounded-lg border border-[var(--color-border-subtle)]">
                <div>
                  <div className="text-[11px] text-[var(--color-text-tertiary)] font-medium mb-1">Active Branch</div>
                  <div className="font-mono text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                    <span>{git.current_branch || '—'}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[var(--color-text-tertiary)] font-medium mb-1">Last Commit</div>
                  <div className="font-medium text-[var(--color-text-primary)]">
                    {formatTimeAgo(git.last_commit_timestamp)}
                  </div>
                </div>
                {git.last_commit_message && (
                  <div className="col-span-1 sm:col-span-2 pt-2 border-t border-[var(--color-border-subtle)]">
                    <div className="text-[11px] text-[var(--color-text-tertiary)] font-medium mb-0.5">Commit Message</div>
                    <div className="text-xs text-[var(--color-text-secondary)] font-mono truncate">
                      {git.last_commit_message}
                    </div>
                  </div>
                )}
              </div>

              {/* Secret & Credentials Leak Shield */}
              <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-surface-3)] border border-[var(--color-border-subtle)] flex items-center justify-center">
                      <Shield className={`w-4 h-4 ${trackedSecrets.length > 0 ? 'text-[var(--color-danger)]' : unignoredSecrets.length > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}`} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                        Secret & Credentials Leak Shield
                      </h4>
                      <p className="text-[11px] text-[var(--color-text-tertiary)]">
                        Protects .env files, private keys, and API credentials from accidental Git exposure
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {trackedSecrets.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]">
                        {trackedSecrets.length} Tracked in Git
                      </span>
                    )}
                    {unignoredSecrets.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]">
                        {unignoredSecrets.length} Exposed
                      </span>
                    )}
                    {protectedSecrets.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                        {protectedSecrets.length} Protected
                      </span>
                    )}
                    {needsShieldingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShieldAllModalOpen(true)}
                        disabled={busyAction === 'shield-all'}
                        className="px-3 py-1.5 text-xs font-semibold bg-[var(--color-danger)] text-white hover:opacity-90 rounded-lg transition-opacity flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>Shield All Secrets</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Banner if there are high/medium risk items */}
                {trackedSecrets.length > 0 ? (
                  <div className="bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-lg p-3 flex items-start gap-2.5 text-xs text-[var(--color-danger)]">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">
                        Critical: {trackedSecrets.length} secret file(s) tracked in Git history
                      </div>
                      <div className="text-[11px] opacity-90 mt-0.5">
                        These credential files are committed or staged in Git. Use <strong>Untrack (Keep Local)</strong> to remove them from Git tracking with <code className="font-mono text-[10px]">git rm --cached</code> without deleting your files on disk.
                      </div>
                    </div>
                  </div>
                ) : unignoredSecrets.length > 0 ? (
                  <div className="bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] rounded-lg p-3 flex items-start gap-2.5 text-xs text-[var(--color-warning)]">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">
                        {unignoredSecrets.length} secret file(s) exposed on disk (unignored)
                      </div>
                      <div className="text-[11px] opacity-90 mt-0.5">
                        These credential files exist in your workspace and could accidentally be committed during a future commit. Add them to <code className="font-mono text-[10px]">.gitignore</code> to protect them.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[var(--color-surface-3)]/60 border border-[var(--color-border-subtle)] rounded-lg p-2.5 flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    <ShieldCheck className="w-4 h-4 text-[var(--color-success)] shrink-0" />
                    <span>Secret shield active: all detected credentials and .env files are safely ignored in .gitignore.</span>
                  </div>
                )}

                {/* Secret Files List */}
                {secretIssues.length > 0 ? (
                  <div className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] rounded-lg overflow-hidden bg-[var(--color-surface-1)]">
                    {secretIssues.map((issue) => {
                      const isTracked = issue.status === 'tracked';
                      const isUnignored = issue.status === 'unignored';
                      const isProtected = issue.status === 'protected';

                      return (
                        <div
                          key={issue.path}
                          className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-xs hover:bg-[var(--color-surface-2)]/60 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="shrink-0 text-[var(--color-text-tertiary)]">
                              {issue.category === 'env' ? (
                                <FileKey className="w-4 h-4 text-[var(--color-accent-strong)]" />
                              ) : issue.category === 'private_key' ? (
                                <KeyRound className="w-4 h-4 text-[var(--color-warning)]" />
                              ) : (
                                <Lock className="w-4 h-4 text-purple-400" />
                              )}
                            </span>
                            <span className="font-mono font-medium text-[var(--color-text-primary)] truncate">
                              {issue.path}
                            </span>
                            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)] border border-[var(--color-border-subtle)]">
                              {issue.category === 'env' ? '.env' : issue.category === 'private_key' ? 'key' : 'credential'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            {isTracked ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]">
                                <ShieldAlert className="w-3 h-3" />
                                <span>Tracked in Git</span>
                              </span>
                            ) : isUnignored ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Exposed locally</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                                <Check className="w-3 h-3" />
                                <span>Protected</span>
                              </span>
                            )}

                            {/* Actions per item */}
                            {isTracked ? (
                              <button
                                type="button"
                                onClick={() => setUntrackModal(issue)}
                                disabled={busyAction === `untrack-${issue.path}`}
                                className="px-2.5 py-1 text-xs font-medium bg-[var(--color-danger)] text-white hover:opacity-90 rounded-md transition-opacity cursor-pointer disabled:opacity-50"
                                title="Untrack from Git while keeping physical file on disk"
                              >
                                {busyAction === `untrack-${issue.path}` ? 'Untracking…' : 'Untrack (Keep Local)'}
                              </button>
                            ) : isUnignored ? (
                              <button
                                type="button"
                                onClick={() => handleAddToGitignore(issue.path)}
                                disabled={busyAction === 'gitignore'}
                                className="px-2.5 py-1 text-xs font-medium bg-[var(--color-surface-3)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-4)] border border-[var(--color-border-subtle)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
                                title="Add to .gitignore"
                              >
                                {busyAction === 'gitignore' ? 'Adding…' : 'Add to .gitignore'}
                              </button>
                            ) : (
                              <span className="text-[11px] text-[var(--color-text-tertiary)] italic px-1">
                                in .gitignore
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {/* Merged Branches */}
              {git.merged_branches && git.merged_branches.length > 0 && (
                <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
                      <GitMerge className="w-3.5 h-3.5 text-[var(--color-accent-strong)]" />
                      <span>{git.merged_branches.length} Merged Branch{git.merged_branches.length > 1 ? 'es' : ''} (Safe to prune)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPruneModalOpen(true)}
                      className="px-2.5 py-1 text-xs font-medium bg-[var(--color-surface-3)] text-[var(--color-accent-strong)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-4)] rounded-md transition-colors cursor-pointer"
                    >
                      Prune Merged Branches
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {git.merged_branches.map((b) => (
                      <span
                        key={b}
                        className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]"
                      >
                        <GitBranch className="w-3 h-3 text-[var(--color-text-tertiary)]" />
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Saved Stashes Drawer (Safe Local Storage) */}
              {stashes.length > 0 && (
                <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
                      <Archive className="w-4 h-4 text-[var(--color-accent-strong)]" />
                      <span>{stashes.length} Saved Stash{stashes.length > 1 ? 'es' : ''} (Safely Shelved Work)</span>
                    </div>
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">
                      Restoring brings your files back cleanly
                    </span>
                  </div>

                  <div className="space-y-2">
                    {stashes.map((s) => (
                      <div
                        key={s.index}
                        className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-lg"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[var(--color-text-primary)] truncate">
                            {s.message}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-tertiary)] font-mono mt-0.5">
                            {s.date} {s.branch ? `· branch ${s.branch}` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPopModal(s)}
                            disabled={busyAction === `pop-${s.index}`}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-[var(--color-surface-3)] text-[var(--color-accent-strong)] hover:bg-[var(--color-surface-4)] border border-[var(--color-border-subtle)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{busyAction === `pop-${s.index}` ? 'Restoring…' : 'Restore Changes'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDropModal(s)}
                            disabled={busyAction === `drop-${s.index}`}
                            className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors cursor-pointer disabled:opacity-50"
                            title="Discard stash entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dirty Files Panel */}
              {dirtyFiles.length > 0 && (
                <div className="pt-2">
                  <div className="bg-[var(--color-surface-2)] border border-[var(--color-warning-border)]/50 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-[var(--color-warning)] flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4" />
                          <span>{dirtyFiles.length} Unsaved File{dirtyFiles.length > 1 ? 's' : ''}</span>
                          {git.oldest_dirty_timestamp && (
                            <span className="text-[11px] font-normal text-[var(--color-text-tertiary)]">
                              (oldest {formatTimeAgo(git.oldest_dirty_timestamp)})
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                          Stash changes to safely store your edits in local Git storage before switching tasks or cleaning dependencies.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setCustomStashNote(`WIP in ${workspace.name} (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
                          setStashModalOpen(true);
                        }}
                        disabled={busyAction === 'stashing'}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)] hover:bg-[var(--color-warning-bg)]/80 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>{busyAction === 'stashing' ? 'Stashing…' : 'Safely Stash Working Tree'}</span>
                      </button>
                    </div>

                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {dirtyFiles.map((file: GitDirtyFile, i: number) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs py-1.5 px-2.5 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]"
                        >
                          <FileText className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] shrink-0" />
                          <span className="flex-1 font-mono text-[var(--color-text-secondary)] truncate">
                            {file.path}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                              file.status === 'modified'
                                ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
                                : file.status === 'untracked'
                                ? 'bg-[var(--color-info-bg)] text-[var(--color-info)]'
                                : file.status === 'deleted'
                                ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]'
                                : 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
                            }`}
                          >
                            {file.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* ── Dependencies & Build Targets Section ── */}
        {dependencies.length > 0 && (
          <SectionCard
            icon={<Package className="w-4 h-4 text-[var(--color-accent)]" />}
            title="Dependencies & Build Artifacts"
            badge={
              <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
                {formatSize(totalDependencyBytes)} reclaimable
              </span>
            }
            action={
              <button
                type="button"
                onClick={() =>
                  setCleanModal({
                    paths: dependencies.map((d) => d.path),
                    title: `Clean All Dependencies for ${workspace.name}?`,
                    totalSize: totalDependencyBytes,
                    rebuildHint: getRebuildHint(workspace.project_type, dependencies[0]?.dep_type || ''),
                    isAll: true,
                  })
                }
                disabled={busyAction === 'cleaning-deps'}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)] hover:bg-[var(--color-danger-bg)]/80 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clean All ({formatSize(totalDependencyBytes)})</span>
              </button>
            }
          >
            <div className="space-y-2.5">
              <p className="text-xs text-[var(--color-text-secondary)] mb-3">
                These folders contain downloaded packages and compiled binary targets. They are 100% disposable and safe to remove — your code and Git history are untouched.
              </p>

              {dependencies.map((dep, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 px-3.5 bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-lg gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Package className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--color-text-primary)] font-mono truncate">
                        {dep.dep_type === 'node_modules' ? 'node_modules' : dep.dep_type === 'venv' ? '.venv' : dep.dep_type}
                      </div>
                      <div className="text-xs text-[var(--color-text-tertiary)] font-mono">
                        {dep.package_count ? `${dep.package_count} packages · ` : ''}
                        {formatSize(dep.size_bytes)}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setCleanModal({
                        paths: [dep.path],
                        title: `Clean ${dep.dep_type}?`,
                        totalSize: dep.size_bytes || 0,
                        rebuildHint: getRebuildHint(workspace.project_type, dep.dep_type),
                        isAll: false,
                      })
                    }
                    disabled={busyAction === 'cleaning-deps'}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] border border-[var(--color-border-subtle)] rounded-md transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clean ({formatSize(dep.size_bytes)})</span>
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ── Active Dev Processes Section ── */}
        {processes.length > 0 && (
          <SectionCard
            icon={<Zap className="w-4 h-4 text-[var(--color-success)]" />}
            title={`Active Background Processes (${processes.length})`}
          >
            <div className="space-y-3">
              {processes.map((proc, i) => (
                <div
                  key={proc.entity_id || `${proc.pid}-${i}`}
                  className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          proc.ports && proc.ports.length > 0
                            ? 'bg-[var(--color-success)] animate-pulse'
                            : proc.is_shell
                            ? 'bg-[var(--color-text-tertiary)]'
                            : 'bg-[var(--color-accent)]'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--color-text-primary)] font-mono">
                            {proc.name}
                          </span>
                          <span className="text-[11px] font-mono text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-1.5 py-0.5 rounded">
                            PID {proc.pid}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--color-text-tertiary)] font-mono truncate max-w-lg mt-0.5" title={proc.cmdline_preview || ''}>
                          {proc.cmdline_preview || proc.exe_path || '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-3)] px-2 py-0.5 rounded border border-[var(--color-border-subtle)]">
                        {formatSize(proc.memory_bytes)} RAM
                      </span>
                    </div>
                  </div>

                  {/* CWD if different */}
                  {proc.cwd && (
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] font-mono bg-[var(--color-surface-1)] px-2.5 py-1 rounded border border-[var(--color-border-subtle)]">
                      <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)]/70">CWD</span>
                      <span className="truncate flex-1" title={proc.cwd}>{proc.cwd}</span>
                      <CopyButton text={proc.cwd} />
                    </div>
                  )}

                  {/* Action Cluster */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Port pills */}
                      {proc.ports && proc.ports.length > 0 && proc.ports.map((port) => (
                        <div key={port} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => EntropyApiClient.openUrl(`http://localhost:${port}`)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] rounded-md hover:bg-[var(--color-success-bg)]/80 transition-colors cursor-pointer"
                            title={`Open http://localhost:${port} in web browser`}
                          >
                            <Globe className="w-3 h-3 text-[var(--color-success)]" />
                            <span>:{port}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setFreePortModal({ port, proc })}
                            className="px-2 py-1 text-xs font-medium text-[var(--color-warning)] hover:bg-[var(--color-warning-bg)] rounded-md border border-transparent hover:border-[var(--color-warning-border)] transition-colors cursor-pointer"
                            title={`Terminate process holding port ${port}`}
                          >
                            Free Port
                          </button>
                        </div>
                      ))}

                      {proc.cwd && (
                        <>
                          <button
                            type="button"
                            onClick={() => EntropyApiClient.openInCmd(proc.cwd!)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-warning)] hover:bg-[var(--color-surface-3)] rounded-md transition-colors cursor-pointer"
                            title="Open Command Prompt (CMD)"
                          >
                            <SquareTerminal className="w-3 h-3 text-[var(--color-warning)]" />
                            <span>CMD</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => EntropyApiClient.openInExplorer(proc.cwd!)}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] rounded-md transition-colors cursor-pointer"
                          >
                            <FolderOpen className="w-3 h-3" />
                            <span>Explorer</span>
                          </button>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setStopProcModal(proc)}
                      disabled={busyAction === `stop-${proc.pid}`}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] border border-transparent hover:border-[var(--color-danger-border)] rounded-md transition-colors cursor-pointer disabled:opacity-50 ml-auto"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Stop Process</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        <div className="h-6" />
      </div>

      {/* ───────────────────────── Safety Modals ───────────────────────── */}

      {/* 1. Clean Dependencies Confirmation Modal */}
      {cleanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-[var(--color-danger)]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  {cleanModal.title}
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Reclaim <strong className="text-[var(--color-text-primary)]">{formatSize(cleanModal.totalSize)}</strong> by deleting build artifacts.
                </p>
              </div>
            </div>

            <div className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-xl p-3.5 space-y-2 text-xs">
              <div className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Safety Guarantee
              </div>
              <div className="space-y-1.5 text-[var(--color-text-secondary)]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)] shrink-0" />
                  <span>Your source code, configuration, and Git history are 100% untouched.</span>
                </div>
                {git?.has_uncommitted_changes && cleanModal.isAll && (
                  <div className="flex items-center gap-2 text-[var(--color-warning)]">
                    <Shield className="w-3.5 h-3.5 text-[var(--color-warning)] shrink-0" />
                    <span>Your {dirtyFiles.length} unsaved file(s) will be automatically stashed first so nothing is lost.</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-[var(--color-accent-strong)] shrink-0" />
                  <span>{cleanModal.rebuildHint}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Folders to Delete:
              </div>
              <div className="max-h-28 overflow-y-auto space-y-1">
                {cleanModal.paths.map((p, idx) => (
                  <div key={idx} className="text-xs font-mono text-[var(--color-text-secondary)] truncate bg-[var(--color-surface-2)] px-2 py-1 rounded">
                    {p}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setCleanModal(null)}
                disabled={busyAction === 'cleaning-deps'}
                className="px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClean}
                disabled={busyAction === 'cleaning-deps'}
                className="px-4 py-2 text-xs font-medium bg-[var(--color-danger)] text-white hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-50"
              >
                {busyAction === 'cleaning-deps' ? 'Deleting…' : `Clean ${formatSize(cleanModal.totalSize)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Stash Changes Modal */}
      {stashModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-[var(--color-warning)]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Stash Working Tree Edits?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Shelves your {dirtyFiles.length} unsaved file(s) into safe local Git storage.
                </p>
              </div>
            </div>

            <div className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] p-3 rounded-lg border border-[var(--color-border-subtle)] space-y-1.5">
              <div className="flex items-center gap-2 text-[var(--color-text-primary)] font-medium">
                <Info className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                <span>How Stashing Works</span>
              </div>
              <p>
                Your changes are cleanly removed from disk and stored in Git memory. You can restore them anytime using the <strong>Restore Changes</strong> button in the Git section.
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1.5">
                Stash Note (Optional)
              </label>
              <input
                type="text"
                value={customStashNote}
                onChange={(e) => setCustomStashNote(e.target.value)}
                placeholder="e.g. Work in progress before clean"
                className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setStashModalOpen(false)}
                disabled={busyAction === 'stashing'}
                className="px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStash}
                disabled={busyAction === 'stashing'}
                className="px-4 py-2 text-xs font-medium bg-[var(--color-warning)] text-black font-semibold hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-50"
              >
                {busyAction === 'stashing' ? 'Stashing…' : 'Safely Stash Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Restore Stash Modal */}
      {popModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-accent-muted)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-[var(--color-accent-strong)]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Restore Stashed Work?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 truncate">
                  "{popModal.message}" ({popModal.date})
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] p-3 rounded-lg border border-[var(--color-border-subtle)]">
              This will reapply all files from this stash back into your working directory. Once restored, this stash will be removed from saved storage.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setPopModal(null)}
                className="px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPopStash}
                className="px-4 py-2 text-xs font-medium bg-[var(--color-accent)] text-white hover:opacity-90 rounded-lg transition-opacity cursor-pointer"
              >
                Restore Files Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Drop Stash Modal */}
      {dropModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-[var(--color-danger)]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Permanently Discard Stash?
                </h3>
                <p className="text-xs text-[var(--color-danger)] mt-1">
                  "{dropModal.message}"
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] p-3 rounded-lg border border-[var(--color-border-subtle)]">
              Warning: This will permanently delete this stash entry from Git. This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setDropModal(null)}
                className="px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDropStash}
                className="px-4 py-2 text-xs font-medium bg-[var(--color-danger)] text-white hover:opacity-90 rounded-lg transition-opacity cursor-pointer"
              >
                Discard Stash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Prune Branches Modal */}
      {pruneModalOpen && git?.merged_branches && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-accent-muted)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                <GitMerge className="w-5 h-5 text-[var(--color-accent-strong)]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Prune Merged Local Branches?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Remove {git.merged_branches.length} branch(es) that have already been integrated into {git.current_branch || 'main'}.
                </p>
              </div>
            </div>

            <div className="bg-[var(--color-surface-2)] p-3 rounded-lg border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] space-y-1.5">
              <div className="flex items-center gap-1.5 text-[var(--color-success)] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Zero Risk to Remote Repositories</span>
              </div>
              <p>
                Only local branch pointers will be deleted. Remote branches on GitHub or GitLab will NOT be touched.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {git.merged_branches.map((b) => (
                <span key={b} className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-primary)] border border-[var(--color-border-subtle)]">
                  {b}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setPruneModalOpen(false)}
                disabled={busyAction === 'pruning-branches'}
                className="px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPruneBranches}
                disabled={busyAction === 'pruning-branches'}
                className="px-4 py-2 text-xs font-medium bg-[var(--color-accent)] text-white hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-50"
              >
                {busyAction === 'pruning-branches' ? 'Pruning…' : 'Prune Local Branches'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Stop Process Modal */}
      {stopProcModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5 text-[var(--color-danger)]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Stop Process: {stopProcModal.name}?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 font-mono">
                  PID {stopProcModal.pid} · {formatSize(stopProcModal.memory_bytes)} RAM
                </p>
              </div>
            </div>

            {stopProcModal.ports && stopProcModal.ports.length > 0 && (
              <div className="text-xs text-[var(--color-warning)] bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] p-3 rounded-lg">
                This will shut down the server actively listening on port(s): {stopProcModal.ports.join(', ')}.
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setStopProcModal(null)}
                className="px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStopProcess}
                className="px-4 py-2 text-xs font-medium bg-[var(--color-danger)] text-white hover:opacity-90 rounded-lg transition-opacity cursor-pointer"
              >
                Terminate Process
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Free Port Modal */}
      {freePortModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-[var(--color-warning)]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Free TCP Port {freePortModal.port}?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 font-mono">
                  Occupied by {freePortModal.proc.name} (PID {freePortModal.proc.pid})
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] p-3 rounded-lg border border-[var(--color-border-subtle)]">
              Terminating this process will free port {freePortModal.port} so other servers can bind to it.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setFreePortModal(null)}
                className="px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFreePort}
                className="px-4 py-2 text-xs font-medium bg-[var(--color-warning)] text-black font-semibold hover:opacity-90 rounded-lg transition-opacity cursor-pointer"
              >
                Free Port & Terminate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Untrack Secret Modal */}
      {untrackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-[var(--color-danger)]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Untrack Secret from Git?
                </h3>
                <p className="text-xs font-mono text-[var(--color-text-tertiary)] mt-1 truncate">
                  {untrackModal.path}
                </p>
              </div>
            </div>

            <div className="p-3 bg-[var(--color-surface-2)] rounded-lg border border-[var(--color-border-subtle)] space-y-2 text-xs text-[var(--color-text-secondary)]">
              <div className="font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--color-success)]" />
                <span>Zero Data Loss Guarantee</span>
              </div>
              <p>
                Runs <code className="font-mono text-[11px] text-[var(--color-accent-strong)]">git rm --cached</code> and adds this file to <code className="font-mono text-[11px]">.gitignore</code>.
              </p>
              <p className="text-[var(--color-success)] font-medium">
                ✓ Your physical file, API keys, and passwords on disk remain 100% untouched.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setUntrackModal(null)}
                className="px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmUntrackSecret}
                disabled={busyAction === `untrack-${untrackModal.path}`}
                className="px-4 py-2 text-xs font-semibold bg-[var(--color-danger)] text-white hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-50"
              >
                {busyAction === `untrack-${untrackModal.path}` ? 'Untracking…' : 'Untrack Secret (Keep File)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Shield All Secrets Modal */}
      {shieldAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5 text-[var(--color-danger)]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Shield All Secrets in Repository?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Batch protect all {needsShieldingCount} exposed and tracked credential file(s).
                </p>
              </div>
            </div>

            <div className="p-3 bg-[var(--color-surface-2)] rounded-lg border border-[var(--color-border-subtle)] space-y-2 text-xs text-[var(--color-text-secondary)]">
              <div className="font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--color-success)]" />
                <span>Zero Data Loss Guarantee</span>
              </div>
              <ul className="space-y-1 list-disc list-inside">
                {trackedSecrets.length > 0 && (
                  <li>
                    Untracks {trackedSecrets.length} file(s) from Git index via <code className="font-mono text-[11px]">git rm --cached</code>
                  </li>
                )}
                <li>
                  Adds protection rules (<code className="font-mono text-[11px]">.env*</code>, <code className="font-mono text-[11px]">*.key</code>, <code className="font-mono text-[11px]">*.pem</code>, <code className="font-mono text-[11px]">*credentials*.json</code>) to <code className="font-mono text-[11px]">.gitignore</code>
                </li>
                <li className="text-[var(--color-success)] font-medium">
                  All local credential files and keys on disk remain 100% untouched
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setShieldAllModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmShieldAll}
                disabled={busyAction === 'shield-all'}
                className="px-4 py-2 text-xs font-semibold bg-[var(--color-danger)] text-white hover:opacity-90 rounded-lg transition-opacity cursor-pointer disabled:opacity-50"
              >
                {busyAction === 'shield-all' ? 'Shielding…' : 'Shield All Secrets Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

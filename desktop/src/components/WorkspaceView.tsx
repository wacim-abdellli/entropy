import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  GitBranch,
  Code2,
  Terminal,
  FolderOpen,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Package,
  Trash2,
  FileText,
  Zap,
  Shield,
  Copy,
  Check,
  XCircle,
} from 'lucide-react';
import { WorkspaceInspection, GitDirtyFile, DependencyConnection, ProcessConnection } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

/* ───────────────────────── Types ───────────────────────── */

interface WorkspaceViewProps {
  inspection: WorkspaceInspection;
  onBack: () => void;
  onReinspect: () => void;
  isLoading: boolean;
  onActionComplete?: () => Promise<void> | void;
  onOpenFolder?: () => void;
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function statusEmoji(category: string, hasChanges: boolean, processCount: number): {
  icon: React.ReactNode;
  label: string;
  color: string;
} {
  if (hasChanges) {
    return {
      icon: <AlertTriangle className="w-5 h-5 text-amber-400" />,
      label: 'Has unsaved changes',
      color: 'text-amber-400',
    };
  }
  if (processCount > 0) {
    return {
      icon: <Zap className="w-5 h-5 text-emerald-400" />,
      label: `Active · ${processCount} process${processCount > 1 ? 'es' : ''} running`,
      color: 'text-emerald-400',
    };
  }
  if (category === 'dormant') {
    return {
      icon: <Clock className="w-5 h-5 text-slate-400" />,
      label: 'Inactive',
      color: 'text-slate-400',
    };
  }
  return {
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
    label: 'Clean',
    color: 'text-emerald-400',
  };
}

/* ───────────────────────── Sub-components ───────────────────────── */

const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon, title, badge, children }) => (
  <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg overflow-hidden">
    <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-subtle)]">
      <div className="flex items-center gap-2.5">
        <span className="text-[var(--color-text-tertiary)]">{icon}</span>
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
      </div>
      {badge}
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
      className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer p-1"
      title="Copy path"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
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
}) => {
  const [stashLoading, setStashLoading] = useState(false);
  const [cleaningPaths, setCleaningPaths] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const { workspace, state, connections } = inspection;
  const git = connections.git;
  const processes = connections.processes || [];
  const dependencies = connections.dependencies || [];
  const dirtyFiles = git?.dirty_files || [];

  useEffect(() => {
    if (workspace?.name) {
      document.title = `${workspace.name} — Entropy`;
    }
    return () => {
      document.title = 'Entropy';
    };
  }, [workspace?.name]);

  const status = statusEmoji(
    state.category,
    git?.has_uncommitted_changes || false,
    processes.length
  );

  const handleStash = async () => {
    setStashLoading(true);
    setActionResult(null);
    try {
      const res = await EntropyApiClient.stashWorkspace(workspace.path);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || 'Changes stashed safely.') : (res.error || 'Stash failed.'),
      });
      if (res.success) {
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setStashLoading(false);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleCleanDep = async (dep: DependencyConnection) => {
    setCleaningPaths((prev) => new Set(prev).add(dep.path));
    setActionResult(null);
    try {
      const res = await EntropyApiClient.cleanArtifact(dep.path);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success
          ? (res.message || `Cleaned ${dep.dep_type}.`)
          : (res.error || `Could not clean ${dep.dep_type}.`),
      });
      if (res.success) {
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setCleaningPaths((prev) => {
        const next = new Set(prev);
        next.delete(dep.path);
        return next;
      });
      setTimeout(() => setActionResult(null), 4500);
    }
  };

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

  const handleCleanAllDeps = async () => {
    if (dependencies.length === 0) return;
    setBusyAction('clean-all-deps');
    setActionResult(null);
    try {
      if (git?.has_uncommitted_changes) {
        const stash = await EntropyApiClient.stashWorkspace(workspace.path);
        if (!stash.success) {
          setActionResult({ type: 'error', text: stash.error || 'Could not stash changes before cleaning.' });
          return;
        }
      }

      const result = await EntropyApiClient.cleanArtifacts(dependencies.map((dep) => dep.path));
      if (result.success) {
        setActionResult({
          type: 'success',
          text: git?.has_uncommitted_changes
            ? 'Stashed changes and cleaned dependencies.'
            : `Cleaned ${result.success_count || dependencies.length} dependency folder${dependencies.length === 1 ? '' : 's'}.`,
        });
        await onActionComplete?.();
      } else {
        setActionResult({
          type: 'error',
          text: `Cleaned ${result.success_count || 0}, failed ${result.failed_count || 0}.`,
        });
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setBusyAction(null);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handleStopProcess = async (proc: ProcessConnection) => {
    const key = `stop-${proc.pid}`;
    setBusyAction(key);
    setActionResult(null);
    try {
      const res = await EntropyApiClient.terminateProcess(proc.pid, true);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || `Stopped ${proc.name}.`) : (res.error || `Could not stop ${proc.name}.`),
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

  const handleFreePort = async (proc: ProcessConnection, port: number) => {
    const key = `port-${port}`;
    setBusyAction(key);
    setActionResult(null);
    try {
      const res = await EntropyApiClient.freePort(port, true);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || `Freed port ${port}.`) : (res.error || `Could not free port ${port}.`),
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--color-surface-0)] animate-enter">
      {/* Top bar */}
      <div className="h-14 flex items-center justify-between px-7 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-0)] shrink-0 gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] px-2 py-1 rounded transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Workspaces
          </button>
          <span className="text-[var(--color-text-tertiary)] text-xs select-none">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
              {workspace.name}
            </span>
            <span
              className="text-xs font-mono text-[var(--color-text-tertiary)] truncate hidden md:inline max-w-xs lg:max-w-md"
              title={workspace.path}
            >
              {workspace.path}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenFolder && (
            <button
              type="button"
              onClick={onOpenFolder}
              className="h-8 flex items-center gap-2 px-2.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] rounded-md transition-colors cursor-pointer"
              title="Open another folder in File Explorer"
            >
              <FolderOpen className="w-4 h-4" />
              Open folder…
            </button>
          )}
          <button
            type="button"
            onClick={onReinspect}
            disabled={isLoading}
            className="h-8 flex items-center gap-2 px-2.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Re-scan
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {actionResult && (
          <div className="sticky top-0 z-20 px-6 pt-3 pb-1">
            <div
              className={`max-w-4xl mx-auto flex items-start justify-between gap-3 rounded-lg border p-3 text-xs shadow-lg backdrop-blur-md transition-all ${
                actionResult.type === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-950/90 border-rose-500/30 text-rose-200'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                {actionResult.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                )}
                <div className="min-w-0 max-h-36 overflow-y-auto pr-2 flex-1">
                  <p className="font-medium whitespace-pre-wrap leading-relaxed select-text font-mono text-[11px]">
                    {actionResult.text}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActionResult(null)}
                className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer shrink-0"
                title="Dismiss"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <div className="max-w-6xl mx-auto px-7 py-6 space-y-5">

          {/* ── Header Card ── */}
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h1 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
                  {workspace.name}
                </h1>
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-tertiary)]">
                  <span className="font-mono text-xs">{workspace.path}</span>
                  <CopyButton text={workspace.path} />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-medium text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-2.5 py-1 rounded-md">
                  {projectTypeLabel(workspace.project_type)}
                </span>
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  {formatSize(workspace.total_size_bytes)}
                </span>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2 mb-4">
              {status.icon}
              <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleLaunchEditor('code')}
                disabled={busyAction === 'editor-code'}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-accent)] text-white rounded-md hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Code2 className="w-4 h-4" />
                {busyAction === 'editor-code' ? 'Opening...' : 'Open in VS Code'}
              </button>
              <button
                type="button"
                onClick={() => handleLaunchEditor('cursor')}
                disabled={busyAction === 'editor-cursor'}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                <Code2 className="w-4 h-4" />
                {busyAction === 'editor-cursor' ? 'Opening...' : 'Cursor'}
              </button>
              <button
                type="button"
                onClick={() => EntropyApiClient.openInTerminal(workspace.path)}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] rounded-md transition-colors cursor-pointer"
              >
                <Terminal className="w-4 h-4" />
                Terminal
              </button>
              <button
                type="button"
                onClick={() => EntropyApiClient.openInExplorer(workspace.path)}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] rounded-md transition-colors cursor-pointer"
              >
                <FolderOpen className="w-4 h-4" />
                Explorer
              </button>
              {dirtyFiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleStash}
                  disabled={stashLoading}
                  className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)] hover:bg-amber-500/20 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Shield className="w-4 h-4" />
                  {stashLoading ? 'Stashing...' : 'Stash Changes'}
                </button>
              )}
              {dependencies.length > 0 && (
                <button
                  type="button"
                  onClick={handleCleanAllDeps}
                  disabled={busyAction === 'clean-all-deps'}
                  className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)] hover:bg-rose-500/20 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  {busyAction === 'clean-all-deps'
                    ? 'Cleaning...'
                    : git?.has_uncommitted_changes
                    ? 'Stash & Clean'
                    : 'Clean Dependencies'}
                </button>
              )}
            </div>
          </div>

          {/* ── Git Section ── */}
          {git && (
            <SectionCard
              icon={<GitBranch className="w-4 h-4" />}
              title="Git"
              badge={
                git.has_remote ? (
                  <a
                    href={`https://${git.remote_repo_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-[var(--color-accent-strong)] hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {git.remote_repo_id}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : undefined
              }
            >
              <div className="space-y-3">
                {/* Branch + commit info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-[var(--color-text-tertiary)] mb-0.5">Branch</div>
                    <div className="font-medium text-[var(--color-text-primary)]">{git.current_branch || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--color-text-tertiary)] mb-0.5">Last Commit</div>
                    <div className="font-medium text-[var(--color-text-primary)]">
                      {formatTimeAgo(git.last_commit_timestamp)}
                    </div>
                  </div>
                  {git.last_commit_message && (
                    <div className="col-span-2">
                      <div className="text-xs text-[var(--color-text-tertiary)] mb-0.5">Message</div>
                      <div className="text-sm text-[var(--color-text-secondary)] font-mono truncate">
                        {git.last_commit_message}
                      </div>
                    </div>
                  )}
                </div>

                {/* Dirty files */}
                {dirtyFiles.length > 0 && (
                  <div className="pt-3 border-t border-[var(--color-border-subtle)]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-amber-400 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {dirtyFiles.length} unsaved file{dirtyFiles.length > 1 ? 's' : ''}
                      </span>
                      <button
                        type="button"
                        onClick={handleStash}
                        disabled={stashLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--color-accent)] text-white rounded-lg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                      >
                        <Shield className="w-3 h-3" />
                        {stashLoading ? 'Stashing…' : 'Stash All'}
                      </button>
                    </div>

                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {dirtyFiles.map((file: GitDirtyFile, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-[var(--color-surface-2)]">
                          <FileText className="w-3 h-3 text-[var(--color-text-tertiary)]" />
                          <span className="flex-1 font-mono text-[var(--color-text-secondary)] truncate">
                            {file.path}
                          </span>
                          <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
                            file.status === 'modified' ? 'bg-amber-500/15 text-amber-400' :
                            file.status === 'untracked' ? 'bg-sky-500/15 text-sky-400' :
                            file.status === 'deleted' ? 'bg-rose-500/15 text-rose-400' :
                            'bg-emerald-500/15 text-emerald-400'
                          }`}>
                            {file.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* ── Dependencies Section ── */}
          {dependencies.length > 0 && (
            <SectionCard
              icon={<Package className="w-4 h-4" />}
              title="Dependencies"
            >
              <div className="space-y-3">
                {dependencies.map((dep, i) => (
                  <div key={i} className="flex items-center justify-between py-2 px-3 bg-[var(--color-surface-2)] rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <Package className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                          {dep.dep_type === 'node_modules' ? 'node_modules' :
                           dep.dep_type === 'venv' ? '.venv' :
                           dep.dep_type}
                        </div>
                        <div className="text-xs text-[var(--color-text-tertiary)]">
                          {dep.package_count ? `${dep.package_count} packages · ` : ''}{formatSize(dep.size_bytes)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCleanDep(dep)}
                      disabled={cleaningPaths.has(dep.path)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                      {cleaningPaths.has(dep.path) ? 'Cleaning…' : `Clean (${formatSize(dep.size_bytes)})`}
                    </button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ── Processes Section ── */}
          {processes.length > 0 && (
            <SectionCard
              icon={<Zap className="w-4 h-4" />}
              title={`Active Processes (${processes.length})`}
            >
              <div className="space-y-3">
                {processes.map((proc, i) => (
                  <div key={proc.entity_id || `${proc.pid}-${i}`} className="bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-lg p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 mt-2 ${proc.is_shell ? 'bg-slate-400' : 'bg-emerald-400'}`} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                            {proc.name}
                            <span className="text-[var(--color-text-tertiary)] font-normal ml-2">PID {proc.pid}</span>
                          </div>
                          <div className="text-xs text-[var(--color-text-tertiary)] font-mono truncate">
                            {proc.cmdline_preview || proc.exe_path || '—'}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">
                        {formatSize(proc.memory_bytes)}
                      </span>
                    </div>

                    {proc.cwd && (
                      <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
                        <span className="font-mono truncate flex-1" title={proc.cwd}>{proc.cwd}</span>
                        <CopyButton text={proc.cwd} />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {proc.ports && proc.ports.length > 0 && proc.ports.map((port) => (
                        <button
                          key={port}
                          type="button"
                          onClick={() => handleFreePort(proc, port)}
                          disabled={busyAction === `port-${port}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/25 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer disabled:opacity-50"
                          title={`Stop the process listening on port ${port}`}
                        >
                          <Zap className="w-3 h-3" />
                          {busyAction === `port-${port}` ? `Freeing ${port}...` : `Free Port ${port}`}
                        </button>
                      ))}
                      {proc.cwd && (
                        <>
                          <button
                            type="button"
                            onClick={() => EntropyApiClient.openInTerminal(proc.cwd!)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-4)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer"
                          >
                            <Terminal className="w-3 h-3" />
                            Terminal Here
                          </button>
                          <button
                            type="button"
                            onClick={() => EntropyApiClient.openInExplorer(proc.cwd!)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-4)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer"
                          >
                            <FolderOpen className="w-3 h-3" />
                            Open Folder
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStopProcess(proc)}
                        disabled={busyAction === `stop-${proc.pid}`}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/25 rounded-lg hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-3 h-3" />
                        {busyAction === `stop-${proc.pid}` ? 'Stopping...' : 'Stop Process'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Bottom padding */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
};

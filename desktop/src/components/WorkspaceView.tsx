import React, { useState, useEffect } from 'react';
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
  GitMerge,
  Copy,
  Check,
  XCircle,
} from 'lucide-react';
import { WorkspaceInspection, GitDirtyFile, DependencyConnection, ProcessConnection } from '../types/entropy';
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
      icon: <AlertTriangle className="w-5 h-5 text-[var(--color-warning)]" />,
      label: 'Has unsaved changes',
      color: 'text-[var(--color-warning)]',
    };
  }
  if (processCount > 0) {
    return {
      icon: <Zap className="w-5 h-5 text-[var(--color-success)]" />,
      label: `Active · ${processCount} process${processCount > 1 ? 'es' : ''} running`,
      color: 'text-[var(--color-success)]',
    };
  }
  if (category === 'dormant') {
    return {
      icon: <Clock className="w-5 h-5 text-[var(--color-text-tertiary)]" />,
      label: 'Inactive',
      color: 'text-[var(--color-text-tertiary)]',
    };
  }
  return {
    icon: <CheckCircle2 className="w-5 h-5 text-[var(--color-success)]" />,
    label: 'Clean',
    color: 'text-[var(--color-success)]',
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

  const activePorts = Array.from(
    new Set(processes.flatMap((p) => p.ports || []))
  ).sort((a, b) => a - b);

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

  const [gitActionLoading, setGitActionLoading] = useState(false);

  const handleAddToGitignore = async (pattern = '.env*') => {
    setGitActionLoading(true);
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
      setGitActionLoading(false);
      setTimeout(() => setActionResult(null), 4500);
    }
  };

  const handlePruneMergedBranches = async (branches?: string[]) => {
    setGitActionLoading(true);
    setActionResult(null);
    try {
      const res = await EntropyApiClient.pruneMergedBranches(workspace.path, branches);
      setActionResult({
        type: res.success ? 'success' : 'error',
        text: res.success ? (res.message || 'Pruned merged branches.') : (res.error || 'Failed to prune branches.'),
      });
      if (res.success) {
        await onActionComplete?.();
      }
    } catch (err: unknown) {
      setActionResult({ type: 'error', text: errorMessage(err) });
    } finally {
      setGitActionLoading(false);
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden w-full max-w-full">
        {actionResult && (
          <div className="sticky top-0 z-20 px-6 pt-3 pb-1">
            <div
              className={`max-w-4xl mx-auto flex items-start justify-between gap-3 rounded-lg border p-3 text-xs shadow-lg backdrop-blur-md transition-all ${
                actionResult.type === 'success'
                  ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success)]'
                  : 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger)]'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                {actionResult.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--color-success)] mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-[var(--color-danger)] mt-0.5" />
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
                aria-label="Dismiss notice"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <div className="w-full max-w-6xl mx-auto px-4 sm:px-7 py-6 space-y-5 min-w-0">

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
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                {status.icon}
                <span className={`text-sm font-medium ${status.color}`}>{status.label}</span>
              </div>
              {activePorts.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--color-text-tertiary)] font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
                    Localhost:
                  </span>
                  {activePorts.map((port) => (
                    <button
                      key={port}
                      type="button"
                      onClick={() => EntropyApiClient.openUrl(`http://localhost:${port}`)}
                      title={`Open http://localhost:${port} in default browser`}
                      aria-label={`Open localhost port ${port} in default browser`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] hover:bg-[var(--color-success-bg)]/80 rounded-md transition-colors cursor-pointer"
                    >
                      <Globe className="w-3 h-3 text-[var(--color-success)]" />
                      :{port}
                      <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleLaunchEditor('code')}
                disabled={busyAction === 'editor-code'}
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-accent)] text-white rounded-md hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
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
                onClick={() => handleLaunchEditor('terminal')}
                disabled={busyAction === 'editor-terminal'}
                title="Open in Windows Terminal (or PowerShell)"
                aria-label="Open in Windows Terminal"
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                <Terminal className="w-4 h-4" />
                {busyAction === 'editor-terminal' ? 'Opening...' : 'Terminal'}
              </button>
              <button
                type="button"
                onClick={() => handleLaunchEditor('powershell')}
                disabled={busyAction === 'editor-powershell'}
                title="Open in PowerShell"
                aria-label="Open in PowerShell"
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                <Terminal className="w-4 h-4 text-[var(--color-accent-strong)]" />
                {busyAction === 'editor-powershell' ? 'Opening...' : 'PowerShell'}
              </button>
              <button
                type="button"
                onClick={() => handleLaunchEditor('cmd')}
                disabled={busyAction === 'editor-cmd'}
                title="Open in Command Prompt (CMD)"
                aria-label="Open in Command Prompt"
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                <SquareTerminal className="w-4 h-4 text-[var(--color-warning)]" />
                {busyAction === 'editor-cmd' ? 'Opening...' : 'CMD'}
              </button>
              <button
                type="button"
                onClick={() => handleLaunchEditor('explorer')}
                disabled={busyAction === 'editor-explorer'}
                title="Open in Windows File Explorer"
                aria-label="Open in File Explorer"
                className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text-primary)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                <FolderOpen className="w-4 h-4" />
                {busyAction === 'editor-explorer' ? 'Opening...' : 'Explorer'}
              </button>
              {dirtyFiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleStash}
                  disabled={stashLoading}
                  className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)] hover:bg-[var(--color-warning-bg)]/80 rounded-md transition-colors cursor-pointer disabled:opacity-50"
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
                  className="h-8 flex items-center gap-1.5 px-3 text-xs font-medium bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)] hover:bg-[var(--color-danger-bg)]/80 rounded-md transition-colors cursor-pointer disabled:opacity-50"
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

                {/* Secret Leak Warning */}
                {git.unprotected_env_files && git.unprotected_env_files.length > 0 && (
                  <div className="bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="w-4 h-4 text-[var(--color-danger)] mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold text-[var(--color-danger)]">
                          Secret Leak Alert: Unprotected {git.unprotected_env_files.join(', ')}
                        </div>
                        <div className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                          This environment file is NOT ignored by Git and could accidentally be committed to version control.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddToGitignore('.env*')}
                      disabled={gitActionLoading}
                      className="shrink-0 px-2.5 py-1 text-xs font-medium bg-[var(--color-danger)] hover:opacity-90 text-white rounded-md transition-opacity cursor-pointer disabled:opacity-50"
                    >
                      {gitActionLoading ? 'Adding...' : 'Add to .gitignore'}
                    </button>
                  </div>
                )}

                {/* Merged Branches */}
                {git.merged_branches && git.merged_branches.length > 0 && (
                  <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
                        <GitMerge className="w-3.5 h-3.5 text-[var(--color-accent-strong)]" />
                        <span>{git.merged_branches.length} Merged Branch{git.merged_branches.length > 1 ? 'es' : ''} (Safe to prune)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePruneMergedBranches(git.merged_branches)}
                        disabled={gitActionLoading}
                        className="px-2.5 py-1 text-xs font-medium bg-[var(--color-surface-3)] text-[var(--color-accent-strong)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-4)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {gitActionLoading ? 'Pruning...' : 'Prune Merged Branches'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {git.merged_branches.map((b) => (
                        <span
                          key={b}
                          className="inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]"
                        >
                          <GitBranch className="w-3 h-3 text-[var(--color-text-tertiary)]" />
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dirty files */}
                {dirtyFiles.length > 0 && (
                  <div className="pt-3 border-t border-[var(--color-border-subtle)]">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-[var(--color-warning)] flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {dirtyFiles.length} unsaved file{dirtyFiles.length > 1 ? 's' : ''}
                        {git.oldest_dirty_timestamp && (
                          <span className="text-xs font-normal text-[var(--color-text-secondary)]">
                            (oldest {formatTimeAgo(git.oldest_dirty_timestamp)})
                          </span>
                        )}
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
                            file.status === 'modified' ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)]' :
                            file.status === 'untracked' ? 'bg-[var(--color-info-bg)] text-[var(--color-info)]' :
                            file.status === 'deleted' ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)]' :
                            'bg-[var(--color-success-bg)] text-[var(--color-success)]'
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
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded-lg hover:bg-[var(--color-danger-bg)]/80 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
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
                        <div className={`w-2 h-2 rounded-full shrink-0 mt-2 ${proc.is_shell ? 'bg-[var(--color-text-tertiary)]' : 'bg-[var(--color-success)]'}`} />
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
                        <div key={port} className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => EntropyApiClient.openUrl(`http://localhost:${port}`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] rounded-lg hover:bg-[var(--color-success-bg)]/80 transition-colors cursor-pointer"
                            title={`Open http://localhost:${port} in web browser`}
                            aria-label={`Open localhost port ${port} in web browser`}
                          >
                            <Globe className="w-3.5 h-3.5 text-[var(--color-success)]" />
                            <span>http://localhost:{port}</span>
                            <ExternalLink className="w-3 h-3 opacity-70" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFreePort(proc, port)}
                            disabled={busyAction === `port-${port}`}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)] rounded-lg hover:bg-[var(--color-warning-bg)]/80 transition-colors cursor-pointer disabled:opacity-50"
                            title={`Stop the process listening on port ${port}`}
                            aria-label={`Free port ${port} and terminate process`}
                          >
                            <Zap className="w-3 h-3" />
                            {busyAction === `port-${port}` ? `Freeing ${port}...` : `Free Port ${port}`}
                          </button>
                        </div>
                      ))}
                      {proc.cwd && (
                        <>
                          <button
                            type="button"
                            onClick={() => EntropyApiClient.openInTerminal(proc.cwd!)}
                            title="Open Windows Terminal in this directory"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-4)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer"
                          >
                            <Terminal className="w-3 h-3" />
                            Terminal Here
                          </button>
                          <button
                            type="button"
                            onClick={() => EntropyApiClient.openInPowerShell(proc.cwd!)}
                            title="Open PowerShell in this directory"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-4)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer"
                          >
                            <Terminal className="w-3 h-3 text-[var(--color-accent-strong)]" />
                            PowerShell
                          </button>
                          <button
                            type="button"
                            onClick={() => EntropyApiClient.openInCmd(proc.cwd!)}
                            title="Open Command Prompt (CMD) in this directory"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-4)] hover:text-[var(--color-text-primary)] rounded-lg transition-colors cursor-pointer"
                          >
                            <SquareTerminal className="w-3 h-3 text-[var(--color-warning)]" />
                            CMD
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
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)] rounded-lg hover:bg-[var(--color-danger-bg)]/80 transition-colors cursor-pointer disabled:opacity-50"
                        aria-label={`Stop process ${proc.name} PID ${proc.pid}`}
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

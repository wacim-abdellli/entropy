import React, { useMemo } from 'react';
import { AlertTriangle, ArrowUpRight, CircleDot, FolderGit2, FolderOpen, GitBranch, HardDrive, RefreshCw, Terminal } from 'lucide-react';
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
      className={`group grid grid-cols-[minmax(220px,1.2fr)_minmax(180px,1.5fr)_150px_130px_94px] items-center gap-4 px-4 py-3.5 border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-2)] transition-colors ${
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
        <span className="ml-3.5 text-[11px] font-mono text-[var(--color-text-tertiary)]">
          {typeName(workspace.project_type)}
        </span>
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
          ? 'Changes to review'
          : running
          ? `${workspace.process_count} process${workspace.process_count === 1 ? '' : 'es'} running`
          : 'No active process'}
      </span>
      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          title="Open terminal"
          onClick={() => EntropyApiClient.openInTerminal(workspace.path)}
          className="w-7 h-7 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center justify-center cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5" />
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

  return (
    <div className="flex-1 h-full overflow-y-auto bg-[var(--color-surface-0)] animate-enter">
      <header className="sticky top-0 z-10 h-14 px-7 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-0)]/95 backdrop-blur">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">Workspaces</h1>
            {currentWorkspace && (
              <>
                <span className="text-[var(--color-text-tertiary)] text-xs">/</span>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-accent-strong)]">
                  <FolderGit2 className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                  <span className="font-semibold">{currentWorkspace.name}</span>
                  {currentWorkspace.git_branch && (
                    <span className="font-mono text-[10px] text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-1.5 py-0.2 rounded border border-[var(--color-border-subtle)]">
                      {currentWorkspace.git_branch}
                    </span>
                  )}
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
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
        <div className="flex items-center gap-2">
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
      <div className="max-w-6xl mx-auto px-7 py-7 space-y-7">
        <section className="grid grid-cols-[1.45fr_1fr] gap-5">
          <div className="border border-[var(--color-border)] bg-[var(--color-surface-1)] rounded-lg p-5">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)] font-semibold">
              Up next
            </p>
            {firstAction ? (
              <>
                <div className="mt-3 flex items-start gap-3">
                  <div
                    className={`mt-1 w-2 h-2 rounded-full ${
                      firstAction.has_uncommitted_changes
                        ? 'bg-[var(--color-warning)]'
                        : 'bg-[var(--color-success)]'
                    }`}
                  />
                  <div>
                    <h2 className="text-base font-semibold">
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
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectWorkspace(firstAction.path)}
                    className="h-8 px-3 rounded-md bg-[var(--color-accent)] hover:bg-blue-500 text-white text-xs font-medium cursor-pointer"
                  >
                    Open workspace
                  </button>
                  <button
                    type="button"
                    onClick={() => EntropyApiClient.openInTerminal(firstAction.path)}
                    className="h-8 px-3 rounded-md hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Terminal
                  </button>
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
          <div className="border border-[var(--color-border)] bg-[var(--color-surface-1)] rounded-lg divide-y divide-[var(--color-border-subtle)]">
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
          </div>
        </section>

        <section className="border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-surface-1)]">
          <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--color-border-subtle)]">
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
          <div className="grid grid-cols-[minmax(220px,1.2fr)_minmax(180px,1.5fr)_150px_130px_94px] gap-4 px-4 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)] border-b border-[var(--color-border-subtle)]">
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
                  className="grid grid-cols-[minmax(220px,1.2fr)_minmax(180px,1.5fr)_150px_130px_94px] items-center gap-4 px-4 py-4 animate-pulse"
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
        </section>
      </div>
    </div>
  );
};

import React, { useMemo } from 'react';
import {
  RefreshCw,
  FolderPlus,
  GitBranch,
  AlertTriangle,
  CheckCircle2,
  Clock,
  HardDrive,
  ChevronRight,
  Code2,
  Terminal,
  FolderOpen,
  Zap,
  Moon,
} from 'lucide-react';
import { EnvironmentOverview, WorkspaceSummary } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

/* ───────────────────────── Types ───────────────────────── */

interface OverviewViewProps {
  overview: EnvironmentOverview;
  onRefresh: () => void;
  isLoading: boolean;
  onSelectWorkspace: (path: string) => void;
  onInspectFolder: () => void;
}

type UrgencyGroup = 'attention' | 'reclaimable' | 'healthy';

interface GroupedWorkspace {
  workspace: WorkspaceSummary;
  urgency: UrgencyGroup;
  statusText: string;
  statusIcon: React.ReactNode;
  borderColor: string;
  actions: WorkspaceAction[];
}

interface WorkspaceAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant: 'primary' | 'secondary' | 'danger';
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
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function daysInactive(timestamp: number | null | undefined): number {
  if (!timestamp) return 999;
  return Math.floor((Date.now() / 1000 - timestamp) / 86400);
}

function projectTypeLabel(type: string): string {
  const map: Record<string, string> = {
    python: 'Python', node: 'Node.js', dotnet: '.NET', java: 'Java',
    rust: 'Rust', go: 'Go', flutter: 'Flutter', ruby: 'Ruby',
  };
  return map[type.toLowerCase()] || type;
}

/* ───────────────────────── Classify workspaces ───────────────────────── */

function classifyWorkspace(w: WorkspaceSummary, overview: EnvironmentOverview): GroupedWorkspace {
  const inactive = daysInactive(w.last_modified);
  const hasFindings = overview.findings.some(
    (f) => f.entities_involved.some((e) => e.includes(w.path) || e.includes(w.name))
  );

  // Determine urgency group
  let urgency: UrgencyGroup = 'healthy';
  let statusText = '';
  let statusIcon: React.ReactNode = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  let borderColor = 'border-l-emerald-500/60';

  if (w.has_uncommitted_changes && inactive > 7) {
    urgency = 'attention';
    statusText = `Has unsaved changes · idle ${inactive} days`;
    statusIcon = <AlertTriangle className="w-4 h-4 text-rose-400" />;
    borderColor = 'border-l-rose-500/60';
  } else if (w.has_uncommitted_changes) {
    urgency = 'attention';
    statusText = `Has unsaved changes`;
    statusIcon = <AlertTriangle className="w-4 h-4 text-amber-400" />;
    borderColor = 'border-l-amber-500/60';
  } else if (w.state_category === 'dormant' || inactive > 60) {
    urgency = 'reclaimable';
    statusText = `Inactive for ${inactive} days`;
    statusIcon = <Moon className="w-4 h-4 text-slate-400" />;
    borderColor = 'border-l-slate-500/40';
  } else if (w.state_category === 'inactive' || (inactive > 14 && w.process_count === 0)) {
    urgency = 'reclaimable';
    statusText = `Inactive for ${inactive} days`;
    statusIcon = <Clock className="w-4 h-4 text-amber-400" />;
    borderColor = 'border-l-amber-500/40';
  } else if (w.process_count > 0) {
    statusText = `Active · ${w.process_count} process${w.process_count > 1 ? 'es' : ''} running`;
    statusIcon = <Zap className="w-4 h-4 text-emerald-400" />;
    borderColor = 'border-l-emerald-500/60';
  } else {
    statusText = `Clean · last active ${formatTimeAgo(w.last_modified)}`;
  }

  // Build actions
  const actions: WorkspaceAction[] = [];

  if (w.has_uncommitted_changes) {
    actions.push({
      label: 'Stash Changes',
      icon: <GitBranch className="w-3.5 h-3.5" />,
      onClick: () => EntropyApiClient.stashWorkspace(w.path),
      variant: 'primary',
    });
  }

  actions.push({
    label: 'VS Code',
    icon: <Code2 className="w-3.5 h-3.5" />,
    onClick: () => EntropyApiClient.launchIde(w.path, 'code'),
    variant: 'secondary',
  });

  actions.push({
    label: 'Terminal',
    icon: <Terminal className="w-3.5 h-3.5" />,
    onClick: () => EntropyApiClient.openInTerminal(w.path),
    variant: 'secondary',
  });

  return { workspace: w, urgency, statusText, statusIcon, borderColor, actions };
}

/* ───────────────────────── Components ───────────────────────── */

const WorkspaceCard: React.FC<{
  item: GroupedWorkspace;
  onSelect: () => void;
}> = ({ item, onSelect }) => {
  const { workspace: w, statusText, statusIcon, borderColor, actions } = item;

  return (
    <div
      className={`group bg-[var(--color-surface-1)] border border-[var(--color-border)] border-l-[3px] ${borderColor} rounded-xl p-5 hover:bg-[var(--color-surface-2)] hover:border-[var(--color-border-strong)] transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-black/10 hover:-translate-y-[1px]`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      {/* Top row: name + size */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-[var(--color-text-primary)] truncate">
            {w.name}
          </h3>
          <p className="text-xs text-[var(--color-text-tertiary)] font-mono truncate mt-0.5">
            {w.path}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          <span className="text-xs font-medium text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-2 py-0.5 rounded-md">
            {projectTypeLabel(w.project_type)}
          </span>
          <span className="text-xs text-[var(--color-text-tertiary)]">
            {formatSize(w.total_size_bytes)}
          </span>
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center gap-2 mb-4">
        {statusIcon}
        <span className="text-sm text-[var(--color-text-secondary)]">{statusText}</span>
        {w.git_branch && (
          <span className="flex items-center gap-1 text-xs text-[var(--color-text-tertiary)] ml-auto">
            <GitBranch className="w-3 h-3" />
            {w.git_branch}
          </span>
        )}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={action.onClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer ${
                action.variant === 'primary'
                  ? 'bg-[var(--color-accent)] text-white hover:opacity-90 shadow-sm'
                  : 'bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-4)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
        <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
};

/* ───────────────────────── Main View ───────────────────────── */

export const OverviewView: React.FC<OverviewViewProps> = ({
  overview,
  onRefresh,
  isLoading,
  onSelectWorkspace,
  onInspectFolder,
}) => {
  const { summary, workspaces, findings } = overview;

  // Classify and group workspaces
  const grouped = useMemo(() => {
    const classified = workspaces.map((w) => classifyWorkspace(w, overview));

    const attention = classified.filter((c) => c.urgency === 'attention');
    const reclaimable = classified.filter((c) => c.urgency === 'reclaimable');
    const healthy = classified.filter((c) => c.urgency === 'healthy');

    return { attention, reclaimable, healthy };
  }, [workspaces, overview]);

  // Compute hero stats
  const totalReclaimable = (overview.system?.artifacts || []).reduce(
    (sum, a) => sum + (a.size_bytes || 0), 0
  );
  const unsavedCount = workspaces.filter((w) => w.has_uncommitted_changes).length;
  const dormantCount = workspaces.filter(
    (w) => w.state_category === 'dormant' || daysInactive(w.last_modified) > 60
  ).length;
  const activeCount = workspaces.filter((w) => w.process_count > 0).length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[var(--color-surface-0)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-0)] shrink-0">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Home</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onInspectFolder}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-lg transition-colors cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            Inspect Folder
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">

          {/* ── Welcome Hero ── */}
          <div className="bg-gradient-to-br from-[var(--color-surface-2)] to-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-[var(--color-text-primary)] mb-1">
              Here's what I found on your machine
            </h2>
            <p className="text-sm text-[var(--color-text-tertiary)] mb-6">
              {summary.total_workspaces} workspace{summary.total_workspaces !== 1 ? 's' : ''} detected across your development directories
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {unsavedCount > 0 && (
                <div className="flex items-start gap-3 bg-rose-500/8 border border-rose-500/15 rounded-xl p-4">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-2xl font-bold text-rose-400">{unsavedCount}</div>
                    <div className="text-xs text-rose-300/80">unsaved work</div>
                  </div>
                </div>
              )}

              {totalReclaimable > 0 && (
                <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/15 rounded-xl p-4">
                  <HardDrive className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-2xl font-bold text-amber-400">{formatSize(totalReclaimable)}</div>
                    <div className="text-xs text-amber-300/80">reclaimable</div>
                  </div>
                </div>
              )}

              {dormantCount > 0 && (
                <div className="flex items-start gap-3 bg-slate-500/8 border border-slate-500/15 rounded-xl p-4">
                  <Moon className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-2xl font-bold text-slate-300">{dormantCount}</div>
                    <div className="text-xs text-slate-400">dormant</div>
                  </div>
                </div>
              )}

              {activeCount > 0 && (
                <div className="flex items-start gap-3 bg-emerald-500/8 border border-emerald-500/15 rounded-xl p-4">
                  <Zap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-2xl font-bold text-emerald-400">{activeCount}</div>
                    <div className="text-xs text-emerald-300/80">active</div>
                  </div>
                </div>
              )}

              {/* Fallback when all is clean */}
              {unsavedCount === 0 && totalReclaimable === 0 && dormantCount === 0 && activeCount === 0 && (
                <div className="col-span-full flex items-center gap-3 bg-emerald-500/8 border border-emerald-500/15 rounded-xl p-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-emerald-300">Everything looks clean. No issues found.</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Attention Group ── */}
          {grouped.attention.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <h3 className="text-sm font-semibold text-rose-400 uppercase tracking-wider">Needs Your Attention</h3>
              </div>
              <div className="space-y-3">
                {grouped.attention.map((item) => (
                  <WorkspaceCard
                    key={item.workspace.id}
                    item={item}
                    onSelect={() => onSelectWorkspace(item.workspace.path)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Reclaimable Group ── */}
          {grouped.reclaimable.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Inactive Projects</h3>
              </div>
              <div className="space-y-3">
                {grouped.reclaimable.map((item) => (
                  <WorkspaceCard
                    key={item.workspace.id}
                    item={item}
                    onSelect={() => onSelectWorkspace(item.workspace.path)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Healthy Group ── */}
          {grouped.healthy.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">All Good</h3>
              </div>
              <div className="space-y-3">
                {grouped.healthy.map((item) => (
                  <WorkspaceCard
                    key={item.workspace.id}
                    item={item}
                    onSelect={() => onSelectWorkspace(item.workspace.path)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {workspaces.length === 0 && (
            <div className="text-center py-16">
              <FolderOpen className="w-12 h-12 text-[var(--color-text-tertiary)] mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">No workspaces found</h3>
              <p className="text-sm text-[var(--color-text-secondary)] mb-6 max-w-md mx-auto">
                Entropy scans your development directories for projects. Add a folder to get started.
              </p>
              <button
                type="button"
                onClick={onInspectFolder}
                className="px-5 py-2.5 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer"
              >
                <FolderPlus className="w-4 h-4 inline mr-2" />
                Add a Folder
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

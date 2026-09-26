import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Shield,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Trash2,
  Activity,
  Radio,
  Lock,
  GitBranch,
  HardDrive,
} from 'lucide-react';
import { WorkspaceHealth, HealthTip } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface WorkspaceAdvisorCardProps {
  workspacePath: string;
  workspaceName: string;
  gitBranch?: string | null;
  hasUncommittedChanges?: boolean;
  ports?: number[];
  artifacts?: string[];
  onActionCompleted?: () => Promise<void> | void;
  onNavigateToSettings?: () => void;
}

export const WorkspaceHealthCard: React.FC<WorkspaceAdvisorCardProps> = ({
  workspacePath,
  gitBranch,
  hasUncommittedChanges,
  ports,
  artifacts,
  onActionCompleted,
}) => {
  const [health, setHealth] = useState<WorkspaceHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Action state
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ id: string; success: boolean; text: string } | null>(null);
  const [prevPath, setPrevPath] = useState(workspacePath);

  if (workspacePath !== prevPath) {
    setPrevPath(workspacePath);
    setLoading(true);
  }

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await EntropyApiClient.getWorkspaceHealth(workspacePath);
      if (data) {
        setHealth(data);
      }
    } catch (err) {
      console.warn('Failed to load workspace health:', err);
    } finally {
      setLoading(false);
    }
  }, [workspacePath]);

  useEffect(() => {
    let ignore = false;
    EntropyApiClient.getWorkspaceHealth(workspacePath)
      .then((data) => {
        if (!ignore && data) {
          setHealth(data);
        }
      })
      .catch((err) => {
        console.warn('Failed to load workspace health:', err);
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [workspacePath]);

  const handleExecuteTip = async (tip: HealthTip) => {
    if (!tip.action_type) return;
    setActiveActionId(tip.id);
    setActionNotice(null);

    try {
      let res: { success: boolean; message?: string; error?: string } = { success: false };

      if (tip.action_type === 'add_gitignore') {
        const pattern = tip.action_payload?.pattern || '.env*';
        res = await EntropyApiClient.addToGitignore(workspacePath, pattern);
      } else if (tip.action_type === 'stash') {
        res = await EntropyApiClient.stashWorkspace(workspacePath);
      } else if (tip.action_type === 'prune_branches') {
        const branches = tip.action_payload?.branches || [];
        res = await EntropyApiClient.pruneMergedBranches(workspacePath, branches);
      } else if (tip.action_type === 'clean_artifacts') {
        const paths = tip.action_payload?.paths || [];
        if (paths.length > 0) {
          const cleanRes = await EntropyApiClient.cleanArtifacts(paths);
          res = {
            success: cleanRes.success,
            message: `Cleaned ${cleanRes.success_count || paths.length} artifact folder(s).`,
            error: cleanRes.error,
          };
        }
      } else if (tip.action_type === 'free_port') {
        const port = tip.action_payload?.port;
        if (port) {
          res = await EntropyApiClient.freePort(port, true);
        }
      }

      setActionNotice({
        id: tip.id,
        success: res.success,
        text: res.success ? (res.message || 'Action executed successfully.') : (res.error || 'Action failed.'),
      });

      if (res.success) {
        await onActionCompleted?.();
        await fetchHealth();
      }
    } catch (err: unknown) {
      setActionNotice({
        id: tip.id,
        success: false,
        text: err instanceof Error ? err.message : 'Action execution failed.',
      });
    } finally {
      setActiveActionId(null);
      setTimeout(() => setActionNotice(null), 4500);
    }
  };

  const score = health?.health_score ?? 100;
  const scoreBadge =
    score >= 90
      ? { label: 'Optimal', badgeClass: 'text-[var(--color-success)] bg-[var(--color-success-bg)] border-[var(--color-success-border)]' }
      : score >= 70
      ? { label: 'Good', badgeClass: 'text-[var(--color-info)] bg-[var(--color-info-bg)] border-[var(--color-info-border)]' }
      : score >= 50
      ? { label: 'Action Needed', badgeClass: 'text-[var(--color-warning)] bg-[var(--color-warning-bg)] border-[var(--color-warning-border)]' }
      : { label: 'At Risk', badgeClass: 'text-[var(--color-danger)] bg-[var(--color-danger-bg)] border-[var(--color-danger-border)]' };

  const tips = health?.tips || [];

  // Diagnostics summary metrics
  const hasSecretRisk = tips.some((t) => t.id === 'unprotected_env' || t.id === 'tracked_secrets');
  const hasDirtyWip = hasUncommittedChanges || tips.some((t) => t.id === 'dirty_wip' || t.id === 'stale_wip');
  const activePortsCount = ports?.length || 0;
  
  // Calculate total reclaimable size if available
  const reclaimableBytes = health?.cleanup_verdicts?.reduce((acc, v) => acc + (v.size_bytes || 0), 0) || 0;
  const formatBytes = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  return (
    <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-xs transition-all">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
              score >= 80
                ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success)]'
                : score >= 60
                ? 'bg-[var(--color-warning-bg)] border-[var(--color-warning-border)] text-[var(--color-warning)]'
                : 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger)]'
            }`}
          >
            {score >= 80 ? (
              <ShieldCheck size={18} />
            ) : score >= 60 ? (
              <Activity size={18} />
            ) : (
              <ShieldAlert size={18} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Workspace Health & Diagnostics
              </h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${scoreBadge.badgeClass}`}>
                {score}/100 • {scoreBadge.label}
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              {health?.summary || 'Automated hygiene, secret protection, and runtime checks'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchHealth}
            disabled={loading}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Diagnostics"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] rounded-md transition-colors cursor-pointer"
            title={expanded ? 'Collapse Diagnostics' : 'Expand Diagnostics'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-5 space-y-5">
          {/* Quick Diagnostics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Secret Shield */}
            <div className="p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)] mb-1">
                <Lock size={12} />
                <span>Secret Shield</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    hasSecretRisk ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-success)]'
                  }`}
                />
                <span
                  className={`text-xs font-medium ${
                    hasSecretRisk ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]'
                  }`}
                >
                  {hasSecretRisk ? 'Secrets Exposed' : 'Secured'}
                </span>
              </div>
            </div>

            {/* Git Status */}
            <div className="p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)] mb-1">
                <GitBranch size={12} />
                <span>Working Tree</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    hasDirtyWip ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-success)]'
                  }`}
                />
                <span
                  className={`text-xs font-medium ${
                    hasDirtyWip ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]'
                  }`}
                >
                  {hasDirtyWip ? 'Uncommitted Edits' : 'Clean'}
                </span>
                {gitBranch && (
                  <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] truncate">
                    ({gitBranch})
                  </span>
                )}
              </div>
            </div>

            {/* Dev Servers */}
            <div className="p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)] mb-1">
                <Radio size={12} />
                <span>Dev Servers</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activePortsCount > 0 ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-text-tertiary)]'
                  }`}
                />
                <span className="text-xs font-medium text-[var(--color-text-primary)]">
                  {activePortsCount > 0 ? `${activePortsCount} Port${activePortsCount > 1 ? 's' : ''} Active` : 'Idle'}
                </span>
              </div>
            </div>

            {/* Reclaimable Disk */}
            <div className="p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)] mb-1">
                <HardDrive size={12} />
                <span>Reclaimable</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    reclaimableBytes > 0 || (artifacts && artifacts.length > 0)
                      ? 'bg-[var(--color-info)]'
                      : 'bg-[var(--color-text-tertiary)]'
                  }`}
                />
                <span className="text-xs font-medium text-[var(--color-text-primary)]">
                  {reclaimableBytes > 0
                    ? formatBytes(reclaimableBytes)
                    : artifacts && artifacts.length > 0
                    ? `${artifacts.length} Target${artifacts.length > 1 ? 's' : ''}`
                    : 'Clean'}
                </span>
              </div>
            </div>
          </div>

          {/* Actionable Health Checks & Recommendations */}
          {tips.length > 0 ? (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Recommendations &amp; Quick Fixes ({tips.length})
              </h4>
              <div className="grid grid-cols-1 gap-2.5">
                {tips.map((tip) => {
                  const isBusy = activeActionId === tip.id;
                  const notice = actionNotice?.id === tip.id ? actionNotice : null;

                  const severityBadge =
                    tip.severity === 'urgent'
                      ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border-[var(--color-danger-border)]'
                      : tip.severity === 'warning'
                      ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]'
                      : 'bg-[var(--color-info-bg)] text-[var(--color-info)] border-[var(--color-info-border)]';

                  return (
                    <div
                      key={tip.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border)] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${severityBadge}`}>
                            {tip.severity}
                          </span>
                          <h5 className="text-xs font-semibold text-[var(--color-text-primary)]">
                            {tip.title}
                          </h5>
                        </div>
                        <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                          {tip.description}
                        </p>
                        {notice && (
                          <div
                            className={`mt-2 text-xs flex items-center gap-1.5 animate-in fade-in duration-150 ${
                              notice.success ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'
                            }`}
                          >
                            {notice.success ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                            <span>{notice.text}</span>
                          </div>
                        )}
                      </div>

                      {tip.action_label && (
                        <div className="shrink-0 flex items-center">
                          <button
                            type="button"
                            onClick={() => handleExecuteTip(tip)}
                            disabled={isBusy}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                              tip.severity === 'urgent'
                                ? 'bg-[var(--color-danger)] hover:opacity-90 text-white shadow-xs'
                                : tip.severity === 'warning'
                                ? 'bg-[var(--color-warning)] hover:opacity-90 text-black font-semibold shadow-xs'
                                : 'bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] text-[var(--color-text-primary)] border border-[var(--color-border)]'
                            }`}
                          >
                            {isBusy ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : tip.action_type === 'stash' ? (
                              <Shield size={13} />
                            ) : tip.action_type === 'prune_branches' ? (
                              <GitMerge size={13} />
                            ) : tip.action_type === 'clean_artifacts' ? (
                              <Trash2 size={13} />
                            ) : tip.action_type === 'free_port' ? (
                              <Radio size={13} />
                            ) : tip.action_type === 'add_gitignore' ? (
                              <Lock size={13} />
                            ) : (
                              <Check size={13} />
                            )}
                            <span>{isBusy ? 'Applying...' : tip.action_label}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success-border)] text-[var(--color-success)] text-xs">
              <ShieldCheck size={20} className="text-[var(--color-success)] shrink-0" />
              <div>
                <span className="font-semibold block">All Diagnostics Passed</span>
                <span className="text-[var(--color-text-secondary)]">
                  Working tree is clean, secrets are secured in .gitignore, and no orphaned dev processes are running.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Backwards-compatible export alias
export const WorkspaceAdvisorCard = WorkspaceHealthCard;

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Sparkles,
  Send,
  Copy,
} from 'lucide-react';
import { WorkspaceHealth, HealthTip } from '../types/entropy';
import { EntropyApiClient } from '../services/api';
import { AiResponseRenderer } from './AiResponseRenderer';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

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
  workspaceName,
  gitBranch,
  hasUncommittedChanges,
  ports,
  artifacts,
  onActionCompleted,
  onNavigateToSettings,
}) => {
  const [health, setHealth] = useState<WorkspaceHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [confirmTip, setConfirmTip] = useState<HealthTip | null>(null);

  // Action state
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ id: string; success: boolean; text: string } | null>(null);
  const [prevPath, setPrevPath] = useState(workspacePath);

  // Platform AI normal chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  if (workspacePath !== prevPath) {
    setPrevPath(workspacePath);
    setLoading(true);
    setChatMessages([]);
    setChatInput('');
  }

  const handleSend = async (queryText?: string) => {
    const q = (queryText || chatInput).trim();
    if (!q || isAiThinking) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsAiThinking(true);

    try {
      const res = await EntropyApiClient.askAiAdvisor(q, {
        workspace_name: workspaceName,
        git_branch: gitBranch,
        has_uncommitted_changes: hasUncommittedChanges,
        ports: ports,
        artifacts: artifacts,
      });

      const aiText = res?.answer || (res?.error ? `Error: ${res.error}` : 'No response received from Platform AI.');
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: err instanceof Error ? err.message : 'Failed to consult Platform AI.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setChatMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsAiThinking(false);
    }
  };

  useEffect(() => {
    if (chatMessages.length > 0 || isAiThinking) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isAiThinking]);

  const handleCopyMessage = (msgId: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

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

    const DESTRUCTIVE_ACTIONS = ['clean_artifacts', 'prune_branches', 'free_port'];
    if (DESTRUCTIVE_ACTIONS.includes(tip.action_type || '') && !confirmTip) {
      setConfirmTip(tip);
      return;
    }
    setConfirmTip(null);

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
      } else if (tip.action_type === 'rebuild_deps') {
        const cmd = tip.action_payload?.command;
        res = await EntropyApiClient.rebuildDependencies(workspacePath, cmd);
      } else if (tip.action_type === 'push_branch') {
        res = await EntropyApiClient.pushBranch(workspacePath);
      }

      setActionNotice({
        id: tip.id,
        success: res.success,
        text: res.success ? (res.message || 'Action executed successfully.') : (res.error || 'Action failed.'),
      });

      if (res.success) {
        void onActionCompleted?.();
        void fetchHealth();
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

          {/* Interactive Platform AI Advisor — Normal Chat */}
          <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 flex items-center justify-center text-[var(--color-accent)]">
                  <Sparkles size={12} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                    Platform AI Assistant
                  </span>
                  <span className="text-[9px] uppercase font-semibold px-1.5 py-0.2 rounded bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)] border border-[var(--color-accent)]/20">
                    Ready
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {chatMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setChatMessages([])}
                    className="text-[11px] text-[var(--color-text-tertiary)] hover:text-red-400 transition-colors cursor-pointer flex items-center gap-1"
                    title="Clear chat conversation"
                  >
                    <Trash2 size={11} />
                    <span>Clear Chat</span>
                  </button>
                )}
                {onNavigateToSettings && (
                  <button
                    type="button"
                    onClick={onNavigateToSettings}
                    className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors cursor-pointer"
                  >
                    AI Settings
                  </button>
                )}
              </div>
            </div>

            {/* Chat Conversation Thread */}
            {chatMessages.length > 0 && (
              <div className="max-h-[380px] overflow-y-auto space-y-3 p-3.5 rounded-xl bg-[var(--color-surface-0)] border border-[var(--color-border-subtle)] shadow-inner">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="space-y-1">
                    {msg.sender === 'user' ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] bg-[var(--color-accent)] text-white px-3.5 py-2.5 rounded-2xl rounded-tr-xs shadow-xs space-y-1">
                          <div className="flex items-center justify-between gap-3 text-[10px] text-white/75">
                            <span className="font-semibold">You</span>
                            <span>{msg.timestamp}</span>
                          </div>
                          <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2.5 justify-start">
                        <div className="w-7 h-7 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center shrink-0 mt-0.5 text-[var(--color-accent)]">
                          <Sparkles size={14} />
                        </div>
                        <div className="flex-1 max-w-[92%] bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-2xl rounded-tl-xs p-3.5 shadow-xs space-y-2 text-xs">
                          <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-border-subtle)]">
                            <div className="flex items-center gap-1.5 text-[var(--color-accent-strong)] font-semibold text-[11px]">
                              <span>Platform AI</span>
                              <span className="text-[10px] font-normal text-[var(--color-text-tertiary)]">({msg.timestamp})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyMessage(msg.id, msg.text)}
                              className="text-[10px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer flex items-center gap-1"
                            >
                              {copiedMsgId === msg.id ? (
                                <Check size={11} className="text-[var(--color-success)]" />
                              ) : (
                                <Copy size={11} />
                              )}
                              <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                          <AiResponseRenderer content={msg.text} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isAiThinking && (
                  <div className="flex items-start gap-2.5 justify-start animate-in fade-in">
                    <div className="w-7 h-7 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center shrink-0 mt-0.5 text-[var(--color-accent)]">
                      <Sparkles size={14} className="animate-spin" />
                    </div>
                    <div className="bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] rounded-2xl rounded-tl-xs px-4 py-3 text-xs text-[var(--color-text-secondary)] flex items-center gap-2.5">
                      <span>Platform AI is thinking</span>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            {/* Quick Suggestion Chips (shown when no messages) */}
            {chatMessages.length === 0 && (
              <div className="p-3.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] space-y-2.5">
                <div className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Ask anything about <strong className="text-[var(--color-text-primary)]">{workspaceName}</strong> — safe cleanup, active background processes, or Git status.
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Is it safe to delete node_modules?',
                    'What active servers or ports are running?',
                    'How do I safely stash uncommitted work?',
                    'How can I free disk space in this workspace?',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      disabled={isAiThinking}
                      onClick={() => handleSend(suggestion)}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Normal Chat Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask Platform AI anything about this workspace... (Press Enter to send)"
                  disabled={isAiThinking}
                  className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-4 py-2 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] shadow-xs transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isAiThinking || !chatInput.trim()}
                className="h-8.5 px-3.5 rounded-xl bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 shadow-xs shrink-0"
                title="Send Message (Enter)"
              >
                {isAiThinking ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {confirmTip && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)]">
                <AlertTriangle size={20} className="text-[var(--color-warning)]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">Confirm Action</h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  {confirmTip.action_type === 'clean_artifacts'
                    ? `This will permanently delete build artifact folders. They can be rebuilt but deleted files bypass the Recycle Bin.`
                    : confirmTip.action_type === 'prune_branches'
                    ? `This will delete local git branches that have already been merged. Branch refs will be removed permanently.`
                    : confirmTip.action_type === 'free_port'
                    ? `This will terminate the process currently listening on the port. Any unsaved work in that process will be lost.`
                    : confirmTip.description}
                </p>
              </div>
            </div>
            <div className="bg-[var(--color-surface-3)] rounded-lg p-3 mb-4">
              <p className="text-xs font-medium text-[var(--color-text-primary)] mb-1">{confirmTip.title}</p>
              {confirmTip.action_payload?.paths && (
                <div className="mt-1.5 space-y-0.5">
                  {(confirmTip.action_payload.paths as string[]).map((p: string) => (
                    <p key={p} className="text-[10px] font-mono text-[var(--color-text-tertiary)] truncate">{p}</p>
                  ))}
                </div>
              )}
              {confirmTip.action_payload?.branches && (
                <div className="mt-1.5 space-y-0.5">
                  {(confirmTip.action_payload.branches as string[]).map((b: string) => (
                    <p key={b} className="text-[10px] font-mono text-[var(--color-text-tertiary)]">{b}</p>
                  ))}
                </div>
              )}
              {confirmTip.action_payload?.port && (
                <p className="text-[10px] font-mono text-[var(--color-text-tertiary)] mt-1">Port: {confirmTip.action_payload.port}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmTip(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] border border-[var(--color-border)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecuteTip(confirmTip)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--color-danger)] hover:opacity-90 text-white transition-colors cursor-pointer"
              >
                {confirmTip.action_type === 'clean_artifacts' ? 'Delete Artifacts' : confirmTip.action_type === 'prune_branches' ? 'Prune Branches' : 'Terminate Process'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Backwards-compatible export alias
export const WorkspaceAdvisorCard = WorkspaceHealthCard;

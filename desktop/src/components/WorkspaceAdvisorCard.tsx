import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Sparkles,
  Bot,
  Send,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Settings as SettingsIcon,
  GitMerge,
  Trash2,
  Shield,
} from 'lucide-react';
import { WorkspaceHealth, HealthTip, AiResponse } from '../types/entropy';
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

const renderInlineSpans = (text: string) => {
  const codeParts = text.split(/(`[^`]+`)/g);
  return codeParts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-[var(--color-surface-3)] font-mono text-[11px] text-[var(--color-accent-strong)] border border-[var(--color-border-subtle)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((bPart, j) => {
      if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length > 4) {
        return (
          <strong key={`${i}-${j}`} className="font-semibold text-[var(--color-text-primary)]">
            {bPart.slice(2, -2)}
          </strong>
        );
      }
      return bPart;
    });
  });
};

const renderFormattedAnswer = (text: string) => {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-xs text-[var(--color-text-secondary)] leading-relaxed select-text">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;

        if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
          const headerContent = trimmed.replace(/^#+\s*/, '');
          return (
            <div key={idx} className="text-xs font-semibold text-[var(--color-text-primary)] pt-1 pb-0.5 border-b border-[var(--color-border-subtle)]">
              {renderInlineSpans(headerContent)}
            </div>
          );
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const bulletContent = trimmed.replace(/^[-*]\s*/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] mt-1.5 shrink-0" />
              <div className="flex-1">{renderInlineSpans(bulletContent)}</div>
            </div>
          );
        }

        return (
          <p key={idx} className="py-0.5">
            {renderInlineSpans(trimmed)}
          </p>
        );
      })}
    </div>
  );
};

export const WorkspaceAdvisorCard: React.FC<WorkspaceAdvisorCardProps> = ({
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

  // Action state
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ id: string; success: boolean; text: string } | null>(null);

  // Q&A state
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<AiResponse | null>(null);
  const [copiedAnswer, setCopiedAnswer] = useState(false);
  const [prevPath, setPrevPath] = useState(workspacePath);
  if (workspacePath !== prevPath) {
    setPrevPath(workspacePath);
    setAiAnswer(null);
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

  const handleAskAdvisor = async (qText?: string) => {
    const query = (qText || question).trim();
    if (!query || asking) return;

    setAsking(true);
    try {
      const res = await EntropyApiClient.askAiAdvisor(query, {
        workspace_name: workspaceName,
        workspace_path: workspacePath,
        git_branch: gitBranch,
        has_uncommitted_changes: hasUncommittedChanges,
        ports: ports,
        artifacts: artifacts,
      });
      setAiAnswer(res);
      if (qText) {
        setQuestion(qText);
      }
    } catch (err: unknown) {
      setAiAnswer({
        success: false,
        answer: err instanceof Error ? err.message : 'Failed to query advisor.',
        provider: 'error',
      });
    } finally {
      setAsking(false);
    }
  };

  const handleCopyAnswer = () => {
    if (!aiAnswer?.answer) return;
    navigator.clipboard.writeText(aiAnswer.answer);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
  };

  const score = health?.health_score ?? 85;
  const scoreColor =
    score >= 90
      ? 'text-[var(--color-success)] bg-[var(--color-success-bg)] border-[var(--color-success-border)]'
      : score >= 70
      ? 'text-[var(--color-info)] bg-[var(--color-info-bg)] border-[var(--color-info-border)]'
      : score >= 50
      ? 'text-[var(--color-warning)] bg-[var(--color-warning-bg)] border-[var(--color-warning-border)]'
      : 'text-[var(--color-danger)] bg-[var(--color-danger-bg)] border-[var(--color-danger-border)]';

  const tips = health?.tips || [];

  return (
    <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-xs transition-all">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/25 flex items-center justify-center text-[var(--color-accent)]">
            <Bot size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Workspace Advisor</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${scoreColor}`}>
                {score}/100
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              {health?.summary || 'Workspace health evaluation'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToSettings && (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] rounded-md transition-colors cursor-pointer"
              title="Configure AI Provider in Settings"
            >
              <SettingsIcon size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={fetchHealth}
            disabled={loading}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] rounded-md transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Advisor Analysis"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] rounded-md transition-colors cursor-pointer"
            title={expanded ? 'Collapse Advisor' : 'Expand Advisor'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-5 space-y-4">
          {/* Actionable Health Tips */}
          {tips.length > 0 ? (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Recommendations ({tips.length})
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
                          <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded border ${severityBadge}`}>
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
                          <div className={`mt-2 text-xs flex items-center gap-1.5 ${notice.success ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
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
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success-border)] text-[var(--color-success)] text-xs">
              <ShieldCheck size={16} className="text-[var(--color-success)] shrink-0" />
              <span>Great job! No hygiene warnings or uncommitted risks detected in this workspace.</span>
            </div>
          )}

          {/* Interactive Advisor Q&A */}
          <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                <Sparkles size={13} className="text-[var(--color-accent)]" />
                <span>Ask Advisor</span>
              </div>
              {aiAnswer && (
                <span className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-1">
                  <span>Backend:</span>
                  <span className="font-mono text-[var(--color-text-secondary)]">
                    {aiAnswer.provider === 'groq' ? `Groq (${aiAnswer.model || 'llama-3'})` : aiAnswer.provider === 'ollama' ? `Ollama (${aiAnswer.model})` : 'Offline Rules Engine'}
                  </span>
                </span>
              )}
            </div>

            {/* Suggestion Chips */}
            <div className="flex flex-wrap gap-1.5">
              {[
                'Is it safe to delete build folders?',
                'How do I optimize this workspace?',
                'Are any ports conflicting?',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAskAdvisor(chip)}
                  disabled={asking}
                  className="px-2.5 py-1 rounded-full bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Prompt Bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAskAdvisor();
                  }}
                  placeholder="Ask a question about this workspace (e.g., 'rebuild dependencies', 'safe to delete?')..."
                  className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-3.5 py-2 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] pr-9"
                />
              </div>
              <button
                type="button"
                onClick={() => handleAskAdvisor()}
                disabled={asking || !question.trim()}
                className="h-8 px-3.5 rounded-lg bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-opacity shrink-0"
              >
                {asking ? (
                  <RefreshCw size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                <span>Ask</span>
              </button>
            </div>

            {/* Answer Display */}
            {aiAnswer && (
              <div className="mt-3 p-4 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle)]">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
                    <Bot size={15} className="text-[var(--color-accent)]" />
                    <span>Advisor Response</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyAnswer}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer"
                    title="Copy response to clipboard"
                  >
                    {copiedAnswer ? <Check size={12} className="text-[var(--color-success)]" /> : <Copy size={12} />}
                    <span>{copiedAnswer ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <div className="pt-1">
                  {renderFormattedAnswer(aiAnswer.answer)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

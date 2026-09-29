import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  AlertTriangle,
  FolderGit2,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  X,
  Lock,
} from 'lucide-react';
import { EntropyApiClient } from '../services/api';
import { GlobalSecretsRadarReport } from '../types/entropy';

interface SecretsRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshed?: () => void;
}

export const SecretsRadarModal: React.FC<SecretsRadarModalProps> = ({
  isOpen,
  onClose,
  onRefreshed,
}) => {
  const [report, setReport] = useState<GlobalSecretsRadarReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [shielding, setShielding] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'safe'>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await EntropyApiClient.getGlobalSecretsRadar();
      setReport(data);
    } catch (err) {
      console.error('Failed to load secrets radar:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleShieldAll = async () => {
    setShielding(true);
    try {
      const res = await EntropyApiClient.shieldAllWorkspacesSecrets();
      if (res.success) {
        showToast(res.message || 'Successfully shielded all repositories!');
        await loadData();
        onRefreshed?.();
      } else {
        showToast(`Shielding warning: ${res.message}`);
      }
    } catch (err: unknown) {
      showToast(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setShielding(false);
    }
  };

  const handleCopy = async (path: string, key: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {}
  };

  const handleOpenExplorer = async (path: string) => {
    await EntropyApiClient.openInExplorer(path);
  };

  const filteredItems = (report?.items || []).filter((item) => {
    if (filter === 'all') return true;
    return item.risk === filter;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[85vh] flex flex-col bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-0)]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                Global Developer Secrets Radar
              </h2>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Automated credential, private key, and environment leak detection across all local repositories
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-surface-2)] transition-colors"
              title="Refresh secrets audit"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-white hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMessage && (
          <div className="px-6 py-2 bg-[var(--color-success-bg)] border-b border-[var(--color-success-border)] text-[var(--color-success)] text-xs font-medium flex items-center gap-2 animate-fade-in">
            <Check className="w-4 h-4 text-[var(--color-success)]" />
            {toastMessage}
          </div>
        )}

        {/* KPI Banner & 1-Click Action Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-6 bg-[var(--color-surface-0)]/60 border-b border-[var(--color-border)]">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl p-3.5 flex flex-col justify-between">
            <span className="text-xs text-[var(--color-text-tertiary)]">Audited Repositories</span>
            <span className="text-2xl font-bold font-mono text-[var(--color-text-primary)]">
              {report?.total_repositories ?? 0}
            </span>
          </div>

          <div className="bg-[var(--color-surface-1)] border border-[var(--color-danger-border)] rounded-xl p-3.5 flex flex-col justify-between">
            <span className="text-xs text-[var(--color-danger)] font-medium">Tracked in Git (Critical)</span>
            <span className="text-2xl font-bold font-mono text-[var(--color-danger)]">
              {report?.tracked_count ?? 0}
            </span>
          </div>

          <div className="bg-[var(--color-surface-1)] border border-[var(--color-warning-border)] rounded-xl p-3.5 flex flex-col justify-between">
            <span className="text-xs text-[var(--color-warning)] font-medium">Unignored on Disk</span>
            <span className="text-2xl font-bold font-mono text-[var(--color-warning)]">
              {report?.unignored_count ?? 0}
            </span>
          </div>

          <div className="flex flex-col justify-center">
            <button
              onClick={handleShieldAll}
              disabled={shielding || ((report?.tracked_count ?? 0) === 0 && (report?.unignored_count ?? 0) === 0)}
              className="w-full py-3 px-4 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ShieldCheck className={`w-4 h-4 ${shielding ? 'animate-spin' : ''}`} />
              {shielding ? 'Shielding Repositories...' : 'Shield All Repositories'}
            </button>
            <span className="text-[10px] text-center text-[var(--color-text-tertiary)] mt-1.5">
              1-click untracks & adds to .gitignore
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs">
          <span className="text-[var(--color-text-tertiary)] font-medium">Filter:</span>
          <button
            onClick={() => setFilter('all')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              filter === 'all'
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]'
            }`}
          >
            All ({report?.items?.length ?? 0})
          </button>
          <button
            onClick={() => setFilter('critical')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              filter === 'critical'
                ? 'bg-rose-600 text-white'
                : 'text-rose-300 hover:bg-rose-950/40'
            }`}
          >
            Tracked in Git ({report?.tracked_count ?? 0})
          </button>
          <button
            onClick={() => setFilter('warning')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              filter === 'warning'
                ? 'bg-[var(--color-warning)] text-black font-semibold'
                : 'text-[var(--color-warning)] hover:bg-[var(--color-warning-bg)]'
            }`}
          >
            Unignored ({report?.unignored_count ?? 0})
          </button>
          <button
            onClick={() => setFilter('safe')}
            className={`px-2.5 py-1 rounded-lg transition-all ${
              filter === 'safe'
                ? 'bg-[var(--color-success)] text-black font-semibold'
                : 'text-[var(--color-success)] hover:bg-[var(--color-success-bg)]'
            }`}
          >
            Protected ({report?.protected_count ?? 0})
          </button>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2.5 divide-y divide-[var(--color-border)]/40">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-[var(--color-text-tertiary)] gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[var(--color-accent)]" />
              <p className="text-xs">Auditing repositories for secrets...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-[var(--color-text-tertiary)] gap-2">
              <ShieldCheck className="w-10 h-10 text-[var(--color-success)] opacity-80" />
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">All Repositories are Clean</p>
              <p className="text-xs">No unignored or tracked credentials detected.</p>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const itemKey = `${item.repo_path}_${item.path}_${idx}`;
              return (
                <div
                  key={itemKey}
                  className="pt-2.5 first:pt-0 flex items-center justify-between gap-4 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        item.risk === 'critical'
                          ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]'
                          : item.risk === 'warning'
                          ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]'
                          : 'bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]'
                      }`}
                    >
                      {item.risk === 'critical' ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : item.risk === 'warning' ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Shield className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-xs text-[var(--color-text-primary)] truncate">
                          {item.path}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            item.status === 'tracked'
                              ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]'
                              : item.status === 'unignored'
                              ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]'
                              : 'bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]'
                          }`}
                        >
                          {item.status === 'tracked'
                            ? 'Tracked in Git (Dangerous)'
                            : item.status === 'unignored'
                            ? 'Unignored on disk'
                            : 'Protected in .gitignore'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)] font-mono truncate mt-0.5">
                        <FolderGit2 className="w-3 h-3 text-[var(--color-accent)] shrink-0" />
                        <span>{item.repo_name}</span>
                        <span className="opacity-40">•</span>
                        <span className="truncate">{item.repo_path}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleCopy(`${item.repo_path}\\${item.path}`, itemKey)}
                      title="Copy full path"
                      className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
                    >
                      {copiedKey === itemKey ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => handleOpenExplorer(item.repo_path)}
                      title="Open repository folder"
                      className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface-0)] flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
          <span>Zero-data-loss guarantee: untracking preserves local files on disk.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[var(--color-surface-2)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

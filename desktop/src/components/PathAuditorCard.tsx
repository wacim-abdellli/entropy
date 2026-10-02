import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Split,
  Wrench,
} from 'lucide-react';
import { PathAuditReport, PathPruneResult } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface PathAuditorCardProps {
  onRefreshParent?: () => void;
}

export const PathAuditorCard: React.FC<PathAuditorCardProps> = ({ onRefreshParent }) => {
  const [report, setReport] = useState<PathAuditReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPruning, setIsPruning] = useState(false);
  const [pruneResult, setPruneResult] = useState<PathPruneResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Auto-dismiss prune result notification
  useEffect(() => {
    if (!pruneResult) return;
    const timer = setTimeout(() => {
      setPruneResult(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [pruneResult]);

  const fetchAudit = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await EntropyApiClient.getPathAudit();
      setReport(data);
    } catch (err) {
      console.warn('Failed to audit PATH:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const handlePrune = async (removeDead = true, removeDuplicates = true) => {
    setIsPruning(true);
    setPruneResult(null);
    try {
      const res = await EntropyApiClient.pruneUserPath(removeDead, removeDuplicates);
      setPruneResult(res);
      await fetchAudit();
      onRefreshParent?.();
    } catch (err: unknown) {
      setPruneResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsPruning(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  if (isLoading && !report) {
    return (
      <div className="p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] animate-pulse space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-48 bg-[var(--color-surface-3)] rounded" />
          <div className="h-5 w-24 bg-[var(--color-surface-3)] rounded-full" />
        </div>
        <div className="h-4 w-3/4 bg-[var(--color-surface-2)] rounded" />
      </div>
    );
  }

  if (!report) return null;

  const lengthPercent = Math.min(100, Math.round((report.user_path_length / report.safe_length_limit) * 100));
  const hasIssues = report.dead_entries_count > 0 || report.duplicate_entries_count > 0 || report.exceeds_limit || report.collisions.length > 0;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6 space-y-5 shadow-xs">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
            report.status === 'critical'
              ? 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger)]'
              : report.status === 'warning'
              ? 'bg-[var(--color-warning-bg)] border-[var(--color-warning-border)] text-[var(--color-warning)]'
              : 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success)]'
          }`}>
            {report.status === 'critical' ? (
              <AlertTriangle size={20} />
            ) : report.status === 'warning' ? (
              <Split size={20} />
            ) : (
              <ShieldCheck size={20} />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                Windows PATH Decay &amp; Collision Auditor
              </h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                report.status === 'critical'
                  ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]'
                  : report.status === 'warning'
                  ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]'
                  : 'bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]'
              }`}>
                {report.status} ({report.health_score}/100)
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              {report.summary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchAudit}
            disabled={isLoading}
            className="p-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh PATH audit"
            aria-label="Refresh PATH audit"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>

          {hasIssues && (
            <button
              type="button"
              onClick={() => handlePrune(true, true)}
              disabled={isPruning}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white flex items-center gap-1.5 transition-opacity cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isPruning ? <Loader2 size={13} className="animate-spin" /> : <Wrench size={13} />}
              <span>Clean &amp; Deduplicate PATH</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Toast notification for prune ── */}
      {pruneResult && (
        <div className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 animate-in fade-in duration-150 ${
          pruneResult.success
            ? 'bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-success)]'
            : 'bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger)]'
        }`}>
          <div className="flex items-center gap-2 truncate">
            {pruneResult.success ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            <span className="truncate">{pruneResult.message}</span>
            {pruneResult.backup_path && (
              <span className="text-[10px] font-mono text-[var(--color-text-tertiary)] hidden sm:inline truncate">
                Backup saved: {pruneResult.backup_path}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Metrics Grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Length Gauge */}
        <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
            <span>User PATH Length</span>
            <span className="font-mono text-[10px]">{lengthPercent}% of 2KB</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className={`text-lg font-bold font-mono ${
              report.exceeds_limit ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-primary)]'
            }`}>
              {report.user_path_length.toLocaleString()}
            </span>
            <span className="text-xs text-[var(--color-text-tertiary)] font-mono">/ 2,048 chars</span>
          </div>
          <div className="w-full bg-[var(--color-surface-3)] h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full rounded-full transition-all ${
                report.exceeds_limit ? 'bg-[var(--color-danger)]' : lengthPercent > 80 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-success)]'
              }`}
              style={{ width: `${Math.min(100, lengthPercent)}%` }}
            />
          </div>
        </div>

        {/* Total Entries */}
        <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] flex flex-col justify-between">
          <span className="text-xs text-[var(--color-text-tertiary)]">Active Directories</span>
          <div className="mt-2 text-lg font-bold font-mono text-[var(--color-text-primary)]">
            {report.user_entries_count}
          </div>
          <span className="text-[11px] text-[var(--color-text-tertiary)] mt-1">user path entries</span>
        </div>

        {/* Dead Paths */}
        <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] flex flex-col justify-between">
          <span className="text-xs text-[var(--color-text-tertiary)]">Dead / Missing Folders</span>
          <div className={`mt-2 text-lg font-bold font-mono ${
            report.dead_entries_count > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'
          }`}>
            {report.dead_entries_count}
          </div>
          <span className="text-[11px] text-[var(--color-text-tertiary)] mt-1">deleted software residue</span>
        </div>

        {/* Duplicate Entries */}
        <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] flex flex-col justify-between">
          <span className="text-xs text-[var(--color-text-tertiary)]">Duplicate Entries</span>
          <div className={`mt-2 text-lg font-bold font-mono ${
            report.duplicate_entries_count > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'
          }`}>
            {report.duplicate_entries_count}
          </div>
          <span className="text-[11px] text-[var(--color-text-tertiary)] mt-1">redundant repeated paths</span>
        </div>
      </div>

      {/* ── Binary Collisions & Shadowing ── */}
      {report.collisions.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
            <Split size={14} className="text-[var(--color-warning)]" />
            <span>Binary Shadowing &amp; Version Collisions ({report.collisions.length})</span>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {report.collisions.map((c) => (
              <div
                key={c.binary}
                className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[var(--color-text-primary)] px-2 py-0.5 rounded bg-[var(--color-surface-3)]">
                      {c.binary}
                    </span>
                    <span className="text-[11px] text-[var(--color-warning)] font-medium">
                      {c.total_found} instances found in PATH
                    </span>
                  </div>
                  {c.active_version && (
                    <span className="font-mono text-[11px] text-[var(--color-text-tertiary)]">
                      {c.active_version}
                    </span>
                  )}
                </div>

                <div className="space-y-1 font-mono text-[11px]">
                  {/* Active winner */}
                  <div className="flex items-center gap-2 p-1.5 rounded bg-[var(--color-success-bg)]/40 border border-[var(--color-success-border)]/40 text-[var(--color-success)]">
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[var(--color-success)] text-black uppercase shrink-0">
                      Active
                    </span>
                    <span className="truncate flex-1" title={c.active_path}>{c.active_path}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(c.active_path)}
                      className="p-1 hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                      title={copiedText === c.active_path ? "Copied!" : "Copy path"}
                      aria-label="Copy active path"
                    >
                      {copiedText === c.active_path ? <Check size={12} className="text-[var(--color-success)]" /> : <Copy size={12} />}
                    </button>
                  </div>

                  {/* Shadowed losers */}
                  {c.shadowed_paths.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-1.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]"
                    >
                      <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-[var(--color-surface-4)] text-[var(--color-text-tertiary)] uppercase shrink-0">
                        Shadowed
                      </span>
                      <span className="truncate flex-1" title={s}>{s}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(s)}
                        className="p-1 hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                        title="Copy path"
                        aria-label="Copy shadowed path"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dead Paths & Duplicate Drawer ── */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs font-semibold text-[var(--color-accent-strong)] hover:underline flex items-center gap-1.5 cursor-pointer"
        >
          <span>{showDetails ? 'Hide Detailed Entry Inventory' : `View All ${report.user_entries_count} Entries & Dead Paths`}</span>
        </button>

        {showDetails && (
          <div className="mt-3 p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] space-y-2 animate-in fade-in duration-150">
            <div className="max-h-60 overflow-y-auto space-y-1.5 font-mono text-[11px]">
              {report.user_entries.map((entry) => (
                <div
                  key={entry.index}
                  className={`flex items-center justify-between p-2 rounded border gap-2 ${
                    !entry.is_valid
                      ? 'bg-[var(--color-danger-bg)]/40 border-[var(--color-danger-border)] text-[var(--color-danger)]'
                      : entry.is_duplicate
                      ? 'bg-[var(--color-warning-bg)]/40 border-[var(--color-warning-border)] text-[var(--color-warning)]'
                      : 'bg-[var(--color-surface-1)] border-[var(--color-border-subtle)] text-[var(--color-text-secondary)]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[9px] text-[var(--color-text-tertiary)] w-5 text-right shrink-0">
                      #{entry.index + 1}
                    </span>
                    {!entry.is_valid && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[var(--color-danger)] text-white uppercase shrink-0">
                        Dead
                      </span>
                    )}
                    {entry.is_duplicate && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[var(--color-warning)] text-black uppercase shrink-0">
                        Duplicate
                      </span>
                    )}
                    <span className="truncate" title={entry.raw}>{entry.raw}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(entry.raw)}
                    className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors shrink-0 cursor-pointer"
                    title="Copy path"
                    aria-label="Copy path"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

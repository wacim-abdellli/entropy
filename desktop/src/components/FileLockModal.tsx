import React, { useState } from 'react';
import {
  Unlock,
  Lock,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Shield,
  Folder,
  FileCode,
  Zap,
  Terminal,
} from 'lucide-react';
import { FileLockDiagnostic, LockingProcess } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface FileLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPath?: string;
  onUnlocked?: (path: string) => void;
}

export const FileLockModal: React.FC<FileLockModalProps> = ({
  isOpen,
  onClose,
  initialPath = '',
  onUnlocked,
}) => {
  const [targetPath, setTargetPath] = useState(initialPath);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [diagnostic, setDiagnostic] = useState<FileLockDiagnostic | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialPath) {
      setTargetPath(initialPath);
      handleDiagnose(initialPath);
    }
  }, [initialPath]);

  const handleDiagnose = async (pathToScan?: string) => {
    const p = pathToScan || targetPath;
    if (!p.trim()) return;

    setIsDiagnosing(true);
    setActionMessage(null);
    try {
      const res = await EntropyApiClient.getFileLocks(p.trim());
      setDiagnostic(res);
    } catch (err) {
      console.warn('File lock diagnosis failed:', err);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handlePickFolder = async () => {
    try {
      const selected = await EntropyApiClient.pickFolder();
      if (selected) {
        setTargetPath(selected);
        handleDiagnose(selected);
      }
    } catch (err) {
      console.warn('Folder picker failed:', err);
    }
  };

  const handleUnlockSingle = async (proc: LockingProcess) => {
    if (!diagnostic || isUnlocking) return;
    setIsUnlocking(true);
    try {
      const res = await EntropyApiClient.unlockFilePath(diagnostic.path, [proc.pid]);
      if (res.success) {
        setActionMessage(`Terminated ${proc.name} (PID ${proc.pid}).`);
        await handleDiagnose(diagnostic.path);
        if (onUnlocked) onUnlocked(diagnostic.path);
      } else {
        setActionMessage(res.message || 'Failed to terminate process.');
      }
    } catch (err) {
      setActionMessage('Failed to free lock.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleUnlockAll = async () => {
    if (!diagnostic || isUnlocking) return;
    setIsUnlocking(true);
    try {
      const terminablePids = diagnostic.locking_processes
        .filter((p) => p.can_terminate)
        .map((p) => p.pid);

      const res = await EntropyApiClient.unlockFilePath(diagnostic.path, terminablePids);
      if (res.success) {
        setActionMessage(res.message || 'Unlocked successfully.');
        await handleDiagnose(diagnostic.path);
        if (onUnlocked) onUnlocked(diagnostic.path);
      } else {
        setActionMessage(res.message || 'Could not terminate all processes.');
      }
    } catch (err) {
      setActionMessage('Error unlocking file.');
    } finally {
      setIsUnlocking(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 flex items-center justify-center text-[var(--color-accent)] shrink-0">
              <Unlock size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <span>File &amp; Folder Lock Unblocker</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">
                  Restart Manager API
                </span>
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Identify and terminate hidden processes locking files or blocking deletes with EBUSY.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] cursor-pointer transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search & Path Input */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDiagnose()}
                placeholder="Paste path to locked file or folder (e.g. C:\dev\app\node_modules)..."
                className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs font-mono text-[var(--color-text-primary)] focus:outline-hidden focus:border-[var(--color-accent)] placeholder:text-[var(--color-text-tertiary)]"
              />
            </div>
            <button
              type="button"
              onClick={handlePickFolder}
              className="px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
              title="Pick folder from Windows Explorer"
            >
              <Folder size={14} />
              <span>Browse…</span>
            </button>
            <button
              type="button"
              onClick={() => handleDiagnose()}
              disabled={isDiagnosing || !targetPath.trim()}
              className="px-4 py-2 rounded-xl bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 transition-opacity"
            >
              {isDiagnosing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              <span>Diagnose</span>
            </button>
          </div>

          {actionMessage && (
            <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] flex items-center gap-2">
              <CheckCircle2 size={14} className="text-[var(--color-success)] shrink-0" />
              <span>{actionMessage}</span>
            </div>
          )}

          {/* Diagnostic Result */}
          {diagnostic && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Diagnostic Result
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  diagnostic.is_locked
                    ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)] border border-[var(--color-danger)]/30'
                    : 'bg-[var(--color-success)]/15 text-[var(--color-success)] border border-[var(--color-success)]/30'
                }`}>
                  {diagnostic.is_locked ? `Locked (${diagnostic.locking_processes.length} Processes)` : 'Free & Unlocked'}
                </span>
              </div>

              {!diagnostic.is_locked ? (
                <div className="p-6 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/40 text-center space-y-2">
                  <CheckCircle2 size={32} className="mx-auto text-[var(--color-success)]" />
                  <div className="text-xs font-semibold text-[var(--color-text-primary)]">
                    No Active Locks on Path
                  </div>
                  <p className="text-[11px] text-[var(--color-text-tertiary)] max-w-sm mx-auto">
                    This file or folder has no open file descriptors or active process handles. It is safe to delete, move, or modify.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {diagnostic.locking_processes.map((proc) => (
                    <div
                      key={proc.pid}
                      className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-3)] flex items-center justify-center text-[var(--color-text-secondary)] shrink-0 mt-0.5">
                          {proc.ports.length > 0 ? <Terminal size={15} /> : <FileCode size={15} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                              {proc.name}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
                              PID {proc.pid}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">
                              {proc.memory_formatted}
                            </span>
                            {proc.ports.map((port) => (
                              <span
                                key={port}
                                className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent-strong)] border border-[var(--color-accent)]/30"
                              >
                                Port {port}
                              </span>
                            ))}
                          </div>
                          <div className="text-[11px] font-mono text-[var(--color-text-tertiary)] truncate mt-1">
                            {proc.exe_path || proc.cmdline}
                          </div>
                          <div className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
                            Lock reason: {proc.source === 'cwd_lock' ? 'Working directory is inside path' : 'Open file handle held'}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 self-end sm:self-center">
                        {proc.is_protected ? (
                          <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] px-2.5 py-1 rounded-lg bg-[var(--color-surface-3)]">
                            <Shield size={12} className="text-[var(--color-warning)]" />
                            <span>Protected Process</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUnlockSingle(proc)}
                            disabled={isUnlocking}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-danger)]/15 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/25 border border-[var(--color-danger)]/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                          >
                            <Zap size={12} />
                            <span>Free Handle</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 px-5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/30">
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            Powered by Windows NT Restart Manager API. Protected IDE and system processes are shielded.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
            >
              Close
            </button>

            {diagnostic && diagnostic.is_locked && (
              <button
                type="button"
                onClick={handleUnlockAll}
                disabled={isUnlocking}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-[var(--color-danger)] hover:opacity-90 text-white flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50 transition-all"
              >
                {isUnlocking ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />}
                <span>Unlock All &amp; Terminate Blockers</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

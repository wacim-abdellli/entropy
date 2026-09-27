import React, { useState, useEffect } from 'react';
import {
  Unlock,
  Lock,
  X,
  Search,
  CheckCircle2,
  Loader2,
  Shield,
  FolderOpen,
  FolderSearch,
  FileText,
  Terminal,
  Cpu,
  Copy,
  Check,
  XCircle,
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
  const [copiedPid, setCopiedPid] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && initialPath) {
      setTargetPath(initialPath);
      handleDiagnose(initialPath);
    }
  }, [isOpen, initialPath]);

  // Global Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
        setActionMessage(res.message || 'All locking processes terminated.');
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

  const handleCopyPath = (text: string, pid: number) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedPid(pid);
    setTimeout(() => {
      setCopiedPid((prev) => (prev === pid ? null : prev));
    }, 1500);
  };

  if (!isOpen) return null;

  const terminableCount = diagnostic?.locking_processes.filter((p) => p.can_terminate).length || 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/40">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)] shrink-0">
              <Unlock size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                File &amp; Folder Lock Unblocker
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)] truncate">
                Find and terminate processes locking this path to allow deleting, moving, or editing
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] cursor-pointer transition-colors shrink-0"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Path Input Row */}
          <div className="flex gap-2.5 items-center">
            <div className="relative flex-1 flex items-center">
              <FolderSearch size={15} className="absolute left-3.5 text-[var(--color-text-tertiary)] pointer-events-none" />
              <input
                type="text"
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDiagnose()}
                placeholder="Path to locked file or folder (e.g. C:\dev\project\node_modules)..."
                className="w-full h-10 bg-[var(--color-surface-2)] border border-[var(--color-border)] focus:border-[var(--color-accent)] rounded-xl pl-10 pr-8 text-xs font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] transition-colors focus:outline-hidden"
              />
              {targetPath && (
                <button
                  type="button"
                  onClick={() => {
                    setTargetPath('');
                    setDiagnostic(null);
                  }}
                  className="absolute right-2.5 p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                  title="Clear input"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={handlePickFolder}
              className="h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
              title="Browse folder via Windows Explorer"
            >
              <FolderOpen size={14} />
              <span>Browse…</span>
            </button>
            <button
              type="button"
              onClick={() => handleDiagnose()}
              disabled={isDiagnosing || !targetPath.trim()}
              className="h-10 px-4 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0 transition-all shadow-sm"
            >
              {isDiagnosing ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              <span>Diagnose</span>
            </button>
          </div>

          {/* Action Message Banner */}
          {actionMessage && (
            <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-[var(--color-success)] shrink-0" />
                <span>{actionMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionMessage(null)}
                className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Diagnostic Loading State */}
          {isDiagnosing && (
            <div className="p-8 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/30 text-center space-y-2">
              <Loader2 size={24} className="mx-auto text-[var(--color-accent)] animate-spin" />
              <div className="text-xs font-medium text-[var(--color-text-secondary)]">
                Inspecting active handles and file locks…
              </div>
            </div>
          )}

          {/* Diagnostic Result */}
          {!isDiagnosing && diagnostic && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Diagnostic Results
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    diagnostic.is_locked
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}
                >
                  {diagnostic.is_locked ? (
                    <>
                      <Lock size={12} />
                      <span>
                        Locked ({diagnostic.locking_processes.length}{' '}
                        {diagnostic.locking_processes.length === 1 ? 'Process' : 'Processes'})
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={12} />
                      <span>Free &amp; Unlocked</span>
                    </>
                  )}
                </span>
              </div>

              {!diagnostic.is_locked ? (
                <div className="p-6 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/30 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                    <CheckCircle2 size={20} />
                  </div>
                  <div className="text-xs font-semibold text-[var(--color-text-primary)]">
                    No Active Locks on Path
                  </div>
                  <p className="text-xs text-[var(--color-text-tertiary)] max-w-md mx-auto">
                    This file or folder has no open file descriptors or active process locks. It is safe to delete, move, or modify.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {diagnostic.locking_processes.map((proc) => {
                    const isPortHolder = proc.ports && proc.ports.length > 0;
                    return (
                      <div
                        key={proc.pid}
                        className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 hover:bg-[var(--color-surface-2)]/90 transition-colors flex flex-col gap-3"
                      >
                        {/* Process Header & Terminate Action */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-[var(--color-surface-3)] border border-[var(--color-border-subtle)] flex items-center justify-center text-[var(--color-text-secondary)] shrink-0">
                              {isPortHolder ? (
                                <Terminal size={16} className="text-sky-400" />
                              ) : (
                                <Cpu size={16} className="text-[var(--color-text-secondary)]" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                                  {proc.name}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]">
                                  PID {proc.pid}
                                </span>
                                {proc.memory_formatted && (
                                  <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
                                    {proc.memory_formatted}
                                  </span>
                                )}
                                {proc.ports.map((port) => (
                                  <span
                                    key={port}
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20"
                                  >
                                    :{port}
                                  </span>
                                ))}
                              </div>
                              <div className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-1.5 mt-0.5">
                                {proc.source === 'cwd_lock' ? (
                                  <span className="text-amber-400/90 flex items-center gap-1 font-medium">
                                    <FolderOpen size={11} />
                                    <span>Working directory set to target folder</span>
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <FileText size={11} />
                                    <span>Open file handle held on target</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Action Button */}
                          <div className="shrink-0">
                            {proc.is_protected ? (
                              <div
                                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-3)] border border-[var(--color-border-subtle)]"
                                title="Protected Windows system or IDE process shielded from accidental termination"
                              >
                                <Shield size={13} className="text-amber-400" />
                                <span>Shielded</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleUnlockSingle(proc)}
                                disabled={isUnlocking}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 active:bg-rose-700 border border-rose-500/25 hover:border-rose-600 transition-all cursor-pointer disabled:opacity-40"
                              >
                                <XCircle size={13} />
                                <span>Terminate</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Executable Path & Quick Copy */}
                        {(proc.exe_path || proc.cmdline) && (
                          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--color-surface-3)]/60 border border-[var(--color-border-subtle)] text-[11px] font-mono text-[var(--color-text-secondary)]">
                            <span
                              className="truncate select-all"
                              title={proc.exe_path || proc.cmdline}
                            >
                              {proc.exe_path || proc.cmdline}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyPath(proc.exe_path || proc.cmdline, proc.pid)}
                              className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-4)] transition-colors cursor-pointer shrink-0"
                              title="Copy executable path"
                            >
                              {copiedPid === proc.pid ? (
                                <Check size={12} className="text-[var(--color-success)]" />
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Guide empty state before search */}
          {!diagnostic && !isDiagnosing && (
            <div className="p-8 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/20 text-center space-y-2">
              <FolderSearch size={28} className="mx-auto text-[var(--color-text-tertiary)]" />
              <div className="text-xs font-medium text-[var(--color-text-secondary)]">
                Ready to Diagnose
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)] max-w-sm mx-auto">
                Enter a file or folder path above or click Browse to inspect processes holding locks or blocking file operations.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 px-5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/30 gap-3">
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)] min-w-0">
            <Shield size={14} className="text-emerald-400 shrink-0" />
            <span className="truncate">
              System and IDE processes are shielded from termination
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
            >
              Close
            </button>

            {diagnostic && diagnostic.is_locked && terminableCount > 0 && (
              <button
                type="button"
                onClick={handleUnlockAll}
                disabled={isUnlocking}
                className="whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white flex items-center gap-2 cursor-pointer shadow-sm hover:shadow disabled:opacity-40 transition-all"
              >
                {isUnlocking ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Unlock size={13} />
                )}
                <span>Terminate All Blockers ({terminableCount})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

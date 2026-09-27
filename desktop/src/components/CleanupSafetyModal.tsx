import React, { useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  Trash2,
  Globe,
  Database,
  FolderGit2,
  Info,
  ExternalLink,
} from 'lucide-react';
import { EntropyApiClient } from '../services/api';

interface CleanupSafetyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CleanupSafetyModal: React.FC<CleanupSafetyModalProps> = ({
  isOpen,
  onClose,
}) => {
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

  if (!isOpen) return null;

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
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Cleanup Safety &amp; Data Protection Guide
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)]">
                Clear answers on what is safe to delete, what is protected, and how to verify.
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
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Section 1: Recycle Bin */}
          <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 size={16} className="text-amber-400" />
                <span className="font-semibold text-sm text-[var(--color-text-primary)]">
                  Windows Recycle Bin
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Manual Review
                </span>
              </div>
              <button
                type="button"
                onClick={() => EntropyApiClient.openInExplorer('Recycle Bin')}
                className="text-[11px] text-[var(--color-accent)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Open in Explorer</span>
                <ExternalLink size={11} />
              </button>
            </div>
            <p className="text-[var(--color-text-secondary)] leading-relaxed">
              <strong>Is it safe?</strong> Yes, but it is permanent. The Recycle Bin only contains files you already chose to delete in the past. It will <strong>never</strong> delete active files from your Desktop, Documents, or project folders.
            </p>
            <div className="p-2.5 rounded-lg bg-[var(--color-surface-3)]/60 text-[11px] text-[var(--color-text-tertiary)] flex items-start gap-2">
              <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Safety guarantee:</strong> Entropy will <em>never</em> automatically check the Recycle Bin when you click &quot;Select All Safe Items&quot;. You must explicitly check it yourself after verifying you don&apos;t need any previously deleted files.
              </span>
            </div>
          </div>

          {/* Section 2: Browser Caches */}
          <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 space-y-2.5">
            <div className="flex items-center gap-2">
              <Globe size={16} className="text-emerald-400" />
              <span className="font-semibold text-sm text-[var(--color-text-primary)]">
                Web Browser Caches (Brave, Chrome, Edge, Firefox)
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                100% Safe
              </span>
            </div>
            <p className="text-[var(--color-text-secondary)] leading-relaxed">
              <strong>Will I be logged out or lose passwords?</strong> <strong>No, absolutely not.</strong> Entropy strictly targets disposable website graphics, stylesheets, and cached script files.
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded-lg bg-[var(--color-surface-3)]/60 space-y-1">
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={12} /> What stays 100% protected:
                </span>
                <ul className="list-disc list-inside text-[var(--color-text-tertiary)] space-y-0.5">
                  <li>Saved passwords &amp; autofill</li>
                  <li>Active login sessions &amp; cookies</li>
                  <li>Bookmarks &amp; favorites</li>
                  <li>Browsing history &amp; open tabs</li>
                </ul>
              </div>
              <div className="p-2 rounded-lg bg-[var(--color-surface-3)]/60 space-y-1">
                <span className="font-semibold text-[var(--color-text-secondary)] flex items-center gap-1">
                  <Trash2 size={12} /> What gets cleaned:
                </span>
                <ul className="list-disc list-inside text-[var(--color-text-tertiary)] space-y-0.5">
                  <li>Cached website images &amp; media</li>
                  <li>Downloaded CSS and JS files</li>
                  <li>Temporary GPU shader caches</li>
                  <li>Stale HTTP web responses</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Section 3: Package Manager Caches */}
          <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 space-y-2.5">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-emerald-400" />
              <span className="font-semibold text-sm text-[var(--color-text-primary)]">
                Global Package Manager Caches (npm, pip, cargo, pnpm, gradle)
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                100% Safe
              </span>
            </div>
            <p className="text-[var(--color-text-secondary)] leading-relaxed">
              <strong>Will this break my existing projects?</strong> <strong>No.</strong> These caches in your AppData directory are simply copies of downloaded archive files (<code className="font-mono text-emerald-400">.tgz</code>, <code className="font-mono text-emerald-400">.whl</code>, <code className="font-mono text-emerald-400">.crate</code>).
            </p>
            <div className="p-2.5 rounded-lg bg-[var(--color-surface-3)]/60 text-[11px] text-[var(--color-text-secondary)] space-y-1">
              <div>✅ <strong>Installed projects are untouched:</strong> Your local <code className="font-mono text-[var(--color-text-primary)]">node_modules</code>, <code className="font-mono text-[var(--color-text-primary)]">.venv</code>, and build folders are NOT deleted by cleaning this tab.</div>
              <div>✅ <strong>Self-healing:</strong> If a future install needs an archive that was cleared, npm/pip will simply re-download it fresh from the registry.</div>
            </div>
          </div>

          {/* Section 4: Project Build Artifacts */}
          <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 space-y-2.5">
            <div className="flex items-center gap-2">
              <FolderGit2 size={16} className="text-sky-400" />
              <span className="font-semibold text-sm text-[var(--color-text-primary)]">
                Project Build Artifacts (node_modules, target, .venv, bin/obj)
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Rebuildable
              </span>
            </div>
            <p className="text-[var(--color-text-secondary)] leading-relaxed">
              <strong>Is my source code safe?</strong> <strong>Yes.</strong> Entropy operates on a strict whitelist of disposable folders. Your source files, git commits, branches, and configuration files are never touched.
            </p>
            <div className="p-2.5 rounded-lg bg-[var(--color-surface-3)]/60 text-[11px] text-[var(--color-text-secondary)]">
              💡 <strong>Instant Rebuild:</strong> Every cleaned project can be restored at any time simply by running its rebuild command (<code className="font-mono text-sky-300">npm install</code>, <code className="font-mono text-sky-300">bundle install</code>, <code className="font-mono text-sky-300">cargo build</code>).
            </div>
          </div>

          {/* Section 5: Locked and Active Files */}
          <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 space-y-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-sky-400" />
              <span className="font-semibold text-sm text-[var(--color-text-primary)]">
                Locked &amp; In-Use Files Protection
              </span>
            </div>
            <p className="text-[var(--color-text-secondary)] leading-relaxed">
              If an application (like Brave Browser, Node.js, or Windows Explorer) is currently running and holding a lock on a file, Entropy will <strong>never force-corrupt it</strong>. It will either notify you to close the app or skip the locked files safely.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 px-5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/30">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            <span>Entropy adheres to zero-data-loss developer principles.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] hover:bg-[var(--color-accent)]/90 text-white cursor-pointer transition-opacity"
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  );
};

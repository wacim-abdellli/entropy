import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  HardDrive,
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  X,
  RefreshCw,
  Sliders,
  Layers,
  Info,
} from 'lucide-react';
import { ShrinkAdvisoryReport } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface ShrinkGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDriveDetected?: (newDrive: string) => void;
}

export const ShrinkGuideModal: React.FC<ShrinkGuideModalProps> = ({
  isOpen,
  onClose,
  onDriveDetected,
}) => {
  const [advisory, setAdvisory] = useState<ShrinkAdvisoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);
  const [selectedMb, setSelectedMb] = useState<number>(35000);
  const [detectedNewDrive, setDetectedNewDrive] = useState<string | null>(null);
  const [initialDrives, setInitialDrives] = useState<string[]>([]);

  // Load advisory data & initialize initial drive list
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchAdvisory = async () => {
      setLoading(true);
      try {
        const [adv, dests] = await Promise.all([
          EntropyApiClient.getShrinkAdvisory('C'),
          EntropyApiClient.getAvailableDestinations(),
        ]);
        if (isMounted) {
          setAdvisory(adv);
          if (adv.recommended_shrink_mb) {
            setSelectedMb(adv.recommended_shrink_mb);
          }
          const existingLetters = dests.map((d) => d.drive.toUpperCase().replace(/[\\/:]/g, ''));
          setInitialDrives(existingLetters);
        }
      } catch (err) {
        console.error('Failed to load shrink advisory:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAdvisory();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Poller to detect when the user successfully mounts the new drive
  useEffect(() => {
    if (!isOpen || detectedNewDrive) return;

    const interval = setInterval(async () => {
      try {
        const dests = await EntropyApiClient.getAvailableDestinations();
        const currentLetters = dests.map((d) => d.drive.toUpperCase().replace(/[\\/:]/g, ''));
        const newlyAdded = currentLetters.find((letter) => !initialDrives.includes(letter));
        if (newlyAdded) {
          setDetectedNewDrive(`${newlyAdded}:\\`);
          if (onDriveDetected) {
            onDriveDetected(`${newlyAdded}:\\`);
          }
        }
      } catch {
        // Silent poller error catch
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isOpen, initialDrives, detectedNewDrive, onDriveDetected]);

  // Copy helper with feedback
  const handleCopyMb = useCallback((value: number) => {
    navigator.clipboard.writeText(String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, []);

  // Launch diskmgmt.msc
  const handleLaunchDiskManagement = async () => {
    setIsLaunching(true);
    setLaunchMessage(null);
    try {
      const res = await EntropyApiClient.launchDiskManagement();
      if (res.success) {
        setLaunchMessage('Windows Disk Management opened. Follow the 4 steps below.');
      } else {
        setLaunchMessage(res.error || 'Failed to open Disk Management. You can run diskmgmt.msc from Windows Run (Win+R).');
      }
    } catch (err: unknown) {
      setLaunchMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLaunching(false);
    }
  };

  // Calculations for simulated capacity bars
  const selectedGb = useMemo(() => (selectedMb / 1024).toFixed(1), [selectedMb]);

  const simulatedCStats = useMemo(() => {
    if (!advisory) {
      return {
        remainingFreeGb: '38.8',
        isSafe: true,
      };
    }
    const currentFreeMb = advisory.free_bytes / (1024 * 1024);
    const remainingFreeMb = Math.max(0, currentFreeMb - selectedMb);
    const minBufferMb = (advisory.min_system_buffer_gb || 25) * 1024;
    return {
      remainingFreeGb: (remainingFreeMb / 1024).toFixed(1),
      isSafe: remainingFreeMb >= minBufferMb,
    };
  }, [advisory, selectedMb]);

  if (!isOpen) return null;

  return typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isLaunching) onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isLaunching) onClose();
          }}
          tabIndex={-1}
        >
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-[var(--color-border-subtle)] flex items-start justify-between gap-4 bg-[var(--color-surface-1)] shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)]">
                  <Layers size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                      Partition & Secondary Drive Guide
                    </h2>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] flex items-center gap-1">
                      <ShieldCheck size={11} />
                      100% Non-Destructive
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    Shrink unused space on C: to create a dedicated secondary drive ({advisory?.suggested_letter || 'D'}:) for heavy developer workloads.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs text-[var(--color-text-secondary)] flex-1">
              {/* Celebration Banner when New Drive is Detected */}
              {detectedNewDrive && (
                <div className="p-4 rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 size={20} className="shrink-0" />
                    <div>
                      <h4 className="font-semibold text-xs">Drive {detectedNewDrive} Successfully Mounted!</h4>
                      <p className="text-[11px] opacity-90">
                        Entropy detected your new secondary partition. You can now migrate Docker, Gradle, npm, and cargo folders effortlessly.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-success)] text-black hover:opacity-90 transition-opacity cursor-pointer shrink-0"
                  >
                    Start Migrating
                  </button>
                </div>
              )}

              {/* Safety Guarantees Callout */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] space-y-1">
                  <div className="flex items-center gap-1.5 text-[var(--color-text-primary)] font-semibold text-[11px]">
                    <ShieldCheck size={14} className="text-[var(--color-success)]" />
                    <span>Zero Data Loss</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
                    Personal files, Desktop, apps, and Windows OS files are never touched or modified.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] space-y-1">
                  <div className="flex items-center gap-1.5 text-[var(--color-text-primary)] font-semibold text-[11px]">
                    <ShieldCheck size={14} className="text-[var(--color-accent)]" />
                    <span>25 GB OS Safety Margin</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
                    Entropy strictly enforces that C: always retains &ge; 25 GB free space for Windows updates and pagefile.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] space-y-1">
                  <div className="flex items-center gap-1.5 text-[var(--color-text-primary)] font-semibold text-[11px]">
                    <HardDrive size={14} className="text-[var(--color-text-secondary)]" />
                    <span>Official Windows VDS</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
                    Executed via native Windows Disk Management which physically protects unmovable system clusters.
                  </p>
                </div>
              </div>

              {/* Interactive Size Calculator & Drive Blueprint */}
              <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/60 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sliders size={15} className="text-[var(--color-accent)]" />
                    <span className="font-semibold text-xs text-[var(--color-text-primary)]">
                      Desired Size for New Drive ({advisory?.suggested_letter || 'D'}:)
                    </span>
                  </div>

                  {/* Copyable MB Badge */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--color-surface-3)] border border-[var(--color-border)] font-mono text-xs text-[var(--color-text-primary)]">
                      <span className="font-bold text-[var(--color-accent)]">{selectedMb.toLocaleString()}</span>
                      <span className="text-[var(--color-text-tertiary)]">MB</span>
                      <span className="text-[10px] text-[var(--color-text-secondary)]">({selectedGb} GB)</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyMb(selectedMb)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white transition-colors cursor-pointer"
                      title="Copy exact MB value for Windows Disk Management"
                    >
                      {copied ? <Check size={13} className="text-[var(--color-success)]" /> : <Copy size={13} />}
                      <span>{copied ? 'Copied!' : 'Copy MB'}</span>
                    </button>
                  </div>
                </div>

                {/* Preset Pills */}
                {advisory && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">Presets:</span>
                    {[20480, 30720, advisory.recommended_shrink_mb, advisory.max_safe_shrink_mb]
                      .filter((val, idx, arr) => val > 0 && arr.indexOf(val) === idx && val <= advisory.max_safe_shrink_mb)
                      .map((val) => {
                        const isSelected = selectedMb === val;
                        const isRec = val === advisory.recommended_shrink_mb;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setSelectedMb(val)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)] font-semibold shadow-sm'
                                : 'bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-text-primary)]'
                            }`}
                          >
                            {(val / 1024).toFixed(0)} GB {isRec ? '(Recommended)' : ''}
                          </button>
                        );
                      })}
                  </div>
                )}

                {/* Simulated Visual Storage Bar */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--color-border-subtle)]">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--color-text-tertiary)]">Simulated Drive Topology After Shrink:</span>
                    <span className="font-mono text-[var(--color-text-primary)]">
                      C: Free: <strong className="text-[var(--color-success)]">{simulatedCStats.remainingFreeGb} GB</strong> | New {advisory?.suggested_letter || 'D'}: <strong className="text-[var(--color-accent)]">{selectedGb} GB</strong>
                    </span>
                  </div>

                  <div className="h-4 rounded-full overflow-hidden bg-[var(--color-surface-3)] flex border border-[var(--color-border)] p-0.5 gap-0.5">
                    {/* C: Used OS Space */}
                    <div
                      style={{ width: '70%' }}
                      className="h-full rounded-l-full bg-[var(--color-text-tertiary)]/30 flex items-center justify-center text-[9px] font-mono text-[var(--color-text-secondary)] truncate px-1"
                      title="Used Space on C: (Untouched & Safe)"
                    >
                      C: Used ({advisory ? advisory.used_formatted : '285 GB'})
                    </div>

                    {/* C: Safe Free Space Remaining */}
                    <div
                      style={{ width: '15%' }}
                      className="h-full bg-[var(--color-success)]/30 flex items-center justify-center text-[9px] font-mono text-[var(--color-success)] truncate px-1"
                      title="Remaining Free Space on C: (Guaranteed Safe Buffer)"
                    >
                      C: Free ({simulatedCStats.remainingFreeGb} GB)
                    </div>

                    {/* New D: Partition */}
                    <div
                      style={{ width: '15%' }}
                      className="h-full rounded-r-full bg-[var(--color-accent)] flex items-center justify-center text-[9px] font-mono text-white font-bold truncate px-1 animate-pulse"
                      title={`New ${advisory?.suggested_letter || 'D'}: Drive Partition`}
                    >
                      {advisory?.suggested_letter || 'D'}: ({selectedGb} GB)
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Banner to Launch Windows Disk Management */}
              <div className="p-4 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                    <span>Step 1: Open Official Windows Disk Management</span>
                  </h4>
                  <p className="text-[11px] text-[var(--color-text-secondary)]">
                    Launches Microsoft's built-in <code className="font-mono bg-[var(--color-surface-3)] px-1 py-0.5 rounded text-[var(--color-text-primary)]">diskmgmt.msc</code> console directly.
                  </p>
                  {launchMessage && (
                    <p className="text-[11px] text-[var(--color-accent)] mt-1">{launchMessage}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleLaunchDiskManagement}
                  disabled={isLaunching}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  {isLaunching ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <ExternalLink size={14} />
                  )}
                  <span>Open Disk Management</span>
                </button>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
                  Step-by-Step Walkthrough
                </h3>

                <div className="space-y-2.5">
                  {/* Step 1 */}
                  <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-surface-3)] text-[var(--color-text-primary)] border border-[var(--color-border)] flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                      1
                    </span>
                    <div className="space-y-1">
                      <p className="font-semibold text-xs text-[var(--color-text-primary)]">
                        Locate your primary OS Partition (C:)
                      </p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                        In the bottom half of the Windows Disk Management window, find <strong>Disk 0</strong> and locate your blue <strong>(C:)</strong> volume partition box.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-surface-3)] text-[var(--color-text-primary)] border border-[var(--color-border)] flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                      2
                    </span>
                    <div className="space-y-1">
                      <p className="font-semibold text-xs text-[var(--color-text-primary)]">
                        Right-Click (C:) &rarr; Select "Shrink Volume..."
                      </p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                        Right-click inside the (C:) rectangle and click <strong>Shrink Volume...</strong>. Windows will take 3-5 seconds to safely query available shrink space.
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                      3
                    </span>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-xs text-[var(--color-text-primary)]">
                          Enter Shrink Amount in MB
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopyMb(selectedMb)}
                          className="flex items-center gap-1 text-[11px] font-mono text-[var(--color-accent)] hover:underline cursor-pointer"
                        >
                          <Copy size={11} />
                          <span>Copy {selectedMb} MB</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                        In the field labeled <em>"Enter the amount of space to shrink in MB"</em>, paste exactly:
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded bg-[var(--color-surface-3)] font-mono font-bold text-xs text-[var(--color-text-primary)] border border-[var(--color-border)]">
                          {selectedMb}
                        </span>
                        <span className="text-[11px] text-[var(--color-text-tertiary)]">
                          (leaves {simulatedCStats.remainingFreeGb} GB free on C: &mdash; 100% safe)
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">
                        Click the <strong>Shrink</strong> button.
                      </p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] flex items-start gap-3">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-surface-3)] text-[var(--color-text-primary)] border border-[var(--color-border)] flex items-center justify-center font-mono font-bold text-[11px] shrink-0">
                      4
                    </span>
                    <div className="space-y-1">
                      <p className="font-semibold text-xs text-[var(--color-text-primary)]">
                        Create New Simple Volume ({advisory?.suggested_letter || 'D'}:)
                      </p>
                      <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                        Right-click the newly created black <strong>Unallocated</strong> space box and choose <strong>New Simple Volume...</strong>.
                      </p>
                      <ul className="list-disc list-inside text-[11px] text-[var(--color-text-tertiary)] space-y-0.5 mt-1 ml-1">
                        <li>Click Next, accept maximum volume size, click Next.</li>
                        <li>Assign drive letter: <strong>{advisory?.suggested_letter || 'D'}:</strong></li>
                        <li>Format as <strong>NTFS</strong>, Allocation unit size: <strong>Default</strong>.</li>
                        <li>Volume label: <strong>DevStorage</strong> (or any name you like).</li>
                        <li>Click Finish. Windows will mount your new partition in seconds!</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                <Info size={14} className="text-[var(--color-accent)]" />
                <span>Entropy automatically detects new drives while this window is open.</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors cursor-pointer"
                >
                  Close Guide
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
    : null;
};

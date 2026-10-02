import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  HardDrive,
  FolderSync,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Undo2,
  Info,
  XCircle,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  RelocationCandidateItem,
  AvailableDestinationItem,
  ActiveJunctionItem,
} from '../types/entropy';
import { EntropyApiClient } from '../services/api';
import { ShrinkGuideModal } from './ShrinkGuideModal';

interface RescueDriveTabProps {
  onActionComplete?: () => Promise<void> | void;
}

export const RescueDriveTab: React.FC<RescueDriveTabProps> = ({ onActionComplete }) => {
  const [candidates, setCandidates] = useState<RelocationCandidateItem[]>([]);
  const [destinations, setDestinations] = useState<AvailableDestinationItem[]>([]);
  const [junctions, setActiveJunctions] = useState<ActiveJunctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Selected target drive letter / directory
  const [selectedDrive, setSelectedDrive] = useState<string>('D:\\');
  const [customTargetFolder, setCustomTargetFolder] = useState<string>('EntropyDev');

  // Relocation Modal State
  const [targetCandidate, setTargetCandidate] = useState<RelocationCandidateItem | null>(null);
  const [showShrinkGuide, setShowShrinkGuide] = useState(false);
  const [isRelocating, setIsRelocating] = useState(false);
  const [relocateError, setRelocateError] = useState<string | null>(null);
  const [relocateSuccess, setRelocateSuccess] = useState<string | null>(null);

  // Auto-dismiss floating notices
  useEffect(() => {
    if (!relocateSuccess) return;
    const timer = setTimeout(() => {
      setRelocateSuccess(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [relocateSuccess]);

  useEffect(() => {
    if (!relocateError) return;
    const timer = setTimeout(() => {
      setRelocateError(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [relocateError]);

  // Rollback / Restore State
  const [targetRestoreJunction, setTargetRestoreJunction] = useState<ActiveJunctionItem | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const [cands, dests, juncs] = await Promise.all([
        EntropyApiClient.discoverRelocationCandidates(),
        EntropyApiClient.getAvailableDestinations(),
        EntropyApiClient.getActiveJunctions(),
      ]);
      setCandidates(cands);
      setDestinations(dests);
      setActiveJunctions(juncs);

      // Auto-select first recommended non-system destination
      const rec = dests.find((d) => d.recommended) || dests.find((d) => !d.is_system);
      if (rec) {
        setSelectedDrive(rec.drive);
      } else if (dests.length > 0) {
        setSelectedDrive(dests[0].drive);
      }
    } catch (err) {
      console.error('Failed to load rescue drive data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Total reclaimable bytes on C: from all movable candidates
  const totalReclaimableBytes = useMemo(() => {
    return candidates
      .filter((c) => c.is_moveable)
      .reduce((sum, c) => sum + c.size_bytes, 0);
  }, [candidates]);

  const totalReclaimableFormatted = useMemo(() => {
    if (totalReclaimableBytes <= 0) return '0 B';
    const gb = totalReclaimableBytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(totalReclaimableBytes / (1024 * 1024))} MB`;
  }, [totalReclaimableBytes]);

  const hasSecondaryDrive = useMemo(() => {
    return destinations.some((d) => !d.is_system);
  }, [destinations]);

  const handleExecuteRelocation = async () => {
    if (!targetCandidate) return;

    setIsRelocating(true);
    setRelocateError(null);
    setRelocateSuccess(null);

    const targetParent = `${selectedDrive.replace(/[\\/]+$/, '')}\\${customTargetFolder.trim() || 'EntropyDev'}`;

    try {
      const res = await EntropyApiClient.relocateDirectoryJunction(
        targetCandidate.original_path,
        targetParent,
        targetCandidate.id
      );

      if (res.success) {
        setRelocateSuccess(
          `Successfully moved '${targetCandidate.name}' to ${targetParent} and created transparent NTFS Directory Junction. Reclaimed ${targetCandidate.size_formatted} on C: drive.`
        );
        setTargetCandidate(null);
        await loadData(true);
        if (onActionComplete) await onActionComplete();
      } else {
        setRelocateError(res.error || 'Failed to relocate directory.');
      }
    } catch (err: unknown) {
      setRelocateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRelocating(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!targetRestoreJunction) return;

    setIsRestoring(true);
    setRelocateError(null);
    setRelocateSuccess(null);

    try {
      const res = await EntropyApiClient.restoreDirectoryJunction(targetRestoreJunction.id);
      if (res.success) {
        setRelocateSuccess(`Restored '${targetRestoreJunction.name}' back to C: drive.`);
        setTargetRestoreJunction(null);
        await loadData(true);
        if (onActionComplete) await onActionComplete();
      } else {
        setRelocateError(res.error || 'Failed to restore directory.');
      }
    } catch (err: unknown) {
      setRelocateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRestoring(false);
    }
  };

  const selectedDestinationInfo = useMemo(() => {
    return destinations.find((d) => d.drive === selectedDrive);
  }, [destinations, selectedDrive]);

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
                <FolderSync size={20} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Rescue C: Drive — Smart Directory Relocator
                </h2>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Migrate massive developer storage (Docker, package caches, build daemons) to secondary drives via transparent NTFS Directory Junctions without breaking any build tools.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-[var(--color-accent)]' : ''} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[var(--color-border-subtle)]">
          <div className="p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Reclaimable on C: Drive
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-[var(--color-success)]">{totalReclaimableFormatted}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">ready to migrate</span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Selected Target Drive
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-[var(--color-accent)]">
                {hasSecondaryDrive ? selectedDrive : 'None (C: only)'}
              </span>
              <span className="text-xs text-[var(--color-text-secondary)]">
                {hasSecondaryDrive
                  ? (selectedDestinationInfo ? `${selectedDestinationInfo.free_formatted} free` : 'Available')
                  : 'Secondary drive needed'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
            <p className="text-[11px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Active Managed Junctions
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-bold font-mono text-[var(--color-text-primary)]">{junctions.length}</span>
              <span className="text-xs text-[var(--color-text-secondary)]">redirected links</span>
            </div>
          </div>
        </div>
      </div>

      {/* Single Drive Advisory Banner */}
      {!hasSecondaryDrive && !loading && (
        <div className="p-4 rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-warning)]/20 text-[var(--color-warning)] border border-[var(--color-warning)]/30 shrink-0">
              <Layers size={20} />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                <span>Single Drive Setup Detected (C:) &mdash; Create Secondary Drive (D:)</span>
              </h3>
              <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                You have {totalReclaimableFormatted} of heavy developer data on C:, but only drive C: is currently mounted. Migrating within C: will not save space. Use our 100% safe Partition Guide to shrink unused space on C: and create drive D: in 4 simple steps.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowShrinkGuide(true)}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--color-warning)] text-black hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Sparkles size={14} />
            <span>Partition &amp; Shrink Guide</span>
          </button>
        </div>
      )}

      {/* Action Notification Alerts */}
      {relocateSuccess && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)] text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{relocateSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setRelocateSuccess(null)}
            className="p-1 hover:opacity-80 cursor-pointer"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {relocateError && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} />
            <span>{relocateError}</span>
          </div>
          <button
            type="button"
            onClick={() => setRelocateError(null)}
            className="p-1 hover:opacity-80 cursor-pointer"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* Target Drive & Destination Folder Selector */}
      <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
            Destination Drive &amp; Path Configuration
          </h3>
          {!hasSecondaryDrive && (
            <button
              type="button"
              onClick={() => setShowShrinkGuide(true)}
              className="text-xs font-medium text-[var(--color-accent)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Layers size={13} />
              <span>Create Secondary Drive (D:)</span>
            </button>
          )}
        </div>

        {!hasSecondaryDrive && (
          <div className="mb-3.5 p-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-[var(--color-warning)] shrink-0" />
              <span>Drive C: is your primary system drive. Offloading folders requires a secondary drive or partition.</span>
            </div>
            <button
              type="button"
              onClick={() => setShowShrinkGuide(true)}
              className="text-xs font-semibold text-[var(--color-accent)] hover:underline shrink-0 cursor-pointer ml-2"
            >
              Open Shrink Wizard &rarr;
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {destinations.map((dest) => {
            const isSelected = selectedDrive === dest.drive;
            return (
              <button
                key={dest.drive}
                type="button"
                onClick={() => setSelectedDrive(dest.drive)}
                className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]'
                    : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] hover:border-[var(--color-border)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive size={16} className={isSelected ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'} />
                    <span className="text-xs font-semibold text-[var(--color-text-primary)] font-mono">{dest.drive}</span>
                  </div>
                  {dest.is_system && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]">
                      System C:
                    </span>
                  )}
                  {dest.recommended && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                      Recommended
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-baseline justify-between text-xs">
                  <span className="text-[var(--color-text-secondary)]">{dest.free_formatted} Free</span>
                  <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">{dest.percent_used}% used</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-1.5">
            <Info size={14} className="text-[var(--color-accent)] shrink-0" />
            <span>
              Target directory on {selectedDrive}: <strong className="font-mono text-[var(--color-text-primary)]">{selectedDrive}{customTargetFolder}\</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-tertiary)]">Folder:</span>
            <input
              type="text"
              value={customTargetFolder}
              onChange={(e) => setCustomTargetFolder(e.target.value)}
              placeholder="EntropyDev"
              className="px-2 py-1 text-xs font-mono rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)] w-32 focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>
      </div>

      {/* Relocatable Candidates Catalog */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Heavy Developer Folders Detected on C: Drive
          </h3>
          <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
            {candidates.filter((c) => c.is_moveable).length} moveable
          </span>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {candidates.map((cand) => {
              const isAlreadyJunction = cand.is_junction;
              const isMoveable = cand.is_moveable;

              return (
                <div
                  key={cand.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/40 transition-colors gap-3"
                >
                  {/* Left: Info */}
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                        {cand.name}
                      </span>

                      {/* Size Badge */}
                      <span className="text-xs font-mono font-bold text-[var(--color-accent)] px-2 py-0.5 rounded bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20">
                        {cand.size_formatted}
                      </span>

                      {/* Item count */}
                      <span className="text-[10px] font-mono text-[var(--color-text-tertiary)]">
                        ({cand.item_count.toLocaleString()} files)
                      </span>

                      {/* Status */}
                      {isAlreadyJunction ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)] flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          Relocated via Junction
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">
                          On C: Drive
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {cand.description}
                    </p>

                    <p className="text-[11px] font-mono text-[var(--color-text-tertiary)] truncate" title={cand.original_path}>
                      {cand.original_path}
                    </p>
                  </div>

                  {/* Right: Relocate Action */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {isAlreadyJunction ? (
                      <span className="text-xs text-[var(--color-text-tertiary)] italic">Active Link</span>
                    ) : !hasSecondaryDrive ? (
                      <button
                        type="button"
                        onClick={() => setShowShrinkGuide(true)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)] hover:brightness-110 transition-colors cursor-pointer flex items-center gap-1.5"
                        title="Create secondary partition D: first to rescue C: drive"
                      >
                        <Layers size={13} />
                        <span>Requires D: Drive &mdash; Setup Guide</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTargetCandidate(cand)}
                        disabled={!isMoveable}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <FolderSync size={13} />
                        <span>Relocate to {selectedDrive}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Junctions & Rollback Manager */}
      {junctions.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-[var(--color-border-subtle)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Active Directory Junctions (Rollback Manager)
            </h3>
            <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
              {junctions.length} registered
            </span>
          </div>

          <div className="space-y-2">
            {junctions.map((junc) => (
              <div
                key={junc.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--color-text-primary)]">{junc.name}</span>
                    <span className="text-xs font-mono text-[var(--color-success)]">{junc.size_formatted}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]">
                      {new Date(junc.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-[var(--color-text-tertiary)] flex-wrap">
                    <span className="truncate max-w-xs" title={junc.original_path}>{junc.original_path}</span>
                    <ArrowRight size={11} className="text-[var(--color-accent)] shrink-0" />
                    <span className="truncate max-w-xs text-[var(--color-accent)]" title={junc.destination_path}>{junc.destination_path}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => setTargetRestoreJunction(junc)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Undo2 size={13} />
                    <span>Restore to C:</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relocation Confirmation Modal */}
      {targetCandidate && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRelocating) setTargetCandidate(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isRelocating) setTargetCandidate(null);
          }}
          tabIndex={-1}
        >
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] shrink-0">
                <FolderSync size={22} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Relocate {targetCandidate.name} to {selectedDrive}?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Files will be copied to your secondary drive, and an NTFS directory junction will be placed at the original location. All tools, build scripts, and IDEs will continue functioning transparently.
                </p>
              </div>
            </div>

            {/* Diagnostic Details */}
            <div className="p-3.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] space-y-2 mb-4 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-tertiary)]">Space Reclaimed on C:</span>
                <span className="font-semibold text-[var(--color-success)]">{targetCandidate.size_formatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-tertiary)]">Source Path:</span>
                <span className="text-[var(--color-text-secondary)] truncate max-w-xs">{targetCandidate.original_path}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-tertiary)]">Destination Path:</span>
                <span className="text-[var(--color-accent)] truncate max-w-xs">{selectedDrive}{customTargetFolder}\{targetCandidate.id}</span>
              </div>
            </div>

            {/* Safety Guarantee Info */}
            <div className="p-3 rounded-lg bg-[var(--color-surface-3)]/60 border border-[var(--color-border-subtle)] space-y-1.5 mb-5 text-xs text-[var(--color-text-secondary)]">
              <div className="flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
                <ShieldCheck size={14} className="text-[var(--color-success)]" />
                <span>100% Reversible & Safe</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Entropy uses a 2-phase migration with verification. You can revert this migration anytime with one click in the Rollback Manager.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTargetCandidate(null)}
                disabled={isRelocating}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRelocation}
                disabled={isRelocating}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isRelocating ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Migrating Files...</span>
                  </>
                ) : (
                  <>
                    <FolderSync size={13} />
                    <span>Confirm Relocation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Restore Confirmation Modal */}
      {targetRestoreJunction && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRestoring) setTargetRestoreJunction(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isRestoring) setTargetRestoreJunction(null);
          }}
          tabIndex={-1}
        >
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] text-[var(--color-warning)] shrink-0">
                <Undo2 size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Restore {targetRestoreJunction.name} to C: Drive?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  This will remove the NTFS junction link and move all files from {targetRestoreJunction.destination_path} back to their original location on C: drive.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTargetRestoreJunction(null)}
                disabled={isRestoring}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={isRestoring}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Restoring Files...</span>
                  </>
                ) : (
                  <>
                    <Undo2 size={13} />
                    <span>Restore Files</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Partition & Shrink Guide Modal */}
      <ShrinkGuideModal
        isOpen={showShrinkGuide}
        onClose={() => setShowShrinkGuide(false)}
        onDriveDetected={async (newDrive) => {
          setSelectedDrive(newDrive);
          await loadData(true);
        }}
      />
    </div>
  );
};


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
  Search,
  Copy,
  Check,
  FolderCheck,
} from 'lucide-react';
import {
  RelocationCandidateItem,
  AvailableDestinationItem,
  ActiveJunctionItem,
  CleanupLiveProgress,
} from '../types/entropy';
import { EntropyApiClient } from '../services/api';
import { ShrinkGuideModal } from './ShrinkGuideModal';

interface RescueDriveTabProps {
  onActionComplete?: () => Promise<void> | void;
}

interface RescueCache {
  candidates: RelocationCandidateItem[];
  destinations: AvailableDestinationItem[];
  junctions: ActiveJunctionItem[];
}

let cachedRescueData: RescueCache | null = null;

export const RescueDriveTab: React.FC<RescueDriveTabProps> = ({ onActionComplete }) => {
  const [candidates, setCandidates] = useState<RelocationCandidateItem[]>(() => cachedRescueData?.candidates ?? []);
  const [destinations, setDestinations] = useState<AvailableDestinationItem[]>(() => cachedRescueData?.destinations ?? []);
  const [junctions, setActiveJunctions] = useState<ActiveJunctionItem[]>(() => cachedRescueData?.junctions ?? []);
  const [loading, setLoading] = useState<boolean>(() => !cachedRescueData);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Selected target drive letter / directory
  const [selectedDrive, setSelectedDrive] = useState<string>(() => {
    if (cachedRescueData) {
      const rec = cachedRescueData.destinations.find((d) => d.recommended) || cachedRescueData.destinations.find((d) => !d.is_system);
      if (rec) return rec.drive;
      if (cachedRescueData.destinations.length > 0) return cachedRescueData.destinations[0].drive;
    }
    return 'D:\\';
  });
  const [customTargetFolder, setCustomTargetFolder] = useState<string>(() => {
    try {
      return localStorage.getItem('entropy_rescue_subfolder') || 'code';
    } catch {
      return 'code';
    }
  });

  // Relocation Modal State
  const [targetCandidate, setTargetCandidate] = useState<RelocationCandidateItem | null>(null);
  const [showShrinkGuide, setShowShrinkGuide] = useState(false);
  const [isRelocating, setIsRelocating] = useState(false);
  const [relocateError, setRelocateError] = useState<string | null>(null);
  const [relocateSuccess, setRelocateSuccess] = useState<string | null>(null);
  const [relocationProgress, setRelocationProgress] = useState<CleanupLiveProgress | null>(null);
  const [relocationFinished, setRelocationFinished] = useState<{
    name: string;
    freedFormatted: string;
    destPath: string;
  } | null>(null);

  // Auto-dismiss floating notices
  useEffect(() => {
    if (!relocateSuccess) return;
    const timer = setTimeout(() => {
      setRelocateSuccess(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [relocateSuccess]);

  useEffect(() => {
    if (!relocateError) return;
    const timer = setTimeout(() => {
      setRelocateError(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [relocateError]);

  // Rollback / Restore State
  const [targetRestoreJunction, setTargetRestoreJunction] = useState<ActiveJunctionItem | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      if (!cachedRescueData) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
    } else {
      setRefreshing(true);
    }
    try {
      const [cands, dests, juncs] = await Promise.all([
        EntropyApiClient.discoverRelocationCandidates(),
        EntropyApiClient.getAvailableDestinations(),
        EntropyApiClient.getActiveJunctions(),
      ]);
      setCandidates(cands);
      setDestinations(dests);
      setActiveJunctions(juncs);
      cachedRescueData = { candidates: cands, destinations: dests, junctions: juncs };

      // Auto-select first recommended non-system destination
      const rec = dests.find((d) => d.recommended) || dests.find((d) => !d.is_system);
      if (rec) {
        setSelectedDrive((prev) => (dests.some((d) => d.drive === prev && !d.is_system) ? prev : rec.drive));
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

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const handleExecuteRelocation = async () => {
    if (!targetCandidate) return;

    setIsRelocating(true);
    setRelocateError(null);
    setRelocateSuccess(null);
    setRelocationProgress(null);
    setRelocationFinished(null);

    const targetParent = `${selectedDrive.replace(/[\\/]+$/, '')}\\${customTargetFolder.trim() || 'EntropyDev'}`;
    const expectedDest = `${targetParent}\\${targetCandidate.id}`;

    // Poll live progress from backend
    const pollInterval = setInterval(async () => {
      try {
        const snap = await EntropyApiClient.getCleanupProgress();
        if (snap) {
          setRelocationProgress(snap);
        }
      } catch {
        // ignore poll errors
      }
    }, 250);

    try {
      const res = await EntropyApiClient.relocateDirectoryJunction(
        targetCandidate.original_path,
        targetParent,
        targetCandidate.id
      );

      clearInterval(pollInterval);

      if (res.success) {
        try {
          const finalSnap = await EntropyApiClient.getCleanupProgress();
          if (finalSnap) setRelocationProgress(finalSnap);
        } catch {}

        setRelocationFinished({
          name: targetCandidate.name,
          freedFormatted: res.freed_formatted || targetCandidate.size_formatted,
          destPath: expectedDest,
        });

        setRelocateSuccess(
          `Successfully moved '${targetCandidate.name}' to ${expectedDest} and created transparent NTFS Directory Junction. Reclaimed ${targetCandidate.size_formatted} on C: drive.`
        );

        // Clear session cache and silently reload data
        cachedRescueData = null;
        await loadData(true);
        if (onActionComplete) await onActionComplete();
      } else {
        setRelocateError(res.error || 'Failed to relocate directory.');
        setIsRelocating(false);
      }
    } catch (err: unknown) {
      clearInterval(pollInterval);
      setRelocateError(err instanceof Error ? err.message : String(err));
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

  // Filter candidates by search query
  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidates;
    const q = searchQuery.toLowerCase().trim();
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.original_path.toLowerCase().includes(q)
    );
  }, [candidates, searchQuery]);

  const systemDriveInfo = useMemo(() => {
    return destinations.find((d) => d.is_system) || destinations[0];
  }, [destinations]);

  return (
    <div className="space-y-5">
      {/* ═══ Hero Header & Summary ═══ */}
      <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 shrink-0">
                <FolderSync size={20} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Rescue C: Drive &mdash; Directory Relocator
                </h2>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Migrate heavy developer storage (Docker, package caches, build daemons) to secondary drives via transparent NTFS Directory Junctions without breaking build tools.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!loading && !hasSecondaryDrive && (
              <button
                type="button"
                onClick={() => setShowShrinkGuide(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-warning)] text-black hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                <Layers size={13} />
                <span>Partition Guide</span>
              </button>
            )}
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
          {/* Card 1: Reclaimable */}
          <div className="p-3.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] flex flex-col justify-between min-h-[76px]">
            <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Reclaimable on C: Drive
            </p>
            {loading && candidates.length === 0 ? (
              <div className="mt-2 space-y-1.5 animate-pulse">
                <div className="h-6 w-24 bg-[var(--color-surface-3)] rounded" />
                <div className="h-3 w-32 bg-[var(--color-surface-3)]/60 rounded" />
              </div>
            ) : (
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-xl font-bold font-mono text-[var(--color-success)]">{totalReclaimableFormatted}</span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  across {candidates.filter((c) => c.is_moveable).length} folders
                </span>
              </div>
            )}
          </div>

          {/* Card 2: Selected Target Drive */}
          <div className="p-3.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] flex flex-col justify-between min-h-[76px]">
            <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Target Destination
            </p>
            {loading && destinations.length === 0 ? (
              <div className="mt-2 space-y-1.5 animate-pulse">
                <div className="h-6 w-20 bg-[var(--color-surface-3)] rounded" />
                <div className="h-3 w-28 bg-[var(--color-surface-3)]/60 rounded" />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
                <span className="text-lg font-bold font-mono text-[var(--color-text-primary)]">
                  {hasSecondaryDrive ? selectedDrive : 'C: Only'}
                </span>
                {hasSecondaryDrive ? (
                  <span className="text-xs font-mono font-medium text-[var(--color-success)] bg-[var(--color-success-bg)] px-2 py-0.5 rounded border border-[var(--color-success-border)]">
                    {selectedDestinationInfo ? `${selectedDestinationInfo.free_formatted} free` : 'Ready'}
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-[var(--color-warning)] bg-[var(--color-warning-bg)] px-2 py-0.5 rounded border border-[var(--color-warning-border)] whitespace-nowrap">
                    Secondary drive needed
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Card 3: Active Managed Junctions */}
          <div className="p-3.5 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] flex flex-col justify-between min-h-[76px]">
            <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
              Active Managed Junctions
            </p>
            {loading && destinations.length === 0 ? (
              <div className="mt-2 space-y-1.5 animate-pulse">
                <div className="h-6 w-12 bg-[var(--color-surface-3)] rounded" />
                <div className="h-3 w-28 bg-[var(--color-surface-3)]/60 rounded" />
              </div>
            ) : (
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-xl font-bold font-mono text-[var(--color-text-primary)]">{junctions.length}</span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {junctions.length === 1 ? 'redirected folder' : 'redirected folders'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Action Notification Alerts ═══ */}
      {relocateSuccess && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)] text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{relocateSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setRelocateSuccess(null)}
            className="p-1 hover:opacity-80 cursor-pointer shrink-0"
            aria-label="Dismiss notice"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {relocateError && (
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{relocateError}</span>
          </div>
          <button
            type="button"
            onClick={() => setRelocateError(null)}
            className="p-1 hover:opacity-80 cursor-pointer shrink-0"
            aria-label="Dismiss error"
          >
            <XCircle size={14} />
          </button>
        </div>
      )}

      {/* ═══ Destination Drive & Path Configuration Panel ═══ */}
      <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
              Destination Drive &amp; Path Configuration
            </h3>
          </div>
          {loading && destinations.length === 0 ? (
            <div className="h-4 w-28 bg-[var(--color-surface-3)] rounded animate-pulse" />
          ) : hasSecondaryDrive ? (
            <span className="text-[11px] text-[var(--color-text-tertiary)] font-mono">
              {destinations.filter((d) => !d.is_system).length} secondary drive(s) mounted
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowShrinkGuide(true)}
              className="text-xs font-medium text-[var(--color-warning)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Layers size={13} />
              <span>Create Secondary Drive (D:)</span>
            </button>
          )}
        </div>

        {/* LOADING SKELETON */}
        {loading && destinations.length === 0 ? (
          <div className="p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]/30 animate-pulse space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-48 bg-[var(--color-surface-3)] rounded" />
              <div className="h-3.5 w-24 bg-[var(--color-surface-3)] rounded" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
              <div className="h-20 rounded-lg bg-[var(--color-surface-3)]/60" />
              <div className="h-20 rounded-lg bg-[var(--color-surface-3)]/60" />
            </div>
          </div>
        ) : !hasSecondaryDrive ? (
          /* CASE A: No secondary drive (Single Drive Setup) */
          <div className="p-4 rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)]/40 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)] shrink-0">
                  <Layers size={20} />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">
                    Single Drive Detected (C:) &mdash; Secondary Drive or Partition Required
                  </h4>
                  <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                    You have <strong className="text-[var(--color-success)]">{totalReclaimableFormatted}</strong> of developer storage on C:. Because moving within C: will not save space, offloading requires a secondary partition (D:) or external drive.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowShrinkGuide(true)}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-warning)] text-black hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <HardDrive size={14} />
                <span>Partition &amp; Shrink Guide</span>
              </button>
            </div>

            {/* Current C: Drive Status + Pending D: Drive Slot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Drive C: (System Source) */}
              <div className="p-3.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive size={15} className="text-[var(--color-text-secondary)]" />
                    <span className="text-xs font-mono font-semibold text-[var(--color-text-primary)]">C:\ (System Drive)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)] font-medium">
                    Source Drive
                  </span>
                </div>
                <div className="w-full bg-[var(--color-surface-3)] h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-[var(--color-accent)] h-full rounded-full transition-all duration-300"
                    style={{ width: `${systemDriveInfo?.percent_used ?? 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-[var(--color-text-tertiary)] font-mono">
                  <span>{systemDriveInfo?.free_formatted ? `${systemDriveInfo.free_formatted} Free` : '—'}</span>
                  <span>{systemDriveInfo?.percent_used != null ? `${systemDriveInfo.percent_used}% used` : '—'}</span>
                </div>
              </div>

              {/* Pending Drive D: Slot */}
              <div
                onClick={() => setShowShrinkGuide(true)}
                className="p-3.5 rounded-lg bg-[var(--color-surface-2)] border border-dashed border-[var(--color-warning-border)] hover:border-[var(--color-warning)] hover:bg-[var(--color-warning-bg)]/30 transition-all cursor-pointer space-y-2 group"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setShowShrinkGuide(true);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={15} className="text-[var(--color-warning)]" />
                    <span className="text-xs font-mono font-semibold text-[var(--color-text-primary)]">D:\ (Secondary Partition)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)] font-medium group-hover:bg-[var(--color-warning)] group-hover:text-black transition-colors">
                    Create in 4 Steps &rarr;
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-text-secondary)] leading-relaxed">
                  Safely shrink unused space on C: in Windows Disk Management without third-party tools or data loss.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* CASE B: Secondary drive(s) detected */
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {destinations.map((dest) => {
                const isSelected = selectedDrive === dest.drive;
                const isSystem = dest.is_system;

                return (
                  <button
                    key={dest.drive}
                    type="button"
                    disabled={isSystem}
                    onClick={() => !isSystem && setSelectedDrive(dest.drive)}
                    className={`p-3.5 rounded-lg border text-left transition-all ${
                      isSystem
                        ? 'opacity-60 bg-[var(--color-surface-2)]/50 border-[var(--color-border-subtle)] cursor-not-allowed'
                        : isSelected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)] cursor-pointer'
                        : 'border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] hover:border-[var(--color-border)] cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <HardDrive
                          size={16}
                          className={
                            isSystem
                              ? 'text-[var(--color-text-tertiary)]'
                              : isSelected
                              ? 'text-[var(--color-accent)]'
                              : 'text-[var(--color-text-secondary)]'
                          }
                        />
                        <span className="text-xs font-semibold text-[var(--color-text-primary)] font-mono">{dest.drive}</span>
                      </div>
                      {isSystem ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]">
                          Source (C:)
                        </span>
                      ) : dest.recommended ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                          Recommended
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">
                          Target
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 flex items-baseline justify-between text-xs">
                      <span className="text-[var(--color-text-secondary)] font-mono">{dest.free_formatted} Free</span>
                      <span className="font-mono text-[10px] text-[var(--color-text-tertiary)]">{dest.percent_used}% used</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Target Folder Config */}
            <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[var(--color-text-secondary)]">
              <div className="flex items-center gap-1.5">
                <Info size={14} className="text-[var(--color-accent)] shrink-0" />
                <span>
                  Relocated items root on {selectedDrive}:{' '}
                  <strong className="font-mono text-[var(--color-text-primary)]">
                    {selectedDrive.replace(/[\\/]+$/, '')}\{customTargetFolder.trim() || 'EntropyDev'}\
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--color-text-tertiary)]">Subfolder:</span>
                <input
                  type="text"
                  value={customTargetFolder}
                  onChange={(e) => {
                    setCustomTargetFolder(e.target.value);
                    try {
                      localStorage.setItem('entropy_rescue_subfolder', e.target.value);
                    } catch {}
                  }}
                  placeholder="code"
                  className="px-2.5 py-1 text-xs font-mono rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)] w-36 focus:outline-none focus:border-[var(--color-accent)]"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Heavy Developer Folders Catalog ═══ */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Heavy Developer Folders Detected on C: Drive
            </h3>
            <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
              ({loading && candidates.length === 0 ? 'Scanning...' : `${filteredCandidates.filter((c) => c.is_moveable).length} moveable`})
            </span>
          </div>

          {/* Quick Search Filter */}
          <div className="relative w-full sm:w-64">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search folders or paths..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] animate-pulse" />
            ))}
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] space-y-2">
            <FolderCheck size={28} className="mx-auto text-[var(--color-text-tertiary)]" />
            <p className="text-xs font-medium text-[var(--color-text-primary)]">
              {searchQuery ? 'No matching developer folders found' : 'No heavy developer folders detected on C:'}
            </p>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              {searchQuery ? 'Try clearing your search query.' : 'Your C: drive does not have massive package caches or container storage.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredCandidates.map((cand) => {
              const isAlreadyJunction = cand.is_junction;
              const isMoveable = cand.is_moveable;

              return (
                <div
                  key={cand.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)]/40 transition-colors gap-3.5"
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

                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      {cand.description}
                    </p>

                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--color-text-tertiary)]">
                      <span className="truncate max-w-md" title={cand.original_path}>
                        {cand.original_path}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyPath(cand.original_path)}
                        className="p-1 hover:text-[var(--color-text-primary)] transition-colors cursor-pointer shrink-0"
                        title="Copy original path"
                      >
                        {copiedPath === cand.original_path ? (
                          <Check size={11} className="text-[var(--color-success)]" />
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {isAlreadyJunction ? (
                      <span className="text-xs text-[var(--color-text-tertiary)] font-medium italic">
                        Active Junction Link
                      </span>
                    ) : !hasSecondaryDrive ? (
                      <button
                        type="button"
                        onClick={() => setShowShrinkGuide(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-warning)] hover:border-[var(--color-warning-border)] hover:bg-[var(--color-warning-bg)] transition-colors cursor-pointer flex items-center gap-1.5"
                        title="Create secondary partition D: first to rescue C: drive"
                      >
                        <HardDrive size={13} />
                        <span>Setup D: Drive</span>
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

      {/* ═══ Active Junctions & Rollback Manager ═══ */}
      <div className="space-y-3 pt-4 border-t border-[var(--color-border-subtle)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Undo2 size={16} className="text-[var(--color-accent)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Active Directory Junctions (Rollback Manager)
            </h3>
          </div>
          <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
            {loading && destinations.length === 0 ? '...' : `${junctions.length} registered`}
          </span>
        </div>

        {loading && destinations.length === 0 ? (
          <div className="h-14 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] animate-pulse" />
        ) : junctions.length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] p-4 flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={16} className="text-[var(--color-success)] shrink-0" />
              <span>
                Directory Junctions are 100% reversible. Any relocated folders will appear here with an instant 1-click restore back to C: drive.
              </span>
            </div>
            <span className="font-mono text-[11px] text-[var(--color-text-tertiary)] shrink-0 ml-2">
              0 active links
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {junctions.map((junc) => (
              <div
                key={junc.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] gap-3"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[var(--color-text-primary)]">{junc.name}</span>
                    <span className="text-xs font-mono font-bold text-[var(--color-success)]">{junc.size_formatted}</span>
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
        )}
      </div>

      {/* ═══ Relocation Confirmation Modal ═══ */}
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
            {relocationFinished ? (
              /* ── STATE 1: RELOCATION & RECLAMATION 100% COMPLETE ── */
              <div className="space-y-4 text-center py-2 animate-in fade-in">
                <div className="w-12 h-12 rounded-full bg-[var(--color-success-bg)] border border-[var(--color-success-border)] flex items-center justify-center mx-auto text-[var(--color-success)] shadow-sm">
                  <CheckCircle2 size={28} />
                </div>

                <div>
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                    Relocation &amp; Space Reclamation Complete!
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    Reclaimed <strong className="text-[var(--color-success)] font-mono">{relocationFinished.freedFormatted}</strong> of space on C: drive.
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-left font-mono text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-tertiary)]">Original Path:</span>
                    <span className="text-[var(--color-text-secondary)] truncate max-w-xs">{targetCandidate.original_path}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-tertiary)]">Target Junction:</span>
                    <span className="text-[var(--color-accent)] truncate max-w-xs">{relocationFinished.destPath}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[var(--color-success)] pt-1.5 border-t border-[var(--color-border-subtle)] text-[11px]">
                    <ShieldCheck size={13} className="shrink-0" />
                    <span>NTFS Directory Junction established. Original files removed from C:.</span>
                  </div>
                </div>

                {/* 100% Progress Bar */}
                <div className="space-y-1 text-left">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-[var(--color-text-secondary)]">Migration Status</span>
                    <span className="text-[var(--color-success)] font-semibold">100% Complete</span>
                  </div>
                  <div className="w-full bg-[var(--color-surface-3)] h-2.5 rounded-full overflow-hidden">
                    <div className="bg-[var(--color-success)] h-full rounded-full w-full transition-all duration-300" />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetCandidate(null);
                      setRelocationFinished(null);
                      setRelocationProgress(null);
                    }}
                    className="px-5 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : isRelocating ? (
              /* ── STATE 2: ACTIVE PROGRESS BAR (0% -> 100%) ── */
              <div className="space-y-4 py-2 animate-in fade-in">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] shrink-0">
                    <FolderSync size={22} className="animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Relocating {targetCandidate.name} to {selectedDrive}...
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      Copying and verifying files before creating the transparent NTFS junction.
                    </p>
                  </div>
                </div>

                {/* 100% Progress Bar Container */}
                <div className="space-y-2 p-3.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-[var(--color-text-primary)] truncate max-w-[320px]">
                      {relocationProgress?.current_phase || 'Analyzing and transferring files...'}
                    </span>
                    <span className="font-mono font-bold text-sm text-[var(--color-accent)]">
                      {relocationProgress?.percent ?? 5}%
                    </span>
                  </div>

                  <div className="w-full bg-[var(--color-surface-3)] h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[var(--color-accent)] h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(5, relocationProgress?.percent ?? 5)}%` }}
                    />
                  </div>

                  {relocationProgress?.current_file && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--color-text-tertiary)] truncate">
                      <span className="truncate">File: {relocationProgress.current_file}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--color-surface-3)]/60 text-xs text-[var(--color-text-secondary)]">
                  <Info size={15} className="text-[var(--color-accent)] shrink-0" />
                  <span>
                    Please do not close this window. Your original files on C: are safe and will only be deleted once the secondary drive files are completely verified.
                  </span>
                </div>

                <div className="flex justify-end pt-1">
                  <span className="text-xs font-mono text-[var(--color-text-tertiary)] flex items-center gap-2">
                    <RefreshCw size={12} className="animate-spin text-[var(--color-accent)]" />
                    <span>Migrating files...</span>
                  </span>
                </div>
              </div>
            ) : (
              /* ── STATE 3: PRE-FLIGHT CONFIRMATION ── */
              <>
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2.5 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] shrink-0">
                    <FolderSync size={22} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Relocate {targetCandidate.name} to {selectedDrive}?
                    </h3>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      Files will be moved to your secondary drive, and an NTFS directory junction will be placed at the original location. All tools, build scripts, and IDEs will continue functioning transparently.
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
                    <span className="text-[var(--color-accent)] truncate max-w-xs">
                      {selectedDrive.replace(/[\\/]+$/, '')}\{customTargetFolder.trim() || 'EntropyDev'}\{targetCandidate.id}
                    </span>
                  </div>
                </div>

                {/* Safety Guarantee Info */}
                <div className="p-3 rounded-lg bg-[var(--color-surface-3)]/60 border border-[var(--color-border-subtle)] space-y-1.5 mb-5 text-xs text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
                    <ShieldCheck size={14} className="text-[var(--color-success)]" />
                    <span>100% Reversible &amp; Safe</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Entropy uses a 2-phase migration with verification. You can revert this migration anytime with one click in the Rollback Manager.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetCandidate(null)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteRelocation}
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <FolderSync size={13} />
                    <span>Confirm Relocation</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ═══ Restore Confirmation Modal ═══ */}
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

      {/* ═══ Partition & Shrink Guide Modal ═══ */}
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

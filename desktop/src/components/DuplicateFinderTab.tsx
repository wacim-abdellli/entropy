import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Copy,
  RefreshCw,
  FolderOpen,
  Trash2,
  Search,
  AlertTriangle,
  HardDrive,
  CheckCircle2,
  FileText,
  SlidersHorizontal,
  Loader2,
  ShieldCheck,
  Check,
  CheckSquare,
} from 'lucide-react';
import { DuplicateGroupItem, DuplicateFileItem, DuplicateReport } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface DuplicateFinderTabProps {
  onNotice?: (notice: { type: 'success' | 'error' | 'info'; title: string; message: string }) => void;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const DuplicateFinderTab: React.FC<DuplicateFinderTabProps> = ({ onNotice }) => {
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [minSizeKb, setMinSizeKb] = useState<number>(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<DuplicateFileItem | null>(null);
  const [confirmCleanGroup, setConfirmCleanGroup] = useState<{ group: DuplicateGroupItem; keep: 'newest' | 'oldest' } | null>(null);
  const [confirmBatchClean, setConfirmBatchClean] = useState<{ keep: 'newest' | 'oldest' } | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [cleaningGroupId, setCleaningGroupId] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [isBatchCleaning, setIsBatchCleaning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const fetchDuplicates = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await EntropyApiClient.scanDuplicateFiles(null, minSizeKb);
      setReport(data);
      setSelectedGroupIds(new Set());
    } catch (err) {
      console.error('Failed to scan duplicate files:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchDuplicates();
  }, [minSizeKb]);

  // Keyboard shortcut to close modals on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirmDeleteFile(null);
        setConfirmCleanGroup(null);
        setConfirmBatchClean(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleDeleteSingle = async (file: DuplicateFileItem) => {
    setDeletingPath(file.path);
    try {
      const res = await EntropyApiClient.deleteDuplicateFile(file.path, true);
      if (res.success) {
        onNotice?.({
          type: 'success',
          title: 'Moved to Recycle Bin',
          message: res.message || `Moved ${file.name} to Windows Recycle Bin.`,
        });

        // Optimistically remove deleted file from group in state
        setReport((prev) => {
          if (!prev) return prev;
          const updatedGroups = prev.groups
            .map((g) => {
              const remainingFiles = g.files.filter((f) => f.path !== file.path);
              if (remainingFiles.length < 2) return null; // No longer a duplicate group
              const wasted = (remainingFiles.length - 1) * g.file_size_bytes;
              return {
                ...g,
                file_count: remainingFiles.length,
                wasted_bytes: wasted,
                wasted_formatted: formatBytes(wasted),
                files: remainingFiles,
              };
            })
            .filter((g): g is DuplicateGroupItem => g !== null);

          const totalWasted = updatedGroups.reduce((acc, g) => acc + g.wasted_bytes, 0);
          return {
            ...prev,
            groups: updatedGroups,
            total_groups: updatedGroups.length,
            total_duplicate_files: updatedGroups.reduce((acc, g) => acc + g.file_count, 0),
            total_wasted_bytes: totalWasted,
            total_wasted_formatted: formatBytes(totalWasted),
          };
        });
      } else {
        onNotice?.({
          type: 'error',
          title: 'Deletion Failed',
          message: res.error || 'Could not move file to Recycle Bin.',
        });
      }
    } catch (err) {
      onNotice?.({
        type: 'error',
        title: 'Error',
        message: String(err),
      });
    } finally {
      setDeletingPath(null);
      setConfirmDeleteFile(null);
    }
  };

  const handleCleanGroup = async (group: DuplicateGroupItem, keep: 'newest' | 'oldest') => {
    setCleaningGroupId(group.group_id);
    // Sort files to determine target to keep
    const sorted = [...group.files].sort((a, b) => {
      return keep === 'newest' ? b.last_modified - a.last_modified : a.last_modified - b.last_modified;
    });

    const fileToKeep = sorted[0];
    const filesToDelete = sorted.slice(1);

    let deletedCount = 0;
    let totalFreed = 0;

    for (const f of filesToDelete) {
      try {
        const res = await EntropyApiClient.deleteDuplicateFile(f.path, true);
        if (res.success) {
          deletedCount += 1;
          totalFreed += res.freed_bytes || f.size_bytes;
        }
      } catch (err) {
        console.error('Failed to delete file:', f.path, err);
      }
    }

    onNotice?.({
      type: 'success',
      title: 'Group Cleaned',
      message: `Preserved ${fileToKeep.name} (${keep}). Moved ${deletedCount} redundant copies (${formatBytes(totalFreed)}) to Recycle Bin.`,
    });

    // Remove group from report
    setReport((prev) => {
      if (!prev) return prev;
      const updatedGroups = prev.groups.filter((g) => g.group_id !== group.group_id);
      const totalWasted = updatedGroups.reduce((acc, g) => acc + g.wasted_bytes, 0);
      return {
        ...prev,
        groups: updatedGroups,
        total_groups: updatedGroups.length,
        total_duplicate_files: updatedGroups.reduce((acc, g) => acc + g.file_count, 0),
        total_wasted_bytes: totalWasted,
        total_wasted_formatted: formatBytes(totalWasted),
      };
    });

    setCleaningGroupId(null);
    setConfirmCleanGroup(null);
  };

  const handleOpenFolder = async (filePath: string) => {
    try {
      const folder = filePath.substring(0, Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/')));
      await EntropyApiClient.openInExplorer(folder);
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  };

  // Filter groups by query
  const filteredGroups = useMemo(() => {
    if (!report?.groups) return [];
    if (!searchQuery.trim()) return report.groups;
    const q = searchQuery.toLowerCase();
    return report.groups.filter((g) => {
      return g.files.some((f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
    });
  }, [report, searchQuery]);

  // Derived selection states
  const isAllSelected = useMemo(() => {
    if (filteredGroups.length === 0) return false;
    return filteredGroups.every((g) => selectedGroupIds.has(g.group_id));
  }, [filteredGroups, selectedGroupIds]);

  const isSomeSelected = useMemo(() => {
    if (isAllSelected) return false;
    return filteredGroups.some((g) => selectedGroupIds.has(g.group_id));
  }, [filteredGroups, selectedGroupIds, isAllSelected]);

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = isSomeSelected;
    }
  }, [isSomeSelected]);

  const selectedGroups = useMemo(() => {
    if (!report?.groups) return [];
    return report.groups.filter((g) => selectedGroupIds.has(g.group_id));
  }, [report, selectedGroupIds]);

  const selectedWastedBytes = useMemo(() => {
    return selectedGroups.reduce((acc, g) => acc + g.wasted_bytes, 0);
  }, [selectedGroups]);

  const selectedRedundantFilesCount = useMemo(() => {
    return selectedGroups.reduce((acc, g) => acc + (g.file_count - 1), 0);
  }, [selectedGroups]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedGroupIds(new Set());
    } else {
      setSelectedGroupIds(new Set(filteredGroups.map((g) => g.group_id)));
    }
  };

  const handleToggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleBatchClean = async (keep: 'newest' | 'oldest') => {
    if (selectedGroups.length === 0) return;
    setIsBatchCleaning(true);
    setConfirmBatchClean(null);

    let totalDeleted = 0;
    let totalFreed = 0;
    const cleanedGroupIds = new Set<string>();

    for (let i = 0; i < selectedGroups.length; i++) {
      const group = selectedGroups[i];
      setBatchProgress({ current: i + 1, total: selectedGroups.length });

      const sorted = [...group.files].sort((a, b) => {
        return keep === 'newest' ? b.last_modified - a.last_modified : a.last_modified - b.last_modified;
      });

      const filesToDelete = sorted.slice(1);
      let groupSuccess = true;

      for (const f of filesToDelete) {
        try {
          const res = await EntropyApiClient.deleteDuplicateFile(f.path, true);
          if (res.success) {
            totalDeleted += 1;
            totalFreed += res.freed_bytes || f.size_bytes;
          } else {
            groupSuccess = false;
          }
        } catch (err) {
          console.error('Failed to delete duplicate file:', f.path, err);
          groupSuccess = false;
        }
      }

      if (groupSuccess || filesToDelete.length > 0) {
        cleanedGroupIds.add(group.group_id);
      }
    }

    onNotice?.({
      type: 'success',
      title: 'Batch Cleanup Complete',
      message: `Cleaned ${cleanedGroupIds.size} duplicate groups. Moved ${totalDeleted} redundant copies (${formatBytes(totalFreed)}) to Windows Recycle Bin.`,
    });

    // Optimistically remove cleaned groups from report
    setReport((prev) => {
      if (!prev) return prev;
      const updatedGroups = prev.groups.filter((g) => !cleanedGroupIds.has(g.group_id));
      const totalWasted = updatedGroups.reduce((acc, g) => acc + g.wasted_bytes, 0);
      return {
        ...prev,
        groups: updatedGroups,
        total_groups: updatedGroups.length,
        total_duplicate_files: updatedGroups.reduce((acc, g) => acc + g.file_count, 0),
        total_wasted_bytes: totalWasted,
        total_wasted_formatted: formatBytes(totalWasted),
      };
    });

    setSelectedGroupIds(new Set());
    setIsBatchCleaning(false);
    setBatchProgress(null);
  };

  return (
    <div className="space-y-6">
      {/* ── Summary Hero Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Duplicate Groups */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Duplicate Groups</span>
            <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
              {loading ? '—' : report?.total_groups ?? 0}
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              Exact SHA-256 byte matches
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)]">
            <Copy size={20} />
          </div>
        </div>

        {/* Card 2: Redundant Copies */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Redundant Copies</span>
            <div className="text-xl font-bold font-mono text-[var(--color-warning)] mt-1">
              {loading ? '—' : (report?.total_duplicate_files ?? 0) - (report?.total_groups ?? 0)}
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              Superfluous extra files
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] flex items-center justify-center text-[var(--color-warning)]">
            <AlertTriangle size={20} />
          </div>
        </div>

        {/* Card 3: Recoverable Space */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Recoverable Space</span>
            <div className="text-xl font-bold font-mono text-[var(--color-success)] mt-1">
              {loading ? '—' : report?.total_wasted_formatted ?? '0 B'}
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              Space saved by cleaning duplicates
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-success-bg)] border border-[var(--color-success-border)] flex items-center justify-center text-[var(--color-success)]">
            <HardDrive size={20} />
          </div>
        </div>

        {/* Card 4: Safety & Refresh */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Recycle Bin Safety</span>
            <div className="text-sm font-semibold text-[var(--color-success)] flex items-center gap-1.5 mt-1">
              <ShieldCheck size={16} />
              <span>100% Undoable</span>
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              Moved to Recycle Bin
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchDuplicates(true)}
            disabled={refreshing || loading}
            aria-label="Rescan duplicates"
            className="p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Toolbar: Threshold Selector & Search ── */}
      <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter duplicates by file name or directory path…"
            aria-label="Filter duplicates"
            className="w-full pl-9 pr-4 py-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-hidden focus:border-[var(--color-accent)] transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-[var(--color-text-tertiary)]" />
          <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">Min size:</span>
          <div className="flex items-center gap-1">
            {[
              { label: '10 KB', val: 10 },
              { label: '100 KB', val: 100 },
              { label: '1 MB', val: 1024 },
              { label: '10 MB', val: 10240 },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setMinSizeKb(opt.val)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors cursor-pointer ${
                  minSizeKb === opt.val
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Selection & Batch Action Bar ── */}
      {!loading && filteredGroups.length > 0 && (
        <div className="p-3.5 px-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                ref={selectAllCheckboxRef}
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] focus:ring-offset-0 bg-[var(--color-surface-2)] cursor-pointer"
              />
              <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                {isAllSelected ? 'Deselect All' : 'Select All'}
              </span>
            </label>

            <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
              ({selectedGroupIds.size} of {filteredGroups.length} selected)
            </span>

            {selectedGroupIds.size > 0 && (
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                +{formatBytes(selectedWastedBytes)} recoverable
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedGroupIds.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedGroupIds(new Set())}
                  disabled={isBatchCleaning}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBatchClean({ keep: 'newest' })}
                  disabled={isBatchCleaning}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {isBatchCleaning ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                  <span>Clean Selected ({selectedGroupIds.size})</span>
                </button>
              </>
            )}

            {selectedGroupIds.size === 0 && (
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-accent-strong)] hover:text-white hover:bg-[var(--color-accent)] bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <CheckSquare size={13} />
                <span>Select All ({filteredGroups.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Batch Cleaning Progress Bar ── */}
      {isBatchCleaning && batchProgress && (
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-accent)]/30 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-[var(--color-accent)]" />
              <span>Cleaning selected duplicate groups…</span>
            </span>
            <span className="font-mono text-[var(--color-text-secondary)]">
              {batchProgress.current} / {batchProgress.total} groups
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-[var(--color-surface-3)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-200"
              style={{ width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Duplicate Groups List ── */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center space-y-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-1)]">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--color-accent)]" />
            <p className="text-xs text-[var(--color-text-secondary)]">
              Computing 3-pass cryptographic hashes across workspace files…
            </p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-12 text-center space-y-2 border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-1)]">
            <CheckCircle2 className="w-8 h-8 mx-auto text-[var(--color-success)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Zero Duplicate Files Found!</h3>
            <p className="text-xs text-[var(--color-text-tertiary)]">
              All scanned files are unique. No redundant copies wasting disk storage.
            </p>
          </div>
        ) : (
          filteredGroups.map((group) => {
            const newest = group.files[0];
            const isGroupBusy = cleaningGroupId === group.group_id;
            const isSelected = selectedGroupIds.has(group.group_id);

            return (
              <div
                key={group.group_id}
                className={`rounded-xl border transition-all overflow-hidden shadow-xs ${
                  isSelected
                    ? 'border-[var(--color-accent)]/50 ring-1 ring-[var(--color-accent)]/20 bg-[var(--color-surface-1)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-1)]'
                }`}
              >
                {/* Group Header */}
                <div className="p-4 bg-[var(--color-surface-2)]/60 border-b border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleGroup(group.group_id)}
                      aria-label={`Select duplicate group ${newest.name}`}
                      className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] focus:ring-offset-0 bg-[var(--color-surface-2)] cursor-pointer shrink-0"
                    />
                    <div className="w-8 h-8 rounded-lg bg-[var(--color-surface-3)] flex items-center justify-center text-[var(--color-text-primary)] shrink-0">
                      <Copy size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                          {newest.name}
                        </span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">
                          {group.file_count} identical copies
                        </span>
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]">
                          +{group.wasted_formatted} wasted
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-[var(--color-text-tertiary)] mt-0.5">
                        SHA-256: {group.group_id}… • {group.file_size_formatted} per copy
                      </p>
                    </div>
                  </div>

                  {/* Batch Quick Action: Keep Newest */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmCleanGroup({ group, keep: 'newest' })}
                      disabled={isGroupBusy}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isGroupBusy ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      <span>Keep Newest (Trash Others)</span>
                    </button>
                  </div>
                </div>

                {/* Copies List */}
                <div className="divide-y divide-[var(--color-border-subtle)]">
                  {group.files.map((file, idx) => {
                    const isNewest = idx === 0;
                    const isDeleting = deletingPath === file.path;

                    return (
                      <div
                        key={file.path}
                        className="p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--color-surface-2)]/40 transition-colors"
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <FileText className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0 mt-0.5" />
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono font-medium text-[var(--color-text-primary)] truncate">
                                {file.path}
                              </span>
                              {isNewest && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                                  NEWEST
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[var(--color-text-tertiary)] flex items-center gap-3">
                              <span>Modified: <span className="font-mono">{file.last_modified_formatted}</span></span>
                              <span>Size: <span className="font-mono">{formatBytes(file.size_bytes)}</span></span>
                            </div>
                          </div>
                        </div>

                        {/* File Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleOpenFolder(file.path)}
                            title="Open containing folder"
                            aria-label={`Open folder for ${file.name}`}
                            className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                          >
                            <FolderOpen size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteFile(file)}
                            disabled={isDeleting || isGroupBusy}
                            title="Move this copy to Recycle Bin"
                            aria-label={`Move ${file.name} to Recycle Bin`}
                            className="p-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-danger-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger-border)] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isDeleting ? (
                              <Loader2 size={14} className="animate-spin text-[var(--color-danger)]" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Single File Delete Confirmation Modal ── */}
      {confirmDeleteFile && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDeleteFile(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirmDeleteFile(null);
          }}
          tabIndex={-1}
        >
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] text-[var(--color-warning)] shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Move Duplicate to Recycle Bin?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  This duplicate copy will be safely moved to the Windows Recycle Bin. Other copies of this file remain intact.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-1 text-xs font-mono">
              <div className="text-[var(--color-text-primary)] truncate font-semibold">
                {confirmDeleteFile.name}
              </div>
              <div className="text-[11px] text-[var(--color-text-tertiary)] break-all">
                {confirmDeleteFile.path}
              </div>
              <div className="text-[11px] text-[var(--color-accent-strong)] font-semibold pt-1">
                Freed Space: {formatBytes(confirmDeleteFile.size_bytes)}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteFile(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteSingle(confirmDeleteFile)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-danger)] hover:opacity-90 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <Trash2 size={13} />
                <span>Move to Recycle Bin</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Group Cleanup Confirmation Modal ── */}
      {confirmCleanGroup && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmCleanGroup(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirmCleanGroup(null);
          }}
          tabIndex={-1}
        >
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] shrink-0">
                <Check size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Keep {confirmCleanGroup.keep === 'newest' ? 'Newest' : 'Oldest'} File &amp; Clean Others?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Entropy will keep the {confirmCleanGroup.keep} version and send the remaining{' '}
                  <strong className="text-[var(--color-text-primary)]">
                    {confirmCleanGroup.group.file_count - 1} redundant copies
                  </strong>{' '}
                  to the Windows Recycle Bin.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">File:</span>
                <span className="font-semibold text-[var(--color-text-primary)]">
                  {confirmCleanGroup.group.files[0].name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Copies to Recycle:</span>
                <span className="font-mono text-[var(--color-warning)] font-semibold">
                  {confirmCleanGroup.group.file_count - 1} files
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Total Reclaimable Space:</span>
                <span className="font-mono text-[var(--color-success)] font-semibold">
                  {confirmCleanGroup.group.wasted_formatted}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmCleanGroup(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCleanGroup(confirmCleanGroup.group, confirmCleanGroup.keep)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <Trash2 size={13} />
                <span>Clean Redundant Copies</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Batch Cleanup Confirmation Modal ── */}
      {confirmBatchClean && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmBatchClean(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setConfirmBatchClean(null);
          }}
          tabIndex={-1}
        >
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 text-[var(--color-accent)] shrink-0">
                <Check size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Clean {selectedGroupIds.size} Selected Duplicate Groups?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Entropy will keep the {confirmBatchClean.keep} copy of each file and move all{' '}
                  <strong className="text-[var(--color-text-primary)]">
                    {selectedRedundantFilesCount} redundant copies
                  </strong>{' '}
                  to the Windows Recycle Bin.
                </p>
              </div>
            </div>

            {/* Policy Selector: Keep Newest vs Keep Oldest */}
            <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-2">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">Preservation Rule:</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmBatchClean({ keep: 'newest' })}
                  className={`p-2.5 rounded-lg text-xs font-medium border text-left transition-all cursor-pointer ${
                    confirmBatchClean.keep === 'newest'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text-primary)] font-semibold'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <div className="font-semibold text-xs text-[var(--color-text-primary)]">Keep Newest (Recommended)</div>
                  <div className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">Trashes older duplicate versions</div>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmBatchClean({ keep: 'oldest' })}
                  className={`p-2.5 rounded-lg text-xs font-medium border text-left transition-all cursor-pointer ${
                    confirmBatchClean.keep === 'oldest'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text-primary)] font-semibold'
                      : 'border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  <div className="font-semibold text-xs text-[var(--color-text-primary)]">Keep Oldest</div>
                  <div className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">Trashes newer duplicate versions</div>
                </button>
              </div>
            </div>

            {/* Impact Summary */}
            <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Selected Groups:</span>
                <span className="font-semibold text-[var(--color-text-primary)] font-mono">
                  {selectedGroupIds.size} groups
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Redundant Copies to Recycle:</span>
                <span className="font-mono text-[var(--color-warning)] font-semibold">
                  {selectedRedundantFilesCount} files
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-text-secondary)]">Total Reclaimable Space:</span>
                <span className="font-mono text-[var(--color-success)] font-semibold">
                  {formatBytes(selectedWastedBytes)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-tertiary)] pt-1 border-t border-[var(--color-border-subtle)]">
                <ShieldCheck size={13} className="text-[var(--color-success)]" />
                <span>100% reversible via Windows Recycle Bin</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmBatchClean(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBatchClean(confirmBatchClean.keep)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              >
                <Trash2 size={13} />
                <span>Move {selectedRedundantFilesCount} Files to Recycle Bin</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

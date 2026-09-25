import React, { useState, useMemo, useEffect } from 'react';
import {
  Trash2,
  CheckCircle2,
  Folder,
  Database,
  Loader2,
  Check,
  Copy,
  ExternalLink,
  RefreshCw,
  FolderGit2,
  Box,
  Layers,
  HardDrive,
  Globe,
  AlertCircle,
  Shield,
  Info,
} from 'lucide-react';
import {
  EnvironmentOverview,
  WorkspaceSummary,
  DockerDiskUsage,
  GlobalCacheItem,
  SystemCleanupTarget,
} from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface CleanupViewProps {
  overview: EnvironmentOverview;
  onRefresh: () => Promise<void> | void;
  currentWorkspace?: WorkspaceSummary | null;
}

type CleanupTab = 'system' | 'artifacts' | 'caches' | 'docker';

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const CleanupView: React.FC<CleanupViewProps> = ({ overview, onRefresh, currentWorkspace }) => {
  const [activeTab, setActiveTab] = useState<CleanupTab>('system');

  // System Junk state
  const [systemTargets, setSystemTargets] = useState<SystemCleanupTarget[]>([]);
  const [selectedSystemTargets, setSelectedSystemTargets] = useState<Set<string>>(new Set());
  const [isCleaningSystem, setIsCleaningSystem] = useState(false);
  const [confirmSystemCleanOpen, setConfirmSystemCleanOpen] = useState(false);
  const [systemLoading, setSystemLoading] = useState(false);

  // Artifacts state
  const artifacts = useMemo(() => overview?.system?.artifacts || [], [overview?.system?.artifacts]);
  const [selectedArtifacts, setSelectedArtifacts] = useState<Set<string>>(new Set());
  const [isCleaning, setIsCleaning] = useState(false);
  const [confirmCleanOpen, setConfirmCleanOpen] = useState(false);

  // Global Caches state
  const [globalCaches, setGlobalCaches] = useState<GlobalCacheItem[]>([]);
  const [selectedCaches, setSelectedCaches] = useState<Set<string>>(new Set());
  const [isPurgingCaches, setIsPurgingCaches] = useState(false);
  const [confirmCachePurgeOpen, setConfirmCachePurgeOpen] = useState(false);

  // Docker state
  const [dockerUsage, setDockerUsage] = useState<DockerDiskUsage | null>(null);
  const [dockerLoading, setDockerLoading] = useState(false);
  const [dockerPruningTarget, setDockerPruningTarget] = useState<string | null>(null);
  const [confirmDockerPrune, setConfirmDockerPrune] = useState<{ target: 'builder' | 'dangling_images' | 'system'; label: string } | null>(null);

  // Shared UI state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const fetchSystemTargets = async () => {
    setSystemLoading(true);
    try {
      const items = await EntropyApiClient.getSystemCleanupTargets();
      setSystemTargets(items || []);
      // Auto-select all default-selected items (excludes Recycle Bin by default)
      const defaults = new Set((items || []).filter((i) => i.is_default_selected).map((i) => i.id));
      setSelectedSystemTargets(defaults);
    } catch (err) {
      console.warn('Failed to load system cleanup targets:', err);
    } finally {
      setSystemLoading(false);
    }
  };

  const fetchGlobalCaches = async () => {
    try {
      const items = await EntropyApiClient.getPurgeableCaches();
      setGlobalCaches(items || []);
    } catch (err) {
      console.warn('Failed to load global caches:', err);
    }
  };

  const fetchDockerUsage = async () => {
    setDockerLoading(true);
    try {
      const usage = await EntropyApiClient.getDockerDiskUsage();
      setDockerUsage(usage);
    } catch (err) {
      console.warn('Failed to query Docker disk usage:', err);
    } finally {
      setDockerLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    EntropyApiClient.getSystemCleanupTargets()
      .then((items) => {
        if (!ignore && items) {
          setSystemTargets(items);
          const defaults = new Set(items.filter((i) => i.is_default_selected).map((i) => i.id));
          setSelectedSystemTargets(defaults);
        }
      })
      .catch((err) => {
        console.warn('Failed to load system targets:', err);
      });

    EntropyApiClient.getPurgeableCaches()
      .then((items) => {
        if (!ignore && items) {
          setGlobalCaches(items);
        }
      })
      .catch((err) => {
        console.warn('Failed to load global caches:', err);
      });

    EntropyApiClient.getDockerDiskUsage()
      .then((usage) => {
        if (!ignore && usage) {
          setDockerUsage(usage);
        }
      })
      .catch((err) => {
        console.warn('Failed to query Docker disk usage:', err);
      });

    return () => {
      ignore = true;
    };
  }, []);

  // System calculations
  const totalSystemBytes = useMemo(
    () => systemTargets.reduce((acc, t) => acc + (t.size_bytes || 0), 0),
    [systemTargets]
  );

  const selectedSystemBytes = useMemo(
    () => systemTargets.filter((t) => selectedSystemTargets.has(t.id)).reduce((acc, t) => acc + (t.size_bytes || 0), 0),
    [systemTargets, selectedSystemTargets]
  );

  // Artifact calculations
  const totalArtifactBytes = useMemo(
    () => artifacts.reduce((acc, a) => acc + (a.size_bytes || 0), 0),
    [artifacts]
  );

  const totalCacheBytes = useMemo(
    () => globalCaches.reduce((acc, c) => acc + (c.size_bytes || 0), 0),
    [globalCaches]
  );

  const selectedArtifactBytes = useMemo(
    () => artifacts.filter((a) => selectedArtifacts.has(a.path)).reduce((acc, a) => acc + (a.size_bytes || 0), 0),
    [artifacts, selectedArtifacts]
  );

  const selectedCacheBytes = useMemo(
    () => globalCaches.filter((c) => selectedCaches.has(c.path)).reduce((acc, c) => acc + (c.size_bytes || 0), 0),
    [globalCaches, selectedCaches]
  );

  /* ───────────────────────── Handlers ───────────────────────── */

  const handleToggleSystemTarget = (id: string) => {
    const next = new Set(selectedSystemTargets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedSystemTargets(next);
  };

  const handleSelectAllSafeSystemTargets = () => {
    const safeIds = systemTargets.filter((t) => t.risk === 'safe').map((t) => t.id);
    const allSafeSelected = safeIds.every((id) => selectedSystemTargets.has(id));
    if (allSafeSelected) {
      const next = new Set(selectedSystemTargets);
      safeIds.forEach((id) => next.delete(id));
      setSelectedSystemTargets(next);
    } else {
      const next = new Set(selectedSystemTargets);
      safeIds.forEach((id) => next.add(id));
      setSelectedSystemTargets(next);
    }
  };

  const handleToggleArtifact = (path: string) => {
    const next = new Set(selectedArtifacts);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedArtifacts(next);
  };

  const handleSelectAllSafeArtifacts = () => {
    if (selectedArtifacts.size === artifacts.length) {
      setSelectedArtifacts(new Set());
    } else {
      setSelectedArtifacts(new Set(artifacts.map((a) => a.path)));
    }
  };

  const handleToggleCache = (path: string) => {
    const next = new Set(selectedCaches);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setSelectedCaches(next);
  };

  const handleSelectAllCaches = () => {
    if (selectedCaches.size === globalCaches.length) {
      setSelectedCaches(new Set());
    } else {
      setSelectedCaches(new Set(globalCaches.map((c) => c.path)));
    }
  };

  const handleCleanSelectedSystem = async () => {
    if (selectedSystemTargets.size === 0) return;
    setIsCleaningSystem(true);
    setToastMessage(null);
    try {
      const targets = Array.from(selectedSystemTargets);
      const res = await EntropyApiClient.cleanSystemTargets(targets);
      if (res.success) {
        setToastMessage(`Cleaned system junk: freed ${formatBytes(res.total_freed_bytes || 0)}.`);
        setSelectedSystemTargets(new Set());
        await fetchSystemTargets();
        await onRefresh();
      } else {
        setToastMessage('System cleanup completed with some items skipped.');
      }
    } catch (err) {
      console.error('System cleanup failed:', err);
      setToastMessage('System cleanup encountered an error.');
    } finally {
      setIsCleaningSystem(false);
      setConfirmSystemCleanOpen(false);
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const handleCleanSelectedArtifacts = async () => {
    if (selectedArtifacts.size === 0) return;
    setIsCleaning(true);
    setToastMessage(null);
    try {
      const pathsToClean = Array.from(selectedArtifacts);
      const result = await EntropyApiClient.cleanArtifacts(pathsToClean);
      if (result.success) {
        setToastMessage(`Freed ${formatBytes(result.total_freed_bytes || 0)} (${result.success_count} folders cleaned)`);
        setSelectedArtifacts(new Set());
        await onRefresh();
      } else {
        setToastMessage(`Cleaned ${result.success_count}, failed ${result.failed_count}`);
      }
    } catch (error) {
      console.error('Artifact cleanup failed:', error);
      setToastMessage('Cleanup failed. See console.');
    } finally {
      setIsCleaning(false);
      setConfirmCleanOpen(false);
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const handlePurgeSelectedCaches = async () => {
    if (selectedCaches.size === 0) return;
    setIsPurgingCaches(true);
    setToastMessage(null);
    try {
      const targets = Array.from(selectedCaches);
      const res = await EntropyApiClient.purgeCaches(targets);
      if (res.success) {
        setToastMessage(`Purged ${res.success_count} caches: freed ${formatBytes(res.total_freed_bytes || 0)}.`);
        setSelectedCaches(new Set());
        await fetchGlobalCaches();
        await onRefresh();
      } else {
        setToastMessage(`Purged ${res.success_count} caches, ${res.failed_count} failed.`);
      }
    } catch (err) {
      console.error('Cache purge failed:', err);
      setToastMessage('Cache purge failed.');
    } finally {
      setIsPurgingCaches(false);
      setConfirmCachePurgeOpen(false);
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const handleExecuteDockerPrune = async () => {
    if (!confirmDockerPrune) return;
    const { target, label } = confirmDockerPrune;
    setDockerPruningTarget(target);
    setConfirmDockerPrune(null);
    try {
      const res = await EntropyApiClient.pruneDocker(target);
      if (res.success) {
        setToastMessage(res.message || `Successfully pruned Docker ${label}.`);
        await fetchDockerUsage();
      } else {
        setToastMessage(res.error || `Docker prune ${label} failed.`);
      }
    } catch {
      setToastMessage(`Docker prune ${label} error.`);
    } finally {
      setDockerPruningTarget(null);
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  const getTargetIcon = (target: SystemCleanupTarget) => {
    if (target.id === 'recycle_bin') return <Trash2 size={16} className="text-[var(--color-warning)]" />;
    if (target.category === 'browser') return <Globe size={16} className="text-[var(--color-accent-strong)]" />;
    if (target.category === 'diagnostics') return <AlertCircle size={16} className="text-[var(--color-danger)]" />;
    return <HardDrive size={16} className="text-[var(--color-text-secondary)]" />;
  };

  return (
    <div className="relative flex flex-col h-full bg-[var(--color-surface-0)] text-[var(--color-text-primary)] overflow-hidden">
      {/* ── Top Header ── */}
      <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Trash2 size={24} className="text-[var(--color-accent)]" />
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight">System Cleanup &amp; Deep Purge</h1>
              {currentWorkspace && (
                <>
                  <span className="text-[var(--color-text-tertiary)] text-lg">/</span>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-accent-strong)]">
                    <FolderGit2 className="w-3.5 h-3.5 text-[var(--color-accent)]" />
                    <span>{currentWorkspace.name}</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await onRefresh();
              await fetchSystemTargets();
              await fetchGlobalCaches();
              await fetchDockerUsage();
            }}
            className="px-3 py-1.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RefreshCw size={13} className={dockerLoading || systemLoading ? 'animate-spin' : ''} />
            <span>Refresh All</span>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 mt-4 border-b border-[var(--color-border-subtle)] overflow-x-auto">
          {/* Tab 1: Windows & System Junk */}
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`pb-2.5 px-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'system'
                ? 'border-[var(--color-accent)] text-[var(--color-accent-strong)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <HardDrive size={14} className={activeTab === 'system' ? 'text-[var(--color-accent)]' : ''} />
            <span>Windows &amp; System Junk</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-[var(--color-surface-2)]">
              {systemTargets.length}
            </span>
            {totalSystemBytes > 0 && (
              <span className="text-[10px] font-mono text-[var(--color-accent-strong)]">
                ({formatBytes(totalSystemBytes)})
              </span>
            )}
          </button>

          {/* Tab 2: Project Artifacts */}
          <button
            type="button"
            onClick={() => setActiveTab('artifacts')}
            className={`pb-2.5 px-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'artifacts'
                ? 'border-[var(--color-accent)] text-[var(--color-accent-strong)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Folder size={14} className={activeTab === 'artifacts' ? 'text-[var(--color-accent)]' : ''} />
            <span>Project Artifacts</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-[var(--color-surface-2)]">
              {artifacts.length}
            </span>
          </button>

          {/* Tab 3: Package Caches */}
          <button
            type="button"
            onClick={() => setActiveTab('caches')}
            className={`pb-2.5 px-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'caches'
                ? 'border-[var(--color-accent)] text-[var(--color-accent-strong)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Database size={14} className={activeTab === 'caches' ? 'text-[var(--color-accent)]' : ''} />
            <span>Package Manager Caches</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-[var(--color-surface-2)]">
              {globalCaches.length}
            </span>
          </button>

          {/* Tab 4: Docker Storage */}
          <button
            type="button"
            onClick={() => setActiveTab('docker')}
            className={`pb-2.5 px-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer shrink-0 ${
              activeTab === 'docker'
                ? 'border-[var(--color-accent)] text-[var(--color-accent-strong)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Box size={14} className={activeTab === 'docker' ? 'text-[var(--color-accent)]' : ''} />
            <span>Docker Storage</span>
            {dockerUsage?.available && dockerUsage.reclaimable_bytes > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)]">
                {formatBytes(dockerUsage.reclaimable_bytes)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Tab Content Area ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-8 py-6 space-y-6 w-full max-w-full min-w-0 pb-24">

        {/* ═══ TAB 1: Windows & System Junk ═══ */}
        {activeTab === 'system' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Windows &amp; Application System Cleanup
                </h2>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  Clean stale temporary files, browser web caches, and diagnostic crash dumps across your PC.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllSafeSystemTargets}
                  className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
                >
                  Select All Safe Items
                </button>
              </div>
            </div>

            {systemTargets.length === 0 ? (
              <div className="p-12 text-center border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-1)]">
                <CheckCircle2 size={36} className="mx-auto text-[var(--color-success)] mb-2" />
                <h3 className="text-sm font-semibold">Your Windows System is Clean!</h3>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  No temporary files or browser caches currently exceed storage thresholds.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {systemTargets.map((target) => {
                  const isSelected = selectedSystemTargets.has(target.id);
                  return (
                    <div
                      key={target.id}
                      onClick={() => handleToggleSystemTarget(target.id)}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all cursor-pointer gap-3 ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)] shadow-sm'
                          : 'border-[var(--color-border)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]/60'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="mt-1 rounded accent-[var(--color-accent)] cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="shrink-0">{getTargetIcon(target)}</span>
                            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                              {target.name}
                            </span>
                            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-2 py-0.5 rounded-full border border-[var(--color-border-subtle)]">
                              {target.category_label}
                            </span>
                            {target.risk === 'safe' ? (
                              <span className="text-[10px] font-medium text-[var(--color-success)] bg-[var(--color-success-bg)] px-2 py-0.5 rounded-full border border-[var(--color-success-border)]">
                                100% Safe
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-[var(--color-warning)] bg-[var(--color-warning-bg)] px-2 py-0.5 rounded-full border border-[var(--color-warning-border)]">
                                Manual Review
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                            {target.description}
                          </p>
                          <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 flex items-center gap-1">
                            <Info size={11} className="shrink-0 text-[var(--color-accent)]" />
                            <span>{target.safety_notice}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--color-border-subtle)]">
                        <div className="text-left sm:text-right">
                          <div className="text-sm font-semibold font-mono text-[var(--color-text-primary)]">
                            {formatBytes(target.size_bytes)}
                          </div>
                          {target.item_count > 0 && (
                            <div className="text-[11px] text-[var(--color-text-tertiary)] font-mono">
                              {target.item_count.toLocaleString()} items
                            </div>
                          )}
                        </div>

                        {target.paths[0] && target.paths[0] !== 'Recycle Bin' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              EntropyApiClient.openInExplorer(target.paths[0]);
                            }}
                            className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] rounded-lg transition-colors cursor-pointer"
                            title="Reveal in Windows Explorer"
                          >
                            <ExternalLink size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 2: Project Artifacts ═══ */}
        {activeTab === 'artifacts' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Whitelisted Developer Build Artifacts
                </h2>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  Safe to delete: dependencies and build output can be regenerated with npm, cargo, or pip. Total: {formatBytes(totalArtifactBytes)}.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllSafeArtifacts}
                  className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
                >
                  {selectedArtifacts.size === artifacts.length && artifacts.length > 0
                    ? 'Deselect All'
                    : 'Select All Safe Artifacts'}
                </button>
              </div>
            </div>

            {artifacts.length === 0 ? (
              <div className="p-12 text-center border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-1)]">
                <CheckCircle2 size={36} className="mx-auto text-[var(--color-success)] mb-2" />
                <h3 className="text-sm font-semibold">Your Workspaces are Pristine!</h3>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  No disposable dependencies or heavy build artifacts found in scanned workspaces.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {artifacts.map((artifact) => {
                  const isSelected = selectedArtifacts.has(artifact.path);
                  return (
                    <div
                      key={artifact.path}
                      onClick={() => handleToggleArtifact(artifact.path)}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all cursor-pointer gap-3 ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)] shadow-sm'
                          : 'border-[var(--color-border)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]/60'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="mt-1 rounded accent-[var(--color-accent)] cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Folder size={15} className="text-[var(--color-text-secondary)] shrink-0" />
                            <span className="text-sm font-semibold text-[var(--color-text-primary)] font-mono">
                              {artifact.name}
                            </span>
                            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-2 py-0.5 rounded-full border border-[var(--color-border-subtle)]">
                              {artifact.category}
                            </span>
                            <span className="text-[10px] font-medium text-[var(--color-success)] bg-[var(--color-success-bg)] px-2 py-0.5 rounded-full border border-[var(--color-success-border)]">
                              Safe to delete
                            </span>
                          </div>
                          <div className="text-xs text-[var(--color-text-tertiary)] font-mono truncate mt-1">
                            {artifact.path}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--color-border-subtle)]">
                        <div className="text-sm font-semibold font-mono text-[var(--color-text-primary)]">
                          {formatBytes(artifact.size_bytes)}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPath(artifact.path);
                          }}
                          className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] rounded-lg transition-colors cursor-pointer"
                          title="Copy path"
                        >
                          {copiedPath === artifact.path ? (
                            <Check size={14} className="text-[var(--color-success)]" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 3: Package Manager Caches ═══ */}
        {activeTab === 'caches' && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Global Toolchain &amp; Package Caches
                </h2>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  Package archives from pip, npm, yarn, and cargo. Safe to empty; dependencies re-download on build. Total: {formatBytes(totalCacheBytes)}.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllCaches}
                  className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
                >
                  {selectedCaches.size === globalCaches.length && globalCaches.length > 0
                    ? 'Deselect All'
                    : 'Select All Caches'}
                </button>
              </div>
            </div>

            {globalCaches.length === 0 ? (
              <div className="p-12 text-center border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-1)]">
                <CheckCircle2 size={36} className="mx-auto text-[var(--color-success)] mb-2" />
                <h3 className="text-sm font-semibold">No Global Caches Found</h3>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  Package caches are currently empty or not initialized on this machine.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {globalCaches.map((cache) => {
                  const isSelected = selectedCaches.has(cache.path);
                  return (
                    <div
                      key={cache.id}
                      onClick={() => handleToggleCache(cache.path)}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all cursor-pointer gap-3 ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)] shadow-sm'
                          : 'border-[var(--color-border)] bg-[var(--color-surface-1)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]/60'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="mt-1 rounded accent-[var(--color-accent)] cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Database size={15} className="text-[var(--color-text-secondary)] shrink-0" />
                            <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                              {cache.label}
                            </span>
                            <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-2 py-0.5 rounded-full border border-[var(--color-border-subtle)]">
                              {cache.id}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--color-text-tertiary)] font-mono truncate mt-1">
                            {cache.path}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--color-border-subtle)]">
                        <div className="text-sm font-semibold font-mono text-[var(--color-text-primary)]">
                          {formatBytes(cache.size_bytes)}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyPath(cache.path);
                          }}
                          className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] rounded-lg transition-colors cursor-pointer"
                          title="Copy path"
                        >
                          {copiedPath === cache.path ? (
                            <Check size={14} className="text-[var(--color-success)]" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 4: Docker Storage ═══ */}
        {activeTab === 'docker' && (
          <div className="space-y-6">
            {!dockerUsage?.available ? (
              <div className="p-12 text-center border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-1)]">
                <Box size={36} className="mx-auto text-[var(--color-text-tertiary)] mb-2" />
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Docker Daemon is Offline</h3>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  {dockerUsage?.message || 'Docker daemon is not running or CLI is not installed on this machine.'}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]">
                    <div className="text-xs text-[var(--color-text-tertiary)] font-medium">Total Docker Footprint</div>
                    <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
                      {formatBytes(dockerUsage.total_size_bytes)}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]">
                    <div className="text-xs text-[var(--color-text-tertiary)] font-medium">Reclaimable Space</div>
                    <div className="text-xl font-bold font-mono text-[var(--color-accent-strong)] mt-1">
                      {formatBytes(dockerUsage.reclaimable_bytes)}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]">
                    <div className="text-xs text-[var(--color-text-tertiary)] font-medium">Categories Monitored</div>
                    <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
                      {dockerUsage.items.length}
                    </div>
                  </div>
                </div>

                {/* Quick Prune Actions */}
                <div className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Targeted Docker Pruning</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmDockerPrune({ target: 'builder', label: 'Build Cache' })}
                      disabled={Boolean(dockerPruningTarget)}
                      className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-left transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
                        <Layers size={14} className="text-[var(--color-accent)]" />
                        <span>Prune Build Cache</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                        Removes intermediate compiler layers without stopping containers.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmDockerPrune({ target: 'dangling_images', label: 'Dangling Images' })}
                      disabled={Boolean(dockerPruningTarget)}
                      className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-left transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
                        <Box size={14} className="text-[var(--color-accent)]" />
                        <span>Prune Dangling Images</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                        Removes untagged &lt;none&gt; layers left over from old builds.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmDockerPrune({ target: 'system', label: 'System Deep Prune' })}
                      disabled={Boolean(dockerPruningTarget)}
                      className="p-3.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-left transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)]">
                        <Trash2 size={14} className="text-[var(--color-danger)]" />
                        <span>System Deep Prune</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
                        Removes stopped containers, dangling images, and build cache.
                      </p>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Fixed Bottom Action Bar for System Tab ── */}
      {activeTab === 'system' && selectedSystemTargets.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface-1)]/95 backdrop-blur-md border-t border-[var(--color-border)] p-4 px-8 shadow-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {selectedSystemTargets.size} target(s) selected:
            </span>
            <span className="text-sm font-bold font-mono text-[var(--color-accent-strong)]">
              {formatBytes(selectedSystemBytes)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setConfirmSystemCleanOpen(true)}
            disabled={isCleaningSystem}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
          >
            {isCleaningSystem ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            <span>Clean Selected System Junk ({formatBytes(selectedSystemBytes)})</span>
          </button>
        </div>
      )}

      {/* ── Fixed Bottom Action Bar for Artifacts Tab ── */}
      {activeTab === 'artifacts' && selectedArtifacts.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface-1)]/95 backdrop-blur-md border-t border-[var(--color-border)] p-4 px-8 shadow-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {selectedArtifacts.size} folder(s) selected:
            </span>
            <span className="text-sm font-bold font-mono text-[var(--color-accent-strong)]">
              {formatBytes(selectedArtifactBytes)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setConfirmCleanOpen(true)}
            disabled={isCleaning}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-[var(--color-danger)] hover:opacity-90 text-white flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
          >
            {isCleaning ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            <span>Clean Selected ({formatBytes(selectedArtifactBytes)})</span>
          </button>
        </div>
      )}

      {/* ── Fixed Bottom Action Bar for Caches Tab ── */}
      {activeTab === 'caches' && selectedCaches.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface-1)]/95 backdrop-blur-md border-t border-[var(--color-border)] p-4 px-8 shadow-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">
              {selectedCaches.size} cache(s) selected:
            </span>
            <span className="text-sm font-bold font-mono text-[var(--color-accent-strong)]">
              {formatBytes(selectedCacheBytes)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setConfirmCachePurgeOpen(true)}
            disabled={isPurgingCaches}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
          >
            {isPurgingCaches ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            <span>Purge Selected Caches ({formatBytes(selectedCacheBytes)})</span>
          </button>
        </div>
      )}

      {/* ── Toast Notification ── */}
      {toastMessage && (
        <div className="fixed bottom-20 right-8 z-50 p-3.5 rounded-xl border border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success)] text-xs font-medium shadow-2xl flex items-center gap-2 animate-in fade-in duration-150">
          <CheckCircle2 size={15} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ── Modal: System Junk Cleanup ── */}
      {confirmSystemCleanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/25 flex items-center justify-center shrink-0">
                <HardDrive size={20} className="text-[var(--color-accent-strong)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Clean Selected Windows &amp; System Targets?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Reclaiming approximately <strong className="text-[var(--color-text-primary)]">{formatBytes(selectedSystemBytes)}</strong> across {selectedSystemTargets.size} category(s).
                </p>
              </div>
            </div>

            <div className="bg-[var(--color-surface-2)] p-3.5 rounded-xl border border-[var(--color-border-subtle)] space-y-2 text-xs text-[var(--color-text-secondary)]">
              <div className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Smart Safety Boundaries
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[var(--color-success)] shrink-0" />
                  <span>Temporary files older than 24 hours will be deleted.</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[var(--color-success)] shrink-0" />
                  <span>Browser HTTP caches are cleared. Cookies, passwords, and history are NEVER touched.</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-[var(--color-success)] shrink-0" />
                  <span>Files currently locked or in use by open apps will be safely skipped.</span>
                </div>
                {selectedSystemTargets.has('recycle_bin') && (
                  <div className="flex items-center gap-2 text-[var(--color-warning)]">
                    <Shield size={14} className="shrink-0" />
                    <span>Windows Recycle Bin will be permanently emptied.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmSystemCleanOpen(false)}
                disabled={isCleaningSystem}
                className="px-4 py-2 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCleanSelectedSystem}
                disabled={isCleaningSystem}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white transition-opacity cursor-pointer disabled:opacity-50"
              >
                {isCleaningSystem ? 'Cleaning…' : `Clean ${formatBytes(selectedSystemBytes)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Artifact Cleanup ── */}
      {confirmCleanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-[var(--color-danger)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Clean Selected Build Artifacts?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  You are about to delete <strong className="text-[var(--color-text-primary)]">{selectedArtifacts.size}</strong> folder(s) reclaiming <strong className="text-[var(--color-text-primary)]">{formatBytes(selectedArtifactBytes)}</strong>.
                </p>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] p-3 rounded-lg border border-[var(--color-border-subtle)] leading-relaxed">
              These directories contain disposable dependencies (like node_modules and target). They can be recreated anytime via your package manager. Source code is never affected.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmCleanOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmCleanOpen(false);
                  handleCleanSelectedArtifacts();
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-danger)] hover:opacity-90 text-white transition-opacity cursor-pointer"
              >
                Delete {formatBytes(selectedArtifactBytes)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Package Cache Purge ── */}
      {confirmCachePurgeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/25 flex items-center justify-center shrink-0">
                <Database size={18} className="text-[var(--color-accent-strong)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Purge Global Package Caches?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Purge <strong className="text-[var(--color-text-primary)]">{selectedCaches.size}</strong> package manager cache(s) to reclaim <strong className="text-[var(--color-text-primary)]">{formatBytes(selectedCacheBytes)}</strong>.
                </p>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] p-3 rounded-lg border border-[var(--color-border-subtle)] leading-relaxed">
              Downloaded tarballs and wheels will be cleared. Package managers will re-download archives transparently on subsequent builds.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmCachePurgeOpen(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmCachePurgeOpen(false);
                  handlePurgeSelectedCaches();
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white transition-opacity cursor-pointer"
              >
                Purge Caches
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Docker Prune ── */}
      {confirmDockerPrune && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/25 flex items-center justify-center shrink-0">
                <Box size={18} className="text-[var(--color-accent-strong)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Prune Docker {confirmDockerPrune.label}?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                  Execute safe pruning for <strong className="text-[var(--color-text-primary)]">{confirmDockerPrune.label}</strong>? Running containers and active images are never deleted.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmDockerPrune(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDockerPrune}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:opacity-90 text-white transition-opacity cursor-pointer"
              >
                Confirm Prune
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

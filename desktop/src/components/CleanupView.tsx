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
  Zap,
} from 'lucide-react';
import {
  EnvironmentOverview,
  WorkspaceSummary,
  DockerDiskUsage,
  GlobalCacheItem,
} from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface CleanupViewProps {
  overview: EnvironmentOverview;
  onRefresh: () => Promise<void> | void;
  currentWorkspace?: WorkspaceSummary | null;
}

type CleanupTab = 'artifacts' | 'caches' | 'docker';

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const CleanupView: React.FC<CleanupViewProps> = ({ overview, onRefresh, currentWorkspace }) => {
  const [activeTab, setActiveTab] = useState<CleanupTab>('artifacts');

  // Artifacts state
  const artifacts = overview?.system?.artifacts || [];
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

  const fetchGlobalCaches = async () => {
    try {
      const items = await EntropyApiClient.getPurgeableCaches();
      setGlobalCaches(items);
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
    fetchGlobalCaches();
    fetchDockerUsage();
  }, []);

  const totalArtifactBytes = useMemo(
    () => artifacts.reduce((acc, a) => acc + (a.size_bytes || 0), 0),
    [artifacts]
  );

  const totalGlobalCacheBytes = useMemo(
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

  return (
    <div className="relative flex flex-col h-full bg-[var(--color-surface-0)] text-[var(--color-text-primary)] overflow-hidden">
      {/* ── Top Header ── */}
      <div className="px-8 pt-6 pb-4 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Trash2 size={24} className="text-[var(--color-accent)]" />
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-semibold">Cleanup &amp; Deep Purge</h1>
              {currentWorkspace && (
                <>
                  <span className="text-[var(--color-text-tertiary)] text-lg">/</span>
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-accent-strong)]">
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
              await fetchGlobalCaches();
              await fetchDockerUsage();
            }}
            className="px-3 py-1.5 rounded-md bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <RefreshCw size={13} className={dockerLoading ? 'animate-spin' : ''} />
            Refresh All
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 mt-4 border-b border-[var(--color-border-subtle)]">
          <button
            type="button"
            onClick={() => setActiveTab('artifacts')}
            className={`pb-2.5 px-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
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

          <button
            type="button"
            onClick={() => setActiveTab('caches')}
            className={`pb-2.5 px-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'caches'
                ? 'border-[var(--color-accent)] text-[var(--color-accent-strong)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Database size={14} className={activeTab === 'caches' ? 'text-[var(--color-accent)]' : ''} />
            <span>System Package Caches</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-[var(--color-surface-2)]">
              {globalCaches.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('docker')}
            className={`pb-2.5 px-3 text-xs font-medium flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'docker'
                ? 'border-[var(--color-accent)] text-[var(--color-accent-strong)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            <Box size={14} className={activeTab === 'docker' ? 'text-[var(--color-accent)]' : ''} />
            <span>Docker Storage</span>
            {dockerUsage?.available && dockerUsage.reclaimable_bytes > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300">
                {formatBytes(dockerUsage.reclaimable_bytes)}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Tab Content Area ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-8 py-6 space-y-6 w-full max-w-full min-w-0">

        {/* ═══ TAB 1: Project Artifacts ═══ */}
        {activeTab === 'artifacts' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Whitelisted Build Artifacts
                </h2>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  Safe to delete: dependencies and build output can be regenerated with npm, cargo, or pip. Total: {formatBytes(totalArtifactBytes)}.
                </p>
              </div>
              {artifacts.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllSafeArtifacts}
                  className="text-xs font-medium text-[var(--color-accent-strong)] hover:underline cursor-pointer"
                >
                  {selectedArtifacts.size === artifacts.length ? 'Clear Selection' : 'Select All'}
                </button>
              )}
            </div>

            {artifacts.length === 0 ? (
              <div className="p-12 text-center border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-1)]">
                <CheckCircle2 size={40} className="text-emerald-400 mx-auto mb-3 opacity-60" />
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">No Build Artifacts to Clean</h3>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">Your scanned workspaces are free of unmanaged build directories.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {artifacts.map((artifact) => {
                  const isSelected = selectedArtifacts.has(artifact.path);
                  return (
                    <div
                      key={artifact.path}
                      onClick={() => handleToggleArtifact(artifact.path)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border-l-4 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[var(--color-surface-2)] border-l-emerald-500'
                          : 'bg-[var(--color-surface-1)] border-l-emerald-500/30 hover:bg-[var(--color-surface-2)]'
                      } border border-[var(--color-border)]`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-[var(--color-border)]'
                          }`}
                        >
                          {isSelected && <Check size={11} className="text-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-[var(--color-text-primary)] truncate">
                            {artifact.name}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 flex items-center gap-2 font-mono truncate">
                            <span className="truncate">{artifact.project_path}</span>
                            <span className="w-1 h-1 rounded-full bg-[var(--color-text-tertiary)] shrink-0" />
                            <span className="text-[var(--color-text-tertiary)] shrink-0">{artifact.category}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <div className="font-semibold text-xs text-[var(--color-text-primary)]">
                          {formatBytes(artifact.size_bytes)}
                        </div>
                        <div className="text-[10px] text-emerald-400 font-medium mt-0.5">
                          Safe to delete
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 2: System Package Caches ═══ */}
        {activeTab === 'caches' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Global Developer Package Caches
                </h2>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  Package archives cached on your system. Purging empties old tarballs and wheels safely; active projects remain unaffected. Total: {formatBytes(totalGlobalCacheBytes)}.
                </p>
              </div>
              {globalCaches.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllCaches}
                  className="text-xs font-medium text-[var(--color-accent-strong)] hover:underline cursor-pointer"
                >
                  {selectedCaches.size === globalCaches.length ? 'Clear Selection' : 'Select All'}
                </button>
              )}
            </div>

            {globalCaches.length === 0 ? (
              <div className="p-12 text-center border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-1)]">
                <Database size={40} className="text-amber-400 mx-auto mb-3 opacity-60" />
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">No Global Caches Found</h3>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">No pip, npm, yarn, or cargo cache directories were located.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {globalCaches.map((cache) => {
                  const isSelected = selectedCaches.has(cache.path);
                  return (
                    <div
                      key={cache.path}
                      onClick={() => handleToggleCache(cache.path)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border-l-4 cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[var(--color-surface-2)] border-l-blue-500'
                          : 'bg-[var(--color-surface-1)] border-l-blue-500/30 hover:bg-[var(--color-surface-2)]'
                      } border border-[var(--color-border)]`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            isSelected ? 'bg-blue-500 border-blue-500' : 'border-[var(--color-border)]'
                          }`}
                        >
                          {isSelected && <Check size={11} className="text-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-[var(--color-text-primary)]">
                            {cache.label}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-secondary)] mt-0.5 font-mono truncate">
                            {cache.path}
                          </div>
                          <div className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
                            {cache.description}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <div className="font-semibold text-xs text-[var(--color-text-primary)]">
                          {formatBytes(cache.size_bytes)}
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyPath(cache.path);
                            }}
                            className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] cursor-pointer"
                            title={copiedPath === cache.path ? 'Copied!' : 'Copy path'}
                          >
                            {copiedPath === cache.path ? (
                              <Check size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              EntropyApiClient.openInExplorer(cache.path);
                            }}
                            className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)]"
                            title="Open in File Explorer"
                          >
                            <ExternalLink size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TAB 3: Docker Storage ═══ */}
        {activeTab === 'docker' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Docker Storage &amp; Cache Manager
                </h2>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  Inspect Docker build cache, dangling layers, and unused containers without opening Docker Desktop.
                </p>
              </div>
              <button
                type="button"
                onClick={fetchDockerUsage}
                disabled={dockerLoading}
                className="px-2.5 py-1 text-xs rounded bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border border-[var(--color-border)] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={12} className={dockerLoading ? 'animate-spin' : ''} />
                Refresh Docker
              </button>
            </div>

            {!dockerUsage?.available ? (
              <div className="p-8 border border-[var(--color-border)] rounded-xl bg-[var(--color-surface-1)] text-center space-y-3">
                <Box size={36} className="text-[var(--color-text-tertiary)] mx-auto opacity-50" />
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Docker Daemon is Offline
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto leading-relaxed">
                  {dockerUsage?.message || 'Docker CLI or daemon is not currently active on this system.'}
                  <br />
                  Start Docker Desktop to inspect build cache and reclaim disk space.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Docker KPI row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)]">
                    <span className="text-[11px] text-[var(--color-text-tertiary)] block">Total Docker Footprint</span>
                    <span className="text-lg font-semibold text-[var(--color-text-primary)] mt-1 block">
                      {formatBytes(dockerUsage.total_size_bytes)}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/25">
                    <span className="text-[11px] text-blue-300 block">Total Reclaimable Space</span>
                    <span className="text-lg font-semibold text-blue-400 mt-1 block">
                      {formatBytes(dockerUsage.reclaimable_bytes)}
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)]">
                    <span className="text-[11px] text-[var(--color-text-tertiary)] block">Categories Scanned</span>
                    <span className="text-lg font-semibold text-[var(--color-text-primary)] mt-1 block">
                      {dockerUsage.items.length} item types
                    </span>
                  </div>
                </div>

                {/* Docker Quick Purge Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Layers size={16} className="text-blue-400" />
                        <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">Build Cache</h4>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                        Prunes intermediate Docker build stages safely (`docker builder prune -f`).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDockerPrune({ target: 'builder', label: 'Build Cache' })}
                      disabled={Boolean(dockerPruningTarget)}
                      className="mt-4 w-full py-1.5 px-3 rounded-lg text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/35 hover:bg-blue-500/30 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {dockerPruningTarget === 'builder' ? 'Pruning...' : 'Prune Build Cache'}
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Box size={16} className="text-amber-400" />
                        <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">Dangling Images</h4>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                        Deletes untagged/orphaned images (`docker image prune -f`).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDockerPrune({ target: 'dangling_images', label: 'Dangling Images' })}
                      disabled={Boolean(dockerPruningTarget)}
                      className="mt-4 w-full py-1.5 px-3 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/35 hover:bg-amber-500/30 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {dockerPruningTarget === 'dangling_images' ? 'Pruning...' : 'Prune Dangling Images'}
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Zap size={16} className="text-emerald-400" />
                        <h4 className="text-xs font-semibold text-[var(--color-text-primary)]">System Deep Prune</h4>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                        Removes stopped containers, dangling images, and build cache in one step.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDockerPrune({ target: 'system', label: 'System Cache' })}
                      disabled={Boolean(dockerPruningTarget)}
                      className="mt-4 w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {dockerPruningTarget === 'system' ? 'Pruning...' : 'Run System Prune'}
                    </button>
                  </div>
                </div>

                {/* Breakdown Table */}
                <div className="border border-[var(--color-border)] rounded-xl overflow-hidden bg-[var(--color-surface-1)]">
                  <div className="px-4 py-2.5 border-b border-[var(--color-border-subtle)] text-xs font-semibold text-[var(--color-text-primary)]">
                    Docker Storage Breakdown
                  </div>
                  <div className="divide-y divide-[var(--color-border-subtle)]">
                    {dockerUsage.items.map((item) => (
                      <div key={item.type} className="px-4 py-3 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-[var(--color-text-primary)]">{item.type}</span>
                          <span className="text-[var(--color-text-tertiary)] ml-2">
                            ({item.total_count} total, {item.active_count} active)
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-[var(--color-text-primary)]">{item.size_raw}</span>
                          <span className="text-blue-400 font-mono ml-3 font-medium">
                            Reclaimable: {item.reclaimable_raw}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Spacer for bottom bar */}
        <div className="h-24" />
      </div>

      {/* ── Fixed Bottom Action Bar ── */}
      <div className="absolute bottom-0 left-0 right-0 p-5 bg-[var(--color-surface-1)] border-t border-[var(--color-border)] shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeTab === 'artifacts' ? (
            <>
              <div className="text-sm font-semibold">
                <span>{selectedArtifacts.size}</span> artifact{selectedArtifacts.size === 1 ? '' : 's'} selected
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] font-mono">
                ({formatBytes(selectedArtifactBytes)} total)
              </div>
            </>
          ) : activeTab === 'caches' ? (
            <>
              <div className="text-sm font-semibold">
                <span>{selectedCaches.size}</span> cache{selectedCaches.size === 1 ? '' : 's'} selected
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] font-mono">
                ({formatBytes(selectedCacheBytes)} total)
              </div>
            </>
          ) : (
            <div className="text-xs text-[var(--color-text-secondary)]">
              Docker daemon: <strong className={dockerUsage?.available ? 'text-emerald-400' : 'text-[var(--color-text-tertiary)]'}>
                {dockerUsage?.available ? 'Connected' : 'Offline'}
              </strong>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {toastMessage && (
            <div className="text-emerald-400 text-xs flex items-center gap-1.5 bg-emerald-400/10 border border-emerald-400/25 px-3 py-1.5 rounded-full animate-in fade-in slide-in-from-bottom-2">
              <CheckCircle2 size={14} />
              <span>{toastMessage}</span>
            </div>
          )}

          {activeTab === 'artifacts' && (
            <button
              type="button"
              onClick={() => setConfirmCleanOpen(true)}
              disabled={selectedArtifacts.size === 0 || isCleaning}
              className="px-5 py-2 rounded-lg bg-[var(--color-accent)] hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isCleaning ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              <span>Clean Selected ({formatBytes(selectedArtifactBytes)})</span>
            </button>
          )}

          {activeTab === 'caches' && (
            <button
              type="button"
              onClick={() => setConfirmCachePurgeOpen(true)}
              disabled={selectedCaches.size === 0 || isPurgingCaches}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              {isPurgingCaches ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              <span>Purge Selected ({formatBytes(selectedCacheBytes)})</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Modal: Clean Selected Artifacts ── */}
      {confirmCleanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/30 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-[var(--color-accent)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Clean Selected Build Artifacts?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                  Delete <strong className="text-[var(--color-text-primary)]">{selectedArtifacts.size}</strong> build artifact folders ({formatBytes(selectedArtifactBytes)})?
                </p>
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1.5">
                  You can regenerate these dependencies at any time using your package manager (npm, cargo, pip).
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmCleanOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmCleanOpen(false);
                  handleCleanSelectedArtifacts();
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-accent)] hover:bg-blue-500 text-white"
              >
                Clean Artifacts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Purge Global Package Caches ── */}
      {confirmCachePurgeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center shrink-0">
                <Database size={18} className="text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Purge Global Package Caches?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                  Purge <strong className="text-[var(--color-text-primary)]">{selectedCaches.size}</strong> package manager caches to free <strong className="text-blue-400 font-semibold">{formatBytes(selectedCacheBytes)}</strong>?
                </p>
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1.5">
                  Package archives will be re-downloaded transparently when needed during future installs.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setConfirmCachePurgeOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmCachePurgeOpen(false);
                  handlePurgeSelectedCaches();
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white"
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
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center shrink-0">
                <Box size={18} className="text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
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
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDockerPrune}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white"
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

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  Archive,
  Download,
  Brain,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Folder,
  ArrowRight,
  Code2,
  Terminal,
  Clock,
  Layers,
  Search,
  Check,
  Info,
  XCircle,
} from 'lucide-react';
import {
  StorageRecommendationReport,
  DormantWorkspaceItem,
  StaleDownloadItem,
  AiModelStorageItem,
} from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface SmartRecommendationsTabProps {
  onActionComplete?: () => Promise<void> | void;
}

export const SmartRecommendationsTab: React.FC<SmartRecommendationsTabProps> = ({ onActionComplete }) => {
  const [report, setReport] = useState<StorageRecommendationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'workspaces' | 'downloads' | 'ai'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected downloads for batch recycling
  const [selectedDownloadPaths, setSelectedDownloadPaths] = useState<Set<string>>(new Set());

  // Workspace Cleaning Modal
  const [targetWorkspace, setTargetWorkspace] = useState<DormantWorkspaceItem | null>(null);
  const [isCleaningWorkspace, setIsCleaningWorkspace] = useState(false);

  // Stale Downloads Cleaning Modal
  const [confirmDownloadsOpen, setConfirmDownloadsOpen] = useState(false);
  const [downloadsToRecycle, setDownloadsToRecycle] = useState<StaleDownloadItem[]>([]);
  const [isRecyclingDownloads, setIsRecyclingDownloads] = useState(false);

  // Notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    if (!errorMessage) return;
    const timer = setTimeout(() => setErrorMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await EntropyApiClient.getStorageRecommendations();
      setReport(data);
      // Auto select all downloads by default for convenience
      if (data && data.stale_downloads) {
        setSelectedDownloadPaths(new Set(data.stale_downloads.map((d) => d.path)));
      }
    } catch (err) {
      console.error('Failed to load storage recommendations:', err);
      setErrorMessage('Failed to load recommendations. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered lists
  const filteredWorkspaces = useMemo(() => {
    if (!report) return [];
    return report.dormant_workspaces.filter((w) => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        w.name.toLowerCase().includes(query) ||
        w.path.toLowerCase().includes(query) ||
        w.artifacts.some((a) => a.name.toLowerCase().includes(query))
      );
    });
  }, [report, searchQuery]);

  const filteredDownloads = useMemo(() => {
    if (!report) return [];
    return report.stale_downloads.filter((d) => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        d.name.toLowerCase().includes(query) ||
        d.extension.toLowerCase().includes(query) ||
        d.category.toLowerCase().includes(query)
      );
    });
  }, [report, searchQuery]);

  const filteredAiModels = useMemo(() => {
    if (!report) return [];
    return report.ai_models.filter((m) => {
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      return (
        m.name.toLowerCase().includes(query) ||
        m.framework.toLowerCase().includes(query) ||
        m.path.toLowerCase().includes(query)
      );
    });
  }, [report, searchQuery]);

  // Toggle download selection
  const toggleDownload = (path: string) => {
    setSelectedDownloadPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleAllDownloads = () => {
    if (!report) return;
    if (selectedDownloadPaths.size === filteredDownloads.length) {
      setSelectedDownloadPaths(new Set());
    } else {
      setSelectedDownloadPaths(new Set(filteredDownloads.map((d) => d.path)));
    }
  };

  const selectedDownloadsSize = useMemo(() => {
    if (!report) return '0 B';
    const sum = report.stale_downloads
      .filter((d) => selectedDownloadPaths.has(d.path))
      .reduce((acc, d) => acc + d.size_bytes, 0);
    if (sum === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(sum) / Math.log(k));
    return parseFloat((sum / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, [report, selectedDownloadPaths]);

  // Execute Workspace Cleaning
  const handleCleanWorkspace = async () => {
    if (!targetWorkspace) return;
    setIsCleaningWorkspace(true);
    try {
      const artifactNames = targetWorkspace.artifacts.map((a) => a.name);
      const res = await EntropyApiClient.cleanDormantWorkspace(
        targetWorkspace.path,
        artifactNames
      );
      if (res.success) {
        setToastMessage(`Reclaimed ${res.freed_formatted} from ${targetWorkspace.name}.`);
        setTargetWorkspace(null);
        await loadData(true);
        if (onActionComplete) onActionComplete();
      } else {
        setErrorMessage(res.error || 'Failed to clean workspace artifacts.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCleaningWorkspace(false);
    }
  };

  // Execute Stale Downloads Recycling
  const handleRecycleDownloads = async () => {
    if (downloadsToRecycle.length === 0) return;
    setIsRecyclingDownloads(true);
    try {
      const paths = downloadsToRecycle.map((d) => d.path);
      const res = await EntropyApiClient.cleanStaleDownloads(paths);
      if (res.success) {
        setToastMessage(`Moved ${res.deleted_count} files (${res.freed_formatted}) to Recycle Bin.`);
        setConfirmDownloadsOpen(false);
        setDownloadsToRecycle([]);
        await loadData(true);
        if (onActionComplete) onActionComplete();
      } else {
        setErrorMessage(res.error || 'Failed to move files to Recycle Bin.');
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRecyclingDownloads(false);
    }
  };

  const handleOpenExplorer = async (path: string) => {
    try {
      await EntropyApiClient.openInExplorer(path);
    } catch {
      setErrorMessage('Failed to open File Explorer.');
    }
  };

  if (loading && !report) {
    return (
      <div className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-accent-muted)] flex items-center justify-center text-[var(--color-accent)]">
              <RefreshCw size={16} className="animate-spin text-[var(--color-accent)]" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
                <span>Analyzing Storage Patterns</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--color-surface-2)] text-[var(--color-accent-strong)] border border-[var(--color-border-subtle)] font-medium">
                  SCANNING
                </span>
              </div>
              <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
                Detecting dormant developer workspaces, stale downloaded installers, and AI models...
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const dormantCount = report?.dormant_workspaces.length || 0;
  const downloadsCount = report?.stale_downloads.length || 0;
  const aiCount = report?.ai_models.length || 0;

  return (
    <div className="space-y-6">
      {/* ── Floating Alerts ── */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--color-surface-3)] border border-[var(--color-success-border)] text-[var(--color-text-primary)] shadow-2xl animate-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 size={16} className="text-[var(--color-success)] shrink-0" />
          <span className="text-xs font-medium">{toastMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--color-surface-3)] border border-[var(--color-danger-border)] text-[var(--color-text-primary)] shadow-2xl animate-in slide-in-from-bottom-3 duration-200">
          <AlertTriangle size={16} className="text-[var(--color-danger)] shrink-0" />
          <span className="text-xs font-medium">{errorMessage}</span>
        </div>
      )}

      {/* ── Hero Metric Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-surface-1)] via-[var(--color-surface-2)] to-[var(--color-surface-1)] border border-[var(--color-border)] p-6 shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-accent-strong)] mb-1">
              <Sparkles size={14} className="text-[var(--color-accent)]" />
              <span>Smart Storage Optimizer</span>
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)] tracking-tight">
              Recommended Space Reclaim
            </h1>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1 max-w-xl leading-relaxed">
              Entropy detected inactive repositories with reconstructible dependencies, obsolete setup installers in Downloads, and AI weights.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div className="text-2xl font-bold font-mono text-[var(--color-success)]">
                {report?.total_reclaimable_formatted || '0 B'}
              </div>
              <div className="text-[11px] text-[var(--color-text-tertiary)] flex items-center justify-end gap-1 mt-0.5">
                <ShieldCheck size={13} className="text-[var(--color-success)]" />
                <span>Zero Risk Reclaimable</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="p-2.5 rounded-xl bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
              title="Rescan Recommendations"
              aria-label="Rescan Recommendations"
            >
              <RefreshCw size={15} className={refreshing ? 'animate-spin text-[var(--color-accent)]' : ''} />
            </button>
          </div>
        </div>

        {/* 3 Metric Pills */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-5 border-t border-[var(--color-border-subtle)]">
          <div
            onClick={() => setActiveFilter(activeFilter === 'workspaces' ? 'all' : 'workspaces')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'workspaces'
                ? 'bg-[var(--color-surface-3)] border-[var(--color-accent)] shadow-xs'
                : 'bg-[var(--color-surface-2)]/60 border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-3)]'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)] mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Archive size={14} className="text-[var(--color-warning)]" />
                Dormant Workspaces
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-1)]">
                {dormantCount}
              </span>
            </div>
            <div className="text-base font-semibold font-mono text-[var(--color-text-primary)]">
              {report?.dormant_workspaces_formatted || '0 B'}
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
              Untouched &gt;30 days (node_modules, target)
            </div>
          </div>

          <div
            onClick={() => setActiveFilter(activeFilter === 'downloads' ? 'all' : 'downloads')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'downloads'
                ? 'bg-[var(--color-surface-3)] border-[var(--color-accent)] shadow-xs'
                : 'bg-[var(--color-surface-2)]/60 border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-3)]'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)] mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Download size={14} className="text-[#f97316]" />
                Stale Downloads
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-1)]">
                {downloadsCount}
              </span>
            </div>
            <div className="text-base font-semibold font-mono text-[var(--color-text-primary)]">
              {report?.stale_downloads_formatted || '0 B'}
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
              Old setup installers (.exe, .iso, .zip)
            </div>
          </div>

          <div
            onClick={() => setActiveFilter(activeFilter === 'ai' ? 'all' : 'ai')}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              activeFilter === 'ai'
                ? 'bg-[var(--color-surface-3)] border-[var(--color-accent)] shadow-xs'
                : 'bg-[var(--color-surface-2)]/60 border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-3)]'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-[var(--color-text-tertiary)] mb-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Brain size={14} className="text-[#a855f7]" />
                AI Model Weights
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-surface-1)]">
                {aiCount}
              </span>
            </div>
            <div className="text-base font-semibold font-mono text-[var(--color-text-primary)]">
              {report?.ai_models_formatted || '0 B'}
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
              Ollama &amp; HuggingFace model cache
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Controls ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeFilter === 'all'
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]'
            }`}
          >
            All Recommendations
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('workspaces')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'workspaces'
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]'
            }`}
          >
            <Archive size={13} />
            <span>Workspaces ({dormantCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('downloads')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'downloads'
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]'
            }`}
          >
            <Download size={13} />
            <span>Downloads ({downloadsCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('ai')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeFilter === 'ai'
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]'
            }`}
          >
            <Brain size={13} />
            <span>AI Models ({aiCount})</span>
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            type="text"
            placeholder="Search projects, files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)]"
            aria-label="Search recommendations"
          />
        </div>
      </div>

      {/* ════ SECTION 1: Dormant Workspaces ════ */}
      {(activeFilter === 'all' || activeFilter === 'workspaces') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Archive size={16} className="text-[var(--color-warning)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Dormant Workspaces with Reconstructible Artifacts
              </h2>
            </div>
            <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
              {filteredWorkspaces.length} projects
            </span>
          </div>

          {filteredWorkspaces.length === 0 ? (
            <div className="p-6 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-center text-xs text-[var(--color-text-tertiary)]">
              No dormant workspaces found matching your criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredWorkspaces.map((ws) => (
                <div
                  key={ws.path}
                  className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Folder size={15} className="text-[var(--color-accent-strong)] shrink-0" />
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {ws.name}
                      </span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)] flex items-center gap-1">
                        <Clock size={10} />
                        Untouched {ws.inactivity_days} days
                      </span>
                      {ws.is_git && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]">
                          {ws.is_clean ? 'Clean Git' : 'Git Repository'}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] font-mono text-[var(--color-text-tertiary)] truncate mt-1">
                      {ws.path}
                    </div>

                    {/* Reconstructible Folders Inside */}
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {ws.artifacts.map((art) => (
                        <div
                          key={art.path}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)]"
                        >
                          <span className="font-semibold text-[var(--color-text-primary)] font-mono">{art.name}</span>
                          <span className="text-[10px] text-[var(--color-accent-strong)] font-mono">({art.size_formatted})</span>
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">→</span>
                          <span className="text-[10px] font-mono text-[var(--color-success)] bg-[var(--color-success-bg)] px-1.5 py-0.2 rounded">
                            {art.rebuild_command}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-bold font-mono text-[var(--color-success)]">
                        {ws.total_reclaimable_formatted}
                      </div>
                      <div className="text-[10px] text-[var(--color-text-tertiary)]">
                        {ws.artifacts.length} folder{ws.artifacts.length > 1 ? 's' : ''}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenExplorer(ws.path)}
                      className="p-2 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border-subtle)] transition-colors cursor-pointer"
                      title="Reveal in File Explorer"
                      aria-label="Reveal in File Explorer"
                    >
                      <ExternalLink size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setTargetWorkspace(ws)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-success-bg)] hover:bg-[var(--color-success)] text-[var(--color-success)] hover:text-white border border-[var(--color-success-border)] transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 size={13} />
                      <span>Reclaim {ws.total_reclaimable_formatted}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════ SECTION 2: Stale Downloads ════ */}
      {(activeFilter === 'all' || activeFilter === 'downloads') && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Download size={16} className="text-[#f97316]" />
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Stale Downloaded Installers &amp; Archives (&gt;30 Days)
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleAllDownloads}
                className="text-xs text-[var(--color-accent-strong)] hover:underline cursor-pointer mr-2"
              >
                {selectedDownloadPaths.size === filteredDownloads.length ? 'Deselect All' : 'Select All'}
              </button>

              {selectedDownloadPaths.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const toRecycle = (report?.stale_downloads || []).filter((d) =>
                      selectedDownloadPaths.has(d.path)
                    );
                    setDownloadsToRecycle(toRecycle);
                    setConfirmDownloadsOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-danger-bg)] hover:bg-[var(--color-danger)] text-[var(--color-danger)] hover:text-white border border-[var(--color-danger-border)] transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 size={13} />
                  <span>Move Selected to Recycle Bin ({selectedDownloadsSize})</span>
                </button>
              )}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[var(--color-surface-2)]/70 border border-[var(--color-border-subtle)] text-[11px] text-[var(--color-text-secondary)] flex items-center gap-2">
            <ShieldCheck size={14} className="text-[var(--color-success)] shrink-0" />
            <span>
              Files are safely moved to the Windows Recycle Bin (undoable at any time) and logged to <code className="font-mono text-[var(--color-accent-strong)]">~/.entropy/audit.log</code>.
            </span>
          </div>

          {filteredDownloads.length === 0 ? (
            <div className="p-6 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-center text-xs text-[var(--color-text-tertiary)]">
              No stale installers or archives found in Downloads.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filteredDownloads.map((dl) => {
                const isSelected = selectedDownloadPaths.has(dl.path);
                return (
                  <div
                    key={dl.path}
                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[var(--color-surface-2)] border-[var(--color-accent-muted)]'
                        : 'bg-[var(--color-surface-1)] border-[var(--color-border)] hover:border-[var(--color-border-strong)]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleDownload(dl.path)}
                        className="rounded border-[var(--color-border)] accent-[var(--color-accent)] cursor-pointer"
                        aria-label={`Select ${dl.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                            {dl.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] uppercase">
                            {dl.category}
                          </span>
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">
                            {dl.age_days} days old
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--color-text-tertiary)] truncate mt-0.5">
                          {dl.path}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold font-mono text-[var(--color-text-primary)]">
                        {dl.size_formatted}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenExplorer(dl.path)}
                        className="p-1.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                        title="Reveal file in Windows Explorer"
                        aria-label="Reveal file in Windows Explorer"
                      >
                        <ExternalLink size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDownloadsToRecycle([dl]);
                          setConfirmDownloadsOpen(true);
                        }}
                        className="p-1.5 rounded-lg bg-[var(--color-danger-bg)] hover:bg-[var(--color-danger)] text-[var(--color-danger)] hover:text-white transition-colors cursor-pointer"
                        title="Move to Recycle Bin"
                        aria-label="Move to Recycle Bin"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════ SECTION 3: AI Model Weights ════ */}
      {(activeFilter === 'all' || activeFilter === 'ai') && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-[#a855f7]" />
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                Local AI Model Storage &amp; Checkpoints
              </h2>
            </div>
            <span className="text-xs text-[var(--color-text-tertiary)] font-mono">
              {filteredAiModels.length} detected
            </span>
          </div>

          {filteredAiModels.length === 0 ? (
            <div className="p-6 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-center text-xs text-[var(--color-text-tertiary)]">
              No local AI model storage (Ollama, HuggingFace) detected on this machine.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {filteredAiModels.map((model) => (
                <div
                  key={model.path}
                  className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--color-text-primary)]">
                        {model.name}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {model.framework}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[var(--color-text-tertiary)] truncate mt-1">
                      {model.path}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold font-mono text-[var(--color-text-primary)]">
                      {model.size_formatted}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenExplorer(model.path)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <ExternalLink size={13} />
                      <span>Reveal in Explorer</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════ CONFIRMATION MODAL: Workspace Artifact Cleanup ════ */}
      {targetWorkspace &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !isCleaningWorkspace) setTargetWorkspace(null);
            }}
          >
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-enter">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] text-[var(--color-warning)] shrink-0">
                  <Archive size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Reclaim Space from {targetWorkspace.name}?
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    This will delete reconstructible build directories. Your source code, git branches, and uncommitted edits will NOT be touched.
                  </p>
                </div>
              </div>

              <div className="mt-4 p-3.5 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] space-y-2">
                <div className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                  Folders to be Deleted:
                </div>
                {targetWorkspace.artifacts.map((art) => (
                  <div key={art.path} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[var(--color-text-primary)]">{art.name}</span>
                    <span className="font-mono font-medium text-[var(--color-success)]">{art.size_formatted}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 p-3 rounded-lg bg-[var(--color-success-bg)] border border-[var(--color-success-border)] flex items-start gap-2">
                <Terminal size={14} className="text-[var(--color-success)] mt-0.5 shrink-0" />
                <div className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  <span className="font-semibold text-[var(--color-text-primary)]">Rebuild Recipe: </span>
                  Run <code className="font-mono text-[var(--color-success)] font-semibold">{targetWorkspace.artifacts[0]?.rebuild_command || 'rebuild command'}</code> inside the project folder whenever you return to this repository.
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setTargetWorkspace(null)}
                  disabled={isCleaningWorkspace}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCleanWorkspace}
                  disabled={isCleaningWorkspace}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-success)] hover:bg-[var(--color-success)]/90 text-white transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isCleaningWorkspace ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Reclaiming Space...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={13} />
                      <span>Reclaim {targetWorkspace.total_reclaimable_formatted}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ════ CONFIRMATION MODAL: Recycle Stale Downloads ════ */}
      {confirmDownloadsOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !isRecyclingDownloads) setConfirmDownloadsOpen(false);
            }}
          >
            <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-enter">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] text-[var(--color-danger)] shrink-0">
                  <Trash2 size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                    Move {downloadsToRecycle.length} file{downloadsToRecycle.length > 1 ? 's' : ''} to Windows Recycle Bin?
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    These installers and archives will be moved to your Windows Recycle Bin. You can easily restore them at any time from your Desktop.
                  </p>
                </div>
              </div>

              <div className="mt-4 max-h-48 overflow-y-auto p-3 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] space-y-1.5">
                {downloadsToRecycle.map((d) => (
                  <div key={d.path} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[var(--color-text-primary)] truncate max-w-[280px]">{d.name}</span>
                    <span className="text-[var(--color-text-secondary)] shrink-0">{d.size_formatted}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDownloadsOpen(false)}
                  disabled={isRecyclingDownloads}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRecycleDownloads}
                  disabled={isRecyclingDownloads}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-danger)] hover:bg-[var(--color-danger)]/90 text-white transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isRecyclingDownloads ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Moving to Recycle Bin...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={13} />
                      <span>Recycle Files</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

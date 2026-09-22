import React, { useState, useMemo } from 'react';
import { 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Folder, 
  Database,
  Loader2,
  Check,
  Copy,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { EnvironmentOverview } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface CleanupViewProps {
  overview: EnvironmentOverview;
  onRefresh: () => Promise<void> | void;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const CleanupView: React.FC<CleanupViewProps> = ({ overview, onRefresh }) => {
  const artifacts = overview?.system?.artifacts || [];
  const caches = overview?.system?.caches || [];
  const [selectedArtifacts, setSelectedArtifacts] = useState<Set<string>>(new Set());
  const [isCleaning, setIsCleaning] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const totalArtifactBytes = useMemo(() => 
    artifacts.reduce((acc, a) => acc + (a.size_bytes || 0), 0), 
  [artifacts]);
  
  const totalCacheBytes = useMemo(() => 
    caches.reduce((acc, c) => acc + (c.size_bytes || 0), 0), 
  [caches]);

  const totalReclaimableBytes = totalArtifactBytes + totalCacheBytes;

  const selectedArtifactBytes = useMemo(() => 
    artifacts.filter(a => selectedArtifacts.has(a.path)).reduce((acc, a) => acc + (a.size_bytes || 0), 0),
  [artifacts, selectedArtifacts]);

  const totalSelectedBytes = selectedArtifactBytes;
  const totalSelectedCount = selectedArtifacts.size;

  const handleToggleArtifact = (path: string) => {
    const newSelected = new Set(selectedArtifacts);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedArtifacts(newSelected);
  };

  const handleSelectAllSafe = () => {
    if (selectedArtifacts.size === artifacts.length) {
      setSelectedArtifacts(new Set()); // deselect all
    } else {
      setSelectedArtifacts(new Set(artifacts.map(a => a.path)));
    }
  };

  const handleCleanSelected = async () => {
    if (totalSelectedCount === 0) return;
    
    setIsCleaning(true);
    setToastMessage(null);
    
    try {
      const pathsToClean = Array.from(selectedArtifacts);
      const result = await EntropyApiClient.cleanArtifacts(pathsToClean);
      
      if (result.success) {
        setToastMessage(`Freed ${formatBytes(result.total_freed_bytes || 0)} (${result.success_count} items cleaned)`);
        setSelectedArtifacts(new Set());
        await onRefresh();
      } else {
        setToastMessage(`Partial failure: cleaned ${result.success_count}, failed ${result.failed_count}`);
      }
    } catch (error) {
      console.error("Cleanup failed:", error);
      setToastMessage("Cleanup failed. See console for details.");
    } finally {
      setIsCleaning(false);
      setTimeout(() => setToastMessage(null), 5000);
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  if (artifacts.length === 0 && caches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-secondary)] space-y-4">
        <CheckCircle2 size={64} className="text-[var(--color-accent)] opacity-50" />
        <h2 className="text-xl font-medium text-[var(--color-text-primary)]">Your machine is clean</h2>
        <p>No reclaimable items found in your workspaces.</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-[var(--color-surface-0)] text-[var(--color-text-primary)] overflow-hidden">
      {/* Header */}
      <div className="p-8 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <div className="flex items-center gap-3 mb-2">
          <Trash2 size={28} className="text-[var(--color-accent)]" />
          <h1 className="text-3xl font-semibold">Cleanup</h1>
        </div>
        <p className="text-[var(--color-text-secondary)] text-sm">
          Reclaim disk space by safely removing disposable project folders. Shared caches are shown for awareness.
          Total visible disk use: <strong className="text-[var(--color-text-primary)]">{formatBytes(totalReclaimableBytes)}</strong>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-4 py-3">
            <div className="text-xs text-[var(--color-text-tertiary)]">Reclaimable folders</div>
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">{formatBytes(totalArtifactBytes)}</div>
          </div>
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-4 py-3">
            <div className="text-xs text-[var(--color-text-tertiary)]">Shared cache size</div>
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">{formatBytes(totalCacheBytes)}</div>
          </div>
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-4 py-3">
            <div className="text-xs text-[var(--color-text-tertiary)]">Active processes</div>
            <div className="text-lg font-semibold text-[var(--color-text-primary)]">{overview.summary.total_processes}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8">
        
        {/* Safe Project Dependencies */}
        {artifacts.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Folder size={20} className="text-emerald-500" />
                <h2 className="text-lg font-medium">Project Dependencies</h2>
                <span className="text-[var(--color-text-tertiary)] text-sm ml-2 bg-[var(--color-surface-2)] px-2 py-0.5 rounded-full">
                  {artifacts.length} items
                </span>
              </div>
              <button 
                onClick={handleSelectAllSafe}
                className="text-sm text-[var(--color-accent)] hover:text-emerald-400 transition-colors bg-transparent cursor-pointer"
              >
                {selectedArtifacts.size === artifacts.length ? 'Clear Selection' : 'Select All'}
              </button>
            </div>
            
            <div className="space-y-2">
              {artifacts.map((artifact) => (
                <div 
                  key={artifact.path}
                  onClick={() => handleToggleArtifact(artifact.path)}
                  className={`flex items-center justify-between p-4 rounded-xl border-l-4 cursor-pointer transition-all ${
                    selectedArtifacts.has(artifact.path) 
                      ? 'bg-[var(--color-surface-2)] border-l-emerald-500' 
                      : 'bg-[var(--color-surface-1)] border-l-emerald-500/30 hover:bg-[var(--color-surface-2)]'
                  } border-t border-r border-b border-t-[var(--color-border)] border-r-[var(--color-border)] border-b-[var(--color-border)]`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                      selectedArtifacts.has(artifact.path)
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-[var(--color-border)]'
                    }`}>
                      {selectedArtifacts.has(artifact.path) && <Check size={14} className="text-white" />}
                    </div>
                    <div>
                      <div className="font-medium">{artifact.name}</div>
                      <div className="text-xs text-[var(--color-text-secondary)] mt-0.5 flex items-center gap-2">
                        <span>{artifact.project_path}</span>
                        <span className="w-1 h-1 rounded-full bg-[var(--color-text-tertiary)]"></span>
                        <span className="text-[var(--color-text-tertiary)]">{artifact.category}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-[var(--color-text-primary)]">
                      {formatBytes(artifact.size_bytes)}
                    </div>
                    <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      Safe to delete
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Shared Caches */}
        {caches.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Database size={20} className="text-amber-500" />
              <h2 className="text-lg font-medium">Shared Caches</h2>
              <span className="text-[var(--color-text-tertiary)] text-sm ml-2 bg-[var(--color-surface-2)] px-2 py-0.5 rounded-full">
                {caches.length} items
              </span>
              <div className="ml-auto flex items-center gap-1 text-amber-500/80 text-xs bg-amber-500/10 px-2 py-1 rounded">
                <AlertTriangle size={14} />
                Review before deleting manually
              </div>
            </div>
            
            <div className="space-y-2">
              {caches.map((cache) => (
                <div 
                  key={cache.path}
                  className="flex items-center justify-between p-4 rounded-xl border-l-4 border-l-amber-500/30 bg-[var(--color-surface-1)] border-t border-r border-b border-t-[var(--color-border)] border-r-[var(--color-border)] border-b-[var(--color-border)]"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-5 h-5 rounded border border-amber-500/30 bg-amber-500/10 flex items-center justify-center">
                      <Database size={12} className="text-amber-400" />
                    </div>
                    <div>
                      <div className="font-medium">{cache.category} Cache</div>
                      <div className="text-xs text-[var(--color-text-secondary)] mt-0.5 flex items-center gap-2 font-mono">
                        <span>{cache.path}</span>
                      </div>
                      <div className="text-xs text-[var(--color-text-tertiary)] mt-1">
                        {cache.scope_explanation || 'Shared across projects on this machine.'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className="font-medium text-[var(--color-text-primary)]">
                      {formatBytes(cache.size_bytes || 0)}
                    </div>
                    <div className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      {cache.entry_count ? `${cache.entry_count} entries` : 'Unknown entries'}
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => handleCopyPath(cache.path)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] rounded-md transition-colors cursor-pointer"
                      >
                        <Copy size={13} />
                        {copiedPath === cache.path ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={() => EntropyApiClient.openInExplorer(cache.path)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] rounded-md transition-colors cursor-pointer"
                      >
                        <ExternalLink size={13} />
                        Open
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        
        {/* Spacer for bottom bar */}
        <div className="h-24"></div>
      </div>

      {/* Bottom Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-[var(--color-surface-1)] border-t border-[var(--color-border)] shadow-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-lg">
            <span className="font-medium">{totalSelectedCount}</span> items selected
          </div>
          <div className="text-[var(--color-text-secondary)] text-sm">
            ({formatBytes(totalSelectedBytes)} total)
          </div>
        </div>
        <div className="flex items-center gap-4">
          {toastMessage && (
            <div className="text-emerald-400 text-sm flex items-center gap-2 bg-emerald-400/10 px-3 py-1.5 rounded-full animate-in fade-in slide-in-from-bottom-2">
              <CheckCircle2 size={16} />
              {toastMessage}
            </div>
          )}
          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={isCleaning}
            className="px-4 py-2.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] font-medium flex items-center gap-2 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleCleanSelected}
            disabled={totalSelectedCount === 0 || isCleaning}
            className="px-6 py-2.5 rounded-lg bg-[var(--color-accent)] hover:bg-opacity-90 text-white font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isCleaning ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Cleaning...
              </>
            ) : (
              <>
                <Trash2 size={18} />
                Clean Selected
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

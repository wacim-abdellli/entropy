import React, { useEffect, useState, useMemo } from 'react';
import {
  FileWarning,
  RefreshCw,
  FolderOpen,
  Trash2,
  Search,
  Film,
  Archive,
  Database,
  Cpu,
  FileCode,
  AlertTriangle,
  HardDrive,
  CheckCircle2,
} from 'lucide-react';
import { LargeFileItem } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface LargeFilesHunterTabProps {
  onNotice?: (notice: { type: 'success' | 'error' | 'info'; title: string; message: string }) => void;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getCategoryIcon(cat: string) {
  switch (cat) {
    case 'media':
      return <Film className="w-4 h-4 text-[var(--color-accent)]" />;
    case 'archive':
      return <Archive className="w-4 h-4 text-[var(--color-warning)]" />;
    case 'database':
      return <Database className="w-4 h-4 text-[var(--color-success)]" />;
    case 'model_ml':
      return <Cpu className="w-4 h-4 text-[var(--color-accent-strong)]" />;
    case 'binary':
      return <FileCode className="w-4 h-4 text-[var(--color-danger)]" />;
    default:
      return <HardDrive className="w-4 h-4 text-[var(--color-text-secondary)]" />;
  }
}

export const LargeFilesHunterTab: React.FC<LargeFilesHunterTabProps> = ({ onNotice }) => {
  const [files, setFiles] = useState<LargeFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [minSizeMb, setMinSizeMb] = useState<number>(10);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [confirmDelete, setConfirmDelete] = useState<LargeFileItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchFiles = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      const data = await EntropyApiClient.scanLargeFiles(null, minSizeMb);
      setFiles(data);
    } catch (err) {
      console.error('Failed to scan large files:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFiles(false);
  }, [minSizeMb]);

  const handleOpenExplorer = async (path: string) => {
    try {
      await EntropyApiClient.openInExplorer(path);
    } catch (err) {
      console.error('Failed to open file in explorer:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const file = confirmDelete;
    setDeleting(true);

    try {
      const res = await EntropyApiClient.deleteLargeFile(file.path, true);
      if (res.success) {
        setFiles((prev) => prev.filter((f) => f.path !== file.path));
        onNotice?.({
          type: 'success',
          title: 'File Moved to Recycle Bin',
          message: `Moved ${file.name} (${formatBytes(file.size_bytes)}) to the Windows Recycle Bin.`,
        });
      } else {
        onNotice?.({
          type: 'error',
          title: 'Could Not Delete File',
          message: res.error || 'File may be in use by another process.',
        });
      }
    } catch (err) {
      console.error('Error deleting file:', err);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const totalBytes = useMemo(() => files.reduce((acc, f) => acc + f.size_bytes, 0), [files]);

  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        f.name.toLowerCase().includes(q) ||
        f.relative_path.toLowerCase().includes(q) ||
        f.extension.toLowerCase().includes(q)
      );
    });
  }, [files, categoryFilter, query]);

  if (loading && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-[var(--color-text-tertiary)]">
        <RefreshCw className="w-6 h-6 animate-spin mb-3 text-[var(--color-accent)]" />
        <p className="text-xs font-mono">Hunting large files across workspaces…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-enter">
      {/* Header and Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-[var(--color-border-subtle)]">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-[var(--color-warning)]" />
            Large Files Hunter
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Locate heavy video dumps, uncompressed archives, and stale build installers inside project workspaces.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Threshold Picker */}
          <div className="flex items-center gap-1 bg-[var(--color-surface-2)] p-0.5 rounded-lg border border-[var(--color-border)] text-[11px] font-mono">
            <span className="px-2 text-[var(--color-text-tertiary)]">Min Size:</span>
            {[10, 25, 50, 100].map((mb) => (
              <button
                key={mb}
                type="button"
                onClick={() => setMinSizeMb(mb)}
                className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  minSizeMb === mb
                    ? 'bg-[var(--color-accent)] text-white font-semibold'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                {mb}MB
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => fetchFiles(true)}
            disabled={refreshing}
            className="h-7 px-2.5 rounded-md text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            title="Rescan large files"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[var(--color-accent)]' : ''}`} />
            Rescan
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs">
          <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)] block">
            Files Found
          </span>
          <span className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1 block">
            {files.length}
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
            Exceeding {minSizeMb} MB threshold
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs">
          <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)] block">
            Total Reclaimable
          </span>
          <span className="text-xl font-bold font-mono text-[var(--color-warning)] mt-1 block">
            {formatBytes(totalBytes)}
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
            Across scanned workspaces
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs col-span-2 sm:col-span-1">
          <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)] block">
            Safety Guarantee
          </span>
          <span className="text-sm font-semibold text-[var(--color-success)] mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Recycle Bin Protected
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono block mt-0.5">
            Deleted files can be undone in Windows
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]">
          {['all', 'binary', 'archive', 'media', 'database', 'model_ml'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`h-7 px-2.5 text-xs rounded-md font-medium transition-colors cursor-pointer capitalize ${
                categoryFilter === cat
                  ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {cat === 'all'
                ? `All (${files.length})`
                : cat === 'binary'
                ? `Binaries (${files.filter((f) => f.category === 'binary').length})`
                : cat === 'archive'
                ? `Archives (${files.filter((f) => f.category === 'archive').length})`
                : cat === 'media'
                ? `Media (${files.filter((f) => f.category === 'media').length})`
                : cat === 'database'
                ? `Databases (${files.filter((f) => f.category === 'database').length})`
                : `Models (${files.filter((f) => f.category === 'model_ml').length})`}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--color-text-tertiary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by file name or extension…"
            className="w-full h-8 pl-8 pr-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] outline-none"
          />
        </div>
      </div>

      {/* Files Table */}
      <div className="border border-[var(--color-border)] rounded-xl overflow-hidden bg-[var(--color-surface-1)] shadow-xs">
        <div className="grid grid-cols-[1.5fr_100px_110px_80px] gap-4 px-4 py-2.5 text-[10px] uppercase font-semibold tracking-wider text-[var(--color-text-tertiary)] border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
          <span>File & Location</span>
          <span>Category</span>
          <span className="text-right">File Size</span>
          <span className="text-right">Action</span>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {filteredFiles.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--color-text-tertiary)]">
              No large files found exceeding {minSizeMb} MB.
            </div>
          ) : (
            filteredFiles.map((file) => (
              <div
                key={file.path}
                className="grid grid-cols-[1.5fr_100px_110px_80px] gap-4 items-center px-4 py-3 hover:bg-[var(--color-surface-2)]/60 transition-colors"
              >
                {/* File Name & Path */}
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(file.category)}
                    <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate" title={file.name}>
                      {file.name}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[var(--color-text-tertiary)] truncate mt-0.5 ml-6" title={file.path}>
                    {file.relative_path}
                  </div>
                </div>

                {/* Category Badge */}
                <div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)]">
                    {file.category}
                  </span>
                </div>

                {/* Size */}
                <div className="text-right">
                  <span className="text-sm font-bold font-mono text-[var(--color-text-primary)]">
                    {formatBytes(file.size_bytes)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenExplorer(file.path)}
                    className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer"
                    title="Open in Windows Explorer"
                    aria-label={`Open ${file.name} in Explorer`}
                  >
                    <FolderOpen className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmDelete(file)}
                    className="p-1.5 rounded-md text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer"
                    title="Move file to Recycle Bin"
                    aria-label={`Delete ${file.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Recycle Bin Delete Confirmation Dialog */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)]">
                <AlertTriangle size={20} className="text-[var(--color-danger)]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
                  Move to Recycle Bin
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Are you sure you want to move <strong className="text-[var(--color-text-primary)]">{confirmDelete.name}</strong> to the Windows Recycle Bin?
                  This will safely free <strong className="text-[var(--color-warning)]">{formatBytes(confirmDelete.size_bytes)}</strong> on your drive.
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[var(--color-surface-3)] font-mono text-xs text-[var(--color-text-tertiary)] mb-4 truncate">
              {confirmDelete.path}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-danger)] text-white hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Moving…' : 'Move to Recycle Bin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

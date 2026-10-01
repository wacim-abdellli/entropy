import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Search,
  RefreshCw,
  FolderOpen,
  Trash2,
  Code2,
  Globe,
  MessageSquare,
  FileSpreadsheet,
  Film,
  Wrench,
  Gamepad2,
  HardDrive,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { InstalledAppItem } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface InstalledAppsTabProps {
  onNotice?: (notice: { type: 'success' | 'error' | 'info'; title: string; message: string }) => void;
}

type AppCategoryFilter = 'all' | 'dev' | 'browser' | 'communication' | 'productivity' | 'media' | 'utility' | 'game';
type SortField = 'size' | 'name' | 'date';

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getCategoryIcon(cat: string, isDev: boolean) {
  if (isDev || cat === 'development') {
    return <Code2 className="w-4 h-4 text-[var(--color-accent)]" />;
  }
  switch (cat) {
    case 'browser':
      return <Globe className="w-4 h-4 text-[var(--color-accent-strong)]" />;
    case 'communication':
      return <MessageSquare className="w-4 h-4 text-[var(--color-warning)]" />;
    case 'productivity':
      return <FileSpreadsheet className="w-4 h-4 text-[var(--color-success)]" />;
    case 'media':
      return <Film className="w-4 h-4 text-[var(--color-accent)]" />;
    case 'utility':
      return <Wrench className="w-4 h-4 text-[var(--color-text-secondary)]" />;
    case 'game':
      return <Gamepad2 className="w-4 h-4 text-[var(--color-danger)]" />;
    default:
      return <Package className="w-4 h-4 text-[var(--color-text-tertiary)]" />;
  }
}

export const InstalledAppsTab: React.FC<InstalledAppsTabProps> = ({ onNotice }) => {
  const [apps, setApps] = useState<InstalledAppItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AppCategoryFilter>('all');
  const [sortField, setSortField] = useState<SortField>('size');
  const [sortAsc, setSortAsc] = useState(false);
  const [confirmUninstallApp, setConfirmUninstallApp] = useState<InstalledAppItem | null>(null);
  const [launchingAppId, setLaunchingAppId] = useState<string | null>(null);

  const fetchApps = async () => {
    try {
      const data = await EntropyApiClient.getInstalledApps();
      setApps(data || []);
    } catch (err) {
      console.error('Failed to load installed apps:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchApps();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchApps();
  };

  // Keyboard shortcut to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && confirmUninstallApp) {
        setConfirmUninstallApp(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmUninstallApp]);

  const handleLaunchUninstaller = async (app: InstalledAppItem) => {
    setLaunchingAppId(app.id);
    try {
      const res = await EntropyApiClient.launchAppUninstaller(app.id);
      if (res.success) {
        onNotice?.({
          type: 'success',
          title: 'Uninstaller Started',
          message: res.message || `Started uninstaller for ${app.name}.`,
        });
      } else {
        onNotice?.({
          type: 'error',
          title: 'Uninstallation Failed',
          message: res.error || `Could not launch uninstaller for ${app.name}.`,
        });
      }
    } catch (err) {
      onNotice?.({
        type: 'error',
        title: 'Error',
        message: String(err),
      });
    } finally {
      setLaunchingAppId(null);
      setConfirmUninstallApp(null);
    }
  };

  const handleOpenFolder = async (path: string) => {
    try {
      const res = await EntropyApiClient.openAppFolder(path);
      if (!res.success) {
        onNotice?.({
          type: 'error',
          title: 'Cannot Open Folder',
          message: res.error || 'Folder not found.',
        });
      }
    } catch (err) {
      onNotice?.({
        type: 'error',
        title: 'Error',
        message: String(err),
      });
    }
  };

  // Filter and sort
  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      // Category filter
      if (categoryFilter === 'dev' && !app.is_dev_tool && app.category !== 'development') {
        return false;
      }
      if (categoryFilter !== 'all' && categoryFilter !== 'dev' && app.category !== categoryFilter) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = app.name.toLowerCase().includes(q);
        const matchPub = (app.publisher || '').toLowerCase().includes(q);
        const matchVer = (app.version || '').toLowerCase().includes(q);
        if (!matchName && !matchPub && !matchVer) return false;
      }

      return true;
    });
  }, [apps, categoryFilter, searchQuery]);

  const sortedApps = useMemo(() => {
    return [...filteredApps].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'size') {
        const sizeA = a.size_bytes || 0;
        const sizeB = b.size_bytes || 0;
        comparison = sizeA - sizeB;
      } else if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'date') {
        const dateA = a.install_date || '';
        const dateB = b.install_date || '';
        comparison = dateA.localeCompare(dateB);
      }
      return sortAsc ? comparison : -comparison;
    });
  }, [filteredApps, sortField, sortAsc]);

  // Aggregate stats
  const stats = useMemo(() => {
    const totalApps = apps.length;
    const devTools = apps.filter((a) => a.is_dev_tool || a.category === 'development').length;
    const totalSizeBytes = apps.reduce((acc, a) => acc + (a.size_bytes || 0), 0);
    const userScopeCount = apps.filter((a) => a.scope === 'user').length;
    const systemScopeCount = apps.filter((a) => a.scope === 'system').length;

    return {
      totalApps,
      devTools,
      totalSizeBytes,
      userScopeCount,
      systemScopeCount,
    };
  }, [apps]);

  return (
    <div className="space-y-6">
      {/* ── Summary Hero Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Applications */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Total Installed Apps</span>
            <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
              {loading ? '—' : stats.totalApps}
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              {stats.userScopeCount} user • {stats.systemScopeCount} system
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)]">
            <Package size={20} />
          </div>
        </div>

        {/* Card 2: Developer Tools */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Developer Tools &amp; SDKs</span>
            <div className="text-xl font-bold font-mono text-[var(--color-accent-strong)] mt-1">
              {loading ? '—' : stats.devTools}
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              IDEs, compilers, databases, shells
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)]">
            <Code2 size={20} />
          </div>
        </div>

        {/* Card 3: Tracked Disk Footprint */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Reported App Footprint</span>
            <div className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1">
              {loading ? '—' : formatBytes(stats.totalSizeBytes)}
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              Across all drive installations
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)]">
            <HardDrive size={20} />
          </div>
        </div>

        {/* Card 4: Quick Refresh Action */}
        <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-[var(--color-text-secondary)]">Registry Status</span>
            <div className="text-sm font-semibold text-[var(--color-success)] flex items-center gap-1.5 mt-1">
              <CheckCircle2 size={16} />
              <span>Live Synced</span>
            </div>
            <div className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
              64-bit &amp; 32-bit hives checked
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            aria-label="Refresh installed apps registry"
            className="p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Toolbar: Category Filters, Search & Sort ── */}
      <div className="p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] space-y-4 shadow-xs">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'All Software', count: apps.length },
            { id: 'dev', label: 'Developer Tools', count: stats.devTools },
            { id: 'browser', label: 'Browsers', count: apps.filter((a) => a.category === 'browser').length },
            { id: 'productivity', label: 'Productivity', count: apps.filter((a) => a.category === 'productivity').length },
            { id: 'communication', label: 'Communication', count: apps.filter((a) => a.category === 'communication').length },
            { id: 'media', label: 'Media & Design', count: apps.filter((a) => a.category === 'media').length },
            { id: 'utility', label: 'Utilities', count: apps.filter((a) => a.category === 'utility').length },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id as AppCategoryFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                categoryFilter === cat.id
                  ? 'bg-[var(--color-accent)] text-white shadow-xs font-semibold'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] border border-[var(--color-border)]'
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  categoryFilter === cat.id
                    ? 'bg-white/20 text-white'
                    : 'bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]'
                }`}
              >
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Bar and Sort Selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-[var(--color-border)]">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by app name, publisher, or version…"
              aria-label="Filter applications"
              className="w-full pl-9 pr-4 py-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-hidden focus:border-[var(--color-accent)] transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-tertiary)] shrink-0">Sort by:</span>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              aria-label="Sort applications by"
              className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs text-[var(--color-text-primary)] focus:outline-hidden focus:border-[var(--color-accent)] cursor-pointer"
            >
              <option value="size">Size (Installed Footprint)</option>
              <option value="name">Application Name</option>
              <option value="date">Installation Date</option>
            </select>
            <button
              type="button"
              onClick={() => setSortAsc(!sortAsc)}
              aria-label={sortAsc ? 'Ascending sort order' : 'Descending sort order'}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
            >
              {sortAsc ? '↑ Asc' : '↓ Desc'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Applications Table / List ── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--color-accent)]" />
            <p className="text-xs text-[var(--color-text-secondary)]">
              Enumerating installed desktop applications from Windows registry…
            </p>
          </div>
        ) : sortedApps.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Package className="w-8 h-8 mx-auto text-[var(--color-text-tertiary)] opacity-40" />
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">No applications match your criteria</p>
            <p className="text-xs text-[var(--color-text-tertiary)]">Try clearing the search query or changing category.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {sortedApps.map((app) => (
              <div
                key={app.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--color-surface-2)]/60 transition-colors"
              >
                {/* Left side: Icon, Name, Version, Publisher, Badges */}
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center shrink-0 mt-0.5">
                    {getCategoryIcon(app.category, app.is_dev_tool)}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                        {app.name}
                      </span>
                      {app.version && (
                        <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] border border-[var(--color-border)]">
                          v{app.version}
                        </span>
                      )}
                      {app.is_dev_tool && (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20">
                          Dev Tool
                        </span>
                      )}
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]">
                        {app.scope}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-tertiary)] flex-wrap">
                      {app.publisher && <span>{app.publisher}</span>}
                      {app.install_date && (
                        <span>Installed: <span className="font-mono">{app.install_date}</span></span>
                      )}
                      {app.install_location && (
                        <span className="font-mono truncate max-w-xs text-[10px] opacity-75">
                          {app.install_location}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Size & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--color-border)]/40">
                  <div className="text-right">
                    <div className="text-xs font-bold font-mono text-[var(--color-text-primary)]">
                      {app.size_formatted || formatBytes(app.size_bytes)}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-tertiary)] uppercase font-mono">
                      Footprint
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Open folder in explorer */}
                    {app.install_location && (
                      <button
                        type="button"
                        onClick={() => void handleOpenFolder(app.install_location!)}
                        title="Open install folder in File Explorer"
                        aria-label={`Open install folder for ${app.name}`}
                        className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                      >
                        <FolderOpen size={14} />
                      </button>
                    )}

                    {/* Launch uninstaller */}
                    {app.can_uninstall && (
                      <button
                        type="button"
                        onClick={() => setConfirmUninstallApp(app)}
                        disabled={launchingAppId === app.id}
                        title="Launch official uninstaller"
                        aria-label={`Uninstall ${app.name}`}
                        className="p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-danger-bg)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger-border)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {launchingAppId === app.id ? (
                          <Loader2 size={14} className="animate-spin text-[var(--color-danger)]" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Uninstall Confirmation Modal ── */}
      {confirmUninstallApp && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] text-[var(--color-warning)] shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Launch Uninstaller for {confirmUninstallApp.name}?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  This will start the official Windows uninstallation wizard registered by{' '}
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {confirmUninstallApp.publisher || confirmUninstallApp.name}
                  </span>
                  .
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] space-y-2 text-xs">
              <div className="flex justify-between text-[var(--color-text-secondary)]">
                <span>Application:</span>
                <span className="font-semibold text-[var(--color-text-primary)]">{confirmUninstallApp.name}</span>
              </div>
              {confirmUninstallApp.version && (
                <div className="flex justify-between text-[var(--color-text-secondary)]">
                  <span>Version:</span>
                  <span className="font-mono text-[var(--color-text-primary)]">v{confirmUninstallApp.version}</span>
                </div>
              )}
              {confirmUninstallApp.size_bytes && confirmUninstallApp.size_bytes > 0 && (
                <div className="flex justify-between text-[var(--color-text-secondary)]">
                  <span>Reported Size:</span>
                  <span className="font-mono font-semibold text-[var(--color-accent-strong)]">
                    {confirmUninstallApp.size_formatted}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-[var(--color-text-secondary)]">
                <span>Scope:</span>
                <span className="capitalize text-[var(--color-text-primary)]">{confirmUninstallApp.scope} Application</span>
              </div>
            </div>

            <p className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
              Entropy will safely hand off to the setup wizard. You will be able to review, adjust, or cancel the removal inside the application's uninstaller.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmUninstallApp(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleLaunchUninstaller(confirmUninstallApp)}
                disabled={launchingAppId === confirmUninstallApp.id}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-danger)] hover:opacity-90 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                {launchingAppId === confirmUninstallApp.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <ExternalLink size={13} />
                )}
                <span>Launch Uninstaller</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

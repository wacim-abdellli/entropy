import React, { useEffect, useState, useMemo } from 'react';
import {
  Power,
  RefreshCw,
  AlertTriangle,
  Lock,
  Trash2,
  Search,
} from 'lucide-react';
import { StartupProgramItem } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface StartupManagerTabProps {
  onNotice?: (notice: { type: 'success' | 'error' | 'info'; title: string; message: string }) => void;
}

export const StartupManagerTab: React.FC<StartupManagerTabProps> = ({ onNotice }) => {
  const [items, setItems] = useState<StartupProgramItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'high' | 'dead'>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StartupProgramItem | null>(null);

  const fetchItems = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      const data = await EntropyApiClient.getStartupPrograms();
      setItems(data);
    } catch (err) {
      console.error('Failed to load startup programs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchItems(false);
  }, []);

  const handleToggle = async (item: StartupProgramItem) => {
    if (!item.can_modify) return;
    setTogglingId(item.id);
    const newTarget = !item.is_enabled;

    try {
      const res = await EntropyApiClient.setStartupProgramState(item.id, newTarget);
      if (res.success) {
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, is_enabled: newTarget } : it))
        );
        onNotice?.({
          type: 'success',
          title: newTarget ? 'Startup Program Enabled' : 'Startup Program Disabled',
          message: `${item.name} will ${newTarget ? 'now launch' : 'no longer launch'} when Windows boots.`,
        });
      } else {
        onNotice?.({
          type: 'error',
          title: 'Could Not Update Startup State',
          message: res.error || 'Failed to update registry.',
        });
      }
    } catch (err) {
      console.error('Error toggling startup state:', err);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const item = confirmDelete;
    setConfirmDelete(null);

    try {
      const res = await EntropyApiClient.removeStartupProgram(item.id);
      if (res.success) {
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        onNotice?.({
          type: 'success',
          title: 'Startup Entry Removed',
          message: `Removed ${item.name} from Windows startup list.`,
        });
      } else {
        onNotice?.({
          type: 'error',
          title: 'Removal Failed',
          message: res.error || 'Failed to delete startup entry.',
        });
      }
    } catch (err) {
      console.error('Error deleting startup item:', err);
    }
  };

  // Stats
  const totalCount = items.length;
  const enabledCount = items.filter((i) => i.is_enabled).length;
  const highImpactCount = items.filter((i) => i.is_enabled && i.impact === 'high').length;
  const deadCount = items.filter((i) => !i.exists).length;

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filter === 'enabled' && !item.is_enabled) return false;
      if (filter === 'disabled' && item.is_enabled) return false;
      if (filter === 'high' && item.impact !== 'high') return false;
      if (filter === 'dead' && item.exists) return false;

      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.command.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q)
      );
    });
  }, [items, filter, query]);

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-[var(--color-text-tertiary)]">
        <RefreshCw className="w-6 h-6 animate-spin mb-3 text-[var(--color-accent)]" />
        <p className="text-xs font-mono">Auditing Windows startup programs…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-enter">
      {/* Header & Stats Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-[var(--color-border-subtle)]">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
            <Power className="w-4 h-4 text-[var(--color-warning)]" />
            Startup Programs & Boot Optimization
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)]">
            Control applications that launch automatically when Windows boots to speed up startup time.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchItems(true)}
          disabled={refreshing}
          className="h-7 px-2.5 rounded-md text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          title="Rescan startup programs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-[var(--color-accent)]' : ''}`} />
          Rescan
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs">
          <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)] block">
            Total Programs
          </span>
          <span className="text-xl font-bold font-mono text-[var(--color-text-primary)] mt-1 block">
            {totalCount}
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">Registry & Folder</span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs">
          <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)] block">
            Active at Boot
          </span>
          <span className="text-xl font-bold font-mono text-[var(--color-accent)] mt-1 block">
            {enabledCount}
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
            {totalCount - enabledCount} disabled
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs">
          <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)] block">
            High Boot Impact
          </span>
          <span
            className={`text-xl font-bold font-mono mt-1 block ${
              highImpactCount > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'
            }`}
          >
            {highImpactCount}
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
            Heavy dev/desktop apps
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] shadow-xs">
          <span className="text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)] block">
            Dead / Missing Paths
          </span>
          <span
            className={`text-xl font-bold font-mono mt-1 block ${
              deadCount > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-secondary)]'
            }`}
          >
            {deadCount}
          </span>
          <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
            {deadCount > 0 ? 'Safe to clean' : 'All paths verified'}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)]">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`h-7 px-2.5 text-xs rounded-md font-medium transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            All ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('enabled')}
            className={`h-7 px-2.5 text-xs rounded-md font-medium transition-colors cursor-pointer ${
              filter === 'enabled'
                ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            Enabled ({enabledCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('disabled')}
            className={`h-7 px-2.5 text-xs rounded-md font-medium transition-colors cursor-pointer ${
              filter === 'disabled'
                ? 'bg-[var(--color-surface-3)] text-[var(--color-text-primary)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            Disabled ({totalCount - enabledCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter('high')}
            className={`h-7 px-2.5 text-xs rounded-md font-medium transition-colors cursor-pointer ${
              filter === 'high'
                ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            High Impact ({items.filter((i) => i.impact === 'high').length})
          </button>
          {deadCount > 0 && (
            <button
              type="button"
              onClick={() => setFilter('dead')}
              className={`h-7 px-2.5 text-xs rounded-md font-medium transition-colors cursor-pointer ${
                filter === 'dead'
                  ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]'
                  : 'text-[var(--color-warning)] hover:bg-[var(--color-warning-bg)]/50'
              }`}
            >
              Dead Paths ({deadCount})
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--color-text-tertiary)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search startup apps…"
            className="w-full h-8 pl-8 pr-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] outline-none"
          />
        </div>
      </div>

      {/* Startup Programs Table */}
      <div className="border border-[var(--color-border)] rounded-xl overflow-hidden bg-[var(--color-surface-1)] shadow-xs">
        <div className="grid grid-cols-[1.4fr_110px_130px_1fr_90px] gap-4 px-4 py-2.5 text-[10px] uppercase font-semibold tracking-wider text-[var(--color-text-tertiary)] border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-2)]">
          <span>Application</span>
          <span>Boot Impact</span>
          <span>Registry Scope</span>
          <span>Command Line</span>
          <span className="text-right">Auto-Start</span>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--color-text-tertiary)]">
              No startup programs match the selected filter.
            </div>
          ) : (
            filteredItems.map((item) => {
              const isToggling = togglingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[1.4fr_110px_130px_1fr_90px] gap-4 items-center px-4 py-3 hover:bg-[var(--color-surface-2)]/60 transition-colors ${
                    !item.is_enabled ? 'opacity-65' : ''
                  }`}
                >
                  {/* Name and Exe status */}
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                        {item.name}
                      </span>
                      {!item.exists && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)] text-[var(--color-warning)] shrink-0">
                          Dead Path
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-[var(--color-text-tertiary)] truncate mt-0.5" title={item.exe_path}>
                      {item.exe_path || 'No executable path'}
                    </div>
                  </div>

                  {/* Impact */}
                  <div>
                    {item.impact === 'high' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--color-danger-bg)] text-[var(--color-danger)] border border-[var(--color-danger-border)]">
                        <AlertTriangle className="w-3 h-3" /> High Impact
                      </span>
                    ) : item.impact === 'medium' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning-border)]">
                        Medium Impact
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)]">
                        Low Impact
                      </span>
                    )}
                  </div>

                  {/* Scope */}
                  <div className="text-xs font-mono">
                    <span className="text-[var(--color-text-secondary)]">{item.source}</span>
                    <span className="text-[10px] text-[var(--color-text-tertiary)] block">
                      {item.can_modify ? 'User Profile' : 'System-Wide 🔒'}
                    </span>
                  </div>

                  {/* Command preview */}
                  <div className="min-w-0">
                    <span className="text-xs font-mono text-[var(--color-text-tertiary)] truncate block" title={item.command}>
                      {item.command}
                    </span>
                  </div>

                  {/* Actions / Toggle Switch */}
                  <div className="flex items-center justify-end gap-2">
                    {item.can_modify ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggle(item)}
                          disabled={isToggling}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            item.is_enabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-surface-4)]'
                          }`}
                          role="switch"
                          aria-checked={item.is_enabled}
                          aria-label={`Toggle auto-start for ${item.name}`}
                          title={item.is_enabled ? 'Disable auto-start' : 'Enable auto-start'}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              item.is_enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => setConfirmDelete(item)}
                          className="p-1 rounded text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors cursor-pointer"
                          title={`Permanently remove ${item.name} from startup`}
                          aria-label={`Delete ${item.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-1 text-[11px] font-mono text-[var(--color-text-tertiary)]">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Locked</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Confirmation Dialog for Permanent Removal */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)]">
                <AlertTriangle size={20} className="text-[var(--color-warning)]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-1">
                  Remove Startup Program
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Are you sure you want to remove <strong className="text-[var(--color-text-primary)]">{confirmDelete.name}</strong> from Windows startup?
                  The application will not be uninstalled, but its auto-launch registry key will be deleted.
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[var(--color-surface-3)] font-mono text-xs text-[var(--color-text-tertiary)] mb-4 truncate">
              {confirmDelete.command}
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-danger)] text-white hover:opacity-90 transition-opacity cursor-pointer"
              >
                Delete Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Search, Home, Trash2, Monitor, Settings, RefreshCw, LucideIcon } from 'lucide-react';
import { EntropyLogo } from './EntropyLogo';
import { WorkspaceSummary } from '../types/entropy';

export type ActiveNav = 'home' | 'cleanup' | 'details' | 'settings';

interface SidebarProps {
  activeNav: ActiveNav;
  onSelectNav: (nav: ActiveNav) => void;
  onRefresh: () => void;
  isLoading: boolean;
  lastScanTime: number | null;
  onOpenCommandPalette: () => void;
  currentWorkspace?: WorkspaceSummary | null;
  totalWorkspacesCount?: number;
  onSelectWorkspace?: (path: string) => void;
  onBackToOverview?: () => void;
  onViewAllWorkspaces?: () => void;
}

const formatTimeAgo = (ts: number) => {
  const tsMs = ts < 1e11 ? ts * 1000 : ts;
  const seconds = Math.floor((Date.now() - tsMs) / 1000);
  if (seconds < 30) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
};

const nav: { id: ActiveNav; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Workspaces', icon: Home },
  { id: 'cleanup', label: 'System Cleanup', icon: Trash2 },
  { id: 'details', label: 'System Details', icon: Monitor },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeNav,
  onSelectNav,
  onRefresh,
  isLoading,
  lastScanTime,
  onOpenCommandPalette,
  currentWorkspace,
  totalWorkspacesCount,
  onSelectWorkspace: _onSelectWorkspace,
  onBackToOverview,
  onViewAllWorkspaces,
}) => (
  <aside className="w-14 lg:w-60 bg-[var(--color-surface-1)] border-r border-[var(--color-border-subtle)] flex flex-col h-screen shrink-0 select-none transition-[width] duration-150">
    <div className="h-14 px-3 lg:px-4 flex items-center justify-center lg:justify-start border-b border-[var(--color-border-subtle)] gap-2.5">
      <EntropyLogo size={26} className="drop-shadow-[0_0_12px_rgba(56,189,248,0.4)] transition-transform hover:scale-105 shrink-0" />
      <span className="hidden lg:inline text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">Entropy</span>
      <span className="hidden lg:inline ml-auto text-[10px] font-mono text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)]">v0.1</span>
    </div>

    <div className="px-2 lg:px-3 pt-3">
      <button
        type="button"
        onClick={onOpenCommandPalette}
        aria-label="Search workspaces (Ctrl+K)"
        title="Search workspaces (Ctrl+K)"
        className="w-full h-8 px-2 lg:px-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-0)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] transition-colors flex items-center justify-center lg:justify-start gap-2 text-left cursor-pointer"
      >
        <Search className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden lg:inline text-xs truncate">Search workspaces</span>
        <kbd className="hidden lg:inline ml-auto text-[10px] font-mono text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)]">Ctrl+K</kbd>
      </button>
    </div>

    {/* Current Active Workspace Indicator */}
    <div className="hidden lg:block px-3 pt-2.5">
      {currentWorkspace ? (
        <div className="p-2.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] shadow-xs transition-colors">
          <div className="flex items-center justify-between text-[10px] uppercase font-semibold text-[var(--color-text-tertiary)]">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${currentWorkspace.has_uncommitted_changes ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-success)] shadow-[0_0_6px_rgba(52,211,153,.6)]'}`} />
              Inspecting
            </span>
            {(onViewAllWorkspaces || onBackToOverview) && (
              <button
                type="button"
                onClick={onViewAllWorkspaces || onBackToOverview}
                className="text-[10px] text-[var(--color-accent)] hover:text-[var(--color-accent-strong)] hover:underline cursor-pointer lowercase font-medium transition-colors"
                title="Return to workspaces overview"
                aria-label="Back to workspaces overview"
              >
                close
              </button>
            )}
          </div>
          <div
            className="w-full text-left font-semibold text-xs text-[var(--color-text-primary)] truncate mt-1 block"
            title={currentWorkspace.name}
          >
            {currentWorkspace.name}
          </div>
          <div className="font-mono text-[10px] text-[var(--color-text-tertiary)] truncate mt-0.5" title={currentWorkspace.path}>
            {currentWorkspace.path}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            onViewAllWorkspaces?.();
            onSelectNav('home');
          }}
          className={`w-full p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between cursor-pointer ${
            activeNav === 'home'
              ? 'bg-[var(--color-surface-2)] border-[var(--color-border)] text-[var(--color-text-primary)] shadow-xs'
              : 'bg-[var(--color-surface-2)]/60 border-[var(--color-border-subtle)] hover:border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]'
          }`}
          title="All workspaces overview"
          aria-label="All workspaces overview"
        >
          <span className="uppercase font-semibold tracking-wider flex items-center gap-1.5 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
            All Workspaces
          </span>
          {typeof totalWorkspacesCount === 'number' && (
            <span className="font-mono text-[10px] text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)]">
              {totalWorkspacesCount}
            </span>
          )}
        </button>
      )}
    </div>

    <nav aria-label="Main Navigation" className="px-2 lg:px-3 pt-3 lg:pt-4 space-y-1">
      <p className="hidden lg:block px-2 pb-1 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)] font-semibold">Workspace</p>
      {nav.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelectNav(id)}
          aria-current={activeNav === id ? 'page' : undefined}
          title={label}
          className={`w-full h-9 px-2 lg:px-2.5 rounded-md flex items-center justify-center lg:justify-start gap-2.5 text-sm transition-colors cursor-pointer ${activeNav === id ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'}`}
        >
          <Icon className="w-4 h-4 shrink-0" strokeWidth={1.8} />
          <span className="hidden lg:inline truncate">{label}</span>
        </button>
      ))}
    </nav>
    <div className="mt-auto p-2 lg:p-3 border-t border-[var(--color-border-subtle)]">
      <button
        type="button"
        onClick={() => onSelectNav('settings')}
        aria-current={activeNav === 'settings' ? 'page' : undefined}
        title="Settings"
        className={`w-full h-9 px-2 lg:px-2.5 rounded-md flex items-center justify-center lg:justify-start gap-2.5 text-sm transition-colors cursor-pointer ${activeNav === 'settings' ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'}`}
      >
        <Settings className="w-4 h-4 shrink-0" strokeWidth={1.8} />
        <span className="hidden lg:inline truncate">Settings</span>
      </button>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isLoading}
        aria-label="Refresh workspace scan"
        title={lastScanTime ? `Updated ${formatTimeAgo(lastScanTime)}` : 'Update workspace list'}
        className="mt-2 px-1 lg:px-2.5 w-full flex items-center justify-center lg:justify-start gap-2 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] disabled:opacity-50 cursor-pointer"
      >
        <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
        <span className="hidden lg:inline truncate">{lastScanTime ? `Updated ${formatTimeAgo(lastScanTime)}` : 'Update list'}</span>
      </button>
    </div>
  </aside>
);

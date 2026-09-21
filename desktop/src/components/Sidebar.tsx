import React from 'react';
import { Search, Home, Trash2, Monitor, Settings, RefreshCw } from 'lucide-react';

export type ActiveNav = 'home' | 'cleanup' | 'details' | 'settings';

interface SidebarProps {
  activeNav: ActiveNav;
  onSelectNav: (nav: ActiveNav) => void;
  onOpenCommandPalette: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  lastScanTime?: number | null;
}

const NavItem: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}> = ({ active, onClick, icon, label, badge }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-150 text-[13px] cursor-pointer ${
      active
        ? 'bg-[var(--color-accent)]/12 text-[var(--color-accent-strong)] font-semibold shadow-sm'
        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]'
    }`}
  >
    <div className="flex items-center gap-3">
      <span className={active ? 'text-[var(--color-accent-strong)]' : 'text-[var(--color-text-tertiary)]'}>
        {icon}
      </span>
      <span>{label}</span>
    </div>
    {badge}
  </button>
);

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeNav,
  onSelectNav,
  onOpenCommandPalette,
  onRefresh,
  isLoading,
  lastScanTime,
}) => {
  return (
    <aside className="w-56 bg-[var(--color-surface-1)] border-r border-[var(--color-border)] flex flex-col justify-between select-none h-screen shrink-0">
      {/* Brand Header */}
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-indigo-400 flex items-center justify-center text-white text-xs font-bold shadow-md">
            E
          </div>
          <div>
            <span className="font-semibold text-[var(--color-text-primary)] text-sm tracking-tight">Entropy</span>
            <span className="ml-1.5 text-[10px] font-mono text-[var(--color-text-tertiary)]">v0.1</span>
          </div>
        </div>

        {/* Quick Search */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="w-full bg-[var(--color-surface-2)]/60 hover:bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] border border-[var(--color-border-subtle)] rounded-lg px-3 py-2 flex items-center justify-between transition-colors text-left text-xs cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search…</span>
          </div>
          <kbd className="text-[10px] font-mono text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-1.5 py-0.5 rounded">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
        <NavItem
          active={activeNav === 'home'}
          onClick={() => onSelectNav('home')}
          icon={<Home className="w-4 h-4" />}
          label="Home"
        />
        <NavItem
          active={activeNav === 'cleanup'}
          onClick={() => onSelectNav('cleanup')}
          icon={<Trash2 className="w-4 h-4" />}
          label="Cleanup"
        />
        <NavItem
          active={activeNav === 'details'}
          onClick={() => onSelectNav('details')}
          icon={<Monitor className="w-4 h-4" />}
          label="System Details"
        />
        <NavItem
          active={activeNav === 'settings'}
          onClick={() => onSelectNav('settings')}
          icon={<Settings className="w-4 h-4" />}
          label="Settings"
        />
      </div>

      {/* Footer — Last scan time + refresh */}
      <div className="p-3 border-t border-[var(--color-border-subtle)]">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="w-full flex items-center justify-between text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer disabled:opacity-50"
        >
          <span>
            {lastScanTime ? `Scanned ${formatTimeAgo(lastScanTime)}` : 'Ready to scan'}
          </span>
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </aside>
  );
};

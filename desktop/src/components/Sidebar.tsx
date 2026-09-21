import React from 'react';
import { Search, Home, Trash2, Monitor, Settings, RefreshCw, Command } from 'lucide-react';

export type ActiveNav = 'home' | 'cleanup' | 'details' | 'settings';

interface SidebarProps {
  activeNav: ActiveNav;
  onSelectNav: (nav: ActiveNav) => void;
  onOpenCommandPalette: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  lastScanTime?: number | null;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const nav = [
  { id: 'home' as const, label: 'Workspaces', icon: Home },
  { id: 'cleanup' as const, label: 'Cleanup', icon: Trash2 },
  { id: 'details' as const, label: 'Processes', icon: Monitor },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeNav, onSelectNav, onOpenCommandPalette, onRefresh, isLoading, lastScanTime }) => (
  <aside className="w-60 bg-[var(--color-surface-1)] border-r border-[var(--color-border-subtle)] flex flex-col h-screen shrink-0 select-none">
    <div className="h-14 px-4 flex items-center border-b border-[var(--color-border-subtle)]">
      <div className="w-6 h-6 rounded-md bg-[var(--color-accent)] text-white text-xs font-bold flex items-center justify-center shadow-[0_0_18px_rgba(59,130,246,.25)]">E</div>
      <span className="ml-2.5 text-sm font-semibold">Entropy</span>
      <span className="ml-auto text-[10px] font-mono text-[var(--color-text-tertiary)]">LOCAL</span>
    </div>
    <div className="px-3 pt-4">
      <button type="button" onClick={onOpenCommandPalette} className="w-full h-9 px-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-0)] hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)] transition-colors flex items-center gap-2 text-left">
        <Search className="w-4 h-4" /><span className="text-xs">Search workspaces</span><kbd className="ml-auto text-[10px] font-mono text-[var(--color-text-tertiary)]"><Command className="inline w-3 h-3" />K</kbd>
      </button>
    </div>
    <nav className="px-3 pt-5 space-y-1">
      <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.08em] text-[var(--color-text-tertiary)] font-semibold">Workspace</p>
      {nav.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" onClick={() => onSelectNav(id)} className={`w-full h-9 px-2.5 rounded-md flex items-center gap-2.5 text-sm transition-colors ${activeNav === id ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'}`}>
          <Icon className="w-4 h-4" strokeWidth={1.8} />{label}
        </button>
      ))}
    </nav>
    <div className="mt-auto p-3 border-t border-[var(--color-border-subtle)]">
      <button type="button" onClick={() => onSelectNav('settings')} className={`w-full h-9 px-2.5 rounded-md flex items-center gap-2.5 text-sm transition-colors ${activeNav === 'settings' ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)]' : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]'}`}><Settings className="w-4 h-4" strokeWidth={1.8} />Settings</button>
      <button type="button" onClick={onRefresh} disabled={isLoading} className="mt-2 px-2.5 w-full flex items-center gap-2 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />{lastScanTime ? `Updated ${formatTimeAgo(lastScanTime)}` : 'Update workspace list'}</button>
    </div>
  </aside>
);

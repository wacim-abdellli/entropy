import React, { useEffect, useState, useRef } from 'react';
import {
  Search,
  FolderGit2,
  Home,
  Trash2,
  Monitor,
  Settings,
  AlertTriangle,
} from 'lucide-react';
import { EnvironmentOverview } from '../types/entropy';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  overview: EnvironmentOverview | null;
  onSelectWorkspace: (path: string) => void;
  onNavigate: (view: string) => void;
}

interface PaletteItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'Workspace' | 'Navigation' | 'Finding';
  icon: React.ReactNode;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  overview,
  onSelectWorkspace,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build items list
  const items: PaletteItem[] = [];

  // Navigation items — matching new sidebar
  items.push(
    {
      id: 'nav-home',
      title: 'Home',
      subtitle: 'Overview and workspace list',
      category: 'Navigation',
      icon: <Home className="w-4 h-4 text-[var(--color-text-tertiary)]" />,
      action: () => { onNavigate('home'); onClose(); },
    },
    {
      id: 'nav-cleanup',
      title: 'Cleanup',
      subtitle: 'Reclaim disk space from old dependencies',
      category: 'Navigation',
      icon: <Trash2 className="w-4 h-4 text-[var(--color-text-tertiary)]" />,
      action: () => { onNavigate('cleanup'); onClose(); },
    },
    {
      id: 'nav-details',
      title: 'System Details',
      subtitle: 'Processes, runtimes, and caches',
      category: 'Navigation',
      icon: <Monitor className="w-4 h-4 text-[var(--color-text-tertiary)]" />,
      action: () => { onNavigate('details'); onClose(); },
    },
    {
      id: 'nav-settings',
      title: 'Settings',
      subtitle: 'Configure scan directories and preferences',
      category: 'Navigation',
      icon: <Settings className="w-4 h-4 text-[var(--color-text-tertiary)]" />,
      action: () => { onNavigate('settings'); onClose(); },
    },
  );

  // Workspaces
  if (overview) {
    overview.workspaces.forEach((w) => {
      items.push({
        id: `ws-${w.id}`,
        title: w.name,
        subtitle: w.path,
        category: 'Workspace',
        icon: <FolderGit2 className="w-4 h-4 text-[var(--color-text-tertiary)]" />,
        action: () => { onSelectWorkspace(w.path); onClose(); },
      });
    });

    // Findings
    overview.findings.forEach((f) => {
      items.push({
        id: `find-${f.id}`,
        title: f.title,
        subtitle: f.recommendation,
        category: 'Finding',
        icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
        action: () => { onNavigate('home'); onClose(); },
      });
    });
  }

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(filteredItems.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(filteredItems.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-24 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[480px]"
      >
        {/* Input */}
        <div className="p-3.5 border-b border-[var(--color-border-subtle)] flex items-center space-x-2.5">
          <Search className="w-4 h-4 text-[var(--color-text-tertiary)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search workspaces, pages…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
          />
          <kbd className="text-xs font-mono text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {filteredItems.map((item, idx) => (
            <div
              key={item.id}
              onClick={item.action}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                selectedIndex === idx
                  ? 'bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-3)]'
              }`}
            >
              <div className="flex items-center space-x-3 truncate">
                <div className="shrink-0">{item.icon}</div>
                <div className="truncate">
                  <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {item.title}
                  </div>
                  <div className="text-xs text-[var(--color-text-tertiary)] truncate">
                    {item.subtitle}
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-medium text-[var(--color-text-tertiary)] bg-[var(--color-surface-3)] px-2 py-0.5 rounded-md ml-3 shrink-0">
                {item.category}
              </span>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--color-text-tertiary)]">
              No results found.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2.5 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-1)] flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
          <div className="flex items-center space-x-2 font-mono">
            <span>&uarr;&darr; Navigate</span>
            <span>&bull;</span>
            <span>&crarr; Select</span>
          </div>
          <span>Entropy</span>
        </div>
      </div>
    </div>
  );
};

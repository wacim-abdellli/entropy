import React, { useEffect, useState, useRef } from 'react';
import {
  Search,
  FolderGit2,
  AlertTriangle,
  Activity,
  Cpu,
  Layers,
  X,
  Command,
} from 'lucide-react';
import { EnvironmentOverview } from '../types/entropy';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  overview: EnvironmentOverview | null;
  onSelectWorkspace: (path: string) => void;
  onNavigate: (view: any) => void;
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

  // 1. Navigation items
  items.push(
    {
      id: 'nav-overview',
      title: 'Overview',
      subtitle: 'Environment overview and top metrics',
      category: 'Navigation',
      icon: <Layers className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onNavigate('overview');
        onClose();
      },
    },
    {
      id: 'nav-findings',
      title: 'Attention & Risks',
      subtitle: 'Digital entropy findings across all workspaces',
      category: 'Navigation',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
      action: () => {
        onNavigate('findings');
        onClose();
      },
    },
    {
      id: 'nav-processes',
      title: 'Active Processes',
      subtitle: 'Developer processes and interactive shells',
      category: 'Navigation',
      icon: <Activity className="w-4 h-4 text-sky-400" />,
      action: () => {
        onNavigate('processes');
        onClose();
      },
    },
    {
      id: 'nav-runtimes',
      title: 'Runtimes & SDKs',
      subtitle: 'Installed language runtimes and toolchains',
      category: 'Navigation',
      icon: <Cpu className="w-4 h-4 text-purple-400" />,
      action: () => {
        onNavigate('runtimes');
        onClose();
      },
    }
  );

  // 2. Workspaces
  if (overview) {
    overview.workspaces.forEach((w) => {
      items.push({
        id: `ws-${w.id}`,
        title: w.name,
        subtitle: `${w.path} • ${w.state_label}`,
        category: 'Workspace',
        icon: <FolderGit2 className="w-4 h-4 text-emerald-400" />,
        action: () => {
          onSelectWorkspace(w.path);
          onClose();
        },
      });
    });

    // 3. Findings
    overview.findings.forEach((f) => {
      items.push({
        id: `find-${f.id}`,
        title: f.title,
        subtitle: f.explanation,
        category: 'Finding',
        icon: <AlertTriangle className="w-4 h-4 text-amber-400" />,
        action: () => {
          onNavigate('findings');
          onClose();
        },
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
      className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-start justify-center pt-24 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#0f131d] border border-[#23293a] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[480px] text-xs"
      >
        {/* Input */}
        <div className="p-3 border-b border-[#1e2330] flex items-center space-x-2.5">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search workspaces, substrates, findings..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 focus:outline-none text-sm"
          />
          <kbd className="bg-zinc-800 text-zinc-400 border border-zinc-700/60 rounded px-1.5 py-0.5 text-[10px] font-mono">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.map((item, idx) => (
            <div
              key={item.id}
              onClick={item.action}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                selectedIndex === idx
                  ? 'bg-emerald-500/10 text-zinc-100 border border-emerald-500/30'
                  : 'text-zinc-400 hover:bg-[#141824]'
              }`}
            >
              <div className="flex items-center space-x-3 truncate">
                <div className="shrink-0">{item.icon}</div>
                <div className="truncate">
                  <div className="font-medium text-zinc-200 truncate">
                    {item.title}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">
                    {item.subtitle}
                  </div>
                </div>
              </div>

              <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 shrink-0 ml-2">
                {item.category}
              </span>
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="p-8 text-center text-zinc-500 text-xs">
              No matching workspaces or findings found.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2.5 border-t border-[#1e2330] bg-[#0a0d14] flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex items-center space-x-2 font-mono">
            <span>&uarr;&darr; Navigate</span>
            <span>&bull;</span>
            <span>&crarr; Select</span>
          </div>
          <span>Entropy Local Intelligence</span>
        </div>
      </div>
    </div>
  );
};

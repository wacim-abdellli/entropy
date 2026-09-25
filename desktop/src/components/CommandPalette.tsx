import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Search,
  FolderGit2,
  Home,
  Trash2,
  Monitor,
  Settings,
  AlertTriangle,
  Globe,
  Terminal,
  SquareTerminal,
  FolderOpen,
  Code2,
  Zap,
  RefreshCw,
  Bot,
  Cpu,
  X,
  Boxes,
} from 'lucide-react';
import { EnvironmentOverview } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  overview: EnvironmentOverview | null;
  onSelectWorkspace: (path: string) => void;
  onNavigate: (view: string) => void;
  onRefresh?: () => void;
  onInspectFolder?: () => void;
  onShowToast?: (message: string) => void;
}

type PaletteCategory = 'All' | 'Actions' | 'Ports' | 'Workspaces' | 'Processes' | 'Navigation';

interface PaletteItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'Action' | 'Port' | 'Workspace' | 'Process' | 'Navigation' | 'Finding';
  icon: React.ReactNode;
  badge?: string;
  actionHint?: string;
  action: () => void | Promise<void>;
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  overview,
  onSelectWorkspace,
  onNavigate,
  onRefresh,
  onInspectFolder,
  onShowToast,
}) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<PaletteCategory>('All');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const prevActiveElementRef = useRef<HTMLElement | null>(null);

  // Synchronously adjust state during render when opened/closed to prevent cascading effect updates
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setQuery('');
      setActiveCategory('All');
      setSelectedIndex(0);
    }
  }

  // Focus input on open, and restore previous active element on close
  useEffect(() => {
    if (isOpen) {
      prevActiveElementRef.current = document.activeElement as HTMLElement;
      const timer = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(timer);
    } else {
      prevActiveElementRef.current?.focus();
    }
  }, [isOpen]);

  // Focus trap for Tab key and Escape dismissal
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, onClose]);

  // Build items list
  const allItems = useMemo(() => {
    const items: PaletteItem[] = [];

    // ── 1. Global Quick Action Commands ──
    if (onInspectFolder) {
      items.push({
        id: 'cmd-inspect-folder',
        title: 'Inspect Workspace Folder…',
        subtitle: 'Open native Windows folder browser to analyze a project',
        category: 'Action',
        icon: <FolderOpen className="w-4 h-4 text-[var(--color-accent)]" />,
        actionHint: 'Browse…',
        action: () => {
          onClose();
          onInspectFolder();
        },
      });
    }

    // Clean Slate RAM Buster
    items.push({
      id: 'cmd-clean-slate',
      title: 'Clean Slate — Terminate Idle Dev Processes',
      subtitle: 'Free memory by stopping orphaned node, python, or rust background servers',
      category: 'Action',
      icon: <Zap className="w-4 h-4 text-[var(--color-success)]" />,
      actionHint: 'Free RAM',
      action: async () => {
        onClose();
        try {
          const res = await EntropyApiClient.cleanSlateDevProcesses();
          if (res.success) {
            onShowToast?.(`Clean Slate: Terminated ${res.terminated_count} processes (${formatSize(res.freed_memory_bytes)} RAM freed).`);
            onRefresh?.();
          } else {
            onShowToast?.(res.errors?.[0]?.error || 'Failed to terminate processes.');
          }
        } catch {
          onShowToast?.('Failed to run Clean Slate.');
        }
      },
    });

    if (onRefresh) {
      items.push({
        id: 'cmd-refresh',
        title: 'Refresh Environment Scan',
        subtitle: 'Rescan configured workspace directories and system processes',
        category: 'Action',
        icon: <RefreshCw className="w-4 h-4 text-[var(--color-text-secondary)]" />,
        actionHint: 'Rescan',
        action: () => {
          onClose();
          onRefresh();
          onShowToast?.('Scanning developer workspaces…');
        },
      });
    }

    items.push({
      id: 'cmd-purge-caches',
      title: 'Purge Global Package Caches',
      subtitle: 'Reclaim gigabytes from npm, pip, yarn, cargo, or gradle cache folders',
      category: 'Action',
      icon: <Trash2 className="w-4 h-4 text-[var(--color-warning)]" />,
      actionHint: 'Cleanup',
      action: () => {
        onNavigate('cleanup');
        onClose();
      },
    });

    items.push({
      id: 'cmd-prune-docker',
      title: 'Prune Docker Storage',
      subtitle: 'Clean dangling images, buildkit cache, and stopped containers',
      category: 'Action',
      icon: <Boxes className="w-4 h-4 text-[var(--color-accent-strong)]" />,
      actionHint: 'Docker',
      action: () => {
        onNavigate('cleanup');
        onClose();
      },
    });

    items.push({
      id: 'cmd-ai-advisor',
      title: 'AI Advisor Configuration',
      subtitle: 'Configure Groq Cloud, local Ollama, or deterministic rules engine',
      category: 'Action',
      icon: <Bot className="w-4 h-4 text-[var(--color-accent)]" />,
      actionHint: 'Settings',
      action: () => {
        onNavigate('settings');
        onClose();
      },
    });

    // ── 2. Active Localhost Ports ──
    if (overview) {
      const portMap = new Map<number, string>();
      overview.workspaces.forEach((w) => {
        if (w.ports) {
          w.ports.forEach((p) => portMap.set(p, w.name));
        }
      });
      overview.system.processes.forEach((pr) => {
        if (pr.ports) {
          pr.ports.forEach((p) => {
            if (!portMap.has(p)) portMap.set(p, pr.name);
          });
        }
      });

      Array.from(portMap.entries()).forEach(([port, owner]) => {
        items.push({
          id: `port-${port}`,
          title: `http://localhost:${port}`,
          subtitle: `Open ${owner} dev server in your default browser`,
          category: 'Port',
          icon: <Globe className="w-4 h-4 text-[var(--color-success)]" />,
          badge: `:${port}`,
          actionHint: 'Open Browser ↗',
          action: () => {
            EntropyApiClient.openUrl(`http://localhost:${port}`);
            onClose();
          },
        });
      });
    }

    // ── 3. Workspaces & Launchers ──
    if (overview) {
      overview.workspaces.forEach((w) => {
        // Main workspace entry
        items.push({
          id: `ws-${w.id}`,
          title: w.name,
          subtitle: `${w.path} · ${w.git_branch || 'no git'} · ${w.has_uncommitted_changes ? 'Uncommitted work' : 'Clean'}`,
          category: 'Workspace',
          icon: <FolderGit2 className="w-4 h-4 text-[var(--color-accent)]" />,
          badge: w.project_type,
          actionHint: 'Inspect',
          action: () => {
            onSelectWorkspace(w.path);
            onClose();
          },
        });

        // Quick terminal launcher for this workspace
        items.push({
          id: `ws-term-${w.id}`,
          title: `Terminal in ${w.name}`,
          subtitle: `Launch Terminal at ${w.path}`,
          category: 'Workspace',
          icon: <Terminal className="w-4 h-4 text-[var(--color-accent-strong)]" />,
          actionHint: 'Terminal',
          action: () => {
            EntropyApiClient.openInTerminal(w.path);
            onClose();
          },
        });

        // Quick CMD launcher
        items.push({
          id: `ws-cmd-${w.id}`,
          title: `CMD in ${w.name}`,
          subtitle: `Launch Command Prompt at ${w.path}`,
          category: 'Workspace',
          icon: <SquareTerminal className="w-4 h-4 text-[var(--color-warning)]" />,
          actionHint: 'CMD',
          action: () => {
            EntropyApiClient.openInCmd(w.path);
            onClose();
          },
        });

        // Quick File Explorer
        items.push({
          id: `ws-exp-${w.id}`,
          title: `Reveal ${w.name} in File Explorer`,
          subtitle: w.path,
          category: 'Workspace',
          icon: <FolderOpen className="w-4 h-4 text-[var(--color-text-secondary)]" />,
          actionHint: 'Explorer',
          action: () => {
            EntropyApiClient.openInExplorer(w.path);
            onClose();
          },
        });

        // Quick IDE Launchers
        items.push({
          id: `ws-code-${w.id}`,
          title: `Open ${w.name} in VS Code`,
          subtitle: `code "${w.path}"`,
          category: 'Workspace',
          icon: <Code2 className="w-4 h-4 text-[var(--color-accent-strong)]" />,
          actionHint: 'VS Code',
          action: () => {
            EntropyApiClient.launchIde(w.path, 'vscode');
            onClose();
          },
        });

        items.push({
          id: `ws-cursor-${w.id}`,
          title: `Open ${w.name} in Cursor`,
          subtitle: `cursor "${w.path}"`,
          category: 'Workspace',
          icon: <Code2 className="w-4 h-4 text-[var(--color-accent)]" />,
          actionHint: 'Cursor',
          action: () => {
            EntropyApiClient.launchIde(w.path, 'cursor');
            onClose();
          },
        });
      });
    }

    // ── 4. Active Dev Processes ──
    if (overview && overview.system?.processes) {
      overview.system.processes.slice(0, 20).forEach((p) => {
        items.push({
          id: `proc-${p.pid}`,
          title: `${p.name} (PID ${p.pid})`,
          subtitle: `${p.ports && p.ports.length ? 'Port :' + p.ports.join(', :') + ' · ' : ''}RAM: ${formatSize(p.memory_bytes)}${p.cwd ? ' · ' + p.cwd : ''}`,
          category: 'Process',
          icon: <Cpu className="w-4 h-4 text-[var(--color-warning)]" />,
          badge: `PID ${p.pid}`,
          actionHint: 'Terminate',
          action: async () => {
            onClose();
            try {
              const res = await EntropyApiClient.terminateProcess(p.pid, true);
              if (res.success) {
                onShowToast?.(`Terminated ${p.name} (PID ${p.pid}).`);
                onRefresh?.();
              } else {
                onShowToast?.(res.error || `Could not terminate process ${p.pid}.`);
              }
            } catch {
              onShowToast?.(`Failed to terminate PID ${p.pid}.`);
            }
          },
        });
      });
    }

    // ── 5. Navigation ──
    items.push(
      {
        id: 'nav-home',
        title: 'Go to Workspaces Overview',
        subtitle: 'Main dashboard, recent projects, and secret watchdog',
        category: 'Navigation',
        icon: <Home className="w-4 h-4 text-[var(--color-text-secondary)]" />,
        actionHint: 'Navigate',
        action: () => { onNavigate('home'); onClose(); },
      },
      {
        id: 'nav-cleanup',
        title: 'Go to Reclaimable Space & Cleanup',
        subtitle: 'Purge node_modules, build artifacts, package caches, and Docker',
        category: 'Navigation',
        icon: <Trash2 className="w-4 h-4 text-[var(--color-text-secondary)]" />,
        actionHint: 'Navigate',
        action: () => { onNavigate('cleanup'); onClose(); },
      },
      {
        id: 'nav-details',
        title: 'Go to System & Process Details',
        subtitle: 'Manage background processes, runtimes, containers, and ports',
        category: 'Navigation',
        icon: <Monitor className="w-4 h-4 text-[var(--color-text-secondary)]" />,
        actionHint: 'Navigate',
        action: () => { onNavigate('details'); onClose(); },
      },
      {
        id: 'nav-settings',
        title: 'Go to Settings & AI Advisor',
        subtitle: 'Configure scan roots, LLM providers (Groq/Ollama), and preferences',
        category: 'Navigation',
        icon: <Settings className="w-4 h-4 text-[var(--color-text-secondary)]" />,
        actionHint: 'Navigate',
        action: () => { onNavigate('settings'); onClose(); },
      },
    );

    // ── 6. Findings ──
    if (overview) {
      overview.findings.forEach((f) => {
        items.push({
          id: `find-${f.id}`,
          title: f.title,
          subtitle: f.recommendation,
          category: 'Finding',
          icon: <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />,
          actionHint: 'View',
          action: () => { onNavigate('home'); onClose(); },
        });
      });
    }

    return items;
  }, [overview, onSelectWorkspace, onNavigate, onRefresh, onInspectFolder, onShowToast, onClose]);

  // Filtering
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allItems.filter((item) => {
      // Category filter
      if (activeCategory === 'Actions' && item.category !== 'Action') return false;
      if (activeCategory === 'Ports' && item.category !== 'Port') return false;
      if (activeCategory === 'Workspaces' && item.category !== 'Workspace') return false;
      if (activeCategory === 'Processes' && item.category !== 'Process') return false;
      if (activeCategory === 'Navigation' && item.category !== 'Navigation' && item.category !== 'Finding') return false;

      // Query filter
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.badge && item.badge.toLowerCase().includes(q))
      );
    });
  }, [allItems, query, activeCategory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => {
        const next = (prev + 1) % Math.max(filteredItems.length, 1);
        scrollIntoView(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => {
        const next = (prev - 1 + filteredItems.length) % Math.max(filteredItems.length, 1);
        scrollIntoView(next);
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    }
  };

  const scrollIntoView = (index: number) => {
    if (!listRef.current) return;
    const itemEl = listRef.current.children[index] as HTMLElement;
    if (itemEl) {
      itemEl.scrollIntoView({ block: 'nearest' });
    }
  };

  if (!isOpen) return null;

  const categoryPills: { label: PaletteCategory; count: number }[] = [
    { label: 'All', count: allItems.length },
    { label: 'Actions', count: allItems.filter((i) => i.category === 'Action').length },
    { label: 'Ports', count: allItems.filter((i) => i.category === 'Port').length },
    { label: 'Workspaces', count: allItems.filter((i) => i.category === 'Workspace').length },
    { label: 'Processes', count: allItems.filter((i) => i.category === 'Process').length },
    { label: 'Navigation', count: allItems.filter((i) => i.category === 'Navigation' || i.category === 'Finding').length },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-start justify-center pt-20 px-4 select-none animate-in fade-in duration-100"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[580px] animate-in zoom-in-95 duration-100"
      >
        {/* Input Bar */}
        <div className="p-3.5 border-b border-[var(--color-border-subtle)] flex items-center gap-3 bg-[var(--color-surface-1)]">
          <Search className="w-4 h-4 text-[var(--color-accent)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command, workspace, port (:3000), or action…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search query"
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="text-[11px] font-mono text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        {/* Category Filter Pills */}
        <div className="px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-0)] flex items-center gap-1.5 overflow-x-auto">
          {categoryPills.map(({ label, count }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setActiveCategory(label);
                setSelectedIndex(0);
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeCategory === label
                  ? 'bg-[var(--color-accent)] text-white shadow-xs'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]'
              }`}
            >
              <span>{label}</span>
              <span className={`text-[10px] px-1 rounded ${activeCategory === label ? 'bg-white/20 text-white' : 'bg-[var(--color-surface-2)] text-[var(--color-text-tertiary)]'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredItems.map((item, idx) => {
            const isSelected = selectedIndex === idx;

            const categoryStyle =
              item.category === 'Action'
                ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent-strong)] border-[var(--color-accent)]/30'
                : item.category === 'Port'
                ? 'bg-[var(--color-success-bg)] text-[var(--color-success)] border-[var(--color-success-border)]'
                : item.category === 'Workspace'
                ? 'bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)]'
                : item.category === 'Process'
                ? 'bg-[var(--color-warning-bg)] text-[var(--color-warning)] border-[var(--color-warning-border)]'
                : 'bg-[var(--color-surface-3)] text-[var(--color-text-secondary)] border-[var(--color-border-subtle)]';

            return (
              <div
                key={item.id}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`p-2.5 rounded-lg flex items-center justify-between cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[var(--color-surface-2)] border border-[var(--color-accent)]/50 text-[var(--color-text-primary)] shadow-xs'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 pr-3">
                  <div className="shrink-0 p-1.5 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)]">
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate">
                        {item.title}
                      </span>
                      {item.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--color-surface-3)] text-[var(--color-text-tertiary)] border border-[var(--color-border-subtle)] shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-tertiary)] truncate mt-0.5">
                      {item.subtitle}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${categoryStyle}`}>
                    {item.category}
                  </span>

                  {isSelected && item.actionHint && (
                    <span className="text-[11px] font-mono font-medium text-[var(--color-accent-strong)] flex items-center gap-1 bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 px-2 py-0.5 rounded">
                      <span>{item.actionHint}</span>
                      <span>↵</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="p-10 text-center space-y-2">
              <Search size={24} className="mx-auto text-[var(--color-text-tertiary)] opacity-60" />
              <div className="text-xs font-medium text-[var(--color-text-secondary)]">No matching results found</div>
              <div className="text-[11px] text-[var(--color-text-tertiary)]">
                Try searching for a port number, workspace name, or dev process.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-0)] flex items-center justify-between text-xs text-[var(--color-text-tertiary)]">
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border)]">↑↓</kbd>
              <span>Navigate</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border)]">↵</kbd>
              <span>Select</span>
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--color-surface-2)] border border-[var(--color-border)]">ESC</kbd>
              <span>Close</span>
            </span>
          </div>
          <span className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Entropy Developer Command Center</span>
        </div>
      </div>
    </div>
  );
};

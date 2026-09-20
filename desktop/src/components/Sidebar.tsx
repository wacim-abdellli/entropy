import React from 'react';
import {
  Layers,
  FolderGit2,
  AlertTriangle,
  Activity,
  Cpu,
  Boxes,
  Database,
  Search,
  FolderSearch,
  ShieldCheck,
  Command,
} from 'lucide-react';
import { EnvironmentSummary, StateCategory } from '../types/entropy';

export type ActiveNav =
  | 'overview'
  | 'workspaces'
  | 'findings'
  | 'processes'
  | 'runtimes'
  | 'containers'
  | 'caches';

interface SidebarProps {
  activeNav: ActiveNav;
  onSelectNav: (nav: ActiveNav) => void;
  summary: EnvironmentSummary | null;
  selectedFilter: StateCategory | 'all';
  onSelectFilter: (filter: StateCategory | 'all') => void;
  onInspectFolder: () => void;
  onOpenCommandPalette: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeNav,
  onSelectNav,
  summary,
  selectedFilter,
  onSelectFilter,
  onInspectFolder,
  onOpenCommandPalette,
}) => {
  return (
    <aside className="w-64 bg-[#0d1017] border-r border-[#1e2330] flex flex-col justify-between select-none h-screen text-xs shrink-0">
      {/* Top Header */}
      <div className="p-4 border-b border-[#1e2330]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div>
              <div className="font-mono font-bold tracking-wider text-zinc-100 text-sm flex items-center space-x-1.5">
                <span>ENTROPY</span>
                <span className="text-[10px] px-1 py-0.2 bg-zinc-800 text-zinc-400 rounded font-normal">v0.1.0</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1 text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-1.5 py-0.5 rounded">
            <span>local</span>
          </div>
        </div>

        {/* Quick Switcher Button */}
        <button
          onClick={onOpenCommandPalette}
          className="mt-3 w-full bg-[#141824] hover:bg-[#1a2030] text-zinc-400 hover:text-zinc-200 border border-[#23293a] rounded px-2.5 py-1.5 flex items-center justify-between transition-colors text-left"
        >
          <div className="flex items-center space-x-2">
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-400">Search or jump to...</span>
          </div>
          <kbd className="bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 rounded px-1 text-[10px] font-mono flex items-center space-x-0.5">
            <Command className="w-2.5 h-2.5 mr-0.5" /> K
          </kbd>
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {/* Core Views */}
        <div>
          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Intelligence
          </div>
          <nav className="space-y-0.5">
            <button
              onClick={() => onSelectNav('overview')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                activeNav === 'overview'
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141824]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4" />
                <span>Overview</span>
              </div>
              {summary && (
                <span className="text-[10px] font-mono bg-zinc-800/60 text-zinc-400 px-1.5 py-0.2 rounded">
                  {summary.total_workspaces}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                onSelectNav('workspaces');
                onSelectFilter('all');
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                activeNav === 'workspaces' && selectedFilter === 'all'
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141824]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FolderGit2 className="w-4 h-4" />
                <span>All Workspaces</span>
              </div>
            </button>

            <button
              onClick={() => onSelectNav('findings')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                activeNav === 'findings'
                  ? 'bg-amber-500/10 text-amber-400 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141824]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4" />
                <span>Attention & Risks</span>
              </div>
              {summary && summary.attention_count > 0 && (
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/30">
                  {summary.attention_count}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Workspace Filters */}
        {summary && (
          <div>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Workspace States
            </div>
            <nav className="space-y-0.5">
              <button
                onClick={() => {
                  onSelectNav('workspaces');
                  onSelectFilter('active');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                  activeNav === 'workspaces' && selectedFilter === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141824]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Active</span>
                </div>
                <span className="font-mono text-zinc-500">{summary.active_count}</span>
              </button>

              <button
                onClick={() => {
                  onSelectNav('workspaces');
                  onSelectFilter('attention');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                  activeNav === 'workspaces' && selectedFilter === 'attention'
                    ? 'bg-amber-500/10 text-amber-400 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141824]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Attention</span>
                </div>
                <span className="font-mono text-zinc-500">{summary.attention_count}</span>
              </button>

              <button
                onClick={() => {
                  onSelectNav('workspaces');
                  onSelectFilter('dormant');
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                  activeNav === 'workspaces' && selectedFilter === 'dormant'
                    ? 'bg-zinc-700/20 text-zinc-300 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141824]'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-zinc-500" />
                  <span>Dormant</span>
                </div>
                <span className="font-mono text-zinc-500">{summary.dormant_count}</span>
              </button>
            </nav>
          </div>
        )}

        {/* System Inventory */}
        <div>
          <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            System Substrates
          </div>
          <nav className="space-y-0.5">
            <button
              onClick={() => onSelectNav('processes')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                activeNav === 'processes'
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141824]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4" />
                <span>Processes</span>
              </div>
              {summary && (
                <span className="font-mono text-zinc-500">{summary.total_processes}</span>
              )}
            </button>

            <button
              onClick={() => onSelectNav('runtimes')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                activeNav === 'runtimes'
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141824]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4" />
                <span>Runtimes & SDKs</span>
              </div>
              {summary && (
                <span className="font-mono text-zinc-500">{summary.total_runtimes}</span>
              )}
            </button>

            <button
              onClick={() => onSelectNav('containers')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                activeNav === 'containers'
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141824]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Boxes className="w-4 h-4" />
                <span>Containers</span>
              </div>
              {summary && (
                <span className="font-mono text-zinc-500">{summary.total_containers}</span>
              )}
            </button>

            <button
              onClick={() => onSelectNav('caches')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded transition-colors ${
                activeNav === 'caches'
                  ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#141824]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4" />
                <span>Package Caches</span>
              </div>
              {summary && (
                <span className="font-mono text-zinc-500">{summary.total_caches}</span>
              )}
            </button>
          </nav>
        </div>
      </div>

      {/* Bottom Footer Actions */}
      <div className="p-3 border-t border-[#1e2330] space-y-2 bg-[#090b10]">
        <button
          onClick={onInspectFolder}
          className="w-full bg-[#182030] hover:bg-[#202a40] text-emerald-400 border border-emerald-500/30 rounded px-2.5 py-2 flex items-center justify-center space-x-2 font-medium transition-colors shadow-sm"
        >
          <FolderSearch className="w-4 h-4" />
          <span>Inspect Workspace...</span>
        </button>

        <div className="px-1 pt-1 flex items-center justify-between text-[10px] text-zinc-500">
          <div className="flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Read-Only</span>
          </div>
          <span>Zero Telemetry</span>
        </div>
      </div>
    </aside>
  );
};

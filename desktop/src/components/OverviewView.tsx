import React, { useState } from 'react';
import {
  FolderGit2,
  Activity,
  Cpu,
  Database,
  RefreshCw,
  FolderSearch,
  ExternalLink,
  Terminal,
  Copy,
  Check,
  AlertTriangle,
  GitBranch,
  Clock,
  Sparkles,
  Server,
} from 'lucide-react';
import { EnvironmentOverview, StateCategory, WorkspaceSummary } from '../types/entropy';
import { EntropyApiClient } from '../services/api';

interface OverviewViewProps {
  overview: EnvironmentOverview;
  onRefresh: () => void;
  isLoading: boolean;
  selectedFilter: StateCategory | 'all';
  onSelectFilter: (filter: StateCategory | 'all') => void;
  onSelectWorkspace: (path: string) => void;
  onInspectFolder: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  overview,
  onRefresh,
  isLoading,
  selectedFilter,
  onSelectFilter,
  onSelectWorkspace,
  onInspectFolder,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const { summary, workspaces, findings, metadata } = overview;

  const handleCopy = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 1800);
  };

  const handleOpenExplorer = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    EntropyApiClient.openInExplorer(path);
  };

  const handleOpenTerminal = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    EntropyApiClient.openInTerminal(path);
  };

  const filteredWorkspaces = workspaces.filter((w) => {
    const matchesFilter =
      selectedFilter === 'all' || w.state_category === selectedFilter;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      w.name.toLowerCase().includes(query) ||
      w.path.toLowerCase().includes(query) ||
      (w.git_branch && w.git_branch.toLowerCase().includes(query)) ||
      w.project_type.toLowerCase().includes(query);
    return matchesFilter && matchesSearch;
  });

  const getStateBadge = (category: StateCategory, label: string) => {
    switch (category) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
            {label}
          </span>
        );
      case 'attention':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950/60 text-amber-400 border border-amber-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5" />
            {label}
          </span>
        );
      case 'dormant':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800/70 text-zinc-400 border border-zinc-700/60">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 mr-1.5" />
            {label}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-950/60 text-blue-400 border border-blue-800/60">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5" />
            {label}
          </span>
        );
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0d14] text-zinc-300 p-6 space-y-6">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1e2330]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 flex items-center space-x-2">
            <span>Environment Intelligence</span>
            <span className="text-xs font-normal text-zinc-500 font-mono">
              ({metadata.hostname})
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Reconstructed state of developer workspaces, runtime dependencies, and system substrates.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#141824] hover:bg-[#1a2030] text-zinc-300 border border-[#23293a] rounded text-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{isLoading ? 'Scanning...' : 'Scan Environment'}</span>
          </button>

          <button
            onClick={onInspectFolder}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded text-xs font-medium transition-colors"
          >
            <FolderSearch className="w-3.5 h-3.5" />
            <span>Inspect Folder...</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Workspaces Card */}
        <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Workspaces</span>
            <FolderGit2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {summary.total_workspaces}
          </div>
          <div className="flex items-center space-x-2 text-[11px] pt-1">
            <span className="text-emerald-400 font-medium">{summary.active_count} active</span>
            <span className="text-zinc-600">•</span>
            <span className="text-amber-400 font-medium">{summary.attention_count} attention</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">{summary.dormant_count} dormant</span>
          </div>
        </div>

        {/* Processes Card */}
        <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Processes</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {summary.total_processes}
          </div>
          <div className="text-[11px] text-zinc-400 pt-1">
            Running from developer paths
          </div>
        </div>

        {/* Runtimes Card */}
        <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Runtimes & SDKs</span>
            <Cpu className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {summary.total_runtimes}
          </div>
          <div className="text-[11px] text-zinc-400 pt-1">
            Python, Node, Cargo detected
          </div>
        </div>

        {/* Caches Card */}
        <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Package Caches</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100">
            {summary.total_caches}
          </div>
          <div className="text-[11px] text-zinc-400 pt-1">
            npm, pip package substrates
          </div>
        </div>
      </div>

      {/* Attention / Risk Widget */}
      {findings.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-900/40 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-400 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4" />
              <span>Attention Required ({findings.length} findings)</span>
            </div>
            <span className="text-[10px] text-amber-500/80 font-mono">Cognitive Audit</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {findings.map((f) => (
              <div
                key={f.id}
                className="bg-[#121622] border border-[#23293a] rounded p-3 text-xs space-y-2 hover:border-amber-500/40 transition-colors"
              >
                <div className="font-medium text-zinc-200 flex items-center justify-between">
                  <span>{f.title}</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-amber-900/30 text-amber-400 border border-amber-800/40">
                    {f.severity}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                  {f.explanation}
                </p>
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {f.entities_involved[0] ? f.entities_involved[0].split('\\').pop() : ''}
                  </span>
                  <button
                    onClick={() => {
                      const ent = f.entities_involved[0] || '';
                      const rawPath = ent.replace(/^project:/, '').replace(/^git:/, '');
                      if (rawPath) onSelectWorkspace(rawPath);
                    }}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium"
                  >
                    Inspect Workspace &rarr;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workspaces Directory Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Filter Tabs */}
          <div className="flex items-center space-x-1 bg-[#10141f] border border-[#1e2330] p-1 rounded text-xs">
            <button
              onClick={() => onSelectFilter('all')}
              className={`px-3 py-1 rounded transition-colors ${
                selectedFilter === 'all'
                  ? 'bg-zinc-800 text-zinc-100 font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All ({workspaces.length})
            </button>
            <button
              onClick={() => onSelectFilter('active')}
              className={`px-3 py-1 rounded transition-colors ${
                selectedFilter === 'active'
                  ? 'bg-emerald-950/60 text-emerald-400 font-medium border border-emerald-800/40 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Active ({summary.active_count})
            </button>
            <button
              onClick={() => onSelectFilter('attention')}
              className={`px-3 py-1 rounded transition-colors ${
                selectedFilter === 'attention'
                  ? 'bg-amber-950/60 text-amber-400 font-medium border border-amber-800/40 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Attention ({summary.attention_count})
            </button>
            <button
              onClick={() => onSelectFilter('dormant')}
              className={`px-3 py-1 rounded transition-colors ${
                selectedFilter === 'dormant'
                  ? 'bg-zinc-800 text-zinc-300 font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Dormant ({summary.dormant_count})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter by name, path, branch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 bg-[#10141f] border border-[#1e2330] focus:border-emerald-500/50 rounded px-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Workspaces Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWorkspaces.map((w) => (
            <div
              key={w.id}
              onClick={() => onSelectWorkspace(w.path)}
              className="bg-[#0f131d] hover:bg-[#131826] border border-[#1e2330] hover:border-zinc-700/80 rounded-lg p-4 space-y-3 cursor-pointer transition-all flex flex-col justify-between group"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-zinc-100 text-sm group-hover:text-emerald-400 transition-colors flex items-center space-x-1.5">
                      <span>{w.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800/80 text-zinc-400 rounded font-mono font-normal">
                        {w.project_type}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500 font-mono truncate max-w-[240px]">
                      {w.path}
                    </div>
                  </div>
                  <div>{getStateBadge(w.state_category, w.state_label)}</div>
                </div>

                {/* Git and Activity Info */}
                <div className="pt-2 text-xs space-y-1.5 text-zinc-400">
                  {w.git_branch ? (
                    <div className="flex items-center space-x-2 text-[11px]">
                      <div className="flex items-center space-x-1 text-zinc-300 font-mono">
                        <GitBranch className="w-3 h-3 text-emerald-400" />
                        <span>{w.git_branch}</span>
                      </div>
                      {w.has_uncommitted_changes && (
                        <span className="text-[10px] text-amber-400 bg-amber-950/40 border border-amber-900/50 px-1 py-0.2 rounded font-medium">
                          uncommitted changes
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-500 italic">
                      Unversioned Directory
                    </div>
                  )}

                  <div className="flex items-center space-x-3 text-[11px] text-zinc-500">
                    <div className="flex items-center space-x-1">
                      <Activity className="w-3 h-3 text-sky-400" />
                      <span>{w.process_count} process{w.process_count === 1 ? '' : 'es'}</span>
                    </div>
                    <span>•</span>
                    <div>{formatSize(w.total_size_bytes)}</div>
                  </div>
                </div>
              </div>

              {/* Bottom Card Actions */}
              <div className="pt-3 border-t border-[#1a1f2c] flex items-center justify-between text-xs">
                <button
                  onClick={(e) => handleCopy(w.path, e)}
                  className="flex items-center space-x-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {copiedPath === w.path ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 text-[10px]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[10px]">Copy Path</span>
                    </>
                  )}
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => handleOpenExplorer(w.path, e)}
                    title="Open in Windows Explorer"
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleOpenTerminal(w.path, e)}
                    title="Open in Terminal"
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-emerald-400 text-xs font-medium ml-1">
                    Inspect &rarr;
                  </span>
                </div>
              </div>
            </div>
          ))}

          {filteredWorkspaces.length === 0 && (
            <div className="col-span-full p-8 text-center bg-[#0f131d] border border-[#1e2330] rounded-lg text-zinc-500 text-xs">
              No workspaces matching the current filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

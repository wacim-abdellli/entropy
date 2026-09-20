import React, { useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  RefreshCw,
  GitBranch,
  Activity,
  Cpu,
  Boxes,
  Database,
  ShieldCheck,
  AlertTriangle,
  FolderGit2,
  Clock,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { StateCategory, WorkspaceInspection } from '../types/entropy';
import { EntropyApiClient } from '../services/api';
import { RelationshipGraphView } from './RelationshipGraphView';
import { EvidencePanel } from './EvidencePanel';

interface WorkspaceViewProps {
  inspection: WorkspaceInspection;
  onBack: () => void;
  onReinspect: () => void;
  isLoading: boolean;
}

type WorkspaceTab = 'connections' | 'graph' | 'evidence' | 'findings';

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  inspection,
  onBack,
  onReinspect,
  isLoading,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('connections');
  const [copiedPath, setCopiedPath] = useState(false);

  const {
    workspace,
    state,
    connections,
    relationships,
    findings,
    evidence,
    uncertainties,
    action_boundary,
    metadata,
  } = inspection;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(workspace.path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 1800);
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const getStateCategoryStyles = (category: StateCategory) => {
    switch (category) {
      case 'active':
        return {
          banner: 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400',
          dot: 'bg-emerald-400 animate-pulse',
          whyBorder: 'border-emerald-900/40 bg-emerald-950/20',
        };
      case 'attention':
        return {
          banner: 'bg-amber-950/40 border-amber-800/60 text-amber-400',
          dot: 'bg-amber-400',
          whyBorder: 'border-amber-900/40 bg-amber-950/20',
        };
      case 'dormant':
        return {
          banner: 'bg-zinc-800/60 border-zinc-700/60 text-zinc-300',
          dot: 'bg-zinc-500',
          whyBorder: 'border-zinc-800 bg-zinc-900/40',
        };
      case 'inactive':
      case 'paused':
        return {
          banner: 'bg-slate-900/60 border-slate-700/60 text-slate-300',
          dot: 'bg-slate-400',
          whyBorder: 'border-slate-800 bg-slate-900/40',
        };
      default:
        return {
          banner: 'bg-blue-950/40 border-blue-800/60 text-blue-400',
          dot: 'bg-blue-400',
          whyBorder: 'border-blue-900/40 bg-blue-950/20',
        };
    }
  };

  const stateStyles = getStateCategoryStyles(state.category);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0d14] text-zinc-300 p-6 space-y-6">
      {/* Breadcrumb & Navigation Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to All Workspaces</span>
        </button>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => EntropyApiClient.openInExplorer(workspace.path)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#141824] hover:bg-[#1a2030] text-zinc-300 border border-[#23293a] rounded text-xs transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in Explorer</span>
          </button>

          <button
            onClick={() => EntropyApiClient.openInTerminal(workspace.path)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-[#141824] hover:bg-[#1a2030] text-zinc-300 border border-[#23293a] rounded text-xs transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Open Terminal</span>
          </button>

          <button
            onClick={onReinspect}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Inspecting...' : 'Re-inspect'}</span>
          </button>
        </div>
      </div>

      {/* Identity Header */}
      <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold text-zinc-100 font-mono">
                {workspace.name}
              </h1>
              <span className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded font-mono uppercase">
                {workspace.project_type}
              </span>
            </div>
            <div className="flex items-center space-x-2 text-xs text-zinc-400 font-mono">
              <span className="truncate max-w-[500px]">{workspace.path}</span>
              <button
                onClick={handleCopyPath}
                title="Copy Path"
                className="hover:text-zinc-200 transition-colors"
              >
                {copiedPath ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs text-zinc-400 font-mono">
            <div>Size: <span className="text-zinc-200 font-bold">{formatSize(workspace.total_size_bytes)}</span></div>
            <span>•</span>
            <div>Scan time: <span className="text-emerald-400 font-bold">{metadata.scan_duration_ms}ms</span></div>
          </div>
        </div>
      </div>

      {/* State Hero Card with WHY THIS STATE? */}
      <div className={`border rounded-lg p-5 space-y-4 ${stateStyles.banner}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className={`w-3 h-3 rounded-full ${stateStyles.dot}`} />
            <span className="text-base font-bold tracking-wide">
              {state.label}
            </span>
          </div>
          <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-black/40 border border-current">
            {state.category}
          </span>
        </div>

        <p className="text-xs text-zinc-200 leading-relaxed font-sans">
          {state.summary}
        </p>

        {/* WHY THIS STATE? Box */}
        <div className={`rounded-lg p-4 border space-y-2 text-xs ${stateStyles.whyBorder}`}>
          <div className="flex items-center space-x-2 font-bold uppercase tracking-wider text-[11px] text-zinc-200">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>WHY THIS STATE? (Observed Causal Evidence)</span>
          </div>
          <ul className="space-y-1.5 pt-1 text-zinc-300 text-xs">
            {state.why_factors.map((factor, idx) => (
              <li key={idx} className="flex items-start space-x-2">
                <span className="text-emerald-400 font-bold">•</span>
                <span className="leading-relaxed">{factor}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Primary Uncertainty / BOUNDARY Callout (FIX 5) */}
        {(state.primary_uncertainty || inspection.primary_uncertainty) && (
          <div className="flex items-start space-x-2.5 text-xs text-amber-200/90 bg-amber-950/25 border border-amber-800/40 rounded-lg p-3 font-mono">
            <span className="font-bold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-700/50 shrink-0">
              BOUNDARY
            </span>
            <span className="leading-relaxed pt-0.5">
              {state.primary_uncertainty || inspection.primary_uncertainty}
            </span>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center space-x-1 border-b border-[#1e2330] text-xs">
        <button
          onClick={() => setActiveTab('connections')}
          className={`px-4 py-2 border-b-2 font-medium transition-colors flex items-center space-x-2 ${
            activeTab === 'connections'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Connected Substrates</span>
        </button>

        <button
          onClick={() => setActiveTab('graph')}
          className={`px-4 py-2 border-b-2 font-medium transition-colors flex items-center space-x-2 ${
            activeTab === 'graph'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FolderGit2 className="w-4 h-4" />
          <span>Relationship Graph ({relationships.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('evidence')}
          className={`px-4 py-2 border-b-2 font-medium transition-colors flex items-center space-x-2 ${
            activeTab === 'evidence'
              ? 'border-emerald-400 text-emerald-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Evidence & Safety ({evidence.length})</span>
        </button>

        {findings.length > 0 && (
          <button
            onClick={() => setActiveTab('findings')}
            className={`px-4 py-2 border-b-2 font-medium transition-colors flex items-center space-x-2 ${
              activeTab === 'findings'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Findings ({findings.length})</span>
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'connections' && (
        <div className="space-y-6">
          {/* Git Connection */}
          <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#1e2330]">
              <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-200">
                <GitBranch className="w-4 h-4 text-emerald-400" />
                <span>Version Control (Git)</span>
              </div>
              {connections.git ? (
                <span className="text-[10px] font-mono text-zinc-400">
                  {connections.git.commit_count ?? 0} commits
                </span>
              ) : (
                <span className="text-[10px] text-zinc-500 italic">Unversioned</span>
              )}
            </div>

            {connections.git ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded bg-[#131826] border border-[#23293a]">
                    <div className="text-[10px] text-zinc-500 uppercase">Current Branch</div>
                    <div className="font-mono font-bold text-zinc-100 mt-0.5">
                      {connections.git.current_branch || 'HEAD (detached)'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-[#131826] border border-[#23293a]">
                    <div className="text-[10px] text-zinc-500 uppercase">Working Tree State</div>
                    <div className="font-mono mt-0.5">
                      {connections.git.has_uncommitted_changes ? (
                        <span className="text-amber-400 font-bold">Uncommitted changes</span>
                      ) : (
                        <span className="text-emerald-400 font-bold">Clean</span>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-[#131826] border border-[#23293a]">
                    <div className="text-[10px] text-zinc-500 uppercase">Remote Repository</div>
                    <div className="font-mono text-zinc-200 mt-0.5 truncate">
                      {connections.git.remote_repo_id || 'Local only'}
                    </div>
                  </div>
                </div>

                {/* Top Dirty Git Files (FIX 1) */}
                {connections.git.has_uncommitted_changes &&
                  connections.git.dirty_files &&
                  connections.git.dirty_files.length > 0 && (
                    <div className="p-3 bg-[#131826] border border-[#23293a] rounded text-xs space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 font-semibold">
                        <span>Uncommitted / Untracked Paths ({connections.git.dirty_files.length} observed)</span>
                        <span className="text-[10px] text-zinc-500 font-mono">Metadata only • Zero content read</span>
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        {connections.git.dirty_files.slice(0, 5).map((df, idx) => {
                          const statusColor =
                            df.status === 'modified'
                              ? 'text-amber-400 bg-amber-950/40 border-amber-800/40'
                              : df.status === 'untracked'
                              ? 'text-blue-400 bg-blue-950/40 border-blue-800/40'
                              : df.status === 'deleted'
                              ? 'text-rose-400 bg-rose-950/40 border-rose-800/40'
                              : 'text-zinc-400 bg-zinc-800 border-zinc-700';
                          return (
                            <div key={idx} className="flex items-center space-x-2 py-0.5">
                              <span className={`px-1.5 py-0.2 rounded border text-[10px] uppercase font-bold shrink-0 ${statusColor}`}>
                                {df.status}
                              </span>
                              <span className="text-zinc-300 truncate">{df.path}</span>
                            </div>
                          );
                        })}
                        {connections.git.dirty_files.length > 5 && (
                          <div className="text-[10px] text-zinc-500 italic pt-1">
                            + {connections.git.dirty_files.length - 5} more dirty paths
                          </div>
                        )}
                      </div>
                    </div>
                  )}
              </div>
            ) : (
              <div className="text-xs text-zinc-500 italic p-2">
                No Git repository found in this workspace.
              </div>
            )}
          </div>

          {/* Running Processes */}
          <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#1e2330]">
              <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-200">
                <Activity className="w-4 h-4 text-sky-400" />
                <span>Processes Running from Workspace ({connections.processes.length})</span>
              </div>
            </div>

            {connections.processes.length > 0 ? (
              <div className="space-y-2">
                {/* Grouped Interactive Shell Sessions (FIX 4) */}
                {(connections.process_groups || []).map((group, gIdx) => (
                  <div
                    key={`group-${gIdx}-${group.parent_pid}`}
                    className="p-3 bg-[#131826] border border-sky-900/40 rounded-lg text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold font-mono text-zinc-100">
                            {group.label}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-950 text-sky-400 border border-sky-800/50">
                            Terminal Host PID {group.parent_pid}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                            Interactive Shell Group
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono">
                          PIDs: {group.pids.join(', ')}
                        </div>
                      </div>
                      <div className="text-right text-[11px] font-mono text-zinc-400 shrink-0">
                        <div>
                          {(group.total_memory_bytes
                            ? group.total_memory_bytes / (1024 * 1024)
                            : 0
                          ).toFixed(1)}{' '}
                          MB RSS
                        </div>
                        <div>{group.count} sessions</div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Individual Processes (Ungrouped) */}
                {(() => {
                  const groupedPids = new Set(
                    (connections.process_groups || []).flatMap((g) => g.pids)
                  );
                  const ungroupedProcs = connections.processes.filter(
                    (p) => !groupedPids.has(p.pid)
                  );

                  return ungroupedProcs.map((proc) => (
                    <div
                      key={proc.entity_id}
                      className="p-3 bg-[#131826] border border-[#23293a] rounded-lg text-xs flex items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold font-mono text-zinc-100">
                            {proc.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                            PID {proc.pid}
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded ${
                              proc.is_shell
                                ? 'bg-zinc-800 text-zinc-400'
                                : 'bg-emerald-950 text-emerald-400 border border-emerald-900/60'
                            }`}
                          >
                            {proc.is_shell ? 'Interactive Shell' : 'Worker'}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono truncate max-w-[500px]">
                          {proc.cmdline_preview || proc.exe_path}
                        </div>
                      </div>

                      <div className="text-right text-[11px] font-mono text-zinc-400 shrink-0">
                        <div>
                          {(proc.memory_bytes
                            ? proc.memory_bytes / (1024 * 1024)
                            : 0
                          ).toFixed(1)}{' '}
                          MB RSS
                        </div>
                        {proc.cpu_percent !== null && <div>{proc.cpu_percent}% CPU</div>}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <div className="text-xs text-zinc-500 italic p-2">
                Zero processes running from this workspace.
              </div>
            )}
          </div>

          {/* Runtimes and Caches */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Runtimes */}
            <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-3">
              <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-200 pb-2 border-b border-[#1e2330]">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span>Installed Runtimes / SDKs ({connections.runtimes.length})</span>
              </div>
              {connections.runtimes.length > 0 ? (
                <div className="space-y-2">
                  {connections.runtimes.map((rt) => (
                    <div key={rt.entity_id} className="p-2.5 bg-[#131826] border border-[#23293a] rounded text-xs flex justify-between">
                      <div>
                        <div className="font-bold text-zinc-200 capitalize">{rt.name} v{rt.version}</div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[260px]">{rt.executable_path}</div>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">{rt.is_system ? 'System' : 'Local'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-zinc-500 italic p-2">No linked runtimes.</div>
              )}
            </div>

            {/* Caches */}
            <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-4 space-y-3">
              <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-200 pb-2 border-b border-[#1e2330]">
                <Database className="w-4 h-4 text-teal-400" />
                <span>Package Caches ({connections.caches.length})</span>
              </div>
              {connections.caches.length > 0 ? (
                <div className="space-y-2">
                  {connections.caches.map((c) => (
                    <div key={c.entity_id} className="p-2.5 bg-[#131826] border border-[#23293a] rounded text-xs flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-zinc-200 uppercase">{c.category} Cache</span>
                          {c.is_shared && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-950/60 border border-sky-800/40 text-sky-400 font-semibold tracking-wide uppercase">
                              Shared System Cache
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[260px]">{c.path}</div>
                        {c.is_shared && (
                          <div className="text-[10px] text-zinc-400 italic">
                            {c.scope_explanation || 'Shared across projects on this machine. (Not isolated to this workspace)'}
                          </div>
                        )}
                      </div>
                      <div className="text-right font-mono text-zinc-300 shrink-0 pl-2">
                        {formatSize(c.size_bytes)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-zinc-500 italic p-2">No matching package caches.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'graph' && (
        <RelationshipGraphView
          workspace={workspace}
          connections={connections}
          relationships={relationships}
        />
      )}

      {activeTab === 'evidence' && (
        <EvidencePanel
          evidence={evidence}
          uncertainties={uncertainties}
          actionBoundary={action_boundary}
        />
      )}

      {activeTab === 'findings' && (
        <div className="space-y-4">
          {findings.map((f) => (
            <div
              key={f.id}
              className="bg-[#0f131d] border border-amber-900/40 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-amber-400 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{f.title}</span>
                </div>
                <span className="text-xs font-mono uppercase bg-amber-950 text-amber-400 border border-amber-800/40 px-2 py-0.5 rounded">
                  {f.severity}
                </span>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                {f.explanation}
              </p>

              <div className="bg-[#131826] border border-[#23293a] rounded p-3 text-xs space-y-1.5">
                <div className="font-semibold text-zinc-200">Recommendation:</div>
                <p className="text-zinc-400 leading-relaxed">{f.recommendation}</p>
                {f.action_boundary && (
                  <div className="pt-2 text-[11px] text-zinc-500 border-t border-zinc-800 italic">
                    Boundary: {f.action_boundary}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  WorkspaceDetails,
  WorkspaceConnections,
  RelationshipItem,
  ObservabilityLevel,
} from '../types/entropy';
import {
  FolderGit2,
  GitBranch,
  Activity,
  Cpu,
  Boxes,
  Database,
  Info,
  X,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react';

interface RelationshipGraphViewProps {
  workspace: WorkspaceDetails;
  connections: WorkspaceConnections;
  relationships: RelationshipItem[];
}

interface SelectedElementDetails {
  type: 'node' | 'edge';
  title: string;
  category: string;
  observability?: ObservabilityLevel;
  evidence?: string;
  metadata?: Record<string, any>;
}

export const RelationshipGraphView: React.FC<RelationshipGraphViewProps> = ({
  workspace,
  connections,
  relationships,
}) => {
  const [selectedDetails, setSelectedDetails] = useState<SelectedElementDetails | null>(null);

  // Build graph nodes and edges from connections & relationships
  const { nodes, edges } = useMemo(() => {
    const generatedNodes: Node[] = [];
    const generatedEdges: Edge[] = [];

    const centerX = 360;
    const centerY = 260;

    // 1. Center Workspace Node
    generatedNodes.push({
      id: workspace.id,
      position: { x: centerX, y: centerY },
      data: {
        label: (
          <div className="p-3 bg-[#111624] border-2 border-emerald-500 rounded-lg shadow-xl text-left min-w-[200px]">
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold font-mono">
              <FolderGit2 className="w-4 h-4" />
              <span>WORKSPACE</span>
            </div>
            <div className="font-bold text-zinc-100 text-sm mt-1 truncate">
              {workspace.name}
            </div>
            <div className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate max-w-[220px]">
              {workspace.path}
            </div>
            <div className="mt-2 pt-1 border-t border-zinc-700/60 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
              <span>{workspace.project_type}</span>
              <span className="text-emerald-400">Target Root</span>
            </div>
          </div>
        ),
        details: {
          type: 'node',
          title: `Workspace: ${workspace.name}`,
          category: 'project',
          metadata: {
            path: workspace.path,
            project_type: workspace.project_type,
            size_bytes: workspace.total_size_bytes,
          },
        },
      },
      type: 'default',
      style: { background: 'transparent', border: 'none', padding: 0 },
    });

    // 2. Git Node
    if (connections.git) {
      const gitX = centerX - 260;
      const gitY = centerY - 140;
      generatedNodes.push({
        id: connections.git.entity_id,
        position: { x: gitX, y: gitY },
        data: {
          label: (
            <div className="p-2.5 bg-[#14121a] border border-amber-500/60 rounded-lg shadow-md text-left min-w-[170px]">
              <div className="flex items-center space-x-1.5 text-amber-400 text-[11px] font-semibold">
                <GitBranch className="w-3.5 h-3.5" />
                <span>GIT REPOSITORY</span>
              </div>
              <div className="font-mono text-zinc-200 text-xs mt-1">
                branch: <span className="text-amber-300 font-bold">{connections.git.current_branch || 'HEAD'}</span>
              </div>
              <div className="text-[10px] text-zinc-400 mt-0.5">
                {connections.git.has_uncommitted_changes ? '⚠️ Uncommitted modifications' : 'Clean working tree'}
              </div>
            </div>
          ),
          details: {
            type: 'node',
            title: 'Git Repository',
            category: 'git',
            metadata: {
              branch: connections.git.current_branch,
              commit_count: connections.git.commit_count,
              last_commit: connections.git.last_commit_hash,
              remote: connections.git.remote_repo_id,
              clean: connections.git.is_clean,
            },
          },
        },
        style: { background: 'transparent', border: 'none', padding: 0 },
      });
    }

    // 3. Process Nodes
    connections.processes.forEach((proc, idx) => {
      const angle = (idx / Math.max(connections.processes.length, 1)) * Math.PI - Math.PI / 2;
      const procX = centerX + 260;
      const procY = centerY - 100 + idx * 80;

      generatedNodes.push({
        id: proc.entity_id,
        position: { x: procX, y: procY },
        data: {
          label: (
            <div className="p-2 bg-[#0e1626] border border-sky-500/60 rounded-lg shadow-md text-left min-w-[180px]">
              <div className="flex items-center justify-between text-sky-400 text-[11px] font-semibold">
                <div className="flex items-center space-x-1">
                  <Activity className="w-3.5 h-3.5" />
                  <span>{proc.name}</span>
                </div>
                <span className="font-mono text-[10px] bg-sky-950 px-1 rounded">PID {proc.pid}</span>
              </div>
              <div className="text-[10px] text-zinc-400 font-mono mt-1 truncate max-w-[170px]">
                {proc.cmdline_preview || proc.exe_path}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5 flex items-center justify-between">
                <span>{proc.is_shell ? 'Interactive Shell' : 'Active Worker'}</span>
                <span>{(proc.memory_bytes ? proc.memory_bytes / (1024 * 1024) : 0).toFixed(1)} MB</span>
              </div>
            </div>
          ),
          details: {
            type: 'node',
            title: `Process: ${proc.name} (${proc.pid})`,
            category: 'process',
            metadata: {
              pid: proc.pid,
              executable: proc.exe_path,
              cwd: proc.cwd,
              memory: proc.memory_bytes,
              is_shell: proc.is_shell,
            },
          },
        },
        style: { background: 'transparent', border: 'none', padding: 0 },
      });
    });

    // 4. Runtime Nodes
    connections.runtimes.forEach((rt, idx) => {
      const rtX = centerX + 240 + idx * 30;
      const rtY = centerY + 180 + idx * 70;

      generatedNodes.push({
        id: rt.entity_id,
        position: { x: rtX, y: rtY },
        data: {
          label: (
            <div className="p-2 bg-[#171224] border border-purple-500/60 rounded-lg shadow-md text-left min-w-[170px]">
              <div className="flex items-center space-x-1 text-purple-400 text-[11px] font-semibold">
                <Cpu className="w-3.5 h-3.5" />
                <span>RUNTIME: {rt.name}</span>
              </div>
              <div className="text-zinc-200 text-xs font-mono font-bold mt-0.5">
                v{rt.version}
              </div>
              <div className="text-[10px] text-zinc-500 truncate max-w-[160px]">
                {rt.executable_path}
              </div>
            </div>
          ),
          details: {
            type: 'node',
            title: `Runtime: ${rt.name} ${rt.version}`,
            category: 'runtime',
            metadata: {
              version: rt.version,
              executable: rt.executable_path,
              system: rt.is_system,
            },
          },
        },
        style: { background: 'transparent', border: 'none', padding: 0 },
      });
    });

    // 5. Docker Containers
    connections.docker.forEach((doc, idx) => {
      const docX = centerX - 260;
      const docY = centerY + 80 + idx * 80;

      generatedNodes.push({
        id: doc.entity_id,
        position: { x: docX, y: docY },
        data: {
          label: (
            <div className="p-2 bg-[#0f172a] border border-indigo-500/60 rounded-lg shadow-md text-left min-w-[180px]">
              <div className="flex items-center justify-between text-indigo-400 text-[11px] font-semibold">
                <div className="flex items-center space-x-1">
                  <Boxes className="w-3.5 h-3.5" />
                  <span>{doc.name}</span>
                </div>
                <span className="text-[10px] font-mono px-1 rounded bg-indigo-950">{doc.state}</span>
              </div>
              <div className="text-[10px] text-zinc-400 font-mono mt-0.5 truncate max-w-[170px]">
                {doc.image}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">
                {doc.bind_mounts.length} mount(s)
              </div>
            </div>
          ),
          details: {
            type: 'node',
            title: `Container: ${doc.name}`,
            category: 'docker',
            metadata: {
              image: doc.image,
              state: doc.state,
              mounts: doc.bind_mounts,
            },
          },
        },
        style: { background: 'transparent', border: 'none', padding: 0 },
      });
    });

    // 6. Cache Nodes
    connections.caches.forEach((cache, idx) => {
      const cX = centerX - 80 + idx * 160;
      const cY = centerY + 250;

      generatedNodes.push({
        id: cache.entity_id,
        position: { x: cX, y: cY },
        data: {
          label: (
            <div className="p-2 bg-[#0e1a17] border border-teal-500/60 rounded-lg shadow-md text-left min-w-[160px]">
              <div className="flex items-center justify-between text-teal-400 text-[11px] font-semibold">
                <div className="flex items-center space-x-1">
                  <Database className="w-3.5 h-3.5" />
                  <span>CACHE: {cache.category}</span>
                </div>
                {cache.is_shared && (
                  <span className="text-[9px] px-1 rounded bg-sky-950/80 border border-sky-800/40 text-sky-400 font-mono">
                    SHARED
                  </span>
                )}
              </div>
              <div className="text-zinc-200 text-xs font-mono font-bold mt-0.5">
                {cache.size_bytes ? `${(cache.size_bytes / (1024 * 1024)).toFixed(1)} MB` : '—'}
              </div>
              <div className="text-[10px] text-zinc-500 truncate max-w-[150px]">
                {cache.path}
              </div>
            </div>
          ),
          details: {
            type: 'node',
            title: `Cache: ${cache.category}`,
            category: 'cache',
            metadata: {
              category: cache.category,
              scope: cache.scope || (cache.is_shared ? 'shared_system' : 'isolated'),
              scope_explanation: cache.scope_explanation || (cache.is_shared ? 'Shared across projects on this machine.' : undefined),
              path: cache.path,
              size: cache.size_bytes,
              entries: cache.entry_count,
            },
          },
        },
        style: { background: 'transparent', border: 'none', padding: 0 },
      });
    });

    // 7. Build Edges from Typed Relationships
    relationships.forEach((rel, idx) => {
      const isDirect = rel.observability === 'directly_observable';
      const isInferable = rel.observability === 'strongly_inferable';

      generatedEdges.push({
        id: `e-${idx}-${rel.source_id}-${rel.target_id}`,
        source: rel.source_id,
        target: rel.target_id,
        label: rel.rel_type,
        animated: isInferable,
        style: {
          stroke: isDirect ? '#10b981' : isInferable ? '#38bdf8' : '#a855f7',
          strokeWidth: 2,
          strokeDasharray: isDirect ? undefined : '5,5',
        },
        labelStyle: {
          fill: '#cbd5e1',
          fontSize: 10,
          fontWeight: 600,
          fontFamily: 'monospace',
        },
        labelBgStyle: {
          fill: '#0f131d',
          fillOpacity: 0.9,
          rx: 4,
          ry: 4,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isDirect ? '#10b981' : isInferable ? '#38bdf8' : '#a855f7',
        },
        data: {
          details: {
            type: 'edge',
            title: `Relationship: ${rel.rel_type.toUpperCase()}`,
            category: rel.rel_type,
            observability: rel.observability,
            evidence: rel.evidence,
          },
        },
      });
    });

    return { nodes: generatedNodes, edges: generatedEdges };
  }, [workspace, connections, relationships]);

  const onNodeClick = (_: any, node: Node) => {
    if (node.data?.details) {
      setSelectedDetails(node.data.details as SelectedElementDetails);
    }
  };

  const onEdgeClick = (_: any, edge: Edge) => {
    if (edge.data?.details) {
      setSelectedDetails(edge.data.details as SelectedElementDetails);
    }
  };

  return (
    <div className="relative w-full h-[620px] bg-[#080b11] border border-[#1e2330] rounded-lg overflow-hidden flex">
      {/* Graph Canvas */}
      <div className="flex-1 h-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          fitView
          attributionPosition="bottom-left"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#27272a" />
          <Controls className="bg-[#111624] border border-[#23293a] text-zinc-300 rounded" />
          <MiniMap
            nodeColor={(n) => {
              if (n.id.startsWith('project:')) return '#10b981';
              if (n.id.startsWith('git:')) return '#f59e0b';
              if (n.id.startsWith('proc:')) return '#38bdf8';
              if (n.id.startsWith('runtime:')) return '#a855f7';
              return '#14b8a6';
            }}
            className="bg-[#0b0e17] border border-[#1e2330] rounded"
          />
        </ReactFlow>

        {/* Legend Overlay */}
        <div className="absolute top-3 left-3 bg-[#0d1017]/90 backdrop-blur border border-[#1e2330] rounded p-2.5 text-[11px] space-y-1.5 pointer-events-none">
          <div className="font-semibold text-zinc-300 text-[10px] uppercase tracking-wider">
            Graph Observability
          </div>
          <div className="flex items-center space-x-2 text-zinc-400">
            <span className="w-5 h-0.5 bg-emerald-500 inline-block" />
            <span>Directly Observable (Filesystem / Process CWD)</span>
          </div>
          <div className="flex items-center space-x-2 text-zinc-400">
            <span className="w-5 h-0.5 border-b border-sky-400 border-dashed inline-block" />
            <span>Strongly Inferable (Executable / Path Matching)</span>
          </div>
        </div>
      </div>

      {/* Slide-out Node/Edge Details Drawer */}
      {selectedDetails && (
        <div className="w-80 bg-[#0d111a] border-l border-[#1e2330] p-4 flex flex-col justify-between overflow-y-auto z-10 text-xs">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                  {selectedDetails.type}
                </span>
                <h3 className="font-semibold text-zinc-100 text-sm mt-1">
                  {selectedDetails.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDetails(null)}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedDetails.observability && (
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                  Observability Standard
                </span>
                <div className="p-2 rounded bg-[#131826] border border-[#23293a] flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono text-zinc-200 text-[11px]">
                    {selectedDetails.observability}
                  </span>
                </div>
              </div>
            )}

            {selectedDetails.evidence && (
              <div className="space-y-1">
                <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                  Empirical Evidence
                </span>
                <div className="p-2.5 rounded bg-[#131826] border border-[#23293a] text-zinc-300 font-mono text-[11px] leading-relaxed">
                  {selectedDetails.evidence}
                </div>
              </div>
            )}

            {selectedDetails.metadata && (
              <div className="space-y-1.5">
                <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                  Attributes
                </span>
                <div className="space-y-1 font-mono text-[11px] bg-[#10141f] border border-[#1e2330] rounded p-2.5">
                  {Object.entries(selectedDetails.metadata).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-0.5 border-b border-zinc-800/40 last:border-none">
                      <span className="text-zinc-500">{k}:</span>
                      <span className="text-zinc-200 truncate max-w-[140px] text-right">
                        {String(v ?? '—')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-[#1e2330] text-[10px] text-zinc-500 flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-zinc-400" />
            <span>Click any node or relationship line to inspect its verified backing evidence.</span>
          </div>
        </div>
      )}
    </div>
  );
};

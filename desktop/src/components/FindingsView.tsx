import React from 'react';
import {
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  HelpCircle,
  FolderGit2,
} from 'lucide-react';
import { FindingItem } from '../types/entropy';

interface FindingsViewProps {
  findings: FindingItem[];
  onSelectWorkspace: (path: string) => void;
}

export const FindingsView: React.FC<FindingsViewProps> = ({
  findings,
  onSelectWorkspace,
}) => {
  const getSeverityBadge = (sev: string) => {
    switch (sev.toLowerCase()) {
      case 'high':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-red-950/60 text-red-400 border border-red-800/60">
            High Severity
          </span>
        );
      case 'medium':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-950/60 text-amber-400 border border-amber-800/60">
            Medium Attention
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-800 text-zinc-400 border border-zinc-700">
            Low / Advisory
          </span>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0a0d14] text-zinc-300 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1e2330]">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>Digital Entropy & Environment Findings ({findings.length})</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Structural inconsistencies, uncommitted drift, obsolete build artifacts, and disconnected infrastructure.
          </p>
        </div>

        <div className="flex items-center space-x-1.5 text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-2.5 py-1 rounded font-mono">
          <ShieldCheck className="w-4 h-4" />
          <span>Non-Destructive Observations</span>
        </div>
      </div>

      {/* Findings List */}
      <div className="space-y-4">
        {findings.map((f) => {
          const mainEntity = f.entities_involved[0] || '';
          const projectPath = mainEntity
            .replace(/^project:/, '')
            .replace(/^git:/, '');

          return (
            <div
              key={f.id}
              className="bg-[#0f131d] border border-[#1e2330] hover:border-zinc-700 rounded-lg p-5 space-y-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold text-zinc-100 text-sm">
                      {f.title}
                    </h3>
                    {getSeverityBadge(f.severity)}
                  </div>
                  {projectPath && (
                    <div className="text-xs text-zinc-400 font-mono flex items-center space-x-1">
                      <FolderGit2 className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{projectPath}</span>
                    </div>
                  )}
                </div>

                {projectPath && (
                  <button
                    onClick={() => onSelectWorkspace(projectPath)}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-[#141824] hover:bg-[#1a2030] text-emerald-400 border border-emerald-500/30 rounded text-xs font-medium transition-colors shrink-0"
                  >
                    <span>Inspect Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Supporting Evidence Bullets */}
              {f.evidence.length > 0 && (
                <div className="bg-[#131826] border border-[#23293a] rounded p-3 text-xs space-y-1">
                  <div className="text-[10px] text-zinc-500 uppercase font-semibold">
                    Verified Causal Clues
                  </div>
                  <ul className="space-y-1 text-zinc-300 font-mono text-[11px]">
                    {f.evidence.map((ev, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="text-amber-400 font-bold">•</span>
                        <span>{ev}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Explanation & Recommendation */}
              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-zinc-300">Why this matters: </span>
                  <span className="text-zinc-400 leading-relaxed">{f.explanation}</span>
                </div>
                <div>
                  <span className="font-semibold text-zinc-300">Recommended Action: </span>
                  <span className="text-zinc-400 leading-relaxed">{f.recommendation}</span>
                </div>
              </div>

              {/* Action Boundary */}
              {f.action_boundary && (
                <div className="pt-2 border-t border-[#1a1f2c] text-[11px] text-zinc-500 flex items-center space-x-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Boundary: {f.action_boundary}</span>
                </div>
              )}
            </div>
          );
        })}

        {findings.length === 0 && (
          <div className="p-12 text-center bg-[#0f131d] border border-[#1e2330] rounded-lg text-zinc-500 text-xs space-y-2">
            <ShieldCheck className="w-8 h-8 text-emerald-500/60 mx-auto" />
            <div className="text-zinc-300 font-medium text-sm">No Digital Entropy Detected</div>
            <p className="max-w-md mx-auto text-zinc-500">
              All scanned workspaces have consistent Git branches, clean working trees, and active or cleanly preserved states.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

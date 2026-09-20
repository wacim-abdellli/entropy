import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  Copy,
  Check,
  HelpCircle,
  Lock,
} from 'lucide-react';
import { ActionBoundary, EvidenceItem } from '../types/entropy';

interface EvidencePanelProps {
  evidence: EvidenceItem[];
  uncertainties: string[];
  actionBoundary: ActionBoundary;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({
  evidence,
  uncertainties,
  actionBoundary,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyCommand = (cmd: string, index: number) => {
    navigator.clipboard.writeText(cmd);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1800);
  };

  const formatTimestamp = (ts?: number) => {
    if (!ts) return null;
    return new Date(ts * 1000).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* 1. Verified Evidence Table */}
      <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1e2330]">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-zinc-100 text-sm">
              Empirically Verified Observations ({evidence.length})
            </h3>
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">
            Ground-Truth Facts Only
          </span>
        </div>

        <div className="space-y-2.5">
          {evidence.map((item, idx) => (
            <div
              key={idx}
              className="bg-[#131826] border border-[#23293a] rounded-lg p-3 text-xs flex items-start justify-between gap-3 hover:border-zinc-700/80 transition-colors"
            >
              <div className="flex items-start space-x-3">
                <div className="mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-zinc-200">
                      {item.label}
                    </span>
                    <span className="text-[10px] font-mono uppercase bg-zinc-800 text-zinc-400 px-1.5 py-0.2 rounded">
                      {item.category}
                    </span>
                  </div>
                  <div className="text-zinc-300 font-mono text-[11px]">
                    {item.value}
                  </div>
                  {item.detail && (
                    <div className="text-[11px] text-zinc-500 font-mono">
                      {item.detail}
                    </div>
                  )}
                </div>
              </div>

              {item.timestamp && (
                <div className="flex items-center space-x-1 text-[10px] text-zinc-500 font-mono shrink-0">
                  <Clock className="w-3 h-3" />
                  <span>{formatTimestamp(item.timestamp)}</span>
                </div>
              )}
            </div>
          ))}

          {evidence.length === 0 && (
            <div className="p-6 text-center text-zinc-500 text-xs italic">
              No direct observations recorded.
            </div>
          )}
        </div>
      </div>

      {/* 2. Uncertainties & Cognitive Boundaries */}
      <div className="bg-[#12141f] border border-amber-900/30 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1e2330]">
          <div className="flex items-center space-x-2 text-amber-400">
            <HelpCircle className="w-5 h-5" />
            <h3 className="font-semibold text-zinc-100 text-sm">
              Cognitive Boundaries & Disclosed Uncertainties ({uncertainties.length})
            </h3>
          </div>
          <span className="text-[10px] text-amber-500/80 font-mono">
            Epistemic Humility
          </span>
        </div>

        <div className="space-y-2">
          {uncertainties.map((unc, idx) => (
            <div
              key={idx}
              className="bg-[#161a28] border border-amber-900/20 rounded p-3 text-xs text-zinc-300 flex items-start space-x-2.5 leading-relaxed"
            >
              <span className="text-amber-400 font-bold text-sm leading-none">•</span>
              <span>{unc}</span>
            </div>
          ))}

          {uncertainties.length === 0 && (
            <div className="text-xs text-zinc-500 italic">
              No unresolved ambiguities identified for this workspace footprint.
            </div>
          )}
        </div>
      </div>

      {/* 3. Non-Destructive Action Boundaries & Verification Steps */}
      <div className="bg-[#0f131d] border border-[#1e2330] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#1e2330]">
          <div className="flex items-center space-x-2 text-sky-400">
            <Lock className="w-4 h-4" />
            <h3 className="font-semibold text-zinc-100 text-sm">
              Action Boundary & Manual Verification Steps
            </h3>
          </div>
          <div className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-900/50 px-2 py-0.5 rounded font-mono">
            Read-Only Guarantee
          </div>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          {actionBoundary.notice}
        </p>

        <div className="space-y-2 pt-1">
          <div className="text-[11px] font-semibold text-zinc-300 uppercase tracking-wider">
            Suggested Verification Commands:
          </div>

          {actionBoundary.verification_steps.map((step, idx) => (
            <div
              key={idx}
              className="bg-[#131826] border border-[#23293a] rounded p-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center space-x-2 font-mono text-zinc-200">
                <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="select-all">{step}</span>
              </div>
              <button
                onClick={() => handleCopyCommand(step, idx)}
                className="flex items-center space-x-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] transition-colors shrink-0"
              >
                {copiedIndex === idx ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

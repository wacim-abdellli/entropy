import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  Sparkles,
  Layers,
  ArrowRight,
  Shield,
  FileCode,
} from 'lucide-react';

interface AiResponseRendererProps {
  content: string;
}

/**
 * Safely parse inline markdown formatting (**bold**, `code`, *italic*) into React elements.
 */
function renderInline(text: string): React.ReactNode {
  if (!text) return null;

  // Pattern handles:
  // 1. `code`
  // 2. **bold** or *+bold*+
  // 3. *italic*
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*\+[^*+]+\*\+|\*[^*]+\*)/g);

  return tokens.map((tok, i) => {
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length >= 2) {
      const codeContent = tok.slice(1, -1);
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-[var(--color-surface-3)] text-sky-300 font-mono text-[11px] border border-[var(--color-border-subtle)] font-medium"
        >
          {codeContent}
        </code>
      );
    }
    if (
      (tok.startsWith('**') && tok.endsWith('**') && tok.length >= 4) ||
      (tok.startsWith('*+') && tok.endsWith('*+') && tok.length >= 4)
    ) {
      const boldContent = tok.startsWith('**') ? tok.slice(2, -2) : tok.slice(2, -2);
      return (
        <strong key={i} className="font-semibold text-[var(--color-text-primary)]">
          {renderInline(boldContent)}
        </strong>
      );
    }
    if (tok.startsWith('*') && tok.endsWith('*') && tok.length >= 2 && !tok.startsWith('**')) {
      const italicContent = tok.slice(1, -1);
      return (
        <em key={i} className="italic text-[var(--color-text-secondary)]">
          {italicContent}
        </em>
      );
    }
    return tok;
  });
}

/**
 * Interactive Code Block with standalone Copy button and language badge.
 */
const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const langLabel = (language || 'bash').toUpperCase();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--color-surface-4)]/60 border-b border-[var(--color-border-subtle)] text-[10px] text-[var(--color-text-tertiary)] font-mono">
        <div className="flex items-center gap-1.5 text-sky-400 font-medium">
          <Terminal size={12} />
          <span>{langLabel}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-[var(--color-text-primary)] transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-[var(--color-surface-4)]"
          title="Copy command to clipboard"
        >
          {copied ? <Check size={11} className="text-[var(--color-success)]" /> : <Copy size={11} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-3 overflow-x-auto text-[12px] font-mono text-sky-200 leading-relaxed select-text">
        <pre className="m-0 whitespace-pre">{code}</pre>
      </div>
    </div>
  );
};

export const AiResponseRenderer: React.FC<AiResponseRendererProps> = ({ content }) => {
  if (!content) return null;

  // 1. Separate code blocks from text segments
  const segments: Array<{ type: 'code' | 'text'; code?: string; lang?: string; raw?: string }> = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        raw: content.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: 'code',
      lang: match[1] || 'bash',
      code: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      raw: content.slice(lastIndex),
    });
  }

  // 2. Parse text blocks into structured sections
  const elements: React.ReactNode[] = [];
  let verdictNode: React.ReactNode = null;

  segments.forEach((seg, segIdx) => {
    if (seg.type === 'code' && seg.code) {
      elements.push(<CodeBlock key={`code-${segIdx}`} code={seg.code} language={seg.lang} />);
      return;
    }

    const rawLines = (seg.raw || '').split('\n');
    let currentBulletList: Array<{ key?: string; content: string }> = [];
    let currentStepList: Array<{ step: number; text: string }> = [];

    const flushBulletList = (keyPrefix: string) => {
      if (currentBulletList.length === 0) return;
      elements.push(
        <div key={`${keyPrefix}-bullets`} className="my-2.5 space-y-1.5">
          {currentBulletList.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2.5 p-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] leading-relaxed"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {item.key && (
                  <span className="font-semibold text-[var(--color-text-primary)] mr-1.5">
                    {item.key}:
                  </span>
                )}
                <span>{renderInline(item.content)}</span>
              </div>
            </div>
          ))}
        </div>
      );
      currentBulletList = [];
    };

    const flushStepList = (keyPrefix: string) => {
      if (currentStepList.length === 0) return;
      elements.push(
        <div key={`${keyPrefix}-steps`} className="my-2.5 space-y-1.5">
          {currentStepList.map((st, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2.5 p-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-secondary)] leading-relaxed"
            >
              <span className="w-4 h-4 rounded-full bg-[var(--color-surface-3)] text-sky-400 font-mono font-semibold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                {st.step}
              </span>
              <div className="flex-1 min-w-0">{renderInline(st.text)}</div>
            </div>
          ))}
        </div>
      );
      currentStepList = [];
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) {
        flushBulletList(`flush-${segIdx}-${i}`);
        flushStepList(`flush-${segIdx}-${i}`);
        continue;
      }

      // Check for Verdict (at the very top or starting with **Verdict:** or **Yes, it is safe)
      const cleanLine = line.replace(/^\*+\+?|\*+\+?$/g, '').trim();
      const isVerdictLine =
        (!verdictNode && segIdx === 0 && (
          line.toLowerCase().startsWith('**verdict:') ||
          line.toLowerCase().startsWith('verdict:') ||
          line.toLowerCase().startsWith('**yes, it is safe') ||
          line.toLowerCase().startsWith('**safe to delete') ||
          cleanLine.toLowerCase().startsWith('yes, it is safe') ||
          cleanLine.toLowerCase().startsWith('safe to delete') ||
          line.startsWith('### Safety Verdict') ||
          line.startsWith('### Verdict')
        ));

      if (isVerdictLine) {
        flushBulletList(`verdict-b-${segIdx}-${i}`);
        flushStepList(`verdict-s-${segIdx}-${i}`);

        let verdictText = cleanLine.replace(/^### (Safety )?Verdict(:)?\s*/i, '');
        verdictText = verdictText.replace(/^\*\*Verdict:\*\*\s*/i, '');
        verdictText = verdictText.replace(/^Verdict:\s*/i, '');

        const isSafe =
          verdictText.toLowerCase().includes('safe') &&
          !verdictText.toLowerCase().includes('not safe') &&
          !verdictText.toLowerCase().includes('danger');
        const isCaution =
          verdictText.toLowerCase().includes('caution') ||
          verdictText.toLowerCase().includes('warning') ||
          verdictText.toLowerCase().includes('review');

        verdictNode = (
          <div
            key="verdict-banner"
            className={`p-3 rounded-xl border flex items-start gap-3 mb-3 transition-all ${
              isSafe
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : isCaution
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-sky-500/30 bg-sky-500/10 text-sky-200'
            }`}
          >
            {isSafe ? (
              <ShieldCheck size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            ) : isCaution ? (
              <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 size={18} className="text-sky-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-bold tracking-wider opacity-80 mb-0.5">
                {isSafe ? 'Verified Safe Action' : isCaution ? 'Caution Required' : 'Advisor Verdict'}
              </div>
              <div className="text-xs font-semibold leading-relaxed">
                {renderInline(verdictText)}
              </div>
            </div>
          </div>
        );
        continue;
      }

      // Check for Note / Reassurance at bottom
      const isNoteLine =
        line.toLowerCase().startsWith('**note:**') ||
        line.toLowerCase().startsWith('*+note:*+') ||
        line.toLowerCase().startsWith('> **note:**') ||
        line.toLowerCase().startsWith('> note:') ||
        line.toLowerCase().startsWith('note:');

      if (isNoteLine) {
        flushBulletList(`note-b-${segIdx}-${i}`);
        flushStepList(`note-s-${segIdx}-${i}`);

        const noteText = line
          .replace(/^>\s*/, '')
          .replace(/^\*+\+?note:\*+\+?\s*/i, '')
          .replace(/^note:\s*/i, '')
          .trim();

        elements.push(
          <div
            key={`note-${segIdx}-${i}`}
            className="my-2.5 p-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] flex items-start gap-2.5 text-xs text-[var(--color-text-secondary)]"
          >
            <Shield size={14} className="text-sky-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-semibold text-sky-300 mr-1.5">Safety Note:</span>
              <span>{renderInline(noteText)}</span>
            </div>
          </div>
        );
        continue;
      }

      // Check for Section Header
      const isHeader =
        line.startsWith('###') ||
        line.startsWith('##') ||
        line.startsWith('**Recommended Action:**') ||
        line.startsWith('*+Recommended Action:*+') ||
        line.startsWith('**Key Points:**') ||
        line.startsWith('**Action Steps:**');

      if (isHeader) {
        flushBulletList(`header-b-${segIdx}-${i}`);
        flushStepList(`header-s-${segIdx}-${i}`);

        const headerText = line
          .replace(/^#+\s*/, '')
          .replace(/^\*+\+?|\*+\+?$/g, '')
          .replace(/:$/, '')
          .trim();

        const isActionHeader = headerText.toLowerCase().includes('action') || headerText.toLowerCase().includes('reinstall');

        elements.push(
          <div
            key={`header-${segIdx}-${i}`}
            className="flex items-center gap-2 pt-2.5 pb-1 border-b border-[var(--color-border-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-primary)]"
          >
            {isActionHeader ? (
              <Terminal size={13} className="text-[var(--color-accent-strong)]" />
            ) : (
              <Layers size={13} className="text-[var(--color-accent-strong)]" />
            )}
            <span>{headerText}</span>
          </div>
        );
        continue;
      }

      // Check for bullet list item: `* ` or `- `
      const bulletMatch = line.match(/^[\*\-]\s+(.*)$/);
      if (bulletMatch) {
        flushStepList(`bullet-step-${segIdx}-${i}`);
        let itemContent = bulletMatch[1].trim();

        // Check if item has a bold key prefix like `**Reason:** text`
        const keyMatch = itemContent.match(/^(\*\*|\*\+)(.+?)\1:?\s*(.*)$/);
        if (keyMatch) {
          currentBulletList.push({
            key: keyMatch[2].replace(/:$/, '').trim(),
            content: keyMatch[3].trim(),
          });
        } else {
          currentBulletList.push({
            content: itemContent,
          });
        }
        continue;
      }

      // Check for numbered list item: `1. `, `2. `
      const stepMatch = line.match(/^(\d+)\.\s+(.*)$/);
      if (stepMatch) {
        flushBulletList(`step-bullet-${segIdx}-${i}`);
        currentStepList.push({
          step: parseInt(stepMatch[1], 10),
          text: stepMatch[2].trim(),
        });
        continue;
      }

      // Normal paragraph
      flushBulletList(`para-b-${segIdx}-${i}`);
      flushStepList(`para-s-${segIdx}-${i}`);

      elements.push(
        <p key={`p-${segIdx}-${i}`} className="my-1.5 text-xs text-[var(--color-text-secondary)] leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }

    flushBulletList(`end-b-${segIdx}`);
    flushStepList(`end-s-${segIdx}`);
  });

  return (
    <div className="space-y-1.5 select-text text-xs leading-relaxed">
      {verdictNode}
      <div className="space-y-2">{elements}</div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface AiResponseRendererProps {
  content: string;
}

/**
 * Safely parse inline markdown formatting (**bold**, `code`, *italic*, links) into React elements.
 */
function renderInline(text: string): React.ReactNode {
  if (!text) return null;

  // Sanitize any stray formatting markers like '++' or '*+'
  const sanitized = text
    .replace(/\*\+/g, '**')
    .replace(/\+\*/g, '**')
    .replace(/\+\+/g, '**');

  // Tokenize code, bold, italic, and URLs
  const tokens = sanitized.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|https?:\/\/[^\s]+)/g);

  return tokens.map((tok, i) => {
    if (!tok) return null;

    // Inline code `code`
    if (tok.startsWith('`') && tok.endsWith('`') && tok.length >= 2) {
      const codeContent = tok.slice(1, -1);
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-[var(--color-surface-3)] text-sky-300 font-mono text-[11px] border border-[var(--color-border-subtle)] font-medium select-all"
        >
          {codeContent}
        </code>
      );
    }

    // Bold **bold** or __bold__
    if (
      (tok.startsWith('**') && tok.endsWith('**') && tok.length >= 4) ||
      (tok.startsWith('__') && tok.endsWith('__') && tok.length >= 4)
    ) {
      const boldContent = tok.slice(2, -2);
      return (
        <strong key={i} className="font-semibold text-[var(--color-text-primary)]">
          {renderInline(boldContent)}
        </strong>
      );
    }

    // Italic *italic* or _italic_
    if (
      ((tok.startsWith('*') && tok.endsWith('*')) || (tok.startsWith('_') && tok.endsWith('_'))) &&
      tok.length >= 2
    ) {
      const italicContent = tok.slice(1, -1);
      return (
        <em key={i} className="italic text-[var(--color-text-secondary)]">
          {italicContent}
        </em>
      );
    }

    // URLs
    if (tok.startsWith('http://') || tok.startsWith('https://')) {
      return (
        <a
          key={i}
          href={tok}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-accent)] hover:underline inline-flex items-center gap-0.5"
        >
          {tok}
        </a>
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
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-3)] overflow-hidden shadow-xs">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[var(--color-surface-4)]/70 border-b border-[var(--color-border-subtle)] text-[10px] text-[var(--color-text-tertiary)] font-mono">
        <div className="flex items-center gap-1.5 text-sky-400 font-medium">
          <Terminal size={12} />
          <span>{langLabel}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-[var(--color-surface-4)] font-sans"
          title="Copy command"
        >
          {copied ? <Check size={11} className="text-[var(--color-success)]" /> : <Copy size={11} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto text-[12px] font-mono text-sky-200 leading-relaxed select-text">
        <pre className="m-0 whitespace-pre font-mono">{code}</pre>
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

  // 2. Render elements sequentially
  const elements: React.ReactNode[] = [];

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
        <ul key={`${keyPrefix}-bullets`} className="my-2 space-y-1.5 pl-1">
          {currentBulletList.map((item, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)] leading-relaxed"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                {item.key && (
                  <strong className="text-[var(--color-text-primary)] font-semibold mr-1.5">
                    {item.key}:
                  </strong>
                )}
                <span>{renderInline(item.content)}</span>
              </div>
            </li>
          ))}
        </ul>
      );
      currentBulletList = [];
    };

    const flushStepList = (keyPrefix: string) => {
      if (currentStepList.length === 0) return;
      elements.push(
        <ol key={`${keyPrefix}-steps`} className="my-2 space-y-1.5 pl-1">
          {currentStepList.map((st, idx) => (
            <li
              key={idx}
              className="flex items-start gap-2.5 text-xs text-[var(--color-text-secondary)] leading-relaxed"
            >
              <span className="w-4 h-4 rounded-full bg-[var(--color-surface-3)] text-sky-400 font-mono font-semibold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                {st.step}
              </span>
              <div className="flex-1 min-w-0">{renderInline(st.text)}</div>
            </li>
          ))}
        </ol>
      );
      currentStepList = [];
    };

    for (let i = 0; i < rawLines.length; i++) {
      let line = rawLines[i].trim();
      if (!line) {
        flushBulletList(`flush-${segIdx}-${i}`);
        flushStepList(`flush-${segIdx}-${i}`);
        continue;
      }

      // Clean leading/trailing ++
      line = line.replace(/^\+\+/, '**').replace(/\+\+$/, '**');

      // Check for blockquote > note
      if (line.startsWith('>')) {
        flushBulletList(`quote-b-${segIdx}-${i}`);
        flushStepList(`quote-s-${segIdx}-${i}`);
        const quoteText = line.replace(/^>\s*/, '').trim();
        elements.push(
          <div
            key={`quote-${segIdx}-${i}`}
            className="my-2 p-3 rounded-lg border-l-3 border-[var(--color-accent)] bg-[var(--color-surface-2)] text-xs text-[var(--color-text-secondary)] leading-relaxed flex items-start gap-2"
          >
            <Info size={14} className="text-[var(--color-accent)] shrink-0 mt-0.5" />
            <div className="flex-1">{renderInline(quoteText)}</div>
          </div>
        );
        continue;
      }

      // Check for explicit Verdict header
      if (line.toLowerCase().startsWith('**verdict:**') || line.toLowerCase().startsWith('verdict:')) {
        flushBulletList(`verdict-b-${segIdx}-${i}`);
        flushStepList(`verdict-s-${segIdx}-${i}`);
        const verdictContent = line.replace(/^\*\*verdict:\*\*\s*/i, '').replace(/^verdict:\s*/i, '').trim();
        const isSafe = verdictContent.toLowerCase().includes('safe') && !verdictContent.toLowerCase().includes('not safe');
        const isCaution = verdictContent.toLowerCase().includes('caution') || verdictContent.toLowerCase().includes('warning');

        elements.push(
          <div
            key={`verdict-${segIdx}-${i}`}
            className={`p-3 rounded-xl border flex items-start gap-2.5 my-2 ${
              isSafe
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : isCaution
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-sky-500/30 bg-sky-500/10 text-sky-200'
            }`}
          >
            {isSafe ? (
              <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            ) : isCaution ? (
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <Info size={16} className="text-sky-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs leading-relaxed font-medium">
              {renderInline(verdictContent)}
            </div>
          </div>
        );
        continue;
      }

      // Check for Section Header (### or ##)
      if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
        flushBulletList(`h-b-${segIdx}-${i}`);
        flushStepList(`h-s-${segIdx}-${i}`);
        const hText = line.replace(/^#+\s*/, '').trim();
        elements.push(
          <h4
            key={`header-${segIdx}-${i}`}
            className="text-xs font-bold text-[var(--color-text-primary)] mt-3 mb-1 pt-1 border-b border-[var(--color-border-subtle)] pb-1"
          >
            {renderInline(hText)}
          </h4>
        );
        continue;
      }

      // Check for bullet list item: `* ` or `- `
      const bulletMatch = line.match(/^[\*\-]\s+(.*)$/);
      if (bulletMatch) {
        flushStepList(`bullet-step-${segIdx}-${i}`);
        const itemContent = bulletMatch[1].trim();

        // Check if item has a bold key prefix like `**Reason:** text`
        const keyMatch = itemContent.match(/^(\*\*|__)(.+?)\1:?\s*(.*)$/);
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

      // Regular paragraph
      flushBulletList(`p-b-${segIdx}-${i}`);
      flushStepList(`p-s-${segIdx}-${i}`);
      elements.push(
        <p key={`p-${segIdx}-${i}`} className="my-1.5 text-xs text-[var(--color-text-primary)] leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }

    flushBulletList(`end-b-${segIdx}`);
    flushStepList(`end-s-${segIdx}`);
  });

  return (
    <div className="space-y-1 select-text text-xs leading-relaxed">
      {elements}
    </div>
  );
};

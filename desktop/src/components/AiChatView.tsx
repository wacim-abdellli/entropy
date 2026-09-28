import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Settings,
  FolderGit2,
  Terminal,
  Shield,
  Radio,
  HardDrive,
  MessageSquare,
} from 'lucide-react';
import { WorkspaceSummary } from '../types/entropy';
import { EntropyApiClient } from '../services/api';
import { AiResponseRenderer } from './AiResponseRenderer';

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

interface AiChatViewProps {
  workspaces?: WorkspaceSummary[];
  currentWorkspace?: WorkspaceSummary | null;
  onSelectWorkspace?: (path: string) => void;
  onNavigateToSettings?: () => void;
}

export const AiChatView: React.FC<AiChatViewProps> = ({
  workspaces = [],
  currentWorkspace,
  onSelectWorkspace,
  onNavigateToSettings,
}) => {
  const [selectedWsPath, setSelectedWsPath] = useState<string>(
    currentWorkspace?.path || (workspaces.length > 0 ? workspaces[0].path : '')
  );

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('entropy_ai_chat_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Active workspace metadata for context
  const activeWs = workspaces.find((w) => w.path === selectedWsPath) || currentWorkspace;

  useEffect(() => {
    try {
      sessionStorage.setItem('entropy_ai_chat_messages', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0 || isThinking) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isThinking]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async (customPrompt?: string) => {
    const prompt = (customPrompt || inputPrompt).trim();
    if (!prompt || isThinking) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputPrompt('');
    setIsThinking(true);

    try {
      const context = {
        workspace_name: activeWs?.name,
        workspace_path: activeWs?.path,
        project_type: activeWs?.project_type,
        git_branch: activeWs?.git_branch,
        has_uncommitted_changes: activeWs?.has_uncommitted_changes,
        commits_ahead: activeWs?.commits_ahead,
        commits_behind: activeWs?.commits_behind,
        ports: activeWs?.ports,
        all_workspaces: workspaces.map((w) => ({
          name: w.name,
          path: w.path,
          project_type: w.project_type,
          git_branch: w.git_branch,
          has_uncommitted_changes: w.has_uncommitted_changes,
          commits_ahead: w.commits_ahead,
          commits_behind: w.commits_behind,
          ports: w.ports,
          total_size_bytes: w.total_size_bytes,
        })),
      };

      const res = await EntropyApiClient.askAiAdvisor(prompt, context);
      const aiText =
        res?.answer ||
        (res?.error ? `Error: ${res.error}` : 'No response received from Platform AI.');

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: aiText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: err instanceof Error ? err.message : 'Failed to consult Platform AI.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } finally {
      setIsThinking(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleClearChat = () => {
    setMessages([]);
    try {
      sessionStorage.removeItem('entropy_ai_chat_messages');
    } catch {}
    inputRef.current?.focus();
  };

  const quickPrompts = [
    {
      title: 'Tree My Folders',
      icon: Terminal,
      prompt: 'tree my folders',
    },
    {
      title: 'All My Repositories',
      icon: FolderGit2,
      prompt: 'What repositories do I have on my PC and what is their Git status?',
    },
    {
      title: 'About Entropy App',
      icon: Sparkles,
      prompt: 'What is Entropy and what can it do to optimize my developer workstation?',
    },
    {
      title: 'Safe Disk Cleanup',
      icon: HardDrive,
      prompt: 'Is it safe to delete node_modules, target, or .venv folders to free up disk space?',
    },
    {
      title: 'Dev Server Ports',
      icon: Radio,
      prompt: 'How can I identify and stop background development servers holding open ports?',
    },
    {
      title: 'Fix Git Changes',
      icon: Shield,
      prompt: 'How do I safely stash or commit my uncommitted changes before switching branches?',
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-0)] text-[var(--color-text-primary)]">
      {/* Header */}
      <header className="p-4 sm:px-8 sm:py-5 border-b border-[var(--color-border)] bg-[var(--color-surface-1)] flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 flex items-center justify-center text-[var(--color-accent)] shadow-xs">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">AI Assistant</h1>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success-border)]">
                Online • Built-in
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Ask Platform AI anything about your code, disk cleanup, Git, or developer workstation.
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2.5">
          {/* Workspace Context Selector */}
          {workspaces.length > 0 && (
            <div className="flex items-center gap-1.5 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-2.5 py-1 text-xs">
              <FolderGit2 size={13} className="text-[var(--color-accent)] shrink-0" />
              <select
                value={selectedWsPath}
                onChange={(e) => {
                  const path = e.target.value;
                  setSelectedWsPath(path);
                  if (path && onSelectWorkspace) {
                    onSelectWorkspace(path);
                  }
                }}
                className="bg-transparent text-xs text-[var(--color-text-primary)] focus:outline-none cursor-pointer max-w-[140px] truncate"
                title="Select workspace context for AI queries"
              >
                <option value="">General (All Workspaces & PC)</option>
                {workspaces.map((w) => (
                  <option key={w.path} value={w.path}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-red-400 bg-[var(--color-surface-2)] hover:bg-red-400/10 border border-[var(--color-border)] rounded-lg transition-colors cursor-pointer"
              title="Clear conversation"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">Clear Chat</span>
            </button>
          )}

          {onNavigateToSettings && (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-lg transition-colors cursor-pointer"
              title="Configure AI models and providers"
            >
              <Settings size={13} />
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Chat Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 max-w-4xl w-full mx-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6 animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/25 flex items-center justify-center text-[var(--color-accent)] shadow-sm">
              <Sparkles size={32} />
            </div>

            <div className="space-y-2 max-w-md">
              <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
                How can I help you today?
              </h2>
              <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                {activeWs ? (
                  <>
                    I have context on <strong className="text-[var(--color-text-primary)] font-mono">{activeWs.name}</strong>. Ask me about safe file deletions, Git status, active servers, or terminal commands.
                  </>
                ) : (
                  'Ask me anything about developer machine optimization, safe cache cleanup, Git recovery, or running processes.'
                )}
              </p>
            </div>

            {/* Quick Prompt Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl text-left pt-2">
              {quickPrompts.map((qp, idx) => {
                const Icon = qp.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSend(qp.prompt)}
                    className="p-3.5 rounded-xl bg-[var(--color-surface-1)] hover:bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-all cursor-pointer group text-left space-y-1.5 shadow-xs"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors">
                      <Icon size={14} className="text-[var(--color-accent)]" />
                      <span>{qp.title}</span>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)] line-clamp-2 leading-relaxed">
                      {qp.prompt}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className="space-y-1">
                {msg.sender === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[75%] bg-[var(--color-accent)] text-white px-4 py-3 rounded-2xl rounded-tr-xs shadow-xs space-y-1">
                      <div className="flex items-center justify-between gap-4 text-[10px] text-white/75 font-medium">
                        <span>You</span>
                        <span>{msg.timestamp}</span>
                      </div>
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 justify-start">
                    <div className="w-8 h-8 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center shrink-0 mt-0.5 text-[var(--color-accent)] shadow-xs">
                      <Sparkles size={16} />
                    </div>
                    <div className="flex-1 max-w-[92%] sm:max-w-[85%] bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl rounded-tl-xs p-4 sm:p-5 shadow-xs space-y-2 text-xs sm:text-sm">
                      <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border-subtle)]">
                        <div className="flex items-center gap-1.5 text-[var(--color-accent-strong)] font-semibold text-xs">
                          <span>Platform AI</span>
                          <span className="text-[10px] font-normal text-[var(--color-text-tertiary)]">
                            ({msg.timestamp})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.text)}
                          className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[var(--color-surface-2)]"
                        >
                          {copiedMsgId === msg.id ? (
                            <Check size={12} className="text-[var(--color-success)]" />
                          ) : (
                            <Copy size={12} />
                          )}
                          <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <AiResponseRenderer content={msg.text} />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isThinking && (
              <div className="flex items-start gap-3 justify-start animate-in fade-in">
                <div className="w-8 h-8 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] flex items-center justify-center shrink-0 mt-0.5 text-[var(--color-accent)] shadow-xs">
                  <Sparkles size={16} className="animate-spin" />
                </div>
                <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-2xl rounded-tl-xs px-5 py-3.5 text-xs text-[var(--color-text-secondary)] flex items-center gap-3 shadow-xs">
                  <span className="font-medium text-[var(--color-text-primary)]">Platform AI is thinking</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Bottom Chat Prompt Input Bar */}
      <div className="p-4 sm:p-6 border-t border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
          className="max-w-4xl w-full mx-auto flex items-center gap-3"
        >
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder="Ask Platform AI anything... (Press Enter to send)"
              disabled={isThinking}
              className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/50 focus:border-[var(--color-accent)] rounded-xl px-4 py-3 text-xs sm:text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none shadow-xs transition-colors pr-10"
            />
            {inputPrompt.trim() && (
              <button
                type="button"
                onClick={() => setInputPrompt('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] text-xs cursor-pointer"
                title="Clear input"
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={isThinking || !inputPrompt.trim()}
            className="h-11 px-5 rounded-xl bg-[var(--color-accent)] hover:opacity-90 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 shadow-xs shrink-0 select-none"
            title="Send prompt (Enter)"
          >
            {isThinking ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <Send size={15} />
            )}
            <span>Send</span>
          </button>
        </form>
        <div className="max-w-4xl mx-auto flex items-center justify-between text-[11px] text-[var(--color-text-tertiary)] mt-2 px-1">
          <span>Platform AI includes built-in neural reasoning • Zero API key needed</span>
          <span className="hidden sm:inline">Press Enter to send</span>
        </div>
      </div>
    </div>
  );
};

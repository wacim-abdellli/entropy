import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  FolderSearch, 
  Info, 
  GitBranch, 
  Monitor,
  FolderOpen,
  ArrowUpRight,
  RefreshCw,
  Trash2,
  FolderGit2,
  Bot,
  Sparkles,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { EntropyApiClient } from '../services/api';
import { WorkspaceSummary, AiConfig } from '../types/entropy';

interface SettingsViewProps {
  scanRoots?: string[];
  onScanRootsChange?: (roots: string[]) => void;
  onOpenWorkspace?: (path: string) => void;
  currentWorkspace?: WorkspaceSummary | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  scanRoots,
  onScanRootsChange,
  onOpenWorkspace,
  currentWorkspace,
}) => {
  const [directories, setDirectories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('entropy_scan_roots');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return scanRoots ?? ['C:\\Users\\pc\\Desktop'];
  });
  const [dirToDelete, setDirToDelete] = useState<string | null>(null);

  const [aiConfig, setAiConfig] = useState<AiConfig>({
    provider: 'rules',
    groq_api_key: '',
    groq_model: 'llama-3.3-70b-versatile',
    ollama_url: 'http://localhost:11434',
    ollama_model: 'llama3.2',
  });
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  useEffect(() => {
    EntropyApiClient.getAiConfig().then((cfg) => {
      if (cfg) setAiConfig(cfg);
    });
  }, []);

  const handleUpdateAiConfig = async (updates: Partial<AiConfig>) => {
    const updated = { ...aiConfig, ...updates };
    setAiConfig(updated);
    setTestResult(null);
    try {
      await EntropyApiClient.saveAiConfig(updates);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 2500);
    } catch (err) {
      console.error('Failed to save AI config:', err);
    }
  };

  const handleTestAiConnection = async () => {
    setTestingAi(true);
    setTestResult(null);
    try {
      const res = await EntropyApiClient.testAiConnection(aiConfig.provider);
      setTestResult({
        success: res.success,
        message: res.success ? (res.message || 'Connection successful.') : (res.error || 'Connection failed.'),
      });
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setTestingAi(false);
    }
  };


  const saveAndNotify = (updated: string[]) => {
    setDirectories(updated);
    try {
      localStorage.setItem('entropy_scan_roots', JSON.stringify(updated));
    } catch {}
    onScanRootsChange?.(updated);
  };

  const handleRemoveDir = (dirToRemove: string) => {
    const normToRemove = dirToRemove.toLowerCase().replace(/[\\/]+$/, '');
    const updated = directories.filter(
      dir => dir.toLowerCase().replace(/[\\/]+$/, '') !== normToRemove
    );
    saveAndNotify(updated);
  };

  const handleAddDir = async () => {
    try {
      const selected = await EntropyApiClient.pickFolder();
      if (selected) {
        const selNorm = selected.toLowerCase().replace(/[\\/]+$/, '');
        if (!directories.some(d => d.toLowerCase().replace(/[\\/]+$/, '') === selNorm)) {
          const updated = [...directories, selected];
          saveAndNotify(updated);
        }
      }
    } catch (err) {
      console.error('Failed to open folder picker:', err);
    }
  };

  const handleChangeDir = async (oldDir: string) => {
    try {
      const selected = await EntropyApiClient.pickFolder();
      if (selected && selected !== oldDir) {
        const updated = directories.map(dir => dir === oldDir ? selected : dir);
        saveAndNotify(updated);
      }
    } catch (err) {
      console.error('Failed to change directory:', err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-0)] text-[var(--color-text-primary)]">
      {/* Header */}
      <div className="p-8 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <div className="flex items-center gap-3 mb-2">
          <Settings size={28} className="text-[var(--color-accent)]" />
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-semibold">Settings</h1>
            {currentWorkspace && (
              <>
                <span className="text-[var(--color-text-tertiary)] text-2xl font-light">/</span>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-accent-strong)]">
                  <FolderGit2 className="w-4 h-4 text-[var(--color-accent)]" />
                  <span>{currentWorkspace.name}</span>
                </div>
              </>
            )}
          </div>
        </div>
        <p className="text-[var(--color-text-secondary)] text-sm">
          Configure workspace scanning directories and app preferences.
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 space-y-12 w-full max-w-full min-w-0">
        
        {/* Scan Directories Section */}
        <section className="max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderSearch size={22} className="text-[var(--color-text-secondary)]" />
              <h2 className="text-xl font-medium">Scan Directories</h2>
            </div>
            <button 
              type="button"
              onClick={handleAddDir}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium transition-opacity cursor-pointer shadow-sm"
            >
              <FolderOpen size={14} />
              <span>Add Directory</span>
            </button>
          </div>

          <p className="text-[var(--color-text-secondary)] text-sm mb-4">
            Entropy automatically discovers and monitors projects located inside these directories.
          </p>

          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            {directories.length === 0 ? (
              <div className="p-8 text-center text-[var(--color-text-secondary)] text-sm space-y-3">
                <p>No directories configured for scanning.</p>
                <button 
                  type="button"
                  onClick={handleAddDir}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-primary)] cursor-pointer"
                >
                  <FolderOpen size={14} className="text-[var(--color-accent)]" />
                  <span>Choose Folder in File Explorer</span>
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {directories.map((dir) => {
                  const isCurrent = currentWorkspace?.path
                    ? dir.toLowerCase().replace(/[\\/]+$/, '') ===
                      currentWorkspace.path.toLowerCase().replace(/[\\/]+$/, '')
                    : false;
                  return (
                    <li key={dir} className="flex items-center justify-between p-4 hover:bg-[var(--color-surface-2)] transition-colors group">
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        <FolderSearch
                          size={18}
                          className={isCurrent ? "text-[var(--color-accent)] shrink-0" : "text-[var(--color-text-tertiary)] shrink-0"}
                        />
                        <span className="font-mono text-sm truncate select-all text-[var(--color-text-primary)]">{dir}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--color-accent)]/15 text-[var(--color-accent-strong)] border border-[var(--color-accent)]/30 shrink-0">
                            Active Project
                          </span>
                        )}
                      </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenWorkspace && (
                        <button
                          type="button"
                          onClick={() => onOpenWorkspace(dir)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] rounded-md transition-colors cursor-pointer mr-1"
                          title="Inspect this workspace directly in Entropy"
                        >
                          <ArrowUpRight size={14} />
                          <span>Inspect</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => EntropyApiClient.openInExplorer(dir)}
                        className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] rounded-md transition-colors cursor-pointer"
                        title="Open in Windows File Explorer"
                      >
                        <FolderOpen size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleChangeDir(dir)}
                        className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] rounded-md transition-colors cursor-pointer"
                        title="Change folder in File Explorer"
                      >
                        <RefreshCw size={15} />
                      </button>

                      <button 
                        type="button"
                        onClick={() => setDirToDelete(dir)}
                        className="p-1.5 text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors cursor-pointer"
                        title="Remove directory"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    </li>
                  );
                })}
              </ul>
            )}
            
            <div className="p-4 bg-[var(--color-surface-1)] border-t border-[var(--color-border)] flex items-center justify-between">
              <button 
                type="button"
                onClick={handleAddDir}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-primary)] transition-colors cursor-pointer"
              >
                <FolderOpen size={16} className="text-[var(--color-accent)]" />
                <span>Browse Folder in File Explorer…</span>
              </button>
              <span className="text-xs text-[var(--color-text-tertiary)]">Opens native Windows folder picker</span>
            </div>
          </div>

          <div className="mt-3 px-1 text-xs text-[var(--color-text-tertiary)] flex items-center gap-2">
            <span className="font-semibold text-[var(--color-text-secondary)]">Tip:</span>
            <span>If you only want Entropy to monitor a specific workspace, remove parent folders (like Desktop) and keep only your target directory.</span>
          </div>
        </section>

        {/* AI Workspace Advisor Section */}
        <section className="max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bot size={22} className="text-[var(--color-accent)]" />
              <h2 className="text-xl font-medium">AI Workspace Advisor</h2>
            </div>
            {saveSuccessNotice && (
              <span className="text-xs font-medium text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md animate-in fade-in">
                <CheckCircle2 size={13} />
                <span>Settings Saved</span>
              </span>
            )}
          </div>

          <p className="text-[var(--color-text-secondary)] text-sm mb-4">
            Configure the AI backend for intelligent workspace health scores, non-destructive safety checks, and developer Q&amp;A.
          </p>

          {/* Provider Selection Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {/* Rules */}
            <button
              type="button"
              onClick={() => handleUpdateAiConfig({ provider: 'rules' })}
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                aiConfig.provider === 'rules'
                  ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)] shadow-sm'
                  : 'bg-[var(--color-surface-1)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-400" />
                  <span className="font-semibold text-sm text-[var(--color-text-primary)]">Offline Rules</span>
                </div>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Default
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                100% offline, deterministic safety checks. Zero network traffic, zero API keys required.
              </p>
            </button>

            {/* Groq Cloud */}
            <button
              type="button"
              onClick={() => handleUpdateAiConfig({ provider: 'groq' })}
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                aiConfig.provider === 'groq'
                  ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)] shadow-sm'
                  : 'bg-[var(--color-surface-1)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-400" />
                  <span className="font-semibold text-sm text-[var(--color-text-primary)]">Groq Cloud</span>
                </div>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Free Tier
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                Ultra-fast cloud inference with Llama 3.3 70B &amp; 8B. Requires a free Groq API key.
              </p>
            </button>

            {/* Local Ollama */}
            <button
              type="button"
              onClick={() => handleUpdateAiConfig({ provider: 'ollama' })}
              className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
                aiConfig.provider === 'ollama'
                  ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)] shadow-sm'
                  : 'bg-[var(--color-surface-1)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu size={18} className="text-sky-400" />
                  <span className="font-semibold text-sm text-[var(--color-text-primary)]">Local Ollama</span>
                </div>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  Localhost
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                100% private local LLM running on your PC (localhost:11434). Zero data leaves your device.
              </p>
            </button>
          </div>

          {/* Provider Specific Settings Box */}
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl p-5 space-y-4">
            {aiConfig.provider === 'rules' && (
              <div className="flex items-start gap-3">
                <ShieldCheck size={20} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">Offline Rules Engine is Active</h4>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                    Evaluates repository cleanliness, uncommitted changes, running dev processes, and project lockfiles instantly. Safe, zero latency, and always available without internet connection.
                  </p>
                </div>
              </div>
            )}

            {aiConfig.provider === 'groq' && (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                      Groq API Key
                    </label>
                    <a
                      href="https://console.groq.com/keys"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>Get Free API Key</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showGroqKey ? 'text' : 'password'}
                      value={aiConfig.groq_api_key}
                      onChange={(e) => handleUpdateAiConfig({ groq_api_key: e.target.value })}
                      placeholder="gsk_..."
                      className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)] pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGroqKey(!showGroqKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] cursor-pointer"
                    >
                      {showGroqKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1.5">
                    Your key is stored locally in <code className="text-xs font-mono text-[var(--color-text-secondary)]">~/.entropy/config.json</code> and never shared.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5">
                    Model
                  </label>
                  <select
                    value={aiConfig.groq_model}
                    onChange={(e) => handleUpdateAiConfig({ groq_model: e.target.value })}
                    className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-3.5 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] cursor-pointer"
                  >
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Recommended, deepest reasoning)</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Ultra-fast, lowest latency)</option>
                  </select>
                </div>
              </div>
            )}

            {aiConfig.provider === 'ollama' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5">
                    Ollama Server URL
                  </label>
                  <input
                    type="text"
                    value={aiConfig.ollama_url}
                    onChange={(e) => handleUpdateAiConfig({ ollama_url: e.target.value })}
                    placeholder="http://localhost:11434"
                    className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1.5">
                    Ensure Ollama is running locally on your machine (<code className="text-xs font-mono">ollama serve</code>).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5">
                    Model Tag
                  </label>
                  <input
                    type="text"
                    value={aiConfig.ollama_model}
                    onChange={(e) => handleUpdateAiConfig({ ollama_model: e.target.value })}
                    placeholder="llama3.2"
                    className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg px-3.5 py-2 text-xs font-mono text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1.5">
                    e.g. <code className="text-xs font-mono">llama3.2</code>, <code className="text-xs font-mono">llama3.1</code>, <code className="text-xs font-mono">mistral</code>, or <code className="text-xs font-mono">codellama</code>.
                  </p>
                </div>
              </div>
            )}

            {/* Test Connection Footer */}
            <div className="pt-3 border-t border-[var(--color-border-subtle)] flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleTestAiConnection}
                disabled={testingAi}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-primary)] transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw size={13} className={testingAi ? 'animate-spin' : ''} />
                <span>{testingAi ? 'Testing Connection...' : 'Test Connection'}</span>
              </button>

              {testResult && (
                <div
                  className={`text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-md border ${
                    testResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
                  }`}
                >
                  {testResult.success ? <CheckCircle2 size={13} className="shrink-0" /> : <AlertCircle size={13} className="shrink-0" />}
                  <span className="truncate max-w-sm">{testResult.message}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="max-w-3xl">
          <div className="flex items-center gap-2 mb-6">
            <Info size={22} className="text-[var(--color-text-secondary)]" />
            <h2 className="text-xl font-medium">About</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-accent)] flex items-center justify-center text-white">
                  <Monitor size={24} />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Entropy Desktop</h3>
                  <div className="text-sm text-[var(--color-text-secondary)]">Version 0.1.0</div>
                </div>
              </div>
              <p className="text-[var(--color-text-secondary)] text-sm mt-4">
                The smart developer workspace management tool. Keep your machine fast and clean.
              </p>
            </div>

            <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl p-6 flex flex-col justify-center">
              <a 
                href="https://github.com/wacim-abdellli/entropy" 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer text-[var(--color-text-primary)] mb-2"
              >
                <GitBranch size={20} />
                <span className="font-medium">View on GitHub</span>
              </a>
              <div className="text-xs text-[var(--color-text-tertiary)] px-3">
                Engine: Entropy Core
              </div>
            </div>
          </div>
        </section>

      </div>

      {/* Remove Directory Confirmation Modal */}
      {dirToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                  Remove Scan Directory?
                </h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                  Are you sure you want to remove this folder from scan directories?
                </p>
                <div className="mt-2 p-2 rounded bg-[var(--color-surface-2)] border border-[var(--color-border)] text-xs font-mono text-[var(--color-text-primary)] break-all select-all">
                  {dirToDelete}
                </div>
                <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2">
                  This only stops Entropy from monitoring this directory. No project files will be deleted from your disk.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--color-border-subtle)]">
              <button
                type="button"
                onClick={() => setDirToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = dirToDelete;
                  setDirToDelete(null);
                  handleRemoveDir(target);
                }}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors cursor-pointer shadow-sm"
              >
                Remove Directory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

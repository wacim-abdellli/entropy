import React, { useState } from 'react';
import { 
  Settings, 
  FolderSearch, 
  Info, 
  GitBranch, 
  Monitor,
  FolderOpen,
  ArrowUpRight,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { EntropyApiClient } from '../services/api';

interface SettingsViewProps {
  scanRoots?: string[];
  onScanRootsChange?: (roots: string[]) => void;
  onOpenWorkspace?: (path: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  scanRoots,
  onScanRootsChange,
  onOpenWorkspace,
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
          <h1 className="text-3xl font-semibold">Settings</h1>
        </div>
        <p className="text-[var(--color-text-secondary)] text-sm">
          Configure workspace scanning directories and app preferences.
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-12">
        
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
                {directories.map((dir) => (
                  <li key={dir} className="flex items-center justify-between p-4 hover:bg-[var(--color-surface-2)] transition-colors group">
                    <div className="flex items-center gap-3 min-w-0 pr-4">
                      <FolderSearch size={18} className="text-[var(--color-text-tertiary)] shrink-0" />
                      <span className="font-mono text-sm truncate select-all text-[var(--color-text-primary)]">{dir}</span>
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
                        onClick={() => handleRemoveDir(dir)}
                        className="p-1.5 text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors cursor-pointer"
                        title="Remove directory"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                ))}
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
    </div>
  );
};

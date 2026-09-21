import React, { useState } from 'react';
import { 
  Settings, 
  FolderSearch, 
  Info, 
  X, 
  Plus,
  GitBranch,
  Monitor
} from 'lucide-react';

interface SettingsViewProps {
  scanRoots?: string[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({ scanRoots = ['C:\\Users\\pc\\Desktop'] }) => {
  const [directories, setDirectories] = useState<string[]>(scanRoots);

  const handleRemoveDir = (dirToRemove: string) => {
    setDirectories(directories.filter(dir => dir !== dirToRemove));
  };

  const handleAddDir = () => {
    // In a real app, this would open a directory picker dialog
    const newDir = prompt("Enter directory path to scan:");
    if (newDir && !directories.includes(newDir)) {
      setDirectories([...directories, newDir]);
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
          Configure workspace scanning and app preferences.
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-12">
        
        {/* Scan Directories Section */}
        <section className="max-w-3xl">
          <div className="flex items-center gap-2 mb-6">
            <FolderSearch size={22} className="text-[var(--color-text-secondary)]" />
            <h2 className="text-xl font-medium">Scan Directories</h2>
          </div>
          <p className="text-[var(--color-text-secondary)] text-sm mb-6">
            Entropy will automatically discover and monitor workspaces within these directories.
          </p>

          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl overflow-hidden">
            {directories.length === 0 ? (
              <div className="p-6 text-center text-[var(--color-text-secondary)]">
                No directories configured for scanning.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--color-border)]">
                {directories.map((dir) => (
                  <li key={dir} className="flex items-center justify-between p-4 hover:bg-[var(--color-surface-2)] transition-colors group">
                    <div className="flex items-center gap-3">
                      <FolderSearch size={18} className="text-[var(--color-text-tertiary)]" />
                      <span className="font-mono text-sm">{dir}</span>
                    </div>
                    <button 
                      onClick={() => handleRemoveDir(dir)}
                      className="p-1.5 text-[var(--color-text-tertiary)] hover:text-red-400 hover:bg-red-400/10 rounded-md opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title="Remove directory"
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            
            <div className="p-4 bg-[var(--color-surface-1)] border-t border-[var(--color-border)]">
              <button 
                onClick={handleAddDir}
                className="flex items-center gap-2 text-sm font-medium text-[var(--color-accent)] hover:text-opacity-80 transition-colors cursor-pointer"
              >
                <Plus size={16} />
                Add Directory
              </button>
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
    </div>
  );
};

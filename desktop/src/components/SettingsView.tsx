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
  CheckCircle2,
} from 'lucide-react';
import { EntropyApiClient } from '../services/api';
import { WorkspaceSummary, UserProfileInfo } from '../types/entropy';

interface SettingsViewProps {
  scanRoots?: string[];
  onScanRootsChange?: (roots: string[]) => void;
  workspaces?: WorkspaceSummary[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  scanRoots,
  onScanRootsChange,
  workspaces,
}) => {
  const [directories, setDirectories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('entropy_scan_roots');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return scanRoots && scanRoots.length > 0 ? scanRoots : [];
  });
  const [dirToDelete, setDirToDelete] = useState<string | null>(null);
  const [saveRootsNotice, setSaveRootsNotice] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfileInfo | null>(null);

  useEffect(() => {
    if (scanRoots && scanRoots.length > 0) {
      setDirectories(scanRoots);
    }
  }, [scanRoots]);

  useEffect(() => {
    EntropyApiClient.getScanRoots().then((roots) => {
      if (Array.isArray(roots) && roots.length > 0) {
        setDirectories(roots);
      }
    });
    EntropyApiClient.getUserProfile().then((profile) => {
      if (profile) {
        setUserProfile(profile);
      }
    });
  }, []);

  const saveAndNotify = async (updated: string[]) => {
    setDirectories(updated);
    try {
      localStorage.setItem('entropy_scan_roots', JSON.stringify(updated));
    } catch {}
    await EntropyApiClient.saveScanRoots(updated);
    onScanRootsChange?.(updated);
    setSaveRootsNotice(true);
    setTimeout(() => setSaveRootsNotice(false), 2500);
  };

  const handleRemoveDir = (dirToRemove: string) => {
    const normToRemove = dirToRemove.toLowerCase().replace(/[\\/]+$/, '');
    const updated = directories.filter(
      dir => dir.toLowerCase().replace(/[\\/]+$/, '') !== normToRemove
    );
    void saveAndNotify(updated);
  };

  const handleAddDir = async () => {
    try {
      const selected = await EntropyApiClient.pickFolder();
      if (selected) {
        const selNorm = selected.toLowerCase().replace(/[\\/]+$/, '');
        if (!directories.some(d => d.toLowerCase().replace(/[\\/]+$/, '') === selNorm)) {
          const updated = [...directories, selected];
          void saveAndNotify(updated);
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
        void saveAndNotify(updated);
      }
    } catch (err) {
      console.error('Failed to change directory:', err);
    }
  };

  const handleApplyPreset = (presetDirs: string[]) => {
    const seen = new Set(directories.map(d => d.toLowerCase().replace(/[\\/]+$/, '')));
    const toAdd = presetDirs.filter(d => !seen.has(d.toLowerCase().replace(/[\\/]+$/, '')));
    if (toAdd.length > 0) {
      void saveAndNotify([...directories, ...toAdd]);
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 space-y-12 w-full max-w-full min-w-0">
        
        {/* Scan Directories Section */}
        <section className="w-full max-w-6xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderSearch size={22} className="text-[var(--color-text-secondary)]" />
              <h2 className="text-xl font-medium">Scan Directories</h2>
            </div>
            <div className="flex items-center gap-2">
              {saveRootsNotice && (
                <span className="text-xs font-medium text-[var(--color-success)] flex items-center gap-1.5 bg-[var(--color-success-bg)] border border-[var(--color-success-border)] px-2.5 py-1 rounded-md animate-in fade-in">
                  <CheckCircle2 size={13} />
                  <span>Config Saved to Disk</span>
                </span>
              )}
              <button 
                type="button"
                onClick={handleAddDir}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium transition-opacity cursor-pointer shadow-sm"
              >
                <FolderOpen size={14} />
                <span>Add Directory</span>
              </button>
            </div>
          </div>

          <p className="text-[var(--color-text-secondary)] text-sm mb-4">
            Entropy automatically discovers and monitors projects located inside these directories. Changes are permanently saved to <code className="text-xs font-mono text-[var(--color-text-primary)]">~/.entropy/config.json</code>.
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
                  const normDir = dir.toLowerCase().replace(/[\\/]+$/, '');
                  const projectCount = (workspaces || []).filter((w) => {
                    const normW = w.path.toLowerCase().replace(/[\\/]+$/, '');
                    return normW === normDir || normW.startsWith(normDir + '\\') || normW.startsWith(normDir + '/');
                  }).length;

                  return (
                    <li key={dir} className="flex items-center justify-between p-4 hover:bg-[var(--color-surface-2)] transition-colors group">
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        <FolderSearch
                          size={18}
                          className="text-[var(--color-accent)] shrink-0"
                        />
                        <span className="font-mono text-sm truncate select-all text-[var(--color-text-primary)]">{dir}</span>
                        <span className="text-[11px] font-mono text-[var(--color-text-tertiary)] bg-[var(--color-surface-2)] px-2 py-0.5 rounded border border-[var(--color-border-subtle)] shrink-0">
                          {projectCount} {projectCount === 1 ? 'project' : 'projects'} found
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => EntropyApiClient.openInExplorer(dir)}
                          className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-3)] rounded-md transition-colors cursor-pointer"
                          title="Open in Windows File Explorer"
                          aria-label={`Open ${dir} in File Explorer`}
                        >
                          <FolderOpen size={16} />
                        </button>

                        <button 
                          type="button"
                          onClick={() => setDirToDelete(dir)}
                          className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)] rounded-md transition-colors cursor-pointer"
                          title="Remove folder from scan directories"
                          aria-label={`Remove scan directory ${dir}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Quick Scan Presets */}
          <div className="mt-4 p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Recommended Developer Presets
              </span>
              <span className="text-[11px] text-[var(--color-text-tertiary)]">One-click configuration</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  const devRoots = userProfile?.standard_dev_roots && userProfile.standard_dev_roots.length > 0
                    ? userProfile.standard_dev_roots
                    : [userProfile?.desktop || 'C:\\Users\\pc\\Desktop'];
                  void saveAndNotify(devRoots);
                }}
                className="p-2.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] text-left text-xs transition-colors cursor-pointer space-y-1"
              >
                <div className="font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                  <FolderSearch size={14} className="text-[var(--color-accent)]" />
                  <span>Standard Dev Roots</span>
                </div>
                <div className="text-[11px] text-[var(--color-text-tertiary)] truncate">Desktop, repos, projects, dev</div>
              </button>

              {userProfile?.desktop && (
                <button
                  type="button"
                  onClick={() => handleApplyPreset([userProfile.desktop])}
                  className="p-2.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] text-left text-xs transition-colors cursor-pointer space-y-1"
                >
                  <div className="font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                    <FolderOpen size={14} className="text-[var(--color-accent)]" />
                    <span>Desktop</span>
                  </div>
                  <div className="text-[11px] text-[var(--color-text-tertiary)] truncate font-mono">{userProfile.desktop}</div>
                </button>
              )}

              {userProfile?.documents && (
                <button
                  type="button"
                  onClick={() => handleApplyPreset([userProfile.documents])}
                  className="p-2.5 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-3)] border border-[var(--color-border)] text-left text-xs transition-colors cursor-pointer space-y-1"
                >
                  <div className="font-semibold text-[var(--color-text-primary)] flex items-center gap-1.5">
                    <FolderGit2 size={14} className="text-[var(--color-accent)]" />
                    <span>Documents</span>
                  </div>
                  <div className="text-[11px] text-[var(--color-text-tertiary)] truncate font-mono">{userProfile.documents}</div>
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 px-1 text-xs text-[var(--color-text-tertiary)] flex items-center gap-2">
            <span className="font-semibold text-[var(--color-text-secondary)]">Permanent Storage:</span>
            <span>Scan roots are saved directly to <code className="font-mono text-[var(--color-text-secondary)]">~/.entropy/config.json</code> and will never reset back to Desktop unless you re-add it.</span>
          </div>
        </section>

        {/* About Section */}
        <section className="w-full max-w-6xl">
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
                  <div className="text-sm text-[var(--color-text-secondary)]">Version 0.2.6</div>
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-scan-dir-title"
          onKeyDown={(e) => { if (e.key === 'Escape') setDirToDelete(null); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] flex items-center justify-center shrink-0">
                <Trash2 size={20} className="text-[var(--color-danger)]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="remove-scan-dir-title" className="text-base font-semibold text-[var(--color-text-primary)]">
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
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-danger)] hover:opacity-90 text-white transition-opacity cursor-pointer shadow-sm"
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

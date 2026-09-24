import React, { Component, ErrorInfo, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { Sidebar, ActiveNav } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { WorkspaceView } from './components/WorkspaceView';
import { SystemView } from './components/SystemView';
import { CleanupView } from './components/CleanupView';
import { SettingsView } from './components/SettingsView';
import { CommandPalette } from './components/CommandPalette';
import { EntropyApiClient } from './services/api';
import {
  EnvironmentOverview,
  WorkspaceInspection,
  WorkspaceSummary,
} from './types/entropy';

/* ───────────────────────── Error Boundary ───────────────────────── */

interface ErrorBoundaryProps { children: ReactNode; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errorDetails(err: unknown): string {
  return err instanceof Error ? (err.stack || err.message) : String(err);
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled view render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--color-surface-0)] text-center space-y-4">
          <div className="bg-[var(--color-surface-2)] border border-rose-500/40 rounded-xl p-6 max-w-lg w-full space-y-3 shadow-lg">
            <h2 className="text-base font-semibold text-rose-400">Something went wrong</h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              An unexpected error occurred while rendering this view.
            </p>
            <pre className="p-3 bg-[var(--color-surface-3)] text-rose-300 font-mono text-xs rounded text-left overflow-auto max-h-40">
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-[var(--color-accent)] hover:opacity-90 text-white rounded-lg text-sm font-medium cursor-pointer transition-opacity"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ───────────────────────── Main App ───────────────────────── */

export function App() {
  const [activeNav, setActiveNav] = useState<ActiveNav>('home');
  const [overview, setOverview] = useState<EnvironmentOverview | null>(() => {
    try {
      const cached = localStorage.getItem('entropy_cached_overview');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [inspection, setInspection] = useState<WorkspaceInspection | null>(null);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | null>(null);
  const [currentWorkspacePath, setCurrentWorkspacePath] = useState<string | null>(() => {
    try {
      return localStorage.getItem('entropy_current_workspace');
    } catch {
      return null;
    }
  });
  const [scanRoots, setScanRoots] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('entropy_scan_roots');
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return ['C:\\Users\\pc\\Desktop'];
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('entropy_cached_overview');
    } catch {
      return true;
    }
  });
  const [error, setError] = useState<{
    title: string;
    message: string;
    details?: string;
    onRetry?: () => void;
  } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type?: 'info' | 'success' } | null>(null);

  const showToast = useCallback((message: string, type: 'info' | 'success' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  const currentWorkspace = useMemo<WorkspaceSummary | null>(() => {
    const list = overview?.workspaces || [];
    if (!list.length && !currentWorkspacePath) return null;

    if (currentWorkspacePath) {
      const norm = currentWorkspacePath.toLowerCase().replace(/[\\/]+$/, '');
      const found = list.find((w) => w.path.toLowerCase().replace(/[\\/]+$/, '') === norm);
      if (found) return found;

      const name = currentWorkspacePath.split(/[\\/]/).filter(Boolean).pop() || currentWorkspacePath;
      return {
        id: `workspace:${currentWorkspacePath}`,
        name,
        path: currentWorkspacePath,
        project_type: 'custom',
        total_size_bytes: null,
        last_modified: null,
        state_label: 'Selected',
        state_category: 'neutral',
        git_branch: null,
        git_remote: null,
        last_commit_timestamp: null,
        has_uncommitted_changes: false,
        process_count: 0,
      };
    }

    return list[0] || null;
  }, [overview?.workspaces, currentWorkspacePath]);

  const loadEnvironment = useCallback(async (customRoots?: string[]) => {
    setIsLoading(true);
    setError(null);
    try {
      const rootsToScan = customRoots !== undefined ? customRoots : scanRoots;
      const data = await EntropyApiClient.scanEnvironment(rootsToScan);
      setOverview(data);
      try {
        localStorage.setItem('entropy_cached_overview', JSON.stringify(data));
      } catch {}
    } catch (err: unknown) {
      console.error('Failed to load environment:', err);
      setError({
        title: 'Engine unavailable',
        message: 'Could not connect to the local Entropy engine.',
        details: errorMessage(err),
        onRetry: () => loadEnvironment(customRoots),
      });
    } finally {
      setIsLoading(false);
    }
  }, [scanRoots]);

  const handleSelectWorkspace = useCallback(async (path: string) => {
    setSelectedWorkspacePath(path);
    setCurrentWorkspacePath(path);
    try {
      localStorage.setItem('entropy_current_workspace', path);
    } catch {}
    setActiveNav('home');
    setIsLoading(true);
    setError(null);
    try {
      const data = await EntropyApiClient.inspectWorkspace(path);
      setInspection(data);
    } catch (err: unknown) {
      console.error('Failed to inspect workspace:', err);
      setError({
        title: 'Inspection failed',
        message: errorMessage(err) || `Could not inspect workspace at '${path}'.`,
        details: errorDetails(err),
        onRetry: () => handleSelectWorkspace(path),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshCurrentContext = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextOverview, nextInspection] = await Promise.all([
        EntropyApiClient.scanEnvironment(scanRoots),
        selectedWorkspacePath
          ? EntropyApiClient.inspectWorkspace(selectedWorkspacePath)
          : Promise.resolve(null),
      ]);

      setOverview(nextOverview);
      try {
        localStorage.setItem('entropy_cached_overview', JSON.stringify(nextOverview));
      } catch {}
      if (nextInspection) {
        setInspection(nextInspection);
      }
    } catch (err: unknown) {
      console.error('Failed to refresh current context:', err);
      setError({
        title: 'Refresh failed',
        message: 'The action completed, but Entropy could not refresh the latest machine state.',
        details: errorMessage(err),
        onRetry: () => refreshCurrentContext(),
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedWorkspacePath, scanRoots]);

  // Initial load
  useEffect(() => {
    loadEnvironment();
  }, [loadEnvironment]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleInspectFolder = async () => {
    const folder = await EntropyApiClient.pickFolder();
    if (!folder) return;

    const folderNorm = folder.toLowerCase().replace(/[\\/]+$/, '');
    const name = folder.split(/[\\/]/).filter(Boolean).pop() || folder;

    // 1. Immediately set active project state & persist
    setCurrentWorkspacePath(folder);
    try {
      localStorage.setItem('entropy_current_workspace', folder);
    } catch {}

    // 2. Real-time optimistic insertion into overview list
    const optimistic: WorkspaceSummary = {
      id: `workspace:${folder}`,
      name,
      path: folder,
      project_type: 'detecting...',
      total_size_bytes: 0,
      last_modified: Date.now() / 1000,
      state_label: 'Ready',
      state_category: 'neutral',
      git_branch: null,
      git_remote: null,
      last_commit_timestamp: null,
      has_uncommitted_changes: false,
      process_count: 0,
    };

    setOverview((prev) => {
      const currentList = prev?.workspaces || [];
      const alreadyInList = currentList.some(
        (w) => w.path.toLowerCase().replace(/[\\/]+$/, '') === folderNorm
      );
      const nextWorkspaces = alreadyInList ? currentList : [optimistic, ...currentList];

      if (!prev) {
        return {
          summary: {
            total_workspaces: 1,
            active_count: 0,
            attention_count: 0,
            dormant_count: 0,
            paused_count: 0,
            neutral_count: 1,
            total_processes: 0,
            total_runtimes: 0,
            total_containers: 0,
            total_caches: 0,
          },
          workspaces: [optimistic],
          system: {
            runtimes: [],
            processes: [],
            containers: [],
            caches: [],
            artifacts: [],
          },
          findings: [],
          metadata: {
            scan_duration_ms: 0,
            engine_version: '0.1.0',
            timestamp: Date.now() / 1000,
            hostname: '',
            scan_roots: [folder],
          },
        };
      }

      return {
        ...prev,
        summary: {
          ...prev.summary,
          total_workspaces: nextWorkspaces.length,
          neutral_count: (prev.summary.neutral_count || 0) + (alreadyInList ? 0 : 1),
        },
        workspaces: nextWorkspaces,
      };
    });

    showToast(`Added workspace "${name}"`);

    // 3. Update scan roots state and localStorage
    const alreadyExistsInRoots = scanRoots.some(
      (r) => r.toLowerCase().replace(/[\\/]+$/, '') === folderNorm
    );
    const updatedRoots = alreadyExistsInRoots ? scanRoots : [...scanRoots, folder];
    setScanRoots(updatedRoots);
    try {
      localStorage.setItem('entropy_scan_roots', JSON.stringify(updatedRoots));
    } catch {}

    // 4. Background refresh of real metrics
    loadEnvironment(updatedRoots);

    // If user was already inspecting a workspace or clicked "Open folder…", switch inspection
    if (selectedWorkspacePath) {
      await handleSelectWorkspace(folder);
    }
  };

  const handleBackToOverview = () => {
    setError(null);
    setSelectedWorkspacePath(null);
    setInspection(null);
  };

  /* ── Render the active view ── */
  const renderMainContent = () => {
    // Error state
    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--color-surface-0)]">
          <div className="max-w-md w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-xl p-8 text-center space-y-4 shadow-lg">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{error.title}</h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{error.message}</p>
            {error.details && (
              <details className="text-left bg-[var(--color-surface-3)] border border-[var(--color-border)] rounded-lg p-3 text-xs font-mono text-[var(--color-text-tertiary)]">
                <summary className="cursor-pointer text-[var(--color-text-secondary)] font-semibold select-none">Details</summary>
                <pre className="mt-2 whitespace-pre-wrap break-all text-rose-400 max-h-36 overflow-y-auto">{error.details}</pre>
              </details>
            )}
            <div className="flex items-center justify-center gap-3 pt-2">
              {error.onRetry && (
                <button
                  type="button"
                  onClick={error.onRetry}
                  className="px-5 py-2.5 bg-[var(--color-accent)] hover:opacity-90 text-white rounded-lg text-sm font-medium transition-opacity cursor-pointer"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={handleBackToOverview}
                className="px-5 py-2.5 bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] text-[var(--color-text-primary)] rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Workspace detail view (when a workspace is selected from Home)
    if (activeNav === 'home' && selectedWorkspacePath && inspection) {
      return (
        <WorkspaceView
          inspection={inspection}
          onBack={handleBackToOverview}
          onReinspect={() => handleSelectWorkspace(selectedWorkspacePath)}
          isLoading={isLoading}
          onActionComplete={refreshCurrentContext}
          onOpenFolder={handleInspectFolder}
          onNavigateToSettings={() => setActiveNav('settings')}
        />
      );
    }

    // Loading a workspace inspection
    if (activeNav === 'home' && selectedWorkspacePath && isLoading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[var(--color-surface-0)]">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-[var(--color-accent-strong)] animate-spin" />
          </div>
          <div className="space-y-1 text-center">
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">Inspecting Workspace</div>
            <div className="text-sm text-[var(--color-text-secondary)]">Scanning git, processes, and dependencies…</div>
          </div>
        </div>
      );
    }

    // Home — Overview
    if (activeNav === 'home') {
      return (
        <OverviewView
          overview={overview}
          onRefresh={() => loadEnvironment(scanRoots)}
          isLoading={isLoading}
          onSelectWorkspace={handleSelectWorkspace}
          onInspectFolder={handleInspectFolder}
          currentWorkspace={currentWorkspace}
        />
      );
    }

    // Cleanup page
    if (activeNav === 'cleanup') {
      if (overview) {
        return (
          <CleanupView
            overview={overview}
            onRefresh={refreshCurrentContext}
            currentWorkspace={currentWorkspace}
          />
        );
      }
      return null;
    }

    // System Details (reuses existing SystemView)
    if (activeNav === 'details') {
      if (overview) {
        return (
          <SystemView
            initialTab="processes"
            processes={overview.system?.processes || []}
            runtimes={overview.system?.runtimes || []}
            containers={overview.system?.containers || []}
            caches={overview.system?.caches || []}
            onActionComplete={refreshCurrentContext}
            currentWorkspace={currentWorkspace}
          />
        );
      }
      return null;
    }

    // Settings
    if (activeNav === 'settings') {
      return (
        <SettingsView
          scanRoots={scanRoots}
          onScanRootsChange={(newRoots) => {
            setScanRoots(newRoots);
            try {
              localStorage.setItem('entropy_scan_roots', JSON.stringify(newRoots));
            } catch {}
            loadEnvironment(newRoots);
          }}
          onOpenWorkspace={(path) => {
            handleSelectWorkspace(path);
          }}
          currentWorkspace={currentWorkspace}
        />
      );
    }

    return null;
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--color-surface-0)] text-[var(--color-text-primary)] font-sans">
      <Sidebar
        activeNav={activeNav}
        onSelectNav={(nav) => {
          setActiveNav(nav);
          setError(null);
          setSelectedWorkspacePath(null);
          setInspection(null);
        }}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onRefresh={() => loadEnvironment(scanRoots)}
        isLoading={isLoading}
        lastScanTime={overview?.metadata?.timestamp ?? null}
        currentWorkspace={currentWorkspace}
        onSelectWorkspace={handleSelectWorkspace}
        onBackToOverview={handleBackToOverview}
      />

      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <ErrorBoundary>
          {renderMainContent()}
        </ErrorBoundary>
      </main>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        overview={overview}
        onSelectWorkspace={handleSelectWorkspace}
        onNavigate={(nav) => {
          setActiveNav(nav as ActiveNav);
          setSelectedWorkspacePath(null);
        }}
      />

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)] shadow-2xl text-xs font-medium text-[var(--color-text-primary)] animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-[var(--color-success)] shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;

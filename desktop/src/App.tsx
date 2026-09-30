import React, { Component, ErrorInfo, ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, CheckCircle2, Info, X } from 'lucide-react';
import { Sidebar, ActiveNav } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { CommandPalette } from './components/CommandPalette';
import { EntropyApiClient } from './services/api';
import {
  EnvironmentOverview,
  WorkspaceInspection,
  WorkspaceSummary,
} from './types/entropy';

// Route-level code-splitting with React.lazy
const WorkspaceView = React.lazy(() => import('./components/WorkspaceView').then((m) => ({ default: m.WorkspaceView })));
const SystemView = React.lazy(() => import('./components/SystemView').then((m) => ({ default: m.SystemView })));
const CleanupView = React.lazy(() => import('./components/CleanupView').then((m) => ({ default: m.CleanupView })));
const SettingsView = React.lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));

const ViewLoadingFallback = (
  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[var(--color-surface-0)] text-center space-y-3">
    <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] flex items-center justify-center shadow-xs">
      <RefreshCw className="w-4 h-4 text-[var(--color-accent-strong)] animate-spin" />
    </div>
    <span className="text-xs text-[var(--color-text-tertiary)] font-medium">Loading view…</span>
  </div>
);

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
          <div className="bg-[var(--color-surface-2)] border border-[var(--color-danger-border)] rounded-xl p-6 max-w-lg w-full space-y-3 shadow-lg">
            <h2 className="text-base font-semibold text-[var(--color-danger)]">Something went wrong</h2>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              An unexpected error occurred while rendering this view.
            </p>
            <pre className="p-3 bg-[var(--color-surface-3)] text-[var(--color-danger)] font-mono text-xs rounded text-left overflow-auto max-h-40">
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
  const [activeNav, setActiveNav] = useState<ActiveNav>(() => {
    try {
      const saved = localStorage.getItem('entropy_active_nav');
      if (saved && ['home', 'cleanup', 'details', 'settings'].includes(saved)) {
        return saved as ActiveNav;
      }
    } catch {}
    return 'home';
  });
  const [overview, setOverview] = useState<EnvironmentOverview | null>(() => {
    try {
      const cached = localStorage.getItem('entropy_cached_overview');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [inspection, setInspection] = useState<WorkspaceInspection | null>(() => {
    try {
      const cached = localStorage.getItem('entropy_cached_inspection');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | null>(() => {
    try {
      return (
        localStorage.getItem('entropy_selected_workspace') ||
        localStorage.getItem('entropy_current_workspace')
      );
    } catch {
      return null;
    }
  });
  const [_currentWorkspacePath, setCurrentWorkspacePath] = useState<string | null>(() => {
    try {
      return (
        localStorage.getItem('entropy_current_workspace') ||
        localStorage.getItem('entropy_selected_workspace')
      );
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
    return [];
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
    if (!list.length || !selectedWorkspacePath) return null;

    const norm = selectedWorkspacePath.toLowerCase().replace(/[\\/]+$/, '');
    const found = list.find((w) => w.path.toLowerCase().replace(/[\\/]+$/, '') === norm);
    if (found) return found;

    const name = selectedWorkspacePath.split(/[\\/]/).filter(Boolean).pop() || selectedWorkspacePath;
    return {
      id: `workspace:${selectedWorkspacePath}`,
      name,
      path: selectedWorkspacePath,
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
  }, [overview?.workspaces, selectedWorkspacePath]);

  const loadEnvironment = useCallback(
    async function fetchEnv(customRoots?: string[], attempt = 1): Promise<void> {
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
        if (attempt < 2) {
          console.warn(`Initial environment scan attempt ${attempt} failed, retrying in 400ms...`, err);
          await new Promise((r) => setTimeout(r, 400));
          return fetchEnv(customRoots, attempt + 1);
        }
        console.error('Failed to load environment:', err);
        setError({
          title: 'Engine unavailable',
          message: 'Could not connect to the local Entropy engine.',
          details: errorMessage(err),
          onRetry: () => {
            void fetchEnv(customRoots);
          },
        });
      } finally {
        setIsLoading(false);
      }
    },
    [scanRoots]
  );

  const handleSelectWorkspace = useCallback(async (path: string) => {
    setSelectedWorkspacePath(path);
    setCurrentWorkspacePath(path);
    try {
      localStorage.setItem('entropy_last_opened_workspace', path);
      localStorage.setItem('entropy_current_workspace', path);
      localStorage.setItem('entropy_selected_workspace', path);
    } catch {}
    void EntropyApiClient.saveLastWorkspace(path);
    setActiveNav('home');
    try {
      localStorage.setItem('entropy_active_nav', 'home');
    } catch {}
    setIsLoading(true);
    setError(null);
    try {
      const data = await EntropyApiClient.inspectWorkspace(path);
      setInspection(data);
      try {
        localStorage.setItem('entropy_cached_inspection', JSON.stringify(data));
      } catch {}
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

  const refreshCurrentContext = useCallback(async function doRefresh() {
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
    }
  }, [selectedWorkspacePath, scanRoots]);

  // Initial load: restore roots, overview, and automatically re-detect last opened workspace
  useEffect(() => {
    let ignore = false;

    async function initializeApp() {
      try {
        const [persistedRoots, lastWs] = await Promise.all([
          EntropyApiClient.getScanRoots(),
          EntropyApiClient.getLastWorkspace(),
        ]);

        if (ignore) return;

        const activeRoots =
          Array.isArray(persistedRoots) && persistedRoots.length > 0 ? persistedRoots : scanRoots;
        if (activeRoots.length > 0) {
          setScanRoots(activeRoots);
        }

        const savedSelectedWs = localStorage.getItem('entropy_selected_workspace');
        const savedCurrentWs =
          localStorage.getItem('entropy_current_workspace') ||
          lastWs ||
          localStorage.getItem('entropy_last_opened_workspace');

        if (savedCurrentWs) {
          setCurrentWorkspacePath(savedCurrentWs);
        }

        // Only restore deep inspection if the user was actually inside a workspace view!
        const shouldInspectWs = Boolean(savedSelectedWs);
        if (shouldInspectWs && savedSelectedWs) {
          setSelectedWorkspacePath(savedSelectedWs);
        } else {
          setSelectedWorkspacePath(null);
        }

        const [data, lastInspection] = await Promise.all([
          EntropyApiClient.scanEnvironment(activeRoots.length > 0 ? activeRoots : undefined),
          shouldInspectWs && savedSelectedWs
            ? EntropyApiClient.inspectWorkspace(savedSelectedWs).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (ignore) return;

        if (data) {
          setOverview(data);
          try {
            localStorage.setItem('entropy_cached_overview', JSON.stringify(data));
          } catch {}
        }

        if (shouldInspectWs && lastInspection) {
          if (!('error' in lastInspection && lastInspection.error)) {
            setInspection(lastInspection);
            try {
              localStorage.setItem('entropy_cached_inspection', JSON.stringify(lastInspection));
            } catch {}
          }
        }
      } catch (err) {
        if (!ignore) {
          setError({
            title: 'Engine unavailable',
            message: 'Could not connect to the local Entropy engine.',
            details: errorMessage(err),
            onRetry: () => {
              void loadEnvironment(scanRoots);
            },
          });
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void initializeApp();

    return () => {
      ignore = true;
    };
  }, []);

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

    // 1. Update scan roots state and persistent config
    const alreadyExistsInRoots = scanRoots.some(
      (r) => r.toLowerCase().replace(/[\\/]+$/, '') === folderNorm
    );
    const updatedRoots = alreadyExistsInRoots ? scanRoots : [...scanRoots, folder];
    setScanRoots(updatedRoots);
    try {
      localStorage.setItem('entropy_scan_roots', JSON.stringify(updatedRoots));
    } catch {}
    void EntropyApiClient.saveScanRoots(updatedRoots);

    // 2. Scan environment with updated roots
    setIsLoading(true);
    showToast(`Scanning "${name}"…`, 'info');

    let newOverview: EnvironmentOverview | null = null;
    try {
      newOverview = await EntropyApiClient.scanEnvironment(updatedRoots);
      setOverview(newOverview);
      try {
        localStorage.setItem('entropy_cached_overview', JSON.stringify(newOverview));
      } catch {}
    } catch (err) {
      console.error('Scan failed:', err);
    } finally {
      setIsLoading(false);
    }

    const workspacesList = newOverview?.workspaces || [];
    const inFolder = workspacesList.filter((w) => {
      const wNorm = w.path.toLowerCase().replace(/[\\/]+$/, '');
      return wNorm === folderNorm || wNorm.startsWith(folderNorm + '\\') || wNorm.startsWith(folderNorm + '/');
    });

    const exactMatch = inFolder.find(
      (w) => w.path.toLowerCase().replace(/[\\/]+$/, '') === folderNorm
    );

    if (exactMatch && inFolder.length === 1) {
      // Single project workspace: open detail view
      await handleSelectWorkspace(folder);
      showToast(`Opened workspace "${name}"`, 'success');
    } else {
      // Scanned directory with multiple projects or empty: stay on Overview and scope to it!
      setSelectedWorkspacePath(null);
      setInspection(null);
      setCurrentWorkspacePath(null);
      void EntropyApiClient.saveLastWorkspace(null);
      try {
        localStorage.setItem('entropy_selected_folder', folder);
        localStorage.removeItem('entropy_selected_workspace');
        localStorage.removeItem('entropy_cached_inspection');
        localStorage.setItem('entropy_active_nav', 'home');
      } catch {}
      setActiveNav('home');
      showToast(
        inFolder.length > 0
          ? `Added folder "${name}" (${inFolder.length} workspace${inFolder.length === 1 ? '' : 's'} found)`
          : `Added folder "${name}" to scanned roots`,
        'success'
      );
    }
  };

  const handleBackToOverview = useCallback(() => {
    setError(null);
    setSelectedWorkspacePath(null);
    setCurrentWorkspacePath(null);
    setInspection(null);
    try {
      localStorage.removeItem('entropy_selected_workspace');
      localStorage.removeItem('entropy_cached_inspection');
    } catch {}
    void EntropyApiClient.saveLastWorkspace(null);
    setActiveNav('home');
    try {
      localStorage.setItem('entropy_active_nav', 'home');
    } catch {}
  }, []);

  const handleViewAllWorkspaces = useCallback(() => {
    setError(null);
    setSelectedWorkspacePath(null);
    setInspection(null);
    setCurrentWorkspacePath(null);
    void EntropyApiClient.saveLastWorkspace(null);
    try {
      localStorage.removeItem('entropy_selected_workspace');
      localStorage.removeItem('entropy_cached_inspection');
      localStorage.setItem('entropy_selected_folder', 'all');
    } catch {}
    setActiveNav('home');
    try {
      localStorage.setItem('entropy_active_nav', 'home');
    } catch {}
  }, []);

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
                <pre className="mt-2 whitespace-pre-wrap break-all text-[var(--color-danger)] max-h-36 overflow-y-auto">{error.details}</pre>
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
          onNavigateToSettings={() => setActiveNav('settings')}
          scanRoots={scanRoots}
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
            isLoading={isLoading}
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
            void EntropyApiClient.saveScanRoots(newRoots);
            loadEnvironment(newRoots);
          }}
          workspaces={overview?.workspaces || []}
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
          try {
            localStorage.setItem('entropy_active_nav', nav);
          } catch {}
          setError(null);
        }}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onRefresh={() => loadEnvironment(scanRoots)}
        isLoading={isLoading}
        lastScanTime={overview?.metadata?.timestamp ?? null}
        currentWorkspace={currentWorkspace}
        totalWorkspacesCount={overview?.workspaces?.length}
        onSelectWorkspace={handleSelectWorkspace}
        onBackToOverview={handleBackToOverview}
        onViewAllWorkspaces={handleViewAllWorkspaces}
      />

      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <ErrorBoundary>
          <Suspense fallback={ViewLoadingFallback}>
            {renderMainContent()}
          </Suspense>
        </ErrorBoundary>
      </main>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        overview={overview}
        onSelectWorkspace={handleSelectWorkspace}
        onNavigate={(nav) => {
          setActiveNav(nav as ActiveNav);
          try {
            localStorage.setItem('entropy_active_nav', nav);
          } catch {}
        }}
        onRefresh={() => loadEnvironment(scanRoots)}
        onInspectFolder={handleInspectFolder}
        onShowToast={(msg) => showToast(msg, 'success')}
        onViewAllWorkspaces={handleViewAllWorkspaces}
      />

      {/* Floating Toast Notification */}
      {toast && (
        <div
          role="status"
          className="fixed top-16 right-6 z-50 flex items-center justify-between gap-3 pl-3 pr-2.5 py-2.5 rounded-xl shadow-2xl text-xs font-medium max-w-sm border backdrop-blur-md bg-[var(--color-surface-2)]/95 border-[var(--color-border-strong)] text-[var(--color-text-primary)] animate-in fade-in slide-in-from-top-2"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1 rounded-md shrink-0 ${
              toast.type === 'info'
                ? 'bg-[var(--color-info-bg)] text-[var(--color-info)]'
                : 'bg-[var(--color-success-bg)] text-[var(--color-success)]'
            }`}>
              {toast.type === 'info' ? <Info size={15} /> : <CheckCircle2 size={15} />}
            </div>
            <span className="truncate">{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] p-1 rounded-md hover:bg-[var(--color-surface-3)] transition-colors cursor-pointer shrink-0"
            aria-label="Dismiss notification"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

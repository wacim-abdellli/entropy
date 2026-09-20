import React, { useEffect, useState } from 'react';
import { Sidebar, ActiveNav } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { WorkspaceView } from './components/WorkspaceView';
import { SystemView } from './components/SystemView';
import { FindingsView } from './components/FindingsView';
import { CommandPalette } from './components/CommandPalette';
import { EntropyApiClient } from './services/api';
import {
  EnvironmentOverview,
  StateCategory,
  WorkspaceInspection,
} from './types/entropy';

export function App() {
  const [activeNav, setActiveNav] = useState<ActiveNav>('overview');
  const [selectedFilter, setSelectedFilter] = useState<StateCategory | 'all'>('all');
  const [overview, setOverview] = useState<EnvironmentOverview | null>(null);
  const [inspection, setInspection] = useState<WorkspaceInspection | null>(null);
  const [selectedWorkspacePath, setSelectedWorkspacePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<{
    title: string;
    message: string;
    details?: string;
    onRetry?: () => void;
  } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);

  // Initial load: scan environment
  useEffect(() => {
    loadEnvironment();
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

  const loadEnvironment = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await EntropyApiClient.scanEnvironment();
      setOverview(data);
    } catch (err: any) {
      console.error('Failed to load environment overview:', err);
      setError({
        title: 'Entropy engine unavailable',
        message: 'Could not connect to the local Entropy Python reasoning engine. Check that the system environment is accessible.',
        details: err?.message || String(err),
        onRetry: () => loadEnvironment(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectWorkspace = async (path: string) => {
    setSelectedWorkspacePath(path);
    setIsLoading(true);
    setError(null);
    try {
      const data = await EntropyApiClient.inspectWorkspace(path);
      setInspection(data);
    } catch (err: any) {
      console.error('Failed to inspect workspace:', err);
      setError({
        title: 'Workspace Inspection Failed',
        message: err?.message || `Could not inspect workspace at '${path}'.`,
        details: err?.stack || err?.message || String(err),
        onRetry: () => handleSelectWorkspace(path),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInspectFolder = async () => {
    const folder = await EntropyApiClient.pickFolder();
    if (folder) {
      handleSelectWorkspace(folder);
    }
  };

  const handleBackToOverview = () => {
    setError(null);
    setSelectedWorkspacePath(null);
    setInspection(null);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#090b10] text-zinc-300 font-sans">
      {/* Sidebar */}
      <Sidebar
        activeNav={activeNav}
        onSelectNav={(nav) => {
          setActiveNav(nav);
          setError(null);
          setSelectedWorkspacePath(null);
        }}
        summary={overview ? overview.summary : null}
        selectedFilter={selectedFilter}
        onSelectFilter={(filter) => {
          setSelectedFilter(filter);
          setActiveNav('workspaces');
          setError(null);
          setSelectedWorkspacePath(null);
        }}
        onInspectFolder={handleInspectFolder}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#0a0d14] text-zinc-300">
            <div className="max-w-md w-full bg-[#0f131d] border border-red-900/50 rounded-xl p-6 text-center space-y-4 shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-red-950/70 border border-red-800/80 flex items-center justify-center mx-auto text-red-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-zinc-100">{error.title}</h2>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{error.message}</p>
              </div>
              {error.details && (
                <details className="text-left bg-[#141824] border border-[#23293a] rounded p-2.5 text-[11px] font-mono text-zinc-400">
                  <summary className="cursor-pointer text-zinc-300 font-semibold select-none">View details</summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all text-red-300/80 max-h-36 overflow-y-auto">{error.details}</pre>
                </details>
              )}
              <div className="flex items-center justify-center space-x-3 pt-2">
                {error.onRetry && (
                  <button
                    onClick={error.onRetry}
                    className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded text-xs font-medium transition-colors"
                  >
                    Retry
                  </button>
                )}
                <button
                  onClick={handleBackToOverview}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-medium transition-colors"
                >
                  Back to Overview
                </button>
              </div>
            </div>
          </div>
        ) : selectedWorkspacePath && inspection ? (
          <WorkspaceView
            inspection={inspection}
            onBack={handleBackToOverview}
            onReinspect={() => handleSelectWorkspace(selectedWorkspacePath)}
            isLoading={isLoading}
          />
        ) : selectedWorkspacePath && isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 text-xs space-y-3 bg-[#0a0d14]">
            <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
            <div className="font-mono text-zinc-400">Reconstructing workspace topology...</div>
          </div>
        ) : activeNav === 'overview' || activeNav === 'workspaces' ? (
          overview ? (
            <OverviewView
              overview={overview}
              onRefresh={loadEnvironment}
              isLoading={isLoading}
              selectedFilter={selectedFilter}
              onSelectFilter={setSelectedFilter}
              onSelectWorkspace={handleSelectWorkspace}
              onInspectFolder={handleInspectFolder}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
              Loading environment data...
            </div>
          )
        ) : activeNav === 'findings' ? (
          overview ? (
            <FindingsView
              findings={overview.findings}
              onSelectWorkspace={handleSelectWorkspace}
            />
          ) : null
        ) : activeNav === 'processes' ||
          activeNav === 'runtimes' ||
          activeNav === 'containers' ||
          activeNav === 'caches' ? (
          overview ? (
            <SystemView
              initialTab={activeNav}
              processes={overview.system.processes}
              runtimes={overview.system.runtimes}
              containers={overview.system.containers}
              caches={overview.system.caches}
            />
          ) : null
        ) : null}
      </main>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        overview={overview}
        onSelectWorkspace={handleSelectWorkspace}
        onNavigate={(nav) => {
          setActiveNav(nav);
          setSelectedWorkspacePath(null);
        }}
      />
    </div>
  );
}

export default App;

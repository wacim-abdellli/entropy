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
    try {
      const data = await EntropyApiClient.scanEnvironment();
      setOverview(data);
    } catch (err) {
      console.error('Failed to load environment overview:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectWorkspace = async (path: string) => {
    setSelectedWorkspacePath(path);
    setIsLoading(true);
    try {
      const data = await EntropyApiClient.inspectWorkspace(path);
      setInspection(data);
    } catch (err) {
      console.error('Failed to inspect workspace:', err);
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
          setSelectedWorkspacePath(null);
        }}
        summary={overview ? overview.summary : null}
        selectedFilter={selectedFilter}
        onSelectFilter={(filter) => {
          setSelectedFilter(filter);
          setActiveNav('workspaces');
          setSelectedWorkspacePath(null);
        }}
        onInspectFolder={handleInspectFolder}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {selectedWorkspacePath && inspection ? (
          <WorkspaceView
            inspection={inspection}
            onBack={handleBackToOverview}
            onReinspect={() => handleSelectWorkspace(selectedWorkspacePath)}
            isLoading={isLoading}
          />
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

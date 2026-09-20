import { EnvironmentOverview, WorkspaceInspection } from '../types/entropy';
import {
  MOCK_AFTERSALES_INSPECTION,
  MOCK_ENTROPY_INSPECTION,
  MOCK_ENVIRONMENT_OVERVIEW,
  MOCK_TALIB_INSPECTION,
} from './mockData';

// Check for Tauri or pywebview runtime
const isTauri = (): boolean => {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__);
};

const isPyWebView = (): boolean => {
  return typeof window !== 'undefined' && Boolean((window as any).pywebview?.api);
};

export class EntropyApiClient {
  /**
   * Inspect a specific workspace path.
   */
  static async inspectWorkspace(path: string): Promise<WorkspaceInspection> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<WorkspaceInspection>('inspect_workspace', { path });
      } catch (err) {
        console.warn('Tauri invoke inspect_workspace failed, falling back:', err);
      }
    }

    if (isPyWebView()) {
      try {
        const res = await (window as any).pywebview.api.inspect_workspace(path);
        return typeof res === 'string' ? JSON.parse(res) : res;
      } catch (err) {
        console.warn('pywebview inspect_workspace failed, falling back:', err);
      }
    }

    // Try local dev server API if available
    try {
      const resp = await fetch(`/api/inspect?path=${encodeURIComponent(path)}`);
      if (resp.ok) {
        return await resp.json();
      }
    } catch {
      // Fallback to mock data
    }

    const norm = path.toLowerCase().replace(/\\/g, '/');
    if (norm.includes('aftersales')) {
      return MOCK_AFTERSALES_INSPECTION;
    } else if (norm.includes('talib')) {
      return MOCK_TALIB_INSPECTION;
    }
    return MOCK_ENTROPY_INSPECTION;
  }

  /**
   * Scan the environment across specified root directories.
   */
  static async scanEnvironment(roots?: string[], depth = 4): Promise<EnvironmentOverview> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<EnvironmentOverview>('scan_environment', { roots, depth });
      } catch (err) {
        console.warn('Tauri invoke scan_environment failed, falling back:', err);
      }
    }

    if (isPyWebView()) {
      try {
        const res = await (window as any).pywebview.api.scan_environment(roots || [], depth);
        return typeof res === 'string' ? JSON.parse(res) : res;
      } catch (err) {
        console.warn('pywebview scan_environment failed, falling back:', err);
      }
    }

    // Try local dev server API if available
    try {
      const resp = await fetch('/api/scan');
      if (resp.ok) {
        return await resp.json();
      }
    } catch {
      // Fallback to mock data
    }

    return MOCK_ENVIRONMENT_OVERVIEW;
  }

  /**
   * Open path in native Windows Explorer.
   */
  static async openInExplorer(path: string): Promise<void> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_in_explorer', { path });
        return;
      } catch (err) {
        console.warn('Failed to open in explorer via Tauri:', err);
      }
    }

    if (isPyWebView()) {
      try {
        await (window as any).pywebview.api.open_in_explorer(path);
        return;
      } catch (err) {
        console.warn('Failed to open in explorer via pywebview:', err);
      }
    }

    console.log('[Dev Bridge] Opening Explorer for:', path);
  }

  /**
   * Open path in native Windows Terminal or PowerShell.
   */
  static async openInTerminal(path: string): Promise<void> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_in_terminal', { path });
        return;
      } catch (err) {
        console.warn('Failed to open terminal via Tauri:', err);
      }
    }

    if (isPyWebView()) {
      try {
        await (window as any).pywebview.api.open_in_terminal(path);
        return;
      } catch (err) {
        console.warn('Failed to open terminal via pywebview:', err);
      }
    }

    console.log('[Dev Bridge] Opening Terminal for:', path);
  }

  /**
   * Pick folder using native Windows dialog.
   */
  static async pickFolder(): Promise<string | null> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string | null>('pick_folder');
      } catch (err) {
        console.warn('Failed to pick folder via Tauri:', err);
      }
    }

    if (isPyWebView()) {
      try {
        return await (window as any).pywebview.api.pick_folder();
      } catch (err) {
        console.warn('Failed to pick folder via pywebview:', err);
      }
    }

    return 'C:\\Users\\pc\\Desktop\\entropy';
  }
}

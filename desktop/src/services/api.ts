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

const waitForPyWebView = async (timeoutMs = 1500): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if ((window as any).pywebview?.api) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ((window as any).pywebview?.api) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return Boolean((window as any).pywebview?.api);
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
      } catch (err: any) {
        throw new Error(err?.message || String(err));
      }
    }

    if (await waitForPyWebView()) {
      const res = await (window as any).pywebview.api.inspect_workspace(path);
      const parsed = typeof res === 'string' ? JSON.parse(res) : res;
      if (parsed?.error) {
        throw new Error(parsed.error);
      }
      return parsed;
    }

    // Try local dev server API if available
    try {
      const resp = await fetch(`/api/inspect?path=${encodeURIComponent(path)}`);
      if (resp.ok) {
        return await resp.json();
      }
    } catch {
      // Fallback to mock data in pure web preview mode
    }

    const norm = path.toLowerCase().replace(/\\/g, '/');
    if (norm.includes('aftersales')) {
      return MOCK_AFTERSALES_INSPECTION;
    } else if (norm.includes('talib')) {
      return MOCK_TALIB_INSPECTION;
    } else if (norm.includes('entropy')) {
      return MOCK_ENTROPY_INSPECTION;
    }

    // If path is unknown and doesn't match sample workspaces, report error
    throw new Error(`Target path '${path}' does not exist or is not an accessible workspace.`);
  }

  /**
   * Scan the environment across specified root directories.
   */
  static async scanEnvironment(roots?: string[], depth = 2): Promise<EnvironmentOverview> {
    if (isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<EnvironmentOverview>('scan_environment', { roots, depth });
      } catch (err: any) {
        throw new Error(err?.message || String(err));
      }
    }

    if (await waitForPyWebView()) {
      const res = await (window as any).pywebview.api.scan_environment(roots || [], depth);
      const parsed = typeof res === 'string' ? JSON.parse(res) : res;
      if (parsed?.error) {
        throw new Error(parsed.error);
      }
      return parsed;
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

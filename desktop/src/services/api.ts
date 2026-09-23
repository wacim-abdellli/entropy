import { EnvironmentOverview, WorkspaceInspection } from '../types/entropy';
import {
  MOCK_AFTERSALES_INSPECTION,
  MOCK_ENTROPY_INSPECTION,
  MOCK_ENVIRONMENT_OVERVIEW,
  MOCK_TALIB_INSPECTION,
} from './mockData';

interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
}
interface CleanArtifactResult extends ActionResult {
  freed_bytes?: number;
}

interface CleanArtifactsResult extends ActionResult {
  total_freed_bytes?: number;
  success_count?: number;
  failed_count?: number;
  results?: CleanArtifactResult[];
}

interface PyWebViewApi {
  inspect_workspace(path: string): Promise<WorkspaceInspection | string | { error?: string }>;
  scan_environment(roots: string[], depth: number): Promise<EnvironmentOverview | string | { error?: string }>;
  open_in_explorer(path: string): Promise<boolean>;
  open_in_terminal(path: string): Promise<boolean>;
  open_in_powershell?(path: string): Promise<boolean>;
  open_in_cmd?(path: string): Promise<boolean>;
  pick_folder(): Promise<string | null>;
  terminate_process(pid: number, force: boolean): Promise<ActionResult | string>;
  free_port(port: number, force: boolean): Promise<ActionResult | string>;
  clean_artifact(path: string): Promise<CleanArtifactResult | string>;
  clean_artifacts(paths: string[]): Promise<CleanArtifactsResult | string>;
  detect_launchers(): Promise<Record<string, boolean> | string>;
  launch_ide(workspacePath: string, editorId: string): Promise<ActionResult | string>;
  stash_workspace(workspacePath: string, message?: string): Promise<ActionResult | string>;
}

interface EntropyWindow extends Window {
  __TAURI_INTERNALS__?: unknown;
  pywebview?: {
    api?: PyWebViewApi;
  };
}

function bridgeWindow(): EntropyWindow | null {
  return typeof window === 'undefined' ? null : (window as EntropyWindow);
}

function parseBridgeResponse<T>(res: T | string): T {
  return typeof res === 'string' ? JSON.parse(res) as T : res;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Check for Tauri or pywebview runtime
const isTauri = (): boolean => {
  return Boolean(bridgeWindow()?.__TAURI_INTERNALS__);
};

const isPyWebView = (): boolean => {
  return Boolean(bridgeWindow()?.pywebview?.api);
};

const waitForPyWebView = async (timeoutMs = 1500): Promise<boolean> => {
  const win = bridgeWindow();
  if (!win) return false;
  if (win.pywebview?.api) return true;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (win.pywebview?.api) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return Boolean(win.pywebview?.api);
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
      } catch (err: unknown) {
        throw new Error(errorMessage(err));
      }
    }

    if (await waitForPyWebView()) {
      const res = await bridgeWindow()!.pywebview!.api!.inspect_workspace(path);
      const parsed = parseBridgeResponse<WorkspaceInspection & { error?: string }>(res as WorkspaceInspection | string);
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
      } catch (err: unknown) {
        throw new Error(errorMessage(err));
      }
    }

    if (await waitForPyWebView()) {
      const rootsArg = roots !== undefined ? roots : null;
      const res = await bridgeWindow()!.pywebview!.api!.scan_environment(rootsArg as any, depth);
      const parsed = parseBridgeResponse<EnvironmentOverview & { error?: string }>(res as EnvironmentOverview | string);
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
        await bridgeWindow()!.pywebview!.api!.open_in_explorer(path);
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
        await bridgeWindow()!.pywebview!.api!.open_in_terminal(path);
        return;
      } catch (err) {
        console.warn('Failed to open terminal via pywebview:', err);
      }
    }

    console.log('[Dev Bridge] Opening Terminal for:', path);
  }

  /**
   * Open path in native Windows PowerShell.
   */
  static async openInPowerShell(path: string): Promise<void> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.open_in_powershell) {
          await bridgeWindow()!.pywebview!.api!.open_in_powershell!(path);
          return;
        }
      } catch (err) {
        console.warn('Failed to open PowerShell via direct pywebview API:', err);
      }
    }

    try {
      await EntropyApiClient.launchIde(path, 'powershell');
    } catch (err) {
      console.warn('Failed to open PowerShell via launchIde:', err);
    }
  }

  /**
   * Open path in native Windows Command Prompt (cmd.exe).
   */
  static async openInCmd(path: string): Promise<void> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.open_in_cmd) {
          await bridgeWindow()!.pywebview!.api!.open_in_cmd!(path);
          return;
        }
      } catch (err) {
        console.warn('Failed to open CMD via direct pywebview API:', err);
      }
    }

    try {
      await EntropyApiClient.launchIde(path, 'cmd');
    } catch (err) {
      console.warn('Failed to open CMD via launchIde:', err);
    }
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
        return await bridgeWindow()!.pywebview!.api!.pick_folder();
      } catch (err) {
        console.warn('Failed to pick folder via pywebview:', err);
      }
    }

    return 'C:\\Users\\pc\\Desktop\\entropy';
  }

  /**
   * Safely terminate process by PID.
   */
  static async terminateProcess(pid: number, force = true): Promise<ActionResult> {
    if (isPyWebView()) {
      try {
        const res = await bridgeWindow()!.pywebview!.api!.terminate_process(pid, force);
        return parseBridgeResponse<ActionResult>(res);
      } catch (err: unknown) {
        return { success: false, error: errorMessage(err) };
      }
    }
    console.log('[Dev Bridge] Terminating process PID:', pid);
    return { success: true, message: `Terminated process PID ${pid}` };
  }

  /**
   * Free listening TCP port by terminating its owner process.
   */
  static async freePort(port: number, force = true): Promise<ActionResult> {
    if (isPyWebView()) {
      try {
        const res = await bridgeWindow()!.pywebview!.api!.free_port(port, force);
        return parseBridgeResponse<ActionResult>(res);
      } catch (err: unknown) {
        return { success: false, error: errorMessage(err) };
      }
    }
    console.log('[Dev Bridge] Freeing port:', port);
    return { success: true, message: `Freed port ${port}` };
  }

  /**
   * Safely delete a single whitelisted build artifact directory.
   */
  static async cleanArtifact(path: string): Promise<CleanArtifactResult> {
    if (isPyWebView()) {
      try {
        const res = await bridgeWindow()!.pywebview!.api!.clean_artifact(path);
        return parseBridgeResponse<CleanArtifactResult>(res);
      } catch (err: unknown) {
        return { success: false, error: errorMessage(err) };
      }
    }
    console.log('[Dev Bridge] Cleaning artifact:', path);
    return { success: true, message: `Cleaned ${path}` };
  }

  /**
   * Safely delete multiple whitelisted build artifact directories.
   */
  static async cleanArtifacts(paths: string[]): Promise<CleanArtifactsResult> {
    if (isPyWebView()) {
      try {
        const res = await bridgeWindow()!.pywebview!.api!.clean_artifacts(paths);
        return parseBridgeResponse<CleanArtifactsResult>(res);
      } catch (err: unknown) {
        return { success: false, total_freed_bytes: 0, error: errorMessage(err) };
      }
    }
    console.log('[Dev Bridge] Cleaning multiple artifacts:', paths);
    return { success: true, total_freed_bytes: 1024 * 1024 * 500, success_count: paths.length, failed_count: 0 };
  }

  /**
   * Detect installed IDEs and terminal launchers.
   */
  static async detectLaunchers(): Promise<Record<string, boolean>> {
    if (isPyWebView()) {
      try {
        const res = await bridgeWindow()!.pywebview!.api!.detect_launchers();
        return parseBridgeResponse<Record<string, boolean>>(res);
      } catch (err) {
        console.warn('Failed to detect launchers:', err);
      }
    }
    return { explorer: true, terminal: true, powershell: true, cmd: true, code: true, cursor: true };
  }

  /**
   * Launch workspace in specified IDE or terminal.
   */
  static async launchIde(workspacePath: string, editorId: string): Promise<ActionResult> {
    if (isPyWebView()) {
      try {
        const res = await bridgeWindow()!.pywebview!.api!.launch_ide(workspacePath, editorId);
        return parseBridgeResponse<ActionResult>(res);
      } catch (err: unknown) {
        return { success: false, error: errorMessage(err) };
      }
    }
    console.log('[Dev Bridge] Launching IDE:', editorId, 'for', workspacePath);
    return { success: true, message: `Opened in ${editorId}` };
  }

  /**
   * Safely stash uncommitted local changes in a workspace repository.
   */
  static async stashWorkspace(workspacePath: string, message?: string): Promise<ActionResult> {
    if (isPyWebView()) {
      try {
        const res = await bridgeWindow()!.pywebview!.api!.stash_workspace(workspacePath, message);
        return parseBridgeResponse<ActionResult>(res);
      } catch (err: unknown) {
        return { success: false, error: errorMessage(err) };
      }
    }
    console.log('[Dev Bridge] Stashing workspace:', workspacePath);
    return { success: true, message: 'Safely stashed working tree.' };
  }

}

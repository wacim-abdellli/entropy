import {
  AiConfig,
  AiResponse,
  AiTestResult,
  CachePurgeResult,
  CleanSlateCandidate,
  CleanSlateResult,
  DockerDiskUsage,
  DockerPruneResult,
  EnvironmentOverview,
  GlobalCacheItem,
  WorkspaceHealth,
  WorkspaceInspection,
} from '../types/entropy';
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
  open_url?(url: string): Promise<boolean>;
  pick_folder(): Promise<string | null>;
  terminate_process(pid: number, force: boolean): Promise<ActionResult | string>;
  free_port(port: number, force: boolean): Promise<ActionResult | string>;
  get_clean_slate_candidates?(workspaceRoots?: string[]): Promise<CleanSlateCandidate[] | string>;
  clean_slate_dev_processes?(pids?: number[]): Promise<CleanSlateResult | string>;
  clean_artifact(path: string): Promise<CleanArtifactResult | string>;
  clean_artifacts(paths: string[]): Promise<CleanArtifactsResult | string>;
  detect_launchers(): Promise<Record<string, boolean> | string>;
  launch_ide(workspacePath: string, editorId: string): Promise<ActionResult | string>;
  stash_workspace(workspacePath: string, message?: string): Promise<ActionResult | string>;
  add_to_gitignore?(workspace_path: string, pattern?: string): Promise<ActionResult | string>;
  prune_merged_branches?(workspace_path: string, branches?: string[]): Promise<ActionResult & { pruned?: string[]; failed?: { branch: string; error: string }[] } | string>;
  get_docker_system_df?(): Promise<DockerDiskUsage | string>;
  prune_docker_resources?(target: string): Promise<DockerPruneResult | string>;
  get_purgeable_caches?(): Promise<GlobalCacheItem[] | string>;
  purge_caches?(targets: string[]): Promise<CachePurgeResult | string>;
  get_workspace_health?(workspace_path: string): Promise<WorkspaceHealth | string>;
  get_ai_config?(): Promise<AiConfig | string>;
  save_ai_config?(updates: Partial<AiConfig>): Promise<{ success: boolean; error?: string; config?: AiConfig } | string>;
  test_ai_connection?(provider?: string): Promise<AiTestResult | string>;
  ask_ai_advisor?(question: string, context?: Record<string, any>): Promise<AiResponse | string>;
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
  const api = bridgeWindow()?.pywebview?.api;
  return Boolean(api && typeof api.scan_environment === 'function');
};

let pywebviewReadyPromise: Promise<boolean> | null = null;

const waitForPyWebView = async (timeoutMs = 10000): Promise<boolean> => {
  const win = bridgeWindow();
  if (!win) return false;
  if (isPyWebView()) return true;

  if (!pywebviewReadyPromise) {
    pywebviewReadyPromise = new Promise<boolean>((resolve) => {
      if (isPyWebView()) {
        resolve(true);
        return;
      }

      let resolved = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let interval: ReturnType<typeof setInterval> | undefined;

      const done = (val: boolean) => {
        if (!resolved) {
          resolved = true;
          win.removeEventListener('pywebviewready', onReady);
          if (interval) clearInterval(interval);
          if (timer) clearTimeout(timer);
          resolve(val);
        }
      };

      const onReady = () => {
        if (isPyWebView()) {
          done(true);
        }
      };

      win.addEventListener('pywebviewready', onReady);

      const startTime = Date.now();
      interval = setInterval(() => {
        if (isPyWebView()) {
          done(true);
          return;
        }

        // If after 1000ms there is no trace of pywebview or webview2 runtime,
        // assume we are in a pure standalone browser and don't stall for the full 10s.
        const elapsed = Date.now() - startTime;
        const hasPyWebViewContainer = Boolean(win.pywebview);
        const hasWebView2 = Boolean((win as unknown as { chrome?: { webview?: unknown } })?.chrome?.webview);

        if (elapsed > 1000 && !hasPyWebViewContainer && !hasWebView2) {
          done(false);
        }
      }, 40);

      timer = setTimeout(() => {
        done(isPyWebView());
      }, timeoutMs);
    });
  }

  const isReady = await pywebviewReadyPromise;
  if (!isReady) {
    pywebviewReadyPromise = null;
  }
  return isReady;
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
      const api = bridgeWindow()?.pywebview?.api;
      if (api && typeof api.inspect_workspace === 'function') {
        const res = await api.inspect_workspace(path);
        const parsed = parseBridgeResponse<WorkspaceInspection & { error?: string }>(res as WorkspaceInspection | string);
        if (parsed?.error) {
          throw new Error(parsed.error);
        }
        return parsed;
      }
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
      const api = bridgeWindow()?.pywebview?.api;
      if (api && typeof api.scan_environment === 'function') {
        const rootsArg = roots !== undefined ? roots : null;
        const res = await api.scan_environment(rootsArg as any, depth);
        const parsed = parseBridgeResponse<EnvironmentOverview & { error?: string }>(res as EnvironmentOverview | string);
        if (parsed?.error) {
          throw new Error(parsed.error);
        }
        return parsed;
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
  static async openInExplorer(path: string): Promise<ActionResult> {
    return EntropyApiClient.launchIde(path, 'explorer');
  }

  /**
   * Open path in native Windows Terminal or PowerShell.
   */
  static async openInTerminal(path: string): Promise<ActionResult> {
    return EntropyApiClient.launchIde(path, 'terminal');
  }

  /**
   * Open path in native Windows PowerShell.
   */
  static async openInPowerShell(path: string): Promise<ActionResult> {
    return EntropyApiClient.launchIde(path, 'powershell');
  }

  /**
   * Open path in native Windows Command Prompt (cmd.exe).
   */
  static async openInCmd(path: string): Promise<ActionResult> {
    return EntropyApiClient.launchIde(path, 'cmd');
  }

  /**
   * Open a URL (e.g. http://localhost:3000) in the user's default browser.
   */
  static async openUrl(url: string): Promise<void> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.open_url) {
          await bridgeWindow()!.pywebview!.api!.open_url!(url);
          return;
        }
      } catch (err) {
        console.warn('Failed to open URL via pywebview:', err);
      }
    }

    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.warn('Failed to open URL via window.open:', err);
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

  /**
   * Get background developer processes eligible for Clean Slate RAM recovery.
   */
  static async getCleanSlateCandidates(workspaceRoots?: string[]): Promise<CleanSlateCandidate[]> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.get_clean_slate_candidates) {
          const res = await bridgeWindow()!.pywebview!.api!.get_clean_slate_candidates!(workspaceRoots);
          return parseBridgeResponse<CleanSlateCandidate[]>(res);
        }
      } catch (err) {
        console.warn('Failed to get clean slate candidates:', err);
      }
    }
    return [];
  }

  /**
   * Safely terminate background developer processes to reclaim RAM and free dev ports.
   */
  static async cleanSlateDevProcesses(pids?: number[]): Promise<CleanSlateResult> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.clean_slate_dev_processes) {
          const res = await bridgeWindow()!.pywebview!.api!.clean_slate_dev_processes!(pids);
          return parseBridgeResponse<CleanSlateResult>(res);
        }
      } catch (err: unknown) {
        return {
          success: false,
          terminated_count: 0,
          freed_memory_bytes: 0,
          terminated_processes: [],
          errors: [{ pid: 0, name: 'unknown', error: errorMessage(err) }],
        };
      }
    }
    console.log('[Dev Bridge] Clean slate dev processes:', pids);
    return {
      success: true,
      terminated_count: 2,
      freed_memory_bytes: 1024 * 1024 * 750,
      terminated_processes: [
        { pid: 1234, name: 'node.exe', memory_bytes: 1024 * 1024 * 450 },
        { pid: 5678, name: 'python.exe', memory_bytes: 1024 * 1024 * 300 },
      ],
      errors: [],
    };
  }

  /**
   * Safely append a secret file or pattern to the repository's .gitignore file.
   */
  static async addToGitignore(workspacePath: string, pattern = '.env*'): Promise<ActionResult> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.add_to_gitignore) {
          const res = await bridgeWindow()!.pywebview!.api!.add_to_gitignore!(workspacePath, pattern);
          return parseBridgeResponse<ActionResult>(res);
        }
      } catch (err: unknown) {
        return { success: false, error: errorMessage(err) };
      }
    }
    console.log('[Dev Bridge] Adding to .gitignore:', pattern, 'for', workspacePath);
    return { success: true, message: `Added '${pattern}' to .gitignore.` };
  }

  /**
   * Safely prune local branches already merged into HEAD (uses safe 'git branch -d').
   */
  static async pruneMergedBranches(
    workspacePath: string,
    branches?: string[]
  ): Promise<ActionResult & { pruned?: string[]; failed?: { branch: string; error: string }[] }> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.prune_merged_branches) {
          const res = await bridgeWindow()!.pywebview!.api!.prune_merged_branches!(workspacePath, branches);
          return parseBridgeResponse<ActionResult & { pruned?: string[]; failed?: { branch: string; error: string }[] }>(res);
        }
      } catch (err: unknown) {
        return { success: false, error: errorMessage(err), pruned: [], failed: [] };
      }
    }
    console.log('[Dev Bridge] Pruning merged branches for:', workspacePath, branches);
    return { success: true, message: 'Pruned merged branches.', pruned: branches || ['feature/old-auth'], failed: [] };
  }

  /**
   * Query Docker disk space breakdown (images, containers, volumes, build cache).
   */
  static async getDockerDiskUsage(): Promise<DockerDiskUsage> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.get_docker_system_df) {
          const res = await bridgeWindow()!.pywebview!.api!.get_docker_system_df!();
          return parseBridgeResponse<DockerDiskUsage>(res);
        }
      } catch (err) {
        console.warn('Failed to query Docker disk usage:', err);
      }
    }
    return {
      available: false,
      message: 'Docker daemon is not running or CLI not installed.',
      items: [],
      total_size_bytes: 0,
      reclaimable_bytes: 0,
    };
  }

  /**
   * Safely prune Docker resources ('builder', 'dangling_images', 'system').
   */
  static async pruneDocker(target: 'builder' | 'dangling_images' | 'system' = 'builder'): Promise<DockerPruneResult> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.prune_docker_resources) {
          const res = await bridgeWindow()!.pywebview!.api!.prune_docker_resources!(target);
          return parseBridgeResponse<DockerPruneResult>(res);
        }
      } catch (err: unknown) {
        return { success: false, error: errorMessage(err) };
      }
    }
    console.log('[Dev Bridge] Pruning Docker target:', target);
    return { success: true, target, message: `Pruned Docker ${target}.` };
  }

  /**
   * Get discovered global developer package caches (pip, npm, yarn, cargo, gradle, nuget).
   */
  static async getPurgeableCaches(): Promise<GlobalCacheItem[]> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.get_purgeable_caches) {
          const res = await bridgeWindow()!.pywebview!.api!.get_purgeable_caches!();
          return parseBridgeResponse<GlobalCacheItem[]>(res);
        }
      } catch (err) {
        console.warn('Failed to get purgeable caches:', err);
      }
    }
    return [];
  }

  /**
   * Safely purge selected global package manager caches.
   */
  static async purgeCaches(targets: string[]): Promise<CachePurgeResult> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.purge_caches) {
          const res = await bridgeWindow()!.pywebview!.api!.purge_caches!(targets);
          return parseBridgeResponse<CachePurgeResult>(res);
        }
      } catch (err: unknown) {
        return {
          success: false,
          total_freed_bytes: 0,
          success_count: 0,
          failed_count: targets.length,
          results: targets.map((t) => ({ success: false, id: t, label: t, path: t, freed_bytes: 0, error: errorMessage(err) })),
        };
      }
    }
    console.log('[Dev Bridge] Purging caches:', targets);
    return {
      success: true,
      total_freed_bytes: 1024 * 1024 * 450,
      success_count: targets.length,
      failed_count: 0,
      results: targets.map((t) => ({ success: true, id: t, label: t, path: t, freed_bytes: 1024 * 1024 * 150 })),
    };
  }

  /**
   * Get workspace hygiene, health score (0-100), and actionable tips.
   */
  static async getWorkspaceHealth(workspacePath: string): Promise<WorkspaceHealth> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.get_workspace_health) {
          const res = await bridgeWindow()!.pywebview!.api!.get_workspace_health!(workspacePath);
          return parseBridgeResponse<WorkspaceHealth>(res);
        }
      } catch (err) {
        console.warn('Failed to get workspace health:', err);
      }
    }
    return {
      workspace_path: workspacePath,
      workspace_name: workspacePath.split(/[\\/]/).pop() || 'workspace',
      health_score: 85,
      summary: 'Workspace is in good shape with minor maintenance opportunities.',
      tips: [
        {
          id: 'dev_preview',
          title: 'Workspace Health Analysis',
          description: 'Local workspace inspected. No immediate risks found.',
          severity: 'info',
        },
      ],
      cleanup_verdicts: [],
    };
  }

  /**
   * Get AI Advisor settings (provider, groq config, ollama config).
   */
  static async getAiConfig(): Promise<AiConfig> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.get_ai_config) {
          const res = await bridgeWindow()!.pywebview!.api!.get_ai_config!();
          return parseBridgeResponse<AiConfig>(res);
        }
      } catch (err) {
        console.warn('Failed to get AI config:', err);
      }
    }
    return {
      provider: 'rules',
      groq_api_key: '',
      groq_model: 'llama-3.3-70b-versatile',
      ollama_url: 'http://localhost:11434',
      ollama_model: 'llama3.2',
    };
  }

  /**
   * Save AI Advisor settings.
   */
  static async saveAiConfig(updates: Partial<AiConfig>): Promise<{ success: boolean; error?: string; config?: AiConfig }> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.save_ai_config) {
          const res = await bridgeWindow()!.pywebview!.api!.save_ai_config!(updates);
          return parseBridgeResponse<{ success: boolean; error?: string; config?: AiConfig }>(res);
        }
      } catch (err: unknown) {
        return { success: false, error: errorMessage(err) };
      }
    }
    return {
      success: true,
      config: {
        provider: updates.provider || 'rules',
        groq_api_key: updates.groq_api_key || '',
        groq_model: updates.groq_model || 'llama-3.3-70b-versatile',
        ollama_url: updates.ollama_url || 'http://localhost:11434',
        ollama_model: updates.ollama_model || 'llama3.2',
      },
    };
  }

  /**
   * Test AI Provider connectivity.
   */
  static async testAiConnection(provider?: string): Promise<AiTestResult> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.test_ai_connection) {
          const res = await bridgeWindow()!.pywebview!.api!.test_ai_connection!(provider);
          return parseBridgeResponse<AiTestResult>(res);
        }
      } catch (err: unknown) {
        return { success: false, provider: provider || 'rules', error: errorMessage(err) };
      }
    }
    return {
      success: true,
      provider: provider || 'rules',
      message: 'Connection successful (Simulated bridge).',
    };
  }

  /**
   * Ask AI Advisor a developer question with optional workspace context.
   */
  static async askAiAdvisor(question: string, context?: Record<string, any>): Promise<AiResponse> {
    if (isPyWebView()) {
      try {
        if (bridgeWindow()?.pywebview?.api?.ask_ai_advisor) {
          const res = await bridgeWindow()!.pywebview!.api!.ask_ai_advisor!(question, context);
          return parseBridgeResponse<AiResponse>(res);
        }
      } catch (err: unknown) {
        return { success: false, answer: errorMessage(err), provider: 'error', error: errorMessage(err) };
      }
    }
    return {
      success: true,
      answer: `### Advice for ${context?.workspace_name || 'Workspace'}\n- All source code and repositories are safe.\n- Use standard package managers to rebuild dependencies if deleted.\n- Stash uncommitted changes prior to executing destructive actions.`,
      provider: 'rules',
      model: 'offline-rules-engine',
    };
  }

}


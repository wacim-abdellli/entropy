export type StateCategory = 'active' | 'attention' | 'dormant' | 'inactive' | 'paused' | 'neutral';

export type ObservabilityLevel = 'directly_observable' | 'strongly_inferable' | 'probabilistic';

export interface GitDirtyFile {
  status: 'modified' | 'deleted' | 'untracked' | 'added' | 'renamed' | string;
  path: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  path: string;
  project_type: string;
  total_size_bytes: number | null;
  last_modified: number | null;
  state_label: string;
  state_category: StateCategory;
  git_branch: string | null;
  git_remote: string | null;
  last_commit_timestamp: number | null;
  has_uncommitted_changes: boolean;
  dirty_count?: number;
  oldest_dirty_timestamp?: number | null;
  unprotected_env_files?: string[];
  merged_branches?: string[];
  process_count: number;
  ports?: number[];
}

export interface WorkspaceDetails {
  id: string;
  name: string;
  path: string;
  project_type: string;
  total_size_bytes: number | null;
  created: number | null;
  last_modified: number | null;
  runtime_version_hint: string | null;
}

export interface WorkspaceState {
  label: string;
  summary: string;
  category: StateCategory;
  why_factors: string[];
  primary_uncertainty?: string | null;
}

export interface GitConnection {
  entity_id: string;
  repo_path: string;
  current_branch: string | null;
  is_clean: boolean;
  commit_count: number | null;
  last_commit_timestamp: number | null;
  last_commit_hash: string | null;
  last_commit_message: string | null;
  last_commit_author: string | null;
  has_uncommitted_changes: boolean;
  has_remote: boolean;
  remote_host: string | null;
  remote_repo_id: string | null;
  repo_size_bytes: number | null;
  is_worktree: boolean;
  worktree_parent_repo: string | null;
  dirty_files?: GitDirtyFile[];
  dirty_count?: number;
  oldest_dirty_timestamp?: number | null;
  unprotected_env_files?: string[];
  merged_branches?: string[];
}

export interface ProcessConnection {
  entity_id: string;
  pid: number;
  name: string;
  exe_path: string | null;
  cwd: string | null;
  parent_pid: number | null;
  create_time: number | null;
  memory_bytes: number | null;
  cpu_percent: number | null;
  cmdline_preview: string | null;
  is_shell: boolean;
  ports?: number[];
}

export interface RuntimeConnection {
  entity_id: string;
  name?: string;
  runtime?: string;
  version: string;
  executable_path?: string;
  path?: string | null;
  install_path?: string | null;
  manager?: string | null;
  is_system?: boolean;
}

export interface DockerConnection {
  entity_id: string;
  container_id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number | null;
  bind_mounts: string[];
  named_volumes: string[];
  ports: string[];
}

export interface DependencyConnection {
  entity_id: string;
  dep_type: string;
  path: string;
  size_bytes: number | null;
  package_count?: number | null;
  is_stale?: boolean;
}

export interface CacheConnection {
  entity_id: string;
  category: string;
  path: string;
  size_bytes: number | null;
  entry_count: number | null;
  last_modified: number | null;
  is_shared?: boolean;
  scope?: string;
  scope_explanation?: string;
}

export interface ProcessGroup {
  name: string;
  label: string;
  parent_pid: number;
  count: number;
  pids: number[];
  total_memory_bytes: number;
  processes: ProcessConnection[];
}

export interface WorkspaceConnections {
  git: GitConnection | null;
  processes: ProcessConnection[];
  process_groups?: ProcessGroup[];
  runtimes: RuntimeConnection[];
  docker: DockerConnection[];
  dependencies: DependencyConnection[];
  caches: CacheConnection[];
}

export interface RelationshipItem {
  source_id: string;
  target_id: string;
  rel_type: string;
  observability: ObservabilityLevel;
  evidence: string;
}

export interface FindingItem {
  id: string;
  title: string;
  category: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  evidence: string[];
  explanation: string;
  recommendation: string;
  action_boundary?: string;
  entities_involved: string[];
  confidence: number;
}

export interface EvidenceItem {
  category: string;
  label: string;
  value: string;
  detail?: string;
  timestamp?: number;
  verified: boolean;
}

export interface ActionBoundary {
  read_only: boolean;
  notice: string;
  verification_steps: string[];
}

export interface InspectionMetadata {
  scan_duration_ms: number;
  engine_version: string;
  timestamp: number;
  hostname: string;
  root: string;
}

export interface WorkspaceInspection {
  workspace: WorkspaceDetails;
  state: WorkspaceState;
  connections: WorkspaceConnections;
  primary_uncertainty?: string | null;
  entities: Record<string, unknown>[];
  relationships: RelationshipItem[];
  findings: FindingItem[];
  evidence: EvidenceItem[];
  uncertainties: string[];
  action_boundary: ActionBoundary;
  metadata: InspectionMetadata;
}

export interface DisposableArtifact {
  path: string;
  name: string;
  category: string;
  label: string;
  size_bytes: number;
  project_path: string;
}

export interface EnvironmentSummary {
  total_workspaces: number;
  active_count: number;
  attention_count: number;
  dormant_count: number;
  inactive_count?: number;
  paused_count: number;
  neutral_count: number;
  total_processes: number;
  total_runtimes: number;
  total_containers: number;
  total_caches: number;
  reclaimable_bytes?: number;
  disposable_artifact_count?: number;
}

export interface EnvironmentOverview {
  summary: EnvironmentSummary;
  workspaces: WorkspaceSummary[];
  system: {
    runtimes: RuntimeConnection[];
    processes: ProcessConnection[];
    containers: DockerConnection[];
    caches: CacheConnection[];
    artifacts?: DisposableArtifact[];
  };
  findings: FindingItem[];
  metadata: {
    scan_duration_ms: number;
    engine_version: string;
    timestamp: number;
    hostname: string;
    scan_roots: string[];
  };
}

export interface CleanSlateCandidate {
  pid: number;
  name: string;
  cwd: string | null;
  memory_bytes: number;
  ports: number[];
  uptime_seconds: number;
}

export interface CleanSlateResult {
  success: boolean;
  terminated_count: number;
  freed_memory_bytes: number;
  terminated_processes: { pid: number; name: string; memory_bytes: number }[];
  errors: { pid: number; name: string; error: string }[];
}

export interface DockerDiskItem {
  type: string;
  total_count: number;
  active_count: number;
  size_raw: string;
  size_bytes: number;
  reclaimable_raw: string;
  reclaimable_bytes: number;
}

export interface DockerDiskUsage {
  available: boolean;
  message: string;
  items: DockerDiskItem[];
  total_size_bytes: number;
  reclaimable_bytes: number;
}

export interface DockerPruneResult {
  success: boolean;
  target?: string;
  freed_space?: string;
  message?: string;
  error?: string;
}

export interface GlobalCacheItem {
  id: string;
  label: string;
  path: string;
  description: string;
  size_bytes: number;
  safe_to_purge: boolean;
}

export interface CachePurgeResult {
  success: boolean;
  total_freed_bytes: number;
  success_count: number;
  failed_count: number;
  results: {
    success: boolean;
    id: string;
    label: string;
    path: string;
    freed_bytes: number;
    message?: string;
    error?: string;
  }[];
}

export interface HealthTip {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'urgent';
  action_label?: string | null;
  action_type?: 'stash' | 'add_gitignore' | 'prune_branches' | 'clean_artifacts' | 'free_port' | string | null;
  action_payload?: Record<string, any> | null;
}

export interface CleanupVerdict {
  path: string;
  name: string;
  risk: 'safe' | 'review' | 'danger';
  headline: string;
  reasons: string[];
  rebuild_command?: string | null;
  warnings: string[];
  size_bytes: number;
  project_path: string;
}

export interface WorkspaceHealth {
  workspace_path: string;
  workspace_name: string;
  health_score: number;
  summary: string;
  tips: HealthTip[];
  cleanup_verdicts: CleanupVerdict[];
}

export interface AiConfig {
  provider: 'rules' | 'groq' | 'ollama';
  groq_api_key: string;
  groq_model: string;
  ollama_url: string;
  ollama_model: string;
}

export interface AiTestResult {
  success: boolean;
  provider: string;
  message?: string;
  error?: string;
}

export interface AiResponse {
  success: boolean;
  answer: string;
  provider: string;
  model?: string;
  error?: string;
}

export interface GitStashItem {
  index: number;
  stash_ref: string;
  date: string;
  message: string;
  branch?: string;
}

export interface SystemCleanupTarget {
  id: string;
  name: string;
  category: 'system' | 'browser' | 'diagnostics' | 'developer';
  category_label: string;
  description: string;
  risk: 'safe' | 'review' | 'danger';
  safety_notice: string;
  is_default_selected: boolean;
  size_bytes: number;
  item_count: number;
  paths: string[];
}

export interface SystemCleanupResult {
  success: boolean;
  total_freed_bytes: number;
  total_deleted_count: number;
  total_skipped_count: number;
  results: {
    id: string;
    success: boolean;
    freed_bytes: number;
    deleted_count: number;
    skipped_count: number;
    message?: string;
    error?: string;
  }[];
}

export interface CleanupLiveProgress {
  is_running: boolean;
  current_phase: string;
  current_file: string;
  items_deleted: number;
  items_skipped: number;
  bytes_freed: number;
  percent: number;
  recent_logs: string[];
  done: boolean;
  error?: string | null;
  summary?: {
    total_freed_bytes: number;
    total_deleted_count: number;
    total_skipped_count: number;
    elapsed_seconds?: number;
    results?: any[];
  } | null;
}





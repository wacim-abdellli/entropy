export type StateCategory = 'active' | 'attention' | 'dormant' | 'inactive' | 'paused' | 'neutral';

export type ObservabilityLevel = 'directly_observable' | 'strongly_inferable' | 'probabilistic';

export interface GitDirtyFile {
  status: 'modified' | 'deleted' | 'untracked' | 'added' | 'renamed' | string;
  path: string;
}

export interface SecretIssue {
  path: string;
  name: string;
  category: 'env' | 'private_key' | 'credential';
  status: 'tracked' | 'unignored' | 'protected';
  risk: 'high' | 'medium' | 'safe';
  action?: 'untrack' | 'ignore' | null;
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
  secret_issues?: SecretIssue[];
  merged_branches?: string[];
  commits_ahead?: number;
  commits_behind?: number;
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
  commits_ahead?: number;
  commits_behind?: number;
  is_worktree: boolean;
  worktree_parent_repo: string | null;
  dirty_files?: GitDirtyFile[];
  dirty_count?: number;
  oldest_dirty_timestamp?: number | null;
  unprotected_env_files?: string[];
  secret_issues?: SecretIssue[];
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
  lockfile_mtime?: number | null;
  dep_folder_mtime?: number | null;
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
  is_running?: boolean;
  locking_process?: string | null;
  process_app_name?: string | null;
  lock_message?: string | null;
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

export interface VirtualDiskItem {
  id: string;
  path: string;
  name: string;
  category: 'docker' | 'wsl' | string;
  size_bytes: number;
  size_formatted: string;
  description: string;
  wsl_running?: boolean;
}

export interface PerformanceTuningRecommendation {
  id: string;
  title: string;
  impact: 'High' | 'Very High' | 'Medium';
  category: 'stability' | 'performance';
  description: string;
  action_label: string;
  action_id: string;
  payload?: Record<string, any>;
}

export interface PerformanceTuningReport {
  dev_mode_enabled: boolean;
  long_paths_enabled: boolean;
  defender_exclusions_count: number;
  defender_exclusions: string[];
  recommendations: PerformanceTuningRecommendation[];
}

export interface LockingProcess {
  pid: number;
  name: string;
  exe_path: string;
  cmdline: string;
  memory_bytes: number;
  memory_formatted: string;
  ports: number[];
  source: string;
  is_protected: boolean;
  can_terminate: boolean;
}

export interface FileLockDiagnostic {
  path: string;
  name: string;
  is_dir: boolean;
  exists: boolean;
  is_locked: boolean;
  locking_processes: LockingProcess[];
  message: string;
}

export interface UnlockResult {
  success: boolean;
  path: string;
  is_now_unlocked: boolean;
  terminated: { pid: number; name: string }[];
  failed: { pid: number; name: string; error: string }[];
  message: string;
}

export interface PathEntryItem {
  raw: string;
  expanded: string;
  is_valid: boolean;
  is_duplicate: boolean;
  index: number;
}

export interface BinaryCollision {
  binary: string;
  active_path: string;
  active_version: string | null;
  shadowed_paths: string[];
  total_found: number;
}

export interface PathAuditReport {
  user_path_length: number;
  system_path_length: number;
  safe_length_limit: number;
  exceeds_limit: boolean;
  user_entries_count: number;
  dead_entries_count: number;
  duplicate_entries_count: number;
  user_entries: PathEntryItem[];
  dead_entries: string[];
  duplicate_entries: string[];
  collisions: BinaryCollision[];
  summary: string;
  health_score: number;
  status: 'optimal' | 'warning' | 'critical';
}

export interface PathPruneResult {
  success: boolean;
  message: string;
  backup_path?: string;
  initial_length?: number;
  new_length?: number;
  freed_chars?: number;
  initial_count?: number;
  remaining_count?: number;
  pruned_dead_count?: number;
  pruned_duplicate_count?: number;
  pruned_manual_count?: number;
  error?: string;
}

export interface DevDriveVolume {
  drive_letter: string;
  label: string;
  file_system: string;
  is_dev_drive: boolean;
  total_bytes: number;
  free_bytes: number;
}

export interface PackageCacheConfig {
  tool: string;
  current_path: string;
  is_on_dev_drive: boolean;
  is_on_system_drive: boolean;
  recommended_path?: string | null;
}

export interface DevDriveStatusReport {
  is_supported: boolean;
  os_build: number;
  os_version: string;
  min_required_build: number;
  support_message: string;
  mounted_dev_drives: DevDriveVolume[];
  mounted_volumes: DevDriveVolume[];
  package_caches: PackageCacheConfig[];
  has_active_dev_drive: boolean;
  recommendations: {
    id: string;
    title: string;
    impact: string;
    description: string;
    action_label: string;
    target_drive?: string;
  }[];
}

export interface DevDriveRelocateResult {
  success: boolean;
  message?: string;
  target_dir?: string;
  updated_tools?: string[];
  error?: string;
}

export interface MemoryBoosterProcessResult {
  success: boolean;
  pid: number;
  name: string;
  before_bytes: number;
  after_bytes: number;
  freed_bytes: number;
  freed_formatted: string;
  error?: string;
}

export interface MemoryBoosterReport {
  success: boolean;
  total_freed_bytes: number;
  total_freed_formatted: string;
  target_count: number;
  trimmed_count: number;
  results: MemoryBoosterProcessResult[];
  message?: string;
  error?: string;
}

export interface GlobalSecretItem {
  repo_path: string;
  repo_name: string;
  path: string;
  category: 'env' | 'private_key' | 'credential';
  status: 'tracked' | 'unignored' | 'protected';
  risk: 'critical' | 'warning' | 'safe';
}

export interface GlobalSecretsRadarReport {
  total_repositories: number;
  vulnerable_repositories: number;
  tracked_count: number;
  unignored_count: number;
  protected_count: number;
  total_issues: number;
  items: GlobalSecretItem[];
}

export interface ShieldSecretsResult {
  success: boolean;
  repos_shielded_count: number;
  total_shielded: number;
  total_untracked: number;
  total_ignored: number;
  results: any[];
  message: string;
}

export interface DefenderBatchResult {
  success: boolean;
  paths?: string[];
  count?: number;
  message?: string;
  error?: string;
}

export interface UserProfileInfo {
  username: string;
  user_home: string;
  desktop: string;
  documents: string;
  standard_dev_roots: string[];
}

export interface SystemOsInfo {
  product_name: string;
  version: string;
  build: string;
  arch: string;
  hostname: string;
}

export interface SystemPcInfo {
  manufacturer: string;
  model: string;
}

export interface SystemCpuInfo {
  name: string;
  physical_cores: number;
  logical_cores: number;
  current_freq_mhz?: number | null;
  max_freq_mhz?: number | null;
  percent: number;
}

export interface SystemRamInfo {
  total_bytes: number;
  used_bytes: number;
  available_bytes: number;
  percent: number;
  swap_total_bytes: number;
  swap_used_bytes: number;
}

export interface SystemGpuInfo {
  name: string;
  adapter_ram_bytes?: number | null;
  driver_version?: string | null;
}

export interface SystemBatteryInfo {
  has_battery: boolean;
  percent?: number | null;
  power_plugged?: boolean | null;
}

export interface SystemDrivePartition {
  mountpoint: string;
  device: string;
  label: string;
  fstype: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  percent: number;
  is_system: boolean;
  status: 'healthy' | 'warning' | 'critical';
  media_type?: string | null;
  friendly_name?: string | null;
}

export interface PhysicalDiskInfo {
  device_id: string;
  friendly_name: string;
  media_type: string;
  bus_type: string;
  size_bytes: number;
}

export interface RawPartitionInfo {
  disk_number: number;
  partition_number: number;
  drive_letter?: string | null;
  size_bytes: number;
  partition_type: string;
}

export interface SystemSpecsReport {
  os: SystemOsInfo;
  pc: SystemPcInfo;
  cpu: SystemCpuInfo;
  ram: SystemRamInfo;
  gpus: SystemGpuInfo[];
  battery: SystemBatteryInfo;
  uptime_seconds: number;
  uptime_formatted: string;
  drives: SystemDrivePartition[];
  physical_disks?: PhysicalDiskInfo[];
  raw_partitions?: RawPartitionInfo[];
}

export interface LiveSystemMetrics {
  cpu_percent: number;
  ram_percent: number;
  ram_used_bytes: number;
  ram_total_bytes: number;
  disk_read_bytes_sec: number;
  disk_write_bytes_sec: number;
  net_sent_bytes_sec: number;
  net_recv_bytes_sec: number;
  uptime_seconds: number;
  uptime_formatted: string;
}

export interface StartupProgramItem {
  id: string;
  name: string;
  command: string;
  exe_path: string;
  exists: boolean;
  is_enabled: boolean;
  scope: 'user_registry' | 'system_registry' | 'startup_folder';
  source: string;
  can_modify: boolean;
  impact: 'high' | 'medium' | 'low';
}

export interface LargeFileItem {
  path: string;
  name: string;
  extension: string;
  size_bytes: number;
  last_modified: number;
  category: 'media' | 'archive' | 'database' | 'model_ml' | 'binary' | 'dataset' | 'other';
  workspace_root: string;
  relative_path: string;
}

export interface InstalledAppItem {
  id: string;
  name: string;
  version?: string | null;
  publisher?: string | null;
  install_date?: string | null;
  size_bytes?: number | null;
  size_formatted?: string;
  install_location?: string | null;
  scope: 'user' | 'system';
  category: 'development' | 'browser' | 'communication' | 'productivity' | 'utility' | 'media' | 'game' | 'other';
  can_uninstall: boolean;
  uninstall_command?: string | null;
  is_dev_tool: boolean;
}

export interface DuplicateFileItem {
  path: string;
  name: string;
  extension: string;
  size_bytes: number;
  last_modified: number;
  last_modified_formatted: string;
  relative_path: string;
  workspace_root: string;
}

export interface DuplicateGroupItem {
  group_id: string;
  file_size_bytes: number;
  file_size_formatted: string;
  file_count: number;
  wasted_bytes: number;
  wasted_formatted: string;
  files: DuplicateFileItem[];
}

export interface DuplicateReport {
  groups: DuplicateGroupItem[];
  total_groups: number;
  total_duplicate_files: number;
  total_wasted_bytes: number;
  total_wasted_formatted: string;
  scanned_roots: string[];
}

export interface NetworkConnectionItem {
  id: string;
  fd: number;
  family: 'IPv4' | 'IPv6' | string;
  protocol: 'TCP' | 'UDP' | string;
  local_ip: string;
  local_port: number;
  remote_ip: string | null;
  remote_port: number | null;
  status: string;
  pid: number | null;
  process_name: string;
  exe_path: string | null;
  cmdline_preview: string | null;
  is_listening: boolean;
  is_dev: boolean;
  is_protected: boolean;
}

export interface PortDiagnosticReport {
  port: number;
  is_occupied: boolean;
  message: string;
  occupants: NetworkConnectionItem[];
}

export interface RelocationCandidateItem {
  id: string;
  name: string;
  original_path: string;
  category: string;
  size_bytes: number;
  size_formatted: string;
  item_count: number;
  is_junction: boolean;
  is_moveable: boolean;
  description: string;
  target_recommendation?: string | null;
}

export interface AvailableDestinationItem {
  drive: string;
  device: string;
  fstype: string;
  is_system: boolean;
  total_bytes: number;
  free_bytes: number;
  free_formatted: string;
  percent_used: number;
  recommended: boolean;
}

export interface ActiveJunctionItem {
  id: string;
  name: string;
  original_path: string;
  destination_path: string;
  size_bytes: number;
  size_formatted: string;
  created_at: string;
  is_active: boolean;
  is_live?: boolean;
}

export interface RelocationResult {
  success: boolean;
  message?: string;
  error?: string;
  freed_bytes?: number;
  freed_formatted?: string;
  junction?: ActiveJunctionItem;
  locking_processes?: any[];
}

export interface RestoreJunctionResult {
  success: boolean;
  message?: string;
  error?: string;
}

// ── Smart Storage Recommendations Engine ──

export interface DormantArtifactItem {
  name: string;
  path: string;
  size_bytes: number;
  size_formatted: string;
  rebuild_command: string;
}

export interface DormantWorkspaceItem {
  path: string;
  name: string;
  inactivity_days: number;
  last_active_timestamp: number;
  last_active_formatted: string;
  is_git: boolean;
  is_clean: boolean;
  artifacts: DormantArtifactItem[];
  total_reclaimable_bytes: number;
  total_reclaimable_formatted: string;
}

export interface StaleDownloadItem {
  path: string;
  name: string;
  extension: string;
  size_bytes: number;
  size_formatted: string;
  age_days: number;
  last_modified: number;
  category: 'installer' | 'archive' | 'disk_image';
}

export interface AiModelStorageItem {
  id: string;
  name: string;
  framework: string;
  path: string;
  size_bytes: number;
  size_formatted: string;
  last_modified: number;
}

export interface StorageRecommendationReport {
  total_reclaimable_bytes: number;
  total_reclaimable_formatted: string;
  dormant_workspaces: DormantWorkspaceItem[];
  dormant_workspaces_bytes: number;
  dormant_workspaces_formatted: string;
  stale_downloads: StaleDownloadItem[];
  stale_downloads_bytes: number;
  stale_downloads_formatted: string;
  ai_models: AiModelStorageItem[];
  ai_models_bytes: number;
  ai_models_formatted: string;
}

export interface CleanDormantResult {
  success: boolean;
  cleaned_artifacts: string[];
  freed_bytes: number;
  freed_formatted: string;
  errors?: string[];
  error?: string;
}

export interface CleanStaleDownloadsResult {
  success: boolean;
  deleted_count: number;
  failed_count: number;
  freed_bytes: number;
  freed_formatted: string;
  deleted_paths: string[];
  error?: string;
}

// ── SSD Storage Lens & Space Cartography ──

export interface SsdDriveOverview {
  drive: string;
  mountpoint: string;
  label: string;
  fstype: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  percent_used: number;
  total_formatted: string;
  used_formatted: string;
  free_formatted: string;
  is_system: boolean;
  is_dev_drive: boolean;
}

export interface DriveCategoryItem {
  id: string;
  label: string;
  description: string;
  size_bytes: number;
  size_formatted: string;
  percent_of_used: number;
  color_var: string;
  is_reclaimable: boolean;
}

export interface DriveCategoryBreakdown {
  drive: string;
  total_bytes: number;
  total_formatted: string;
  used_bytes: number;
  used_formatted: string;
  free_bytes: number;
  free_formatted: string;
  percent_used: number;
  total_reclaimable_bytes: number;
  total_reclaimable_formatted: string;
  categories: DriveCategoryItem[];
}

export interface PathBreakdownBreadcrumb {
  name: string;
  path: string;
}

export interface PathBreakdownNode {
  id: string;
  name: string;
  path: string;
  size_bytes: number;
  size_formatted: string;
  is_dir: boolean;
  category: 'artifact' | 'cache' | 'virtual_disk' | 'ai_model' | 'download' | 'media' | 'source_code' | 'system' | 'folder' | 'file';
  category_label: string;
  last_modified: number;
  percentage: number;
}

export interface PathBreakdownReport {
  path: string;
  name: string;
  breadcrumbs: PathBreakdownBreadcrumb[];
  total_size_bytes: number;
  total_size_formatted: string;
  items: PathBreakdownNode[];
  error?: string;
}

// ── Partition Shrink & Secondary Drive Wizard ──

export interface ShrinkStepItem {
  step: number;
  title: string;
  instruction: string;
  action?: 'launch_diskmgmt';
  copy_value?: string;
}

export interface ShrinkAdvisoryReport {
  drive: string;
  mountpoint: string;
  total_bytes: number;
  total_formatted: string;
  used_bytes: number;
  used_formatted: string;
  free_bytes: number;
  free_formatted: string;
  can_shrink: boolean;
  min_system_buffer_gb: number;
  max_safe_shrink_mb: number;
  max_safe_shrink_formatted: string;
  recommended_shrink_mb: number;
  recommended_shrink_formatted: string;
  c_remaining_free_formatted: string;
  suggested_letter: string;
  available_letters: string[];
  safety_notes: string[];
  steps: ShrinkStepItem[];
  error?: string;
}

export interface LaunchDiskManagementResult {
  success: boolean;
  message?: string;
  error?: string;
}


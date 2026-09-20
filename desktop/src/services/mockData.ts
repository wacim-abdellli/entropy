import { EnvironmentOverview, WorkspaceInspection } from '../types/entropy';

export const MOCK_ENTROPY_INSPECTION: WorkspaceInspection = {
  workspace: {
    id: "project:C:\\Users\\pc\\Desktop\\entropy",
    name: "entropy",
    path: "C:\\Users\\pc\\Desktop\\entropy",
    project_type: "python",
    total_size_bytes: 763120,
    created: 1789868689.27,
    last_modified: Date.now() / 1000 - 120,
    runtime_version_hint: null,
  },
  state: {
    label: "Active / Current Codebase",
    summary: "Recent modifications or commits observed within the last 30 days.",
    category: "active",
    why_factors: [
      "10 active processes running directly from this directory (including python.exe, powershell.exe, pyrefly.exe)",
      "Uncommitted local modifications present in working tree",
      "Git commit observed 14m ago on branch 'main'",
      "Active process execution on Python 3.14.3 runtime"
    ],
  },
  connections: {
    git: {
      entity_id: "git:C:\\Users\\pc\\Desktop\\entropy",
      repo_path: "C:\\Users\\pc\\Desktop\\entropy",
      current_branch: "main",
      is_clean: false,
      commit_count: 10,
      last_commit_timestamp: Date.now() / 1000 - 840,
      last_commit_hash: "c3d288e",
      last_commit_message: "Complete Phase 9 v0.1 Productization",
      last_commit_author: "wacim <wacim@entropy.local>",
      has_uncommitted_changes: true,
      has_remote: true,
      remote_host: "github.com",
      remote_repo_id: "github.com/wacim-abdellli/entropy",
      repo_size_bytes: 217254,
      is_worktree: false,
      worktree_parent_repo: null,
    },
    processes: [
      {
        entity_id: "proc:20116_1789888590",
        pid: 20116,
        name: "python.exe",
        exe_path: "C:\\Python314\\python.exe",
        cwd: "C:\\Users\\pc\\Desktop\\entropy",
        parent_pid: 1500,
        create_time: Date.now() / 1000 - 300,
        memory_bytes: 25600000,
        cpu_percent: 0.8,
        cmdline_preview: "python.exe scan.py inspect . --json",
        is_shell: false,
      },
      {
        entity_id: "proc:12340_1789881865",
        pid: 12340,
        name: "pyrefly.exe",
        exe_path: "C:\\Users\\pc\\AppData\\Local\\Programs\\pyrefly\\pyrefly.exe",
        cwd: "C:\\Users\\pc\\Desktop\\entropy",
        parent_pid: 13348,
        create_time: Date.now() / 1000 - 2400,
        memory_bytes: 83048960,
        cpu_percent: 0.2,
        cmdline_preview: "pyrefly.exe --lsp",
        is_shell: false,
      },
      {
        entity_id: "proc:1500_1789888590",
        pid: 1500,
        name: "powershell.exe",
        exe_path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        cwd: "C:\\Users\\pc\\Desktop\\entropy",
        parent_pid: 13348,
        create_time: Date.now() / 1000 - 1200,
        memory_bytes: 85249024,
        cpu_percent: 0.0,
        cmdline_preview: "powershell.exe",
        is_shell: true,
      },
      {
        entity_id: "proc:13348_1789870184",
        pid: 13348,
        name: "Antigravity IDE.exe",
        exe_path: "C:\\Program Files\\Antigravity\\Antigravity IDE.exe",
        cwd: "C:\\Users\\pc\\Desktop\\entropy",
        parent_pid: 1024,
        create_time: Date.now() / 1000 - 7200,
        memory_bytes: 105172992,
        cpu_percent: 1.4,
        cmdline_preview: "Antigravity IDE.exe C:\\Users\\pc\\Desktop\\entropy",
        is_shell: false,
      },
    ],
    runtimes: [
      {
        entity_id: "runtime:python_3.14.3",
        name: "python",
        version: "3.14.3",
        executable_path: "C:\\Python314\\python.exe",
        install_path: "C:\\Python314",
        is_system: true,
      },
      {
        entity_id: "runtime:node_24.16.0",
        name: "node",
        version: "24.16.0",
        executable_path: "C:\\Program Files\\nodejs\\node.exe",
        install_path: "C:\\Program Files\\nodejs",
        is_system: true,
      },
    ],
    docker: [],
    dependencies: [],
    caches: [
      {
        entity_id: "cache:pip",
        category: "pip",
        path: "C:\\Users\\pc\\AppData\\Local\\pip\\cache",
        size_bytes: 84192000,
        entry_count: 38,
        last_modified: Date.now() / 1000 - 3600,
      }
    ],
  },
  entities: [
    {
      entity_id: "project:C:\\Users\\pc\\Desktop\\entropy",
      path: "C:\\Users\\pc\\Desktop\\entropy",
      project_type: "python",
      total_size_bytes: 763120,
    },
    {
      entity_id: "git:C:\\Users\\pc\\Desktop\\entropy",
      current_branch: "main",
      remote_repo_id: "github.com/wacim-abdellli/entropy",
    },
    {
      entity_id: "proc:20116_1789888590",
      name: "python.exe",
      pid: 20116,
    },
    {
      entity_id: "proc:12340_1789881865",
      name: "pyrefly.exe",
      pid: 12340,
    },
    {
      entity_id: "proc:1500_1789888590",
      name: "powershell.exe",
      pid: 1500,
    },
    {
      entity_id: "runtime:python_3.14.3",
      name: "python",
      version: "3.14.3",
    },
  ],
  relationships: [
    {
      source_id: "project:C:\\Users\\pc\\Desktop\\entropy",
      target_id: "git:C:\\Users\\pc\\Desktop\\entropy",
      rel_type: "contains",
      observability: "directly_observable",
      evidence: ".git repository located directly at C:\\Users\\pc\\Desktop\\entropy",
    },
    {
      source_id: "proc:20116_1789888590",
      target_id: "project:C:\\Users\\pc\\Desktop\\entropy",
      rel_type: "runs_from",
      observability: "strongly_inferable",
      evidence: "Process 'python.exe' (PID 20116) working directory (C:\\Users\\pc\\Desktop\\entropy) is within project",
    },
    {
      source_id: "proc:12340_1789881865",
      target_id: "project:C:\\Users\\pc\\Desktop\\entropy",
      rel_type: "runs_from",
      observability: "strongly_inferable",
      evidence: "Process 'pyrefly.exe' (PID 12340) working directory (C:\\Users\\pc\\Desktop\\entropy) is within project",
    },
    {
      source_id: "proc:1500_1789888590",
      target_id: "project:C:\\Users\\pc\\Desktop\\entropy",
      rel_type: "runs_from",
      observability: "strongly_inferable",
      evidence: "Process 'powershell.exe' (PID 1500) working directory (C:\\Users\\pc\\Desktop\\entropy) is within project",
    },
    {
      source_id: "proc:20116_1789888590",
      target_id: "runtime:python_3.14.3",
      rel_type: "runs_on",
      observability: "strongly_inferable",
      evidence: "Executable path matches runtime installation python 3.14.3",
    },
  ],
  findings: [],
  evidence: [
    {
      category: "git_branch",
      label: "Git Branch",
      value: "main",
      detail: "Remote: github.com/wacim-abdellli/entropy",
      verified: true,
    },
    {
      category: "git_commit",
      label: "Last Commit",
      value: "14m ago",
      detail: "10 commits in HEAD history",
      timestamp: Date.now() / 1000 - 840,
      verified: true,
    },
    {
      category: "git_working_tree",
      label: "Working Tree",
      value: "Uncommitted local modifications",
      detail: "status --porcelain checked",
      verified: true,
    },
    {
      category: "process",
      label: "Process: python.exe",
      value: "PID 20116 (Active Process)",
      detail: "cwd=C:\\Users\\pc\\Desktop\\entropy RSS=24.4 MB",
      verified: true,
    },
    {
      category: "process",
      label: "Process: pyrefly.exe",
      value: "PID 12340 (Language Server)",
      detail: "cwd=c:\\Users\\pc\\Desktop\\entropy RSS=79.2 MB",
      verified: true,
    },
    {
      category: "process",
      label: "Process: powershell.exe",
      value: "PID 1500 (Interactive Shell)",
      detail: "cwd=c:\\Users\\pc\\Desktop\\entropy RSS=81.3 MB",
      verified: true,
    },
  ],
  uncertainties: [
    "Local modifications exist, but Entropy cannot determine whether they represent valuable human work or generated artifacts.",
    "Process execution confirms running code, but Entropy cannot determine if it is an active developer session or an unattended background service."
  ],
  action_boundary: {
    read_only: true,
    notice: "Entropy is read-only and performs zero automatic cleanup or remediation.",
    verification_steps: [
      "Run 'git status' and 'git diff' inside this directory to inspect modified/untracked files.",
      "Verify whether changes are valuable code edits or disposable build logs/residue.",
      "Check if the current branch exists on remote ('git branch -r') before deleting or archiving."
    ],
  },
  metadata: {
    scan_duration_ms: 182,
    engine_version: "0.1.0",
    timestamp: Date.now() / 1000,
    hostname: "DESKTOP-OQLTNEG",
    root: "C:\\Users\\pc\\Desktop\\entropy",
  },
};

export const MOCK_TALIB_INSPECTION: WorkspaceInspection = {
  workspace: {
    id: "project:C:\\Users\\pc\\Desktop\\talib_ilm-main",
    name: "talib_ilm-main",
    path: "C:\\Users\\pc\\Desktop\\talib_ilm-main",
    project_type: "python",
    total_size_bytes: 4210500,
    created: 1788000000,
    last_modified: 1788500000,
    runtime_version_hint: "3.11",
  },
  state: {
    label: "Stale / Inactive Project",
    summary: "No filesystem activity or commits observed in over 60 days.",
    category: "dormant",
    why_factors: [
      "No filesystem modifications in 72 days",
      "Zero active processes associated with this directory",
      "No active Docker container or background service attached"
    ],
  },
  connections: {
    git: null,
    processes: [],
    runtimes: [
      {
        entity_id: "runtime:python_3.14.3",
        name: "python",
        version: "3.14.3",
        executable_path: "C:\\Python314\\python.exe",
        install_path: "C:\\Python314",
        is_system: true,
      }
    ],
    docker: [],
    dependencies: [
      {
        entity_id: "dep:venv",
        dep_type: "venv",
        path: "C:\\Users\\pc\\Desktop\\talib_ilm-main\\.venv",
        size_bytes: 184500000,
        package_count: 42,
        is_stale: true,
      }
    ],
    caches: [],
  },
  entities: [
    {
      entity_id: "project:C:\\Users\\pc\\Desktop\\talib_ilm-main",
      path: "C:\\Users\\pc\\Desktop\\talib_ilm-main",
      project_type: "python",
      total_size_bytes: 4210500,
    },
    {
      entity_id: "dep:venv",
      path: "C:\\Users\\pc\\Desktop\\talib_ilm-main\\.venv",
      size_bytes: 184500000,
    }
  ],
  relationships: [
    {
      source_id: "project:C:\\Users\\pc\\Desktop\\talib_ilm-main",
      target_id: "dep:venv",
      rel_type: "contains",
      observability: "directly_observable",
      evidence: "Virtualenv directory .venv directly inside project folder",
    }
  ],
  findings: [
    {
      id: "dormant_large_dependency_environment",
      title: "Inactive Workspace Retaining 184 MB Virtual Environment",
      category: "resource_retention",
      severity: "low",
      evidence: [
        "Workspace has had zero activity for 72 days",
        ".venv occupies 184.5 MB on disk",
        "Zero running processes referencing this virtualenv"
      ],
      explanation: "A dormant project retains local virtual environment packages that could easily be recreated from requirements.txt if resumed.",
      recommendation: "If you are not currently actively developing talib_ilm-main, you can safely remove .venv and recreate it with 'python -m venv .venv && pip install -r requirements.txt' when needed.",
      action_boundary: "Entropy does not delete virtualenvs. You can manually inspect requirements.txt first.",
      entities_involved: ["project:C:\\Users\\pc\\Desktop\\talib_ilm-main", "dep:venv"],
      confidence: 0.95,
    }
  ],
  evidence: [
    {
      category: "git_metadata",
      label: "Git Repository",
      value: "Unversioned Directory",
      detail: "No .git folder located",
      verified: true,
    },
    {
      category: "filesystem_mtime",
      label: "Filesystem Mtime",
      value: "72 days ago",
      timestamp: 1788500000,
      verified: true,
    },
  ],
  uncertainties: [
    "Unversioned codebase: without Git, history and previous branches cannot be inspected."
  ],
  action_boundary: {
    read_only: true,
    notice: "Entropy is read-only and performs zero automatic cleanup or remediation.",
    verification_steps: [
      "Check if any personal notes or uncommitted scripts exist inside this folder before archiving."
    ],
  },
  metadata: {
    scan_duration_ms: 110,
    engine_version: "0.1.0",
    timestamp: Date.now() / 1000,
    hostname: "DESKTOP-OQLTNEG",
    root: "C:\\Users\\pc\\Desktop\\talib_ilm-main",
  },
};

export const MOCK_AFTERSALES_INSPECTION: WorkspaceInspection = {
  workspace: {
    id: "project:C:\\Users\\pc\\Desktop\\AfterSalesManagement",
    name: "AfterSalesManagement",
    path: "C:\\Users\\pc\\Desktop\\AfterSalesManagement",
    project_type: "node",
    total_size_bytes: 142000000,
    created: 1785000000,
    last_modified: 1787000000,
    runtime_version_hint: "20.x",
  },
  state: {
    label: "Paused / Work in Progress",
    summary: "Uncommitted changes exist on feature branch, but workspace has had no execution for 45 days.",
    category: "attention",
    why_factors: [
      "Branch 'feature/rma-tracker' has 8 modified files not yet committed",
      "Last commit made 45 days ago",
      "No active Node.js server or container running"
    ],
  },
  connections: {
    git: {
      entity_id: "git:C:\\Users\\pc\\Desktop\\AfterSalesManagement",
      repo_path: "C:\\Users\\pc\\Desktop\\AfterSalesManagement",
      current_branch: "feature/rma-tracker",
      is_clean: false,
      commit_count: 48,
      last_commit_timestamp: 1787000000,
      last_commit_hash: "a49b21f",
      last_commit_message: "WIP: add RMA tracking status endpoint",
      last_commit_author: "wacim <wacim@entropy.local>",
      has_uncommitted_changes: true,
      has_remote: true,
      remote_host: "github.com",
      remote_repo_id: "github.com/company/AfterSalesManagement",
      repo_size_bytes: 12400000,
      is_worktree: false,
      worktree_parent_repo: null,
    },
    processes: [],
    runtimes: [
      {
        entity_id: "runtime:node_24.16.0",
        name: "node",
        version: "24.16.0",
        executable_path: "C:\\Program Files\\nodejs\\node.exe",
        install_path: "C:\\Program Files\\nodejs",
        is_system: true,
      }
    ],
    docker: [],
    dependencies: [
      {
        entity_id: "dep:node_modules",
        dep_type: "node_modules",
        path: "C:\\Users\\pc\\Desktop\\AfterSalesManagement\\node_modules",
        size_bytes: 128000000,
        package_count: 890,
        is_stale: true,
      }
    ],
    caches: [
      {
        entity_id: "cache:npm",
        category: "npm",
        path: "C:\\Users\\pc\\AppData\\Local\\npm-cache",
        size_bytes: 245000000,
        entry_count: 340,
        last_modified: 1787000000,
      }
    ],
  },
  entities: [
    {
      entity_id: "project:C:\\Users\\pc\\Desktop\\AfterSalesManagement",
      path: "C:\\Users\\pc\\Desktop\\AfterSalesManagement",
      project_type: "node",
    },
    {
      entity_id: "git:C:\\Users\\pc\\Desktop\\AfterSalesManagement",
      current_branch: "feature/rma-tracker",
    }
  ],
  relationships: [
    {
      source_id: "project:C:\\Users\\pc\\Desktop\\AfterSalesManagement",
      target_id: "git:C:\\Users\\pc\\Desktop\\AfterSalesManagement",
      rel_type: "contains",
      observability: "directly_observable",
      evidence: ".git folder present",
    }
  ],
  findings: [
    {
      id: "uncommitted_changes_stale_branch",
      title: "Uncommitted Work on Stale Feature Branch",
      category: "uncommitted_risk",
      severity: "medium",
      evidence: [
        "Feature branch 'feature/rma-tracker' has 8 modified files",
        "Last commit was 45 days ago",
        "No processes or shell sessions open in this workspace"
      ],
      explanation: "Uncommitted modifications in a dormant workspace run the risk of being lost during future branch checkouts or accidental cleanups.",
      recommendation: "Review the working tree diff using 'git diff' or 'git status'. Commit your work or create a stash.",
      action_boundary: "Entropy never modifies git repositories or working trees.",
      entities_involved: ["project:C:\\Users\\pc\\Desktop\\AfterSalesManagement", "git:C:\\Users\\pc\\Desktop\\AfterSalesManagement"],
      confidence: 0.98,
    }
  ],
  evidence: [
    {
      category: "git_branch",
      label: "Git Branch",
      value: "feature/rma-tracker",
      detail: "Remote tracking: origin/feature/rma-tracker",
      verified: true,
    },
    {
      category: "git_working_tree",
      label: "Working Tree",
      value: "8 dirty files",
      detail: "Modified files in src/controllers and src/routes",
      verified: true,
    },
  ],
  uncertainties: [
    "Entropy cannot determine if the uncommitted code is an abandoned experiment or valuable unfinished business logic."
  ],
  action_boundary: {
    read_only: true,
    notice: "Entropy is read-only and performs zero automatic cleanup or remediation.",
    verification_steps: [
      "Run 'git status' and 'git diff' to view uncommitted work.",
      "Run 'git stash' or 'git commit -m \"wip\"' if you wish to preserve it safely."
    ],
  },
  metadata: {
    scan_duration_ms: 140,
    engine_version: "0.1.0",
    timestamp: Date.now() / 1000,
    hostname: "DESKTOP-OQLTNEG",
    root: "C:\\Users\\pc\\Desktop\\AfterSalesManagement",
  },
};

export const MOCK_ENVIRONMENT_OVERVIEW: EnvironmentOverview = {
  summary: {
    total_workspaces: 3,
    active_count: 1,
    attention_count: 1,
    dormant_count: 1,
    paused_count: 0,
    neutral_count: 0,
    total_processes: 12,
    total_runtimes: 3,
    total_containers: 0,
    total_caches: 2,
  },
  workspaces: [
    {
      id: "project:C:\\Users\\pc\\Desktop\\AfterSalesManagement",
      name: "AfterSalesManagement",
      path: "C:\\Users\\pc\\Desktop\\AfterSalesManagement",
      project_type: "node",
      total_size_bytes: 142000000,
      last_modified: 1787000000,
      state_label: "Paused / Work in Progress",
      state_category: "attention",
      git_branch: "feature/rma-tracker",
      git_remote: "github.com/company/AfterSalesManagement",
      last_commit_timestamp: 1787000000,
      has_uncommitted_changes: true,
      process_count: 0,
    },
    {
      id: "project:C:\\Users\\pc\\Desktop\\entropy",
      name: "entropy",
      path: "C:\\Users\\pc\\Desktop\\entropy",
      project_type: "python",
      total_size_bytes: 763120,
      last_modified: Date.now() / 1000 - 120,
      state_label: "Active / Current Codebase",
      state_category: "active",
      git_branch: "main",
      git_remote: "github.com/wacim-abdellli/entropy",
      last_commit_timestamp: Date.now() / 1000 - 840,
      has_uncommitted_changes: true,
      process_count: 4,
    },
    {
      id: "project:C:\\Users\\pc\\Desktop\\talib_ilm-main",
      name: "talib_ilm-main",
      path: "C:\\Users\\pc\\Desktop\\talib_ilm-main",
      project_type: "python",
      total_size_bytes: 4210500,
      last_modified: 1788500000,
      state_label: "Stale / Inactive Project",
      state_category: "dormant",
      git_branch: null,
      git_remote: null,
      last_commit_timestamp: null,
      has_uncommitted_changes: false,
      process_count: 0,
    },
  ],
  system: {
    runtimes: [
      {
        entity_id: "runtime:python_3.14.3",
        name: "python",
        version: "3.14.3",
        executable_path: "C:\\Python314\\python.exe",
        install_path: "C:\\Python314",
        is_system: true,
      },
      {
        entity_id: "runtime:node_24.16.0",
        name: "node",
        version: "24.16.0",
        executable_path: "C:\\Program Files\\nodejs\\node.exe",
        install_path: "C:\\Program Files\\nodejs",
        is_system: true,
      },
      {
        entity_id: "runtime:cargo_1.98.1",
        name: "cargo",
        version: "1.98.1",
        executable_path: "C:\\Users\\pc\\.cargo\\bin\\cargo.exe",
        install_path: "C:\\Users\\pc\\.cargo",
        is_system: false,
      },
    ],
    processes: [
      {
        entity_id: "proc:20116_1789888590",
        pid: 20116,
        name: "python.exe",
        exe_path: "C:\\Python314\\python.exe",
        cwd: "C:\\Users\\pc\\Desktop\\entropy",
        parent_pid: 1500,
        create_time: Date.now() / 1000 - 300,
        memory_bytes: 25600000,
        cpu_percent: 0.8,
        cmdline_preview: "python.exe scan.py inspect . --json",
        is_shell: false,
      },
      {
        entity_id: "proc:12340_1789881865",
        pid: 12340,
        name: "pyrefly.exe",
        exe_path: "C:\\Users\\pc\\AppData\\Local\\Programs\\pyrefly\\pyrefly.exe",
        cwd: "C:\\Users\\pc\\Desktop\\entropy",
        parent_pid: 13348,
        create_time: Date.now() / 1000 - 2400,
        memory_bytes: 83048960,
        cpu_percent: 0.2,
        cmdline_preview: "pyrefly.exe --lsp",
        is_shell: false,
      },
      {
        entity_id: "proc:1500_1789888590",
        pid: 1500,
        name: "powershell.exe",
        exe_path: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        cwd: "C:\\Users\\pc\\Desktop\\entropy",
        parent_pid: 13348,
        create_time: Date.now() / 1000 - 1200,
        memory_bytes: 85249024,
        cpu_percent: 0.0,
        cmdline_preview: "powershell.exe",
        is_shell: true,
      },
      {
        entity_id: "proc:13348_1789870184",
        pid: 13348,
        name: "Antigravity IDE.exe",
        exe_path: "C:\\Program Files\\Antigravity\\Antigravity IDE.exe",
        cwd: "C:\\Users\\pc\\Desktop\\entropy",
        parent_pid: 1024,
        create_time: Date.now() / 1000 - 7200,
        memory_bytes: 105172992,
        cpu_percent: 1.4,
        cmdline_preview: "Antigravity IDE.exe C:\\Users\\pc\\Desktop\\entropy",
        is_shell: false,
      },
    ],
    containers: [],
    caches: [
      {
        entity_id: "cache:pip",
        category: "pip",
        path: "C:\\Users\\pc\\AppData\\Local\\pip\\cache",
        size_bytes: 84192000,
        entry_count: 38,
        last_modified: Date.now() / 1000 - 3600,
      },
      {
        entity_id: "cache:npm",
        category: "npm",
        path: "C:\\Users\\pc\\AppData\\Local\\npm-cache",
        size_bytes: 245000000,
        entry_count: 340,
        last_modified: 1787000000,
      },
    ],
  },
  findings: [
    {
      id: "uncommitted_changes_stale_branch",
      title: "Uncommitted Work on Stale Feature Branch",
      category: "uncommitted_risk",
      severity: "medium",
      evidence: [
        "Feature branch 'feature/rma-tracker' in 'AfterSalesManagement' has 8 uncommitted modified files",
        "Last commit occurred 45 days ago",
        "Zero active process or shell session currently open in workspace"
      ],
      explanation: "Uncommitted work on a dormant branch risks accidental loss during maintenance.",
      recommendation: "Inspect diff and commit or stash changes before moving workspace.",
      entities_involved: ["project:C:\\Users\\pc\\Desktop\\AfterSalesManagement"],
      confidence: 0.98,
    },
    {
      id: "dormant_large_dependency_environment",
      title: "Inactive Workspace Retaining 184 MB Virtual Environment",
      category: "resource_retention",
      severity: "low",
      evidence: [
        "Workspace 'talib_ilm-main' inactive for 72 days",
        ".venv occupies 184.5 MB",
        "No processes running"
      ],
      explanation: "A dormant project retains local virtual environment packages.",
      recommendation: "Remove .venv if disk reclamation is desired; recreate with requirements.txt.",
      entities_involved: ["project:C:\\Users\\pc\\Desktop\\talib_ilm-main"],
      confidence: 0.95,
    },
  ],
  metadata: {
    scan_duration_ms: 342,
    engine_version: "0.1.0",
    timestamp: Date.now() / 1000,
    hostname: "DESKTOP-OQLTNEG",
    scan_roots: ["C:\\Users\\pc\\Desktop"],
  },
};

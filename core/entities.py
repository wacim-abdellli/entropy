"""
Entity definitions for the environment model.

Every observable thing on the machine is an Entity.
Entities are connected by Relationships (see graph.py).

Design principles:
- Entities hold only OBSERVED metadata — no inferred conclusions
- All fields are optional where data may not be available
- Timestamps are floats (Unix epoch)
- Sizes are in bytes
- No file contents — only structural metadata
- No secrets — no .env values, no tokens, no passwords
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ProjectType(str, Enum):
    NODE = "node"
    PYTHON = "python"
    RUST = "rust"
    GO = "go"
    PHP = "php"
    RUBY = "ruby"
    JAVA = "java"
    DOTNET = "dotnet"
    FLUTTER = "flutter"
    UNKNOWN = "unknown"


class ActivityLevel(str, Enum):
    """Classified from last meaningful activity timestamp.
    ACTIVE:   <= 30 days
    INACTIVE: 31-180 days
    STALE:    181-365 days
    DORMANT:  > 365 days
    """
    ACTIVE = "active"
    INACTIVE = "inactive"
    STALE = "stale"
    DORMANT = "dormant"
    UNKNOWN = "unknown"


class DockerContainerState(str, Enum):
    RUNNING = "running"
    EXITED = "exited"
    PAUSED = "paused"
    RESTARTING = "restarting"
    DEAD = "dead"
    CREATED = "created"
    REMOVING = "removing"
    UNKNOWN = "unknown"


class ScopeType(str, Enum):
    LOCAL_DIRECTORY = "local_directory"    # Scoped to a specific folder (e.g. Desktop, IdeaProjects)
    USER_ENVIRONMENT = "user_environment"  # Entire user home directory
    MACHINE_WIDE = "machine_wide"          # Machine-wide / all drives


# ---------------------------------------------------------------------------
# Entity base
# ---------------------------------------------------------------------------

@dataclass
class Entity:
    """Base class for all observable entities."""
    entity_id: str = ""  # Unique identifier (usually path or system ID)


# ---------------------------------------------------------------------------
# Project
# ---------------------------------------------------------------------------

@dataclass
class Project(Entity):
    """A detected development project."""
    path: str = ""
    project_type: ProjectType = ProjectType.UNKNOWN
    total_size_bytes: Optional[int] = None
    created: Optional[float] = None          # Filesystem creation time (Windows advantage)
    last_modified: Optional[float] = None    # Most recent mtime in project root
    detected_sentinels: list[str] = field(default_factory=list)
    activity: ActivityLevel = ActivityLevel.UNKNOWN
    runtime_version_hint: Optional[str] = None  # From .nvmrc, .python-version, etc.


# ---------------------------------------------------------------------------
# Git
# ---------------------------------------------------------------------------

@dataclass
class GitRepository(Entity):
    """Git metadata for a repository."""
    path: str = ""                               # Path to project root (not .git/)
    last_commit_timestamp: Optional[float] = None
    first_commit_timestamp: Optional[float] = None
    commit_count: Optional[int] = None
    branch_count: int = 0
    current_branch: Optional[str] = None
    has_uncommitted_changes: bool = False
    has_remote: bool = False
    remote_host: Optional[str] = None            # Hostname only (e.g. "github.com")
    remote_repo_id: Optional[str] = None         # Anonymized repo identifier (e.g. "github.com/user/repo")
    repo_size_bytes: Optional[int] = None        # Size of .git/ directory


# ---------------------------------------------------------------------------
# Process
# ---------------------------------------------------------------------------

@dataclass
class Process(Entity):
    """A running process observed on the machine."""
    pid: int = 0
    name: str = ""
    exe_path: Optional[str] = None               # Full path to executable
    cwd: Optional[str] = None                    # Working directory
    parent_pid: Optional[int] = None
    create_time: Optional[float] = None          # When process started
    memory_bytes: Optional[int] = None           # RSS memory
    cpu_percent: Optional[float] = None
    cmdline_preview: Optional[str] = None        # Executable name only, NOT full args (privacy)


# ---------------------------------------------------------------------------
# Runtimes
# ---------------------------------------------------------------------------

@dataclass
class RuntimeInstallation(Entity):
    """A detected runtime version."""
    runtime: str = ""                # "node", "python", "go", "rust", "java", "dotnet", etc.
    version: str = ""
    path: Optional[str] = None
    manager: Optional[str] = None    # "nvm-windows", "pyenv", "system", "winget", etc.
    is_active: bool = False


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

@dataclass
class DependencyEnvironment(Entity):
    """An installed dependency set (node_modules, venv, etc.)."""
    path: str = ""
    dep_type: str = ""               # "node_modules", "venv", "vendor", "target", etc.
    size_bytes: Optional[int] = None
    lockfile_mtime: Optional[float] = None


# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------

@dataclass
class DockerContainer(Entity):
    """A Docker container."""
    container_id: str = ""
    name: str = ""
    image: str = ""
    state: DockerContainerState = DockerContainerState.UNKNOWN
    created: Optional[float] = None
    status_text: Optional[str] = None
    bind_mounts: list[str] = field(default_factory=list)  # Host paths mounted into container


@dataclass
class DockerImage(Entity):
    """A Docker image."""
    image_id: str = ""
    tags: list[str] = field(default_factory=list)
    size_bytes: Optional[int] = None
    created: Optional[float] = None


@dataclass
class DockerVolume(Entity):
    """A Docker volume."""
    name: str = ""
    driver: str = "local"
    mountpoint: Optional[str] = None


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

@dataclass
class CacheDirectory(Entity):
    """A cache or build artifact directory."""
    path: str = ""
    size_bytes: Optional[int] = None
    category: str = "unknown"            # "npm", "pip", "nuget", "gradle", etc.
    description: Optional[str] = None


# ---------------------------------------------------------------------------
# Scan result container
# ---------------------------------------------------------------------------

@dataclass
class ScanResult:
    """Raw output from all collectors before relationship analysis."""
    scan_timestamp: float = 0.0
    scan_duration_seconds: float = 0.0
    scan_root: str = ""
    scope_type: ScopeType = ScopeType.LOCAL_DIRECTORY
    hostname: Optional[str] = None

    projects: list[Project] = field(default_factory=list)
    git_repos: list[GitRepository] = field(default_factory=list)
    processes: list[Process] = field(default_factory=list)
    runtimes: list[RuntimeInstallation] = field(default_factory=list)
    dep_environments: list[DependencyEnvironment] = field(default_factory=list)
    docker_containers: list[DockerContainer] = field(default_factory=list)
    docker_images: list[DockerImage] = field(default_factory=list)
    docker_volumes: list[DockerVolume] = field(default_factory=list)
    caches: list[CacheDirectory] = field(default_factory=list)

    docker_available: bool = False
    docker_error: Optional[str] = None

    errors: list[str] = field(default_factory=list)

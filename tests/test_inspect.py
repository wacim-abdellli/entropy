"""
Adversarial Workspace Inspection Test Suite for Digital Entropy (Phase 8).

Verifies that 'entropy inspect <path>' behaves with precision, epistemic humility,
and zero false accusations across five adversarial workspace classes:
- Case A: Finished project (Dormant / Static Codebase, NOT Abandoned)
- Case B: Dirty generated artifacts (Uncommitted Local State with uncertainty, NOT assuming unfinished work)
- Case C: Old Git history + active runtime (Active Runtime, NOT Stale)
- Case D: Broken Docker environment (Disconnected Infrastructure)
- Case E: Git worktree (Git Worktree, NOT Duplicate Clone)
"""

import time
import unittest

from core.entities import (
    ActivityLevel,
    DockerContainer,
    DockerContainerState,
    DockerVolume,
    GitRepository,
    Process,
    Project,
    ProjectType,
    ScanResult,
    ScopeType,
)
from core.findings import FindingSeverity, analyze_graph
from core.graph import EnvironmentGraph
from linkers.relationships import build_environment_graph
from report.inspect import format_inspect_report


class TestAdversarialInspectionScenarios(unittest.TestCase):
    def setUp(self):
        self.now = time.time()
        self.day = 86400.0

    # -------------------------------------------------------------------------
    # Case A: Finished Project
    # -------------------------------------------------------------------------
    def test_case_a_finished_project(self):
        """Old commit (18 mo), clean Git tree, tagged release, no active process.
        Expected: 'Dormant / Static Codebase', NEVER 'Abandoned' or 'Dead'.
        """
        p = Project(
            entity_id="project:c:/dev/finished-cli",
            path="c:/dev/finished-cli",
            project_type=ProjectType.RUST,
            total_size_bytes=45 * 1024 * 1024,
            activity=ActivityLevel.DORMANT,
        )
        g = GitRepository(
            entity_id="git:c:/dev/finished-cli",
            path="c:/dev/finished-cli",
            last_commit_timestamp=self.now - (540 * self.day), # 18 months ago
            current_branch="v1.0.0",
            has_remote=True,
            remote_repo_id="github.com/developer/finished-cli",
            has_uncommitted_changes=False,
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev/finished-cli",
            projects=[p],
            git_repos=[g],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        report = format_inspect_report(p, graph, findings)

        # 1. State must be Dormant / Static Codebase
        self.assertIn("Status:               Dormant / Static Codebase", report)
        # 2. Must NEVER use emotional/judgmental words
        self.assertNotIn("Abandoned", report)
        self.assertNotIn("Dead", report)
        self.assertNotIn("safe to delete", report.lower())
        # 3. Uncertainty must explain that finished projects naturally remain static
        self.assertIn("completed or stable reference code naturally remains static", report)

    # -------------------------------------------------------------------------
    # Case B: Dirty Generated Artifacts
    # -------------------------------------------------------------------------
    def test_case_b_dirty_generated_artifacts(self):
        """Old project, modified/untracked files (e.g. build logs), no active process.
        Expected: 'Uncommitted Local State' with uncertainty. Must NOT assume unfinished human work.
        """
        p = Project(
            entity_id="project:c:/dev/cached-web",
            path="c:/dev/cached-web",
            project_type=ProjectType.NODE,
            total_size_bytes=200 * 1024 * 1024,
            activity=ActivityLevel.STALE,
        )
        g = GitRepository(
            entity_id="git:c:/dev/cached-web",
            path="c:/dev/cached-web",
            last_commit_timestamp=self.now - (240 * self.day), # 8 months ago
            current_branch="main",
            has_remote=True,
            remote_repo_id="github.com/developer/cached-web",
            has_uncommitted_changes=True, # modified/untracked residue
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev/cached-web",
            projects=[p],
            git_repos=[g],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        report = format_inspect_report(p, graph, findings)

        # 1. State must be Uncommitted Local State
        self.assertIn("Status:               Uncommitted Local State", report)
        # 2. Must NOT claim user has "unfinished work" with certainty
        self.assertIn("Entropy cannot determine whether they represent valuable human work or generated artifacts", report)
        # 3. Action boundary must advise checking git diff
        self.assertIn("Run 'git status' and 'git diff'", report)

    # -------------------------------------------------------------------------
    # Case C: Old Git History + Active Runtime
    # -------------------------------------------------------------------------
    def test_case_c_old_git_history_active_runtime(self):
        """No commits for 8 months, but an active python.exe service is executing from it.
        Expected: 'Active Runtime'. Git inactivity must NOT trigger stale project conclusion.
        """
        p = Project(
            entity_id="project:c:/dev/daemon-worker",
            path="c:/dev/daemon-worker",
            project_type=ProjectType.PYTHON,
            total_size_bytes=80 * 1024 * 1024,
            activity=ActivityLevel.STALE,
        )
        g = GitRepository(
            entity_id="git:c:/dev/daemon-worker",
            path="c:/dev/daemon-worker",
            last_commit_timestamp=self.now - (250 * self.day), # 8+ months ago
            current_branch="main",
            has_remote=True,
            remote_repo_id="github.com/developer/daemon-worker",
            has_uncommitted_changes=False,
        )
        proc = Process(
            entity_id="proc:9988",
            pid=9988,
            name="python.exe",
            cwd="c:/dev/daemon-worker",
            memory_bytes=120 * 1024 * 1024,
            create_time=self.now - (14 * self.day), # running for 2 weeks
            is_shell=False,
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev/daemon-worker",
            projects=[p],
            git_repos=[g],
            processes=[proc],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        report = format_inspect_report(p, graph, findings)

        # 1. State must be Active Runtime
        self.assertIn("Status:               Active Runtime", report)
        # 2. Must NOT report project as abandoned or stale
        self.assertNotIn("Dormant", report)
        self.assertNotIn("Paused", report)
        # 3. Evidence must show running process
        self.assertIn("python.exe (PID 9988)", report)

    # -------------------------------------------------------------------------
    # Case D: Broken Docker Environment
    # -------------------------------------------------------------------------
    def test_case_d_broken_docker_environment(self):
        """Stopped container bind-mounts a path that is missing or broken.
        Expected: 'Disconnected Infrastructure'.
        """
        p = Project(
            entity_id="project:c:/dev/broken-api",
            path="c:/dev/broken-api",
            activity=ActivityLevel.STALE,
        )
        c = DockerContainer(
            entity_id="docker_container:cid_broken",
            container_id="cid_broken",
            name="broken-api-postgres",
            image="postgres:15",
            state=DockerContainerState.EXITED,
            bind_mounts=["c:/dev/broken-api/data_missing_host"],
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev/broken-api",
            projects=[p],
            docker_containers=[c],
            docker_available=True,
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        report = format_inspect_report(p, graph, findings)

        # Must report Disconnected Infrastructure if ghost container finding fired
        self.assertIn("Disconnected Infrastructure", report)
        self.assertIn("broken-api-postgres", report)

    # -------------------------------------------------------------------------
    # Case E: Git Worktree
    # -------------------------------------------------------------------------
    def test_case_e_git_worktree(self):
        """Project is a linked Git worktree pointing to a parent repository.
        Expected: 'Git Worktree', NEVER 'Duplicate Clone'.
        """
        p = Project(
            entity_id="project:c:/dev/entropy-wt",
            path="c:/dev/entropy-wt",
            activity=ActivityLevel.ACTIVE,
        )
        g = GitRepository(
            entity_id="git:c:/dev/entropy-wt",
            path="c:/dev/entropy-wt",
            remote_repo_id="github.com/wacim-abdellli/entropy",
            current_branch="feature/experiment",
            is_worktree=True, # Marked as worktree
            worktree_parent_repo="c:/dev/entropy-main",
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev/entropy-wt",
            projects=[p],
            git_repos=[g],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        report = format_inspect_report(p, graph, findings)

        # 1. State must be Git Worktree
        self.assertIn("Status:               Git Worktree", report)
        # 2. Must identify worktree parent
        self.assertIn("c:/dev/entropy-main", report)
        # 3. Must NEVER report as duplicate clone
        self.assertNotIn("Duplicate project clones detected", report)


if __name__ == "__main__":
    unittest.main()

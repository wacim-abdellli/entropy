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

import os
import tempfile
import time
import unittest
from unittest.mock import patch

from collectors.git import collect_git_repository
from core.entities import (
    ActivityLevel,
    CacheDirectory,
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
from report.contract import serialize_workspace_inspection
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

    # -------------------------------------------------------------------------
    # Phase 10.1: Evidence-Driven UX Fixes Validation
    # -------------------------------------------------------------------------
    def test_phase_10_1_ux_fixes(self):
        """Verify all 5 Phase 10.1 UX fixes in inspection and contract serialization."""
        from core.entities import CacheDirectory
        from report.contract import serialize_workspace_inspection

        # 1. FIX 1: Dirty Git File Visibility
        # 3. FIX 3: Rename "Paused" to "Inactive / Clean Codebase"
        p = Project(
            entity_id="project:c:/dev/inactive-clean",
            path="c:/dev/inactive-clean",
            project_type=ProjectType.DOTNET,
            activity=ActivityLevel.INACTIVE, # 30-180 days inactive
        )
        g = GitRepository(
            entity_id="git:c:/dev/inactive-clean",
            path="c:/dev/inactive-clean",
            current_branch="main",
            last_commit_timestamp=self.now - (60 * self.day), # 2 mo ago
            has_uncommitted_changes=True,
            dirty_files=[
                {"status": "modified", "path": "src/Program.cs"},
                {"status": "untracked", "path": "test/Debug.cs"},
            ],
        )

        # 4. FIX 4: Group repetitive interactive shells sharing parent_pid
        proc1 = Process(
            entity_id="proc:101",
            pid=101,
            name="powershell.exe",
            cwd="c:/dev/inactive-clean",
            parent_pid=5000,
            is_shell=True,
            memory_bytes=40 * 1024 * 1024,
        )
        proc2 = Process(
            entity_id="proc:102",
            pid=102,
            name="powershell.exe",
            cwd="c:/dev/inactive-clean",
            parent_pid=5000,
            is_shell=True,
            memory_bytes=45 * 1024 * 1024,
        )
        # Worker process with different parent - must NOT be grouped
        proc3 = Process(
            entity_id="proc:103",
            pid=103,
            name="dotnet.exe",
            cwd="c:/dev/inactive-clean",
            parent_pid=9999,
            is_shell=False,
            memory_bytes=80 * 1024 * 1024,
        )

        # 2. FIX 2: Shared System Cache Clarity
        cache = CacheDirectory(
            entity_id="cache:c:/users/dev/.nuget/packages",
            path="c:/users/dev/.nuget/packages",
            size_bytes=1024 * 1024 * 1024, # 1 GB
            category="nuget",
            description="NuGet package cache",
            is_shared=True,
            scope="shared_system",
            scope_explanation="Shared across projects on this machine.",
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev/inactive-clean",
            projects=[p],
            git_repos=[g],
            processes=[proc1, proc2, proc3],
            caches=[cache],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        report = format_inspect_report(p, graph, findings)

        # Verification 1: Dirty files shown in report
        self.assertIn("Uncommitted Changes", report)
        self.assertIn("[Modified] src/Program.cs", report)
        self.assertIn("[Untracked] test/Debug.cs", report)

        # Verification 2: Shared system cache clearly annotated
        self.assertIn("[SHARED SYSTEM CACHE]", report)
        self.assertIn("Shared across projects on this machine", report)

        # Verification 4: Grouped interactive shells
        self.assertIn("2 Interactive Shell Sessions [powershell.exe] (Terminal Host PID 5000", report)
        self.assertIn("dotnet.exe (PID 103", report)

        # Verification 5: Primary uncertainty surfaced
        self.assertIn("Boundary:", report)
        self.assertIn("Entropy cannot determine whether they are intentional code changes or generated residue", report)

        # Verification for JSON contract
        contract_data = serialize_workspace_inspection(p, graph, findings)
        self.assertIn("primary_uncertainty", contract_data)
        self.assertIsNotNone(contract_data["primary_uncertainty"])
        self.assertIn("process_groups", contract_data["connections"])
        self.assertEqual(len(contract_data["connections"]["process_groups"]), 1)
        self.assertEqual(contract_data["connections"]["process_groups"][0]["count"], 2)
        self.assertEqual(contract_data["connections"]["process_groups"][0]["parent_pid"], 5000)
        self.assertEqual(contract_data["connections"]["caches"][0]["scope"], "shared_system")
        self.assertEqual(contract_data["connections"]["caches"][0]["is_shared"], True)

        # Verification 3: Check clean inactive workspace naming
        p_clean = Project(
            entity_id="project:c:/dev/clean-inactive",
            path="c:/dev/clean-inactive",
            activity=ActivityLevel.INACTIVE,
        )
        g_clean = GitRepository(
            entity_id="git:c:/dev/clean-inactive",
            path="c:/dev/clean-inactive",
            has_uncommitted_changes=False,
            last_commit_timestamp=self.now - (60 * self.day),
        )
        scan_clean = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev/clean-inactive",
            projects=[p_clean],
            git_repos=[g_clean],
        )
        graph_clean = build_environment_graph(scan_clean)
        report_clean = format_inspect_report(p_clean, graph_clean, [])

        self.assertIn("Inactive / Clean Codebase", report_clean)
        self.assertNotIn("Paused", report_clean)

    @patch("collectors.git._run_git_command")
    def test_git_porcelain_parser_edge_cases_and_process_grouping(self, mock_git):
        """Test porcelain parsing for spaces, unicode, deleted binaries, and process grouping isolation."""
        porcelain_output = (
            " D git.exe\n"
            " M \"path with spaces/service.dart\"\n"
            "?? src/café_module.dart\n"
            "R  old_file.dart -> new_file.dart\n"
            "A  added_file.dart\n"
        )
        def git_side_effect(repo_path, args, timeout=5):
            if "status" in args:
                return porcelain_output
            if "rev-parse" in args:
                return "main"
            if "rev-list" in args:
                return "10"
            if "log" in args:
                return "1780000000|abc1234|feat: test commit|Tester <t@test.com>"
            return None

        mock_git.side_effect = git_side_effect

        with tempfile.TemporaryDirectory() as tmpdir:
            dot_git = os.path.join(tmpdir, ".git")
            os.makedirs(dot_git, exist_ok=True)
            repo = collect_git_repository(tmpdir)
            self.assertIsNotNone(repo)
            self.assertTrue(repo.has_uncommitted_changes)
            self.assertEqual(len(repo.dirty_files), 5)

            # Check classifications
            self.assertEqual(repo.dirty_files[0], {"status": "deleted", "path": "git.exe"})
            self.assertEqual(repo.dirty_files[1], {"status": "modified", "path": "path with spaces/service.dart"})
            self.assertEqual(repo.dirty_files[2], {"status": "untracked", "path": "src/café_module.dart"})
            self.assertEqual(repo.dirty_files[3], {"status": "renamed", "path": "old_file.dart -> new_file.dart"})
            self.assertEqual(repo.dirty_files[4], {"status": "added", "path": "added_file.dart"})

        # Process grouping isolation test: two shells with DIFFERENT parent PIDs must remain separate
        p_iso = Project(entity_id="project:c:/dev/iso", path="c:/dev/iso")
        shell_parent_a = Process(
            entity_id="proc:1", pid=1, name="powershell.exe", cwd="c:/dev/iso",
            parent_pid=1000, is_shell=True, memory_bytes=50 * 1024 * 1024
        )
        shell_parent_b = Process(
            entity_id="proc:2", pid=2, name="powershell.exe", cwd="c:/dev/iso",
            parent_pid=2000, is_shell=True, memory_bytes=50 * 1024 * 1024
        )
        scan_iso = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev/iso",
            projects=[p_iso],
            processes=[shell_parent_a, shell_parent_b],
        )
        graph_iso = build_environment_graph(scan_iso)
        contract_iso = serialize_workspace_inspection(p_iso, graph_iso, [])
        # Neither shell should be grouped because each parent has count == 1
        self.assertEqual(len(contract_iso["connections"]["process_groups"]), 0)

        report_iso = format_inspect_report(p_iso, graph_iso, [])
        # Must display individual PIDs, not a collapsed group
        self.assertIn("powershell.exe (PID 1", report_iso)
        self.assertIn("powershell.exe (PID 2", report_iso)
        self.assertNotIn("Interactive Shell Sessions", report_iso)


if __name__ == "__main__":
    unittest.main()

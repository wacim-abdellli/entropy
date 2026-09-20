"""
Synthetic Lifecycle Test Suite for Digital Entropy.

Tests the 10 core developer lifecycle scenarios against the EnvironmentGraph
and findings engine to verify precision, epistemic humility, and absence
of false positive abandonment / bloat accusations.
"""

import time
import unittest

from core.entities import (
    ActivityLevel,
    CacheDirectory,
    DependencyEnvironment,
    DockerContainer,
    DockerContainerState,
    DockerVolume,
    GitRepository,
    Process,
    Project,
    ProjectType,
    RuntimeInstallation,
    ScanResult,
    ScopeType,
)
from core.findings import FindingSeverity, analyze_graph
from core.graph import EnvironmentGraph, Observability, RelationshipType
from linkers.relationships import build_environment_graph


class TestLifecycleScenarios(unittest.TestCase):
    def setUp(self):
        self.now = time.time()
        self.day = 86400.0

    # -------------------------------------------------------------------------
    # Scenario 1: Truly Abandoned Project
    # -------------------------------------------------------------------------
    def test_scenario_1_truly_abandoned_project(self):
        """Old Git repo (18 mo), no processes, old runtime, stopped container with volume."""
        p = Project(
            entity_id="project:c:/dev/old-portal",
            path="c:/dev/old-portal",
            project_type=ProjectType.NODE,
            total_size_bytes=3 * 1024 * 1024 * 1024, # 3 GB
            activity=ActivityLevel.DORMANT,
        )
        g = GitRepository(
            entity_id="git:c:/dev/old-portal",
            path="c:/dev/old-portal",
            last_commit_timestamp=self.now - (540 * self.day), # 18 months
            has_remote=True,
            remote_host="github.com",
            has_uncommitted_changes=False,
        )
        dep = DependencyEnvironment(
            entity_id="dep:c:/dev/old-portal/node_modules",
            path="c:/dev/old-portal/node_modules",
            dep_type="node_modules",
            size_bytes=1500 * 1024 * 1024, # 1.5 GB
        )
        c = DockerContainer(
            entity_id="docker_container:cid1",
            container_id="cid1",
            name="portal-db",
            image="postgres:14",
            state=DockerContainerState.EXITED,
            bind_mounts=["c:/dev/old-portal"],
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            projects=[p],
            git_repos=[g],
            dep_environments=[dep],
            docker_containers=[c],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Should generate inactive development environment finding
        inactive_findings = [f for f in findings if "inactive_resources" in f.id]
        self.assertEqual(len(inactive_findings), 1)
        f = inactive_findings[0]
        self.assertEqual(f.severity, FindingSeverity.ATTENTION)
        self.assertTrue(any("node_modules" in ev for ev in f.evidence))
        self.assertTrue(any("portal-db" in ev for ev in f.evidence))

    # -------------------------------------------------------------------------
    # Scenario 2: Dormant but Intentionally Preserved
    # -------------------------------------------------------------------------
    def test_scenario_2_dormant_but_preserved(self):
        """Clean project, tagged release, no dirty tree, modest size, inactive 14 months."""
        p = Project(
            entity_id="project:c:/dev/stable-util",
            path="c:/dev/stable-util",
            project_type=ProjectType.RUST,
            total_size_bytes=50 * 1024 * 1024, # 50 MB
            activity=ActivityLevel.DORMANT,
        )
        g = GitRepository(
            entity_id="git:c:/dev/stable-util",
            path="c:/dev/stable-util",
            last_commit_timestamp=self.now - (420 * self.day), # 14 months
            current_branch="v1.0.0",
            has_remote=True,
            remote_host="github.com",
            has_uncommitted_changes=False,
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            projects=[p],
            git_repos=[g],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Should NOT trigger uncommitted work warning or abandoned bloat alert
        uncommitted_warnings = [f for f in findings if "uncommitted_stale" in f.id]
        self.assertEqual(len(uncommitted_warnings), 0)

    # -------------------------------------------------------------------------
    # Scenario 3: Active Project with Old Git History
    # -------------------------------------------------------------------------
    def test_scenario_3_active_code_with_old_git(self):
        """Git commit 6 months ago, but active process is currently running from it."""
        p = Project(
            entity_id="project:c:/dev/active-client",
            path="c:/dev/active-client",
            project_type=ProjectType.NODE,
            total_size_bytes=800 * 1024 * 1024,
            activity=ActivityLevel.STALE,
        )
        g = GitRepository(
            entity_id="git:c:/dev/active-client",
            path="c:/dev/active-client",
            last_commit_timestamp=self.now - (180 * self.day),
            has_remote=True,
            remote_host="github.com",
        )
        dep = DependencyEnvironment(
            entity_id="dep:c:/dev/active-client/node_modules",
            path="c:/dev/active-client/node_modules",
            dep_type="node_modules",
            size_bytes=500 * 1024 * 1024,
        )
        proc = Process(
            entity_id="proc:9920",
            pid=9920,
            name="node.exe",
            cwd="c:/dev/active-client",
            create_time=self.now - 3600, # started 1h ago
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            projects=[p],
            git_repos=[g],
            dep_environments=[dep],
            processes=[proc],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # The active process must SUPPRESS the inactive environment bloat warning
        inactive_findings = [f for f in findings if "inactive_resources" in f.id]
        self.assertEqual(len(inactive_findings), 0)

    # -------------------------------------------------------------------------
    # Scenario 4: Stale Project with Uncommitted Work
    # -------------------------------------------------------------------------
    def test_scenario_4_stale_with_uncommitted_work(self):
        """Old commit (8 mo), uncommitted changes on fix branch, no running process."""
        p = Project(
            entity_id="project:c:/dev/talib_ilm",
            path="c:/dev/talib_ilm",
            project_type=ProjectType.FLUTTER,
            total_size_bytes=1800 * 1024 * 1024,
            activity=ActivityLevel.STALE,
        )
        g = GitRepository(
            entity_id="git:c:/dev/talib_ilm",
            path="c:/dev/talib_ilm",
            last_commit_timestamp=self.now - (240 * self.day),
            current_branch="fix/quran-loading",
            has_uncommitted_changes=True,
            has_remote=True,
            remote_host="github.com",
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            projects=[p],
            git_repos=[g],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Must flag uncommitted work in inactive project as WARNING
        uncommitted_findings = [f for f in findings if "uncommitted_stale" in f.id]
        self.assertEqual(len(uncommitted_findings), 1)
        self.assertEqual(uncommitted_findings[0].severity, FindingSeverity.WARNING)
        self.assertIn("fix/quran-loading", uncommitted_findings[0].evidence[1])

    # -------------------------------------------------------------------------
    # Scenario 5: Shared Runtime Across Multiple Projects
    # -------------------------------------------------------------------------
    def test_scenario_5_shared_runtime(self):
        """Node 20 is used by Project A (dormant) and Project B (active). Must NOT be flagged unused."""
        rt20 = RuntimeInstallation(
            entity_id="runtime:node_20.11.0",
            runtime="node",
            version="20.11.0",
            path="c:/node20/node.exe",
            is_active=False,
        )
        p_active = Project(
            entity_id="project:c:/dev/active-app",
            path="c:/dev/active-app",
            project_type=ProjectType.NODE,
            runtime_version_hint="20",
            activity=ActivityLevel.ACTIVE,
        )
        p_dormant = Project(
            entity_id="project:c:/dev/dormant-app",
            path="c:/dev/dormant-app",
            project_type=ProjectType.NODE,
            runtime_version_hint="20",
            activity=ActivityLevel.DORMANT,
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            projects=[p_active, p_dormant],
            runtimes=[rt20],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Node 20 must NOT be flagged as unused runtime
        unused_rt = [f for f in findings if "unused_runtime" in f.id and "20.11.0" in f.title]
        self.assertEqual(len(unused_rt), 0)

    # -------------------------------------------------------------------------
    # Scenario 6: Shared Docker Resource Across Projects
    # -------------------------------------------------------------------------
    def test_scenario_6_shared_docker_resource(self):
        """Postgres container is referenced by active project B and inactive project A."""
        p_inactive = Project(
            entity_id="project:c:/dev/old-shop",
            path="c:/dev/old-shop",
            activity=ActivityLevel.STALE,
        )
        p_active = Project(
            entity_id="project:c:/dev/new-shop",
            path="c:/dev/new-shop",
            activity=ActivityLevel.ACTIVE,
        )
        container = DockerContainer(
            entity_id="docker_container:shared_pg",
            container_id="c_pg",
            name="shared-postgres",
            image="postgres:16",
            state=DockerContainerState.RUNNING,
            bind_mounts=["c:/dev/old-shop/db", "c:/dev/new-shop/db"],
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            projects=[p_inactive, p_active],
            docker_containers=[container],
            docker_available=True,
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Should not flag container as dead or abandoned
        ghost_findings = [f for f in findings if "ghost_container" in f.id]
        self.assertEqual(len(ghost_findings), 0)

    # -------------------------------------------------------------------------
    # Scenario 7: Ghost Container Infrastructure (Broken Host Path)
    # -------------------------------------------------------------------------
    def test_scenario_7_ghost_container_infrastructure(self):
        """Container bind-mounts a path that does not exist on disk."""
        c = DockerContainer(
            entity_id="docker_container:ghost_cid",
            container_id="ghost_cid",
            name="deleted-app-db",
            image="postgres:15",
            state=DockerContainerState.EXITED,
            bind_mounts=["c:/dev/nonexistent-project-deleted"],
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            docker_containers=[c],
            docker_available=True,
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Must detect severed container infrastructure
        ghost_findings = [f for f in findings if "ghost_container" in f.id]
        self.assertEqual(len(ghost_findings), 1)
        self.assertEqual(ghost_findings[0].severity, FindingSeverity.WARNING)
        self.assertIn("deleted-app-db", ghost_findings[0].title)

    # -------------------------------------------------------------------------
    # Scenario 8: Divergent Duplicate Clones (SHARES_REMOTE)
    # -------------------------------------------------------------------------
    def test_scenario_8_divergent_duplicate_clones(self):
        """Two folders clone the same remote; one has uncommitted changes."""
        p1 = Project(
            entity_id="project:c:/dev/entropy-main",
            path="c:/dev/entropy-main",
            total_size_bytes=300 * 1024,
            activity=ActivityLevel.ACTIVE,
        )
        g1 = GitRepository(
            entity_id="git:c:/dev/entropy-main",
            path="c:/dev/entropy-main",
            remote_repo_id="github.com/wacim-abdellli/entropy",
            current_branch="main",
            has_uncommitted_changes=False,
        )

        p2 = Project(
            entity_id="project:c:/dev/entropy-test",
            path="c:/dev/entropy-test",
            total_size_bytes=500 * 1024,
            activity=ActivityLevel.STALE,
        )
        g2 = GitRepository(
            entity_id="git:c:/dev/entropy-test",
            path="c:/dev/entropy-test",
            remote_repo_id="github.com/wacim-abdellli/entropy",
            current_branch="feature/experiment",
            has_uncommitted_changes=True,
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            projects=[p1, p2],
            git_repos=[g1, g2],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Must flag duplicate project clones
        dup_findings = [f for f in findings if "duplicate_repo" in f.id]
        self.assertEqual(len(dup_findings), 1)
        self.assertEqual(dup_findings[0].severity, FindingSeverity.WARNING) # warning because g2 has uncommitted changes
        self.assertIn("github.com/wacim-abdellli/entropy", dup_findings[0].evidence[2])

    # -------------------------------------------------------------------------
    # Scenario 9: Unattended Background Daemon in Stale Project
    # -------------------------------------------------------------------------
    def test_scenario_9_unattended_background_daemon(self):
        """Process running in codebase with no Git activity for 8 months."""
        p = Project(
            entity_id="project:c:/tools/scraper",
            path="c:/tools/scraper",
            project_type=ProjectType.PYTHON,
            activity=ActivityLevel.STALE,
        )
        g = GitRepository(
            entity_id="git:c:/tools/scraper",
            path="c:/tools/scraper",
            last_commit_timestamp=self.now - (240 * self.day), # 8 months
        )
        proc = Process(
            entity_id="proc:11024",
            pid=11024,
            name="python.exe",
            cwd="c:/tools/scraper",
            memory_bytes=450 * 1024 * 1024, # 450 MB
            create_time=self.now - (30 * self.day), # running 30 days
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/tools",
            projects=[p],
            git_repos=[g],
            processes=[proc],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Must flag active process in stale codebase
        proc_findings = [f for f in findings if "running_proc_stale" in f.id]
        self.assertEqual(len(proc_findings), 1)
        self.assertEqual(proc_findings[0].severity, FindingSeverity.WARNING)
        self.assertIn("python.exe", proc_findings[0].summary)

    # -------------------------------------------------------------------------
    # Scenario 10: Obsolete Build Cache
    # -------------------------------------------------------------------------
    def test_scenario_10_obsolete_cache(self):
        """Gradle cache exists (4 GB), but zero Java/Gradle projects exist on machine."""
        cache_gradle = CacheDirectory(
            entity_id="cache:gradle",
            path="c:/users/pc/.gradle/caches",
            size_bytes=4 * 1024 * 1024 * 1024, # 4 GB
            category="gradle",
            description="Gradle cache",
        )
        p_node = Project(
            entity_id="project:c:/dev/web-app",
            path="c:/dev/web-app",
            project_type=ProjectType.NODE,
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            scope_type=ScopeType.MACHINE_WIDE,
            projects=[p_node],
            caches=[cache_gradle],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Must detect obsolete build cache
        cache_findings = [f for f in findings if "obsolete_cache" in f.id]
        self.assertEqual(len(cache_findings), 1)
        self.assertEqual(cache_findings[0].severity, FindingSeverity.ATTENTION)
        self.assertIn("Gradle", cache_findings[0].title)

    # -------------------------------------------------------------------------
    # Scenario 11: Idle Shell Does Not Suppress Project Staleness
    # -------------------------------------------------------------------------
    def test_scenario_11_idle_shell_does_not_suppress_stale(self):
        """Idle powershell.exe open in 8-mo stale project must NOT suppress inactive resource warning."""
        p = Project(
            entity_id="project:c:/dev/old-portal",
            path="c:/dev/old-portal",
            project_type=ProjectType.NODE,
            total_size_bytes=2 * 1024 * 1024 * 1024,
            activity=ActivityLevel.STALE,
        )
        g = GitRepository(
            entity_id="git:c:/dev/old-portal",
            path="c:/dev/old-portal",
            last_commit_timestamp=self.now - (240 * self.day), # 8 months
            has_remote=True,
            remote_host="github.com",
            has_uncommitted_changes=False,
        )
        dep = DependencyEnvironment(
            entity_id="dep:c:/dev/old-portal/node_modules",
            path="c:/dev/old-portal/node_modules",
            dep_type="node_modules",
            size_bytes=1200 * 1024 * 1024, # 1.2 GB
        )
        # Idle interactive shell
        proc_shell = Process(
            entity_id="proc:5208",
            pid=5208,
            name="powershell.exe",
            cwd="c:/dev/old-portal",
            is_shell=True,
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            projects=[p],
            git_repos=[g],
            dep_environments=[dep],
            processes=[proc_shell],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # 1. Idle shell must generate idle_shell_stale ATTENTION finding
        shell_findings = [f for f in findings if "idle_shell_stale" in f.id]
        self.assertEqual(len(shell_findings), 1)
        self.assertEqual(shell_findings[0].severity, FindingSeverity.ATTENTION)
        self.assertIn("powershell.exe", shell_findings[0].summary)

        # 2. Must NOT generate running_proc_stale (it's not an active daemon/server)
        running_proc_findings = [f for f in findings if "running_proc_stale" in f.id]
        self.assertEqual(len(running_proc_findings), 0)

        # 3. Idle shell must NOT suppress inactive_resources finding (1.2 GB node_modules is still dormant)
        inactive_res_findings = [f for f in findings if "inactive_resources" in f.id]
        self.assertEqual(len(inactive_res_findings), 1)
        self.assertEqual(inactive_res_findings[0].severity, FindingSeverity.ATTENTION)

    # -------------------------------------------------------------------------
    # Scenario 12: Git Worktree Cluster Recognized as Intentional Workflow
    # -------------------------------------------------------------------------
    def test_scenario_12_git_worktree_cluster(self):
        """Worktree sharing remote with main repo must be classified as worktree cluster, not duplicate clone."""
        p_main = Project(
            entity_id="project:c:/dev/entropy-main",
            path="c:/dev/entropy-main",
            activity=ActivityLevel.ACTIVE,
        )
        g_main = GitRepository(
            entity_id="git:c:/dev/entropy-main",
            path="c:/dev/entropy-main",
            remote_repo_id="github.com/wacim-abdellli/entropy",
            current_branch="main",
            is_worktree=False,
        )

        p_wt = Project(
            entity_id="project:c:/dev/entropy-worktree",
            path="c:/dev/entropy-worktree",
            activity=ActivityLevel.ACTIVE,
        )
        g_wt = GitRepository(
            entity_id="git:c:/dev/entropy-worktree",
            path="c:/dev/entropy-worktree",
            remote_repo_id="github.com/wacim-abdellli/entropy",
            current_branch="feature/experiment",
            is_worktree=True, # Explicitly marked as worktree
            worktree_parent_repo="c:/dev/entropy-main",
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_root="c:/dev",
            projects=[p_main, p_wt],
            git_repos=[g_main, g_wt],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Must generate git_worktree_cluster INFO finding
        wt_findings = [f for f in findings if "git_worktree_cluster" in f.id]
        self.assertEqual(len(wt_findings), 1)
        self.assertEqual(wt_findings[0].severity, FindingSeverity.INFO)
        self.assertIn("linked Git worktrees", wt_findings[0].summary)

        # Must NOT generate accidental duplicate clone warning
        dup_findings = [f for f in findings if "duplicate_repo" in f.id]
        self.assertEqual(len(dup_findings), 0)

    # -------------------------------------------------------------------------
    # Scenario 13: Multi-Root Workspace Build Cache Linking
    # -------------------------------------------------------------------------
    def test_scenario_13_multi_root_cache_linking(self):
        """Multi-root scan resolves Maven cache to Java project in separate root."""
        p_node = Project(
            entity_id="project:c:/users/pc/desktop/web-app",
            path="c:/users/pc/desktop/web-app",
            project_type=ProjectType.NODE,
        )
        p_java = Project(
            entity_id="project:c:/users/pc/ideaprojects/backend-service",
            path="c:/users/pc/ideaprojects/backend-service",
            project_type=ProjectType.JAVA,
        )
        cache_maven = CacheDirectory(
            entity_id="cache:maven",
            path="c:/users/pc/.m2/repository",
            size_bytes=1400 * 1024 * 1024, # 1.4 GB
            category="maven",
            description="Maven repository cache",
        )

        scan = ScanResult(
            scan_timestamp=self.now,
            scan_roots=["c:/users/pc/desktop", "c:/users/pc/ideaprojects"],
            scope_type=ScopeType.MULTI_ROOT,
            projects=[p_node, p_java],
            caches=[cache_maven],
        )
        graph = build_environment_graph(scan)
        findings = analyze_graph(graph)

        # Because Java project exists in IdeaProjects, Maven cache must NOT be flagged as unreferenced/obsolete!
        obsolete_findings = [f for f in findings if "obsolete_cache" in f.id and "maven" in f.id.lower()]
        self.assertEqual(len(obsolete_findings), 0)


if __name__ == "__main__":
    unittest.main()


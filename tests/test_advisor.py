"""
Unit tests for Advisor engine.
"""

import os
import shutil
import tempfile
import time
import unittest

from core.advisor import (
    _detect_rebuild_command,
    get_cleanup_verdict,
    evaluate_workspace_health,
)


class TestAdvisorEngine(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="entropy_advisor_test_")

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_detect_rebuild_command_node_managers(self):
        # Default npm
        cmd = _detect_rebuild_command(self.tmp_dir, "node_modules")
        self.assertEqual(cmd, "npm install")

        # pnpm-lock.yaml -> pnpm install
        pnpm_lock = os.path.join(self.tmp_dir, "pnpm-lock.yaml")
        with open(pnpm_lock, "w") as f:
            f.write("")
        cmd = _detect_rebuild_command(self.tmp_dir, "node_modules")
        self.assertEqual(cmd, "pnpm install")
        os.remove(pnpm_lock)

        # yarn.lock -> yarn install
        yarn_lock = os.path.join(self.tmp_dir, "yarn.lock")
        with open(yarn_lock, "w") as f:
            f.write("")
        cmd = _detect_rebuild_command(self.tmp_dir, "node_modules")
        self.assertEqual(cmd, "yarn install")

    def test_detect_rebuild_command_rust_and_python(self):
        # Rust target
        cmd = _detect_rebuild_command(self.tmp_dir, "target")
        self.assertEqual(cmd, "cargo build")

        # Python venv
        cmd = _detect_rebuild_command(self.tmp_dir, ".venv")
        self.assertIn("python -m venv", cmd)

        # .NET bin/obj
        cmd = _detect_rebuild_command(self.tmp_dir, "bin")
        self.assertEqual(cmd, "dotnet build")

    def test_cleanup_verdict_safe_idle(self):
        artifact_path = os.path.join(self.tmp_dir, "node_modules")
        verdict = get_cleanup_verdict(
            artifact_path=artifact_path,
            project_path=self.tmp_dir,
            running_processes=[],
            has_uncommitted_changes=False,
            size_bytes=100 * 1024 * 1024,
        )
        self.assertEqual(verdict.risk, "safe")
        self.assertIn("Safe to delete", verdict.headline)
        self.assertEqual(len(verdict.warnings), 0)
        self.assertEqual(verdict.rebuild_command, "npm install")

    def test_cleanup_verdict_danger_active_process(self):
        artifact_path = os.path.join(self.tmp_dir, "node_modules")
        running_procs = [
            {"pid": 1234, "name": "node.exe", "cwd": self.tmp_dir}
        ]
        verdict = get_cleanup_verdict(
            artifact_path=artifact_path,
            project_path=self.tmp_dir,
            running_processes=running_procs,
            has_uncommitted_changes=False,
            size_bytes=50 * 1024 * 1024,
        )
        self.assertEqual(verdict.risk, "danger")
        self.assertIn("Caution: active process", verdict.headline)
        self.assertTrue(any("node.exe" in w for w in verdict.warnings))

    def test_cleanup_verdict_review_uncommitted_changes(self):
        artifact_path = os.path.join(self.tmp_dir, "node_modules")
        verdict = get_cleanup_verdict(
            artifact_path=artifact_path,
            project_path=self.tmp_dir,
            running_processes=[],
            has_uncommitted_changes=True,
            size_bytes=50 * 1024 * 1024,
        )
        self.assertEqual(verdict.risk, "review")
        self.assertIn("Review needed", verdict.headline)
        self.assertTrue(any("uncommitted local changes" in w for w in verdict.warnings))

    def test_evaluate_workspace_health_deductions_and_tips(self):
        # Workspace with unprotected .env, stale wip (>5 days), and merged branches
        five_days_ago = time.time() - (5 * 86400)
        git_info = {
            "unprotected_env_files": [".env", ".env.local"],
            "has_uncommitted_changes": True,
            "oldest_dirty_timestamp": five_days_ago,
            "dirty_count": 4,
            "merged_branches": ["feature/login", "fix/header"],
        }
        artifacts = [
            {"path": os.path.join(self.tmp_dir, "node_modules"), "size_bytes": 600 * 1024 * 1024}
        ]

        health = evaluate_workspace_health(
            workspace_path=self.tmp_dir,
            workspace_name="test_proj",
            git_info=git_info,
            processes=[],
            artifacts=artifacts,
        )

        # Health score should be deducted for:
        # - unprotected env (-25)
        # - stale dirty (>3 days) (-15)
        # - merged branches (-10)
        # - large idle artifacts > 500MB (-10)
        # 100 - 25 - 15 - 10 - 10 = 40
        self.assertEqual(health.health_score, 40)
        tip_ids = [t.id for t in health.tips]
        self.assertIn("unprotected_env", tip_ids)
        self.assertIn("stale_wip", tip_ids)
        self.assertIn("merged_branches", tip_ids)
        self.assertIn("reclaim_space", tip_ids)
        self.assertEqual(len(health.cleanup_verdicts), 1)

    def test_evaluate_workspace_health_unpushed_and_stale_lockfile(self):
        git_info = {
            "commits_ahead": 6,
            "current_branch": "feature/payment",
        }
        health = evaluate_workspace_health(
            workspace_path=self.tmp_dir,
            workspace_name="test_proj",
            git_info=git_info,
            dependencies=[{"dep_type": "node_modules", "is_stale": True}],
        )
        self.assertEqual(health.health_score, 70)
        tip_ids = [t.id for t in health.tips]
        self.assertIn("unpushed_commits", tip_ids)
        self.assertIn("stale_lockfile", tip_ids)




if __name__ == "__main__":
    unittest.main()

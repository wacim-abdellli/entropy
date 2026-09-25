"""
Unit tests for Git Control and Safety Net features.
"""

import os
import shutil
import subprocess
import tempfile
import unittest

from core.git_control import (
    add_to_gitignore,
    prune_merged_branches,
    safe_stash_workspace,
    list_stashes,
    pop_stash,
    drop_stash,
    PROTECTED_BRANCHES,
)
from collectors.git import collect_git_repository


class TestGitControl(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="entropy_git_test_")

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_add_to_gitignore_creates_file(self):
        res = add_to_gitignore(self.test_dir, ".env*")
        self.assertTrue(res["success"])
        gitignore_path = os.path.join(self.test_dir, ".gitignore")
        self.assertTrue(os.path.exists(gitignore_path))
        with open(gitignore_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn(".env*", content)

    def test_add_to_gitignore_no_duplicate(self):
        gitignore_path = os.path.join(self.test_dir, ".gitignore")
        with open(gitignore_path, "w", encoding="utf-8") as f:
            f.write("# existing rules\nnode_modules\n.env*\n")

        res = add_to_gitignore(self.test_dir, ".env*")
        self.assertTrue(res["success"])
        self.assertIn("already ignored", res["message"])

        with open(gitignore_path, "r", encoding="utf-8") as f:
            lines = [l.strip() for l in f.readlines() if l.strip() == ".env*"]
        self.assertEqual(len(lines), 1)

    def test_prune_merged_branches_protects_defaults(self):
        # Create a real temporary git repository
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        subprocess.run(["git", "init"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "config", "user.email", "test@entropy.local"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "config", "user.name", "Entropy Test"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)

        # Initial commit
        test_file = os.path.join(self.test_dir, "init.txt")
        with open(test_file, "w") as f:
            f.write("hello")
        subprocess.run(["git", "add", "init.txt"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)

        # Attempt to prune protected branches - should never prune
        res = prune_merged_branches(self.test_dir, list(PROTECTED_BRANCHES))
        self.assertTrue(res["success"])
        self.assertEqual(len(res["pruned"]), 0)

    def test_prune_merged_branches_success(self):
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        subprocess.run(["git", "init"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "config", "user.email", "test@entropy.local"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "config", "user.name", "Entropy Test"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)

        # Commit on default branch
        with open(os.path.join(self.test_dir, "main.txt"), "w") as f:
            f.write("main")
        subprocess.run(["git", "add", "main.txt"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "commit", "-m", "main commit"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)

        # Create and checkout feature branch
        subprocess.run(["git", "checkout", "-b", "feature/test-merged"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        with open(os.path.join(self.test_dir, "feature.txt"), "w") as f:
            f.write("feature")
        subprocess.run(["git", "add", "feature.txt"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "commit", "-m", "feature commit"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)

        # Checkout master/main and merge feature branch
        curr_branch = subprocess.run(["git", "branch", "--show-current"], cwd=self.test_dir, capture_output=True, text=True, creationflags=creationflags).stdout.strip()
        # Find default branch name
        branches_out = subprocess.run(["git", "branch"], cwd=self.test_dir, capture_output=True, text=True, creationflags=creationflags).stdout
        default_branch = [b.strip().lstrip("* ") for b in branches_out.splitlines() if b.strip().lstrip("* ") != "feature/test-merged"][0]
        subprocess.run(["git", "checkout", default_branch], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "merge", "feature/test-merged"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)

        # Prune merged branches
        res = prune_merged_branches(self.test_dir)
        self.assertTrue(res["success"])
        self.assertIn("feature/test-merged", res["pruned"])

    def test_collect_git_safety_net(self):
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        subprocess.run(["git", "init"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "config", "user.email", "test@entropy.local"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "config", "user.name", "Entropy Test"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)

        # Initial commit
        with open(os.path.join(self.test_dir, "readme.txt"), "w") as f:
            f.write("readme")
        subprocess.run(["git", "add", "readme.txt"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "commit", "-m", "init"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)

        # Create uncommitted file and unignored .env file
        with open(os.path.join(self.test_dir, ".env"), "w") as f:
            f.write("SECRET_KEY=123456\n")

        repo = collect_git_repository(self.test_dir)
        self.assertIsNotNone(repo)
        self.assertTrue(repo.has_uncommitted_changes)
        self.assertGreaterEqual(repo.dirty_count, 1)
        self.assertIsNotNone(repo.oldest_dirty_timestamp)
        self.assertIn(".env", repo.unprotected_env_files)

    def test_stash_lifecycle(self):
        creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
        subprocess.run(["git", "init"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "config", "user.email", "test@entropy.local"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "config", "user.name", "Entropy Test"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)

        # Initial commit
        with open(os.path.join(self.test_dir, "initial.txt"), "w") as f:
            f.write("base")
        subprocess.run(["git", "add", "initial.txt"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)
        subprocess.run(["git", "commit", "-m", "base commit"], cwd=self.test_dir, capture_output=True, creationflags=creationflags)

        # Create modified and untracked file
        with open(os.path.join(self.test_dir, "initial.txt"), "w") as f:
            f.write("modified")
        with open(os.path.join(self.test_dir, "untracked.txt"), "w") as f:
            f.write("new")

        # 1. Stash changes
        stash_res = safe_stash_workspace(self.test_dir, "Test Stash 1")
        self.assertTrue(stash_res["success"])

        # Verify directory is clean
        stashes = list_stashes(self.test_dir)
        self.assertEqual(len(stashes), 1)
        self.assertIn("Test Stash 1", stashes[0]["message"])

        # 2. Pop stash
        pop_res = pop_stash(self.test_dir, 0)
        self.assertTrue(pop_res["success"])

        # Verify files are restored
        with open(os.path.join(self.test_dir, "initial.txt"), "r") as f:
            self.assertEqual(f.read(), "modified")
        self.assertTrue(os.path.exists(os.path.join(self.test_dir, "untracked.txt")))

        # Stash again and test drop
        stash_res2 = safe_stash_workspace(self.test_dir, "Test Stash To Drop")
        self.assertTrue(stash_res2["success"])
        stashes_before_drop = list_stashes(self.test_dir)
        self.assertEqual(len(stashes_before_drop), 1)

        drop_res = drop_stash(self.test_dir, 0)
        self.assertTrue(drop_res["success"])
        stashes_after_drop = list_stashes(self.test_dir)
        self.assertEqual(len(stashes_after_drop), 0)


if __name__ == "__main__":
    unittest.main()


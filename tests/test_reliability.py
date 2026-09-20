"""
Reliability and robustness regression test suite for Entropy v0.1.

Tests boundary conditions:
- Nonexistent paths
- Inaccessible / file targets
- Empty directories
- Newly initialized Git repos (0 commits)
- Process race conditions (disappearing PIDs mid-scan)
- Docker unavailable / missing
- Windows path normalization and casing
- Malformed Git metadata
- CLI argument parsing & JSON serialization
"""

from __future__ import annotations

import io
import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import psutil

from collectors.docker import collect_docker
from collectors.git import collect_git_repository
from collectors.processes import collect_processes
from core.entities import ActivityLevel, Project, ProjectType, ScanResult, ScopeType
from linkers.relationships import _is_subpath, build_environment_graph
from report.inspect import format_inspect_report
from scan import build_parser, main, run_entropy_inspect


class TestReliabilityAndRobustness(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="entropy_test_")

    def tearDown(self):
        if os.path.exists(self.temp_dir):
            try:
                shutil.rmtree(self.temp_dir)
            except OSError:
                pass

    def test_empty_directory_inspection(self):
        """Empty directory should be inspected gracefully without crashing."""
        empty_dir = os.path.join(self.temp_dir, "empty_workspace")
        os.makedirs(empty_dir, exist_ok=True)

        proj, graph, findings = run_entropy_inspect(empty_dir)
        self.assertIsNotNone(proj)
        self.assertEqual(proj.path, os.path.abspath(empty_dir))
        report = format_inspect_report(proj, graph, findings)

        self.assertIn("IDENTITY", report)
        self.assertIn("STATE", report)
        self.assertIn("CONNECTIONS", report)
        self.assertIn("EVIDENCE", report)
        self.assertIn("UNCERTAINTY", report)
        self.assertIn("ACTION BOUNDARY", report)
        self.assertIn("None (unversioned directory)", report)

    def test_fresh_git_init_inspection(self):
        """Newly initialized Git repo with 0 commits must report branch and 0 commits."""
        git_dir = os.path.join(self.temp_dir, "fresh_git")
        os.makedirs(os.path.join(git_dir, ".git"), exist_ok=True)
        # Write symbolic HEAD
        with open(os.path.join(git_dir, ".git", "HEAD"), "w", encoding="utf-8") as f:
            f.write("ref: refs/heads/main\n")

        repo = collect_git_repository(git_dir)
        self.assertIsNotNone(repo)
        self.assertEqual(repo.current_branch, "main")
        self.assertEqual(repo.commit_count, 0)
        self.assertIsNone(repo.last_commit_timestamp)

        proj, graph, findings = run_entropy_inspect(git_dir)
        report = format_inspect_report(proj, graph, findings)
        self.assertIn("Empty / Newly Initialized Repository", report)
        self.assertIn("main", report)
        self.assertIn("0 commits (new repository)", report)

    def test_nonexistent_path_cli(self):
        """CLI must exit with code 1 and error message on nonexistent path."""
        nonexistent = os.path.join(self.temp_dir, "nonexistent_subfolder")
        stderr_buf = io.StringIO()
        with patch("sys.stderr", stderr_buf):
            ret = main(["inspect", nonexistent])
        self.assertEqual(ret, 1)
        self.assertIn("does not exist", stderr_buf.getvalue())

    def test_file_target_cli(self):
        """CLI must exit with code 1 if targeted path is a file, not a directory."""
        file_path = os.path.join(self.temp_dir, "somefile.txt")
        with open(file_path, "w") as f:
            f.write("hello")

        stderr_buf = io.StringIO()
        with patch("sys.stderr", stderr_buf):
            ret = main(["inspect", file_path])
        self.assertEqual(ret, 1)
        self.assertIn("is not a directory", stderr_buf.getvalue())

    def test_process_race_disappearance(self):
        """Process that terminates mid-enumeration (NoSuchProcess) must not crash collector."""
        mock_proc_ok = MagicMock()
        mock_proc_ok.info = {
            "pid": 1234,
            "name": "python.exe",
            "exe": "C:\\Python\\python.exe",
            "cmdline": ["python.exe", "server.py"],
            "create_time": 1000000.0,
            "ppid": 1,
        }
        mock_proc_ok.cwd.return_value = "C:\\dev\\project"
        mock_proc_ok.memory_info.return_value = MagicMock(rss=1024 * 1024)

        mock_proc_dying = MagicMock()
        mock_proc_dying.info.side_effect = psutil.NoSuchProcess(pid=9999)

        mock_proc_denied = MagicMock()
        mock_proc_denied.info = {
            "pid": 4,
            "name": "System",
            "exe": None,
            "cmdline": None,
            "create_time": None,
            "ppid": 0,
        }
        mock_proc_denied.cwd.side_effect = psutil.AccessDenied(pid=4)
        mock_proc_denied.memory_info.side_effect = psutil.AccessDenied(pid=4)

        with patch("psutil.process_iter", return_value=[mock_proc_ok, mock_proc_dying, mock_proc_denied]):
            procs = collect_processes()
            self.assertGreaterEqual(len(procs), 1)
            pids = [p.pid for p in procs]
            self.assertIn(1234, pids)
            self.assertNotIn(9999, pids)

    def test_docker_unavailable_graceful_fallback(self):
        """When Docker daemon is offline, collector handles it cleanly."""
        with patch("subprocess.run", side_effect=FileNotFoundError("docker not found")):
            ok, err, containers, images, volumes = collect_docker()
            self.assertFalse(ok)
            self.assertIn("not installed", err)
            self.assertEqual(len(containers), 0)

    def test_windows_path_normalization(self):
        """Forward and backward slashes with case variations must resolve accurately."""
        self.assertTrue(_is_subpath("C:/Users/pc/Desktop/entropy/src", "c:\\users\\pc\\desktop\\entropy"))
        self.assertTrue(_is_subpath("c:\\users\\pc\\desktop\\entropy\\src\\file.py", "C:/Users/pc/Desktop/entropy"))
        self.assertFalse(_is_subpath("C:/other/path", "c:\\users\\pc\\desktop\\entropy"))

    def test_malformed_git_head(self):
        """Corrupted .git/HEAD file must not raise uncaught exceptions."""
        git_dir = os.path.join(self.temp_dir, "corrupt_git")
        os.makedirs(os.path.join(git_dir, ".git"), exist_ok=True)
        # Write corrupted binary data to HEAD
        with open(os.path.join(git_dir, ".git", "HEAD"), "wb") as f:
            f.write(b"\x00\xff\xfe\x12\x34\x00")

        repo = collect_git_repository(git_dir)
        self.assertIsNotNone(repo)
        self.assertIsNone(repo.current_branch)

    def test_cli_version_and_help(self):
        """Top-level flags --version and --help must exit cleanly."""
        with self.assertRaises(SystemExit) as cm:
            main(["--version"])
        self.assertEqual(cm.exception.code, 0)

        with self.assertRaises(SystemExit) as cm:
            main(["--help"])
        self.assertEqual(cm.exception.code, 0)

        self.assertEqual(main([]), 0)

    def test_json_output_mode(self):
        """Passing --json must produce parseable JSON graph output."""
        empty_dir = os.path.join(self.temp_dir, "json_workspace")
        os.makedirs(empty_dir, exist_ok=True)
        stdout_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf):
            ret = main(["inspect", empty_dir, "--json"])
        self.assertEqual(ret, 0)
        data = json.loads(stdout_buf.getvalue())
        self.assertIn("scan_metadata", data)
        self.assertIn("entities", data)
        self.assertIn("relationships", data)
        self.assertIn("findings", data)


if __name__ == "__main__":
    unittest.main()
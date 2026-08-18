import json
import tempfile
import unittest
from pathlib import Path

from pickaxe_maze.cli import main


class TestCli(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

    def test_generate_writes_a_maze_json(self):
        out = self.tmp_path / "star1.json"
        rc = main(["generate", "--star", "1", "--sg-seed", "1", "--path-seed", "1", "--wall-seed", "1", "--out", str(out)])
        self.assertEqual(rc, 0)
        data = json.loads(out.read_text())
        self.assertEqual(data["pickaxe_count"], 1)
        self.assertIn("solutionTrace", data)
        self.assertIn("seeds", data)

    def test_generate_level_writes_a_level_progress_json(self):
        out = self.tmp_path / "kinder.json"
        rc = main(["generate-level", "--level", "kinder", "--out", str(out)])
        self.assertEqual(rc, 0)
        data = json.loads(out.read_text())
        self.assertEqual(data["formatVersion"], 1)
        self.assertEqual(data["mazeType"], "pickaxe")
        self.assertEqual(len(data["questions"]), 8)
        self.assertEqual(data["questions"][0]["question_id"], "kinder-1star-1")

    def test_validate_writes_a_report_next_to_the_stem_name(self):
        maze_path = self.tmp_path / "sample.json"
        rc = main(["generate", "--star", "2", "--out", str(maze_path)])
        self.assertEqual(rc, 0)

        rc = main(["validate", str(maze_path), "--out-dir", str(self.tmp_path)])
        self.assertEqual(rc, 0)
        report_path = self.tmp_path / "sample_report.md"
        self.assertTrue(report_path.exists())
        self.assertIn("VALID", report_path.read_text())

    def test_validate_reports_missing_file(self):
        rc = main(["validate", str(self.tmp_path / "does_not_exist.json")])
        self.assertEqual(rc, 1)


if __name__ == "__main__":
    unittest.main()

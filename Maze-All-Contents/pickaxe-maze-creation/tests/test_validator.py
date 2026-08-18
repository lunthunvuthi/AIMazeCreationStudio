import unittest

from pickaxe_maze.models import MazeData
from pickaxe_maze.validator import validate_maze
from pickaxe_maze.grid import Grid, parse_rows, to_rows


class TestGridParsing(unittest.TestCase):
    def test_parses_rules_md_example(self):
        grid = parse_rows(["s,_,_", "|,_|,.", "|,.,g"])
        self.assertEqual(grid.start, (0, 0))
        self.assertEqual(grid.goal, (2, 2))
        self.assertTrue(grid.cell(1, 0).bottom_wall)
        self.assertTrue(grid.cell(0, 1).right_wall)
        self.assertTrue(grid.cell(1, 1).right_wall)
        self.assertTrue(grid.cell(1, 1).bottom_wall)

    def test_rejects_missing_start(self):
        with self.assertRaises(ValueError):
            parse_rows([".,.,.", ".,.,.", ".,.,g"])

    def test_rejects_duplicate_start(self):
        with self.assertRaises(ValueError):
            parse_rows(["s,.,.", ".,.,.", ".,.,s"])

    def test_rejects_ragged_rows(self):
        with self.assertRaises(ValueError):
            parse_rows(["s,.,.", ".,.", ".,.,g"])

    def test_rejects_unknown_token(self):
        with self.assertRaises(ValueError):
            parse_rows(["s,?,.", ".,.,.", ".,.,g"])

    def test_rejects_malformed_start_suffix(self):
        with self.assertRaises(ValueError):
            parse_rows(["s?,.,.", ".,.,.", ".,.,g"])

    def test_parses_compound_start_and_goal_tokens(self):
        grid = parse_rows(["s_|,.,.", ".,.,.", ".,.,g|"])
        self.assertEqual(grid.start, (0, 0))
        self.assertEqual(grid.goal, (2, 2))
        self.assertTrue(grid.cell(0, 0).right_wall)
        self.assertTrue(grid.cell(0, 0).bottom_wall)
        self.assertTrue(grid.cell(2, 2).right_wall)

    def test_set_wall_on_start_and_goal_owned_edges_round_trips(self):
        # G at (2,1), not a corner, so it actually owns an edge (its bottom one).
        grid = Grid(3, 3)
        grid.cells[0][0].kind = "start"
        grid.cells[1][2].kind = "goal"
        grid.start, grid.goal = (0, 0), (2, 1)
        grid.set_wall(0, 0, 1, 0, True)  # S's right edge, owned by S
        grid.set_wall(2, 1, 2, 2, True)  # G's bottom edge, owned by G
        rows = to_rows(grid)
        self.assertEqual(rows[0].split(",")[0], "s|")
        self.assertEqual(rows[1].split(",")[2], "g_")
        reparsed = parse_rows(rows)
        self.assertTrue(reparsed.cell(0, 0).right_wall)
        self.assertTrue(reparsed.cell(2, 1).bottom_wall)


class TestValidateMaze(unittest.TestCase):
    def test_single_row_unique_solution(self):
        # (0,0)=S -[open]- (1,0) -[| wall]- (2,0)=G, exactly 1 pickaxe available.
        maze = MazeData(pickaxe_count=1, width=3, height=1, maze=["s,|,g"])
        result = validate_maze(maze)
        self.assertEqual(result.solution_count, 1)
        self.assertEqual(result.trace, "S,1 -> 2 -> 3(break | wall)")

    def test_zero_pickaxes_reports_needs_more(self):
        maze = MazeData(pickaxe_count=0, width=3, height=1, maze=["s,|,g"])
        result = validate_maze(maze)
        self.assertEqual(result.solution_count, 0)
        self.assertIn("more pickaxes", result.diagnostic)

    def test_too_many_pickaxes_reports_needs_fewer(self):
        maze = MazeData(pickaxe_count=2, width=3, height=1, maze=["s,|,g"])
        result = validate_maze(maze)
        self.assertEqual(result.solution_count, 0)
        self.assertIn("fewer pickaxes", result.diagnostic)

    def test_rules_md_example_has_two_solutions(self):
        # This exact JSON is used in rules.md/validator_design.md purely to
        # illustrate the data format, not as a validated unique-solution maze.
        maze = MazeData(pickaxe_count=1, width=3, height=3,
                         maze=["s,_,_", "|,_|,.", "|,.,g"])
        result = validate_maze(maze)
        self.assertEqual(result.solution_count, 2)
        self.assertIn("S,1 -> 4 -> 7 -> 8(break | wall) -> 9", result.conflicting_paths)
        self.assertIn("S,1 -> 2 -> 3 -> 6(break _ wall) -> 9", result.conflicting_paths)

    def test_diagnostic_can_be_skipped(self):
        maze = MazeData(pickaxe_count=0, width=3, height=1, maze=["s,|,g"])
        result = validate_maze(maze, include_diagnostic=False)
        self.assertEqual(result.solution_count, 0)
        self.assertIsNone(result.diagnostic)

    def test_routes_sharing_the_same_broken_wall_count_as_one_solution(self):
        # input/star3-show.json — previously reported as 4 "conflicting
        # paths", but all 4 break the exact same wall (between cells 7 and
        # 8) and only differ by a free (no-wall) detour through open cells.
        # rules.md §6: same wall-set == same solution.
        maze = MazeData(
            pickaxe_count=1, width=4, height=4,
            maze=["s|,_,_|,g", "|,.,|,_", ".,.,_|,.", ".,|,.,."],
        )
        result = validate_maze(maze)
        self.assertEqual(result.solution_count, 1)
        self.assertIn("8(break | wall)", result.trace)

    def test_routes_breaking_different_walls_still_count_as_two_solutions(self):
        # Same maze as test_rules_md_example_has_two_solutions, restated here
        # to make explicit that genuinely different wall-sets are NOT
        # collapsed by the new dedup logic.
        maze = MazeData(pickaxe_count=1, width=3, height=3,
                         maze=["s,_,_", "|,_|,.", "|,.,g"])
        result = validate_maze(maze)
        self.assertEqual(result.solution_count, 2)


if __name__ == "__main__":
    unittest.main()

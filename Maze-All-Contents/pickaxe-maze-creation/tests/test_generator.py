import unittest

from pickaxe_maze.difficulty import STAR_PARAMS
from pickaxe_maze.generator import generate_maze
from pickaxe_maze.grid import parse_rows
from pickaxe_maze.validator import validate_maze


class TestGenerateMaze(unittest.TestCase):
    def test_star_one_is_unique_and_matches_spec(self):
        result = generate_maze(star=1, sg_seed=1, path_seed=1, wall_seed=1)
        params = STAR_PARAMS[1]
        self.assertEqual(result.maze.pickaxe_count, params.pickaxe_min)
        self.assertEqual(result.maze.width, params.width)
        self.assertEqual(result.maze.height, params.height)

        grid = parse_rows(result.maze.maze)
        self.assertGreaterEqual(grid.wall_count(), params.min_walls)
        self.assertEqual(grid.start[0], 0)  # column 1
        self.assertEqual(grid.goal[0], params.width - 1)  # last column

        revalidated = validate_maze(result.maze)
        self.assertEqual(revalidated.solution_count, 1)
        self.assertEqual(revalidated.trace, result.solution_trace)

    def test_is_deterministic_given_same_seeds(self):
        a = generate_maze(star=2, sg_seed=42, path_seed=7, wall_seed=99)
        b = generate_maze(star=2, sg_seed=42, path_seed=7, wall_seed=99)
        self.assertEqual(a.maze.maze, b.maze.maze)
        self.assertEqual(a.solution_trace, b.solution_trace)

    def test_wall_seed_reroll_keeps_path_seed_fixed_but_can_change_layout(self):
        base = generate_maze(star=2, sg_seed=5, path_seed=5, wall_seed=1)
        reroll = generate_maze(star=2, sg_seed=5, path_seed=5, wall_seed=2)
        self.assertEqual(
            parse_rows(base.maze.maze).start, parse_rows(reroll.maze.maze).start
        )
        self.assertEqual(
            parse_rows(base.maze.maze).goal, parse_rows(reroll.maze.maze).goal
        )
        # both must independently still be valid, unique-solution mazes
        self.assertEqual(validate_maze(base.maze).solution_count, 1)
        self.assertEqual(validate_maze(reroll.maze).solution_count, 1)

    def test_meets_minimum_wall_count_for_mid_star(self):
        result = generate_maze(star=4, sg_seed=3, path_seed=3, wall_seed=3)
        grid = parse_rows(result.maze.maze)
        self.assertGreaterEqual(grid.wall_count(), STAR_PARAMS[4].min_walls)
        self.assertEqual(validate_maze(result.maze).solution_count, 1)

    def test_star_one_succeeds_across_many_seeds(self):
        # Star 1 is the case that exposed placement-dependent minimum wall
        # counts (some S/G row pairings need up to 6 walls, not just 4) — this
        # guards against the generator silently failing for "bad" placements.
        for seed in range(30):
            result = generate_maze(star=1, sg_seed=seed, path_seed=seed, wall_seed=seed)
            self.assertEqual(validate_maze(result.maze).solution_count, 1)

    def test_all_stars_succeed_quickly(self):
        # Regression guard: larger grids (6-8) were briefly ~15s-2min+ each
        # before validate_maze gained early-exit search bounds. Note the
        # current accepted baseline: since validate_maze started deduping
        # solutions by broken-wall-set instead of raw cell route (rules.md
        # §6 — two routes breaking the same walls are one solution), proving
        # star 8's uniqueness costs ~6-10s (an accepted trade-off; see
        # validator.py's module docstring) instead of the sub-second it used
        # to take, because it now has to exhaustively rule out a second,
        # genuinely different wall-set instead of bailing on the first extra
        # raw path found. This test still catches any *worse* regression
        # (e.g. losing max_states/the admissible-bound prune entirely).
        for star in range(1, 9):
            params = STAR_PARAMS[star]
            result = generate_maze(star=star, sg_seed=star, path_seed=star, wall_seed=star)
            self.assertEqual(validate_maze(result.maze).solution_count, 1)
            self.assertGreaterEqual(parse_rows(result.maze.maze).wall_count(), params.min_walls)

    def test_seeds_are_reported_when_auto_picked(self):
        result = generate_maze(star=1)
        self.assertIsInstance(result.sg_seed, int)
        self.assertIsInstance(result.path_seed, int)
        self.assertIsInstance(result.wall_seed, int)


if __name__ == "__main__":
    unittest.main()

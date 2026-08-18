"""Constructive generator, ported from ../generation_spec.md.

Steps 1-2 (init + S/G placement) are seeded by sg_seed; step 3 (ideal path) by
path_seed; steps 4-5 (required + distraction walls) by wall_seed. Step 6-7
(validate, evaluate/retry) call back into validator.validate_maze exactly as
generation_spec.md §3 specifies. Each of the three seeds is independent so that
Web App/development_plan.md §6.6's three reroll modes (S/G, path, walls) can
each hold the other two fixed.
"""

import random
from dataclasses import dataclass
from typing import List, Optional, Tuple

from .difficulty import STAR_PARAMS
from .grid import DIRECTIONS, Grid, to_rows
from .models import MazeData
from .validator import validate_maze

MAX_PATH_ATTEMPTS = 50
MAX_WALL_ATTEMPTS = 200
# Since every wall in this game is breakable given enough pickaxes, uniqueness
# isn't reliably reachable at a sparse, bare-minimum wall count on open grids —
# a long, winding ideal path leaves too many cells free for alternate detours
# of the same total pickaxe cost. Two mitigations, both verified empirically
# during implementation (see difficulty_setting.md's note on star 1):
#   1. bias the ideal path toward short/direct routes (fewer free detour cells)
#   2. treat min_walls as a floor and escalate distraction-wall DENSITY well
#      past it — up to walling every non-path edge — rather than a small fixed
#      increment, since even "near or fully walled off-path" is sometimes what
#      it takes on larger grids.
FILL_FRACTIONS = [0.0, 0.25, 0.5, 0.75, 1.0]
ATTEMPTS_PER_FILL_LEVEL = MAX_WALL_ATTEMPTS // len(FILL_FRACTIONS)
# Most rejected candidates have many solutions, not just two — bail the
# instant a 2nd is found instead of enumerating every one (see validator.py's
# max_solutions_to_find). max_states bounds the cost of a single validate call
# on a pathologically open larger grid.
VALIDATE_MAX_STATES = 200_000

Coord = Tuple[int, int]


class GenerationError(RuntimeError):
    pass


@dataclass
class GenerationResult:
    maze: MazeData
    solution_trace: str
    sg_seed: int
    path_seed: int
    wall_seed: int


def generate_maze(
    star: int,
    sg_seed: Optional[int] = None,
    path_seed: Optional[int] = None,
    wall_seed: Optional[int] = None,
) -> GenerationResult:
    params = STAR_PARAMS[star]

    sg_seed = sg_seed if sg_seed is not None else random.getrandbits(32)
    path_seed = path_seed if path_seed is not None else random.getrandbits(32)
    wall_seed = wall_seed if wall_seed is not None else random.getrandbits(32)

    # Steps 1-2: init + place S in column 1, G in the last column (generation_spec.md §1).
    rng_sg = random.Random(sg_seed)
    pickaxe_count = rng_sg.randint(params.pickaxe_min, params.pickaxe_max)
    start = (0, rng_sg.randrange(params.height))
    goal = (params.width - 1, rng_sg.randrange(params.height))

    manhattan = abs(goal[0] - start[0]) + abs(goal[1] - start[1])

    for path_attempt in range(MAX_PATH_ATTEMPTS):
        # Step 3: draw the ideal path — biased short at first (fewer free
        # detour cells left over), relaxing the length cap on later attempts.
        rng_path = random.Random(f"{path_seed}:{path_attempt}")
        max_length = manhattan + 1 + 2 * (path_attempt // 5)
        path = _draw_path(params.width, params.height, start, goal, rng_path, max_length)
        if path is None:
            continue
        path_edges = list(zip(path, path[1:]))
        if len(path_edges) < pickaxe_count:
            continue  # too short to host pickaxe_count required walls; redraw

        for wall_attempt in range(MAX_WALL_ATTEMPTS):
            rng_wall = random.Random(f"{wall_seed}:{path_attempt}:{wall_attempt}")

            # Step 4: required walls, exactly pickaxe_count of them, on the path.
            grid = _build_grid(params.width, params.height, start, goal)
            required_edges = rng_wall.sample(path_edges, pickaxe_count)
            for (x1, y1), (x2, y2) in required_edges:
                grid.set_wall(x1, y1, x2, y2, True)

            # Step 5: distraction walls, off the path. min_walls is a floor —
            # escalate the fill density past it across attempts if the bare
            # minimum can't reach a unique solution (see the module docstring).
            level = min(wall_attempt // ATTEMPTS_PER_FILL_LEVEL, len(FILL_FRACTIONS) - 1)
            _scatter_distraction_walls(grid, path_edges, params, rng_wall, FILL_FRACTIONS[level])

            maze_data = MazeData(
                pickaxe_count=pickaxe_count,
                width=params.width,
                height=params.height,
                maze=to_rows(grid),
            )

            # Steps 6-7: validate and evaluate.
            result = validate_maze(
                maze_data,
                include_diagnostic=False,
                max_solutions_to_find=2,
                max_states=VALIDATE_MAX_STATES,
            )
            if result.truncated:
                continue  # too expensive to resolve; try a different layout
            if result.solution_count == 1:
                return GenerationResult(
                    maze=maze_data,
                    solution_trace=result.trace,
                    sg_seed=sg_seed,
                    path_seed=path_seed,
                    wall_seed=wall_seed,
                )

    raise GenerationError(
        f"Could not construct a unique-solution star-{star} maze after "
        f"{MAX_PATH_ATTEMPTS} path attempts x {MAX_WALL_ATTEMPTS} wall attempts each."
    )


def _build_grid(width, height, start, goal) -> Grid:
    grid = Grid(width, height)
    sx, sy = start
    gx, gy = goal
    grid.cells[sy][sx].kind = "start"
    grid.cells[gy][gx].kind = "goal"
    grid.start = start
    grid.goal = goal
    return grid


def _draw_path(width, height, start, goal, rng, max_length=None) -> Optional[List[Coord]]:
    """Randomized backtracking walk from start to goal that never revisits a
    cell (rules.md §4) — the "ideal path" of generation_spec.md §2 step 3.

    max_length caps how many cells the path may visit before it must have
    reached goal — keeping it near the direct distance leaves more free cells
    off-path, which is what actually makes uniqueness achievable (see the
    module docstring).
    """
    visited = {start}
    path = [start]

    def backtrack():
        if path[-1] == goal:
            return True
        if max_length is not None and len(path) >= max_length:
            return False
        x, y = path[-1]
        candidates = []
        for dx, dy in DIRECTIONS:
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                candidates.append((nx, ny))
        rng.shuffle(candidates)
        for nxt in candidates:
            visited.add(nxt)
            path.append(nxt)
            if backtrack():
                return True
            path.pop()
            visited.remove(nxt)
        return False

    return list(path) if backtrack() else None


def _scatter_distraction_walls(grid, path_edges, params, rng, fill_fraction=0.0):
    """Places distraction walls off the path. fill_fraction (0..1) says how
    much of the remaining, non-required headroom to fill beyond the star's
    min_walls floor — 0.0 is the bare minimum, 1.0 walls every off-path edge.
    """
    all_edges = set()
    for y in range(grid.height):
        for x in range(grid.width):
            if x + 1 < grid.width:
                all_edges.add(((x, y), (x + 1, y)))
            if y + 1 < grid.height:
                all_edges.add(((x, y), (x, y + 1)))

    normalized_path_edges = {
        (a, b) if a <= b else (b, a) for a, b in path_edges
    }
    candidates = list(all_edges - normalized_path_edges)
    rng.shuffle(candidates)

    floor = max(0, params.min_walls - grid.wall_count())
    headroom = max(0, len(candidates) - floor)
    needed = floor + round(fill_fraction * headroom)
    if params.max_walls is not None:
        needed = max(0, min(needed, params.max_walls - grid.wall_count()))
    needed = min(needed, len(candidates))

    for (x1, y1), (x2, y2) in candidates[:needed]:
        grid.set_wall(x1, y1, x2, y2, True)

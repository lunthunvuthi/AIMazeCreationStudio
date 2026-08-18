"""Backtracking DFS validator, ported from ../validator_design.md.

Given a MazeData, explores every non-crossing path from S to G, tracking
remaining pickaxes, and reports whether exactly one *distinct wall-set* is
ever broken by a path that reaches G with exactly 0 pickaxes remaining
(rules.md §5-6). Two routes that break the same walls but wander differently
through open, wall-less cells are the same solution — only a route that
breaks a genuinely different set of walls counts as a second one.

Accepted performance trade-off: proving uniqueness under this rule sometimes
means exhaustively walking every one of those harmless-but-equivalent routes
before concluding no second, genuinely different wall-set exists — the old
raw-path-count check could bail the instant *any* second path was found, this
one can't. `_min_wall_breaks_to_goal` prunes branches that are genuinely
infeasible (not enough pickaxes left), which helps but doesn't touch this
case. A more general fix (grouping routes via bridge/biconnected-component
graph analysis) was prototyped and found ineffective on this generator's
actual output — its free regions typically have many boundary walls, not the
single entry/exit a simple version of that approach needs — and reverted as
not worth the added correctness risk. In practice this only costs generation
time for the largest stars (~6-10s for star 8, sub-second for 1-6), which is
a one-time/background cost, not a per-request one today.
"""

from collections import deque
from dataclasses import dataclass, field
from typing import Dict, FrozenSet, List, Optional, Tuple

from .grid import DIRECTIONS, cell_index, parse_rows
from .models import MazeData

# Safety cap on how many states the (expensive, unlimited-pickaxe) diagnostic
# search will expand before giving up on a precise explanation.
_DIAGNOSTIC_STATE_CAP = 300_000


@dataclass
class ValidationResult:
    solution_count: int
    trace: Optional[str] = None
    diagnostic: Optional[str] = None
    conflicting_paths: List[str] = field(default_factory=list)
    truncated: bool = False


class _FoundEnough(Exception):
    """Deliberate early-exit once max_solutions_to_find is reached — the count
    at that point is a reliable lower bound, not a guess.
    """


class _StateCapExceeded(Exception):
    """Safety-net early-exit — the result is NOT reliable and must be treated
    as unknown, unlike _FoundEnough.
    """


def _min_wall_breaks_to_goal(grid, goal) -> Dict[Tuple[int, int], int]:
    """0-1 BFS: the minimum number of walls that must be broken to reach
    `goal` from every cell, ignoring the no-revisit constraint entirely.

    Dropping that constraint can only ever make a route cheaper or equal,
    never more expensive, so this is a valid admissible lower bound — safe to
    use for branch-and-bound pruning in explore() without ever discarding a
    real solution (mirrors A*/branch-and-bound heuristic pruning).
    """
    dist: Dict[Tuple[int, int], int] = {}
    dist[goal] = 0
    dq = deque([goal])
    while dq:
        x, y = dq.popleft()
        d = dist[(x, y)]
        for nx, ny in grid.neighbors(x, y):
            cost = 0 if grid.wall_between(x, y, nx, ny) is None else 1
            nd = d + cost
            if (nx, ny) not in dist or nd < dist[(nx, ny)]:
                dist[(nx, ny)] = nd
                if cost == 0:
                    dq.appendleft((nx, ny))
                else:
                    dq.append((nx, ny))
    return dist


def validate_maze(
    maze_data: MazeData,
    include_diagnostic: bool = True,
    max_solutions_to_find: Optional[int] = None,
    max_states: Optional[int] = None,
) -> ValidationResult:
    """Runs the DFS from validator_design.md §3-4 against maze_data.

    include_diagnostic controls whether, on solution_count == 0, the (more
    expensive) unlimited-pickaxe search runs to explain *why*.

    max_solutions_to_find lets a caller that only cares about "is this unique"
    (not the exact count) stop as soon as a second *distinct wall-set* is
    found, instead of exhaustively enumerating every route — the generator's
    internal retry loop uses this, since most rejected candidates have many
    genuinely different solutions, not just two, and enumerating all of them
    is wasted work. max_states caps total DFS expansions as a safety net
    against pathological search blowups; when hit, the result is marked
    truncated (unreliable) rather than exact.
    """
    grid = parse_rows(maze_data.maze)
    goal = grid.goal
    min_cost_to_goal = _min_wall_breaks_to_goal(grid, goal)
    solutions_by_walls: Dict[FrozenSet[Tuple], str] = {}
    state_count = 0

    def explore(x, y, remaining, visited, path, broken_edges):
        nonlocal state_count
        state_count += 1
        if max_states is not None and state_count > max_states:
            raise _StateCapExceeded()
        # Branch-and-bound: if even the cheapest possible route from here
        # (ignoring no-revisit) needs more walls than we have left, this
        # branch can never reach the goal — safe to prune (see
        # _min_wall_breaks_to_goal's docstring).
        if remaining < min_cost_to_goal.get((x, y), float("inf")):
            return
        if (x, y) == goal:
            if remaining == 0:
                walls = frozenset(broken_edges)
                if walls not in solutions_by_walls:
                    solutions_by_walls[walls] = " -> ".join(path)
                    if max_solutions_to_find is not None and len(solutions_by_walls) >= max_solutions_to_find:
                        raise _FoundEnough()
            return
        for dx, dy in DIRECTIONS:
            nx, ny = x + dx, y + dy
            if not grid.in_bounds(nx, ny) or (nx, ny) in visited:
                continue
            wall = grid.wall_between(x, y, nx, ny)
            idx = cell_index(nx, ny, grid.width)
            if wall is not None:
                if remaining > 0:
                    visited.add((nx, ny))
                    edge = tuple(sorted([(x, y), (nx, ny)]))
                    explore(
                        nx, ny, remaining - 1, visited,
                        path + [f"{idx}(break {wall} wall)"], broken_edges + (edge,),
                    )
                    visited.remove((nx, ny))
            else:
                visited.add((nx, ny))
                explore(nx, ny, remaining, visited, path + [str(idx)], broken_edges)
                visited.remove((nx, ny))

    sx, sy = grid.start
    start_index = cell_index(sx, sy, grid.width)
    try:
        explore(sx, sy, maze_data.pickaxe_count, {(sx, sy)}, [f"S,{start_index}"], ())
    except _FoundEnough:
        pass
    except _StateCapExceeded:
        return ValidationResult(
            solution_count=len(solutions_by_walls),
            truncated=True,
            diagnostic="Search truncated before completing (maze too complex to fully analyze).",
        )

    if len(solutions_by_walls) == 1:
        return ValidationResult(solution_count=1, trace=next(iter(solutions_by_walls.values())))

    if len(solutions_by_walls) > 1:
        return ValidationResult(
            solution_count=len(solutions_by_walls),
            conflicting_paths=list(solutions_by_walls.values()),
            diagnostic="Multiple valid solutions found; maze is not unique.",
        )

    diagnostic = _diagnose_unsolvable(grid, maze_data.pickaxe_count) if include_diagnostic else None
    return ValidationResult(solution_count=0, diagnostic=diagnostic)


def _diagnose_unsolvable(grid, pickaxe_count) -> str:
    """Explains a 0-solution result by re-exploring with an unlimited pickaxe
    budget (walls still apply, but breaking one is always allowed) and
    recording how many breaks every complete S->G path actually used.
    """
    goal = grid.goal
    achievable = set()
    state_count = 0
    truncated = False

    def explore(x, y, breaks, visited):
        nonlocal state_count, truncated
        state_count += 1
        if state_count > _DIAGNOSTIC_STATE_CAP:
            truncated = True
            return
        if (x, y) == goal:
            achievable.add(breaks)
            return
        for dx, dy in DIRECTIONS:
            if truncated:
                return
            nx, ny = x + dx, y + dy
            if not grid.in_bounds(nx, ny) or (nx, ny) in visited:
                continue
            wall = grid.wall_between(x, y, nx, ny)
            visited.add((nx, ny))
            explore(nx, ny, breaks + (1 if wall else 0), visited)
            visited.remove((nx, ny))

    sx, sy = grid.start
    explore(sx, sy, 0, {(sx, sy)})

    if truncated and not achievable:
        return "Goal unreachable (or too complex to analyze automatically)."
    if not achievable:
        return "Goal is unreachable from Start regardless of pickaxes used."

    lo, hi = min(achievable), max(achievable)
    if pickaxe_count < lo:
        return (
            f"Requires more pickaxes: the shortest viable route needs at least "
            f"{lo}, but only {pickaxe_count} were given."
        )
    if pickaxe_count > hi:
        return (
            f"Requires fewer pickaxes: no route uses more than {hi}, but "
            f"{pickaxe_count} were given."
        )
    note = " (search truncated; list may be incomplete)" if truncated else ""
    return (
        f"No route uses exactly {pickaxe_count} pickaxe(s); routes exist using "
        f"{sorted(achievable)} pickaxe(s){note}."
    )

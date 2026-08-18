"""Internal grid representation shared by the validator and generator.

Implements the parsing/serialization rules from ../rules.md §7: each row is a
comma-separated string of cells. A cell token is an optional kind prefix
("s"/"g", absent for a normal cell) plus a wall suffix ("", "|", "_", "_|") —
"." is the explicit normal-cell "no wall" spelling. A right wall ("|") is
owned by the cell to the left of the edge; a bottom wall ("_") is owned by the
cell above the edge — that ownership convention is what lets wall_between()
work from either side of an edge. Any cell, including start/goal, can own a
wall (e.g. "s_|", "g|").
"""

from dataclasses import dataclass

UP, DOWN, LEFT, RIGHT = (0, -1), (0, 1), (-1, 0), (1, 0)
DIRECTIONS = [UP, DOWN, LEFT, RIGHT]


@dataclass
class Cell:
    kind: str = "normal"  # "start" | "goal" | "normal"
    right_wall: bool = False
    bottom_wall: bool = False


class Grid:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.cells = [[Cell() for _ in range(width)] for _ in range(height)]
        self.start = None
        self.goal = None

    def cell(self, x, y):
        return self.cells[y][x]

    def in_bounds(self, x, y):
        return 0 <= x < self.width and 0 <= y < self.height

    def neighbors(self, x, y):
        for dx, dy in DIRECTIONS:
            nx, ny = x + dx, y + dy
            if self.in_bounds(nx, ny):
                yield nx, ny

    def wall_between(self, x1, y1, x2, y2):
        """Returns "|" / "_" if a wall separates the two (adjacent) cells, else None."""
        dx, dy = x2 - x1, y2 - y1
        if dx == 1 and dy == 0:
            return "|" if self.cell(x1, y1).right_wall else None
        if dx == -1 and dy == 0:
            return "|" if self.cell(x2, y2).right_wall else None
        if dy == 1 and dx == 0:
            return "_" if self.cell(x1, y1).bottom_wall else None
        if dy == -1 and dx == 0:
            return "_" if self.cell(x2, y2).bottom_wall else None
        raise ValueError(f"({x1},{y1}) and ({x2},{y2}) are not orthogonally adjacent")

    def set_wall(self, x1, y1, x2, y2, present=True):
        dx, dy = x2 - x1, y2 - y1
        if dx == 1 and dy == 0:
            self.cell(x1, y1).right_wall = present
        elif dx == -1 and dy == 0:
            self.cell(x2, y2).right_wall = present
        elif dy == 1 and dx == 0:
            self.cell(x1, y1).bottom_wall = present
        elif dy == -1 and dx == 0:
            self.cell(x2, y2).bottom_wall = present
        else:
            raise ValueError(f"({x1},{y1}) and ({x2},{y2}) are not orthogonally adjacent")

    def wall_count(self):
        return sum(
            (1 if c.right_wall else 0) + (1 if c.bottom_wall else 0)
            for row in self.cells
            for c in row
        )


def cell_index(x, y, width):
    """1-based index, left-to-right then top-to-bottom (rules.md §1)."""
    return y * width + x + 1


def parse_rows(rows):
    """Parses ["s,_,_", "|,_|,.", "|,.,g"] style rows into a Grid."""
    if not rows:
        raise ValueError("maze has no rows")

    parsed_rows = [row.split(",") for row in rows]
    width = len(parsed_rows[0])
    for row in parsed_rows:
        if len(row) != width:
            raise ValueError("all maze rows must have the same number of cells")

    grid = Grid(width, len(parsed_rows))
    start = goal = None
    for y, row in enumerate(parsed_rows):
        for x, raw in enumerate(row):
            token = raw.strip()
            cell = grid.cells[y][x]

            if token.startswith("s"):
                if start is not None:
                    raise ValueError("maze has more than one start cell")
                start = (x, y)
                cell.kind = "start"
                wall_part = token[1:]
            elif token.startswith("g"):
                if goal is not None:
                    raise ValueError("maze has more than one goal cell")
                goal = (x, y)
                cell.kind = "goal"
                wall_part = token[1:]
            elif token == ".":
                wall_part = ""
            elif token in ("|", "_", "_|"):
                wall_part = token
            else:
                raise ValueError(f"unrecognized maze cell token {raw!r}")

            if wall_part == "|":
                cell.right_wall = True
            elif wall_part == "_":
                cell.bottom_wall = True
            elif wall_part == "_|":
                cell.right_wall = True
                cell.bottom_wall = True
            elif wall_part != "":
                raise ValueError(f"unrecognized maze cell token {raw!r}")

    if start is None:
        raise ValueError("maze has no start cell")
    if goal is None:
        raise ValueError("maze has no goal cell")

    grid.start = start
    grid.goal = goal
    return grid


def to_rows(grid):
    """Serializes a Grid back into rules.md §7's row-string format."""
    rows = []
    for y in range(grid.height):
        tokens = []
        for x in range(grid.width):
            cell = grid.cells[y][x]
            prefix = {"start": "s", "goal": "g", "normal": ""}[cell.kind]
            if cell.right_wall and cell.bottom_wall:
                suffix = "_|"
            elif cell.right_wall:
                suffix = "|"
            elif cell.bottom_wall:
                suffix = "_"
            else:
                suffix = "" if prefix else "."
            tokens.append(prefix + suffix)
        rows.append(",".join(tokens))
    return rows

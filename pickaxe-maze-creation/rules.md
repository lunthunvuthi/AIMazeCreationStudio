# Rules for Pickaxe Maze

These are the strict rules governing how a player can solve a Pickaxe Maze, which must be adhered to during the maze generation and validation process.

## 1. Grid & Movement
- The maze operates on a 2D grid of cells.
- The player can only move orthogonally: **Up, Down, Left, and Right**. Diagonal movement is not permitted.
- The player moves from one cell to an adjacent cell.
- Cells are indexed sequentially from left-to-right, top-to-bottom, starting at 1. In a 3x3 grid, the top-left cell is 1, and the bottom-right cell is 9.

## 2. Boundaries & Walls
- The outer perimeter of the maze is an **unbreakable border**. The player can never leave the grid.
- Inside the grid, the edges between any two adjacent cells can either be open or closed off by a **wall**.

## 3. Pickaxe Mechanics
- The player is provided with a fixed, predetermined number of **pickaxes** at the start of the maze.
- **Breaking Walls**: To move through a wall to an adjacent cell, the player must use one pickaxe. 
- **Consumption**: One pickaxe breaks exactly one wall. Once used, the pickaxe is consumed and cannot be reused.
- If a player encounters a wall and has **0 pickaxes remaining**, they cannot move through that wall.

## 4. Pathing Constraints (No Crossing)
- The player's path is absolute. **A player can never step on a cell they have already visited.**
- This means the path cannot cross itself, loop back on itself, or revisit any cell (including the start cell).

## 5. Win Condition
To successfully complete the maze, the player must satisfy **both** of the following conditions simultaneously:
1. They must reach the Goal cell (G) starting from the Start cell (S).
2. They must have exactly **0 pickaxes remaining** when they arrive at the goal. (Meaning they must use up *all* given pickaxes on the journey).

## 6. Uniqueness Constraint
- A properly generated Pickaxe Maze must have **exactly one valid solution**.
- If a maze layout has zero solutions, it is broken.
- "Solution" here means a **distinct set of broken walls**, not a distinct cell-by-cell route.
  Two paths that reach the goal using all pickaxes without crossing themselves, but happen to
  break the exact same walls along the way, are the **same** solution even if they wander
  through different free (wall-less) cells to get there — that wandering doesn't change the
  puzzle's actual answer. A maze is only invalid if some path reaches the goal by breaking a
  **different** set of walls than another.

## 7. Data Representation
The maze is represented using a compact data format. Each row is a string of comma-separated cells.

- `s` = Start Cell
- `g` = Goal Cell
- `.` = Empty Cell (no right wall, no bottom wall)
- `|` = Right Wall (this cell has a wall on its right edge)
- `_` = Bottom Wall (this cell has a wall on its bottom edge)
- `_|` = Both right and bottom walls.

A cell's token is its kind (`s`/`g`, or nothing for a normal cell) followed by its wall suffix
(nothing, `|`, `_`, or `_|`) — a normal cell with no wall is spelled `.` instead of an empty
string. This means the Start and Goal cells can also carry walls: `s|`, `s_`, `s_|`, `g|`, `g_`,
`g_|` are all valid tokens, with the same wall semantics as above.

**Example Data Format (3x3 grid):**
```json
{
  "pickaxe_count": 1,
  "maze": [
    "s,_,_",
    "|,_|,.",
    "|,.,g"
  ]
}
```
This data directly maps to the grid layout, indicating where the start and goal are, and where walls exist internally. This is the source of truth that will be passed into the validator.

# Validator Design for Pickaxe Maze

To ensure that a generated Pickaxe Maze is playable and adheres to the uniqueness rule, we need a programmatic validator. The validator will take a maze configuration and return whether the maze is valid (exactly one solution), along with the step-by-step path trace.

## 1. Input Requirements
The validator algorithm should accept data representing the maze in the following format:

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

### Parsing the Data
The validator must parse the array of strings:
- Each string represents a row.
- Splitting by `,` provides individual cells.
- **Cell Content:**
  - `s`: Record as `(startX, startY)`.
  - `g`: Record as `(goalX, goalY)`.
  - `|`: A wall exists between the current cell and the cell to its right.
  - `_`: A wall exists between the current cell and the cell below it.
  - `_|`: Both right and bottom walls exist.
  - `.`: No walls on the right or bottom.

## 2. Output Formatting (Solution Trace)
Cells are identified by a 1-based index, counting left-to-right, top-to-bottom. For a 3x3 grid, cells are numbered 1 through 9.

If the maze is valid, the validator must output the exact path trace, explicitly noting when a wall is broken using the wall symbol (`_` or `|`).

**Example Expected Output:**
`S,1 -> 2 -> 3(break _ wall) -> 6 -> 9`

## 3. Core Algorithm: Depth-First Search (DFS)
A backtracking Depth-First Search (DFS) explores all possible routes and counts *distinct
solutions* while keeping track of the path trace. Per rules.md §6, a "solution" is identified
by **which walls get broken**, not by the exact sequence of cells visited — two routes that
break the same walls but wander through different free cells are the same solution, so they
must be deduplicated before counting.

### State tracking during DFS:
- `Current Cell (x, y)`
- `Remaining Pickaxes (int)`
- `Visited Cells (Set)`: To enforce the "no path crossing" rule.
- `Current Path (List)`: To build the trace output string.
- `Broken Walls (Set)`: The edges broken so far on this route — the dedup key.

### Backtracking Rules (Pseudocode)

```python
solutions_by_walls = {}  # frozenset(broken edges) -> representative path string

function explore(current_x, current_y, remaining_pickaxes, visited_cells, current_path, broken_walls):
    # 1. Check Win Condition
    if (current_x, current_y) == (goalX, goalY):
        if remaining_pickaxes == 0:
            wall_set = frozenset(broken_walls)
            if wall_set not in solutions_by_walls:
                solutions_by_walls[wall_set] = format_path(current_path)
        return # Reached goal, backtrack to find other paths

    # 2. Explore Neighbors
    for direction in [Up, Down, Left, Right]:
        neighbor_x, neighbor_y = get_neighbor(current_x, current_y, direction)
        
        if is_out_of_bounds(neighbor_x, neighbor_y) or (neighbor_x, neighbor_y) in visited_cells:
            continue
            
        wall_type = get_wall_between(current_x, current_y, neighbor_x, neighbor_y) # returns "|", "_", or None
        
        if wall_type is not None: # There is a wall
            if remaining_pickaxes > 0:
                visited_cells.add((neighbor_x, neighbor_y))
                # Append break action to path trace, and record the broken edge
                new_path = current_path + [f"{cell_index(neighbor_x, neighbor_y)}(break {wall_type} wall)"]
                new_broken_walls = broken_walls + [edge_id(current_x, current_y, neighbor_x, neighbor_y)]
                explore(neighbor_x, neighbor_y, remaining_pickaxes - 1, visited_cells, new_path, new_broken_walls)
                visited_cells.remove((neighbor_x, neighbor_y))
        else: # No wall
            visited_cells.add((neighbor_x, neighbor_y))
            new_path = current_path + [f"{cell_index(neighbor_x, neighbor_y)}"]
            explore(neighbor_x, neighbor_y, remaining_pickaxes, visited_cells, new_path, broken_walls)
            visited_cells.remove((neighbor_x, neighbor_y))
```

## 4. Execution & Validation Process
1. Parse the input data and build the internal grid state.
2. Initialize `visited` with the start cell. 
3. Initialize `current_path` with `[f"S,{cell_index(startX, startY)}"]` and `broken_walls` with `[]`.
4. Run `explore(startX, startY, pickaxe_count, visited, current_path, broken_walls)`.
5. Check `len(solutions_by_walls)`:
    - **If `1`**: Maze is **VALID**. Print the one representative path. Only then is it safe to proceed to convert this data into PDF or `design.md` templates.
    - **If `0`**: Maze is **INVALID** (unsolvable). The validator should specify why (e.g., "Goal unreachable" or "Requires more pickaxes").
    - **If `> 1`**: Maze is **INVALID** (multiple distinct wall-sets solve it). The validator should print one representative path per distinct wall-set so the designer can see the real conflict.

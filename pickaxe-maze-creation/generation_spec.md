# Pickaxe Maze Generation & Validation Specification

This document details the architectural spec for creating the automated script that will generate and validate Pickaxe Mazes.

## 1. Start and Goal Placement Rules
To ensure the maze feels balanced and uses the grid effectively:
- **Start (S)** must be placed in the **first column** (Column 1).
- **Goal (G)** must be placed in the **last column** (Column `width`).
- The row placement for both S and G is randomized; they do not need to be on the same row or exact opposite corners, as long as they are on opposite sides of the grid horizontally.

## 2. Generation Algorithm (Constructive Approach)
Instead of purely random generation, the script will use a "constructive" approach. It first defines the correct answer, then builds the puzzle around it to ensure solvability before verifying uniqueness.

### Generation Steps:
1. **Initialize**: Create an empty grid based on the star difficulty level dimensions (e.g., 3x3 for 1-star).
2. **Placement**: Randomly place Start (S) in Column 1 and Goal (G) in the final column.
3. **Draw the Ideal Path**: Generate a random, non-crossing path that connects Start to Goal. This is our "chosen answer line" (the ideal solution).
4. **Place Required Walls**: Along the ideal path, place exactly the number of breakable walls equal to the difficulty's `pickaxe_count` limit. (This guarantees the path is solvable and uses the exact required number of pickaxes).
5. **Place Distraction Walls**: Randomly place additional walls on the rest of the grid until the minimum wall count for the star difficulty is met (or exceeded).
6. **Run Validator**: Pass the generated maze data to the Validator script.
7. **Evaluate Validation**:
   - If `solution_count == 1`: **Keep it!** The maze is perfect.
   - If `solution_count > 1` (too easy/multiple paths) or `solution_count == 0` (impossible): Discard the current wall layout, revert to the ideal path, and **repeat from Step 4** (or Step 5) to tweak the wall placements. Loop until a unique solution is found.

## 3. Validator Integration
As designed in `validator_design.md`:
- The Validator runs a Backtracking Depth-First Search (DFS).
- It tracks the `Current Cell`, `Remaining Pickaxes`, and a `Visited Cells` set to prevent crossing.
- It returns the `solution_count`. For the generator loop (Step 7) to succeed, the validator MUST return exactly `1`.

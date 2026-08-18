# Pickaxe Maze

Welcome to the **Pickaxe Maze** creation folder! This folder contains the rules and design specifications for generating and validating the Pickaxe Maze.

## Overview

The Pickaxe Maze is a 2D grid-based logic puzzle. The player starts at a designated starting cell (S) and must navigate to a goal cell (G) by moving in the four cardinal directions (Up, Down, Left, Right). 

What makes this maze unique is the inclusion of **Pickaxes** and breakable inner walls. The player is given a specific number of pickaxes at the start. They must use exactly all of their pickaxes to break through walls to reach the goal. 

## Key Characteristics
- **Resource Management**: The player must carefully choose which walls to break, as pickaxes are limited.
- **No Backtracking**: The player's path cannot cross itself; they can never visit the same cell twice.
- **Strict Uniqueness**: A valid maze design is guaranteed to have exactly **one** correct solution. All other potential paths are either blocked, cross over themselves, or do not use the exact number of required pickaxes.

## Creation Workflow
To fully create a Pickaxe Maze, the project follows a strict three-step pipeline:
1. **Data Generation**: Generate the maze layout in a concise, comma-separated string format representing cells and walls.
2. **Validation**: Run the generated data through the algorithmic validator. The validator checks the rules, confirms uniqueness, and outputs the exact step-by-step solution (e.g., `S,1 -> 2 -> ...`).
3. **Template/Visual Generation**: **Only if** the data passes validation (exactly 1 solution), the layout is converted into the final visual output (PDF, Image) or mapped to a `design.md` visual template. This ensures that broken mazes are never sent to the visual rendering step.

## Directory Contents
- [`docs/rules.md`](./docs/rules.md): Detailed explanation of the puzzle mechanics, constraints, and data representation.
- [`docs/validator_design.md`](./docs/validator_design.md): Algorithmic design and pseudocode for writing a script to validate the maze data.
- [`docs/difficulty_setting.md`](./docs/difficulty_setting.md): Defines the difficulty progression (Stars) and question distribution for Kinder, Primary, and Advanced levels.
- [`docs/generation_spec.md`](./docs/generation_spec.md): The architectural specification for the script that generates the maze using a constructive path-first approach.

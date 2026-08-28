# AI Maze & Quiz Generator

A system designed to generate procedurally generated mazes, quizzes, and questions using AI, strictly adhering to predefined rulesets.

## Project Overview

The core goal of this project is to leverage AI to generate educational and entertaining puzzles. The system will not only generate these puzzles but also **evaluate and validate** them to ensure they meet all specified rules and constraints before being outputted.

## Key Features

1. **Rule-Based Generation**: AI generates mazes/quizzes based on explicit rules and parameters.
2. **Evaluation System**: Built-in validation methods to rate, evaluate, and determine if generated solutions strictly follow the given rules.
3. **Difficulty Scaling**: Puzzles are categorized by Level and Star Rating.
4. **Export Formats**: Final outputs can be rendered as `PNG` images or `PDF` files.

## Progression System

The puzzles are categorized into three main levels, each with specific parameters but sharing a core concept.

### Levels

- **Kinder Level**: Introductory puzzles with foundational rules.
- **Primary Level**: Intermediate puzzles with expanded rulesets.
- **Advanced Level**: Complex puzzles pushing the boundaries of the rules.

### Difficulty (1 to 8 Stars)

Within each level, difficulty is scaled from 1 ⭐ to 8 ⭐⭐⭐⭐⭐⭐⭐⭐.
The difficulty rating is determined by:

- The minimum number of moves required to solve the puzzle.
- The estimated time a user would spend to solve it.

## How work is sequenced

**[`PRODUCTION_PROCESS.md`](PRODUCTION_PROCESS.md) is the canonical process** for this
system: the ten per-maze-type stages (concept → rules → data shape → generator/validator
→ app → renderers → front cover → last page) and then the per-worksheet loop, which is
question authoring plus an assembly step with no design decisions left in it. Every other
spec in the repo covers one stage of it; start there to find out which.

## Design and Templates

The visual representation of the puzzles is a crucial component.

- As the project progresses, we will analyze sample PDFs.
- For each puzzle type, a specific `design.md` document will be created to clearly define its visual template and styling guidelines.

## Getting Started

Requires Python 3.9+. Set up a virtual environment and install the project in editable mode:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

This installs the `pickaxe_maze` package (the generator/validator in
[`Maze-All-Contents/pickaxe-maze-creation/pickaxe_maze/`](Maze-All-Contents/pickaxe-maze-creation/pickaxe_maze/)) and the
`maze_api` FastAPI app (in [`Web App/backend/maze_api/`](Web%20App/backend/maze_api/)) so
both are importable from anywhere in the project, plus `pytest`/`httpx` for running their
tests:

```bash
pytest
```

### Running the backend

```bash
python scripts/run_backend.py
```

Use this rather than calling `uvicorn` directly. It starts the same app, and adds the two
things a bare `uvicorn --reload` gets wrong:

- **It dies with its terminal.** `uvicorn --reload` does not stop when its terminal
  closes — it gets reparented to PID 1 and keeps holding port 8000, so the next start
  fails with `[Errno 48] Address already in use` while an invisible server from days ago
  goes on serving stale code. The script tears the server down on Ctrl-C, on `kill`, and
  on the terminal going away (including a hard kill that sends no `SIGHUP`).
- **It only watches the app's own code.** Bare `--reload` watches the whole repo root,
  `node_modules` and `output/` included, which costs a busy core indefinitely. The script
  passes `--reload-dir` for the backend and the generator package.

If a stale backend is still on the port, the script reclaims it and says so. A port held
by anything that is _not_ one of our servers is left alone and reported instead.

```bash
python scripts/run_backend.py --port 8001   # somewhere else
python scripts/run_backend.py --no-reload   # no watcher, no reload child
python scripts/run_backend.py --stop        # just free the port and exit
```

Serves the two endpoints from [`Web App/docs/development_plan.md`](Web%20App/docs/development_plan.md)
§8:

- `POST /api/maze/generate` — `{ type, star, sgSeed?, pathSeed?, wallSeed? }` → a generated
  maze + `solutionTrace` + the seeds actually used.
- `POST /api/maze/validate` — `{ type, maze }` → `{ solutionCount, trace?, diagnostic? }`.

Interactive docs are served at `http://127.0.0.1:8000/docs`. Only `type: "pickaxe"` is
registered so far, per the maze-type registry in §5.

### Command-line usage

The editable install also registers a `pickaxe-maze` command with three subcommands, all
reading/writing under [`Maze-All-Contents/pickaxe-maze-creation/`](Maze-All-Contents/pickaxe-maze-creation/)'s `input/` and
`output/` folders by default:

```bash
# Generate one maze and write it as JSON to output/
pickaxe-maze generate --star 3

# Generate a full level's worth of questions (kinder/primary/advanced) as a
# single LevelProgress JSON (Web App/docs/development_plan.md §4.3) in output/
pickaxe-maze generate-level --level kinder

# Validate a MazeData or LevelProgress JSON — typically one dropped into
# input/ — and write a Markdown report next to it, as <name>_report.md
pickaxe-maze validate "Maze-All-Contents/pickaxe-maze-creation/input/star3.json"
```

Run `pickaxe-maze <subcommand> --help` for the full set of options (custom seeds,
`--out`/`--out-dir` overrides, etc).

## Frontend

React + TypeScript (Vite) + Tailwind CSS + Zustand, in
[`Web App/frontend/`](Web%20App/frontend/). Implements roadmap steps 1-5 and 8-9 from
`development_plan.md` §9: routing, the maze-type registry (§5), the landing page (§6.1),
the Level Dashboard with its page rows and drag-and-drop (§6.5,
`level_dashboard_pagination_spec.md`), the manual creation wizard, the randomize/reroll
flow, file-based save/load, and PDF export. Still future: `localStorage` autosave (step 6)
and backend-persisted accounts (step 7) — until then a browser refresh loses an
in-progress sheet, and **Save Progress** is the only safety net.

Requires Node 20.19+ (or 22.12+). This is a separate `npm` project from the Python side
above — no virtualenv involved.

```bash
cd "Web App/frontend"
npm install
npm run dev
```

Open the URL Vite prints (`http://localhost:5173` by default). The dev server proxies
`/api/pdf/*` to the PDF service on `:8010` and everything else under `/api/*` to the
backend on `:8000` (see `vite.config.ts`), so both need to be running alongside it.

Other scripts: `npm run build` (typecheck + production build), `npm run lint`.

> **`npx tsc --noEmit` here typechecks zero files** and proves nothing — see the warning
> in `tsconfig.json`. Use `npm run build`, which runs `tsc -b`.

## PDF service

The Level Dashboard's **Preview**, **Download** and **Answer Key** buttons are served by a
third process: [`Web App/pdf-service/`](Web%20App/pdf-service/), an Express app that drives
headless Playwright against the frontend's own `/spike/pdf-preview` route and returns real
PDF bytes. Without it running, all three buttons fail with a `503`.

```bash
cd "Web App/pdf-service"
npm install                 # first time only
npx playwright install chromium   # first time only
npm start
```

It listens on `:8010` and expects the frontend dev server at `http://localhost:5173`. If
Vite picked a different port — it does when 5173 is already held, printing the one it
chose — point the service at it, or the render will time out against whatever *is* on
5173:

```bash
FRONTEND_URL=http://localhost:5174 npm start
PORT=8011 npm start                          # somewhere else
```

Unlike the backend script above, this one does **not** die with its terminal.

### Running all three

Three terminals, in any order — the PDF service only reaches for the frontend when a
render is requested:

```bash
python scripts/run_backend.py                # :8000  generate / validate
cd "Web App/frontend"    && npm run dev      # :5173  the app
cd "Web App/pdf-service" && npm start        # :8010  Preview / Download / Answer Key
```

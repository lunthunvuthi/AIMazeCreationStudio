# Backend Reference — `Web App/backend/`

Implementation-level map of the FastAPI backend, for AI/human sessions that need to
change or debug this code without re-reading every file first. For the *product* spec
(what the API is supposed to do and why), see `development_plan.md` §8. This doc
describes what the code *actually does*, as of the last update below.

**Last verified against source:** 2026-08-19.

---

## 1. What this service is

A thin, **stateless** FastAPI wrapper around the `pickaxe_maze` Python package
(`Maze-All-Contents/pickaxe-maze-creation/pickaxe_maze/`). It exposes two HTTP
endpoints that the frontend calls; it holds no database, no session state, and no
in-memory cache — every request is fully self-contained and every response is derived
purely from the request payload plus the `pickaxe_maze` algorithms.

Run it with:
```bash
python scripts/run_backend.py
```
Not `uvicorn` directly: the reloader outlives its terminal and keeps holding port 8000.
See "Running the backend" in the root [`README.md`](../../../README.md).

It depends on `pickaxe_maze` being installed editable (`pip install -e ".[dev]"` from
repo root) — see the Gotcha in §6.

---

## 2. File map

```
Web App/backend/
├── maze_api/
│   ├── __init__.py      # empty
│   ├── main.py          # FastAPI app instance, CORS, mounts the router
│   ├── routes.py        # the two endpoints — all request-handling logic lives here
│   └── schemas.py       # Pydantic request/response models (wire format + aliasing)
└── tests/
    └── test_api.py      # TestClient-based endpoint tests (7 tests)
```

There is no `models.py`, `services.py`, or `db.py` — this is intentionally the whole
backend. All maze-generation/validation logic itself lives in the separate
`pickaxe_maze` package, not here (see §5).

---

## 3. `main.py`

```python
app = FastAPI(title="Maze Studio API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
```

- CORS is wide open (`allow_origins=["*"]`) **on purpose** — the frontend is a
  separate-origin Vite dev server, there's no auth yet, and deployment topology is
  undecided (`development_plan.md` §1). Revisit before any real deployment.
- No lifespan hooks, no dependency injection, no middleware beyond CORS.

---

## 4. `routes.py` — the two endpoints

Router prefix: `/api/maze`. Both endpoints validate `type` against a hardcoded
single-entry set:
```python
SUPPORTED_TYPES = {"pickaxe"}
```
(mirrors the frontend's maze-type registry, `frontend/src/registry/mazeTypes.ts` — see
`../frontend/frontend_reference.md` §5). Adding a second maze type means adding to this set *and*
dispatching to a different generator/validator module — today there is no dispatch
logic at all, everything is hardcoded to `pickaxe_maze`.

### `POST /api/maze/generate`
- Input: `GenerateRequest` — `{ type, star, sgSeed?, pathSeed?, wallSeed? }` (camelCase
  on the wire, see §5's aliasing).
- Validates `type` is supported and `star` exists in `pickaxe_maze.difficulty.STAR_PARAMS`
  (400 if not).
- Calls `pickaxe_maze.generator.generate_maze(star=..., sg_seed=..., path_seed=...,
  wall_seed=...)`. Any omitted seed is picked randomly *inside* `generate_maze` — the
  route layer never generates its own randomness.
- On `GenerationError` (raised by `pickaxe_maze` if its internal retry budget is
  exhausted): returns HTTP 500 with the exception message as `detail`.
- Success: `GenerateResponse` — the maze fields flattened from `result.maze.to_dict()`,
  plus `solutionTrace` and the three seeds actually used (so the frontend can pin them
  for a reroll — see `../frontend/frontend_reference.md` §7's reroll logic).

### `POST /api/maze/validate`
- Input: `ValidateRequest` — `{ type, maze: MazeDataIn }`.
- Validates `type` only (no star check — validation works on any `MazeData`
  regardless of which star produced it).
- Reconstructs a `pickaxe_maze.models.MazeData` from the request body and calls
  `pickaxe_maze.validator.validate_maze(maze_data)`.
- Success: `ValidateResponse` — `{ solutionCount, trace?, diagnostic? }`. `trace` is
  populated only when `solutionCount == 1`; `diagnostic` is populated when it's `0` or
  `>1` (see `validator_design.md` §4 for what the diagnostic messages mean).
- **No exception handling around `validate_maze` itself** — a malformed `MazeData` (bad
  cell tokens, non-rectangular rows, etc.) will raise inside `pickaxe_maze` and surface
  as an unhandled 500, not a clean 400. The frontend is expected to only ever submit
  data produced by its own wizard/registry helpers (`wizardMaze.ts`), which can't
  produce malformed tokens — so this hasn't been an issue in practice, but it's not
  validated defensively at the API boundary.

Both endpoints are synchronous `def`, not `async def` — `pickaxe_maze`'s generator/
validator are pure CPU-bound Python, there's no I/O to await.

---

## 5. `schemas.py` — wire format and the snake_case/camelCase boundary

`pickaxe_maze` and its `MazeData.to_dict()` use **snake_case** (`pickaxe_count`,
`sg_seed`, ...). The frontend's `MazeQuestion.seeds` type (`development_plan.md` §4.2)
uses **camelCase** (`sgSeed`, `pathSeed`, `wallSeed`). `schemas.py` is where that
mismatch is bridged, entirely via Pydantic `Field(alias=...)`:

```python
class GenerateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    sg_seed: Optional[int] = Field(default=None, alias="sgSeed")
    ...
```

`populate_by_name=True` lets the route code construct/read these models using the
snake_case Python attribute names, while `response_model_by_alias=True` (set per-route
in `routes.py`, not globally) makes FastAPI serialize the *response* using the
camelCase aliases. Only the **seed** fields and `solutionTrace`/`solutionCount` get this
aliasing — `pickaxe_count`, `width`, `height`, `maze` stay snake_case on the wire in
both directions (matches `MazeData` verbatim, no translation needed there).

If you add a new field to either request or response and it needs a different wire name
than its Python name, follow this same `Field(alias=...)` pattern — there's no other
place translation happens.

`MazeDataIn` (used only in `ValidateRequest`) is a separate, structurally-identical
class to `pickaxe_maze.models.MazeData` — kept separate because Pydantic models and
plain dataclasses don't unify automatically; `routes.py`'s `validate()` manually
reconstructs a real `MazeData` from it before calling `validate_maze`.

---

## 6. Dependency on `pickaxe_maze`

This backend imports directly from the sibling package (not over HTTP, not
vendored/copied):
```python
from pickaxe_maze.difficulty import STAR_PARAMS
from pickaxe_maze.generator import GenerationError, generate_maze
from pickaxe_maze.models import MazeData
from pickaxe_maze.validator import validate_maze
```
Source: `Maze-All-Contents/pickaxe-maze-creation/pickaxe_maze/`. Full spec of that
package's algorithms lives in its own `docs/` (`generation_spec.md`,
`validator_design.md`, `difficulty_setting.md`, `rules.md`) — this backend doesn't
reimplement or duplicate any of that, it's a pure pass-through.

Key entry points this backend relies on (signatures, not full behavior — see that
package's own docs for the algorithm):
- `difficulty.STAR_PARAMS: dict[int, StarParams]` — which stars exist and their fixed
  grid size / pickaxe range / min-wall count.
- `generator.generate_maze(star, sg_seed=None, path_seed=None, wall_seed=None) ->
  GenerationResult` — raises `GenerationError` on exhausted retries.
- `models.MazeData` — dataclass with `.from_dict()`/`.to_dict()`, the canonical maze
  representation (`rules.md`'s per-cell string format).
- `validator.validate_maze(maze: MazeData) -> ValidationResult` — DFS-based solution
  counter, returns `.solution_count`, `.trace`, `.diagnostic`.

**Gotcha (bit us once, see `handoffs/handoff-2026-08-19-0047.md`):** the editable pip
install (`pip install -e ".[dev]"` from repo root) hardcodes an **absolute filesystem
path** to `pickaxe_maze/` inside
`.venv/lib/python3.14/site-packages/__editable___maze_studio_0_1_0_finder.py`. If that
package is ever moved again, `import pickaxe_maze` will fail with a stale-path error
until you rerun `pip install -e ".[dev]"`. This also means the backend's uvicorn process
must be restarted after any such reinstall — it caches the import at process start.

---

## 7. Tests (`backend/tests/test_api.py`)

Uses `fastapi.testclient.TestClient` directly against the `app` instance — no live
server needed, no network calls. 7 tests total, covering:
- `generate` returns camelCase seeds and a well-formed maze.
- `generate` with all seeds omitted still returns valid (randomly-picked) integer seeds.
- `generate` rejects an unsupported `type` (400) and an unsupported `star` (400).
- `validate` round-trips a freshly-generated maze back through `/validate` and confirms
  `solutionCount == 1`, a `trace` is present, `diagnostic` is `None` — this is the one
  test that exercises the full generate→validate pipeline end-to-end.
- `validate` rejects an unsupported `type` (400).

Run via `pytest` from repo root (picks up `backend/tests` per root `pyproject.toml`'s
`testpaths`, alongside the `pickaxe_maze` package's own test suite — 32 tests pass
combined as of the last full run).

---

## 8. What's *not* here yet

Per `development_plan.md` §8/§9 roadmap — these are absent from the current code, not
oversights to "fix":
- No `/api/export/pdf` — PDF export is deferred (`pdf_export_spec.md`), renderer tech
  undecided.
- No `/api/projects/*` — Phase 3 backend persistence hasn't started; there is no
  database, no ORM, no auth anywhere in this backend.
- No request logging, rate limiting, or auth middleware.

When any of those get built, update this doc's §2 (file map) and §4 (endpoint list)
alongside the code change — this doc is meant to stay a faithful mirror of what's
actually implemented, not a wishlist.

"""The two endpoints from development_plan.md §8, backed entirely by pickaxe_maze."""

from fastapi import APIRouter, HTTPException

from pickaxe_maze.difficulty import STAR_PARAMS
from pickaxe_maze.generator import GenerationError, generate_maze
from pickaxe_maze.models import MazeData
from pickaxe_maze.validator import validate_maze

from .schemas import (
    GenerateRequest,
    GenerateResponse,
    SeedsOut,
    ValidateRequest,
    ValidateResponse,
)

router = APIRouter(prefix="/api/maze")

# The registry from development_plan.md §5 has only one maze type today.
SUPPORTED_TYPES = {"pickaxe"}


def _check_type(type_: str) -> None:
    if type_ not in SUPPORTED_TYPES:
        raise HTTPException(status_code=400, detail=f"unsupported maze type: {type_}")


@router.post("/generate", response_model=GenerateResponse, response_model_by_alias=True)
def generate(req: GenerateRequest) -> GenerateResponse:
    _check_type(req.type)
    if req.star not in STAR_PARAMS:
        raise HTTPException(status_code=400, detail=f"unsupported star: {req.star}")

    try:
        result = generate_maze(
            star=req.star, sg_seed=req.sg_seed, path_seed=req.path_seed, wall_seed=req.wall_seed
        )
    except GenerationError as e:
        raise HTTPException(status_code=500, detail=str(e))

    return GenerateResponse(
        **result.maze.to_dict(),
        solution_trace=result.solution_trace,
        seeds=SeedsOut(sg_seed=result.sg_seed, path_seed=result.path_seed, wall_seed=result.wall_seed),
    )


@router.post("/validate", response_model=ValidateResponse, response_model_by_alias=True)
def validate(req: ValidateRequest) -> ValidateResponse:
    _check_type(req.type)

    maze_data = MazeData(
        pickaxe_count=req.maze.pickaxe_count,
        width=req.maze.width,
        height=req.maze.height,
        maze=req.maze.maze,
    )
    result = validate_maze(maze_data)
    return ValidateResponse(
        solution_count=result.solution_count, trace=result.trace, diagnostic=result.diagnostic
    )

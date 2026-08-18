"""Request/response shapes for the endpoints in Web App/development_plan.md §8.

Field names match `pickaxe_maze` (snake_case) internally; camelCase aliases are
used on the wire for the seed fields to match the frontend's MazeQuestion type
(development_plan.md §4.2).
"""

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class GenerateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: str
    star: int
    sg_seed: Optional[int] = Field(default=None, alias="sgSeed")
    path_seed: Optional[int] = Field(default=None, alias="pathSeed")
    wall_seed: Optional[int] = Field(default=None, alias="wallSeed")


class SeedsOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    sg_seed: int = Field(alias="sgSeed")
    path_seed: int = Field(alias="pathSeed")
    wall_seed: int = Field(alias="wallSeed")


class GenerateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    pickaxe_count: int
    width: int
    height: int
    maze: List[str]
    solution_trace: str = Field(alias="solutionTrace")
    seeds: SeedsOut


class MazeDataIn(BaseModel):
    pickaxe_count: int
    width: int
    height: int
    maze: List[str]


class ValidateRequest(BaseModel):
    type: str
    maze: MazeDataIn


class ValidateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    solution_count: int = Field(alias="solutionCount")
    trace: Optional[str] = None
    diagnostic: Optional[str] = None

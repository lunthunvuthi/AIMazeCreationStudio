"""Importable Python modules implementing the PickAxe Maze generator and validator.

See ../generation_spec.md and ../validator_design.md for the specs these port.
"""

from .models import MazeData
from .validator import ValidationResult, validate_maze
from .generator import GenerationError, GenerationResult, generate_maze
from .difficulty import STAR_PARAMS, LEVEL_DISTRIBUTIONS, StarParams

__all__ = [
    "MazeData",
    "ValidationResult",
    "validate_maze",
    "GenerationError",
    "GenerationResult",
    "generate_maze",
    "STAR_PARAMS",
    "LEVEL_DISTRIBUTIONS",
    "StarParams",
]

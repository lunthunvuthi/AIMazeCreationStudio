"""Star parameters and level distributions, ported verbatim from
../difficulty_setting.md.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class StarParams:
    star: int
    width: int
    height: int
    pickaxe_min: int
    pickaxe_max: int
    min_walls: int
    max_walls: Optional[int] = None  # None = no upper cap


STAR_PARAMS: Dict[int, StarParams] = {
    # Verified 2026-08-17: with S in column 1 / G in the last column, a 3x3/1-pickaxe
    # maze has zero unique-solution layouts at 1-3 total walls; 4 is the minimum that
    # works for SOME S/G row placements, but not all (some need up to 6) — so, like
    # every other star, this is a floor for the generator to escalate past, not an
    # exact target (see difficulty_setting.md's note on star 1).
    1: StarParams(star=1, width=3, height=3, pickaxe_min=1, pickaxe_max=1, min_walls=4),
    2: StarParams(star=2, width=3, height=3, pickaxe_min=1, pickaxe_max=1, min_walls=3),
    3: StarParams(star=3, width=4, height=4, pickaxe_min=1, pickaxe_max=1, min_walls=6),
    4: StarParams(star=4, width=4, height=4, pickaxe_min=2, pickaxe_max=2, min_walls=8),
    5: StarParams(star=5, width=5, height=5, pickaxe_min=2, pickaxe_max=2, min_walls=10),
    6: StarParams(star=6, width=6, height=6, pickaxe_min=2, pickaxe_max=3, min_walls=15),
    7: StarParams(star=7, width=7, height=7, pickaxe_min=2, pickaxe_max=3, min_walls=18),
    8: StarParams(star=8, width=8, height=8, pickaxe_min=3, pickaxe_max=4, min_walls=20),
}

# Per difficulty_setting.md §1-3: the ordered star rating for every question
# slot in a level, always starting with the 1-star tutorial.
LEVEL_DISTRIBUTIONS: Dict[str, List[int]] = {
    "kinder": [1, 2, 2, 3, 3, 4, 4, 5],
    "primary": [1, 3, 3, 4, 4, 5, 5, 6, 6],
    "advanced": [1, 4, 4, 5, 5, 6, 6, 7, 7, 8],
}

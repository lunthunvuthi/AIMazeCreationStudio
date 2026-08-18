"""MazeData: the shared shape from Web App/development_plan.md §4.1, matching
rules.md §7's row-string format verbatim, plus the width/height fields the web
app's TS type carries alongside it.
"""

from dataclasses import dataclass
from typing import List


@dataclass
class MazeData:
    pickaxe_count: int
    width: int
    height: int
    maze: List[str]

    @classmethod
    def from_dict(cls, data):
        maze = list(data["maze"])
        height = len(maze)
        width = len(maze[0].split(",")) if maze else 0
        return cls(
            pickaxe_count=data["pickaxe_count"],
            width=data.get("width", width),
            height=data.get("height", height),
            maze=maze,
        )

    def to_dict(self):
        return {
            "pickaxe_count": self.pickaxe_count,
            "width": self.width,
            "height": self.height,
            "maze": self.maze,
        }

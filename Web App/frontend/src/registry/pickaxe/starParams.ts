import type { StarParams } from '../../types/maze'

// Ported verbatim from pickaxe-maze-creation/pickaxe_maze/difficulty.py's
// STAR_PARAMS (mirrors difficulty_setting.md's "Defining Stars" section) —
// the fixed grid size, pickaxe range, and minimum wall count per star.
export const PICKAXE_STAR_PARAMS: Record<number, StarParams> = {
  1: { star: 1, width: 3, height: 3, pickaxeMin: 1, pickaxeMax: 1, minWalls: 4 },
  2: { star: 2, width: 3, height: 3, pickaxeMin: 1, pickaxeMax: 1, minWalls: 3 },
  3: { star: 3, width: 4, height: 4, pickaxeMin: 1, pickaxeMax: 1, minWalls: 6 },
  4: { star: 4, width: 4, height: 4, pickaxeMin: 2, pickaxeMax: 2, minWalls: 8 },
  5: { star: 5, width: 5, height: 5, pickaxeMin: 2, pickaxeMax: 2, minWalls: 10 },
  6: { star: 6, width: 6, height: 6, pickaxeMin: 2, pickaxeMax: 3, minWalls: 15 },
  7: { star: 7, width: 7, height: 7, pickaxeMin: 2, pickaxeMax: 3, minWalls: 18 },
  8: { star: 8, width: 8, height: 8, pickaxeMin: 3, pickaxeMax: 4, minWalls: 20 },
}

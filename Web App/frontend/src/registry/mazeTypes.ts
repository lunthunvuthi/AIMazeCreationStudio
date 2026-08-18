import type { MazeTypeDefinition } from '../types/maze'
import { PICKAXE_STAR_PARAMS } from './pickaxe/starParams'
import SizeAndPickaxesStep from './pickaxe/steps/SizeAndPickaxesStep'
import PlaceStartGoalStep from './pickaxe/steps/PlaceStartGoalStep'
import DrawPathStep from './pickaxe/steps/DrawPathStep'
import AddWallsStep from './pickaxe/steps/AddWallsStep'
import CellRenderer from './pickaxe/CellRenderer'

// Ported verbatim from pickaxe-maze-creation/difficulty_setting.md (mirrors
// pickaxe_maze/difficulty.py's LEVEL_DISTRIBUTIONS) — the ordered star rating
// for every question slot in a level, always starting with the 1-star tutorial.
const PICKAXE_DIFFICULTY_CONFIG = {
  kinder: [1, 2, 2, 3, 3, 4, 4, 5],
  primary: [1, 3, 3, 4, 4, 5, 5, 6, 6],
  advanced: [1, 4, 4, 5, 5, 6, 6, 7, 7, 8],
}

const pickaxeMazeDefinition: MazeTypeDefinition = {
  id: 'pickaxe',
  label: 'PickAxe Maze',
  difficultyConfig: PICKAXE_DIFFICULTY_CONFIG,
  starParams: PICKAXE_STAR_PARAMS,
  WizardSteps: [SizeAndPickaxesStep, PlaceStartGoalStep, DrawPathStep, AddWallsStep],
  CellRenderer,
}

export const MAZE_TYPES: MazeTypeDefinition[] = [pickaxeMazeDefinition]

export function getMazeType(id: string): MazeTypeDefinition | undefined {
  return MAZE_TYPES.find((t) => t.id === id)
}

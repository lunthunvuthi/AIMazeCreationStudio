// Phase 1 (file-based) persistence — development_plan.md §2 / §6.3 / §6.5.
// Not the full ProgressStorageAdapter interface the doc sketches (save/load(id?)/list?()):
// with only this one implementation so far, and Phase 1's "load" being a user-provided
// File rather than an id lookup, the generic interface has nothing to prove itself
// against yet. Reshape into that interface once Phase 2 (localStorage) needs it.

import type { LevelName, LevelProgress } from '../types/maze'
import { getMazeType } from '../registry/mazeTypes'

const LEVEL_NAMES: LevelName[] = ['kinder', 'primary', 'advanced']

export function downloadLevelProgress(progress: LevelProgress): void {
  const stamp = progress.updatedAt.replace(/[:.]/g, '-')
  const filename = `${progress.mazeType}-${progress.level}-${stamp}.json`

  const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function parseLevelProgressFile(file: File): Promise<LevelProgress> {
  let raw: unknown
  try {
    raw = JSON.parse(await file.text())
  } catch {
    throw new Error('That file is not valid JSON.')
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error('That file is not a valid level progress file.')
  }
  const data = raw as Record<string, unknown>

  if (data.formatVersion !== 1) {
    throw new Error('Unsupported save file version.')
  }
  if (typeof data.mazeType !== 'string' || !getMazeType(data.mazeType)) {
    throw new Error('Unknown maze type in this save file.')
  }
  if (typeof data.level !== 'string' || !LEVEL_NAMES.includes(data.level as LevelName)) {
    throw new Error('Unknown level in this save file.')
  }
  if (!Array.isArray(data.questions)) {
    throw new Error('That file is not a valid level progress file.')
  }

  return data as unknown as LevelProgress
}

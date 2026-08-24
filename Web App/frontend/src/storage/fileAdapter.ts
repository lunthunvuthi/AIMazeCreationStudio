// Phase 1 (file-based) persistence — development_plan.md §2 / §6.3 / §6.5.
// Not the full ProgressStorageAdapter interface the doc sketches (save/load(id?)/list?()):
// with only this one implementation so far, and Phase 1's "load" being a user-provided
// File rather than an id lookup, the generic interface has nothing to prove itself
// against yet. Reshape into that interface once Phase 2 (localStorage) needs it.

import type { LevelName, LevelProgress, MazeQuestion, PageRow } from '../types/maze'
import { getMazeType } from '../registry/mazeTypes'
import { packQuestionsIntoPages } from '../store/levelStore'

const LEVEL_NAMES: LevelName[] = ['kinder', 'primary', 'advanced']

export function buildExportFilename(progress: LevelProgress, ext: string): string {
  const stamp = progress.updatedAt.replace(/[:.]/g, '-')
  const monthStr = String(progress.month).padStart(2, '0')
  return `${progress.mazeType}-${progress.level}-${progress.year}-${monthStr}-week${progress.week}-${stamp}.${ext}`
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function downloadLevelProgress(progress: LevelProgress): void {
  const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' })
  downloadBlob(blob, buildExportFilename(progress, 'json'))
}

// level_dashboard_pagination_spec.md §2.3 — a formatVersion-1 save file's
// pages[] didn't exist yet; reads accept its own shape's questions[] as-is
// (no per-question validation beyond "it's an array" — same laxity the
// original formatVersion-1 parser had, this migration doesn't newly
// introduce it).
//
// No format bump was needed when the locked cover row was removed on
// 2026-08-21: an existing formatVersion-2 file's `pageId: 'cover'` row holds one
// question, which is a valid ordinary row under the new model. It keeps that
// literal id (ids are opaque React/DnD keys, never positional) and behaves like
// any other row.
function migrateFormatVersion1(data: Record<string, unknown>): PageRow[] {
  if (!Array.isArray(data.questions)) {
    throw new Error('That file is not a valid level progress file.')
  }
  return packQuestionsIntoPages(data.questions as MazeQuestion[])
}

function readFormatVersion2Pages(data: Record<string, unknown>): PageRow[] {
  if (!Array.isArray(data.pages)) {
    throw new Error('That file is not a valid level progress file.')
  }
  return data.pages.map((row, i) => {
    const r = row as Record<string, unknown>
    return {
      pageId: typeof r.pageId === 'string' ? r.pageId : `page-${i}`,
      questions: Array.isArray(r.questions) ? (r.questions as MazeQuestion[]) : [],
      isBonus: r.isBonus === true,
    }
  })
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

  if (data.formatVersion !== 1 && data.formatVersion !== 2) {
    throw new Error('Unsupported save file version.')
  }
  if (typeof data.mazeType !== 'string' || !getMazeType(data.mazeType)) {
    throw new Error('Unknown maze type in this save file.')
  }
  if (typeof data.level !== 'string' || !LEVEL_NAMES.includes(data.level as LevelName)) {
    throw new Error('Unknown level in this save file.')
  }

  const pages = data.formatVersion === 1 ? migrateFormatVersion1(data) : readFormatVersion2Pages(data)

  // Sheet metadata was added after this format was first used — default it in
  // for save files exported before that, rather than rejecting them.
  const now = new Date()
  const sheetName = typeof data.sheetName === 'string' ? data.sheetName : ''
  const year = typeof data.year === 'number' ? data.year : now.getFullYear()
  const month = typeof data.month === 'number' && data.month >= 1 && data.month <= 12 ? data.month : now.getMonth() + 1
  const week = typeof data.week === 'number' ? data.week : 1

  return {
    formatVersion: 2,
    mazeType: data.mazeType,
    level: data.level,
    sheetName,
    year,
    month,
    week,
    pages,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : now.toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : now.toISOString(),
  } as unknown as LevelProgress
}

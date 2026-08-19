// Spike-only types for the PDF-renderer comparison (see ../../../spikes/pdf-renderer
// at repo root). Mirrors the *future* `PageRow`/`pages[]` model from
// level_dashboard_pagination_spec.md §2.1, which the real LevelProgress/store don't
// implement yet — this fixture stands in for what a finished dashboard would produce.
import type { MazeQuestion } from '../types/maze'

export interface SpikePageRow {
  pageId: string
  questions: MazeQuestion[]
  // level_dashboard_pagination_spec.md §4.4 — manual "Bonus" toggle, added
  // 2026-08-19. Replaces the earlier plan to compute the laurel-wreath
  // marker from "does this row hold the sheet's highest star" automatically.
  isBonus: boolean
}

export interface SpikeFixture {
  formatVersion: number
  mazeType: string
  level: string
  sheetName: string
  year: number
  month: number
  week: number
  pages: SpikePageRow[]
}

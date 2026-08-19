// Spike-only types for the PDF-renderer comparison (see ../../../spikes/pdf-renderer
// at repo root). Structurally identical to the real `PageRow`/`LevelProgress`
// (types/maze.ts) — kept as a separate type only so this spike doesn't import
// LevelProgress's extra createdAt/updatedAt fields. render_via_browser.mjs's --data
// flag passes a real LevelProgress straight through as this shape; see
// PdfPreviewSpikePage.tsx's readFixture().
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

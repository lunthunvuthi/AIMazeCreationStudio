// Fixed cover-page content, per maze type.
//
// pdf_export_spec.md §3 says the cover's example mazes are "static fixtures per
// maze type, not derived from the current level's actual questions" — this file
// is that fixture set, confirmed by the project owner 2026-08-21: "for the cover
// page, the tutorial question is always fixed."
//
// Why a registry keyed by maze type rather than constants inlined into
// CoverPage.tsx: the cover teaches ONE maze type's rule ("break walls with a
// pickaxe, reach the goal"). A second maze type gets an entirely different
// instruction sentence, a different correct example, and a different
// rule-violation to illustrate — so this is the same extensibility seam as
// pdfMazeTypeRegistry.tsx's PDF_QUESTION_PANELS, applied to the cover.
//
// Consequence for the data model: because these are fixed, the cover no longer
// consumes `LevelProgress.pages[0]`. Every authored row in `pages[]` is a
// question page now (the owner's process: questions are pages 2..N-1, the cover
// and the last page get appended at render time). The Level Dashboard still
// labels row 0 "Cover / Tutorial" — that label is now wrong and is a known
// follow-up, deliberately out of scope for this pass.

import type { MazeData } from '../types/maze'

export interface CoverExample {
  maze: MazeData
  // Traces below are the canonical form emitted by the real validator
  // (`pickaxe-maze validate`), i.e. "(break | wall)" annotates the cell you move
  // INTO, not the one you leave. Only the digits are parsed
  // (wizardMaze.ts's parseTrace), but keeping the canonical spelling means these
  // can be pasted straight back into the validator to re-check them.
  solutionTrace: string
}

export interface CoverContent {
  // Part 3 (body): one sample question, scaled to the page width and drawn at
  // low opacity behind everything. Shown with its ideal line.
  watermark: CoverExample
  // Part 4 (direction box): centered instruction, two lines. `{pickaxe}` is
  // substituted with the real pickaxe vector inline — see CoverPage.tsx.
  instructionLines: [string, string]
  // The correct example: ideal line drawn hand-drawn/wavy, with a sparkle +
  // pickaxe-bubble callout at each wall it breaks (pdf_design_spec.md §5 —
  // decorations exclusive to this panel, they must not leak into real question
  // pages or the answer key).
  correct: CoverExample
  // The counter-example: a route that reaches the goal but breaks more walls
  // than the pickaxe count allows, so it violates rules.md §3/§5.
  wrong: CoverExample & { captionLines: string[] }
}

// Both PickAxe examples below were run through the real validator before being
// committed here:
//   watermark -> VALID, unique solution
//   correct   -> VALID, unique solution
// The `wrong` entry is deliberately NOT a valid solution — that's the point of
// it — so it is not (and cannot be) validator-checked.
export const COVER_CONTENT: Record<string, CoverContent> = {
  pickaxe: {
    // Replaced 2026-08-21 (owner). The first version was `.,.,. / .,.,. / s,|,g`
    // — a single wall in an otherwise empty grid, which blown up to page width
    // read as a few stray lines rather than as a maze. This one walls off both
    // upper rows, so the scaled-up watermark actually shows a maze's structure.
    // Validator-checked: VALID, unique solution, and the trace below is its
    // canonical output verbatim.
    watermark: {
      maze: { pickaxe_count: 1, width: 3, height: 3, maze: ['_|,_|,_', '_|,_|,_', 's,|,g'] },
      solutionTrace: 'S,7 -> 8 -> 9(break | wall)',
    },
    instructionLines: ['Let\u2019s break the walls with a pickaxe {pickaxe}', 'and reach the goal!'],
    correct: {
      maze: { pickaxe_count: 1, width: 3, height: 3, maze: ['|,_|,g', '|,_,_', 's|,|,.'] },
      solutionTrace: 'S,7 -> 4 -> 5(break | wall) -> 6 -> 3',
    },
    wrong: {
      // Same grid as `correct`, different route: it also reaches the goal, but
      // breaks 2 walls (1->2 and 2->3) with only 1 pickaxe available.
      maze: { pickaxe_count: 1, width: 3, height: 3, maze: ['|,_|,g', '|,_,_', 's|,|,.'] },
      // The owner's original spelling of this trace was
      // "S,7 -> 1 (break | wall)-> 2 (break | wall)-> 3", which skips cell 4 —
      // 7 and 1 are not orthogonally adjacent, so wizardMaze.ts's
      // applyPathToGrid throws on it. 4 restored below; the two broken walls and
      // the point being made are unchanged.
      solutionTrace: 'S,7 -> 4 -> 1 -> 2(break | wall) -> 3(break | wall)',
      captionLines: ['You can only break the', 'same number of walls as', 'the pickaxes {pickaxe} you have'],
    },
  },
}

export function coverContentFor(mazeType: string): CoverContent {
  const content = COVER_CONTENT[mazeType]
  if (!content) throw new Error(`no cover content registered for maze type "${mazeType}"`)
  return content
}

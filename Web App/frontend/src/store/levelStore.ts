import { create } from 'zustand'
import type { LevelName, LevelProgress, MazeData, MazeQuestion, PageRow } from '../types/maze'
import { flattenPages } from '../types/maze'
import { getMazeType } from '../registry/mazeTypes'

function buildEmptyQuestion(level: LevelName, star: number, occurrence: number): MazeQuestion {
  return {
    question_id: `${level}-${star}star-${occurrence}`,
    difficulty_star: star,
    status: 'empty',
    origin: null,
    maze: null,
    solutionTrace: null,
    seeds: { sgSeed: null, pathSeed: null, wallSeed: null },
  }
}

function buildEmptyQuestions(mazeTypeId: string, level: LevelName): MazeQuestion[] {
  const mazeType = getMazeType(mazeTypeId)
  const stars = mazeType?.difficultyConfig[level] ?? []
  const occurrenceByStar = new Map<number, number>()

  return stars.map((star) => {
    const occurrence = (occurrenceByStar.get(star) ?? 0) + 1
    occurrenceByStar.set(star, occurrence)
    return buildEmptyQuestion(level, star, occurrence)
  })
}

// level_dashboard_pagination_spec.md §2.3 — first question becomes the
// locked cover row alone, the rest pack into rows of 2 in order. Used both
// for a brand-new level (development_plan.md §6.4 always builds the 1★
// tutorial first, so it lands in pages[0] here same as it always has) and by
// fileAdapter.ts's formatVersion-1 migration.
export function packQuestionsIntoPages(questions: MazeQuestion[]): PageRow[] {
  if (questions.length === 0) return []
  const pages: PageRow[] = [{ pageId: 'cover', questions: [questions[0]], isBonus: false }]
  for (let i = 1; i < questions.length; i += 2) {
    pages.push({ pageId: `page-${pages.length}`, questions: questions.slice(i, i + 2), isBonus: false })
  }
  return pages
}

function newPageId(): string {
  return `page-${crypto.randomUUID()}`
}

// Applies `fn` to whichever question in `pages` matches `questionId`,
// leaving every other row/question untouched. Every per-question action
// below is this same "find it, transform it, keep row membership" shape.
function mapQuestion(pages: PageRow[], questionId: string, fn: (q: MazeQuestion) => MazeQuestion): PageRow[] {
  return pages.map((page) => ({
    ...page,
    questions: page.questions.map((q) => (q.question_id === questionId ? fn(q) : q)),
  }))
}

interface LevelStore {
  current: LevelProgress | null
  startNewLevel: (mazeTypeId: string, level: LevelName) => void
  loadLevel: (progress: LevelProgress) => void
  clearLevel: () => void
  updateSheetInfo: (patch: Partial<Pick<LevelProgress, 'sheetName' | 'year' | 'month' | 'week'>>) => void
  addQuestionToRow: (pageId: string, star: number) => void
  addNewPage: (star: number) => void
  toggleRowBonus: (pageId: string) => void
  setQuestionStar: (questionId: string, star: number) => void
  removeQuestion: (questionId: string) => void
  markInProgress: (questionId: string) => void
  completeQuestion: (questionId: string, payload: { maze: MazeData; solutionTrace: string }) => void
  setRandomized: (
    questionId: string,
    payload: { maze: MazeData; solutionTrace: string; seeds: MazeQuestion['seeds'] },
  ) => void
  completeRandomizedQuestion: (questionId: string) => void
}

export const useLevelStore = create<LevelStore>((set) => ({
  current: null,

  startNewLevel: (mazeTypeId, level) => {
    const now = new Date()
    set({
      current: {
        formatVersion: 2,
        mazeType: mazeTypeId,
        level,
        sheetName: '',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        week: 1,
        pages: packQuestionsIntoPages(buildEmptyQuestions(mazeTypeId, level)),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    })
  },

  loadLevel: (progress) => set({ current: progress }),

  clearLevel: () => set({ current: null }),

  updateSheetInfo: (patch) =>
    set((state) => {
      if (!state.current) return state
      return {
        current: {
          ...state.current,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  // difficulty_setting.md's distributions seed a level's starting slots; this
  // and addNewPage let a sheet diverge from that template afterward (extra
  // slots, re-rated slots) — development_plan.md §6.4/§6.5. Adds a second
  // question to an existing row (level_dashboard_pagination_spec.md §3's
  // in-row "+ Add question" slot, only shown while that row holds exactly 1).
  addQuestionToRow: (pageId, star) =>
    set((state) => {
      if (!state.current) return state
      const occurrence = flattenPages(state.current.pages).filter((q) => q.difficulty_star === star).length + 1
      const question = buildEmptyQuestion(state.current.level, star, occurrence)
      return {
        current: {
          ...state.current,
          pages: state.current.pages.map((page) =>
            page.pageId === pageId ? { ...page, questions: [...page.questions, question] } : page,
          ),
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  // level_dashboard_pagination_spec.md §3's "+ Add new page" — appends a
  // fresh row at the end of pages[], defaulting to 3-star per the project
  // owner's description regardless of level (§3's note on why that's fine).
  addNewPage: (star) =>
    set((state) => {
      if (!state.current) return state
      const occurrence = flattenPages(state.current.pages).filter((q) => q.difficulty_star === star).length + 1
      const question = buildEmptyQuestion(state.current.level, star, occurrence)
      return {
        current: {
          ...state.current,
          pages: [...state.current.pages, { pageId: newPageId(), questions: [question], isBonus: false }],
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  // level_dashboard_pagination_spec.md §4.4 — manual "Bonus" toggle. Never
  // called for pages[0] (the dashboard doesn't render the control there),
  // but guarded anyway since it's a cheap invariant to hold.
  toggleRowBonus: (pageId) =>
    set((state) => {
      if (!state.current) return state
      return {
        current: {
          ...state.current,
          pages: state.current.pages.map((page, i) =>
            page.pageId === pageId && i !== 0 ? { ...page, isBonus: !page.isBonus } : page,
          ),
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  // Re-rating a slot invalidates whatever maze it held (grid size/pickaxe
  // range are keyed off the star, per starParams) and reassigns its id —
  // mirrors the wizard's "any edit invalidates" rule. Occurrence numbering
  // scans the whole sheet (flattened across pages), not just the slot's row.
  setQuestionStar: (questionId, star) =>
    set((state) => {
      if (!state.current) return state
      const level = state.current.level
      const allQuestions = flattenPages(state.current.pages)
      return {
        current: {
          ...state.current,
          pages: mapQuestion(state.current.pages, questionId, (q) => {
            if (q.difficulty_star === star) return q
            const occurrence =
              allQuestions.filter((other) => other.question_id !== questionId && other.difficulty_star === star)
                .length + 1
            return buildEmptyQuestion(level, star, occurrence)
          }),
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  // Removes the question wherever it lives, then drops its row if that was
  // the row's only question and it isn't pages[0] (level_dashboard_
  // pagination_spec.md §4.3 — empty rows self-delete, cover row is exempt).
  removeQuestion: (questionId) =>
    set((state) => {
      if (!state.current) return state
      const pages = state.current.pages
        .map((page) => ({ ...page, questions: page.questions.filter((q) => q.question_id !== questionId) }))
        .filter((page, i) => i === 0 || page.questions.length > 0)
      return {
        current: {
          ...state.current,
          pages,
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  markInProgress: (questionId) =>
    set((state) => {
      if (!state.current) return state
      return {
        current: {
          ...state.current,
          pages: mapQuestion(state.current.pages, questionId, (q) =>
            q.status === 'empty' ? { ...q, status: 'in_progress' } : q,
          ),
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  completeQuestion: (questionId, payload) =>
    set((state) => {
      if (!state.current) return state
      return {
        current: {
          ...state.current,
          pages: mapQuestion(state.current.pages, questionId, (q) => ({
            ...q,
            status: 'complete',
            origin: 'manual',
            maze: payload.maze,
            solutionTrace: payload.solutionTrace,
          })),
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  // Used for both the initial Randomize call and every reroll — a reroll on
  // an already-`complete` question deliberately demotes it back to
  // `randomized` (mirrors the manual wizard's "any edit invalidates" rule),
  // requiring Complete to be clicked again.
  setRandomized: (questionId, payload) =>
    set((state) => {
      if (!state.current) return state
      return {
        current: {
          ...state.current,
          pages: mapQuestion(state.current.pages, questionId, (q) => ({
            ...q,
            status: 'randomized',
            origin: 'random',
            maze: payload.maze,
            solutionTrace: payload.solutionTrace,
            seeds: payload.seeds,
          })),
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  completeRandomizedQuestion: (questionId) =>
    set((state) => {
      if (!state.current) return state
      return {
        current: {
          ...state.current,
          pages: mapQuestion(state.current.pages, questionId, (q) =>
            q.origin === 'random' && q.maze ? { ...q, status: 'complete' } : q,
          ),
          updatedAt: new Date().toISOString(),
        },
      }
    }),
}))

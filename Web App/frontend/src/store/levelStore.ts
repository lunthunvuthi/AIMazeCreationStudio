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

// level_dashboard_pagination_spec.md §2.3 — the first question starts alone in
// row 0, the rest pack into rows of 2 in order. Used both for a brand-new level
// and by fileAdapter.ts's formatVersion-1 migration.
//
// 2026-08-21: row 0 used to be a *locked* cover row, because the PDF cover's
// tutorial illustration was drawn from its question. The cover's tutorial is a
// fixed per-maze-type constant now (spike/coverTutorial.ts) and consumes no
// question, so every row here is an ordinary question page and row 0 gets no
// special treatment anywhere in the store or the dashboard.
//
// The solo first row survives only as a *seeding default*: development_plan.md
// §6.4 builds the 1★ tutorial first, and a question alone on a page renders as
// a `large` panel, which is the reviewed-and-approved sheet layout. It is a
// starting point, not an invariant — row 0 can be paired, re-rated, emptied or
// deleted like any other row.
export function packQuestionsIntoPages(questions: MazeQuestion[]): PageRow[] {
  if (questions.length === 0) return []
  const pages: PageRow[] = [{ pageId: 'page-0', questions: [questions[0]], isBonus: false }]
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
  swapQuestions: (questionIdA: string, questionIdB: string) => void
  moveQuestionToRow: (questionId: string, targetPageId: string) => void
  moveQuestionToNewPage: (questionId: string) => void
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

  // level_dashboard_pagination_spec.md §4.4 — manual "Bonus" toggle, valid on
  // every row including row 0. It used to skip pages[0] while that was the
  // locked cover row; the renderer has always honoured pages[0].isBonus, so the
  // guard only ever made the flag unreachable from the UI.
  toggleRowBonus: (pageId) =>
    set((state) => {
      if (!state.current) return state
      return {
        current: {
          ...state.current,
          pages: state.current.pages.map((page) =>
            page.pageId === pageId ? { ...page, isBonus: !page.isBonus } : page,
          ),
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  // level_dashboard_pagination_spec.md §5's three drag gestures. All three are
  // pure *moves* — a question keeps its question_id, its star and its maze, and
  // only its row membership changes. Nothing here re-derives occurrence numbers
  // (unlike setQuestionStar): the sheet's multiset of questions is unchanged, so
  // the existing ids stay correct and stable, which also keeps React keys and
  // DnD identity stable across a drop.
  //
  // `isBonus` deliberately does NOT travel with a question. It is a property of
  // the *page* (§4.4 — it selects the laurel page-number box), so a question
  // dragged into a Bonus row becomes part of that bonus page, and a row emptied
  // by a drag takes its flag with it when it self-deletes.

  // Gesture 1 — a question dropped on another question's card: the two trade
  // places. Works within one row (reordering the pair) or across rows. Neither
  // row's question count changes, so this can never trigger §4.3's self-delete,
  // which is why this is the only gesture with no `.filter()` below.
  swapQuestions: (questionIdA, questionIdB) =>
    set((state) => {
      if (!state.current || questionIdA === questionIdB) return state
      const all = flattenPages(state.current.pages)
      const a = all.find((q) => q.question_id === questionIdA)
      const b = all.find((q) => q.question_id === questionIdB)
      if (!a || !b) return state
      return {
        current: {
          ...state.current,
          pages: state.current.pages.map((page) => ({
            ...page,
            questions: page.questions.map((q) =>
              q.question_id === questionIdA ? b : q.question_id === questionIdB ? a : q,
            ),
          })),
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  // Gesture 2 — a question dropped on a row's empty "+ Add question" slot:
  // it moves in as that row's second question. The capacity re-check mirrors
  // §4.2 rather than trusting the UI to have hidden the slot, since a stale
  // drop target is the one way a 3-question row could otherwise be created.
  moveQuestionToRow: (questionId, targetPageId) =>
    set((state) => {
      if (!state.current) return state
      const source = state.current.pages.find((page) =>
        page.questions.some((q) => q.question_id === questionId),
      )
      const target = state.current.pages.find((page) => page.pageId === targetPageId)
      if (!source || !target || source.pageId === target.pageId) return state
      if (target.questions.length >= 2) return state
      const question = source.questions.find((q) => q.question_id === questionId)
      if (!question) return state
      const pages = state.current.pages
        .map((page) => {
          if (page.pageId === target.pageId) return { ...page, questions: [...page.questions, question] }
          if (page.pageId === source.pageId) {
            return { ...page, questions: page.questions.filter((q) => q.question_id !== questionId) }
          }
          return page
        })
        // §4.3 — the source row self-deletes if that was its only question.
        .filter((page) => page.questions.length > 0)
      return {
        current: { ...state.current, pages, updatedAt: new Date().toISOString() },
      }
    }),

  // Gesture 3 — a question dropped on "+ Add new page": it moves onto a brand-new
  // row appended at the end of pages[], its source row self-deleting per §4.3 if
  // emptied. That combination is also how a whole page reaches the end of the
  // sheet today, since §5.1 leaves whole-row dragging out of scope: drag the lone
  // question off a 1-question row and the row effectively moves with it.
  //
  // Rejecting the already-alone-on-the-last-row case is not just tidiness — that
  // move produces a sheet identical in content, so letting it through would issue
  // a new pageId (remounting the row and dropping any transient card state) and
  // bump updatedAt for a no-op.
  moveQuestionToNewPage: (questionId) =>
    set((state) => {
      if (!state.current) return state
      const existing = state.current.pages
      const sourceIndex = existing.findIndex((page) => page.questions.some((q) => q.question_id === questionId))
      if (sourceIndex === -1) return state
      const source = existing[sourceIndex]
      if (source.questions.length === 1 && sourceIndex === existing.length - 1) return state
      const question = source.questions.find((q) => q.question_id === questionId)
      if (!question) return state
      const pages = existing
        .map((page) =>
          page.pageId === source.pageId
            ? { ...page, questions: page.questions.filter((q) => q.question_id !== questionId) }
            : page,
        )
        .filter((page) => page.questions.length > 0)
      pages.push({ pageId: newPageId(), questions: [question], isBonus: false })
      return {
        current: { ...state.current, pages, updatedAt: new Date().toISOString() },
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

  // Removes the question wherever it lives, then drops its row if that was the
  // row's only question (level_dashboard_pagination_spec.md §4.3 — empty rows
  // self-delete). Row 0 was exempt while it was the locked cover row, which
  // could leave a questionless row in pages[] and so an empty page in the PDF;
  // it is an ordinary row now and self-deletes with the rest.
  removeQuestion: (questionId) =>
    set((state) => {
      if (!state.current) return state
      const pages = state.current.pages
        .map((page) => ({ ...page, questions: page.questions.filter((q) => q.question_id !== questionId) }))
        .filter((page) => page.questions.length > 0)
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

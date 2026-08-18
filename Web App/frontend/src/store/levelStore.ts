import { create } from 'zustand'
import type { LevelName, LevelProgress, MazeData, MazeQuestion } from '../types/maze'
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

interface LevelStore {
  current: LevelProgress | null
  startNewLevel: (mazeTypeId: string, level: LevelName) => void
  loadLevel: (progress: LevelProgress) => void
  clearLevel: () => void
  updateSheetInfo: (patch: Partial<Pick<LevelProgress, 'sheetName' | 'year' | 'month' | 'week'>>) => void
  addQuestion: (star: number) => void
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
        formatVersion: 1,
        mazeType: mazeTypeId,
        level,
        sheetName: '',
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        week: 1,
        questions: buildEmptyQuestions(mazeTypeId, level),
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

  // difficulty_setting.md's distributions seed a level's starting slots; these
  // three actions let a sheet diverge from that template afterward (extra
  // slots, re-rated slots) — development_plan.md §6.4/§6.5.
  addQuestion: (star) =>
    set((state) => {
      if (!state.current) return state
      const occurrence = state.current.questions.filter((q) => q.difficulty_star === star).length + 1
      return {
        current: {
          ...state.current,
          questions: [...state.current.questions, buildEmptyQuestion(state.current.level, star, occurrence)],
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  // Re-rating a slot invalidates whatever maze it held (grid size/pickaxe
  // range are keyed off the star, per starParams) and reassigns its id —
  // mirrors the wizard's "any edit invalidates" rule.
  setQuestionStar: (questionId, star) =>
    set((state) => {
      if (!state.current) return state
      const level = state.current.level
      return {
        current: {
          ...state.current,
          questions: state.current.questions.map((q) => {
            if (q.question_id !== questionId || q.difficulty_star === star) return q
            const occurrence =
              state.current!.questions.filter((other) => other.question_id !== questionId && other.difficulty_star === star)
                .length + 1
            return buildEmptyQuestion(level, star, occurrence)
          }),
          updatedAt: new Date().toISOString(),
        },
      }
    }),

  removeQuestion: (questionId) =>
    set((state) => {
      if (!state.current) return state
      return {
        current: {
          ...state.current,
          questions: state.current.questions.filter((q) => q.question_id !== questionId),
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
          questions: state.current.questions.map((q) =>
            q.question_id === questionId && q.status === 'empty' ? { ...q, status: 'in_progress' } : q,
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
          questions: state.current.questions.map((q) =>
            q.question_id === questionId
              ? {
                  ...q,
                  status: 'complete',
                  origin: 'manual',
                  maze: payload.maze,
                  solutionTrace: payload.solutionTrace,
                }
              : q,
          ),
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
          questions: state.current.questions.map((q) =>
            q.question_id === questionId
              ? {
                  ...q,
                  status: 'randomized',
                  origin: 'random',
                  maze: payload.maze,
                  solutionTrace: payload.solutionTrace,
                  seeds: payload.seeds,
                }
              : q,
          ),
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
          questions: state.current.questions.map((q) =>
            q.question_id === questionId && q.origin === 'random' && q.maze ? { ...q, status: 'complete' } : q,
          ),
          updatedAt: new Date().toISOString(),
        },
      }
    }),
}))

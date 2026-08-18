import { create } from 'zustand'
import type { LevelName, LevelProgress, MazeData, MazeQuestion } from '../types/maze'
import { getMazeType } from '../registry/mazeTypes'

function buildEmptyQuestions(mazeTypeId: string, level: LevelName): MazeQuestion[] {
  const mazeType = getMazeType(mazeTypeId)
  const stars = mazeType?.difficultyConfig[level] ?? []
  const occurrenceByStar = new Map<number, number>()

  return stars.map((star) => {
    const occurrence = (occurrenceByStar.get(star) ?? 0) + 1
    occurrenceByStar.set(star, occurrence)
    return {
      question_id: `${level}-${star}star-${occurrence}`,
      difficulty_star: star,
      status: 'empty',
      origin: null,
      maze: null,
      solutionTrace: null,
      seeds: { sgSeed: null, pathSeed: null, wallSeed: null },
    }
  })
}

interface LevelStore {
  current: LevelProgress | null
  startNewLevel: (mazeTypeId: string, level: LevelName) => void
  loadLevel: (progress: LevelProgress) => void
  clearLevel: () => void
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
    const now = new Date().toISOString()
    set({
      current: {
        formatVersion: 1,
        mazeType: mazeTypeId,
        level,
        questions: buildEmptyQuestions(mazeTypeId, level),
        createdAt: now,
        updatedAt: now,
      },
    })
  },

  loadLevel: (progress) => set({ current: progress }),

  clearLevel: () => set({ current: null }),

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

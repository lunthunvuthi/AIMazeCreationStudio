import type { MazeData, ValidateResponse } from '../types/maze'

// Hits POST /api/maze/validate (Web App/backend/maze_api/routes.py), proxied
// to the backend by vite.config.ts in dev.
export async function validateMaze(payload: { type: string; maze: MazeData }): Promise<ValidateResponse> {
  const res = await fetch('/api/maze/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`validate request failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  return {
    solutionCount: data.solutionCount,
    trace: data.trace ?? null,
    diagnostic: data.diagnostic ?? null,
  }
}

export interface GenerateSeeds {
  sgSeed: number
  pathSeed: number
  wallSeed: number
}

export interface GenerateResult {
  maze: MazeData
  solutionTrace: string
  seeds: GenerateSeeds
}

export interface GenerateParams {
  type: string
  star: number
  sgSeed?: number
  pathSeed?: number
  wallSeed?: number
}

// Hits POST /api/maze/generate (development_plan.md §6.6/§8). Omitting a seed
// lets the server pick it randomly; passing a previous result's seed pins
// that stage of the pipeline for a reroll.
export async function generateMaze(payload: GenerateParams): Promise<GenerateResult> {
  const res = await fetch('/api/maze/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`generate request failed: ${res.status} ${res.statusText}`)
  }
  const data = await res.json()
  return {
    maze: { pickaxe_count: data.pickaxe_count, width: data.width, height: data.height, maze: data.maze },
    solutionTrace: data.solutionTrace,
    seeds: { sgSeed: data.seeds.sgSeed, pathSeed: data.seeds.pathSeed, wallSeed: data.seeds.wallSeed },
  }
}

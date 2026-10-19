// Reads the repository-root `.env` into process.env, if there is one.
//
// The same file the backend reads (maze_api/config.py). One shared file rather
// than one per component: both need AUTH0_DOMAIN and AUTH0_AUDIENCE, and a
// mismatch between the two produces a 401 with no useful message. A trap worth
// designing out rather than documenting.
//
// This module must be imported BEFORE anything that reads process.env — ES
// modules are evaluated in import order, so `import './loadEnv.js'` on the
// first line of a module runs before that module's other imports do.
//
// process.loadEnvFile does not overwrite variables that are already set, so an
// exported variable still beats the file. Node 20.12+ (this project already
// requires 20.19+).

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const envFile = path.join(repoRoot, '.env')

if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

// Phase 2 persistence — development_plan.md §2, roadmap §9 step 6. The problem
// it solves is narrow and specific: before this, an accidental refresh or tab
// close threw away an in-progress sheet outright, and "Save Progress" (a JSON
// file download) was the only safety net. A real authoring session is 8-10
// questions in one sitting, so that was the sharpest edge in the product.
//
// SCOPE — deliberately ONE slot, not a library of saved sheets.
// The stored value is a single LevelProgress: whatever the store currently
// holds. It is a crash net for the session in progress, not a "my sheets"
// list. A multi-sheet local library needs a sheet id, a listing screen and a
// delete/rename story, and it is the first step of the Drive/backend work
// rather than the last step of this one — see storage_spike.md §4/§6.
//
// The stored record is a plain LevelProgress, byte-identical to what
// downloadLevelProgress writes. That is on purpose:
//   - it reads back through fileAdapter's parseLevelProgress, so version
//     checks and the formatVersion-1 migration exist in exactly one place;
//   - the raw localStorage value can be copied out of devtools and dropped
//     onto Modify Maze as a save file, which makes a stuck autosave
//     recoverable by hand.

import type { LevelProgress } from '../types/maze'
import { parseLevelProgress } from './fileAdapter'

const AUTOSAVE_KEY = 'mazeStudio.autosave.v1'

// A record this build cannot parse is moved here rather than deleted. The
// hazard being avoided is real: a newer build writes a format this one does
// not understand (a future formatVersion, say), the user opens an older
// deployed build or an older cached tab, and a delete-on-unreadable would
// destroy work that was perfectly fine. Quarantining keeps it recoverable
// from devtools while still getting it out of the read path.
const QUARANTINE_KEY = 'mazeStudio.autosave.v1.unreadable'

// Coalescing window for writes. Every store action bumps updatedAt, and
// typing in the Sheet name field fires one per keystroke, so an unthrottled
// write would re-serialize every maze on the sheet per character.
//
// Leading-edge throttle, not a trailing debounce: the first change starts a
// window and later changes inside it collapse into the one write at the end.
// A resetting debounce can be starved indefinitely by continuous input, which
// is exactly when you least want the autosave to be stale.
const WRITE_WINDOW_MS = 500

export type AutosaveStatus = 'ok' | 'unavailable'

let timer: ReturnType<typeof setTimeout> | null = null
let pending: LevelProgress | null = null
let onStatus: ((status: AutosaveStatus) => void) | null = null

function storage(): Storage | null {
  // Access itself throws, not just the read: Safari's private mode and
  // "block all cookies" both make `window.localStorage` a getter that raises.
  // Every entry point below has to survive that by leaving the app working
  // and unsaved rather than crashing.
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function quarantine(text: string): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(QUARANTINE_KEY, text)
    store.removeItem(AUTOSAVE_KEY)
  } catch {
    // Quota is the likely cause, and there is nothing useful to do about it
    // here — the record stays where it is and the next read quarantines
    // again. Never let bookkeeping break a read.
  }
}

// Returns the autosaved sheet, or null if there is none / it cannot be read.
// Never throws: this runs during store construction, so a throw here would
// be a blank screen on load.
export function readAutosave(): LevelProgress | null {
  const store = storage()
  if (!store) return null

  let text: string | null
  try {
    text = store.getItem(AUTOSAVE_KEY)
  } catch {
    return null
  }
  if (!text) return null

  try {
    return parseLevelProgress(JSON.parse(text))
  } catch {
    quarantine(text)
    return null
  }
}

// Writes immediately. Returns whether the write landed — a false here means
// autosave is not protecting the user and the UI should say so, because a
// silently-not-saving safety net is worse than a visibly absent one.
export function writeAutosave(progress: LevelProgress): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(AUTOSAVE_KEY, JSON.stringify(progress))
    return true
  } catch {
    // QuotaExceededError. One sheet is a few tens of KB against a ~5 MB
    // budget, so this means something else on the origin filled it; not
    // something this module can fix by pruning its own single key.
    return false
  }
}

export function discardAutosave(): void {
  const store = storage()
  if (!store) return
  // Any queued write has to die with it, or the throttle would resurrect the
  // sheet a few hundred ms after the user discarded it.
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  pending = null
  try {
    store.removeItem(AUTOSAVE_KEY)
  } catch {
    // Nothing to do; the record is unreachable to this build anyway.
  }
}

// Called by the store on every change to `current`. See WRITE_WINDOW_MS.
export function scheduleAutosave(progress: LevelProgress): void {
  pending = progress
  if (timer !== null) return
  timer = setTimeout(() => {
    timer = null
    flushAutosave()
  }, WRITE_WINDOW_MS)
}

// Writes any queued change right now. Called on pagehide so a deliberate
// reload or tab close cannot land inside the throttle window and lose the
// last edit — which is the exact scenario this whole module exists for.
export function flushAutosave(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  if (!pending) return
  const ok = writeAutosave(pending)
  pending = null
  onStatus?.(ok ? 'ok' : 'unavailable')
}

export function onAutosaveStatus(cb: (status: AutosaveStatus) => void): void {
  onStatus = cb
}

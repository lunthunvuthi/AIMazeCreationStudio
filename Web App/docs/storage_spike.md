# Storage Spike — where sheets live, and what that costs

**Written 2026-08-28**, on landing roadmap step 6 (`localStorage` autosave) and being asked
two further questions by the project owner:

1. *"What if I want to connect the storage to the Drive? Can we do that and what are the
   difficulties?"*
2. *"I want many users… Teacher creates work in their own folder, publishes it, others
   comment; HeadTeacher approves a version and sets a roster with deadlines."*

This document answers (1) and sizes it. Question (2) is a product design of its own and
lives in [`collaboration_workflow_spec.md`](collaboration_workflow_spec.md) — but the two
questions are **not** independent, and §5 below is the reason: the answer to (2)
constrains the answer to (1) far more than the other way round.

`development_plan.md` §2 remains the canonical statement of the phased strategy. This doc
is the spike behind its Phase 3, not a replacement for it.

---

## 1. Where storage actually stands today

Facts, not plans.

| Layer | State | File |
|---|---|---|
| In-session state | One `LevelProgress` in a Zustand store. `current: LevelProgress \| null` | `store/levelStore.ts` |
| Export to file | "Save Progress" → a `.json` download. Also fired automatically alongside a PDF Download | `storage/fileAdapter.ts` |
| Import from file | Drag-and-drop / browse on **Modify Maze**, with a `formatVersion` 1→2 migration | `storage/fileAdapter.ts` |
| Crash net | **`localStorage`, one slot** — built 2026-08-28, roadmap step 6 | `storage/localStorageAdapter.ts` |
| Backend | Two **stateless** endpoints (`/api/maze/generate`, `/api/maze/validate`). No database, no session, no auth, `allow_origins=["*"]` | `backend/maze_api/` |
| Identity | **None.** No users, no sign-in, no notion of "whose sheet this is" | — |
| Sheet identity | **None.** `LevelProgress` has no id field | `types/maze.ts` |

Two measurements worth having, because several arguments below turn on them:

- **A complete sheet is small.** The two Phase B exports on disk: an 8-question kinder
  sheet is **5.6 KB**, a 9-question primary sheet **6.6 KB**. Mazes serialize as short
  comma-separated strings, so there is no image or binary payload anywhere in a sheet.
- Therefore `localStorage`'s ~5 MB budget holds **several hundred sheets**. See §4 — this
  removes the usual reason to reach for IndexedDB.

### What step 6 did and did not do

Built: the store hydrates from `localStorage` at construction, so a refresh keeps the
sheet and stays on the Level Dashboard; writes are coalesced in a 500 ms window and
flushed on `pagehide`; the maze-type home shows a **Resume / Discard** card; the three
paths that replace the sheet (new level, file import, discard) now confirm first if a maze
has been authored; a failed write surfaces as a visible warning rather than silence.
Verified in the real browser by `scripts/autosave_check.mjs` (20 checks).

**Not** built, deliberately: a *library*. There is exactly one slot. It is a crash net for
the session in progress, not a list of your past work. The owner's "see all of my previous
work levels" is §4/§6, not step 6.

---

## 2. "Connect the storage to Drive" is three different projects

The phrase covers three architectures that differ in difficulty by more than an order of
magnitude. Separating them is most of the value of this spike.

| | What it means | Verdict |
|---|---|---|
| **A** | Drive as **one user's own storage**. Browser talks to Drive directly. Sheets live in a "Maze Studio" folder in *your* Drive; on load the app lists that folder and shows your past work. | **Feasible.** ~1–2 weeks. Delivers exactly the owner's question-1 story. |
| **B** | Drive as the **team's shared storage** — a shared folder is the "public" area, Drive permissions are the access model, Drive comments are the comments. | **Do not build.** §3.3 — it cannot express approval, and the roster has no home. |
| **C** | A **backend database** is the system of record; Drive is an optional mirror/export target. | **The one the collaboration flow requires.** §5. |

A is a genuinely good answer to a genuinely narrow question. The trap is assuming A grows
into B, and B into the workflow. It does not: B is a dead end, and A's work is largely
*re-done* under C.

---

## 3. Option A in detail — Drive as one teacher's own storage

### 3.1 How it would work

- A Google Cloud project with an OAuth client ID; sign-in via Google Identity Services in
  the browser.
- Scope **`drive.file`** only. This matters more than anything else on this page:
  `drive.file` is a *non-sensitive* scope, so the app needs **no Google OAuth verification
  review and no CASA security assessment**. `drive.readonly` and `drive` are *restricted*
  scopes — those mean a verification process measured in weeks, an annual third-party
  security assessment, and a real recurring cost. Staying inside `drive.file` is the
  difference between a two-week feature and a compliance project.
- `drive.file` grants access to files **the app created** (plus anything the user hands it
  through the Google Picker). So: the app creates a folder named "Maze Studio", writes
  every sheet into it, and lists it with `files.list?q='<folderId>' in parents`. Because
  the app created both folder and files, that access persists across sessions and across
  devices for the same user — which is precisely the "reload and see my previous work"
  requirement.
- Each sheet is one `.json` file, the same bytes `downloadLevelProgress` already writes.
  Nothing about the data format has to change… except §4's `sheetId`.

Rejected alternative: `appDataFolder` (scope `drive.appdata`, also non-sensitive) gives a
hidden per-app folder. Cleaner technically, but the owner explicitly wants "their own
Drive folder" — something they can open, see, and back up. A hidden folder they cannot
find is a worse product even though it is a simpler API.

### 3.2 The difficulties, concretely

1. **Access tokens are short-lived and there is no refresh token in a browser.** GIS
   issues ~1 hour access tokens. A real authoring session (the Phase B runs put it at
   8–10 questions in one sitting) will cross that boundary mid-edit. Every Drive call
   needs 401-handling that re-acquires a token and retries — and the re-acquire can
   require user interaction, so a save can *block on a popup*. This is the single largest
   source of fiddly work in Option A.
2. **Autosave cannot be a network call.** The current autosave writes on every store
   change. Drive is a round trip with rate limits. So `localStorage` does not go away — it
   stays the fast crash net, and Drive becomes a coarser sync (explicit "Save to Drive", or
   on idle). That is a two-tier storage model, with the staleness questions that implies.
3. **Last-write-wins, silently.** Drive gives no locking. Two tabs, or a laptop and a
   desktop, will clobber each other. Mitigation is an optimistic check — compare the
   file's `modifiedTime`/`headRevisionId` before overwriting and refuse on mismatch — which
   requires a UI for the refusal. Merging two versions of a maze sheet is not a meaningful
   operation, so "reload, you are behind" is the only honest resolution.
4. **It cannot be tested by the existing harness.** Google actively blocks automated
   sign-in, so `scripts/phase_b_run.mjs` and `scripts/autosave_check.mjs` cannot drive a
   real Drive session. A fake adapter behind the same interface is mandatory, and the real
   path stays manually verified. Given this repo's convention that frontend guarantees are
   *browser-verified*, this is a genuine reduction in confidence, not a footnote.
5. **Deployment stops being optional.** OAuth needs registered, non-`file://` origins and
   a consent screen naming a real app. `development_plan.md` §1 lists deployment as "not
   yet decided"; Option A forces at least a decision about origins.
6. **Offline breaks the promise.** "My work is in Drive" is false on a train. Tier 1
   (`localStorage`) covers the sheet in progress; the *library* is unavailable offline.

### 3.3 Why Option B (Drive as the team's shared storage) is a dead end

Not a matter of effort — of expressiveness:

- **Drive cannot enforce "only a HeadTeacher may approve".** Approval is application
  semantics. In Drive it would be a field inside a JSON file, and anyone with edit access
  to the shared folder can write that field, or rename, overwrite or delete the approved
  sheet. The central guarantee of the whole workflow would be unenforceable.
- **No queries.** "Every sheet due this week awaiting approval" requires listing the folder
  and downloading *every file* to inspect it. That is O(n) network calls for a view that is
  one `SELECT` against a database.
- **The roster and the deadlines have nowhere to live.** They are not per-sheet data; they
  are shared, mutable, concurrently-written state. A roster JSON file in a shared Drive
  folder is a lost-update machine — two HeadTeachers editing different weeks lose one of
  the edits, with no error.
- **Roles need an identity source anyway.** The moment you need a table mapping people to
  Teacher/HeadTeacher, you have a backend — and then the sheets may as well live beside it.

---

## 4. The gap nobody had noticed: sheets had no identity

> **RESOLVED 2026-08-28.** `sheetId` + `formatVersion: 3` shipped as roadmap step 6.5.
> The rest of this section is the argument that led to it, kept because the *semantics*
> below still govern how the id behaves. Implementation: `types/maze.ts` (the field and
> its doc comment), `store/levelStore.ts` (`startNewLevel` mints it),
> `storage/fileAdapter.ts` (`parseLevelProgress` defaults it in for pre-v3 files).
> Nine checks in `scripts/autosave_check.mjs` cover it.

Every remote-storage option, and the entire collaboration flow, needs to name a sheet.
`LevelProgress` currently has no id. The nearest thing is
`(level, year, month, week)` — which is **user-editable from the dashboard** and **not
unique** (two teachers may both author "Primary, Sep, week 1"; that is not a bug, it is
the point of the publish-and-choose flow).

Consequences of the gap:
- Drive: "update the existing file" versus "create a second one" cannot be decided.
- Backend: no primary key, no `PUT /api/sheets/:id`.
- Even locally: a multi-sheet library cannot key its entries.

**This was the cheapest high-leverage change on the page** — add `sheetId` (a UUID stamped
at `startNewLevel`, preserved by import), bump to `formatVersion: 3`, and default it in for
older files exactly as `sheetName`/`year`/`month`/`week` are defaulted today. The migration
path already existed in `fileAdapter.parseLevelProgress`; the pdf-service's payload
validator only checks `pages[]`, so it was unaffected. It took about half a day as
estimated.

**Two semantics that were decided while building it**, and that a backend must respect:

- **Importing the same pre-v3 file twice produces two different ids** — two distinct
  sheets. There is no information in an old file that could say otherwise, and hashing the
  contents would be worse: it would silently merge two teachers' separate sheets that
  happen to start from the same template.
- **Importing a v3 file twice keeps one id**, because the id travels in the file. That is
  the point — the same sheet moved between two machines must be recognised as one.

An empty-string `sheetId` is treated as absent, so a hand-edited or truncated file cannot
produce a sheet whose id collides with every other such file.

### The local library, if it is wanted for its own sake

Because a sheet is ~6 KB, a **multi-sheet local library in `localStorage`** is viable:
several hundred sheets inside the 5 MB budget, no IndexedDB needed. It would need
`sheetId`, a "My Sheets" screen, and rename/delete. That is ~2–3 days and it makes the
single-teacher story genuinely good with no server, no OAuth and no deployment.

The honest caveat: it is **throwaway work if the collaboration flow is being built soon**,
because a server-backed library replaces it. It is worth doing only if a single teacher
needs to be productive before the multi-user work lands.

---

## 5. Why the collaboration flow settles the Drive question

The flow in [`collaboration_workflow_spec.md`](collaboration_workflow_spec.md) requires,
irreducibly: identities with roles, a permission model where one role can do something
another cannot, shared mutable state with concurrent writers (the roster), queries across
everyone's work ("pending approval", "overdue"), and an approval that points at an
immutable version.

Drive supplies none of those. A backend supplies all of them and makes them ordinary.

So the sequencing conclusion is:

> **If the collaboration flow is the real goal, do not build Option A.** Its OAuth work,
> its two-tier sync, its conflict handling and its untestable path all get re-done under
> Option C, and it delays the thing that was actually wanted.
>
> **Build Option A only if** a single teacher's cross-device access is needed *sooner*
> than the multi-user flow, and that is worth the duplicated effort.

Drive still has a good role under Option C, just a later and smaller one: a **mirror**,
not a store. "Also drop the approved PDF and its JSON into the school's Drive folder" —
done *server-side*, where refresh tokens exist, where a Google Workspace service account
with domain-wide delegation is the clean path, and where none of §3.2's browser-token
problems apply. It is a one-way export of an already-approved artifact, so conflicts
cannot arise.

---

## 6. Concerns to carry forward

Beyond the Drive-specific items in §3.2. These apply to whichever path is chosen.

1. **No identity, anywhere.** Everything multi-user depends on solving this first, and it
   is not a small piece — see the collaboration spec's §7.
2. **No `sheetId`.** §4. Blocks every remote option.
3. **CORS is wide open** (`allow_origins=["*"]`, with an in-code comment saying it is fine
   *because* the API is stateless and unauthenticated). The moment there is data worth
   protecting that comment stops being true. Must be tightened in the same change that
   adds auth, not after.
4. **The PDF renderer takes its data from the client.** `pdf-service` renders whatever
   `LevelProgress` is POSTed to it, and the render endpoint is unauthenticated. Under an
   approval model that is a correctness hole, not just a security one: a teacher could
   print a sheet that differs from the version that was approved, under the approved
   label. An approved PDF must be rendered **server-side from stored data** and, ideally,
   stored — so every download of "the confirmed worksheet" is byte-identical.
5. **Format versioning is enforced client-side only.** Once sheets are shared, an older
   client can write an older format over newer data. The server needs to validate
   `formatVersion` and refuse writes from clients that are behind, with a "this sheet needs
   a newer app version" path in the UI.
6. **No conflict policy exists anywhere.** `updatedAt` is written on every action and read
   by nothing. Recommendation: a monotonic `version` integer per sheet, optimistic
   concurrency, and **reject-and-reload** rather than merge. Two edited maze sheets have no
   meaningful merge.
7. **`localStorage` is per-browser, per-origin, and silently absent.** Private windows,
   cleared site data and a different browser all read as "no work saved". Step 6 handles
   the *failure* visibly, but a shared classroom machine where two teachers use one browser
   profile will have them sharing one autosave slot. Another argument for §4's library, or
   for accounts.
8. **Deployment is still undecided** (`development_plan.md` §1). Auth and a database force
   the decision, and bring secret management and backups with them.
9. **Compliance is currently easy — keep it that way.** Worksheets contain no student data
   whatsoever. Teacher names and emails are personal data, so accounts introduce the first
   real obligation. Worth stating as a design constraint: *do not put student names on
   sheets*, and the compliance surface stays trivial.
10. **Concurrency cost of rendering.** Each PDF render is a headless Chromium context
    against a running frontend. One user at a time is fine; a school's worth of teachers
    all exporting on a Friday afternoon is a capacity question that has never been asked.

---

## 7. Decisions the owner needs to make

Recommendations included, because none of these is a coin toss.

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | Is Drive the **system of record** or a **mirror**? | Mirror, later, server-side | §3.3, §5 |
| D2 | Add `sheetId` and bump to `formatVersion: 3` now? | ~~Yes~~ **DONE 2026-08-28** | Cheapest unblock on the page; §4 |
| D3 | Build the local multi-sheet library first? | Only if a single teacher must be productive before the multi-user work | Throwaway under Option C; §4 |
| D4 | Identity provider | **Google Sign-In (OIDC)** | Schools already have Workspace accounts; no password storage; and it is the same consent plumbing if Drive export happens later |
| D5 | Where do roster + approvals live? | Backend database | §3.3 — nowhere else can enforce them |
| D6 | Who renders an approved PDF? | Server, from the stored revision, result stored | Concern 4 — otherwise "approved" does not identify specific bytes |
| D7 | Conflict policy | Optimistic `version`, reject-and-reload | Concern 6 |
| D8 | One school per deployment, or multi-tenant? | Decide **before** the schema, not after | Retrofitting a tenant key touches every table and every query |

**The one blocking question:** is the collaboration flow the actual near-term goal, or a
longer-term ambition? D1 and D3 both hinge on it, and answering it wrong wastes either two
weeks of Drive work or two weeks of waiting.

---

## 8. Recommended sequence

Assuming the collaboration flow is the goal (see the blocking question above):

| Step | Work | Rough size |
|---|---|---|
| 6 | `localStorage` autosave | **Done 2026-08-28** |
| 6.5 | `sheetId` + `formatVersion` 3 | **Done 2026-08-28** |
| 7a | Google sign-in, `users` table, tighten CORS, authenticate `pdf-service` | 1–2 weeks |
| 7b | Sheets in Postgres: `BackendAdapter`, "My Sheets" library, immutable revisions | 1–2 weeks |
| 7c | Roles, publish, comments | ~1 week |
| 7d | Roster + deadlines | ~1 week |
| 7e | Approval on a revision, server-rendered approved PDF | ~1 week |
| later | Drive mirror of approved artifacts (server-side) | ~3 days |

Sizes are order-of-magnitude, for sequencing arguments only — they are not estimates
anybody should plan against. The breakdown per step is in
[`collaboration_workflow_spec.md`](collaboration_workflow_spec.md) §7.

Skipping 6.5 would not have saved time; it would only have moved the cost into 7b, where
the migration would have been one more thing inside a much larger diff.

**Decision recorded 2026-08-28:** the owner chose the backend path (D1 mirror, D3 no local
library) with **Auth0** as the identity provider, revising D4 from plain Google Sign-In. The
reasoning is in `collaboration_workflow_spec.md` §7 — briefly, wanting a login screen is
what rules out the local library (per-browser storage is a promise a login cannot keep), and
it also removes Drive's main advantage, since Auth0-to-Google Drive scopes need server-side
token handling anyway. Once a server exists, a `sheets` table is less work than Drive's
token plumbing *and* counts toward step 7 instead of being thrown away.

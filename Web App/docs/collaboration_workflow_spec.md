# Multi-Teacher Collaboration Workflow — spec and feasibility

**Drafted 2026-08-28** from the project owner's description. Everything here is
**PROPOSED** — none of it is built, and §8 lists the questions that must be answered
before it can be. Read [`storage_spike.md`](storage_spike.md) first if the question is
*where data lives*; this document is about *who may do what to it, and when*.

The owner's description, kept verbatim because the spec below is an interpretation of it
and the interpretation may be wrong:

> I also want a new work flow, like i want many user to be able to use this. And the i
> want user to have different level. like normal Teacher, will create their own local
> drive folder and record their work, and then they can also publish their work so that
> all other teacher can see the work and comment on it as well. HeadTeacher can also do
> the same. And HeadTeacher can also approve of the public work and Confirm that this
> version of the worksheet is the one that they all confirm to use. HeadTeacher can set up
> a roster or schedule for which content of the game to use in which week, or not using at
> all in that week. and then Teacher will be able to see the roster and decide which maze
> to create first in private folder, and then push to the public folder, and then the head
> teacher will confirm it to use as the confirmed work. Head Teacher can set up deadline
> for each content in the roster as well.

---

## 1. Does the flow make sense?

**Yes.** It is a plan → author → review → approve loop, which is the standard shape for
shared teaching material, and it maps onto what the app already does: the unit of work is
already a worksheet (`LevelProgress`), and it already carries `year`/`month`/`week`, which
is exactly the axis a roster is indexed on. That is a real and useful coincidence — the
roster is not a foreign concept being bolted on, it is a schedule over a field the data
model already has.

Four things in the description need a firmer decision than the prose gives them. Each is
resolved below and flagged in §8.

1. **"their own local drive folder" and "the public folder" should not be folders.**
   Recommended as *states of a sheet*, not locations. Reasons in §3.1 — the short version
   is that real folders (filesystem or Google Drive) cannot enforce who may approve, which
   is the one guarantee the whole flow exists to provide.
2. **"this version of the worksheet"** — the owner said *version*, and that word carries
   the design. Approval must point at an **immutable revision**, not at a sheet. §3.2.
3. **A roster entry can have several candidate sheets.** Two teachers may both author for
   week 3. That is not a conflict to prevent; it is the point of "publish, then the Head
   Teacher confirms one". §4.
4. **Deadlines need to be defined as *soft*.** §5.

---

## 2. Roles

Two roles, as described, plus one that becomes necessary in practice.

| Role | Who | Summary |
|---|---|---|
| **Teacher** | Any teacher | Authors sheets privately; publishes them; comments on anyone's published sheet; sees the roster and everything approved. |
| **HeadTeacher** | Curriculum lead | Everything a Teacher can do, **plus** owns the roster and deadlines, and is the only role that can approve or revoke. |
| **Admin** | — | Invites people, assigns roles. Needed because someone must be able to make the first HeadTeacher, and role changes cannot be self-served. May be a HeadTeacher flag rather than a third role — §8. |

Roles are additive: a HeadTeacher is a Teacher with extra powers, never a different user
type. This keeps the UI one app rather than two.

### Permission matrix

| Action | Teacher | HeadTeacher |
|---|---|---|
| Create / edit / delete **own draft** | ✅ | ✅ |
| See another teacher's **draft** | ❌ | ❌ (recommended — §8) |
| Publish own sheet (creates a revision) | ✅ | ✅ |
| See all **published** sheets | ✅ | ✅ |
| Comment on any published sheet | ✅ | ✅ |
| Edit / delete **own** comment | ✅ | ✅ |
| Delete **anyone's** comment | ❌ | ✅ |
| **Approve** a revision | ❌ | ✅ |
| Revoke an approval | ❌ | ✅ |
| Create / edit roster entries and deadlines | ❌ | ✅ |
| Mark a week "no maze this week" | ❌ | ✅ |
| Download the approved worksheet + answer key | ✅ | ✅ |
| Invite users / change roles | ❌ | Admin only |

The one row worth arguing about is "see another teacher's draft" — see §8.

---

## 3. The sheet lifecycle

### 3.1 States, not folders

```
      ┌──────── edit ────────┐
      ▼                      │
   ┌───────┐   publish   ┌───────────┐  approve   ┌──────────┐
   │ DRAFT │ ──────────► │ PUBLISHED │ ─────────► │ APPROVED │
   └───────┘             └───────────┘            └──────────┘
      │                       │                        │
      │ delete                │ withdraw               │ a later revision
      ▼                       ▼                        │ of the same roster
   (gone)                  DRAFT                       │ entry is approved
                                                       ▼
                                                  SUPERSEDED
```

- **DRAFT** — visible only to its author. This is the owner's "private folder".
- **PUBLISHED** — visible to everyone in the school, comments open. The "public folder".
- **APPROVED** — a HeadTeacher has confirmed *this revision* is the one to use. At most one
  approved revision per roster entry at a time.
- **SUPERSEDED** — was approved, then something else was approved for the same roster
  entry. Kept, never deleted: teachers may already have printed it, so the record of what
  *was* official has to survive.

**Why states rather than actual folders.** The words "private folder" and "public folder"
describe the experience well, and the UI should use exactly that language. But if they are
implemented as real folders — on a filesystem, or in Google Drive — then the access model
becomes the folder's ACL, and a folder ACL cannot express *"only a HeadTeacher may set this
sheet to approved"*. Anyone with write access to the public folder could edit, overwrite,
rename or delete an approved worksheet, and nothing would stop them or record it. The
guarantee the flow exists to provide would be unenforceable. `storage_spike.md` §3.3 has
the longer argument.

So: **"folder" is vocabulary for the user, `state + owner` in the data.** A "My work" view
filters to the user's drafts; a "Shared" view filters to published sheets. It looks like
folders and behaves better.

### 3.2 Revisions are immutable, and approval points at one

This is the most important structural decision in the document.

Publishing does not move a sheet. It **snapshots** it: a full copy of the `LevelProgress`
at that moment becomes revision *n*, permanently frozen. Comments attach to a revision.
Approval attaches to a revision.

Without this, "approved" means nothing durable. The author would still hold an editable
sheet, and any edit after approval would silently change what everyone believes was
signed off — the worksheet a teacher prints on Friday would differ from the one approved on
Monday, with no version to point at and no way to detect it. With immutable revisions:

- "Approved" identifies exact content, forever.
- A teacher who wants to change an approved sheet publishes **revision n+1**, which starts
  as PUBLISHED and needs its own approval. The old approval stands until the new one
  replaces it.
- The approved PDF can be rendered once, server-side, and stored — so every teacher
  downloading "the confirmed worksheet" gets identical bytes.
  (`storage_spike.md` §6 concern 4 is exactly this, and it is a correctness issue rather
  than a security one.)
- Comment threads never point at content that has since changed underneath them.

Cost: storage grows by a full sheet copy per publish. At ~6 KB per sheet
(`storage_spike.md` §1) this is irrelevant — a school publishing 500 revisions a year uses
3 MB.

---

## 4. The roster

A HeadTeacher's plan for the term. One entry is one planned worksheet slot.

```
RosterEntry
  id
  year, month, week          ← the same axis LevelProgress already carries
  level                      ← kinder | primary | advanced
  mazeType                   ← "which content of the game to use"
  plan                       ← 'use' | 'skip'      ("or not using at all in that week")
  deadline                   ← optional date
  notes                      ← optional, free text from the HeadTeacher
```

Behaviour:

- The roster is a **grid**: weeks down, levels across. A cell is either a planned entry, an
  explicit **skip** ("no maze this week"), or unplanned.
- **`skip` is a real, explicit value, not an absent row.** "The Head Teacher decided we are
  not using a maze in week 4" and "the Head Teacher has not filled in week 4 yet" must look
  different to a teacher, or they will chase work that was deliberately cancelled.
- A teacher opens a roster entry and starts a sheet **against** it. The entry's
  `year`/`month`/`week`/`level` pre-fill the sheet's metadata, so the dashboard's sheet-info
  fields stop being retyped by hand — a small, real improvement over today.
- **An entry may collect several candidate sheets**, from different teachers. This is
  deliberate: the flow says publish-then-confirm, which only means something when there is a
  choice. The HeadTeacher approves one; the others stay PUBLISHED as alternatives.
- An entry's status is derived, never stored: `unplanned → planned → in progress → awaiting
  approval → approved`. Deriving it keeps it from going stale.

### 5. Deadlines are soft

A deadline on a roster entry is a **date shown to teachers**, driving a badge — *on time /
due soon / overdue* — and the roster's sort order. That is all, in v1.

Explicitly **not** in v1: emails, push notifications, reminders, or any automatic
consequence of passing a deadline. Those need a scheduler, a delivery channel, per-user
notification preferences and an unsubscribe path — a larger piece of work than the rest of
the roster combined, and a separate decision. A deadline nobody is reminded of is still far
more useful than no deadline, because the roster is a screen teachers will be opening
anyway to see what to build.

Nothing is ever blocked by a deadline. A teacher can publish late; a HeadTeacher can
approve late. The badge simply says so.

---

## 6. Screens

| Screen | New? | Purpose |
|---|---|---|
| Sign in | new | Google sign-in. Nothing else is reachable without it. |
| **Home** | replaces `LandingPage` | This week's roster row, my drafts, anything awaiting my approval (HeadTeacher). The maze-type chooser moves inside "New sheet". |
| **Roster** | new | The week × level grid. Read-only for Teachers; editable for HeadTeachers, including `skip` and deadlines. |
| **My work** | new | The user's drafts and published sheets. The "private folder". |
| **Shared** | new | Every published sheet, filterable by level/week/state. The "public folder". |
| **Sheet detail** | new | One sheet: revision history, comments per revision, Publish / Approve / Revoke as the role allows, download links. |
| Level Dashboard | **exists** | Unchanged as an authoring surface. Gains a Publish action and a link back to its roster entry. |
| Wizard / Randomize | **exists** | No change at all. |
| Modify Maze | exists, demoted | File import stays useful for moving work between deployments, but stops being the main way to resume. |
| Admin | new | Invite users, assign roles. |

The genuinely reassuring part: **the authoring core does not change.** The wizard, the
randomizer, the validator, the page-row dashboard and the PDF renderer are all untouched by
this. Everything above wraps them.

---

## 7. Is it possible, and what changes?

**Possible: yes, without any novel engineering.** Nothing here needs a technique the team
does not have — it is a CRUD application with roles and a state machine around an authoring
tool that already works. The scale is small and worth saying out loud: one school is tens
of teachers and a few hundred sheets a year. No caching, no sharding, no queues, no
real-time collaboration. Postgres and FastAPI are comfortably sufficient, and the "hard"
parts of this app (maze generation, uniqueness validation, print layout) are already done
and are not touched.

**The cost is that it changes the app's nature**, and that is the part worth being blunt
about. Today the app is a single-user local tool with a stateless helper API: no accounts,
no database, no deployment, `allow_origins=["*"]`, and no data that outlives a download
folder. Every one of those becomes false. That is not scope creep — it is what "many users
can use this" means — but it is a different kind of project from steps 1–8 of the roadmap.

### What must be added or modified

**Data model** (`types/maze.ts`, `backend/maze_api/schemas.py`)

| Change | Notes |
|---|---|
| `LevelProgress.sheetId` | UUID. Prerequisite for everything. `storage_spike.md` §4 — do it first, on its own |
| `formatVersion` → 3 | Migration slot already exists in `fileAdapter.parseLevelProgress` |
| `version` integer per sheet | Optimistic concurrency; reject-and-reload on mismatch |
| New: `User`, `Sheet`, `SheetRevision`, `RosterEntry`, `Comment`, `Approval`, `AuditLog` | `SheetRevision` holds a frozen `LevelProgress` blob |

**Backend** — the largest share of the work, and mostly new ground for this service

- Google OIDC sign-in, sessions, `users` table, role column.
- Tables + **Alembic migrations** — there are none today; the schema has never needed to
  change on disk.
- `/api/sheets/*`, `/api/revisions/*`, `/api/roster/*`, `/api/comments/*`,
  `/api/approvals/*`.
- Role enforcement as middleware/dependencies, **not** per-endpoint `if` statements. This
  is the code that makes approval mean anything; it must be one auditable place.
- **Tighten CORS.** `main.py`'s `allow_origins=["*"]` carries a comment saying it is fine
  *because* the API is stateless and unauthenticated. That stops being true in the same
  commit that adds a session cookie. Same change, not later.
- An **audit log** for approve/revoke/role-change. "Who confirmed this and when" is the
  question a school will actually ask.

**Frontend**

- Auth: sign-in screen, session context, role-gated rendering.
- `storage/BackendAdapter` alongside `fileAdapter` and `localStorageAdapter`. This is where
  `development_plan.md` §2's `ProgressStorageAdapter` interface finally earns its keep —
  with three implementations, the abstraction has something to prove itself against, which
  it did not with one or two.
- `levelStore` shifts from "**the** current sheet" to "the sheet I am editing, out of
  many". The store's shape barely changes; what changes is that `current` acquires an
  identity and a remote origin. `localStorageAdapter` stays exactly as built, as the
  offline/crash buffer for the sheet in hand.
- The five new screens in §6.

**pdf-service**

- Render from a **stored revision id**, not a client-supplied payload.
- Store the resulting PDF for approved revisions, so "the confirmed worksheet" is fixed
  bytes.
- Authenticate the render endpoint — it is currently open, and it drives a real browser,
  which makes it the most expensive unauthenticated endpoint in the system.

**Operations** — new discipline, not just new code

- Deployment (still undecided per `development_plan.md` §1), managed Postgres, secrets,
  **backups**. A school's approved worksheets are the first data in this project whose loss
  would matter.
- Teacher names and emails are the first personal data the project has held. Worksheets
  contain no student data — worth keeping as an explicit design constraint, because it keeps
  the compliance surface trivial.

### Rough sizing

Order-of-magnitude, for sequencing arguments only — **not estimates to plan against**.

| Step | Work | Size |
|---|---|---|
| 6.5 | `sheetId` + `formatVersion` 3 | ½ day |
| 7a | Auth, users, roles, CORS, authenticate pdf-service | 1–2 weeks |
| 7b | Sheets + immutable revisions in Postgres, `BackendAdapter`, My work / Shared screens | 1–2 weeks |
| 7c | Publish + comments | ~1 week |
| 7d | Roster + deadlines | ~1 week |
| 7e | Approval, revoke, audit log, server-rendered approved PDF | ~1 week |
| 7f | Admin: invites and role assignment | ~3 days |

7a is the step to be most careful about: it is the one with the least in-repo precedent,
and every later step depends on its permission model being right.

### The risk that is not about effort

Frontend guarantees in this repo are verified by driving the real app
(`scripts/phase_b_run.mjs`, `scripts/autosave_check.mjs`). **Google sign-in cannot be
automated** — Google blocks it. So either the harness gets a test-only login path on the
backend, or every browser-driven check stops working the day auth lands. That decision
belongs in 7a, at the start, not discovered afterwards.

---

## 8. Open questions for the owner

The flow cannot be built until these are settled. Recommendations given, but each is a
product call.

**About approval**

1. **Can a HeadTeacher approve their own sheet?** *Recommend: yes, and log it.* A school
   with one HeadTeacher would otherwise deadlock.
2. **Can a teacher edit a published revision, or must they publish a new one?**
   *Recommend: new revision, always.* §3.2 depends on it.
3. **What does revoking an approval mean after teachers have printed the sheet?**
   *Recommend: the revision becomes SUPERSEDED, never deleted, and the roster shows it was
   withdrawn.* Needs the owner's view on whether anyone must be told.
4. **May two revisions be approved for one roster entry at once** (e.g. an easier and a
   harder variant)? *Recommend: no in v1 — one approved revision per entry.*

**About visibility**

5. **Should teachers see each other's drafts?** *Recommend: no.* "Private" should mean
   private, or teachers will not use drafts for genuinely unfinished work. Note this
   conflicts mildly with "so all other teacher can see the work" — publishing is the
   sharing gesture, and it should stay deliberate.
6. **Can a Teacher comment on an already-approved sheet?** *Recommend: yes* — that is
   feedback for next term.
7. **Can a teacher delete a published revision?** *Recommend: withdraw (back to DRAFT) only
   while it has no approval and no comments; never delete once commented.*

**About the roster**

8. **Is the roster per level, or one shared schedule?** The proposal in §4 is week × level.
   Confirm that matches how the school actually plans.
9. **Who assigns work?** The description has teachers self-selecting ("Teacher will be able
   to see the roster and decide which maze to create first"). Does a HeadTeacher ever need
   to *assign* an entry to a named teacher? *Recommend: not in v1* — self-selection is
   simpler and is what was described.
10. **What is a "week"?** ISO week number, week-of-month, or term week? `LevelProgress`
    already stores `week` alongside `month`, implying week-of-month. This needs to be
    unambiguous before it indexes a schedule.

**About deployment and scope**

11. **One school per deployment, or multiple schools in one?** *Must be decided before the
    schema is written* — retrofitting a tenant key touches every table and every query.
12. **How many teachers, realistically?** Changes nothing technically at tens; worth
    knowing if the answer is thousands.
13. **Is Admin a third role or a flag on HeadTeacher?** *Recommend: a flag,* until a school
    says otherwise.

**The blocking one**

14. **Is this flow the near-term goal, or a direction?** `storage_spike.md` §7's D1 and D3
    both hang on it: if the collaboration flow is months away, a Google Drive integration
    or a local multi-sheet library is worth building for single-teacher use now. If it is
    next, both are throwaway work and the right move is to start at 6.5.

# Maze Type Production Process

**Status: canonical.** This is the order of work for this system, set by the project
owner on 2026-08-21. Everything else in the repo is a spec for one *stage* of it; this
doc is the spine that says which stage produces what, where that artifact lives, and
what "done" means before the next stage starts.

It is not a rewrite of `Web App/docs/development_plan.md` §9. That section is a **build
roadmap for the web app** ("when do we implement drag-and-drop"). This is a **content
production process** ("what does it take to ship a new maze type, and then a new
worksheet of that type"). The two axes are independent — a stage below can be blocked on
a roadmap step, but they are not the same list.

---

## 1. Why the ordering matters

The process has two phases, and the split is the whole point:

- **Phase A — per maze type, once (§3).** Concept, rules, data shape, generator,
  validator, app screens, renderers, cover page, last page. Ten stages, each producing a
  durable artifact.
- **Phase B — per worksheet, every time (§4).** Author the questions. Nothing else.

Stages A9 (front cover) and A10 (last page) used to sit at the *end* of the whole
project — `development_plan.md` §9's roadmap step 8, after every question-authoring
feature already existed, and `pdf_export_spec.md` treated the cover as something the
exporter composes per export. Moving both **before** question authoring is the owner's
correction, and it is the right one: both are fixed assets, so building them once turns
every subsequent worksheet into pure question authoring with an assembly step that has
no design decisions left in it.

> "when we decide or design the maze type, we should also create or generate this front
> cover first. And then for any content that create later, we will use the same cover
> without having to generate it again and again."

Concretely, that is why `Web App/frontend/src/spike/coverTutorial.ts` holds the cover's
tutorial mazes as **constants** rather than reading them out of the sheet being exported.

---

## 2. Stage → artifact map

Phase A, in order. "Where" is the artifact a stage must leave behind; a stage is not
done until that artifact exists, because the next stage reads it.

| # | Stage | Where the artifact lives | Status for `pickaxe` |
|---|---|---|---|
| A1 | **Game context** — the theme, the audience, what the player is doing and why | `Maze-All-Contents/pickaxe-maze-creation/docs/concept.md` | Done 2026-08-26 |
| A2 | **Rules & regulations** — how the maze works start to finish | `Maze-All-Contents/pickaxe-maze-creation/docs/rules.md` §1–§6 | Done |
| A3 | **Data shape / saving system** — the JSON a maze and a sheet serialize to | `rules.md` §7 (per-maze tokens) + `development_plan.md` §4 (`MazeData`, `MazeQuestion`, `LevelProgress`) + `level_dashboard_pagination_spec.md` §2 (`PageRow`) | Done |
| A4 | **Generation & validation** — how a maze is produced, and how it is proven legal | `generation_spec.md`, `validator_design.md`, `difficulty_setting.md`; implemented in `pickaxe_maze/` | Done |
| A5 | **Backend + frontend** — so a human can exercise it in the web app | `development_plan.md` §5 (registry), §6 (screens), §8 (API); `Web App/backend/maze_api/`, `Web App/frontend/src/registry/pickaxe/` | Done |
| A6 | **In-app visual** — the fast editor renderer | `development_plan.md` §7; `registry/pickaxe/CellRenderer.tsx` | Done |
| A7 | **Print question panel** — the same maze at print quality | `pdf_design_spec.md` §6; `spike/WallGrid.tsx`, `spike/pdfMazeTypeRegistry.tsx` | Done |
| A8 | **Question-page layout** — how N panels arrange on one sheet page | `pdf_export_spec.md` §4; `spike/PdfPreviewSpikePage.tsx` | Done |
| A9 | **Front cover** — fixed per maze type | `pdf_export_spec.md` §3, `pdf_design_spec.md` §12.2; `public/components/svg/Front Cover.svg` + `spike/CoverPage.tsx` + `spike/coverTutorial.ts` | Done 2026-08-21 |
| A10 | **Last page** — fixed per *level* | `pdf_export_spec.md` §5; `public/components/images/*.jpg` + `spike/LastPage.tsx` | Kinder + Primary artwork; Advanced reuses Primary's |

A6 and A7 are deliberately two renderers, not one — resolved in `pdf_export_spec.md` §7
item 1. The editor keeps plain `S`/`G` letters for fast iteration; print uses the
designer's icons. Do not try to unify them.

---

## 3. Phase A detail: the stages with a registration cost

Most stages are "write a doc, write some code". Four of them also require adding an entry
to a registry, and missing one of those is the classic way a second maze type half-works.
The full set of seams a new type must fill:

| Seam | File | Keyed by |
|---|---|---|
| App registry (wizard steps, cell renderer, difficulty, star params) | `frontend/src/registry/mazeTypes.ts` | maze type |
| Generator / validator | `maze_api` + `pickaxe_maze`-equivalent package | maze type |
| Print question panel | `frontend/src/spike/pdfMazeTypeRegistry.tsx` → `PDF_QUESTION_PANELS` | maze type |
| Cover content (instruction sentence, correct + wrong example, watermark) | `frontend/src/spike/coverTutorial.ts` → `COVER_CONTENT` | maze type |
| Last-page artwork | `frontend/src/spike/LastPage.tsx` → `LAST_PAGE_IMAGES` | **level**, shared across types |

Note the last row's different key. The last page is per level, not per maze type, so a
new maze type inherits it for free — but a new *level* needs new artwork. `advanced` has
none of its own and **reuses Primary's on the owner's instruction** (2026-08-21) — an
editorial choice, since the two supplied pages differ in content, not just branding.
`LastPage.tsx` keeps a visible-placeholder branch for any unmapped level rather than
silently borrowing another level's mascot and closing message.

### A9's four parts

The cover is the one stage where the designer's file and generated content interleave, so
it is worth stating the anatomy here rather than only in code. Per the owner's 2026-08-21
breakdown, the page divides into four parts:

1. **Header** — Think!Think! logo (left) · `Name:` + dotted fill line (middle) · divider ·
   level over month/week (right). All in the SVG; only the level and month/week are
   substituted with real `LevelProgress` values.
2. **Title band** — full-page-width gray bar, "Let's do it", Hatenyan mascot. Entirely in
   the SVG, including the title as outlined paths. Separates header from body.
3. **Body** — a sample question of this maze type, scaled to the page width and drawn
   faintly, with its ideal line, as a watermark, and with **no outer panel border** (the
   only panel in the document without one — at page width that frame reads as a stray
   printing rule).
4. **Direction box** — white rounded container with the instruction, a worked correct
   example, and a crossed-out counter-example. **Always in front of part 3**, hiding some
   of the watermark.

Part 4 sitting in front of part 3 is not implemented with clip paths. The watermark is
drawn *underneath* the whole template, and the template's own opaque white fills (header
rect, Direction-box fill) and gray title band mask it exactly where required. That means
`Front Cover.svg` is never edited, and a new version from the designer drops in without
touching the masking. See the comment block at the top of `CoverPage.tsx`.

---

## 4. Phase B: producing one worksheet

Per the owner: *"we design the question from page 2 to the last page with bonus question.
and then we append the first cover page, and the last page for the question to generate
the PDF for user."*

1. Author questions on the Level Dashboard. Every row in `LevelProgress.pages[]` is one
   question page of the PDF; mark whichever rows are bonus rows with the per-row **Bonus**
   toggle (`level_dashboard_pagination_spec.md` §4.4).
2. Export. The renderer assembles:

   ```
   page 1        cover            <- fixed, from A9 (header data substituted)
   pages 2..N-1  questions        <- one per authored PageRow, in order
   page N        last page        <- fixed, from A10, chosen by level
   ```

3. Answer key is the same sequence with solution paths overlaid — a separate download
   (`pdf_export_spec.md` §6). Built 2026-08-27: the dashboard's **Answer Key** button,
   alongside Preview/Download.

**Validated end to end, twice.** This sequence has been driven through the real app on
real dev servers, not asserted from the code:

| Run | Level | Authoring route | Result |
|---|---|---|---|
| 2026-08-27 | `kinder`, 8 questions / 5 rows | all via **Randomize** | 7-page PDF + answer key |
| 2026-08-28 | `advanced`, 10 questions / 6 rows | all via the **manual wizard** | 8-page PDF + answer key |

Between them the two runs cover both authoring routes, both page-row shapes (1-question
`large` and 2-question `small`), every star rating 1-8 — including the 6-8★ pickaxe-range
control and the manual-only distraction-wall sub-step — and the answer key, which in both
runs left the cover and last page pixel-identical and added an overlay to every question
page. Still uncovered: **`primary` has never been run**, and neither worksheet is
shippable content — both were throwaways.

**Consequence for the data model.** Because A9's tutorial is fixed, the cover no longer
consumes a question, so *every* row in `pages[]` is a question page. The renderer was
changed to match on 2026-08-21 (it used to render `pages.slice(1)`, dropping `pages[0]`),
and the Level Dashboard followed later the same day: it no longer renders row 0 as a
locked "Cover / Tutorial" card, `levelStore.ts` no longer reserves `pages[0]`, and each
row's "Page N" label is now read off `pages[]` with the same `i + 1` the renderer uses,
so a row's dashboard label and its printed page number cannot drift apart. See
`level_dashboard_pagination_spec.md` §4.1.

---

## 5. Gaps this process exposes

Writing the stages out surfaced three things that had no home. The first is now closed;
the other two are still open:

1. **A1 had no artifact — closed 2026-08-26.** "Give the context of the game" is a real
   stage: it is what the rules are *for*, and it is what tells a designer what the cover
   should teach. It used to exist only as the repo `README.md`'s generic project overview.
   `pickaxe` now has `docs/concept.md` alongside its `rules.md`, and that is the pattern
   for every future maze type. Note that its §7 leaves three questions open for the owner
   (target age band per level, whether the cover must state the exactly-zero rule
   outright, and how much of the mining fiction is canon) — deliberately unanswered rather
   than guessed.
2. **Advanced has no last page of its own.** It reuses Primary's artwork, which is a
   deliberate stand-in, not a finished state — a dedicated Advanced page is still owed.
   What the stand-in actually costs is now measured rather than assumed. A full Advanced
   export on 2026-08-28 showed the borrowed page renders correctly full-bleed at A4 and
   carries no Primary-specific wording — it names no level, so nothing on it reads as
   *wrong* for Advanced. The gap is editorial (Advanced closes on Posuru and two Hatenyan
   with "Well done! You did it!", inherited rather than chosen for it), not a shipping
   blocker. Commission the artwork when the level ships for real; nothing is blocked on it
   before then.
3. **No second maze type has run this process.** The seam table in §3 is derived from
   reading the code, not from having actually shipped a second type through it. Expect it
   to be slightly wrong the first time it is used in anger — the camera / trampoline /
   directional-tile vectors already sitting in `public/components/svg/`
   (`pdf_design_spec.md` §12.1 flags them as belonging to other game types) are the
   likely first customers.

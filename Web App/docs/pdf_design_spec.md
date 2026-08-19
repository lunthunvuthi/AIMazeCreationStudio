# PickAxe Maze — PDF Design Spec (measured)

This is the **pixel-measured** companion to `pdf_export_spec.md` — that doc covers
document structure and the product decisions (§7); this one is the visual reference
anyone (human or AI) needs to make a renderer produce output that actually looks like
the template, not an approximation of it. Every value below comes from directly
measuring the designer's sample, not eyeballing a thumbnail — see §0 for method. Where
a value is genuinely inferred rather than measured, it's marked **(estimated)**.

**Source files:**
`Maze-All-Contents/pickaxe-maze-creation/Images/Sample/Kinder July-week4-01.pdf` (question
variant, 8 pages) and `Answer Kinder July-week4-01 2.pdf` (answer-key variant, same 8
pages). Both are this company's own fixed template for PickAxe content — treat every
rule below as **required**, not a suggestion, unless explicitly marked optional.

---

## 0. Method

Each PDF page is a single flattened JPEG (2480×3508px, i.e. **300dpi A4**, no vector
text/fonts/paths to extract programmatically — see `pdf_export_spec.md` §0). To measure
it precisely rather than eyeball a low-res thumbnail:

1. Extracted the embedded JPEG from every page at native resolution with PyMuPDF
   (`doc.extract_image()` on each page's XObject — the literal bytes, not a re-render).
2. Cropped full-resolution regions of interest and inspected them directly (not
   downscaled) for line style, icon shape, and layout.
3. Sampled exact colors via a full-page color histogram (`numpy.unique` over all
   pixels, sorted by frequency) — this averages out JPEG compression noise far better
   than picking a single pixel, and it's how the palette in §1 was derived.
4. Measured line thickness, panel size, and box position by scanning single pixel rows/
   columns across a known feature (e.g. straight down through a panel's border) and
   measuring the run-length of matching-color pixels, then converting
   px → mm via the fixed 2480px = 210mm ratio (**11.81 px/mm**).

Re-run this yourself if a value here is ever in doubt — nothing here required manual
measurement in an image editor, it's all scriptable against the two source PDFs.

---

## 1. Page & color fundamentals

- **Page:** A4 portrait, 210×297mm, matching the source exactly.
- **Outer page border:** solid **black** (`#111111`) rule just inside the page edge —
  present on the **cover and bonus pages only**. Confirmed absent on question pages
  (scanned the top edge pixel row on a question page — no black run found).

**Palette** (hex, from the full-page histogram — these are the only non-white/black
colors used anywhere in the document):

| Name | Hex | RGB | Used for |
|---|---|---|---|
| Ink | `#111111` | 17,17,17 | all text, icons, page-number box border, outer page border |
| Brand gray | `#9D9F9E` | 157,159,158 | maze outer border, wall lines, lattice dots, title banner fill, "Direction" pill fill |
| Light gray | `#D1D3D2` | 209,211,210 | decorative background motif only (cover page road/mountain graphic) — cosmetic, see §4 |
| White | `#FFFFFF` | 255,255,255 | page background, panel interior |
| Answer-key path | `#111111` | 17,17,17 | solution-path overlay — **same ink black**, not a colored accent (see §8) |

There is **no red/yellow/blue/green anywhere in the question or answer-key PDFs** —
the entire template is grayscale (ink black + one brand gray + white). This is a
significant correction from `pdf_export_spec.md`'s original visual-estimate draft,
which guessed an amber title banner and colored flag/star — the real sample is
monochrome. The only non-gray content is the Hatenyan mascot, which is also solid
black + white, no color.

---

## 2. Typography (approximated — no embedded font to extract)

The sample uses two weights of one rounded, geometric sans-serif family throughout —
title/display text is a heavier, chunkier cut than body/UI text, but both read as the
same type family (e.g. compare the "t" and "a" shapes between "Let's do it" and
"Kinder"). Since the source is a flattened raster, the exact font file can't be
recovered. Recommended open-source substitutes, picked for the closest shape match:

- **Display/heading weight** (title banner "Let's do it", bonus page "Be a mission
  maker!"): **Baloo 2, Bold/ExtraBold** (or Fredoka SemiBold as a second choice).
- **Body/UI weight** (header labels, instruction text, page numbers, badge digits,
  "Direction" pill, "I did it!"): **Nunito, Bold/ExtraBold** (or Quicksand Bold).

If reportlab is the chosen renderer, both are available as free TTFs and can be
registered with `pdfmetrics.registerFont` — don't fall back to Helvetica for anything
user-facing, the rounded letterforms are a deliberate part of the brand look. If the
frontend/CSS renderer is chosen, both are available as Google Fonts.

---

## 3. Header bar (cover page only)

Left-to-right, single row, ~14mm tall band at the top of the page:

- **Logo:** small Japanese katakana "シンクシンク" (11pt-ish, ink black) directly above
  the wordmark; below it, "Think!" stacked on two lines, bold display weight, ink
  black, with the exclamation marks drawn as a slightly dynamic/flicked stroke (not a
  plain straight bar+dot). Reproduce the two-line "Think!" / "Think!" stack literally —
  this is the company's own confirmed-safe-to-reproduce branding (see
  `pdf_export_spec.md` §0).
- **Name field:** "Name:" label (body weight, ink black) followed by a **dashed** rule
  (not underscores) for the child to write on. Dash color: ink black at reduced
  visual weight — render as a light-to-medium gray dashed line, not full black, to
  read as a "blank to fill in" rather than emphasized text.
- **Vertical divider:** a thin gray rule separates the name field from the level/period
  block.
- **Level/period block** (right-aligned, two lines): line 1 = `LevelProgress.level`
  capitalized ("Kinder"), bold, larger, ink black. Line 2 = `{MONTH_NAMES[month]} /
  Week{week}` (e.g. "July / Week4"), bold, smaller, medium gray — **no year is shown in
  the sample**. `pdf_export_spec.md` §3 previously recommended adding the year anyway
  for multi-year dashboard clarity; that recommendation still stands as a deliberate
  deviation from the literal sample, not an oversight — flag it as such if implemented,
  don't silently match the sample's year-omission without the decision being made
  explicitly.
- Below the whole bar: a plain thin ink-black horizontal rule spanning the page's
  content width.

---

## 4. Title banner + mascot (cover page only)

- **Banner:** full content-width rectangle, **brand gray** (`#9D9F9E`) fill, ~20mm
  tall, no border/radius (hard rectangle).
- **Title text:** large bold display-weight text, **white**, left-aligned with a small
  inset, reading "Let's do it" — **no exclamation mark** in the sample (differs from
  this doc's earlier draft, which added one).
- **Mascot ("Hatenyan"):** positioned right-aligned inside the banner, cropped to
  bust/chest height (not full body here — compare §9's full-body bonus-page pose).
  Solid **black silhouette**: round-ish cat head with two pointed ears (each ear has a
  couple of short horizontal light/white accent strokes near the tip), angled
  "annoyed/determined" eyebrows, two round white eyes with black pupils, a small oval
  white/light snout, one paw raised holding a pencil (diagonal, tip-down). This is the
  company's confirmed-own IP — reproduce directly, don't genericize it into an
  unrelated placeholder mascot.
- **Decorative motif:** below the banner, a light-gray (`#D1D3D2`) "road" graphic —
  a horizontal line strung with circular beads and a jagged mountain-peak/crown
  silhouette in the middle, recurring again lower on the page behind the direction box,
  plus an oversized faint walking-stick-figure silhouette in the bottom-left corner.
  **This is cosmetic background texture, not maze content** — treat as optional/
  lowest priority to reproduce; a renderer that omits it entirely is still correct on
  every functional element. Don't spend renderer-development time perfecting this
  before the maze panels themselves (§6) are correct.

---

## 5. Direction box (cover page only)

- **Container:** rounded rectangle, thick **brand gray** border (~2-3mm radius corners,
  border stroke roughly matching wall-line thickness §6), white fill, no drop shadow.
- **"Direction" pill:** small rounded-rect tab overlapping the container's top-left
  border, **brand gray** fill, bold white text "Direction", plus a small angled pencil
  glyph immediately after the text (decorative, matches the mascot's pencil).
- **Instruction text:** centered, bold ink-black body text, 1-2 lines, maze-type-
  specific (PickAxe: "Let's break the walls with a pickaxe [pickaxe icon inline] and
  reach the goal!" — the pickaxe glyph is inlined directly into the sentence, not just
  captioned separately).
- **Correct-example panel:** a full maze panel (§6's rendering rules apply exactly,
  including the pickaxe-count badge above it) built from the level's tutorial/first
  question, **with its solution path drawn** (§8's answer-key path style) **plus two
  extra decorations not used anywhere else in the document**:
  - A **sparkle/burst marker** (a small 8-pointed jagged-star outline, white fill) at
    every point where the path crosses a wall.
  - A **pickaxe-in-a-speech-bubble callout** (rounded-square outline, white fill, small
    triangular tail pointing at the break point) at the wall-break point(s) the path
    consumes — shown once per pickaxe actually used.
  These two decorations are **specific to the tutorial illustration** — they teach the
  "breaking a wall costs a pickaxe" rule to a first-time reader. **Do not add them to
  the real per-question maze panels or the answer-key output** (§7/§8 confirm neither
  shows them) — this is the one place in the whole document where a maze panel needs
  bespoke decoration beyond §6's general rendering rules.
  - Path line style here specifically: a thick, slightly rounded/wavy "hand-drawn road"
    stroke (rounded line caps/joins, faint texture) rather than the crisp straight line
    used in the real answer-key (§8) — this is a deliberate stylistic difference for the
    illustration; §8's plain straight stroke is what a real answer-key renderer should
    produce, not this wavier one.
- **Incorrect-example panel** (right side): a large gray circled "✕", a caption ("You
  can only break the same number of walls as the pickaxes you have."), and a small
  maze panel showing a path that breaks one wall validly (pickaxe bubble marker, as
  above) then a **second** break marked with a plain ink-black "✕" over it instead of a
  pickaxe bubble, and a deliberately **crooked/knocked-over goal flag** (tilted
  triangular pennant, no square frame — contrast with §6's upright square-frame flag)
  signaling failure. **This entire panel is a static fixture, identical on every
  export regardless of the level's actual content** — not derived from real question
  data at all. Treat as **optional/lowest priority**, same as §4's decorative motif: a
  renderer that omits the incorrect-example panel (or ships a simplified placeholder)
  is still correct on everything that actually varies per sheet. Don't block shipping
  the real per-question rendering (§6/§7, the part that matters for every single
  export) on perfecting this one static illustration.

---

## 6. Maze panel anatomy — the core rendering algorithm

This section applies to **every** maze panel in the document: the cover's
correct/incorrect examples (§5, plus their two extra decorations) and every real
question panel (§7). Get this section right and most of the document is right.

### 6.1 Outer border & panel size

- Square panel, **brand-gray** (`#9D9F9E`) border, measured **~1.6mm thick** (19px at
  300dpi), no double border, no corner radius (hard square corners).
- Panel size on a 1-question-per-row page (star 1, 3×3 grid): measured **~80mm ×
  80mm**, horizontally **centered** on the page's content width (measured left margin
  ≈ right margin ≈ 65mm at that size — i.e. the panel is centered, not left-aligned).
  Larger grids (higher stars) use a visually larger panel — see §7 for the
  panel-count-per-page rule, which is driven by fitting the grid at a legible size, not
  a fixed panel size regardless of grid dimensions.

### 6.2 The grid itself — critical correction

**There is no background grid drawn for open (no-wall) cell edges.** This is the
single biggest correction to make versus a naive "always draw a light dotted grid,
then draw walls on top" implementation (which is what this project's first renderer
spike did, and why it looked wrong): the panel interior is **plain white** except
where a wall actually exists. An edge with no wall is simply blank — there is no
lighter/dotted line standing in for "open passage."

- **A wall between two adjacent cells** is drawn as a straight **brand-gray** line
  segment running the **full length of that one shared cell edge** (corner-to-corner,
  not a short centered tick) — measured **~0.9mm thick** (11px at 300dpi), distinctly
  *thinner* than the outer border (§6.1's 1.6mm) despite being the same color. This
  thickness difference is a real, measured, deliberate distinction, not noise — a
  renderer that gives walls and the outer border the same thickness will look
  subtly wrong even with the right color.
- **A filled brand-gray dot** (small circle, roughly matching or slightly larger than
  the wall line's thickness — **estimated ~1-1.2mm radius**) is drawn at **every
  endpoint of every wall segment that does not lie on the outer border** — i.e. every
  interior lattice point touched by at least one wall gets a dot, regardless of how
  many wall segments meet there (a dead-end single wall still gets a dot at its free
  end). An endpoint that lands exactly on the outer border does **not** get a dot (the
  border line already visually terminates it).
- Concretely, to render one cell's walls: for each of that cell's `right_wall`/
  `bottom_wall` flags that are true, draw one line from one lattice corner to the
  adjacent one, then draw a dot at each of that line's two endpoints unless the
  endpoint coincides with the panel's outer border.

### 6.3 Start / Goal icons

- **Start:** a solid ink-black stick figure in a walking pose (round head, angled
  torso, one arm swinging back and one bent forward, legs mid-stride) — matches this
  project's already-confirmed decision (`pdf_export_spec.md` §7 item 1) to use icons
  rather than the in-app editor's plain "S" letter. Centered in the start cell.
- **Goal:** a flag on a pole with a small ball finial at the top, the pennant is a
  **square frame** (not a solid triangle) containing a **black 5-point star**,
  mounted so the pole's base sits near the cell's floor. This square-frame-with-star
  version is the **only** goal icon used on real question/answer-key panels — the
  crooked/triangular "damaged flag" that appears in §5's incorrect-example illustration
  is a one-off failure depiction, not an alternate standard icon.

### 6.4 Pickaxe-count badge

- Positioned **directly above** the panel (not inside it), left-aligned to the panel's
  left edge.
- One **pickaxe icon glyph** (ink black, angled handle + wedge head, ~35-40° angle)
  repeated once per `pickaxe_count` — for `pickaxe_count > 1`, the icons repeat
  left-to-right, each roughly its own width apart (confirmed on the star-5/6 pages,
  which show 2 repeated pickaxe icons before the bubble).
  followed immediately by a **speech-bubble count label**: a rounded-rect (or
  rounded-rect-with-a-small-left-pointing-triangle-tail) outline, white fill, ink-black
  border and bold digit, containing the same `pickaxe_count` number. Note this repeats
  the count both as icon-count *and* digit — deliberate redundancy for pre-reading
  Kinder-age children, not a bug to simplify away.

---

## 7. Question page layout

- **No outer page border** (contrast with cover/bonus, §1).
- **Page-number box:** small square, thin **ink-black** border (much thinner than the
  maze border — measured ~0.3mm, essentially a hairline), white fill, bold ink-black
  digit centered inside, measured **~12.7mm** square. Position: top-left of the page
  on most pages; **observed inconsistency** — one sample page (the second-to-last,
  page-number "5") instead places it top-**right**. Treat top-left as the default rule
  and don't treat the one right-aligned instance as a hard alternating pattern unless
  a wider sample confirms it — **(estimated / unresolved)**, flag if a designer
  clarification becomes available.
- **Laurel wreath:** appears flanking the page-number box on the **last two**
  question-numbered pages of this sample (matches `pdf_export_spec.md` §4.1's
  already-confirmed "computed per-row, sheet's highest star" interpretation) — solid
  **ink-black** simple line-art laurel sprigs (small leaf shapes along a curved stem),
  mirrored on both sides of the number box, with a tiny decorative flourish mark
  beneath the number. **Not colored gold/green** — this corrects the first renderer
  spike's colored-wreath assumption.
- **Panel count per page:** this sample uses **1 or 2 panels per page**, and where 2
  appear they are **stacked vertically** (one panel, its badge, then the next panel
  below with its own badge) — **not side-by-side horizontally**. This corrects the
  first renderer spike's side-by-side layout. Panels are horizontally centered on the
  page regardless of count. Larger-grid stars get a single, visually larger panel per
  page rather than forcing 2 onto one page (empirically: star 1 with a small 3×3 grid
  fits 2-per-page; higher stars with bigger grids get 1-per-page) — this matches
  `pdf_export_spec.md` §4.1's already-written "generalize by panel size, don't hardcode
  a fixed count" pagination rule; this section just confirms it against real evidence
  instead of leaving it as an assumption.
- **No solution path anywhere on question pages** — confirmed directly (no path lines
  in any question-panel crop across every sampled page). This is the answer-key-only
  distinction from §8.

---

## 8. Answer-key variant

- Identical page sequence and panel layout to §7, with exactly one addition per panel:
  the solution path, drawn as a **plain, straight, ink-black** line of thickness
  roughly matching the outer border (§6.1) or slightly heavier, connecting cell centers
  from Start to Goal, with simple mitered/square corners at turns (**not** the cover
  example's rounded "hand-drawn road" wavy stroke — that texture is specific to §5's
  tutorial illustration).
- **No sparkle/burst markers and no pickaxe-bubble callouts on real answer-key
  panels** — confirmed by direct comparison against the question variant of the same
  panel (see §0's method): the only difference is the path line itself. This corrects
  an early assumption (and this project's first renderer spike's actual bug) that the
  tutorial illustration's break-point decorations belonged on every solved panel — they
  don't; they're exclusive to §5's cover illustration.
- Confirmed separate-file delivery (`Export PDF` + `Export Answer Key PDF`) — already
  resolved in `pdf_export_spec.md` §7 item 4, unaffected by this doc.

---

## 9. Bonus page

- **Full-page black border** (like the cover, §1).
- **"Bonus Challenge" ribbon banner:** top-left, a dark/brand-gray banner shape with
  concave "ribbon-cut" notches on both ends (like a clipped fishtail ribbon, not a
  plain rectangle), bold white text.
- **Title:** "Be a mission maker!" in the display-weight font (§2) rendered with a
  white outline/stroke over black fill (a chunky "outlined" title-card treatment,
  distinct from the plain-filled title banner text on the cover), centered.
- **Subtitle:** "Let's create your own original mission!" in body weight, ink black,
  flanked by a short horizontal rule on each side, centered.
- **Blank area:** a large open rectangle occupying most of the remaining page height,
  no border drawn around it in the sample (this project's earlier renderer spike added
  a dashed border — the sample's is actually borderless white space; a dashed
  placeholder border is a reasonable renderer affordance but isn't in the source, note
  it as an intentional addition if kept).
- **Footer:** "I did it!" in bold ink-black body-adjacent weight, flanked by two short
  diagonal "motion tick" marks (one on each side, like quick emphasis strokes), with
  the full-body Hatenyan mascot beneath it: same solid-black-silhouette character as
  §4 but shown **full body** this time — squinting closed eyes drawn as `>` and `<`
  characters (a happy/proud expression, distinct from the header's round-eyed
  "determined" look), holding a pencil, standing on a soft gray drop-shadow ellipse.

---

## 10. Implementation checklist

A renderer can be checked against this spec without re-measuring the sample every
time:

- [ ] Palette is exactly ink black / one brand gray / white — no color anywhere in
      question or answer-key output.
- [ ] Maze panels have **no background grid** — blank white except actual wall lines.
- [ ] Wall lines are visibly thinner than the panel's outer border (not the same
      weight).
- [ ] A dot appears at every interior wall endpoint, none at border-touching endpoints.
- [ ] Goal icon is a pole + square frame + star (not a bare triangular pennant).
- [ ] Pickaxe badge sits above the panel, icon repeated per count, plus a numbered
      speech bubble.
- [ ] 2-question pages stack panels **vertically**, not side-by-side.
- [ ] Question-page panels show **no** solution path; only the answer-key variant does.
- [ ] Answer-key path is a plain straight ink-black line — no sparkle/pickaxe-bubble
      decorations (those belong only on the cover's tutorial illustration).
- [ ] Laurel wreath is plain ink-black line art, not colored.
- [ ] Cover and bonus pages have a full-page black border; question pages don't.

---

## 11. What's still approximated, not measured

Being upfront about the gap between "measured" and "close enough" — a raster source
has a hard ceiling on precision:

- **Exact font files** — §2's substitutes are shape-matches, not the real typeface.
- **Dot radius** — estimated from visual proportion to the wall-line thickness, not a
  clean scan (JPEG edges made a precise run-length measurement noisy at that scale).
- **Corner radii** (direction box, pill, banner-ribbon notches) — visual estimates,
  not measured in mm.
- **Cosmetic decorative motifs** (§4's road graphic, §5's incorrect-example panel) —
  intentionally deprioritized; see those sections for why they're safe to simplify.

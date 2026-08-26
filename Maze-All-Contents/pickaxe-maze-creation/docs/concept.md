# Pickaxe Maze: Concept

**Stage A1 artifact** for the `pickaxe` maze type, per
[`PRODUCTION_PROCESS.md`](../../../PRODUCTION_PROCESS.md) §2. Written 2026-08-26 to close
§5's gap 1 ("A1 has no artifact"), which noted the game context existed only as the repo
`README.md`'s generic project overview.

This doc answers the question every later stage assumes an answer to: **what is the
player doing, and why does it teach anything?** It is the *why* behind
[`rules.md`](rules.md)'s *what*. Nothing here restates a rule — if you want the strict
legal definition of a move, read `rules.md`.

Two stages downstream read this doc directly:

- **A2 (rules)** — a rule that doesn't serve §3's intent is a rule worth questioning.
- **A9 (front cover)** — the cover has room to teach exactly one idea, so §5 states which
  one. `frontend/src/spike/coverTutorial.ts` is that section made concrete.

Where a statement is an inference from an existing artifact rather than an owner
decision, it says so. §7 lists what A1 *should* pin down but nothing in the repo records
yet — those are for the owner, not for the next reader to guess at.

---

## 1. The theme

A player is a miner working through a rock grid with a **limited, counted supply of
pickaxes**. Walls are rock. A pickaxe breaks one wall. The goal is the way out.

The scarcity *is* the theme. A pickaxe maze with unlimited pickaxes is not a harder or
easier pickaxe maze — it is a different puzzle entirely, because every wall stops being a
decision. Everything distinctive about this maze type follows from the supply being
finite and, per `rules.md` §5, having to be spent to the last one.

**Branding context.** The worksheets ship under the **"Think! Think!"** brand with the
cat mascot **Hatenyan**, both confirmed present in the owner's real sample PDF
(`Web App/docs/pdf_export_spec.md` §0). The mining fiction is the puzzle's own; it is
not a Think! Think! property. Practically, that means the pickaxe is the only piece of
theme art this maze type owns — the logo, the mascot, and the closing page belong to the
brand and are shared with every other maze type
(`PRODUCTION_PROCESS.md` §3 — last-page artwork is keyed by *level*, not by maze type).

## 2. The audience

Three levels, from [`difficulty_setting.md`](difficulty_setting.md): **Kinder**,
**Primary**, **Advanced**. Each is a separate worksheet with its own star distribution,
and each **opens with a 1-star tutorial question** — so every level is authored as if the
player has never seen a pickaxe maze before.

What the levels are actually indexed on is *puzzle complexity*, which the docs define
precisely (grid size, pickaxe count, wall floors — `difficulty_setting.md`). What they are
**not** indexed on anywhere in the repo is reader age or school grade; the names imply it
and nothing states it. See §7.

Two audience facts are load-bearing and *are* settled, because the medium settles them:

- **The player is working on paper, with a pencil.** No undo, no validation, no hint.
  A wrong committed route means a crossed-out page. This is why §3's "plan before you
  commit" framing is the point rather than a nice-to-have — the format enforces it.
- **The instructions must work without a teacher present.** The cover is the only
  teaching surface in the document (§5).

## 3. What the player is doing, and why

**The loop.** Look at the grid. Count the pickaxes. Find the one route that reaches the
goal, never re-crosses itself, and spends every pickaxe on the way.

**The skill.** Committing a scarce resource under a constraint you can only satisfy
exactly — which forces the player to look ahead down a branch and reject it *before*
spending anything, rather than trying moves and backing out.

That framing is not new here; it is `difficulty_setting.md`'s own stated design intent,
made explicit:

> More walls combined with a limited pickaxe count means more branching decisions
> (dead-ends/traps) that force the player to think ahead before committing to breaking a
> wall.

Three of `rules.md`'s rules exist to protect that skill, and reading them as a set makes
the design legible (this mapping is an inference — the rules predate this doc):

| Rule | What it rules out | Why the skill needs it |
|---|---|---|
| §4 no revisiting a cell | Wandering, and backing out of a mistake | The route has to be *chosen*, not searched by trial |
| §5 arrive with **exactly 0** pickaxes | Hoarding, and "spend one if stuck" | Turns wall-breaking from a fallback into a budget to allocate |
| §6 exactly one solution | A guessable puzzle | The player can trust that a found route is *the* route, so reasoning beats luck |

The §5 rule is the one that does the most work and the one most likely to look like an
arbitrary flourish. It isn't: without it a maze has a lazy solution (take the free
corridor, break nothing) and a player who never engages with the pickaxes at all. Having
to end at zero makes every pickaxe a wall the player must *find a use for*, which is a
harder and more interesting search than avoiding walls.

## 4. What makes a good pickaxe maze

Notes for whoever authors or tunes questions. These are editorial, derived from the rules
and the difficulty template rather than owner-stated.

- **A tempting wrong branch beats a dense wall count.** Difficulty comes from plausible
  routes that fail late — run out of pickaxes one wall early, or strand themselves by
  §4 — not from a busier grid. `difficulty_setting.md` treats wall counts as *floors the
  generator escalates past* until a unique solution exists, precisely because the count
  is a means, not the goal.
- **The 1-star tutorial's job is to be solvable at a glance**, so the player learns the
  exactly-zero rule from a puzzle they cannot fail. `difficulty_setting.md` fixes it at
  3×3 / 1 pickaxe for every level.
- **The pickaxe count is the difficulty dial that reads fastest to a player.** Grid size
  scales the search; pickaxe count scales the number of simultaneous commitments. Note
  that they are ramped together in the template, and 1 pickaxe survives up to 3 stars.
- **Uniqueness is not optional polish.** It is the property the answer key depends on and
  the reason the puzzle is fair. Never hand-author a question without running the real
  validator (`pickaxe-maze validate`) over it — the cover's own fixtures carry their
  validator verdicts in comments for exactly this reason.

## 5. What the cover has to teach (feeds A9)

The cover has one instruction sentence, one worked correct example, and one crossed-out
counter-example (`PRODUCTION_PROCESS.md` §3, "A9's four parts"). That is enough room for
**one** idea, so the choice matters.

The idea it teaches is: **break walls with a pickaxe to reach the goal, and you only have
so many.** The counter-example is a route that *does* reach the goal but needs two
pickaxes when one was given — i.e. it illustrates the pickaxe budget, not the no-revisit
rule and not the grid mechanics.

That is a deliberate ranking of §3's three rules by how likely a first-time player is to
break them, and the shipped fixture in `coverTutorial.ts` matches it. If a future cover
revision has to drop something, drop in this order: the no-revisit rule (a pencil route
rarely wants to cross itself), then uniqueness (invisible to the player, it just makes
the puzzle work), never the budget.

The exactly-zero half of §5's win condition is, as of 2026-08-26, **not** spelled out
anywhere on the cover — it is implied by the correct example spending its single pickaxe.
That is a known tension between §3's claim that the exactly-zero rule does the most work
and the cover teaching the softer "you only have so many". Flagged in §7 rather than
silently fixed, because changing it is a cover redesign and the owner has signed the
cover off.

## 6. Non-goals

Recorded so a later reader doesn't "fix" them:

- **Not a shortest-path maze.** The solution is the unique legal route, which need not be
  the shortest — `rules.md` §6 explicitly treats two routes that break the same walls as
  the same solution, wandering included.
- **Not a resource-*collection* game.** Pickaxes are given up front and only spent
  (`rules.md` §3). There is nothing to pick up on the grid.
- **Not real-time, not scored, not timed.** Star ratings estimate solve effort; they are
  not a score the player earns. Nothing on the page asks for a time.
- **Not diagonal, and not wrap-around.** `rules.md` §1/§2.

## 7. Open questions for the owner

A1 should state these; no artifact in the repo does, so they are deliberately left blank
rather than invented here.

1. **Target age or grade per level.** "Kinder / Primary / Advanced" implies a school
   banding, but every documented difference between the levels is puzzle complexity. If
   there is an intended age band, it belongs in §2 — it is what a designer would need to
   judge whether a cover reads as too wordy.
2. **Does the cover need to state the exactly-zero rule explicitly?** See §5. Today it is
   only implied. Answering "no" is a fine answer; it should just be recorded as a choice.
3. **How much of the mining fiction is canon?** §1 describes walls as rock because the
   pickaxe implies it, but no artifact says whether this maze type has a setting, a
   character, or a name beyond "Pickaxe Maze" — which would matter to A10's closing page
   if a future level gets art of its own.

# Working agreements for this repo

## Git: branch and PR, never commit straight to `main`

**Set by the project owner on 2026-08-26.** Every change — code, docs, a one-line spec
fix — goes onto a branch, gets pushed, and lands through a pull request. Do not commit to
`main` and do not push to `main` directly, even when the working tree is clean and the
change is small and the owner asked for a commit.

```
git switch -c <short-kebab-branch>     # before the first commit, not after
# ... commits ...
git push -u origin <branch>
gh pr create                            # then hand the owner the PR URL
```

The reference example is PR #1 (`remove-locked-cover-row`): branch → commits →
code-review pass → PR → merge.

**Why:** the owner reviews changes on the PR, and a change already sitting on `main` can
only be reviewed after the fact. Undoing a direct push means force-pushing a published
branch, which is worse than the convenience it bought. Two commits went straight to
`main` on 2026-08-26 (`441b02c`, `431e729`); the owner chose to leave them rather than
rewrite history, and asked that this be the standing rule from then on.

Commit messages: imperative subject, no prefix tag, a body that explains *why* and
records decisions worth not re-litigating. `git log` has the house style — match it.

## Before you start: read the process, don't re-derive it

[`PRODUCTION_PROCESS.md`](PRODUCTION_PROCESS.md) is canonical for *what order work
happens in*. Every other spec covers one stage of it. It is not the same list as
`Web App/docs/development_plan.md` §9, which is the web app's build roadmap — the two
axes are independent.

## Verifying frontend changes

`npx tsc --noEmit` in `Web App/frontend` typechecks **zero files** — it proves nothing.
Use `npm run build` (which runs `tsc -b`), plus `npx oxlint src`. From the repo root,
`pytest -q` covers the generator/validator and the backend.

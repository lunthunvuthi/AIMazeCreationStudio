# Authentication — spec and setup (roadmap step 7a)

Covers [`development_plan.md`](development_plan.md) §9 step **7a**: Google sign-in through
Auth0, a `users` table with roles, CORS tightened from `allow_origins=["*"]`, and the
pdf-service render endpoint authenticated.

It is the only doc in the repo that assumes **no prior Auth0 knowledge**. §3 is a
click-by-click walkthrough; the rest is the design and the reasoning behind it.

---

## 1. What 7a is, and what it is not

**Is:** identity. The app knows who you are, records it, and refuses to answer API calls
from anyone it does not know.

**Is not:** storage. Worksheets still live in the browser's `localStorage` and in files you
save. Signing in as a different person on the same machine shows you the same sheet.
Per-user sheets are **7b**, and they are the reason 7a exists.

Being clear about that gap matters, because the app after 7a *looks* like a multi-user
service and is not one yet.

---

## 2. Decisions

Taken by the owner on **2026-09-01**, at the start of 7a. Recorded so they are not
re-litigated.

| # | Question | Decision |
|---|---|---|
| 1 | How do automated checks sign in? | **An env-gated development bypass** on all three components. §4. |
| 2 | Is login required, or optional beside local authoring? | **A hard route guard.** Every product screen needs a session. |
| 3 | Where do roles live? | **A `users` table**, added now — not Auth0 `app_metadata`, and not deferred to 7b. §6. |
| 4 | Which database? | Postgres is the deployment target. **The default `DATABASE_URL` is a local SQLite file** so the app runs with nothing installed; the schema and the migration are engine-neutral. |

Two consequences of #2 that were not obvious when it was taken, and are now built in:

- **`/spike/pdf-preview` must stay public.** The pdf-service renders a worksheet by
  pointing its *own* headless Chromium at that route. That browser has no session and
  cannot get one, so a guard there breaks Preview and Download in the real app — not just
  the test harness. §5.
- **The browser-driven checks in `scripts/` are the whole reason the bypass exists.** There
  is no frontend test runner in this repo; every frontend guarantee is verified by driving
  the real app. Google and Auth0's hosted login both block automated sign-in, so a hard
  guard with no bypass would delete `autosave_check.mjs`'s 29 checks — including the only
  automated coverage of Modify Maze — on the day it landed.

---

## 3. Setting up Auth0, step by step

You need three things: a **tenant**, an **application**, and an **API**. Then a **Google
connection** so the sign-in button does something.

Everything below is free — Auth0's free plan covers **25,000 monthly active users**
(verified 2026-09-01), which a school will not approach.

### 3.1 Create the tenant

1. Go to <https://auth0.com/signup> and sign up.
2. It asks for a **tenant name** and a **region**. The tenant name becomes part of your
   permanent domain, e.g. `maze-studio.us.auth0.com`. Pick something you would not mind
   seeing in a URL; it cannot be renamed later.
3. Pick the region closest to the school.

A "tenant" is just your own isolated Auth0 account. One is enough.

### 3.2 Create the application (this is the frontend)

**Dashboard → Applications → Applications → Create Application.**

1. Name it `Maze Studio Web`.
2. Choose **Single Page Web Application**. This matters: it tells Auth0 not to expect a
   client secret, because a browser cannot keep one.
3. Skip the "quickstart" tabs and open **Settings**.
4. Copy **Domain** and **Client ID** — you need both shortly.
5. Scroll to **Application URIs** and fill in three fields. During development they are all
   the Vite dev server. Use `http://localhost:5174` if a stale Vite is holding `:5173`, and
   note you can list several comma-separated:

   | Field | Value |
   |---|---|
   | Allowed Callback URLs | `http://localhost:5173, http://localhost:5174` |
   | Allowed Logout URLs | `http://localhost:5173, http://localhost:5174` |
   | Allowed Web Origins | `http://localhost:5173, http://localhost:5174` |

6. **Save Changes.** Forgetting this step produces a "Callback URL mismatch" error on the
   very first sign-in attempt, which is the single most common Auth0 setup failure.

### 3.3 Create the API (this is the backend)

**Dashboard → Applications → APIs → Create API.**

1. Name it `Maze Studio API`.
2. **Identifier**: `https://api.maze-studio`. This is the **audience**. It is a name, not a
   URL that is ever visited — nothing has to exist at that address. Once set it cannot be
   changed.
3. Signing algorithm: **RS256** (the default). Leave it.

Without an API, Auth0 hands the frontend an opaque token the backend cannot verify. This
step is what makes the token a real JWT.

### 3.4 Turn on Google

**Dashboard → Authentication → Social → Create Connection → Google / Gmail.**

Out of the box this uses Auth0's **development keys** — shared Google credentials that make
login work in about a minute, with no Google Cloud setup at all.

**Use them to see it working today. They must not be shipped.** They are rate-limited,
shared with every other Auth0 tenant using them, show Auth0's name on the consent screen
rather than the school's, and Auth0 disables some features while they are in use.

To replace them with your own, in the **Google Cloud Console**:

1. Create a project.
2. Configure the **OAuth consent screen** (branding, audience, data access).
3. **Credentials → Create credentials → OAuth client ID → Web application.**
4. Fill in, replacing `YOUR_DOMAIN` with your Auth0 domain from §3.2:
   - Authorized JavaScript origin: `https://YOUR_DOMAIN`
   - Authorized redirect URI: `https://YOUR_DOMAIN/login/callback`

   These point at **Auth0**, not at this app. Google talks to Auth0; Auth0 talks to us.
5. Paste the resulting Client ID and Client Secret into the Auth0 Google connection, and
   enable the connection for the `Maze Studio Web` application on its **Applications** tab.

### 3.5 Point the app at your tenant

**Two files.** The frontend is configured separately from the two server-side
components, because Vite only exposes variables prefixed `VITE_` and only reads files
inside its own project.

**1 — the servers.** Copy [`.env.example`](../../.env.example) at the **repository root**
to `.env` and fill in two values:

```bash
cp .env.example .env
```

```bash
AUTH0_DOMAIN=maze-studio.us.auth0.com
AUTH0_AUDIENCE=https://api.maze-studio
BOOTSTRAP_ADMIN_EMAIL=you@yourschool.example   # §6
```

One file, read by **both** the backend and the pdf-service. They need the same two
values, and a mismatch between them produces a 401 with no useful message — designed out
rather than documented. A real exported environment variable still beats the file, so a
deployment that sets them properly ignores whatever is on disk.

**2 — the frontend.** Copy [`Web App/frontend/.env.example`](../frontend/.env.example) to
`.env.local` in the same folder:

```bash
VITE_AUTH0_DOMAIN=maze-studio.us.auth0.com
VITE_AUTH0_CLIENT_ID=<Client ID from §3.2>
VITE_AUTH0_AUDIENCE=https://api.maze-studio
```

Both files are git-ignored. Nothing else needs configuring — start the three servers the
way the README already describes.

`AUTH0_AUDIENCE` and `VITE_AUTH0_AUDIENCE` must be **byte-identical**. Restart Vite after
editing `.env.local`; it reads env files at startup only.

### 3.6 Check it worked

```bash
curl -s http://localhost:8000/api/health
```

- `"authBypass": true` → the servers still see no Auth0 config. Check `.env` is at the
  **repository root**, not inside `Web App/backend/`.
- `"authBypass": false` → real verification is on. The pdf-service says the same thing in
  its startup line. Open the app; you should be redirected to Auth0's hosted login.

### 3.7 When sign-in fails: reading the error

Auth0's failures are specific if you look at the `error_description` in the URL you land
on. The three that actually happen:

| What you see | What it means | Fix |
|---|---|---|
| `Callback URL mismatch` | The address the app redirected from is not in the application's allowed list. | §3.2 step 5 — and press **Save Changes**. |
| `Service not found: <your audience>` | No API with that identifier exists in this tenant. | §3.3. Check for a typo; the identifier is not editable after creation. |
| `Client "..." is not authorized to access resource server "..."` | The API exists, but Auth0 is enforcing a client grant for this application — which it does **not** do for a first-party Single Page Application. | Check **Applications → your app → Settings → Application Type** is *Single Page Application*; fix it and save if not. If it already is, create a fresh application per §3.2 and swap the new Client ID into `.env.local`. **Do not go looking for the API's *Machine to Machine Applications* tab** — that tab is for machine-to-machine clients and will not list a SPA. |

You can test all of this from a terminal without touching the app. A request with no
`audience` isolates the application and callback URL from the API:

```bash
D=<your-auth0-domain>; C=<your-client-id>; RU=http://localhost:5174
curl -s -o /dev/null -w '%{redirect_url}\n' \
  "https://$D/authorize?response_type=code&client_id=$C&redirect_uri=$RU&scope=openid&state=probe"
```

A redirect to `https://$D/u/login?...` means the tenant, the client id and the callback
URL are all correct. Add `&audience=<your-api-identifier>` and run it again to test the
API separately. Whatever comes back in `error_description` is the row to look up above.

## 4. The development bypass

**The problem.** Every frontend guarantee in this repo is verified by driving the real app
in a browser, because there is no frontend test runner
(`scripts/autosave_check.mjs`, `scripts/phase_b_run.mjs`). Google and Auth0's hosted login
are designed to defeat exactly that kind of automation.

**The answer chosen.** One fixed, non-secret token string — `dev-bypass-token` — accepted
as a valid login by a server that has already announced it is unauthenticated.

Alternatives rejected on 2026-09-01: an Auth0 Resource Owner Password Grant test user
(needs a grant type Auth0 discourages, a second connection, and a client secret in the
script environment), and a backend-issued `/api/auth/dev-login` endpoint (a genuine
auth-bypass route that must be provably disabled in production).

**When it is on.** Identical rules in all three components:

| State | Behaviour |
|---|---|
| Auth0 configured, `APP_ENV` not `production` | Real verification. Set `DEV_AUTH_BYPASS=1` / `VITE_AUTH_BYPASS=1` to force the bypass back on for a harness run. |
| Auth0 **not** configured, not production | **Bypass**, with a warning in the startup log and an amber strip in the UI. This is the repo's default state, and it is what keeps `main` runnable before a tenant exists. |
| `APP_ENV=production` | The bypass is **unreachable**, whatever the flags say. Missing Auth0 config is a startup error, not a downgrade. |

That last row is the one that matters, and it is tested
([`test_auth.py`](../backend/tests/test_auth.py)): production ignores `DEV_AUTH_BYPASS`,
refuses to start without Auth0, and refuses to start without an explicit CORS origin list.

**Why the bypass is not a backdoor.** It is only accepted by a server whose `/api/health`
says `"authBypass": true` and whose startup log carries a 72-character banner saying so.
There is no configuration in which a production build accepts it. Treating the string as a
secret would be the misunderstanding — it is a marker, not a credential.

**The frontend uses the same code paths either way.** The bypass swaps the provider behind
`useAuth()`, so the route guard, the user menu and the API layer are all exercised by the
harness exactly as a real login exercises them. Only the token's origin differs.

---

## 5. What stays public, and why

| Route | Why |
|---|---|
| `POST`-less `GET /api/health` | Liveness. A deployment must be able to tell a running server from a dead one without a token. Reports whether the bypass is on, which is worth being checkable from outside the log. |
| `/login` | A guard that redirected to itself would loop. |
| `/spike/pdf-preview` | **Load-bearing.** `pdf-service/render.js` renders a worksheet by driving its own headless Chromium at this route. That browser has no session. The page holds no user data and makes no API calls — it renders only the payload injected into that one browser instance through `window.__PDF_FIXTURE_DATA__`, falling back to a hardcoded sample. |

The distinction to hold onto: the preview **route** is public, the render **endpoint** is
not. `POST /api/pdf/render` requires a token — `collaboration_workflow_spec.md` §7 calls it
the most expensive unauthenticated endpoint in the system, and it was right, since one
anonymous POST launches a browser and renders a full A4 document.

---

## 6. Users and roles

One table, `users` ([`maze_api/models.py`](../backend/maze_api/models.py)):

```
id  auth0_sub(unique)  email  name  picture  role  created_at  last_seen_at
```

- **`auth0_sub` is the identity**, not email. A school's IT department can reassign an
  email address; Auth0 lets a user change theirs. The `sub` claim is stable.
- **Signing in is the write.** The current-user dependency upserts on every authenticated
  request, throttling `last_seen_at` to five minutes so an ordinary API call is not a
  database write. That is what answers the owner's actual requirement — *"I want users to
  log into this webapp to track who is using"*.
- **Roles are `teacher` / `head_teacher` / `admin`**, additive, exactly as
  [`collaboration_workflow_spec.md`](collaboration_workflow_spec.md) §2 describes. Stored
  as plain strings rather than a database enum: adding a value to a Postgres enum needs a
  migration SQLite cannot replay identically, and the value set is enforced in Python.
- **Someone has to be able to make the first HeadTeacher.** Until 7f ships an admin screen,
  `BOOTSTRAP_ADMIN_EMAIL` is that mechanism: the named address becomes an `admin` **the
  first time it signs in**. It is applied at creation only, so it cannot silently
  re-promote someone who was later demoted.
- **Role checks live in one place** (`require_role` in
  [`maze_api/auth.py`](../backend/maze_api/auth.py)), not as per-endpoint `if` statements —
  the collaboration spec is explicit that the code making approval mean anything must be
  auditable in a single location.

Endpoints: `GET /api/users/me`, `GET /api/users` (admin), `PATCH /api/users/{id}/role`
(admin; an admin cannot remove their own admin role, which would strand a deployment with
nobody able to assign roles). There is no UI for role assignment in 7a — that is 7f. The
endpoint exists so the column is not inert.

### Migrations

The first migrations this project has ever had, under
[`Web App/backend/migrations/`](../backend/migrations/). Alembic takes its URL and its
metadata from the application itself rather than from `alembic.ini`, so there is one
definition of "the database" and one of "the schema".

In development the app runs `alembic upgrade head` at startup. **In production it does
not** — an operator runs it as a deploy step. A server that migrates itself is convenient
locally and a liability in production, where two instances starting at once race and where
an unintended migration should require a human to have typed it.

```bash
cd "Web App/backend"
python -m alembic upgrade head      # apply
python -m alembic revision --autogenerate -m "..."   # after changing models.py
```

---

## 7. Configuration reference

Everything in the "backend, pdf-service" rows goes in the **repository-root `.env`**; the
`VITE_` rows go in **`Web App/frontend/.env.local`**. Exported shell variables override
both, which is how a deployment should set them.

| Variable | Component | Default | Meaning |
|---|---|---|---|
| `APP_ENV` | backend, pdf-service | `development` | `production` forbids the bypass and requires full config. |
| `AUTH0_DOMAIN` | backend, pdf-service | — | e.g. `maze-studio.us.auth0.com`. |
| `AUTH0_AUDIENCE` | backend, pdf-service | — | The API identifier from §3.3. |
| `DEV_AUTH_BYPASS` | backend, pdf-service | off | Force the bypass on when Auth0 *is* configured. Ignored in production. |
| `DATABASE_URL` | backend | SQLite at `Web App/backend/maze_studio.db` | Point at Postgres for deployment. |
| `BOOTSTRAP_ADMIN_EMAIL` | backend | — | This address becomes an admin on first sign-in. |
| `CORS_ORIGINS` | backend | the Vite dev origins | Comma-separated. **Required** in production. |
| `VITE_AUTH0_DOMAIN` / `VITE_AUTH0_CLIENT_ID` / `VITE_AUTH0_AUDIENCE` | frontend | — | §3.5. Read at Vite startup — restart after editing. `VITE_AUTH0_AUDIENCE` must equal `AUTH0_AUDIENCE`. |
| `VITE_AUTH_BYPASS` | frontend | off | Force the bypass on. Ignored in a production build. |
| `AUTH_TOKEN` | `scripts/phase_b_run.mjs` | `dev-bypass-token` | Send a real access token instead. |

**CORS.** `main.py`'s `allow_origins=["*"]` carried a comment saying it was fine *because*
the API was stateless and unauthenticated. That stopped being true in the commit that
started reading `Authorization` headers, so it went in the same change — the collaboration
spec asked for exactly that, and for the same reason.

---

## 8. Running the checks under a guard

While Auth0 is unconfigured, nothing changes — the bypass is already on and every command
in the README works as before.

Once `.env.local` has a tenant in it, the harness needs the bypass switched back on
explicitly, because a real login cannot be automated:

```bash
# frontend, for a harness run
cd "Web App/frontend" && VITE_AUTH_BYPASS=1 npm run dev

# backend and pdf-service, for a harness run
DEV_AUTH_BYPASS=1 python scripts/run_backend.py
cd "Web App/pdf-service" && DEV_AUTH_BYPASS=1 npm start

node scripts/autosave_check.mjs                # 29 checks
node scripts/phase_b_run.mjs --level primary --route mixed --clean
```

Forget the frontend flag and every `page.goto` lands on `/login`; forget the backend flag
and `phase_b_run.mjs` fails its first `generate` with an explicit 401 message saying so.

Alternatively set `DEV_AUTH_BYPASS=1` once in the root `.env` while you are working on the
harness — it is ignored the moment `APP_ENV=production`, so it cannot follow you into a
deployment. Just remember it is on: `/api/health` will say `"authBypass": true`.

---

## 9. Known tradeoffs and open items

- **Token storage is `localStorage`.** `AuthProvider.tsx` sets
  `cacheLocation="localstorage"` with refresh tokens, so a page reload keeps the session
  without a hidden-iframe silent auth — which browsers increasingly block and which is
  unreliable on `localhost`. The cost is that tokens are reachable by any script injected
  into the page. Auth0's own recommendation once the app is served from a custom domain
  (in-memory cache, first-party refresh) should replace this before deployment.
- **Auth0's development Google keys must be replaced** before anything is deployed. §3.4.
- **Token Vault** is on the free plan (2 vaults; verified 2026-09-01). Nothing in 7a uses
  it — it would matter only for the Drive mirror in roadmap step 10.
- **No audit log yet.** Role changes are not recorded. `collaboration_workflow_spec.md` §7
  wants one for approve/revoke/role-change; it belongs with 7e/7f, when there is something
  to approve.
- **Access tokens carry no profile claims.** Auth0 puts email and name in the *ID* token,
  so `users.email` and `users.name` stay null unless an Auth0 Action copies them into the
  access token under the `https://maze-studio/` namespace, or a `/userinfo` call is added.
  Worth doing in 7b, when the roster screen needs names to display.
- **Logging in as someone else does not change what you see.** Sheets are still local. 7b.

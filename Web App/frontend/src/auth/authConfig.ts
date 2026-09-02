// Where the frontend's Auth0 settings come from, and the one rule that decides
// whether login is real (roadmap step 7a).
//
// The mirror image of Web App/backend/maze_api/config.py, deliberately: if the
// two disagree about whether authentication is on, the symptom is a 401 that
// looks like a bug in the app. Both follow the same three rules.
//
//   1. Configured and running    -> real Auth0.
//   2. Unconfigured, in dev      -> BYPASS. The app still works, with a fake
//                                   local user and a banner saying so. This is
//                                   what keeps `main` usable before anyone has
//                                   created an Auth0 tenant, and what keeps the
//                                   browser-driven checks in scripts/ running.
//   3. Unconfigured, in a build  -> hard failure. A production bundle must never
//                                   quietly decide that nobody needs to log in.
//
// VITE_AUTH_BYPASS=1 forces (2) even when Auth0 *is* configured -- that is the
// switch `scripts/autosave_check.mjs` and `scripts/phase_b_run.mjs` need once
// the owner's tenant exists. It is ignored in a production build.

const domain = (import.meta.env.VITE_AUTH0_DOMAIN ?? '').trim()
const clientId = (import.meta.env.VITE_AUTH0_CLIENT_ID ?? '').trim()
const audience = (import.meta.env.VITE_AUTH0_AUDIENCE ?? '').trim()

const bypassRequested = ['1', 'true', 'yes', 'on'].includes(
  (import.meta.env.VITE_AUTH_BYPASS ?? '').trim().toLowerCase(),
)

export const auth0Configured = Boolean(domain && clientId && audience)

export const authBypass = import.meta.env.PROD ? false : bypassRequested || !auth0Configured

// The single fixed token the backend and the pdf-service accept while their own
// bypass is on. Must stay in step with maze_api/config.py's DEV_BYPASS_TOKEN.
// Not a secret: it only works against a server that has already announced, in
// its startup log and on /api/health, that it is unauthenticated.
export const DEV_BYPASS_TOKEN = 'dev-bypass-token'

export const auth0Config = { domain, clientId, audience }

/** Non-null when the app cannot legitimately start; rendered instead of the app. */
export const authConfigError: string | null =
  !auth0Configured && !authBypass
    ? 'This build has no Auth0 configuration. Set VITE_AUTH0_DOMAIN, VITE_AUTH0_CLIENT_ID and ' +
      'VITE_AUTH0_AUDIENCE before building for deployment — see Web App/docs/auth_spec.md.'
    : null

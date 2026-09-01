// Bearer-token check for the render endpoint (roadmap step 7a).
//
// `collaboration_workflow_spec.md` §7 calls this "the most expensive
// unauthenticated endpoint in the system", and it is right: one anonymous POST
// launches a real browser context and renders a full A4 worksheet.
//
// The rules here mirror maze_api/config.py and the frontend's authConfig.ts
// exactly, because three components disagreeing about whether auth is on shows
// up as a 401 that looks like an application bug:
//
//   configured                 -> verify a real Auth0 RS256 token via JWKS
//   unconfigured, not prod     -> accept the one fixed DEV_BYPASS_TOKEN
//   unconfigured, APP_ENV=prod -> refuse to start
//
// What this deliberately does NOT do is gate the frontend route the renderer
// visits. This service drives its own headless Chromium at /spike/pdf-preview,
// and that browser has no session; the route stays public and carries no user
// data. See auth_spec.md §5.

import { createRemoteJWKSet, jwtVerify } from 'jose'

// Must stay in step with maze_api/config.py's DEV_BYPASS_TOKEN and the
// frontend's authConfig.ts.
export const DEV_BYPASS_TOKEN = 'dev-bypass-token'

const APP_ENV = (process.env.APP_ENV || 'development').trim().toLowerCase()
const AUTH0_DOMAIN = (process.env.AUTH0_DOMAIN || '').trim()
const AUTH0_AUDIENCE = (process.env.AUTH0_AUDIENCE || '').trim()

const flag = (name) => ['1', 'true', 'yes', 'on'].includes((process.env[name] || '').trim().toLowerCase())

export const isProduction = APP_ENV === 'production'
export const authConfigured = Boolean(AUTH0_DOMAIN && AUTH0_AUDIENCE)
export const authBypass = isProduction ? false : flag('DEV_AUTH_BYPASS') || !authConfigured

if (isProduction && !authConfigured) {
  throw new Error(
    'APP_ENV=production requires AUTH0_DOMAIN and AUTH0_AUDIENCE. ' +
      'Refusing to start an unauthenticated render service.',
  )
}

// createRemoteJWKSet caches the key set and refetches only on key rotation, so
// this is not a network call per request.
const jwks = authConfigured
  ? createRemoteJWKSet(new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`))
  : null

function bearer(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ')
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null
  return token.trim()
}

export function requireAuth() {
  return async (req, res, next) => {
    const token = bearer(req)
    if (!token) {
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'Missing bearer token' })
      return
    }

    if (authBypass && token === DEV_BYPASS_TOKEN) {
      req.user = { sub: 'dev|bypass', viaBypass: true }
      next()
      return
    }

    if (!jwks) {
      res.status(401).json({ error: 'Auth0 is not configured on this service' })
      return
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `https://${AUTH0_DOMAIN}/`,
        audience: AUTH0_AUDIENCE,
      })
      req.user = { sub: payload.sub, viaBypass: false }
      next()
    } catch (err) {
      res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: `Invalid token: ${err.message}` })
    }
  }
}

export function describeAuth() {
  if (authBypass) {
    const reason = authConfigured ? 'DEV_AUTH_BYPASS is set' : 'Auth0 is not configured'
    return `AUTH BYPASS ACTIVE (${reason}) — /api/pdf/render accepts the fixed token '${DEV_BYPASS_TOKEN}'`
  }
  return `Auth0 enabled — /api/pdf/render requires a token for audience ${AUTH0_AUDIENCE}`
}

import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import UserMenu from '../components/UserMenu'
import { useAuth } from './useAuth'

// The route guard. Step 7a's scope decision (owner, 2026-09-01) is a *hard*
// guard: every real screen requires a signed-in user, rather than login being
// decorative alongside local authoring.
//
// Two routes are deliberately outside it, and both exclusions are load-bearing:
//
//   /login              — otherwise the guard would redirect to itself.
//   /spike/pdf-preview  — the pdf-service renders PDFs by pointing its OWN
//                         headless Chromium at that route (pdf-service/render.js).
//                         That browser has no session and cannot get one, so
//                         gating the route would break Preview and Download in
//                         the real app, not just the test harness. The page is
//                         safe to leave open: it renders only the payload
//                         injected into that one browser instance via
//                         window.__PDF_FIXTURE_DATA__, holds no user data and
//                         makes no API calls. The /api/pdf/render *endpoint*
//                         that drives it is authenticated — see auth_spec.md §5.

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Checking your sign-in…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  // The chrome lives here rather than in each page so that every guarded
  // screen carries the signed-in identity and, in bypass mode, the warning that
  // this session is not a real one.
  return (
    <>
      <header className="border-b border-slate-200 bg-white px-6 py-2">
        <UserMenu />
      </header>
      {children}
    </>
  )
}

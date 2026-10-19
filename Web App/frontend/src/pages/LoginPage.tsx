import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

// The sign-in screen (roadmap step 7a). Deliberately the only screen in the app
// that renders without a session — RequireAuth sends everyone here.
//
// There is one button, because there is one connection: Google, through Auth0.
// Auth0's own hosted page is what actually collects the credentials; this page
// exists so a signed-out visitor lands somewhere that explains itself rather
// than being bounced straight out to a login form they did not ask for.

interface FromState {
  from?: string
}

export default function LoginPage() {
  const { isLoading, isAuthenticated, bypass, error, login } = useAuth()
  const location = useLocation()
  const from = (location.state as FromState | null)?.from ?? '/'

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
    )
  }

  // Reachable by typing /login while signed in, and — in bypass mode, where
  // there is always a session — by any link to it.
  if (isAuthenticated) return <Navigate to={from} replace />

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold text-slate-900">Maze Studio</h1>
      <p className="mt-2 text-slate-600">Sign in to create and manage worksheets.</p>

      {error && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Sign-in failed: {error.message}
        </p>
      )}

      <button
        type="button"
        onClick={() => login(from)}
        className="mt-8 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-700"
      >
        Sign in with Google
      </button>

      {bypass && (
        <p className="mt-4 text-sm text-amber-700">
          This copy is running without Auth0 configured, so you are already signed in as a local
          development user.
        </p>
      )}
    </main>
  )
}

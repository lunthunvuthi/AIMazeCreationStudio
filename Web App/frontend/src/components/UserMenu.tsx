import { useAuth } from '../auth/useAuth'

// Who am I / sign out, plus the bypass warning (roadmap step 7a).
//
// The amber banner is not decoration. A copy of the app running in bypass mode
// accepts a fixed token as a login, and the only thing distinguishing it on
// screen from a real signed-in session is this strip. Removing it would make an
// unauthenticated app look exactly like an authenticated one.

export default function UserMenu() {
  const { isAuthenticated, user, bypass, logout } = useAuth()

  if (!isAuthenticated) return null

  return (
    <div className="flex items-center justify-end gap-3 text-sm">
      {bypass && (
        <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
          Auth bypass — not signed in for real
        </span>
      )}
      {user?.picture && (
        <img src={user.picture} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
      )}
      <span className="text-slate-600">{user?.name ?? user?.email ?? 'Signed in'}</span>
      {!bypass && (
        <button
          type="button"
          onClick={logout}
          className="rounded-md border border-slate-200 px-3 py-1 text-slate-700 transition hover:bg-slate-50"
        >
          Sign out
        </button>
      )}
    </div>
  )
}

import { createContext } from 'react'

export interface AuthUser {
  name?: string
  email?: string
  picture?: string
}

export interface AuthState {
  /** True while the SDK is restoring a session; the route guard waits on it. */
  isLoading: boolean
  isAuthenticated: boolean
  user: AuthUser | null
  /** True when this is the fake local session, not a real Auth0 one. */
  bypass: boolean
  error: Error | null
  /** Starts the Auth0 redirect. `returnTo` is the path to come back to. */
  login: (returnTo?: string) => void
  logout: () => void
}

// Split from AuthProvider.tsx so the module exports only a context object and
// hot reload keeps working for both files (a file exporting both a component
// and a non-component loses fast refresh).
export const AuthContext = createContext<AuthState | null>(null)

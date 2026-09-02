import { useEffect, useMemo, type ReactNode } from 'react'
import { Auth0Provider, useAuth0 } from '@auth0/auth0-react'
import { useNavigate } from 'react-router-dom'
import { AuthContext, type AuthState } from './authContext'
import { DEV_BYPASS_TOKEN, auth0Config, authBypass } from './authConfig'
import { setAccessTokenGetter } from './tokenStore'

// Two providers behind one context (see authConfig.ts for which one runs):
// the real Auth0 SDK, or a fixed local session for development and for the
// browser-driven checks in scripts/. Everything above this file -- the route
// guard, the user menu, the API layer -- is written against the context and
// cannot tell the difference, which is the point: the bypass exercises the same
// code paths a real login does, instead of skipping past them.

const BYPASS_USER = { name: 'Dev Bypass', email: 'dev-bypass@localhost' }

function BypassProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    setAccessTokenGetter(async () => DEV_BYPASS_TOKEN)
    return () => setAccessTokenGetter(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      isLoading: false,
      isAuthenticated: true,
      user: BYPASS_USER,
      bypass: true,
      error: null,
      login: () => {},
      logout: () => {},
    }),
    [],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function Auth0Bridge({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, user, error, loginWithRedirect, logout, getAccessTokenSilently } =
    useAuth0()

  useEffect(() => {
    setAccessTokenGetter(() => getAccessTokenSilently())
    return () => setAccessTokenGetter(null)
  }, [getAccessTokenSilently])

  const value = useMemo<AuthState>(
    () => ({
      isLoading,
      isAuthenticated,
      user: user ? { name: user.name, email: user.email, picture: user.picture } : null,
      bypass: false,
      error: error ?? null,
      login: (returnTo?: string) =>
        void loginWithRedirect(returnTo ? { appState: { returnTo } } : undefined),
      logout: () => logout({ logoutParams: { returnTo: window.location.origin } }),
    }),
    [isLoading, isAuthenticated, user, error, loginWithRedirect, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function RealAuth0Provider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()

  return (
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        // Without an audience Auth0 returns an opaque token the backend cannot
        // verify. This must equal the API identifier in the Auth0 dashboard and
        // the backend's AUTH0_AUDIENCE.
        audience: auth0Config.audience,
        scope: 'openid profile email',
      }}
      // Tradeoff, taken deliberately and worth revisiting before deployment:
      // localStorage keeps the session across a page reload without depending on
      // third-party cookies in a hidden iframe, which browsers increasingly
      // block and which is unreliable on localhost. The cost is that tokens
      // become reachable by any script that gets injected into the page. Auth0's
      // own recommendation once the app is served from a custom domain --
      // in-memory cache plus first-party refresh -- should replace this then.
      cacheLocation="localstorage"
      useRefreshTokens={true}
      onRedirectCallback={(appState) => {
        // Return the user to the page the guard bounced them from, and strip
        // Auth0's ?code=&state= from the URL bar.
        navigate(appState?.returnTo ?? window.location.pathname, { replace: true })
      }}
    >
      <Auth0Bridge>{children}</Auth0Bridge>
    </Auth0Provider>
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return authBypass ? <BypassProvider>{children}</BypassProvider> : <RealAuth0Provider>{children}</RealAuth0Provider>
}

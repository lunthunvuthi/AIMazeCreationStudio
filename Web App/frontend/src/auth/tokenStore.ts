// A module-level way for the plain-function API layer (api/mazeApi.ts,
// api/pdfApi.ts) to obtain the current access token.
//
// Auth0's SDK only exposes the token through a React hook, but the API modules
// are not components and turning them into hooks would push auth plumbing into
// every call site. Instead AuthProvider registers a getter here once, and the
// API layer awaits it. One writer, set during render of the provider.

type TokenGetter = () => Promise<string | null>

let getter: TokenGetter | null = null

export function setAccessTokenGetter(fn: TokenGetter | null): void {
  getter = fn
}

export async function getAccessToken(): Promise<string | null> {
  if (!getter) return null
  try {
    return await getter()
  } catch {
    // A failed silent refresh is not something the API layer can fix; the
    // request goes out unauthenticated and comes back 401, which the caller
    // already handles.
    return null
  }
}

/** `Authorization` header for a fetch, or `{}` when there is no token yet. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Signed-in state lives in an httpOnly cookie, so the only way for page code
// to know is to ask the server. One cached check per page load.

export type Me = { email: string; is_admin: boolean };

let cache: Promise<Me | null> | null = null;

export function me(): Promise<Me | null> {
  cache ??= fetch("/api/v1/auth/me")
    .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
    .catch(() => null);
  return cache;
}

export function isSignedIn(): Promise<boolean> {
  return me().then((m) => m !== null);
}

export function resetAuthCache(): void {
  cache = null;
}

// Signed-in state lives in an httpOnly cookie, so the only way for page code
// to know is to ask the server. One cached check per page load.

let cache: Promise<boolean> | null = null;

export function isSignedIn(): Promise<boolean> {
  cache ??= fetch("/api/v1/auth/me")
    .then((r) => r.ok)
    .catch(() => false);
  return cache;
}

export function resetAuthCache(): void {
  cache = null;
}

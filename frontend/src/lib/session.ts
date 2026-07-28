// Anonymous learner identity: a client-minted UUID sent as X-Session-Id.
// No account, no personal data — just continuity for saves and path progress.

const KEY = "faithbrains.session.v1";

function makeId(): string {
  // crypto.randomUUID exists only in secure contexts (https/localhost);
  // the beta serves over plain http, so fall back to getRandomValues.
  const c: Crypto | undefined = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function sessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = makeId();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return ""; // storage blocked — features degrade gracefully, nothing crashes
  }
}

const TOKEN_KEY = "faithbrains.token.v1";
const EMAIL_KEY = "faithbrains.email.v1";

export function authToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function authEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function setAuth(token: string | null, email: string | null): void {
  try {
    if (token && email) {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(EMAIL_KEY, email);
    } else {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(EMAIL_KEY);
    }
  } catch {
    // storage blocked: signed-in state simply does not persist
  }
}

export function sessionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const id = sessionId();
  if (id) headers["X-Session-Id"] = id;
  const token = authToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

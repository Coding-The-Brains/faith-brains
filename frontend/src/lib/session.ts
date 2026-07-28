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

// Signed-in state lives in an httpOnly cookie set by the backend; page
// scripts never see the token. The only client-side auth concern is below:
// after sign-out, mint a FRESH anonymous id so nothing saved while signed
// out ever lands in the account's learner.
export function rotateSession(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // storage blocked: nothing persisted anyway
  }
  sessionId(); // eagerly mint the replacement
}

export function sessionHeaders(): Record<string, string> {
  const id = sessionId();
  return id ? { "X-Session-Id": id } : {};
}

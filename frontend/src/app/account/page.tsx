"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isSignedIn, resetAuthCache } from "@/lib/auth";
import { clearLocalSaved } from "@/lib/saved";
import { rotateSession, sessionHeaders } from "@/lib/session";

type Mode = "signin" | "signup" | "forgot";

const INPUT =
  "w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text transition-colors focus:border-primary";
const PRIMARY_BTN =
  "w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-bold text-on-primary transition-opacity disabled:opacity-50";

function Stats() {
  const [stats, setStats] = useState<{ saved: number; studied: number; convos: number } | null>(null);
  useEffect(() => {
    const h = { headers: sessionHeaders() };
    Promise.all([
      fetch("/api/v1/saved", h).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/v1/learn/paths", h).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/v1/conversations", h).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([saved, paths, convos]) =>
        setStats({
          saved: saved.length,
          studied: paths.reduce(
            (n: number, p: { completed_count: number }) => n + p.completed_count,
            0
          ),
          convos: convos.length,
        })
      )
      .catch(() => {});
  }, []);
  if (!stats) return null;
  const tiles = [
    [stats.saved, "saved"],
    [stats.studied, "steps studied"],
    [stats.convos, "conversations"],
  ] as const;
  return (
    <div className="mt-8 grid grid-cols-3 gap-3">
      {tiles.map(([n, label]) => (
        <div key={label} className="rounded-xl border border-border bg-surface px-3 py-4">
          <p className="text-xl font-semibold tracking-tight text-text">{n}</p>
          <p className="mt-0.5 text-[11px] text-muted">{label}</p>
        </div>
      ))}
    </div>
  );
}

function AccountInner() {
  const router = useRouter();
  const resetToken = useSearchParams().get("reset");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setSignedIn(me?.email ?? null))
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  async function post(path: string, body: object): Promise<Response> {
    return fetch(`/api/v1/auth/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...sessionHeaders() },
      body: JSON.stringify(body),
    });
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch {
      setError("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function detailOr(res: Response, fallback: string): Promise<string> {
    const body = await res.json().catch(() => null);
    return body?.detail ?? fallback;
  }

  function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      const res = await post(mode === "signup" ? "register" : "login", { email, password });
      if (!res.ok) {
        setError(await detailOr(res, "Something went wrong. Try again."));
        return;
      }
      const body = await res.json();
      resetAuthCache();
      setSignedIn(body.email);
      setPassword("");
    });
  }

  function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      const res = await post("forgot", { email });
      if (!res.ok && res.status !== 204) {
        setError(await detailOr(res, "Could not send the reset email."));
        return;
      }
      setNotice("If an account exists for that email, a reset link is on its way. It expires in 1 hour.");
    });
  }

  function submitReset(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      const res = await post("reset", { token: resetToken, password });
      if (!res.ok && res.status !== 204) {
        setError(await detailOr(res, "Could not reset the password."));
        return;
      }
      setPassword("");
      setNotice("Password updated. Sign in with your new password.");
      router.replace("/account");
      setMode("signin");
    });
  }

  async function signOut(everywhere: boolean) {
    try {
      await fetch(`/api/v1/auth/${everywhere ? "logout-all" : "logout"}`, { method: "POST" });
    } catch {
      // cookie may survive a network blip; the UI still resets below
    }
    rotateSession();
    clearLocalSaved();
    resetAuthCache();
    setSignedIn(null);
  }

  if (!checked) return null;

  if (signedIn) {
    return (
      <div className="mx-auto max-w-sm pt-10 text-center">
        <p className="eyebrow">Account</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text">{signedIn}</h1>
        <p className="mt-3 text-sm text-muted">
          Your saves, progress, and conversations follow this account on any device.
        </p>
        <Stats />
        <button
          type="button"
          onClick={() => signOut(false)}
          className="mt-8 cursor-pointer rounded-full border border-border px-5 py-2 text-sm text-muted transition-colors hover:border-primary hover:text-text"
        >
          Sign out
        </button>
        <button
          type="button"
          onClick={() => signOut(true)}
          className="mx-auto mt-4 block cursor-pointer text-xs text-muted hover:text-error"
        >
          Sign out on all devices
        </button>
      </div>
    );
  }

  if (resetToken) {
    return (
      <div className="mx-auto max-w-sm pt-10">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-text">
          Choose a new password
        </h1>
        <form onSubmit={submitReset} className="mt-8 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">New password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
          </label>
          {error && <p className="text-sm text-error">{error}</p>}
          {notice && <p className="text-sm text-accent">{notice}</p>}
          <button type="submit" disabled={busy} className={PRIMARY_BTN}>
            {busy ? "One moment…" : "Set new password"}
          </button>
        </form>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className="mx-auto max-w-sm pt-10">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-text">
          Reset your password
        </h1>
        <p className="mt-2 text-center text-sm text-muted">
          Enter your email and we&apos;ll send a reset link.
        </p>
        <form onSubmit={submitForgot} className="mt-8 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT}
            />
          </label>
          {error && <p className="text-sm text-error">{error}</p>}
          {notice && <p className="text-sm text-accent">{notice}</p>}
          <button type="submit" disabled={busy} className={PRIMARY_BTN}>
            {busy ? "One moment…" : "Send reset link"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode("signin")}
          className="mx-auto mt-5 block cursor-pointer text-xs text-accent hover:underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm pt-10">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-text">
        {mode === "signup" ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-2 text-center text-sm text-muted">
        Keep your saves and progress on every device.
      </p>

      <form onSubmit={submitAuth} className="mt-8 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
          />
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        {notice && <p className="text-sm text-accent">{notice}</p>}
        <button type="submit" disabled={busy} className={PRIMARY_BTN}>
          {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="mt-5 space-y-2 text-center">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
          }}
          className="cursor-pointer text-xs text-accent hover:underline"
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
        {mode === "signin" && (
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setError(null);
            }}
            className="mx-auto block cursor-pointer text-xs text-muted hover:text-text"
          >
            Forgot password?
          </button>
        )}
      </div>
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={null}>
      <AccountInner />
    </Suspense>
  );
}

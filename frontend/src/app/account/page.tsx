"use client";

import { useEffect, useState } from "react";
import { resetAuthCache } from "@/lib/auth";
import { clearLocalSaved } from "@/lib/saved";
import { rotateSession, sessionHeaders } from "@/lib/session";

type Mode = "signin" | "signup";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // The token is an httpOnly cookie, so ask the server who we are
    fetch("/api/v1/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setSignedIn(me?.email ?? null))
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/auth/${mode === "signup" ? "register" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.detail ?? "Something went wrong. Try again.");
        return;
      }
      resetAuthCache();
      setSignedIn(body.email);
      setPassword("");
    } catch {
      setError("Could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut(everywhere: boolean) {
    try {
      await fetch(`/api/v1/auth/${everywhere ? "logout-all" : "logout"}`, { method: "POST" });
    } catch {
      // cookie may survive a network blip; the UI still resets below
    }
    rotateSession(); // fresh anonymous identity so new activity stays out of the account
    clearLocalSaved(); // saved display cache belongs to the account that just left
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

  return (
    <div className="mx-auto max-w-sm pt-10">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-text">
        {mode === "signup" ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-2 text-center text-sm text-muted">
        Keep your saves and progress on every device.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text transition-colors focus:border-primary"
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
            className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text transition-colors focus:border-primary"
          />
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full cursor-pointer rounded-full bg-primary py-2.5 text-sm font-bold text-on-primary transition-opacity disabled:opacity-50"
        >
          {busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setError(null);
        }}
        className="mx-auto mt-5 block cursor-pointer text-xs text-accent hover:underline"
      >
        {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>
    </div>
  );
}

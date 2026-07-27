"use client";

import Link from "next/link";
import { useState } from "react";
import { sessionHeaders } from "@/lib/session";

type Suggestion = { path_key: string; title: string; description: string; reason: string };
type Recommend = { source: "ai" | "rules"; suggestions: Suggestion[]; explore_query: string | null };

export default function NextUp() {
  const [rec, setRec] = useState<Recommend | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function ask() {
    setBusy(true);
    setFailed(false);
    try {
      const r = await fetch("/api/v1/learn/recommend", { headers: sessionHeaders() });
      if (!r.ok) throw new Error();
      setRec(await r.json());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (rec === null) {
    return (
      <div className="mb-8">
        <button
          type="button"
          onClick={ask}
          disabled={busy}
          className="rounded-full border border-primary/50 px-5 py-2 text-sm font-bold text-accent transition-colors hover:border-primary hover:text-text disabled:opacity-50"
        >
          {busy ? "Thinking…" : "What should I study next?"}
        </button>
        {failed && (
          <p className="mt-2 text-xs text-muted">Couldn&apos;t fetch suggestions. Try again.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-lg border border-primary/30 bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold tracking-tight text-xl text-text">Next up for you</h2>
        <span className="text-[10px] uppercase tracking-wide text-muted/60">
          {rec.source === "ai" ? "based on your questions" : "based on your level"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {rec.suggestions.map((s) => (
          <Link
            key={s.path_key}
            href={`/learn/${s.path_key}`}
            className="block rounded-lg border border-border bg-bg p-4 transition-colors hover:border-primary/50"
          >
            <h3 className="font-semibold tracking-tight text-base text-text">{s.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-accent">{s.reason}</p>
          </Link>
        ))}
      </div>
      {rec.explore_query && (
        <p className="mt-3 text-xs text-muted">
          Beyond the paths:{" "}
          <Link
            href={`/search?q=${encodeURIComponent(rec.explore_query)}`}
            className="text-accent underline underline-offset-2 hover:text-link"
          >
            explore &ldquo;{rec.explore_query}&rdquo;
          </Link>
        </p>
      )}
    </div>
  );
}

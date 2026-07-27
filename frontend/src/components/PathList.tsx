"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Persona } from "@/lib/api";
import { loadPersona } from "@/lib/persona";
import { sessionHeaders } from "@/lib/session";

type PathSummary = {
  key: string;
  title: string;
  description: string;
  step_count: number;
  completed_count: number;
};

export default function PathList() {
  const [paths, setPaths] = useState<PathSummary[] | null>(null);
  const [recommended, setRecommended] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/v1/learn/paths", { headers: sessionHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then(setPaths)
      .catch(() => setPaths([]));

    const persona = loadPersona();
    if (persona) {
      fetch("/api/v1/personas")
        .then((r) => (r.ok ? r.json() : []))
        .then((personas: Persona[]) => {
          const active = personas.find((p) => p.key === persona);
          if (active) setRecommended(new Set(active.recommended_paths));
        })
        .catch(() => {});
    }
  }, []);

  if (paths === null) {
    return <p className="text-sm text-muted">Loading paths…</p>;
  }
  if (paths.length === 0) return null;

  // Progress-aware ordering: paths you're mid-way through first (continue!), then
  // persona-recommended unstarted ones, then the rest; fully-completed sink last.
  // Original order preserved within each group.
  const rank = (p: PathSummary) => {
    const donePct = p.step_count ? p.completed_count / p.step_count : 0;
    if (donePct > 0 && donePct < 1) return 0; // in progress
    if (donePct === 0 && recommended.has(p.key)) return 1; // recommended, unstarted
    if (donePct === 0) return 2; // unstarted
    return 3; // completed
  };
  const ordered = [...paths].sort((a, b) => rank(a) - rank(b));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ordered.map((p) => {
        const pct = p.step_count ? Math.round((p.completed_count / p.step_count) * 100) : 0;
        return (
          <Link
            key={p.key}
            href={`/learn/${p.key}`}
            className="block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-primary/50 hover:bg-elevated"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold tracking-tight text-lg text-text">{p.title}</h3>
              {p.completed_count > 0 && p.completed_count < p.step_count ? (
                <span className="mt-1 shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold tracking-wide text-on-primary">
                  Continue
                </span>
              ) : p.completed_count === p.step_count && p.step_count > 0 ? (
                <span className="mt-1 shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] tracking-wide text-muted/70">
                  ✓ Completed
                </span>
              ) : recommended.has(p.key) ? (
                <span className="mt-1 shrink-0 rounded-full border border-primary/40 px-2 py-0.5 text-[10px] tracking-wide text-accent">
                  Recommended for you
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{p.description}</p>
            <div className="mt-4">
              <div className="h-1.5 overflow-hidden rounded-full bg-bg">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted/80">
                {p.completed_count}/{p.step_count} studied
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

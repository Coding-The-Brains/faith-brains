"use client";

import { useEffect, useRef } from "react";
import type { Persona } from "@/lib/api";
import type { PersonaKey } from "@/lib/persona";

// Rendered if the API list hasn't arrived (or fails) so the welcome never breaks.
const FALLBACK: Persona[] = [
  {
    key: "learner",
    label: "Learner",
    tagline: "Plain-language answers to your questions, with every source cited.",
    suggested_questions: [],
    recommended_paths: [],
  },
  {
    key: "student",
    label: "Student of knowledge",
    tagline: "Precise, source-linked study with references and gradings.",
    suggested_questions: [],
    recommended_paths: [],
  },
  {
    key: "educator",
    label: "Educator / Imam",
    tagline: "Structured, citable material ready for classes and khutbahs.",
    suggested_questions: [],
    recommended_paths: [],
  },
  {
    key: "new_muslim",
    label: "New Muslim",
    tagline: "A gentle, accurate introduction, one step at a time.",
    suggested_questions: [],
    recommended_paths: [],
  },
];

export default function PersonaOnboarding({
  personas,
  onDone,
}: {
  personas: Persona[];
  onDone: (persona: PersonaKey | null) => void;
}) {
  const list = personas.length === 4 ? personas : FALLBACK;
  const firstRef = useRef<HTMLButtonElement>(null);

  // Real dialog behavior: focus moves in, Escape dismisses (same as Skip)
  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-lift sm:p-8"
      >
        <div className="text-center">
          <p lang="ar" className="text-2xl text-accent/90">
            السَّلَامُ عَلَيْكُمْ
          </p>
          <h2 id="onboarding-title" className="font-semibold tracking-tight mt-3 text-2xl text-text">
            Welcome to FaithBrains
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            A study companion grounded in the Quran and authentic hadith, with every answer
            cited. Choose how you&apos;d like to learn:
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {list.map((p, i) => (
            <button
              key={p.key}
              ref={i === 0 ? firstRef : undefined}
              type="button"
              onClick={() => onDone(p.key as PersonaKey)}
              className="cursor-pointer rounded-lg border border-border bg-bg/40 p-4 text-left transition-colors hover:border-primary/60 hover:bg-elevated"
            >
              <span className="font-semibold tracking-tight block text-base text-text">{p.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">{p.tagline}</span>
            </button>
          ))}
        </div>
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => onDone(null)}
            className="cursor-pointer text-xs text-muted underline decoration-border underline-offset-4 hover:text-accent"
          >
            Skip for now. You can choose any time.
          </button>
        </div>
      </div>
    </div>
  );
}

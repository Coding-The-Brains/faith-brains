"use client";

import { useState } from "react";

type Word = { position: number; arabic: string; translation: string; transliteration: string };

// Word-by-word gloss: RTL grid of word chips, Arabic over meaning.
// Tapping a chip reveals its transliteration.
export default function WordByWord({ surah, ayah }: { surah: number; ayah: number }) {
  const [open, setOpen] = useState(false);
  const [words, setWords] = useState<Word[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<number | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && words === null && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/quran/${surah}/${ayah}/words`);
        setWords(res.ok ? (await res.json()).words : []);
      } catch {
        setWords([]);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        className="cursor-pointer text-xs tracking-wide text-muted underline decoration-primary/50 underline-offset-4 hover:text-text"
      >
        {open ? "Hide word by word" : "Word by word"}
      </button>
      {open && (
        <div className="mt-3 border-t border-border pt-3">
          {loading && <p className="text-xs text-muted">Loading words…</p>}
          {words?.length === 0 && (
            <p className="text-xs text-muted">Word data is unavailable for this ayah right now.</p>
          )}
          {words && words.length > 0 && (
            <>
              <div dir="rtl" className="flex flex-wrap gap-2">
                {words.map((w) => (
                  <button
                    key={w.position}
                    type="button"
                    onClick={() => setActive(active === w.position ? null : w.position)}
                    aria-pressed={active === w.position}
                    className={`min-w-16 cursor-pointer rounded-lg border px-2.5 py-2 text-center transition-colors duration-200 ${
                      active === w.position
                        ? "border-primary/60 bg-accent-soft"
                        : "border-border bg-surface hover:border-primary/40"
                    }`}
                  >
                    <span lang="ar" className="block text-lg leading-relaxed text-text">
                      {w.arabic}
                    </span>
                    <span dir="ltr" className="mt-1 block text-[11px] leading-tight text-muted">
                      {w.translation}
                    </span>
                    {active === w.position && w.transliteration && (
                      <span dir="ltr" className="mt-1 block text-[11px] italic leading-tight text-accent">
                        {w.transliteration}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted/70">
                Tap a word for its transliteration · word data: quran.com
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

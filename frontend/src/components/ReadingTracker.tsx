"use client";

import { useEffect } from "react";

export const READING_KEY = "faithbrains.reading.v1";

export type ReadingSpot = { surah: number; name: string; page: number; ts: number };

// Invisible: remembers the last Quran reading spot (device-local) so the home
// page can offer one-tap return.
export default function ReadingTracker({
  surah,
  name,
  page,
}: {
  surah: number;
  name: string;
  page: number;
}) {
  useEffect(() => {
    try {
      const spot: ReadingSpot = { surah, name, page, ts: Date.now() };
      window.localStorage.setItem(READING_KEY, JSON.stringify(spot));
    } catch {
      // storage blocked: no continue-reading card, nothing else breaks
    }
  }, [surah, name, page]);
  return null;
}

export function loadReadingSpot(): ReadingSpot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(READING_KEY);
    return raw ? (JSON.parse(raw) as ReadingSpot) : null;
  } catch {
    return null;
  }
}

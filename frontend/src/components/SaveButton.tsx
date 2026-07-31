"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isSignedIn } from "@/lib/auth";
import { isSaved, toggleSaved, type SavedItem } from "@/lib/saved";

export default function SaveButton({
  item,
  onPaper = false,
}: {
  item: Omit<SavedItem, "savedAt">;
  onPaper?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  // Signed-out taps get an inline nudge instead of being yanked to /account
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setSaved(isSaved(item.id));
    return () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, [item.id]);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={async () => {
          if (!(await isSignedIn())) {
            setHint(true);
            if (hintTimer.current) clearTimeout(hintTimer.current);
            hintTimer.current = setTimeout(() => setHint(false), 5000);
            return;
          }
          setSaved(toggleSaved(item));
        }}
        aria-pressed={saved}
        title={saved ? "Remove from Saved" : "Save"}
        className={`cursor-pointer rounded-full p-1.5 transition-colors ${
          onPaper ? "text-muted hover:text-text" : "text-muted hover:text-text"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
          <path
            d="M6 3.5h12a.5.5 0 0 1 .5.5v16.2a.3.3 0 0 1-.47.25L12 16.4l-6.03 4.05a.3.3 0 0 1-.47-.25V4a.5.5 0 0 1 .5-.5Z"
            fill={saved ? "var(--color-primary)" : "none"}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <span className="sr-only">{saved ? "Remove from Saved" : "Save"}</span>
      </button>
      {hint && (
        <span
          role="status"
          className="absolute bottom-full right-0 z-20 mb-1.5 w-max rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text shadow-lift"
        >
          <Link href="/account" className="text-accent underline underline-offset-2">
            Sign in
          </Link>{" "}
          to save this
        </span>
      )}
    </span>
  );
}

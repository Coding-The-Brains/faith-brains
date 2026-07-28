"use client";

import { useState } from "react";
import { shareImage } from "@/lib/shareImage";

export default function ShareButton({
  arabic,
  english,
  reference,
}: {
  arabic: string | null;
  english: string | null;
  reference: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      title="Share as image"
      onClick={async () => {
        setBusy(true);
        try {
          await shareImage({ arabic, english, reference });
        } finally {
          setBusy(false);
        }
      }}
      className="cursor-pointer rounded-full p-1.5 text-muted transition-colors hover:text-text disabled:opacity-50"
    >
      {busy ? (
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
          <path d="M16 6l-4-4-4 4M12 2v13" />
        </svg>
      )}
      <span className="sr-only">Share as image</span>
    </button>
  );
}

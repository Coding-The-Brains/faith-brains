"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadSaved, removeSaved, type SavedItem } from "@/lib/saved";

export default function SavedPage() {
  const [items, setItems] = useState<SavedItem[] | null>(null);
  useEffect(() => setItems(loadSaved()), []);

  if (items === null) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-semibold tracking-tight mb-2 text-3xl text-text">Saved</h1>
      <p className="mb-6 text-sm text-muted">
        Kept on this device. {items.length > 0 ? `${items.length} saved.` : ""}
      </p>

      {items.length === 0 && (
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-muted">
          <p>Nothing saved yet.</p>
          <p className="mt-2 text-sm">
            Tap the bookmark on any verse or hadith to save it.{" "}
            <Link href="/quran" className="text-accent underline underline-offset-2">
              Start reading
            </Link>
            .
          </p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <article key={item.id} className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <Link href={item.href} className="text-sm tracking-wide text-accent hover:underline">
                {item.reference}
              </Link>
              <button
                type="button"
                onClick={() => setItems(removeSaved(item.id))}
                className="text-xs text-muted hover:text-text"
              >
                Remove
              </button>
            </div>
            {item.english && (
              <p className="mt-3 leading-relaxed text-text/90">{item.english}</p>
            )}
            {item.arabic && (
              <p lang="ar" className="mt-3 text-right text-xl leading-[2] text-text/85">
                {item.arabic}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

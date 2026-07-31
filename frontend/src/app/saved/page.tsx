"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isSignedIn } from "@/lib/auth";
import { sessionHeaders } from "@/lib/session";
import {
  loadSaved,
  removeSaved,
  serverItemHref,
  serverItemId,
  type SavedItem,
  type ServerSaved,
} from "@/lib/saved";

type Row = Pick<SavedItem, "id" | "reference" | "href"> &
  Partial<Pick<SavedItem, "arabic" | "english">> & { kind: "quran" | "hadith" };

export default function SavedPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    isSignedIn().then(async (ok) => {
      setSignedIn(ok);
      if (!ok) return;
      // The account is the source of truth; the local cache only contributes
      // display text (Arabic + translation) when it has the same item.
      try {
        const res = await fetch("/api/v1/saved", { headers: sessionHeaders() });
        const server: ServerSaved[] = res.ok ? await res.json() : [];
        const local = new Map(loadSaved().map((s) => [s.id, s]));
        setRows(
          server.map((s) => {
            const id = serverItemId(s);
            const cached = local.get(id);
            return {
              id,
              kind: s.kind,
              reference: cached?.reference ?? (s.kind === "quran" ? `Quran ${s.reference}` : s.reference),
              href: cached?.href ?? serverItemHref(s),
              arabic: cached?.arabic ?? null,
              english: cached?.english ?? null,
            };
          })
        );
      } catch {
        setRows([]);
      }
    });
  }, []);

  // Skeleton while auth + the saved list resolve: a blank page reads as broken
  if (signedIn === null || (signedIn && rows === null)) {
    return (
      <div className="mx-auto max-w-3xl" aria-busy="true">
        <div className="h-9 w-40 animate-pulse rounded bg-elevated" />
        <div className="mt-6 space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-sm pt-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Saved</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Sign in to save verses and hadith and see them on any device.
        </p>
        <Link
          href="/account"
          className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-on-primary transition-opacity hover:opacity-90"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (rows === null) return null; // unreachable: skeleton above covers it

  async function remove(row: Row) {
    setRows((r) => (r ?? []).filter((x) => x.id !== row.id));
    removeSaved(row.id); // also issues the server DELETE
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-semibold tracking-tight mb-2 text-3xl text-text">Saved</h1>
      <p className="mb-6 text-sm text-muted">
        Synced to your account. {rows.length > 0 ? `${rows.length} saved.` : ""}
      </p>

      {rows.length === 0 && (
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
        {rows.map((item) => (
          <article key={item.id} className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <Link href={item.href} className="text-sm tracking-wide text-accent hover:underline">
                {item.reference}
              </Link>
              <button
                type="button"
                onClick={() => remove(item)}
                className="cursor-pointer text-xs text-muted hover:text-text"
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

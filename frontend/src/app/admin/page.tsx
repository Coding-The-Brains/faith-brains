"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { me } from "@/lib/auth";

// In-app admin dashboard. Access is the is_admin role on the signed-in account;
// the httpOnly session cookie carries it, so there is no token to paste.

type AskDay = { day: string; count: number; errors: number };

type Stats = {
  verses: number;
  hadiths: number;
  quran_embeddings: number;
  hadith_embeddings: number;
  asks_total: number;
  asks_by_category: Record<string, number>;
  asks_errored: number;
  avg_latency_ms: number | null;
  users: number;
  notes: number;
  asks_by_day: AskDay[];
  new_users_7d: number;
};

type AskLog = {
  id: number;
  created_at: string;
  question: string;
  category: string | null;
  answer: string | null;
  provider: string | null;
  model: string | null;
  latency_ms: number | null;
  status: string;
  error: string | null;
};

type Note = {
  id: number;
  kind: string;
  reference: string;
  body: string;
  created_at: string;
  updated_at: string;
};

type AdminUser = {
  id: number;
  email: string;
  created_at: string;
  is_admin: boolean;
  conversations: number;
  saved: number;
};

type Collection = { key: string; name: string; count: number };

type Hadith = {
  id: number;
  collection_key: string;
  collection_name: string;
  hadith_number: string;
  book_name: string | null;
  text_english: string | null;
  text_arabic: string | null;
  grade: string | null;
};

const TABS = ["Overview", "Notes", "Hadith", "Users"] as const;
type Tab = (typeof TABS)[number];

const CATEGORY_LABEL: Record<string, string> = {
  educational: "Educational",
  fatwa_seeking: "Fatwa-seeking",
  sensitive_crisis: "Crisis",
  out_of_scope: "Out of scope",
  error: "Error",
};

const label = (slug: string | null) => CATEGORY_LABEL[slug ?? "error"] ?? slug ?? "Error";

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted";
const btnCls =
  "cursor-pointer rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-on-primary transition-opacity disabled:opacity-50";
const ghostBtnCls =
  "cursor-pointer rounded-full border border-border px-3.5 py-1.5 text-xs text-muted transition-colors hover:border-primary hover:text-text";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1/admin${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Error ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-elevated ${className}`} aria-hidden="true" />;
}

// --- Overview: the dashboard proper -------------------------------------------

function Kpi({ label: l, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="px-4 py-3">
      <p className="eyebrow">{l}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-text">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function DayChart({ days }: { days: AskDay[] }) {
  const W = 14 * 26;
  const H = 110;
  const max = Math.max(1, ...days.map((d) => d.count));
  const short = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <svg
      viewBox={`0 0 ${W} ${H + 18}`}
      className="w-full"
      role="img"
      aria-label="Questions per day, last 14 days"
    >
      {days.map((d, i) => {
        const h = Math.round((d.count / max) * (H - 8));
        const eh = d.count ? Math.round((d.errors / max) * (H - 8)) : 0;
        const x = i * 26 + 4;
        return (
          <g key={d.day}>
            <title>{`${short(d.day)}: ${d.count} question${d.count === 1 ? "" : "s"}${d.errors ? `, ${d.errors} errored` : ""}`}</title>
            <rect x={x} y={H - Math.max(h, 2)} width={18} height={Math.max(h, 2)} rx={3} fill={d.count ? "var(--primary)" : "var(--border)"} opacity={d.count ? 0.85 : 0.6} />
            {eh > 0 && <rect x={x} y={H - eh} width={18} height={eh} rx={3} fill="var(--error)" opacity={0.9} />}
          </g>
        );
      })}
      {[0, 6, 13].map((i) =>
        days[i] ? (
          <text key={i} x={i * 26 + 13} y={H + 14} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--font-geist-mono)">
            {short(days[i].day)}
          </text>
        ) : null
      )}
    </svg>
  );
}

function BarRow({ name, count, max, tone }: { name: string; count: number; max: number; tone: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-muted">{name}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(3, Math.round((count / Math.max(max, 1)) * 100))}%`, background: tone }} />
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-xs text-text">{count}</span>
    </div>
  );
}

function Coverage({ name, done, total }: { name: string; done: number; total: number }) {
  const pct = Math.round((done / Math.max(total, 1)) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">{name}</span>
        <span className="font-mono text-xs text-text">{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [asks, setAsks] = useState<AskLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/overview").then(setStats).catch((e) => setError(e.message));
    api<{ items: AskLog[] }>("/asks?limit=30")
      .then((d) => setAsks(d.items))
      .catch(() => setAsks([]));
  }, []);

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!stats) {
    return (
      <div aria-busy="true">
        <Skeleton className="h-24" />
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
        <Skeleton className="mt-3 h-40" />
      </div>
    );
  }

  const days = stats.asks_by_day;
  const last7 = days.slice(7).reduce((a, d) => a + d.count, 0);
  const prior7 = days.slice(0, 7).reduce((a, d) => a + d.count, 0);
  const delta = last7 - prior7;
  const catMax = Math.max(...Object.values(stats.asks_by_category), 1);
  const cats = Object.entries(stats.asks_by_category).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      {/* KPI strip: one surface, hairline-divided */}
      <div className="grid grid-cols-2 divide-border rounded-lg border border-border bg-surface sm:grid-cols-5 sm:divide-x">
        <Kpi
          label="Questions · 7d"
          value={String(last7)}
          sub={`${delta >= 0 ? "+" : ""}${delta} vs prior week`}
        />
        <Kpi label="Users" value={String(stats.users)} sub={`+${stats.new_users_7d} this week`} />
        <Kpi
          label="Avg answer"
          value={stats.avg_latency_ms ? `${(stats.avg_latency_ms / 1000).toFixed(1)}s` : "–"}
        />
        <Kpi label="Errors · all time" value={String(stats.asks_errored)} />
        <Kpi label="Notes" value={String(stats.notes)} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-surface p-4 lg:col-span-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-text">Questions per day</h2>
            <span className="eyebrow">14 days</span>
          </div>
          <div className="mt-3">
            <DayChart days={days} />
          </div>
        </div>
        <div className="space-y-3 lg:col-span-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold tracking-tight text-text">By category</h2>
            <div className="mt-3 space-y-2">
              {cats.map(([k, v]) => (
                <BarRow
                  key={k}
                  name={label(k)}
                  count={v}
                  max={catMax}
                  tone={k === "error" ? "var(--error)" : "var(--primary)"}
                />
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-sm font-semibold tracking-tight text-text">Corpus</h2>
            <p className="mt-2 font-mono text-xs text-muted">
              {stats.verses.toLocaleString()} verses · {stats.hadiths.toLocaleString()} hadith
            </p>
            <div className="mt-3 space-y-3">
              <Coverage name="Quran embeddings" done={stats.quran_embeddings} total={stats.verses} />
              <Coverage name="Hadith embeddings" done={stats.hadith_embeddings} total={stats.hadiths} />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight text-text">Recent questions</h2>
          <span className="eyebrow">{stats.asks_total.toLocaleString()} total</span>
        </div>
        <div className="mt-3 divide-y divide-border">
          {asks === null && <Skeleton className="h-24" />}
          {asks?.length === 0 && <p className="py-3 text-sm text-muted">No questions logged yet.</p>}
          {asks?.map((a) => (
            <details key={a.id} className="group py-2.5">
              <summary className="flex cursor-pointer items-baseline gap-3">
                <span
                  className={`w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] ${
                    a.status === "error" ? "text-error" : "text-accent"
                  }`}
                >
                  {label(a.status === "error" ? "error" : a.category)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-text group-open:whitespace-normal">
                  {a.question}
                </span>
                <span className="hidden shrink-0 font-mono text-xs text-muted sm:inline">
                  {a.latency_ms != null ? `${(a.latency_ms / 1000).toFixed(1)}s` : "–"}
                </span>
              </summary>
              <div className="mt-2 pb-1 pl-0 text-sm leading-relaxed text-text/85 sm:pl-27">
                {a.error ? <p className="text-error">{a.error}</p> : <p>{a.answer}</p>}
                <p className="mt-2 text-xs text-muted">
                  {new Date(a.created_at).toLocaleString()} · {a.provider} · {a.model}
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Notes ---------------------------------------------------------------------

function NotesTab() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [kind, setKind] = useState<"quran" | "hadith">("quran");
  const [reference, setReference] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [confirming, setConfirming] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    api<Note[]>("/notes").then(setNotes).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/notes", { method: "POST", body: JSON.stringify({ kind, reference, body }) });
      setReference("");
      setBody("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: number) {
    try {
      await api(`/notes/${id}`, { method: "PATCH", body: JSON.stringify({ body: editText }) });
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: number) {
    setConfirming(null);
    try {
      await api(`/notes/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-muted">
        A note attaches to one verse or hadith and appears wherever it is shown.
      </p>
      <form onSubmit={add} className="mt-4 space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex gap-3">
          <select
            value={kind}
            aria-label="Note target type"
            onChange={(e) => setKind(e.target.value as "quran" | "hadith")}
            className={`${inputCls} w-40`}
          >
            <option value="quran">Quran verse</option>
            <option value="hadith">Hadith</option>
          </select>
          <input
            value={reference}
            aria-label="Reference"
            onChange={(e) => setReference(e.target.value)}
            placeholder={kind === "quran" ? "2:255" : "bukhari 6018"}
            className={inputCls}
            required
          />
        </div>
        <textarea
          value={body}
          aria-label="Note text"
          onChange={(e) => setBody(e.target.value)}
          placeholder="The note"
          rows={3}
          className={inputCls}
          required
        />
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={btnCls}>
            Add note
          </button>
          {error && (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          )}
        </div>
      </form>

      <div className="mt-6 space-y-3" aria-busy={notes === null}>
        {notes === null && (
          <>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </>
        )}
        {notes?.map((n) => (
          <div key={n.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-xs uppercase tracking-[0.15em] text-accent">
                {n.kind === "quran" ? `Quran ${n.reference}` : n.reference}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={ghostBtnCls}
                  onClick={() => {
                    setEditing(editing === n.id ? null : n.id);
                    setEditText(n.body);
                  }}
                >
                  {editing === n.id ? "Cancel" : "Edit"}
                </button>
                {confirming === n.id ? (
                  <button
                    type="button"
                    className="cursor-pointer rounded-full border border-error/60 px-3.5 py-1.5 text-xs font-bold text-error"
                    onClick={() => remove(n.id)}
                  >
                    Delete, sure?
                  </button>
                ) : (
                  <button
                    type="button"
                    className={ghostBtnCls}
                    onClick={() => {
                      setConfirming(n.id);
                      if (confirmTimer.current) clearTimeout(confirmTimer.current);
                      confirmTimer.current = setTimeout(() => setConfirming(null), 4000);
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {editing === n.id ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editText}
                  aria-label="Edit note text"
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditing(null);
                  }}
                  rows={3}
                  className={inputCls}
                />
                <div className="flex gap-2">
                  <button type="button" className={btnCls} onClick={() => saveEdit(n.id)}>
                    Save
                  </button>
                  <button type="button" className={ghostBtnCls} onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-text/85">{n.body}</p>
            )}
          </div>
        ))}
        {notes?.length === 0 && (
          <p className="text-sm text-muted">No notes yet. Add one above to pin guidance to a reference.</p>
        )}
      </div>
    </div>
  );
}

// --- Hadith --------------------------------------------------------------------

const emptyDraft = {
  hadith_number: "",
  book_name: "",
  grade: "",
  text_english: "",
  text_arabic: "",
};

function HadithTab() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collection, setCollection] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Hadith[]>([]);
  const [editing, setEditing] = useState<Hadith | null>(null);
  const [editMsg, setEditMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<Collection[]>("/hadith/collections")
      .then((c) => {
        setCollections(c);
        if (c.length) setCollection(c[0].key);
      })
      .catch(() => {});
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const saved = await api<Hadith>("/hadith", {
        method: "POST",
        body: JSON.stringify({
          collection_key: collection,
          hadith_number: draft.hadith_number,
          text_english: draft.text_english,
          text_arabic: draft.text_arabic || null,
          book_name: draft.book_name || null,
          grade: draft.grade || null,
        }),
      });
      setDraft(emptyDraft);
      setMsg({ kind: "ok", text: `Added ${saved.collection_name} ${saved.hadith_number}.` });
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setEditing(null);
    setEditMsg(null);
    try {
      setResults(await api<Hadith[]>(`/hadith/find?q=${encodeURIComponent(query)}`));
    } catch (err) {
      setEditMsg({ kind: "error", text: (err as Error).message });
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditMsg(null);
    try {
      const saved = await api<Hadith>(`/hadith/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          text_english: editing.text_english,
          text_arabic: editing.text_arabic ?? "",
          book_name: editing.book_name ?? "",
          grade: editing.grade ?? "",
        }),
      });
      setEditing(null);
      setResults((r) => r.map((h) => (h.id === saved.id ? saved : h)));
      setEditMsg({ kind: "ok", text: `Saved ${saved.collection_name} ${saved.hadith_number}.` });
    } catch (err) {
      setEditMsg({ kind: "error", text: (err as Error).message });
    }
  }

  return (
    <div className="max-w-2xl space-y-10">
      <section>
        <h2 className="text-lg font-semibold tracking-tight text-accent">Add a hadith</h2>
        <form onSubmit={add} className="mt-3 space-y-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex gap-3">
            <select
              value={collection}
              aria-label="Collection"
              onChange={(e) => setCollection(e.target.value)}
              className={`${inputCls} w-56`}
            >
              {collections.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              value={draft.hadith_number}
              aria-label="Hadith number"
              onChange={(e) => setDraft({ ...draft, hadith_number: e.target.value })}
              placeholder="Number"
              className={inputCls}
              required
            />
          </div>
          <div className="flex gap-3">
            <input
              value={draft.book_name}
              aria-label="Book name (optional)"
              onChange={(e) => setDraft({ ...draft, book_name: e.target.value })}
              placeholder="Book name (optional)"
              className={inputCls}
            />
            <input
              value={draft.grade}
              aria-label="Grade (optional)"
              onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
              placeholder="Grade (optional)"
              className={inputCls}
            />
          </div>
          <textarea
            value={draft.text_english}
            aria-label="English text"
            onChange={(e) => setDraft({ ...draft, text_english: e.target.value })}
            placeholder="English text"
            rows={4}
            className={inputCls}
            required
          />
          <textarea
            value={draft.text_arabic}
            aria-label="Arabic text (optional)"
            onChange={(e) => setDraft({ ...draft, text_arabic: e.target.value })}
            placeholder="النص العربي (اختياري)"
            rows={3}
            lang="ar"
            className={`${inputCls} text-lg`}
          />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy} className={btnCls}>
              Add hadith
            </button>
            {msg && (
              <p role={msg.kind === "error" ? "alert" : "status"} className={`text-sm ${msg.kind === "ok" ? "text-success" : "text-error"}`}>
                {msg.text}
              </p>
            )}
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-accent">Find and correct</h2>
        <form onSubmit={search} className="mt-3 flex gap-3">
          <input
            value={query}
            aria-label="Find a hadith by number or words"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Number or words from the text"
            className={inputCls}
            required
          />
          <button type="submit" className={btnCls}>
            Find
          </button>
        </form>
        {editMsg && (
          <p role={editMsg.kind === "error" ? "alert" : "status"} className={`mt-2 text-sm ${editMsg.kind === "ok" ? "text-success" : "text-error"}`}>
            {editMsg.text}
          </p>
        )}
        <div className="mt-4 space-y-3">
          {results.map((h) => (
            <div key={h.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-xs uppercase tracking-[0.15em] text-accent">
                  {h.collection_name} {h.hadith_number}
                  {h.grade ? ` · ${h.grade}` : ""}
                </p>
                <button
                  type="button"
                  className={ghostBtnCls}
                  onClick={() => setEditing(editing?.id === h.id ? null : { ...h })}
                >
                  {editing?.id === h.id ? "Cancel" : "Edit"}
                </button>
              </div>
              {editing?.id === h.id ? (
                <form
                  onSubmit={saveEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="mt-3 space-y-3"
                >
                  <textarea
                    value={editing.text_english ?? ""}
                    aria-label="English text"
                    onChange={(e) => setEditing({ ...editing, text_english: e.target.value })}
                    rows={4}
                    className={inputCls}
                  />
                  <textarea
                    value={editing.text_arabic ?? ""}
                    aria-label="Arabic text"
                    onChange={(e) => setEditing({ ...editing, text_arabic: e.target.value })}
                    rows={3}
                    lang="ar"
                    className={`${inputCls} text-lg`}
                  />
                  <div className="flex gap-3">
                    <input
                      value={editing.book_name ?? ""}
                      aria-label="Book name"
                      onChange={(e) => setEditing({ ...editing, book_name: e.target.value })}
                      placeholder="Book name"
                      className={inputCls}
                    />
                    <input
                      value={editing.grade ?? ""}
                      aria-label="Grade"
                      onChange={(e) => setEditing({ ...editing, grade: e.target.value })}
                      placeholder="Grade"
                      className={inputCls}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className={btnCls}>
                      Save
                    </button>
                    <button type="button" className={ghostBtnCls} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-text/85">
                  {h.text_english}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// --- Users ---------------------------------------------------------------------

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminUser[]>("/users").then(setUsers).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (users === null) {
    return (
      <div className="max-w-3xl space-y-2" aria-busy="true">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs tracking-wide text-muted">
            <th className="py-2 pr-4 font-normal">Email</th>
            <th className="py-2 pr-4 font-normal">Joined</th>
            <th className="py-2 pr-4 font-normal">Conversations</th>
            <th className="py-2 pr-4 font-normal">Saved</th>
            <th className="py-2 font-normal">Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-border/60">
              <td className="py-2.5 pr-4 text-text">{u.email}</td>
              <td className="py-2.5 pr-4 text-muted">
                {new Date(u.created_at).toLocaleDateString()}
              </td>
              <td className="py-2.5 pr-4 font-mono text-xs text-muted">{u.conversations}</td>
              <td className="py-2.5 pr-4 font-mono text-xs text-muted">{u.saved}</td>
              <td className="py-2.5 font-mono text-[10px] uppercase tracking-[0.15em] text-accent">
                {u.is_admin ? "Admin" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && <p className="mt-4 text-sm text-muted">No accounts yet.</p>}
    </div>
  );
}

// --- Shell ----------------------------------------------------------------------

export default function AdminPage() {
  const [state, setState] = useState<"loading" | "signedout" | "notadmin" | "ok">("loading");
  const [tab, setTab] = useState<Tab>("Overview");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    me().then((m) => setState(m ? (m.is_admin ? "ok" : "notadmin") : "signedout"));
  }, []);

  if (state === "loading") {
    return (
      <div aria-busy="true">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="mt-6 h-64" />
      </div>
    );
  }

  if (state !== "ok") {
    return (
      <div className="mx-auto max-w-sm pt-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Admin</h1>
        {state === "signedout" ? (
          <>
            <p className="mt-3 text-sm text-muted">This area needs an admin account.</p>
            <Link
              href="/account"
              className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted">
              Your account does not have admin access. If it should, ask the owner to grant it.
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-full border border-border px-5 py-2.5 text-sm text-muted transition-colors hover:border-primary hover:text-text"
            >
              Back to FaithBrains
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Admin</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-text">Dashboard</h1>
      <div
        role="tablist"
        aria-label="Admin sections"
        className="mt-6 flex gap-1 border-b border-border"
        onKeyDown={(e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const i = TABS.indexOf(tab);
          const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
          setTab(next);
          tabRefs.current[TABS.indexOf(next)]?.focus();
        }}
      >
        {TABS.map((t, i) => (
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            className={`cursor-pointer rounded-t-lg px-4 py-2 text-sm transition-colors duration-200 ${
              tab === t
                ? "border-b-2 border-primary font-semibold text-accent"
                : "text-muted hover:text-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="mt-6">
        {tab === "Overview" && <OverviewTab />}
        {tab === "Notes" && <NotesTab />}
        {tab === "Hadith" && <HadithTab />}
        {tab === "Users" && <UsersTab />}
      </div>
    </div>
  );
}

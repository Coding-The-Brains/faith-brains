"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { me } from "@/lib/auth";

// In-app admin panel. Access is the is_admin role on the signed-in account;
// the httpOnly session cookie carries it, so there is no token to paste.

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

const inputCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/60";
const btnCls =
  "cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary transition-opacity disabled:opacity-50";
const ghostBtnCls =
  "cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-primary hover:text-text";

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

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-accent">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function OverviewTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [asks, setAsks] = useState<AskLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/overview").then(setStats).catch((e) => setError(e.message));
    api<{ items: AskLog[] }>("/asks?limit=30")
      .then((d) => setAsks(d.items))
      .catch(() => {});
  }, []);

  if (error) return <p className="text-sm text-error">{error}</p>;
  if (!stats) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Users" value={stats.users.toLocaleString()} />
        <Tile label="Questions asked" value={stats.asks_total.toLocaleString()} />
        <Tile label="Notes" value={stats.notes.toLocaleString()} />
        <Tile
          label="Avg answer time"
          value={stats.avg_latency_ms ? `${(stats.avg_latency_ms / 1000).toFixed(1)}s` : "-"}
        />
        <Tile label="Verses" value={stats.verses.toLocaleString()} />
        <Tile label="Hadith" value={stats.hadiths.toLocaleString()} />
        <Tile
          label="Quran embeddings"
          value={`${Math.round((stats.quran_embeddings / Math.max(stats.verses, 1)) * 100)}%`}
        />
        <Tile label="Errors" value={stats.asks_errored.toLocaleString()} />
      </div>

      <h2 className="mt-10 mb-3 text-lg font-semibold tracking-tight text-accent">
        Recent questions
      </h2>
      <div className="space-y-3">
        {asks.length === 0 && <p className="text-sm text-muted">No questions logged yet.</p>}
        {asks.map((a) => (
          <details key={a.id} className="rounded-lg border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm text-text">
              <span className={a.status === "error" ? "text-error" : "text-accent"}>
                [{a.status === "error" ? "error" : a.category}]
              </span>{" "}
              {a.question}
              <span className="float-right text-xs text-muted">
                {new Date(a.created_at).toLocaleString()}
              </span>
            </summary>
            <div className="mt-3 border-t border-border pt-3 text-sm leading-relaxed text-text/85">
              {a.error ? <p className="text-error">{a.error}</p> : <p>{a.answer}</p>}
              <p className="mt-2 text-xs text-muted">
                {a.provider} · {a.model} ·{" "}
                {a.latency_ms != null ? `${(a.latency_ms / 1000).toFixed(1)}s` : "-"}
              </p>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function NotesTab() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [kind, setKind] = useState<"quran" | "hadith">("quran");
  const [reference, setReference] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(() => {
    api<Note[]>("/notes").then(setNotes).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/notes", {
        method: "POST",
        body: JSON.stringify({ kind, reference, body }),
      });
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
            onChange={(e) => setKind(e.target.value as "quran" | "hadith")}
            className={`${inputCls} w-40`}
          >
            <option value="quran">Quran verse</option>
            <option value="hadith">Hadith</option>
          </select>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={kind === "quran" ? "2:255" : "bukhari 6018"}
            className={inputCls}
            required
          />
        </div>
        <textarea
          value={body}
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
          {error && <p className="text-sm text-error">{error}</p>}
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {notes.map((n) => (
          <div key={n.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-mono text-xs uppercase tracking-wide text-accent">
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
                  Edit
                </button>
                <button type="button" className={ghostBtnCls} onClick={() => remove(n.id)}>
                  Delete
                </button>
              </div>
            </div>
            {editing === n.id ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className={inputCls}
                />
                <button type="button" className={btnCls} onClick={() => saveEdit(n.id)}>
                  Save
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-text/85">{n.body}</p>
            )}
          </div>
        ))}
        {notes.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}
      </div>
    </div>
  );
}

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
              onChange={(e) => setDraft({ ...draft, hadith_number: e.target.value })}
              placeholder="Number"
              className={inputCls}
              required
            />
          </div>
          <div className="flex gap-3">
            <input
              value={draft.book_name}
              onChange={(e) => setDraft({ ...draft, book_name: e.target.value })}
              placeholder="Book name (optional)"
              className={inputCls}
            />
            <input
              value={draft.grade}
              onChange={(e) => setDraft({ ...draft, grade: e.target.value })}
              placeholder="Grade (optional)"
              className={inputCls}
            />
          </div>
          <textarea
            value={draft.text_english}
            onChange={(e) => setDraft({ ...draft, text_english: e.target.value })}
            placeholder="English text"
            rows={4}
            className={inputCls}
            required
          />
          <textarea
            value={draft.text_arabic}
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
              <p className={`text-sm ${msg.kind === "ok" ? "text-success" : "text-error"}`}>
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
          <p className={`mt-2 text-sm ${editMsg.kind === "ok" ? "text-success" : "text-error"}`}>
            {editMsg.text}
          </p>
        )}
        <div className="mt-4 space-y-3">
          {results.map((h) => (
            <div key={h.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-xs uppercase tracking-wide text-accent">
                  {h.collection_name} {h.hadith_number}
                  {h.grade ? ` · ${h.grade}` : ""}
                </p>
                <button
                  type="button"
                  className={ghostBtnCls}
                  onClick={() => setEditing(editing?.id === h.id ? null : { ...h })}
                >
                  Edit
                </button>
              </div>
              {editing?.id === h.id ? (
                <form onSubmit={saveEdit} className="mt-3 space-y-3">
                  <textarea
                    value={editing.text_english ?? ""}
                    onChange={(e) => setEditing({ ...editing, text_english: e.target.value })}
                    rows={4}
                    className={inputCls}
                  />
                  <textarea
                    value={editing.text_arabic ?? ""}
                    onChange={(e) => setEditing({ ...editing, text_arabic: e.target.value })}
                    rows={3}
                    lang="ar"
                    className={`${inputCls} text-lg`}
                  />
                  <div className="flex gap-3">
                    <input
                      value={editing.book_name ?? ""}
                      onChange={(e) => setEditing({ ...editing, book_name: e.target.value })}
                      placeholder="Book name"
                      className={inputCls}
                    />
                    <input
                      value={editing.grade ?? ""}
                      onChange={(e) => setEditing({ ...editing, grade: e.target.value })}
                      placeholder="Grade"
                      className={inputCls}
                    />
                  </div>
                  <button type="submit" className={btnCls}>
                    Save
                  </button>
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

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminUser[]>("/users").then(setUsers).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-error">{error}</p>;

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
              <td className="py-2.5 pr-4 text-muted">{u.conversations}</td>
              <td className="py-2.5 pr-4 text-muted">{u.saved}</td>
              <td className="py-2.5 font-mono text-xs uppercase tracking-wide text-accent">
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

export default function AdminPage() {
  const [state, setState] = useState<"loading" | "denied" | "ok">("loading");
  const [tab, setTab] = useState<Tab>("Overview");

  useEffect(() => {
    me().then((m) => setState(m?.is_admin ? "ok" : "denied"));
  }, []);

  if (state === "loading") return null;

  if (state === "denied") {
    return (
      <div className="mx-auto max-w-sm pt-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-text">Admin</h1>
        <p className="mt-3 text-sm text-muted">This area needs an admin account.</p>
        <Link
          href="/account"
          className="mt-6 inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-on-primary"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-text">Admin</h1>
      <div className="mt-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
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
      <div className="mt-6">
        {tab === "Overview" && <OverviewTab />}
        {tab === "Notes" && <NotesTab />}
        {tab === "Hadith" && <HadithTab />}
        {tab === "Users" && <UsersTab />}
      </div>
    </div>
  );
}

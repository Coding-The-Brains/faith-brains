"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  AskResponse,
  AskStreamEvent,
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  Persona,
  SearchResult,
} from "@/lib/api";
import {
  isOnboarded,
  loadPersona,
  savePersona,
  setOnboarded,
  type PersonaKey,
} from "@/lib/persona";
import { sessionHeaders } from "@/lib/session";
import { gradeTone } from "@/components/HadithCard";
import { isSignedIn } from "@/lib/auth";
import ListenButton from "@/components/ListenButton";
import MicButton from "@/components/MicButton";
import { loadReadingSpot, type ReadingSpot } from "@/components/ReadingTracker";
import PersonaOnboarding from "@/components/PersonaOnboarding";
import Reveal from "@/components/Reveal";

// Fallback suggestions when no persona is chosen or the catalogue is unreachable
const SAMPLES = [
  "What does the Quran say about patience?",
  "How should I treat my parents?",
  "What is the reward for charity?",
  "Which hadith is about intentions?",
];

// "How it works" mock, shown below the composer for people who scroll
function LandingPage() {
  return (
    <div className="mt-16 border-t border-border pt-12 pb-10">
      <section className="pb-4">
        {/* Crafted product mock: a real exchange — question, cited answer, and the
            source receipt beneath it. No photography (design-system rule). */}
        <div className="relative mx-auto w-full max-w-md">
          {/* Rub el Hizb line geometry echoing the logo mark */}
          <svg
            viewBox="0 0 220 220"
            className="pointer-events-none absolute -right-4 -top-20 h-44 w-44 text-border"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            aria-hidden="true"
          >
            <rect x="45" y="45" width="130" height="130" />
            <rect x="45" y="45" width="130" height="130" transform="rotate(45 110 110)" />
            <circle cx="110" cy="110" r="4" fill="var(--primary)" stroke="none" />
          </svg>

          <div className="relative space-y-3">
            {/* the student's question lands */}
            <div className="flex animate-[hero-rise_0.5s_cubic-bezier(0.22,1,0.36,1)_both] justify-end">
              <p className="rounded-2xl rounded-br-sm border border-border bg-elevated px-4 py-2.5 text-sm text-text shadow-soft">
                What does the Quran say about patience?
              </p>
            </div>

            {/* the answer arrives: hairline sweeps in, then the citations pop */}
            <div className="animate-[hero-rise_0.6s_cubic-bezier(0.22,1,0.36,1)_0.35s_both] overflow-hidden rounded-2xl border border-border bg-surface shadow-lift">
              <div className="h-px overflow-hidden">
                <div className="h-full w-full animate-[hero-slide_0.9s_cubic-bezier(0.16,1,0.3,1)_0.5s_both] bg-gradient-to-r from-transparent via-primary to-transparent" />
              </div>
              <div className="p-5">
                <p className="eyebrow">Educational answer</p>
                <p className="mt-3 text-sm leading-relaxed text-text">
                  Believers are told to seek help through patience and prayer
                  <span className="ml-0.5 inline-block animate-[hero-pop_0.35s_cubic-bezier(0.22,1,0.36,1)_1s_both] rounded bg-accent-soft px-1 align-super text-[0.65rem] font-bold text-accent">1</span>,
                  and those who endure are promised a reward without measure
                  <span className="ml-0.5 inline-block animate-[hero-pop_0.35s_cubic-bezier(0.22,1,0.36,1)_1.15s_both] rounded bg-accent-soft px-1 align-super text-[0.65rem] font-bold text-accent">2</span>.
                </p>
              </div>
            </div>

            {/* each citation summons its receipt */}
            <div className="animate-[hero-rise_0.6s_cubic-bezier(0.22,1,0.36,1)_1.15s_both] rounded-2xl border border-border bg-elevated p-5 shadow-lift sm:ml-10">
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-accent">
                  [1] Quran 2:153 · Al-Baqara
                </p>
                <span className="medallion medallion-dark shrink-0 animate-[hero-pop_0.4s_cubic-bezier(0.22,1,0.36,1)_1.5s_both]">١٥٣</span>
              </div>
              <p lang="ar" className="mt-3 animate-[hero-fade_0.5s_cubic-bezier(0.22,1,0.36,1)_1.6s_both] text-right text-xl leading-[2] text-text">
                يَا أَيُّهَا الَّذِينَ آمَنُوا اسْتَعِينُوا بِالصَّبْرِ وَالصَّلَاةِ إِنَّ اللَّهَ مَعَ الصَّابِرِينَ
              </p>
              <p className="mt-2 animate-[hero-fade_0.5s_cubic-bezier(0.22,1,0.36,1)_1.7s_both] text-xs leading-relaxed text-muted">
                “O you who have believed, seek help through patience and prayer. Indeed,
                Allah is with the patient.”
              </p>
              <p className="mt-3 animate-[hero-fade_0.5s_cubic-bezier(0.22,1,0.36,1)_1.8s_both] border-t border-border pt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted">
                [2] Quran 39:10 · Az-Zumar
              </p>
            </div>

          </div>
        </div>
      </section>

      <section className="grid gap-8 border-y border-border py-10 md:grid-cols-3">
        <Reveal>
          <p className="font-semibold tracking-tight text-3xl text-accent">Quran</p>
          <p className="mt-2 leading-relaxed text-muted">Search, read, and save verses.</p>
        </Reveal>
        <Reveal delay={60}>
          <p className="font-semibold tracking-tight text-3xl text-accent">Hadith</p>
          <p className="mt-2 leading-relaxed text-muted">Authentic narrations, clearly referenced.</p>
        </Reveal>
        <Reveal delay={120}>
          <p className="font-semibold tracking-tight text-3xl text-accent">Learning paths</p>
          <p className="mt-2 leading-relaxed text-muted">Core topics at your own pace.</p>
        </Reveal>
      </section>
    </div>
  );
}

const CATEGORY_LABEL: Record<AskResponse["category"], string> = {
  educational: "Educational answer",
  fatwa_seeking: "General teaching, not a ruling",
  sensitive_crisis: "Please seek support",
  out_of_scope: "Outside FaithBrains' scope",
};

type PathSummary = {
  key: string;
  title: string;
  description: string;
  step_count: number;
  completed_count: number;
};

function AnswerBody({ text: raw }: { text: string }) {
  // House style: no em dashes anywhere, including model output and old cached answers
  const text = raw.replace(/\s*—\s*/g, ", ");
  return (
    <div className="space-y-4">
      {text.split(/\n{2,}/).map((para, pi) => (
        <p key={pi} className="leading-relaxed text-text/95">
          {para.split(/(\[\d+\])/g).map((part, i) => {
            const m = /^\[(\d+)\]$/.exec(part);
            if (!m) return <span key={i}>{part}</span>;
            return (
              <span
                key={i}
                className="mx-0.5 rounded bg-primary/15 px-1 align-super text-[0.7em] font-bold text-accent"
              >
                {m[1]}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

function SourceCard({ n, s }: { n: number; s: SearchResult }) {
  const isQuran = s.type === "quran";
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs tracking-wide text-accent">
          [{n}]{" "}
          {isQuran && s.surah && s.ayah ? (
            <Link
              href={`/quran/${s.surah}?page=${Math.ceil(s.ayah / 40)}#a${s.ayah}`}
              className="underline decoration-primary/40 underline-offset-2 hover:text-link"
              title="Open this verse in the Quran reader"
            >
              Quran {s.reference}
              {s.surah_name ? `, ${s.surah_name}` : ""}
            </Link>
          ) : !isQuran && s.collection ? (
            <Link
              href={`/hadith/${s.collection}`}
              className="underline decoration-primary/40 underline-offset-2 hover:text-link"
              title="Open this collection"
            >
              {s.reference}
            </Link>
          ) : isQuran ? (
            `Quran ${s.reference}${s.surah_name ? `, ${s.surah_name}` : ""}`
          ) : (
            s.reference
          )}
        </p>
        {isQuran && s.revelation_place && (
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted/70">
            {s.revelation_place}
          </span>
        )}
        {!isQuran &&
          (s.gradings ?? []).slice(0, 2).map((g, i) => (
            <span
              key={i}
              className={`rounded-full px-2 py-0.5 text-[10px] ${gradeTone(g.grade)}`}
              title={g.name ? `Graded by ${g.name}` : undefined}
            >
              {g.grade}
              {g.name ? ` · ${g.name}` : ""}
            </span>
          ))}
      </div>
      {!isQuran && s.narrator && (
        <p className="mt-1.5 text-[11px] text-muted/70">Narrator: {s.narrator}</p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-text/90">
        {isQuran ? s.translation : s.english}
      </p>
      {isQuran && s.translation_source && (
        <p className="mt-1 text-[11px] text-muted/60">Translation: {s.translation_source}</p>
      )}
      {s.arabic && (
        <p lang="ar" className="mt-2 text-right text-lg leading-[2] text-text/80">
          {s.arabic}
        </p>
      )}
      {!isQuran && s.isnad && (
        <details className="group mt-3 border-t border-border pt-2">
          <summary className="cursor-pointer list-none text-[11px] tracking-wide text-accent hover:text-link">
            <span className="group-open:hidden">Chain of narration (isnad)</span>
            <span className="hidden group-open:inline">Hide chain</span>
          </summary>
          <p lang="ar" className="mt-2 text-right text-sm leading-[2] text-text/70">
            {s.isnad}
          </p>
        </details>
      )}
      {isQuran && s.context && (
        <details className="group mt-3 border-t border-border pt-2">
          <summary className="cursor-pointer list-none text-[11px] tracking-wide text-accent hover:text-link">
            <span className="group-open:hidden">
              Occasion of revelation{s.context_source ? ` · ${s.context_source}` : ""}
            </span>
            <span className="hidden group-open:inline">Hide occasion of revelation</span>
          </summary>
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-text/70">
            {s.context}
          </p>
        </details>
      )}
      {isQuran && s.tafsir && (
        <details className="group mt-3 border-t border-border pt-2">
          <summary className="cursor-pointer list-none text-[11px] tracking-wide text-accent hover:text-link">
            <span className="group-open:hidden">
              Tafsir{s.tafsir_source ? ` · ${s.tafsir_source}` : ""}
            </span>
            <span className="hidden group-open:inline">Hide tafsir</span>
          </summary>
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-text/70">
            {s.tafsir}
          </p>
        </details>
      )}
    </div>
  );
}

function ThinkingLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/25 bg-surface/50 px-4 py-3.5">
      {/* pulsing primary mark — radar-style ping */}
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/30" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-accent">{label}</p>
        <div className="mt-2 space-y-1.5" aria-hidden="true">
          <div className="h-2.5 w-11/12 animate-pulse rounded bg-muted/15" />
          <div className="h-2.5 w-3/4 animate-pulse rounded bg-muted/15 [animation-delay:200ms]" />
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ msg }: { msg: ChatMessage }) {
  const sources = msg.sources ?? [];
  if (!msg.content) {
    const label = sources.length
      ? `Reflecting on ${sources.length} source${sources.length === 1 ? "" : "s"}…`
      : "Searching the Qur’an & Hadith…";
    return <ThinkingLoader label={label} />;
  }
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg bg-elevated text-text shadow-lift">
        <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        <div className="p-5 sm:p-6">
          {msg.category && (
            <p className="mb-4 inline-block rounded-full border border-primary/40 px-3 py-0.5 text-xs tracking-wide text-accent">
              {CATEGORY_LABEL[msg.category]}
            </p>
          )}
          <AnswerBody text={msg.content} />
          {msg.disclaimer !== undefined && (
            <div className="mt-4">
              <ListenButton text={msg.content} />
            </div>
          )}
          {msg.disclaimer && (
            <p className="mt-6 border-t border-border pt-3 text-xs text-muted">
              {msg.disclaimer}
            </p>
          )}
        </div>
      </div>
      {sources.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs tracking-wide text-accent hover:text-link">
            <span className="group-open:hidden">Show sources ({sources.length})</span>
            <span className="hidden group-open:inline">Hide sources</span>
          </summary>
          <div className="mt-3 space-y-3">
            {sources.map((s, i) => (
              <SourceCard key={i} n={i + 1} s={s} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const EFFORTS = ["minimal", "low", "medium", "high"] as const;
type Effort = (typeof EFFORTS)[number];
const EFFORT_HINT: Record<Effort, string> = {
  minimal: "fastest, answers can be brief",
  low: "fast, fully cited (recommended)",
  medium: "deeper, slower",
  high: "deepest, slowest",
};

export default function HomePage() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);

  const [persona, setPersona] = useState<PersonaKey | null>(null);
  const [effort, setEffort] = useState<Effort>("low");
  const [effortOpen, setEffortOpen] = useState(false);
  const effortRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!effortOpen) return;
    const onDown = (ev: MouseEvent) => {
      if (effortRef.current && !effortRef.current.contains(ev.target as Node)) {
        setEffortOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [effortOpen]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [recent, setRecent] = useState<ConversationSummary[]>([]);
  const [continuePath, setContinuePath] = useState<PathSummary | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [reading, setReading] = useState<ReadingSpot | null>(null);
  useEffect(() => {
    isSignedIn().then(setSignedIn);
    setReading(loadReadingSpot());
  }, []);
  const router = useRouter();

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadPersona();
    setPersona(stored);
    if (!stored && !isOnboarded()) setShowOnboarding(true);

    fetch("/api/v1/personas")
      .then((r) => (r.ok ? r.json() : []))
      .then(setPersonas)
      .catch(() => {});
    refreshRecent();
    fetch("/api/v1/learn/paths", { headers: sessionHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((paths: PathSummary[]) => {
        const inProgress = paths
          .filter((p) => p.completed_count > 0 && p.completed_count < p.step_count)
          .sort((a, b) => b.completed_count / b.step_count - a.completed_count / a.step_count);
        setContinuePath(inProgress[0] ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (messages.length > 0) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, busy]);

  function refreshRecent() {
    fetch("/api/v1/conversations", { headers: sessionHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ConversationSummary[]) => setRecent(list.slice(0, 5)))
      .catch(() => {});
  }

  function choosePersona(p: PersonaKey | null) {
    setPersona(p);
    savePersona(p);
  }

  function newConversation() {
    setMessages([]);
    setConversationId(null);
    setError(null);
    refreshRecent();
  }

  async function loadConversation(id: number) {
    try {
      const res = await fetch(`/api/v1/conversations/${id}`, { headers: sessionHeaders() });
      if (!res.ok) return;
      const detail: ConversationDetail = await res.json();
      setMessages(
        detail.messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          category: (m.category as AskResponse["category"]) ?? null,
          sources: m.sources ?? [],
        }))
      );
      setConversationId(id);
      setError(null);
    } catch {
      setError("Couldn't load that conversation. Try again.");
    }
  }

  async function submit(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3 || busy) return;

    // One box for everything: references open the reader, short phrases search,
    // real questions go to the AI. The user never picks a tool.
    const verseRef = trimmed.match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
    if (verseRef) {
      const [, s, a] = verseRef;
      router.push(`/quran/${s}?page=${Math.ceil(Number(a) / 40)}#a${a}`);
      return;
    }
    const looksLikeQuestion =
      /[?؟]/.test(trimmed) ||
      /^(what|how|why|who|when|where|which|can|could|should|is|are|do|does|did|will|would|tell|explain|kya|kyun|kaise|kab|kaun)\b/i.test(
        trimmed
      );
    const words = trimmed.split(/\s+/).length;
    const hadithRef = /^[a-z]+\s+\d{1,5}$/i.test(trimmed);
    if (!looksLikeQuestion && (hadithRef || words <= 3)) {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      return;
    }

    setBusy(true);
    setError(null);
    setQuestion("");
    const base: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    let assistant: ChatMessage = { role: "assistant", content: "", sources: [] };
    setMessages([...base, assistant]);

    const paint = () => setMessages([...base, { ...assistant }]);
    try {
      const res = await fetch("/api/v1/ask/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionHeaders() },
        body: JSON.stringify({
          question: trimmed,
          effort,
          ...(persona ? { persona } : {}),
          ...(conversationId ? { conversation_id: conversationId } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        setError(body?.detail ?? `Something went wrong (${res.status}). Try again.`);
        setMessages(base);
        return;
      }

      const apply = (evt: AskStreamEvent) => {
        if (evt.event === "meta" && evt.category) {
          assistant = { ...assistant, category: evt.category };
        } else if (evt.event === "sources" && evt.sources) {
          assistant = { ...assistant, sources: evt.sources };
        } else if (evt.event === "delta" && evt.text) {
          assistant = { ...assistant, content: assistant.content + evt.text };
        } else if (evt.event === "done") {
          assistant = {
            ...assistant,
            content: evt.answer ?? assistant.content,
            category: evt.category ?? assistant.category,
            sources: evt.sources ?? assistant.sources,
            disclaimer: evt.disclaimer ?? "",
          };
          if (evt.conversation_id) setConversationId(evt.conversation_id);
          refreshRecent();
        } else if (evt.event === "error") {
          setError(evt.detail ?? "The answer engine failed mid-response. Try again.");
          return;
        }
        paint();
      };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let sep;
        while ((sep = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          const data = frame.split("\n").find((l) => l.startsWith("data: "));
          if (data) apply(JSON.parse(data.slice(6)) as AskStreamEvent);
        }
      }
    } catch {
      setError("Could not reach the server. Try again in a moment.");
      setMessages(base);
    } finally {
      setBusy(false);
    }
  }

  const activePersona = personas.find((p) => p.key === persona) ?? null;
  const suggestions = activePersona?.suggested_questions ?? SAMPLES;
  const threadActive = messages.length > 0;

  return (
    <div className="mx-auto max-w-3xl">
      {showOnboarding && (
        <PersonaOnboarding
          personas={personas}
          onDone={(p) => {
            if (p) choosePersona(p);
            setOnboarded();
            setShowOnboarding(false);
          }}
        />
      )}

      {!threadActive && (
        <section id="ask" className="pt-4 pb-8 text-center sm:pt-10">
          <p lang="ar" className="text-2xl text-accent/90">
            بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
          </p>
          <h1 className="font-semibold tracking-tight mt-4 text-3xl text-text sm:text-4xl">
            Ask, with sources.
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
            Answers come only from the Quran and authentic hadith, every claim cited.
          </p>
        </section>
      )}

      {threadActive && (
        <div className="flex items-center justify-between pt-4 pb-4">
          <span className="text-xs text-muted/80">
            {activePersona ? `Learning as ${activePersona.label}` : "FaithBrains"}
          </span>
          <button
            type="button"
            onClick={newConversation}
            className="rounded-full border border-border px-3.5 py-1.5 text-xs text-muted hover:border-primary/60 hover:text-accent"
          >
            New conversation
          </button>
        </div>
      )}

      {threadActive && (
        <section className="space-y-5 pb-6">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm border border-border bg-elevated px-4 py-2.5 text-sm text-text">
                  {m.content}
                </p>
              </div>
            ) : (
              <AssistantMessage key={i} msg={m} />
            )
          )}
          <div ref={bottomRef} />
        </section>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="rounded-xl border border-border bg-surface p-3"
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(question);
            }
          }}
          rows={threadActive ? 2 : 3}
          placeholder={
            threadActive
              ? "Ask a follow-up…"
              : "Ask anything, search a word, or jump to a verse like 2:255"
          }
          className="w-full resize-none bg-transparent px-2 py-1.5 text-text placeholder:text-muted/60 focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted/70">Speed</span>
            <div className="relative" ref={effortRef}>
              <button
                type="button"
                onClick={() => setEffortOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={effortOpen}
                className="flex items-center gap-1.5 rounded-full border border-border bg-bg px-3 py-1 text-xs text-text transition-colors hover:border-primary/60"
              >
                <span className="capitalize">{effort}</span>
                <svg
                  className={`h-3 w-3 text-muted transition-transform ${effortOpen ? "rotate-180" : ""}`}
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 4.5 6 7.5 9 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {effortOpen && (
                <ul
                  role="listbox"
                  className="absolute top-full left-0 z-30 mt-1.5 w-60 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-xl shadow-black/60"
                >
                  {EFFORTS.map((e) => (
                    <li key={e}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={effort === e}
                        onClick={() => {
                          setEffort(e);
                          setEffortOpen(false);
                        }}
                        className={`flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left transition-colors ${
                          effort === e
                            ? "bg-elevated text-accent"
                            : "text-muted hover:bg-elevated hover:text-text"
                        }`}
                      >
                        <span className="text-xs capitalize">{e}</span>
                        <span className="text-[10px] text-muted/50">{EFFORT_HINT[e]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MicButton
              onText={(t) => setQuestion((q) => (q ? q.trimEnd() + " " : "") + t)}
              onError={(m) => setError(m || null)}
            />
            <button
              type="submit"
              disabled={busy || question.trim().length < 3}
              className="rounded-full bg-primary px-5 py-1.5 text-sm font-bold text-on-primary transition-opacity disabled:opacity-40"
            >
              {busy ? "Consulting sources…" : threadActive ? "Send" : "Ask"}
            </button>
          </div>
        </div>
      </form>

      {!threadActive && (
        <div className="mt-4 flex justify-center">
          <MicButton
            large
            onText={(t) => setQuestion((q) => (q ? q.trimEnd() + " " : "") + t)}
            onError={(m) => setError(m || null)}
          />
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-error/40 bg-error/10 p-4 text-sm text-error">
          {error}
        </div>
      )}

      {!threadActive && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {suggestions.slice(0, 3).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="rounded-full border border-border px-3.5 py-1.5 text-xs text-muted hover:border-primary/60 hover:text-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {!threadActive && personas.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-center text-xs tracking-wide text-muted/70">
            I&apos;m learning as…
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {personas.map((p) => {
              const active = p.key === persona;
              return (
                <button
                  key={p.key}
                  type="button"
                  title={p.tagline}
                  onClick={() => choosePersona(active ? null : (p.key as PersonaKey))}
                  className={
                    active
                      ? "rounded-full border border-primary/60 bg-elevated px-3.5 py-1.5 text-xs text-accent"
                      : "rounded-full border border-border px-3.5 py-1.5 text-xs text-muted hover:border-primary/60 hover:text-accent"
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!threadActive && (reading || continuePath) && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {reading && (
            <Link
              href={`/quran/${reading.surah}?page=${reading.page}`}
              className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-elevated"
            >
              <p className="text-xs tracking-wide text-accent">Continue reading</p>
              <div className="mt-1 flex items-center justify-between gap-4">
                <span className="font-semibold tracking-tight text-text">{reading.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {reading.page > 1 ? `from ayah ${(reading.page - 1) * 40 + 1}` : "from the beginning"} →
                </span>
              </div>
            </Link>
          )}
          {continuePath && (
            <Link
              href={`/learn/${continuePath.key}`}
              className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-elevated"
            >
              <p className="text-xs tracking-wide text-accent">Continue learning</p>
              <div className="mt-1 flex items-center justify-between gap-4">
                <span className="font-semibold tracking-tight text-text">{continuePath.title}</span>
                <span className="shrink-0 text-xs text-muted">
                  {continuePath.completed_count}/{continuePath.step_count} studied
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: `${Math.round((continuePath.completed_count / continuePath.step_count) * 100)}%`,
                  }}
                />
              </div>
            </Link>
          )}
        </div>
      )}

      {!threadActive && recent.length > 0 && (
        <section className="mt-10">
          <h2 className="font-semibold tracking-tight mb-3 text-lg text-accent">
            Recent conversations
            {!signedIn && (
              <span className="ml-2 text-xs font-normal tracking-normal text-muted">
                on this device
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {recent.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => loadConversation(c.id)}
                className="block w-full rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-elevated"
              >
                <span className="block truncate text-sm text-text">{c.title}</span>
                <span className="mt-0.5 block text-xs text-muted/70">
                  {Math.floor(c.message_count / 2)}{" "}
                  {c.message_count >= 4 ? "exchanges" : "exchange"}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!threadActive && <LandingPage />}
    </div>
  );
}

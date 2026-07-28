"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { isSignedIn } from "@/lib/auth";
import { sessionHeaders } from "@/lib/session";

type Step = {
  key: string;
  title: string;
  kind: "quran" | "hadith";
  reference: string;
  arabic: string | null;
  text: string | null;
  grading: string | null;
  completed: boolean;
};

type QuizQuestion = { q: string; options: string[]; answer: number; why: string };

type PathDetail = {
  key: string;
  title: string;
  description: string;
  steps: Step[];
  quiz: QuizQuestion[];
  quiz_completed: boolean;
};

function Quiz({
  questions,
  alreadyDone,
  onPassed,
}: {
  questions: QuizQuestion[];
  alreadyDone: boolean;
  onPassed: () => void;
}) {
  const [picked, setPicked] = useState<(number | null)[]>(questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const score = questions.filter((q, i) => picked[i] === q.answer).length;
  const allAnswered = picked.every((p) => p !== null);

  function submit() {
    setSubmitted(true);
    if (questions.every((q, i) => picked[i] === q.answer)) onPassed();
  }
  function retry() {
    setPicked(questions.map(() => null));
    setSubmitted(false);
  }

  return (
    <section className="mt-10">
      <h2 className="font-semibold tracking-tight text-2xl text-text">Revision quiz</h2>
      <p className="mt-1 text-xs text-muted">
        {alreadyDone ? "✓ Completed. Retake any time." : "Answer from the steps above; every answer cites its source."}
      </p>
      <ol className="mt-5 space-y-5">
        {questions.map((q, qi) => (
          <li key={qi} className="rounded-lg border border-border bg-surface p-4">
            <p className="text-sm text-text">
              {qi + 1}. {q.q}
            </p>
            <div className="mt-3 space-y-1.5">
              {q.options.map((opt, oi) => {
                const chosen = picked[qi] === oi;
                const correct = submitted && oi === q.answer;
                const wrong = submitted && chosen && oi !== q.answer;
                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={submitted}
                    onClick={() =>
                      setPicked(picked.map((p, i) => (i === qi ? oi : p)))
                    }
                    className={`block w-full rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                      correct
                        ? "border-success/50 bg-success/15 text-success"
                        : wrong
                          ? "border-error/50 bg-error/15 text-error"
                          : chosen
                            ? "border-primary/60 bg-elevated text-accent"
                            : "border-border text-muted hover:border-primary/40 hover:text-text"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {submitted && (
              <p className="mt-2 text-[11px] text-muted/70">Source: {q.why}</p>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-5 flex items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered}
            className="rounded-full bg-primary px-5 py-1.5 text-sm font-bold text-on-primary disabled:opacity-40"
          >
            Check answers
          </button>
        ) : (
          <>
            <p className="text-sm text-accent">
              {score}/{questions.length} correct
              {score === questions.length ? ". Well done!" : ""}
            </p>
            {score < questions.length && (
              <button
                type="button"
                onClick={retry}
                className="rounded-full border border-primary/50 px-4 py-1 text-xs font-bold text-accent hover:border-primary"
              >
                Try again
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default function PathPage({ params }: { params: Promise<{ path: string }> }) {
  const { path } = use(params);
  const router = useRouter();
  const [detail, setDetail] = useState<PathDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/learn/paths/${path}`, { headers: sessionHeaders() })
      .then(async (r) => (r.ok ? setDetail(await r.json()) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [path]);

  async function markStudied(step: Step) {
    if (!detail || step.completed) return;
    // Progress belongs to an account, like saves; reading stays open to everyone
    if (!(await isSignedIn())) {
      router.push("/account");
      return;
    }
    setDetail({
      ...detail,
      steps: detail.steps.map((s) => (s.key === step.key ? { ...s, completed: true } : s)),
    });
    fetch(`/api/v1/learn/paths/${path}/steps/${step.key}/complete`, {
      method: "POST",
      headers: sessionHeaders(),
    }).catch(() => {});
  }

  if (missing) {
    return (
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-muted">This learning path doesn&apos;t exist.</p>
        <Link href="/learn" className="text-accent underline underline-offset-4">
          Back to Learn
        </Link>
      </div>
    );
  }
  if (!detail) return <p className="mx-auto max-w-3xl text-sm text-muted">Loading path…</p>;

  const done = detail.steps.filter((s) => s.completed).length;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/learn" className="text-xs text-muted hover:text-accent">
        ← Learn
      </Link>
      <h1 className="font-semibold tracking-tight mt-2 text-3xl text-text">{detail.title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{detail.description}</p>
      <p className="mt-3 text-xs tracking-wide text-accent">
        {done}/{detail.steps.length} studied
      </p>

      <ol className="mt-8 space-y-5">
        {detail.steps.map((step, i) => (
          <li
            key={step.key}
            className="overflow-hidden rounded-lg bg-elevated text-text shadow-lift"
          >
            <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
            <div className="p-5 sm:p-6">
              <p className="text-xs tracking-wide text-muted">
                Step {i + 1} · {step.kind === "quran" ? `Quran ${step.reference}` : step.reference}
                {step.grading ? ` · ${step.grading}` : ""}
              </p>
              <h2 className="font-semibold tracking-tight mt-1 text-lg">{step.title}</h2>
              {step.arabic && (
                <p lang="ar" className="mt-3 text-right text-xl leading-[2.2]">
                  {step.arabic}
                </p>
              )}
              {step.text && (
                <p className="mt-3 border-t border-border pt-3 leading-relaxed text-text/90">
                  {step.text}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between">
                <Link
                  href={`/search?q=${encodeURIComponent(step.reference)}`}
                  className="text-xs text-muted underline decoration-primary/50 underline-offset-4 hover:text-text"
                >
                  Open in search
                </Link>
                <button
                  type="button"
                  onClick={() => markStudied(step)}
                  disabled={step.completed}
                  className={
                    step.completed
                      ? "rounded-full border border-primary/40 px-4 py-1 text-xs font-bold text-accent"
                      : "rounded-full bg-primary px-4 py-1 text-xs font-bold text-on-primary hover:opacity-90"
                  }
                >
                  {step.completed ? "✓ Studied" : "Mark studied"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {detail.quiz.length > 0 && (
        <Quiz
          questions={detail.quiz}
          alreadyDone={detail.quiz_completed}
          onPassed={async () => {
            if (detail.quiz_completed) return;
            setDetail({ ...detail, quiz_completed: true });
            // anyone can take the quiz; only accounts record the result
            if (!(await isSignedIn())) return;
            fetch(`/api/v1/learn/paths/${path}/steps/quiz/complete`, {
              method: "POST",
              headers: sessionHeaders(),
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

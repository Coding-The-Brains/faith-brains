"use client";

const isDev = process.env.NODE_ENV === "development";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h2 className="font-semibold tracking-tight text-2xl text-text">Couldn&apos;t load this page</h2>
      {isDev ? (
        <p className="mt-3 text-sm text-muted">
          The FaithBrains API may not be running. Start it with{" "}
          <code className="rounded bg-elevated px-1.5 py-0.5 text-accent">
            uv run uvicorn app.main:app
          </code>{" "}
          in <code className="rounded bg-elevated px-1.5 py-0.5 text-accent">backend/</code>, then
          try again.
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Something went wrong on our side. Please try again in a moment.
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-primary px-6 py-2 text-sm font-bold text-on-primary"
      >
        Retry
      </button>
    </div>
  );
}

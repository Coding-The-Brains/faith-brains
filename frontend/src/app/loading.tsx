// Global route-transition state: shown while server pages (Quran, Hadith,
// Learn, Search) fetch. One branded skeleton instead of a blank screen.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading">
      <div className="mb-8 flex justify-center">
        <svg viewBox="0 0 40 40" className="h-8 w-8 animate-pulse" aria-hidden="true">
          <rect x="9" y="9" width="22" height="22" fill="none" stroke="var(--primary)" strokeWidth="1.6" />
          <rect
            x="9" y="9" width="22" height="22" fill="none" stroke="var(--primary)" strokeWidth="1.6"
            transform="rotate(45 20 20)"
          />
          <circle cx="20" cy="20" r="3" fill="var(--primary)" />
        </svg>
      </div>
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-border bg-surface p-5"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <div className="h-3 w-1/3 rounded bg-elevated" />
            <div className="mt-4 h-3 w-full rounded bg-elevated" />
            <div className="mt-2 h-3 w-4/5 rounded bg-elevated" />
          </div>
        ))}
      </div>
    </div>
  );
}

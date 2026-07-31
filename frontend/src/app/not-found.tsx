import Link from "next/link";

// Branded 404: Next's default is a bare white page that breaks the dark theme.
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md pt-20 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text">
        This page does not exist
      </h1>
      <p className="mt-3 text-sm text-muted">
        The address may be mistyped, or the page may have moved.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-on-primary"
        >
          Ask a question
        </Link>
        <Link
          href="/quran"
          className="rounded-full border border-border px-5 py-2 text-sm text-muted transition-colors hover:border-primary hover:text-text"
        >
          Open the Quran
        </Link>
      </div>
    </div>
  );
}

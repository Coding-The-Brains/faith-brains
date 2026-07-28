"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import NavTabs from "./NavTabs";
import ThemeToggle from "./ThemeToggle";

// DESIGN.md §5.1: one sticky nav that condenses into a floating glass pill on
// scroll. Single element, so the change is a morph, not a swap: width, radius,
// background, and shadow interpolate while the wordmark and search collapse.
const EASE = "[transition-timing-function:cubic-bezier(0.22,1,0.36,1)]";

export default function SiteHeader() {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="sticky top-0 z-50 px-4">
      <header
        className={`mx-auto flex items-center justify-between gap-3 rounded-full border border-border backdrop-blur-md transition-all duration-500 ${EASE} ${
          condensed
            ? "mt-3 max-w-[27rem] bg-surface/80 px-3 py-1.5 shadow-lift"
            : "mt-3 max-w-5xl bg-surface/80 px-5 py-2 shadow-soft"
        }`}
      >
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="FaithBrains home">
          <svg
            viewBox="0 0 40 40"
            className={`transition-all duration-500 ${EASE} ${condensed ? "h-5 w-5" : "h-7 w-7"}`}
            aria-hidden="true"
          >
            <rect x="9" y="9" width="22" height="22" fill="none" stroke="var(--primary)" strokeWidth="1.6" />
            <rect
              x="9" y="9" width="22" height="22" fill="none" stroke="var(--primary)" strokeWidth="1.6"
              transform="rotate(45 20 20)"
            />
            <circle cx="20" cy="20" r="3" fill="var(--primary)" />
          </svg>
          <span
            className={`overflow-hidden whitespace-nowrap text-2xl font-semibold tracking-tight text-text transition-all duration-500 ${EASE} ${
              condensed ? "max-w-0 opacity-0" : "max-w-[12rem] opacity-100"
            }`}
          >
            Faith<span className="text-accent">Brains</span>
          </span>
        </Link>

        <div className="no-scrollbar min-w-0 overflow-x-auto">
          <NavTabs variant="pill" />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div
            className={`hidden overflow-hidden transition-all duration-500 ${EASE} sm:block ${
              condensed ? "max-w-0 opacity-0" : "max-w-[18rem] opacity-100"
            }`}
          >
            <form action="/search">
              <input
                type="search"
                name="q"
                placeholder="Search"
                tabIndex={condensed ? -1 : 0}
                className="w-44 rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-text placeholder:text-muted/70 transition-colors duration-200 focus:border-primary"
              />
            </form>
          </div>
          <Link
            href="/account"
            aria-label="Account"
            title="Account"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted transition-colors duration-200 hover:border-primary hover:text-text"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
            </svg>
          </Link>
          <ThemeToggle />
        </div>
      </header>
    </div>
  );
}

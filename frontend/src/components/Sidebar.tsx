"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const NAV = [
  {
    href: "/",
    label: "Ask",
    icon: <path {...STROKE} d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V6Z" />,
  },
  {
    href: "/quran",
    label: "Quran",
    icon: <path {...STROKE} d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5ZM19 15H6a2 2 0 0 0-2 2" />,
  },
  {
    href: "/hadith",
    label: "Hadith",
    icon: <path {...STROKE} d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6" />,
  },
  {
    href: "/learn",
    label: "Learn",
    icon: <path {...STROKE} d="M12 4 3 8l9 4 9-4-9-4ZM6 10v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" />,
  },
  {
    href: "/saved",
    label: "Saved",
    icon: <path {...STROKE} d="M6.5 3.5h11a.5.5 0 0 1 .5.5v16.4l-6-4-6 4V4a.5.5 0 0 1 .5-.5Z" />,
  },
];

// Signed-in desktop shell nav; AppShell only renders this when authenticated.
export default function Sidebar() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setEmail(me?.email ?? null))
      .catch(() => {});
  }, []);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface px-3 py-5 xl:flex">
      <Link href="/" className="flex items-center gap-2.5 px-2">
        <svg viewBox="0 0 40 40" className="h-6 w-6" aria-hidden="true">
          <rect x="9" y="9" width="22" height="22" fill="none" stroke="var(--primary)" strokeWidth="1.6" />
          <rect
            x="9" y="9" width="22" height="22" fill="none" stroke="var(--primary)" strokeWidth="1.6"
            transform="rotate(45 20 20)"
          />
          <circle cx="20" cy="20" r="3" fill="var(--primary)" />
        </svg>
        <span className="text-lg font-semibold tracking-tight text-text">
          Faith<span className="text-accent">Brains</span>
        </span>
      </Link>

      <nav className="mt-8 flex flex-col gap-1" aria-label="Sections">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
                active ? "bg-elevated text-accent" : "text-muted hover:bg-elevated hover:text-text"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" aria-hidden="true">
                {item.icon}
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/account"
        className={`mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
          pathname.startsWith("/account")
            ? "bg-elevated text-accent"
            : "text-muted hover:bg-elevated hover:text-text"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" aria-hidden="true">
          <circle {...STROKE} cx="12" cy="8" r="4" />
          <path {...STROKE} d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
        </svg>
        <span className="truncate">{email ?? "Account"}</span>
      </Link>
    </aside>
  );
}

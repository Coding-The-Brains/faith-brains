"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isSignedIn } from "@/lib/auth";

const TABS = [
  { href: "/", label: "Ask" },
  { href: "/quran", label: "Quran" },
  { href: "/hadith", label: "Hadith" },
  { href: "/learn", label: "Learn" },
  { href: "/saved", label: "Saved", authOnly: true },
];

export default function NavTabs({ variant = "tabs" }: { variant?: "tabs" | "pill" }) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    isSignedIn().then(setSignedIn);
  }, []);
  const tabs = TABS.filter((t) => !t.authOnly || signedIn);
  if (variant === "pill") {
    return (
      <nav className="flex items-center gap-1" aria-label="Sections">
        {tabs.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs tracking-wide transition-colors duration-200 ${
                active ? "bg-elevated text-accent" : "text-muted hover:text-text"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Sections">
      {tabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm tracking-wide transition-colors ${
              active
                ? "border-primary text-accent"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

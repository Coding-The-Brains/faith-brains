import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Amiri } from "next/font/google";
import AppShell from "@/components/AppShell";
import SiteHeader from "@/components/SiteHeader";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

const amiri = Amiri({ weight: ["400", "700"], subsets: ["arabic"], variable: "--font-amiri" });

export const metadata: Metadata = {
  title: "FaithBrains · Quran & Hadith companion",
  description:
    "Search the Quran and authentic Hadith, and get answers built only from sources you can check. An educational tool, not a religious authority.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${amiri.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen flex flex-col">
        <ThemeProvider>
          <AppShell>
            <SiteHeader />

            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

            <footer className="border-t border-border py-6 text-center text-xs text-muted">
              <p className="mx-auto max-w-3xl px-4">
                An educational tool, not a source of rulings ·{" "}
                <a href="/learn" className="text-accent hover:underline">
                  Sources &amp; about
                </a>
              </p>
            </footer>
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}

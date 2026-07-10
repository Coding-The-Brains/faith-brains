import Link from "next/link";
import { notFound } from "next/navigation";
import VerseCard from "@/components/VerseCard";
import { api, saheeh } from "@/lib/api";

// Al-Baqarah is 286 ayat (~1.6MB with Arabic + translation); page the reader so
// every surah loads fast. 40 ayat/page keeps even Juz Amma surahs on one page.
const PAGE_SIZE = 40;

export default async function SurahPage({
  params,
  searchParams,
}: {
  params: Promise<{ surah: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { surah: raw } = await params;
  const { page: rawPage } = await searchParams;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 114) notFound();
  const page = Math.max(1, Number(rawPage) || 1);

  const detail = await api.surah(n, (page - 1) * PAGE_SIZE, PAGE_SIZE).catch(() => null);
  if (!detail || detail.verses.length === 0) notFound();
  const { surah, verses } = detail;
  const totalPages = Math.ceil(surah.ayah_count / PAGE_SIZE);
  const basmala = verses[0]?.basmala_prefix;
  const firstAyah = verses[0].ayah;
  const lastAyah = verses[verses.length - 1].ayah;

  const pageNav =
    totalPages > 1 ? (
      <nav className="flex items-center justify-between rounded-lg border border-line px-4 py-2 text-sm">
        {page > 1 ? (
          <Link href={`/quran/${n}?page=${page - 1}`} className="text-goldsoft hover:underline">
            ← Ayat {Math.max(1, (page - 2) * PAGE_SIZE + 1)}–{(page - 1) * PAGE_SIZE}
          </Link>
        ) : (
          <span />
        )}
        <span className="text-mist">
          Ayat {firstAyah}–{lastAyah} of {surah.ayah_count}
        </span>
        {page < totalPages ? (
          <Link href={`/quran/${n}?page=${page + 1}`} className="text-goldsoft hover:underline">
            Ayat {page * PAGE_SIZE + 1}–{Math.min(surah.ayah_count, (page + 1) * PAGE_SIZE)} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    ) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 text-center">
        <p lang="ar" className="text-4xl text-goldsoft">
          {surah.name_arabic}
        </p>
        <h1 className="font-display mt-2 text-2xl text-snow">
          {surah.number}. {surah.name_transliterated}
        </h1>
        <p className="mt-1 text-sm text-mist">
          {surah.name_english} · {surah.ayah_count} ayat · {surah.revelation_place}
        </p>
      </header>

      {page === 1 && basmala && (
        <p lang="ar" className="mb-8 text-center text-2xl text-snow/90">
          {basmala}
        </p>
      )}

      {pageNav && <div className="mb-6">{pageNav}</div>}

      <div className="space-y-4">
        {verses.map((v) => (
          <VerseCard
            key={v.ayah}
            surah={v.surah}
            ayah={v.ayah}
            arabic={v.text_uthmani}
            translation={saheeh(v)}
          />
        ))}
      </div>

      {pageNav && <div className="mt-6">{pageNav}</div>}

      <nav className="mt-10 flex justify-between text-sm">
        {n > 1 ? (
          <Link href={`/quran/${n - 1}`} className="text-goldsoft hover:underline">
            ← Surah {n - 1}
          </Link>
        ) : (
          <span />
        )}
        {n < 114 ? (
          <Link href={`/quran/${n + 1}`} className="text-goldsoft hover:underline">
            Surah {n + 1} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}

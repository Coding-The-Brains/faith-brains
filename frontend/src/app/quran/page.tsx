import Link from "next/link";
import { api, arabicNumber } from "@/lib/api";

export const metadata = { title: "Quran · FaithBrains" };

export default async function QuranPage() {
  const surahs = await api.surahs();
  return (
    <div>
      <h1 className="font-semibold tracking-tight mb-6 text-3xl text-text">The Quran</h1>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {surahs.map((s) => (
          <li key={s.number}>
            <Link
              href={`/quran/${s.number}`}
              className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-elevated"
            >
              <span className="medallion medallion-dark shrink-0">{arabicNumber(s.number)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-text">{s.name_transliterated}</span>
                <span className="block text-xs text-muted">
                  {s.name_english} · {s.ayah_count} ayat · {s.revelation_place}
                </span>
              </span>
              <span lang="ar" className="shrink-0 text-xl text-accent/90">
                {s.name_arabic}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

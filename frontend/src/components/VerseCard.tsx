import Link from "next/link";
import SaveButton from "@/components/SaveButton";
import ShareButton from "@/components/ShareButton";
import TafsirToggle from "@/components/TafsirToggle";
import WordByWord from "@/components/WordByWord";
import { arabicNumber } from "@/lib/api";

// The signature element: an illuminated verse panel — elevated surface, primary hairline,
// Arabic set right-to-left in Amiri with a mushaf-style ayah medallion.
export default function VerseCard({
  surah,
  ayah,
  arabic,
  translation,
  surahName,
  linkToSurah = false,
}: {
  surah: number;
  ayah: number;
  arabic: string;
  translation: string | null;
  surahName?: string | null;
  linkToSurah?: boolean;
}) {
  const reference = `${surah}:${ayah}`;
  return (
    <article
      id={`a${ayah}`}
      className="scroll-mt-24 overflow-hidden rounded-lg bg-elevated text-text shadow-lift"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
      <div className="p-5 sm:p-6">
        <p lang="ar" className="text-right text-2xl leading-[2.3] sm:text-[1.7rem]">
          {arabic} <span className="medallion align-middle">{arabicNumber(ayah)}</span>
        </p>
        {translation && (
          <p className="mt-4 border-t border-border pt-4 text-[1.05rem] leading-relaxed text-text/90">
            {translation}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <span className="tracking-wide">
            {linkToSurah ? (
              <Link href={`/quran/${surah}`} className="underline decoration-primary/50 underline-offset-4 hover:text-text">
                {surahName ? `${surahName} · ` : ""}Quran {reference}
              </Link>
            ) : (
              <>{surahName ? `${surahName} · ` : ""}Quran {reference}</>
            )}
          </span>
          <span className="flex items-center gap-1">
            <ShareButton arabic={arabic} english={translation} reference={`Quran ${reference}`} />
            <SaveButton
              onPaper
              item={{
                id: `quran:${reference}`,
                kind: "quran",
                reference: `Quran ${reference}`,
                arabic,
                english: translation,
                href: `/quran/${surah}`,
              }}
            />
          </span>
        </div>
        <WordByWord surah={surah} ayah={ayah} />
        <TafsirToggle surah={surah} ayah={ayah} />
      </div>
    </article>
  );
}

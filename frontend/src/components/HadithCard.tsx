import SaveButton from "@/components/SaveButton";
import ShareButton from "@/components/ShareButton";
import type { Grading } from "@/lib/api";

export function gradeTone(grade: string | null): string {
  const g = (grade ?? "").toLowerCase();
  if (g.includes("sahih")) return "bg-success/15 text-success";
  if (g.includes("hasan")) return "bg-warn/15 text-warn";
  if (g.includes("daif") || g.includes("da'if") || g.includes("weak"))
    return "bg-error/15 text-error";
  return "bg-elevated text-muted";
}

export default function HadithCard({
  collection,
  collectionName,
  number,
  english,
  arabic,
  gradings,
  bookName,
}: {
  collection: string;
  collectionName: string;
  number: string;
  english: string | null;
  arabic: string | null;
  gradings: Grading[];
  bookName?: string | null;
}) {
  const shown = gradings.slice(0, 2);
  return (
    <article className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm tracking-wide text-accent">
          {collectionName} · {number}
          {bookName ? <span className="text-muted"> · {bookName}</span> : null}
        </p>
        <span className="flex items-center gap-1">
          <ShareButton arabic={arabic} english={english} reference={`${collectionName} ${number}`} />
          <SaveButton
            item={{
              id: `hadith:${collection}:${number}`,
              kind: "hadith",
              reference: `${collectionName} ${number}`,
              arabic,
              english,
              href: `/hadith/${collection}`,
            }}
          />
        </span>
      </div>
      {english && <p className="mt-3 leading-relaxed text-text/90">{english}</p>}
      {arabic && (
        <p lang="ar" className="mt-4 border-t border-border pt-4 text-right text-xl leading-[2.1] text-text/85">
          {arabic}
        </p>
      )}
      {shown.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {shown.map((g, i) => (
            <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs ${gradeTone(g.grade)}`}>
              {g.grade}
              {g.name ? ` · ${g.name}` : ""}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

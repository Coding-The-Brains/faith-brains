"""Hadith retrieval eval: natural-language questions with gold hadith refs.

Mirrors eval_retrieval.py (the Quran eval): hit@5 / hit@10 / MRR over scope=hadith.
Gold numbers follow the fawazahmed0 numbering as ingested; because hadith numbering
schemes drift between editions, every entry also carries a KEYWORD that must appear
in the gold hadith's English text.

  uv run python scripts/eval_hadith.py --verify-gold   # check the answer key itself
  uv run python scripts/eval_hadith.py                 # run the eval (needs embeddings)
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Hadith text contains ﷺ and Arabic; Windows consoles default to cp1252
if (sys.stdout.encoding or "").lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from sqlalchemy import select  # noqa: E402

from app.db.engine import get_sessionmaker  # noqa: E402
from app.db.models import HadithCollection, HadithRecord  # noqa: E402
from app.retrieval.service import SearchService  # noqa: E402

K = 10

# (question, [(collection_key, hadith_number), ...], verify_keyword)
# Keyword may hold "|"-separated alternatives (translations word things differently);
# a gold ref verifies if ANY alternative appears in its English text.
# NOTE: this dataset numbers Sahih Muslim sequentially (USC-MSA style), not by the
# standard Fuad Abdul Baqi scheme — e.g. "Allah looks at your hearts" is muslim 6543
# here, not 2564. All numbers below are verified against the ingested data
# (--verify-gold); do not "correct" them from memory.
GOLD: list[tuple[str, list[tuple[str, str]], str]] = [
    ("Which hadith says actions are judged by intentions?",
     [("bukhari", "1"), ("nawawi", "1")], "intention|judged"),
    ("None of you believes until he loves for his brother what he loves for himself",
     [("bukhari", "13"), ("nawawi", "13")], "loves for his brother|wishes for his"),
    ("Which hadith lists the five pillars Islam is built upon?",
     [("bukhari", "8"), ("nawawi", "3")], "five"),
    ("Whoever believes in Allah and the Last Day should speak good or remain silent",
     [("bukhari", "6018"), ("nawawi", "15"), ("bukhari", "6475")], "silent|keep quiet"),
    ("The strong man is not the one who wrestles but who controls his anger",
     [("bukhari", "6114")], "anger"),
    ("Which hadith advises: do not become angry?",
     [("bukhari", "6116"), ("nawawi", "16")], "angry"),
    ("A Muslim is the one from whose tongue and hands people are safe",
     [("bukhari", "10")], "tongue"),
    ("Religion is sincerity (naseehah)",
     [("nawawi", "7"), ("abudawud", "4944")], "sincer"),
    ("The best of you are those who learn the Quran and teach it",
     [("bukhari", "5027")], "teach"),
    ("Purity or cleanliness is half of faith",
     [("nawawi", "23")], "half of"),
    ("Make things easy and do not make things difficult",
     [("bukhari", "69")], "easy|facilitate"),
    ("The halal is clear and the haram is clear with doubtful matters between them",
     [("bukhari", "52"), ("nawawi", "6")], "doubtful"),
    ("Allah does not look at your appearance or wealth but at your hearts and deeds",
     [("muslim", "6543"), ("muslim", "6542"), ("ibnmajah", "4143")], "heart"),
    ("Whoever relieves a believer of a hardship, Allah will relieve him on the Day of Judgment",
     [("nawawi", "36"), ("muslim", "6853")], "grief|alleviat|suffering"),
    ("Have mercy on those on earth and the One in heaven will have mercy on you",
     [("tirmidhi", "1924"), ("abudawud", "4941")], "merc"),
    ("Whoever shows no mercy to people, Allah shows no mercy to him",
     [("bukhari", "5997"), ("bukhari", "7376"), ("muslim", "6028"), ("muslim", "6030")],
     "merc"),
    ("The upper hand is better than the lower hand in charity",
     [("bukhari", "1429")], "upper hand"),
    ("Charity does not decrease wealth",
     [("muslim", "6592")], "charity does not decrease"),
    ("Fear Allah wherever you are and follow a bad deed with a good deed",
     [("tirmidhi", "1987"), ("nawawi", "18")], "wherever you|good deed"),
    ("Leave that which makes you doubt for that which does not make you doubt",
     [("tirmidhi", "2518"), ("nawawi", "11")], "doubt"),
    ("Part of the perfection of Islam is leaving what does not concern you",
     [("tirmidhi", "2317"), ("nawawi", "12"), ("ibnmajah", "3976")], "concern"),
    ("Modesty is a branch of faith",
     [("bukhari", "9")], "modesty"),
    ("How many times better is prayer in congregation than praying alone?",
     [("bukhari", "645"), ("bukhari", "646"), ("bukhari", "647")], "congregation"),
    ("Whoever fasts Ramadan with faith and hoping for reward is forgiven past sins",
     [("bukhari", "38"), ("bukhari", "2014")], "forgiven"),
    ("Every intoxicant is unlawful",
     [("muslim", "5215"), ("muslim", "5216"), ("muslim", "5217"), ("abudawud", "3679")],
     "intoxicant"),
    ("Paradise is surrounded by hardships and the Fire is surrounded by desires",
     [("muslim", "7130")], "surrounded"),
    ("Help your brother whether he is an oppressor or oppressed",
     [("bukhari", "2443"), ("bukhari", "2444")], "oppress"),
    ("The best of you is the best to his family",
     [("tirmidhi", "3895"), ("ibnmajah", "1977")], "wife|wives"),
    ("Whoever builds a mosque for Allah, Allah builds for him a house in Paradise",
     [("bukhari", "450"), ("muslim", "7470"), ("muslim", "7471")], "mosque"),
    ("Which seven people will Allah shade on the day there is no shade but His?",
     [("bukhari", "660"), ("bukhari", "1423"), ("muslim", "2379")], "shade"),
    ("Smiling in the face of your brother is charity",
     [("tirmidhi", "1956")], "smil"),
    ("Whoever travels a path seeking knowledge, Allah makes easy a path to Paradise",
     [("tirmidhi", "2646"), ("abudawud", "3641"), ("ibnmajah", "223"), ("muslim", "6853")],
     "knowledge"),
]


async def verify_gold() -> None:
    """Check every gold ref exists and its text contains the entry's keyword."""
    bad = 0
    async with get_sessionmaker()() as session:
        for question, refs, keyword in GOLD:
            for key, number in refs:
                stmt = (
                    select(HadithRecord.text_english)
                    .join(HadithCollection)
                    .where(
                        HadithCollection.key == key,
                        HadithRecord.hadith_number == number,
                    )
                )
                text = (await session.execute(stmt)).scalar_one_or_none()
                if text is None:
                    bad += 1
                    print(f"MISSING  {key} {number}  <- {question[:60]}")
                elif not any(k.lower() in text.lower() for k in keyword.split("|")):
                    bad += 1
                    print(f"KEYWORD? {key} {number} lacks '{keyword}'  <- {question[:60]}")
                    print(f"         text: {text[:160]}...")
    total = sum(len(refs) for _, refs, _ in GOLD)
    print(f"\n{total - bad}/{total} gold refs verified OK across {len(GOLD)} questions")


async def run_eval() -> None:
    service = SearchService()
    if service.embedder.available:
        e = service.embedder
        print(f"mode: HYBRID ({type(e).__name__} {e.model})\n")
    else:
        print("mode: LEXICAL (no embedding key)\n")

    hits_at_5 = hits_at_10 = 0
    rr_sum = 0.0
    misses: list[tuple[str, list, list]] = []

    async with get_sessionmaker()() as session:
        for question, refs, _ in GOLD:
            gold = {(k, n.lower()) for k, n in refs}
            outcome = await service.search(session, question, scope="hadith", k=K)
            got = [
                (r.get("collection"), str(r.get("number", "")).lower())
                for r in outcome["results"]
            ]
            rank = next((i + 1 for i, g in enumerate(got) if g in gold), None)
            if rank is not None:
                rr_sum += 1.0 / rank
                if rank <= 5:
                    hits_at_5 += 1
                if rank <= 10:
                    hits_at_10 += 1
                print(f"[ HIT @{rank}] {question}")
            else:
                misses.append((question, sorted(gold), got[:5]))
                print(f"[   MISS] {question}")

    n = len(GOLD)
    print(f"\n=== {n} questions, top-{K}, scope=hadith ===")
    print(f"hit@5:  {hits_at_5}/{n}  ({hits_at_5 * 100 // n}%)")
    print(f"hit@10: {hits_at_10}/{n}  ({hits_at_10 * 100 // n}%)")
    print(f"MRR:    {rr_sum / n:.3f}")
    if misses:
        print(f"\n--- {len(misses)} misses ---")
        for question, gold, got in misses:
            print(f"Q: {question}")
            print(f"   wanted {gold}")
            print(f"   got    {got}")


if __name__ == "__main__":
    if "--verify-gold" in sys.argv:
        asyncio.run(verify_gold())
    else:
        asyncio.run(run_eval())

"""Curated learning paths — ordered steps over verses/hadith already in the corpus.

Every reference here must exist in the ingested data (quran "s:a", hadith
"collection number"). Step keys are stable identifiers persisted in
path_progress; never rename them once shipped.
"""

PATHS: list[dict] = [
    {
        "key": "salah-basics",
        "title": "Salah: The Daily Connection",
        "description": "Why Muslims pray, what prayer protects you from, and the reward of praying together.",
        "steps": [
            {"key": "help-through-prayer", "title": "Seek help through patience and prayer", "kind": "quran", "reference": "2:153"},
            {"key": "prayer-restrains", "title": "Prayer restrains wrongdoing", "kind": "quran", "reference": "29:45"},
            {"key": "fixed-times", "title": "Prayer at fixed times", "kind": "quran", "reference": "4:103"},
            {"key": "five-pillars", "title": "Prayer among the five pillars", "kind": "hadith", "reference": "bukhari 8"},
            {"key": "congregation", "title": "The reward of praying together", "kind": "hadith", "reference": "bukhari 645"},
        ],
    },
    {
        "key": "ramadan-fasting",
        "title": "Ramadan & Fasting",
        "description": "The month of the Quran: why fasting was prescribed and what makes its nights special.",
        "steps": [
            {"key": "fasting-prescribed", "title": "Fasting is prescribed for you", "kind": "quran", "reference": "2:183"},
            {"key": "month-of-quran", "title": "The month the Quran was sent down", "kind": "quran", "reference": "2:185"},
            {"key": "night-of-decree", "title": "The Night of Decree", "kind": "quran", "reference": "97:1"},
            {"key": "fasting-faith", "title": "Fasting with faith and hope of reward", "kind": "hadith", "reference": "bukhari 38"},
        ],
    },
    {
        "key": "quran-essentials",
        "title": "Meeting the Quran",
        "description": "The opening, the greatest verse, pure monotheism, and the first revelation.",
        "steps": [
            {"key": "opening", "title": "The Opening", "kind": "quran", "reference": "1:1"},
            {"key": "ayat-al-kursi", "title": "Ayat al-Kursi: the greatest verse", "kind": "quran", "reference": "2:255"},
            {"key": "sincerity", "title": "Say: He is Allah, One", "kind": "quran", "reference": "112:1"},
            {"key": "first-revelation", "title": "The first revelation", "kind": "quran", "reference": "96:1"},
            {"key": "learn-teach", "title": "The best of you learn and teach it", "kind": "hadith", "reference": "bukhari 5027"},
        ],
    },
    {
        "key": "character",
        "title": "Character (Akhlaq)",
        "description": "How the Quran and Sunnah shape daily conduct: speech, humility, anger, and kindness.",
        "steps": [
            {"key": "no-backbiting", "title": "Do not backbite", "kind": "quran", "reference": "49:12"},
            {"key": "walk-humbly", "title": "The servants of the Most Merciful", "kind": "quran", "reference": "25:63"},
            {"key": "no-arrogance", "title": "Do not turn your cheek in pride", "kind": "quran", "reference": "31:18"},
            {"key": "return-greeting", "title": "Return the greeting better", "kind": "quran", "reference": "4:86"},
            {"key": "love-for-brother", "title": "Love for your brother what you love for yourself", "kind": "hadith", "reference": "bukhari 13"},
            {"key": "do-not-be-angry", "title": "Do not become angry", "kind": "hadith", "reference": "bukhari 6116"},
            {"key": "smile-charity", "title": "A smile is charity", "kind": "hadith", "reference": "tirmidhi 1956"},
        ],
    },
    {
        "key": "new-muslim-intro",
        "title": "Beginning Islam",
        "description": "A gentle first path for new Muslims: the Opening, who Allah is, the five pillars, intentions, and hope in mercy.",
        "steps": [
            {"key": "the-opening", "title": "The Opening: the first surah you'll learn", "kind": "quran", "reference": "1:1"},
            {"key": "who-allah-is", "title": "Say: He is Allah, One", "kind": "quran", "reference": "112:1"},
            {"key": "built-on-five", "title": "Islam is built on five", "kind": "hadith", "reference": "bukhari 8"},
            {"key": "intentions-first", "title": "Actions are judged by intentions", "kind": "hadith", "reference": "bukhari 1"},
            {"key": "never-despair", "title": "Never despair of Allah's mercy", "kind": "quran", "reference": "39:53"},
            {"key": "religion-is-easy", "title": "The religion is easy", "kind": "hadith", "reference": "bukhari 39"},
        ],
    },
    {
        "key": "five-pillars",
        "title": "The Five Pillars",
        "description": "The foundations of Muslim life, one pillar at a time, from the sources.",
        "steps": [
            {"key": "the-five", "title": "Islam is built on five", "kind": "hadith", "reference": "bukhari 8"},
            {"key": "shahada", "title": "Shahada: He is Allah, One", "kind": "quran", "reference": "112:1"},
            {"key": "salah", "title": "Salah: establish the prayer", "kind": "quran", "reference": "2:43"},
            {"key": "zakat", "title": "Zakat: give what purifies", "kind": "quran", "reference": "2:110"},
            {"key": "sawm", "title": "Sawm: fasting is prescribed", "kind": "quran", "reference": "2:183"},
            {"key": "hajj", "title": "Hajj: pilgrimage to the House", "kind": "quran", "reference": "3:97"},
        ],
    },
    {
        "key": "seerah",
        "title": "The Life of the Prophet ﷺ",
        "description": "A first look at the seerah through the sources: the first revelation, his character, and his mission.",
        "steps": [
            {"key": "first-revelation", "title": "The cave of Hira: how revelation began", "kind": "hadith", "reference": "bukhari 3"},
            {"key": "not-forsaken", "title": "Your Lord has not forsaken you", "kind": "quran", "reference": "93:3"},
            {"key": "exalted-character", "title": "An exalted standard of character", "kind": "quran", "reference": "68:4"},
            {"key": "best-character", "title": "The best of people in character", "kind": "hadith", "reference": "bukhari 3559"},
            {"key": "excellent-example", "title": "An excellent example to follow", "kind": "quran", "reference": "33:21"},
            {"key": "mercy-to-worlds", "title": "A mercy to the worlds", "kind": "quran", "reference": "21:107"},
            {"key": "invite-with-wisdom", "title": "Invite with wisdom and good instruction", "kind": "quran", "reference": "16:125"},
        ],
    },
]

PATHS_BY_KEY = {p["key"]: p for p in PATHS}

# Revision quizzes, hand-authored so every answer is verifiable against a step's
# source (never AI-generated). `answer` is the index into `options`; `why` names
# the source the answer comes from.
QUIZZES: dict[str, list[dict]] = {
    "salah-basics": [
        {"q": "According to Quran 2:153, what should believers seek help through?", "options": ["Wealth and status", "Patience and prayer", "Fasting alone", "Travel"], "answer": 1, "why": "Quran 2:153"},
        {"q": "Quran 29:45 says prayer restrains a person from what?", "options": ["Poverty", "Illness", "Immorality and wrongdoing", "Hard work"], "answer": 2, "why": "Quran 29:45"},
        {"q": "Per Quran 4:103, prayer is decreed upon the believers at…", "options": ["Any convenient moment", "Specified times", "Once a week", "Night only"], "answer": 1, "why": "Quran 4:103"},
    ],
    "ramadan-fasting": [
        {"q": "Quran 2:183 says fasting was prescribed so that you may…", "options": ["Lose weight", "Become righteous (attain taqwa)", "Save food", "Sleep more"], "answer": 1, "why": "Quran 2:183"},
        {"q": "According to Quran 2:185, which month was the Quran sent down in?", "options": ["Muharram", "Rajab", "Ramadan", "Dhul-Hijjah"], "answer": 2, "why": "Quran 2:185"},
        {"q": "Surah 97 describes the Night of Decree as better than…", "options": ["A hundred days", "A thousand months", "Ten years", "All other nights combined"], "answer": 1, "why": "Quran 97:3"},
    ],
    "quran-essentials": [
        {"q": "Which surah is called \"The Opening\"?", "options": ["Al-Ikhlas", "Al-Fatiha", "Al-Baqarah", "Ya-Sin"], "answer": 1, "why": "Quran 1:1"},
        {"q": "Ayat al-Kursi is found in which surah?", "options": ["Al-Fatiha (1)", "Al-Baqarah (2)", "Al-Imran (3)", "Al-Ikhlas (112)"], "answer": 1, "why": "Quran 2:255"},
        {"q": "Per the hadith in this path, the best of you are those who…", "options": ["Memorize the most", "Learn the Quran and teach it", "Recite the fastest", "Write it beautifully"], "answer": 1, "why": "Sahih al-Bukhari 5027"},
    ],
    "character": [
        {"q": "Quran 49:12 compares backbiting to…", "options": ["Stealing from a neighbor", "Eating the flesh of one's dead brother", "Breaking a fast", "Lying under oath"], "answer": 1, "why": "Quran 49:12"},
        {"q": "The hadith \"none of you believes until…\" completes with:", "options": ["…he prays all night", "…he loves for his brother what he loves for himself", "…he gives all his wealth", "…he performs Hajj"], "answer": 1, "why": "Sahih al-Bukhari 13"},
        {"q": "The Prophet's ﷺ repeated advice to the man seeking counsel was:", "options": ["Do not become angry", "Fast every Monday", "Speak little", "Travel often"], "answer": 0, "why": "Sahih al-Bukhari 6116"},
    ],
    "new-muslim-intro": [
        {"q": "Per the hadith of the five pillars, Islam is built on how many things?", "options": ["Three", "Four", "Five", "Seven"], "answer": 2, "why": "Sahih al-Bukhari 8"},
        {"q": "\"Actions are judged by…\", the famous first hadith of Bukhari:", "options": ["…their outcomes", "…intentions", "…their difficulty", "…public approval"], "answer": 1, "why": "Sahih al-Bukhari 1"},
        {"q": "Quran 39:53 tells those who have sinned greatly to…", "options": ["Despair of forgiveness", "Never despair of Allah's mercy", "Hide their sins forever", "Give up worship"], "answer": 1, "why": "Quran 39:53"},
        {"q": "According to the hadith in this path, the religion is…", "options": ["Easy", "A burden", "Only for scholars", "Complicated"], "answer": 0, "why": "Sahih al-Bukhari 39"},
    ],
    "five-pillars": [
        {"q": "Which of these is NOT one of the five pillars named in the hadith?", "options": ["Prayer", "Zakat", "Jihad", "Hajj"], "answer": 2, "why": "Sahih al-Bukhari 8"},
        {"q": "Quran 2:183 prescribes which pillar?", "options": ["Fasting", "Zakat", "Hajj", "Shahada"], "answer": 0, "why": "Quran 2:183"},
        {"q": "Per Quran 3:97, pilgrimage to the House is a duty upon…", "options": ["Every human without exception", "Those who are able to find a way", "Scholars only", "Residents of Makkah"], "answer": 1, "why": "Quran 3:97"},
    ],
    "seerah": [
        {"q": "Where was the Prophet ﷺ when the first revelation came?", "options": ["The cave of Hira", "Madinah", "Jerusalem", "Ta'if"], "answer": 0, "why": "Sahih al-Bukhari 3"},
        {"q": "Quran 68:4 describes the Prophet ﷺ as having…", "options": ["Great wealth", "An exalted standard of character", "Many titles", "A long lineage"], "answer": 1, "why": "Quran 68:4"},
        {"q": "Quran 21:107 says he ﷺ was sent as…", "options": ["A judge over all disputes", "A mercy to the worlds", "A king", "A poet"], "answer": 1, "why": "Quran 21:107"},
        {"q": "Quran 16:125 says to invite to your Lord's way with…", "options": ["Force", "Wisdom and good instruction", "Wealth", "Silence"], "answer": 1, "why": "Quran 16:125"},
    ],
}

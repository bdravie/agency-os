// Pure data and helper functions for Section 11: Liquid glass YouVersion Bible widget.
// Zero Node or database dependencies so this module can be tested anywhere and used client-side and server-side.

export type BibleVerse = {
  id: number;
  reference: string;
  book: string;
  chapter: number;
  verses: string;
  text: string;
  youVersionUrl: string;
};

export const CURATED_VERSES: BibleVerse[] = [
  {
    id: 1,
    reference: "Proverbs 3:5-6",
    book: "Proverbs",
    chapter: 3,
    verses: "5-6",
    text: "Trust in the Lord with all your heart, and do not lean on your own understanding. In all your ways acknowledge him, and he will make straight your paths.",
    youVersionUrl: "https://www.bible.com/bible/111/PRO.3.5-6",
  },
  {
    id: 2,
    reference: "Philippians 4:6-7",
    book: "Philippians",
    chapter: 4,
    verses: "6-7",
    text: "Do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God. And the peace of God, which surpasses all understanding, will guard your hearts and your minds.",
    youVersionUrl: "https://www.bible.com/bible/111/PHP.4.6-7",
  },
  {
    id: 3,
    reference: "Colossians 3:23-24",
    book: "Colossians",
    chapter: 3,
    verses: "23-24",
    text: "Whatever you do, work heartily, as for the Lord and not for men, knowing that from the Lord you will receive the inheritance as your reward. You are serving the Lord Christ.",
    youVersionUrl: "https://www.bible.com/bible/111/COL.3.23-24",
  },
  {
    id: 4,
    reference: "Isaiah 40:31",
    book: "Isaiah",
    chapter: 40,
    verses: "31",
    text: "They who wait for the Lord shall renew their strength; they shall mount up with wings like eagles; they shall run and not be weary; they shall walk and not faint.",
    youVersionUrl: "https://www.bible.com/bible/111/ISA.40.31",
  },
  {
    id: 5,
    reference: "Joshua 1:9",
    book: "Joshua",
    chapter: 1,
    verses: "9",
    text: "Have I not commanded you? Be strong and courageous. Do not be frightened, and do not be dismayed, for the Lord your God is with you wherever you go.",
    youVersionUrl: "https://www.bible.com/bible/111/JOS.1.9",
  },
  {
    id: 6,
    reference: "Matthew 6:33",
    book: "Matthew",
    chapter: 6,
    verses: "33",
    text: "Seek first the kingdom of God and his righteousness, and all these things will be added to you.",
    youVersionUrl: "https://www.bible.com/bible/111/MAT.6.33",
  },
  {
    id: 7,
    reference: "Romans 12:2",
    book: "Romans",
    chapter: 12,
    verses: "2",
    text: "Do not be conformed to this world, but be transformed by the renewal of your mind, that by testing you may discern what is the will of God, what is good and acceptable and perfect.",
    youVersionUrl: "https://www.bible.com/bible/111/ROM.12.2",
  },
  {
    id: 8,
    reference: "Jeremiah 29:11",
    book: "Jeremiah",
    chapter: 29,
    verses: "11",
    text: "For I know the plans I have for you, declares the Lord, plans for welfare and not for evil, to give you a future and a hope.",
    youVersionUrl: "https://www.bible.com/bible/111/JER.29.11",
  },
  {
    id: 9,
    reference: "Galatians 6:9",
    book: "Galatians",
    chapter: 6,
    verses: "9",
    text: "And let us not grow weary of doing good, for in due season we will reap, if we do not give up.",
    youVersionUrl: "https://www.bible.com/bible/111/GAL.6.9",
  },
  {
    id: 10,
    reference: "Psalm 46:1-2",
    book: "Psalm",
    chapter: 46,
    verses: "1-2",
    text: "God is our refuge and strength, a very present help in trouble. Therefore we will not fear though the earth gives way, though the mountains be moved into the heart of the sea.",
    youVersionUrl: "https://www.bible.com/bible/111/PSA.46.1-2",
  },
  {
    id: 11,
    reference: "Proverbs 16:3",
    book: "Proverbs",
    chapter: 16,
    verses: "3",
    text: "Commit your work to the Lord, and your plans will be established.",
    youVersionUrl: "https://www.bible.com/bible/111/PRO.16.3",
  },
  {
    id: 12,
    reference: "2 Timothy 1:7",
    book: "2 Timothy",
    chapter: 1,
    verses: "7",
    text: "For God gave us a spirit not of fear but of power and love and self-control.",
    youVersionUrl: "https://www.bible.com/bible/111/2TI.1.7",
  },
  {
    id: 13,
    reference: "Psalm 23:1-3",
    book: "Psalm",
    chapter: 23,
    verses: "1-3",
    text: "The Lord is my shepherd; I shall not want. He makes me lie down in green pastures. He leads me beside still waters. He restores my soul.",
    youVersionUrl: "https://www.bible.com/bible/111/PSA.23.1-3",
  },
  {
    id: 14,
    reference: "Hebrews 11:1",
    book: "Hebrews",
    chapter: 11,
    verses: "1",
    text: "Now faith is the assurance of things hoped for, the conviction of things not seen.",
    youVersionUrl: "https://www.bible.com/bible/111/HEB.11.1",
  },
  {
    id: 15,
    reference: "James 1:5",
    book: "James",
    chapter: 1,
    verses: "5",
    text: "If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you.",
    youVersionUrl: "https://www.bible.com/bible/111/JAS.1.5",
  },
];

/**
 * Calculates day of the year (1 - 366).
 */
export function getDayOfYear(date: Date = new Date()): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Selects the daily verse deterministically from the calendar day.
 */
export function getDailyVerse(date: Date = new Date()): BibleVerse {
  const day = getDayOfYear(date);
  const index = day % CURATED_VERSES.length;
  return CURATED_VERSES[index];
}

/**
 * Returns a fresh random verse, avoiding immediate repeat of currentId.
 */
export function getRandomVerse(currentId?: number): BibleVerse {
  const pool = currentId
    ? CURATED_VERSES.filter((v) => v.id !== currentId)
    : CURATED_VERSES;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index] ?? CURATED_VERSES[0];
}

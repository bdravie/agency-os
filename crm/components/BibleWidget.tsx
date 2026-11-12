"use client";

import { useState } from "react";
import { BookOpen, RefreshCw, ExternalLink, Sparkles } from "lucide-react";
import { type BibleVerse, getRandomVerse } from "@/lib/bibleVerses";

export default function BibleWidget({
  initialVerse,
}: {
  initialVerse: BibleVerse;
}) {
  const [verse, setVerse] = useState<BibleVerse>(initialVerse);
  const [fading, setFading] = useState(false);

  const handleNextVerse = () => {
    setFading(true);
    setTimeout(() => {
      setVerse((prev) => getRandomVerse(prev.id));
      setFading(false);
    }, 180);
  };

  return (
    <div
      className="bible-widget"
      role="region"
      aria-label="Daily Scripture"
    >
      {/* Header row */}
      <div className="bible-head">
        <div className="bible-tag">
          <BookOpen size={13} style={{ color: "var(--accent)" }} aria-hidden />
          <span>Verse of the day</span>
        </div>
        <div className="bible-actions">
          <button
            type="button"
            className="bible-btn"
            onClick={handleNextVerse}
            title="Get another verse"
            aria-label="Get another verse"
          >
            <RefreshCw size={11} className={fading ? "spin-quick" : ""} aria-hidden />
            <span>New verse</span>
          </button>
          <a
            href={verse.youVersionUrl}
            target="_blank"
            rel="noreferrer"
            className="bible-btn youversion"
            title="Read on YouVersion / Bible.com"
          >
            <span>YouVersion</span>
            <ExternalLink size={10} aria-hidden />
          </a>
        </div>
      </div>

      {/* Verse quote and reference */}
      <div className={`bible-body${fading ? " is-fading" : ""}`}>
        <p className="bible-text">
          <span className="bible-quote-mark" aria-hidden="true">“</span>
          {verse.text}
          <span className="bible-quote-mark" aria-hidden="true">”</span>
        </p>
        <div className="bible-ref">{verse.reference}</div>
      </div>
    </div>
  );
}

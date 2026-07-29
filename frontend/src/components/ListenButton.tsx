"use client";

import { useEffect, useState } from "react";

// Reads an answer aloud with the browser's built-in voice. For readers who
// find listening easier than reading. Answer prose only; the Quranic Arabic
// on verse cards is never synthesized.
export default function ListenButton({ text }: { text: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!supported || !text) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const clean = text.replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
    const utterance = new SpeechSynthesisUtterance(clean);
    // Urdu answers are written in Arabic script; pick the matching voice family
    utterance.lang = /[؀-ۿ]/.test(clean) ? "ur-PK" : "en-US";
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utterance);
    setSpeaking(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors duration-200 ${
        speaking
          ? "border-primary/60 bg-accent-soft text-accent"
          : "border-border text-muted hover:border-primary hover:text-text"
      }`}
    >
      {speaking ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H3v6h3l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      )}
      {speaking ? "Stop" : "Listen"}
    </button>
  );
}

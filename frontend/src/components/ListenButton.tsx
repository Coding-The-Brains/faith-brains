"use client";

import { useEffect, useState } from "react";
import { speakText, stopSpeaking } from "@/lib/tts";

// Reads an answer aloud with the browser's built-in voice.
export default function ListenButton({ text }: { text: string }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => stopSpeaking();
  }, []);

  if (!supported || !text) return null;

  function toggle() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (speakText(text, () => setSpeaking(false))) setSpeaking(true);
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

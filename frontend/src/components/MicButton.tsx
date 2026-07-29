"use client";

import { useEffect, useRef, useState } from "react";
import VoiceOverlay from "./VoiceOverlay";

type MicState = "idle" | "recording" | "busy";

const MAX_SECONDS = 60;

// Voice input: record → /api/v1/transcribe (Whisper) → text lands in the ask
// box for review. Never auto-submits.
export default function MicButton({
  onText,
  onError,
  large = false,
}: {
  onText: (text: string) => void;
  onError: (message: string) => void;
  large?: boolean;
}) {
  const [state, setState] = useState<MicState>("idle");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    onError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Microphone access was blocked. Allow it in your browser and try again.");
      return;
    }
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      if (blob.size === 0) {
        setState("idle");
        return;
      }
      setState("busy");
      try {
        const form = new FormData();
        form.append("audio", blob, "voice.webm");
        const res = await fetch("/api/v1/transcribe", { method: "POST", body: form });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          onError(body?.detail ?? "Could not transcribe the recording. Try again.");
        } else if (body?.text) {
          onText(body.text);
        } else {
          onError("Nothing was heard. Try again closer to the microphone.");
        }
      } catch {
        onError("Could not reach the server. Try again in a moment.");
      } finally {
        setState("idle");
      }
    };
    recorder.start();
    setState("recording");
    timerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, MAX_SECONDS * 1000);
  }

  function stop() {
    if (timerRef.current) clearTimeout(timerRef.current);
    recorderRef.current?.stop();
  }

  const recording = state === "recording";

  if (large) {
    // The mom-friendly entry point: opens the full-screen voice orb (GPT-live style)
    return (
      <>
        <button
          type="button"
          onClick={() => setOverlayOpen(true)}
          className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-3 rounded-full border border-primary/50 bg-accent-soft px-6 py-3 text-base font-bold text-accent transition-colors duration-200 hover:border-primary"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
          </svg>
          Ask by voice · <span lang="ur">بول کر پوچھیں</span>
        </button>
        {overlayOpen && (
          <VoiceOverlay
            onText={onText}
            onError={onError}
            onClose={() => setOverlayOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={recording ? stop : state === "idle" ? start : undefined}
      disabled={state === "busy"}
      aria-label={recording ? "Stop recording" : state === "busy" ? "Transcribing" : "Ask by voice"}
      title={recording ? "Stop recording" : "Ask by voice"}
      className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors duration-200 ${
        recording
          ? "border-primary bg-primary/15 text-primary"
          : "border-border text-muted hover:border-primary hover:text-text"
      } disabled:cursor-default disabled:opacity-60`}
    >
      {state === "busy" ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
        </svg>
      ) : recording ? (
        <span className="relative flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
          <span className="absolute h-full w-full animate-ping rounded-full bg-primary/40" />
          <span className="relative h-2.5 w-2.5 rounded-sm bg-primary" />
        </span>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
        </svg>
      )}
    </button>
  );
}

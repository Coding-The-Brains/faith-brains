"use client";

import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 60;

// Haptic feedback where the device supports it (Android); silent no-op elsewhere
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported: fine
  }
}

// Full-screen voice mode: a big orb that breathes with the speaker's voice
// (live mic amplitude drives the rings). Tap the orb to finish, X to cancel.
// Transcription then lands in the ask box for review, same as the small mic.
export default function VoiceOverlay({
  onText,
  onError,
  onClose,
}: {
  onText: (text: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"starting" | "listening" | "busy">("starting");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const orbRef = useRef<HTMLButtonElement>(null);
  const ring1Ref = useRef<HTMLDivElement>(null);
  const ring2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopTimer: ReturnType<typeof setTimeout> | null = null;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        onError("Microphone access was blocked. Allow it in your browser and try again.");
        onClose();
        return;
      }
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream?.getTracks().forEach((t) => t.stop());
        if (cancelledRef.current) return;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) {
          onClose();
          return;
        }
        setPhase("busy");
        try {
          const form = new FormData();
          form.append("audio", blob, "voice.webm");
          const res = await fetch("/api/v1/transcribe", { method: "POST", body: form });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            buzz(80);
            onError(body?.detail ?? "Could not transcribe the recording. Try again.");
          } else if (body?.text) {
            buzz([20, 50, 20]); // "got it"
            onText(body.text);
          } else {
            buzz(80);
            onError("Nothing was heard. Try again closer to the microphone.");
          }
        } catch {
          onError("Could not reach the server. Try again in a moment.");
        }
        onClose();
      };
      recorder.start();
      setPhase("listening");
      buzz(30); // "I'm listening"
      stopTimer = setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_SECONDS * 1000);

      // Live amplitude → orb + rings, unless the user prefers reduced motion
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let smooth = 0;
        const tick = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const raw = Math.min(1, sum / data.length / 90);
          smooth += (raw - smooth) * 0.25;
          if (orbRef.current) orbRef.current.style.transform = `scale(${1 + smooth * 0.1})`;
          if (ring1Ref.current) {
            ring1Ref.current.style.transform = `scale(${1 + smooth * 0.35})`;
            ring1Ref.current.style.opacity = String(0.25 + smooth * 0.5);
          }
          if (ring2Ref.current) {
            ring2Ref.current.style.transform = `scale(${1 + smooth * 0.7})`;
            ring2Ref.current.style.opacity = String(0.12 + smooth * 0.4);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    start();
    return () => {
      if (stopTimer) clearTimeout(stopTimer);
      cancelAnimationFrame(rafRef.current);
      audioCtxRef.current?.close().catch(() => {});
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    buzz(15); // tap acknowledged
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function cancel() {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-bg/95 backdrop-blur-md">
      <button
        type="button"
        onClick={cancel}
        aria-label="Cancel voice input"
        className="absolute right-5 top-5 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-primary hover:text-text"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <div className="relative flex h-72 w-72 items-center justify-center">
        <div
          ref={ring2Ref}
          className="absolute h-64 w-64 rounded-full border-2 border-primary/40 transition-none"
          style={{ opacity: 0.12 }}
          aria-hidden="true"
        />
        <div
          ref={ring1Ref}
          className="absolute h-52 w-52 rounded-full bg-primary/10 transition-none"
          style={{ opacity: 0.25 }}
          aria-hidden="true"
        />
        <button
          ref={orbRef}
          type="button"
          onClick={finish}
          disabled={phase !== "listening"}
          aria-label="Finish and transcribe"
          className={`h-40 w-40 cursor-pointer rounded-full shadow-lift ${phase === "busy" ? "animate-pulse" : ""}`}
          style={{
            background: "radial-gradient(circle at 35% 30%, var(--primary), var(--accent) 75%)",
            boxShadow: "0 0 90px color-mix(in srgb, var(--primary) 35%, transparent)",
          }}
        />
      </div>

      <p className="mt-8 text-lg font-semibold tracking-tight text-text">
        {phase === "busy" ? "Writing it down…" : "Listening…"}
      </p>
      <p className="mt-1 text-sm text-muted">
        {phase === "busy" ? (
          "One moment"
        ) : (
          <>
            Speak, then tap the circle when done · <span lang="ur">بولیں، پھر دائرے کو دبائیں</span>
          </>
        )}
      </p>
    </div>
  );
}

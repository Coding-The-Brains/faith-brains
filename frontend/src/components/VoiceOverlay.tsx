"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { handsFreeEnabled, liveSpeech, setHandsFree, stopSpeaking } from "@/lib/tts";

const MAX_SECONDS = 60;
const THINKING_TIMEOUT_MS = 120_000; // safety: never strand the user on "Thinking…"

// Haptic feedback where the device supports it (Android); silent no-op elsewhere
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // not supported: fine
  }
}

type Phase = "starting" | "listening" | "busy" | "thinking" | "speaking" | "again";

// Full-screen voice mode: a big orb that breathes with the speaker's voice.
// Hands-free keeps the session alive end to end, GPT-audio style: speak, the
// question is asked, and the answer talks back sentence by sentence while the
// rest still streams. Tap the orb to finish / stop / ask again; Escape leaves.
export default function VoiceOverlay({
  onText,
  onError,
  onClose,
}: {
  onText: (text: string) => void;
  onError: (message: string) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [handsFree, setHandsFreeState] = useState(false);
  const phaseRef = useRef<Phase>("starting");
  phaseRef.current = phase;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orbRef = useRef<HTMLButtonElement>(null);
  const ring1Ref = useRef<HTMLDivElement>(null);
  const ring2Ref = useRef<HTMLDivElement>(null);

  const reducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const setOrb = useCallback((level: number) => {
    if (orbRef.current) orbRef.current.style.transform = `scale(${1 + level * 0.1})`;
    if (ring1Ref.current) {
      ring1Ref.current.style.transform = `scale(${1 + level * 0.35})`;
      ring1Ref.current.style.opacity = String(0.25 + level * 0.5);
    }
    if (ring2Ref.current) {
      ring2Ref.current.style.transform = `scale(${1 + level * 0.7})`;
      ring2Ref.current.style.opacity = String(0.12 + level * 0.4);
    }
  }, []);

  const stopVisuals = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (pulseRef.current) clearInterval(pulseRef.current);
    pulseRef.current = null;
  }, []);

  const releaseMic = useCallback(() => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    liveSpeech.stop(); // never record while the previous answer is still talking
    stopVisuals();
    setPhase("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Microphone access was blocked. Allow it in your browser and try again.");
      onClose();
      return;
    }
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      releaseMic();
      stopVisuals();
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
          if (handsFreeEnabled()) {
            // stay in the session: the parent asks, the answer speaks back here
            setPhase("thinking");
            if (thinkTimerRef.current) clearTimeout(thinkTimerRef.current);
            thinkTimerRef.current = setTimeout(() => {
              if (phaseRef.current === "thinking") setPhase("again");
            }, THINKING_TIMEOUT_MS);
            onText(body.text);
            return;
          }
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
    stopTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, MAX_SECONDS * 1000);

    // Live amplitude → orb + rings, unless the user prefers reduced motion
    if (!reducedMotion()) {
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
        setOrb(smooth);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [onClose, onError, onText, releaseMic, setOrb, stopVisuals]);

  // The answer speaking back drives the orb with a gentle synthetic pulse
  useEffect(() => {
    return liveSpeech.onState((state) => {
      if (state === "speaking") {
        if (thinkTimerRef.current) clearTimeout(thinkTimerRef.current);
        setPhase("speaking");
        buzz(10);
        if (!reducedMotion() && !pulseRef.current) {
          let t = 0;
          pulseRef.current = setInterval(() => {
            t += 0.24;
            setOrb(0.22 + Math.abs(Math.sin(t)) * 0.5);
          }, 90);
        }
      } else if (phaseRef.current === "speaking" || phaseRef.current === "thinking") {
        stopVisuals();
        setOrb(0);
        setPhase("again");
      }
    });
  }, [setOrb, stopVisuals]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    if (thinkTimerRef.current) clearTimeout(thinkTimerRef.current);
    stopVisuals();
    releaseMic();
    stopSpeaking();
    onClose();
  }, [onClose, releaseMic, stopVisuals]);

  useEffect(() => {
    setHandsFreeState(handsFreeEnabled());
    stopSpeaking();
    startRecording();
    orbRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelledRef.current = true;
      stopVisuals();
      releaseMic();
      if (thinkTimerRef.current) clearTimeout(thinkTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function orbTap() {
    if (phase === "listening") {
      buzz(15);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    } else if (phase === "speaking") {
      liveSpeech.stop(); // state listener moves us to "again"
    } else if (phase === "again") {
      cancelledRef.current = false;
      startRecording();
    }
  }

  const orbLabel: Record<Phase, string> = {
    starting: "Starting the microphone",
    listening: "Finish and transcribe",
    busy: "Transcribing",
    thinking: "Waiting for the answer",
    speaking: "Stop the answer",
    again: "Ask another question",
  };

  const title: Record<Phase, string> = {
    starting: "One moment…",
    listening: "Listening…",
    busy: "Writing it down…",
    thinking: "Thinking…",
    speaking: "Answering…",
    again: "Anything else?",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Voice mode"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-bg/95 backdrop-blur-md"
    >
      <button
        type="button"
        onClick={cancel}
        aria-label="Close voice mode"
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
          onClick={orbTap}
          disabled={phase === "starting" || phase === "busy" || phase === "thinking"}
          aria-label={orbLabel[phase]}
          className={`h-40 w-40 cursor-pointer rounded-full shadow-lift ${
            phase === "busy" || phase === "thinking" ? "animate-pulse" : ""
          }`}
          style={{
            background: "radial-gradient(circle at 35% 30%, var(--primary), var(--accent) 75%)",
            boxShadow: "0 0 90px color-mix(in srgb, var(--primary) 35%, transparent)",
          }}
        />
      </div>

      <p className="mt-8 text-lg font-semibold tracking-tight text-text" aria-live="polite">
        {title[phase]}
      </p>
      <p className="mt-1 text-sm text-muted">
        {phase === "listening" && (
          <>
            Speak, then tap the circle when done · <span lang="ur">بولیں، پھر دائرے کو دبائیں</span>
          </>
        )}
        {phase === "busy" && "One moment"}
        {phase === "thinking" && "Finding it in the sources"}
        {phase === "speaking" && "Tap the circle to stop"}
        {phase === "again" && (
          <>
            Tap the circle to ask again · <span lang="ur">دوبارہ پوچھنے کے لیے دائرہ دبائیں</span>
          </>
        )}
        {(phase === "starting") && " "}
      </p>

      <button
        type="button"
        onClick={() => {
          const next = !handsFree;
          setHandsFree(next);
          setHandsFreeState(next);
          buzz(10);
        }}
        aria-pressed={handsFree}
        className={`mt-8 inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-xs transition-colors duration-200 ${
          handsFree
            ? "border-primary/60 bg-accent-soft text-accent"
            : "border-border text-muted hover:border-primary hover:text-text"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${handsFree ? "bg-primary" : "bg-border"}`}
          aria-hidden="true"
        />
        {handsFree
          ? "Hands-free on: the answer is spoken back here"
          : "Hands-free off: your words go to the box first"}
      </button>
    </div>
  );
}

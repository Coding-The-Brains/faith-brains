// Browser text-to-speech shared by the Listen button and hands-free voice mode.
// Answer prose only; Quranic Arabic on verse cards is never synthesized.

function cleanForSpeech(text: string): string {
  return text.replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
}

function makeUtterance(text: string): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  // Urdu answers are written in Arabic script; pick the matching voice family
  u.lang = /[؀-ۿ]/.test(text) ? "ur-PK" : "en-US";
  u.rate = 0.95;
  return u;
}

export function speakText(text: string, onEnd?: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const clean = cleanForSpeech(text);
  if (!clean) return false;
  liveSpeech.stop(); // one voice at a time, whichever feature started it
  const utterance = makeUtterance(clean);
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  liveSpeech.stop();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

// --- live streaming speech (GPT-audio style) ---------------------------------
// Feed answer deltas in as they stream; complete sentences are spoken while the
// rest of the answer is still arriving. finish() flushes the tail.

export type LiveSpeechState = "idle" | "speaking";

const SENTENCE_END = /([.!?؟۔])(\s+|$)/;
const MIN_CHUNK = 24; // don't speak fragments like "1." from a numbered list

class LiveSpeech {
  private buffer = "";
  private queue: string[] = [];
  private speaking = false;
  private active = false;
  private listeners = new Set<(s: LiveSpeechState) => void>();

  onState(fn: (s: LiveSpeechState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(state: LiveSpeechState) {
    this.listeners.forEach((fn) => fn(state));
  }

  get state(): LiveSpeechState {
    return this.speaking ? "speaking" : "idle";
  }

  /** Start a live session: clears anything left from the previous one. */
  begin(): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    this.buffer = "";
    this.queue = [];
    this.speaking = false;
    this.active = true;
  }

  /** Add streamed text; speaks every complete sentence it can peel off. */
  push(delta: string): void {
    if (!this.active) return;
    this.buffer += delta;
    let m;
    while ((m = SENTENCE_END.exec(this.buffer)) !== null) {
      const end = m.index + m[1].length;
      const sentence = this.buffer.slice(0, end);
      if (cleanForSpeech(sentence).length < MIN_CHUNK && this.queue.length === 0 && !this.speaking) {
        // too short to sound natural alone; wait for more text
        break;
      }
      this.buffer = this.buffer.slice(end);
      this.enqueue(sentence);
    }
  }

  /** No more text coming; speak whatever is left. */
  finish(): void {
    if (!this.active) return;
    if (this.buffer.trim()) this.enqueue(this.buffer);
    this.buffer = "";
  }

  stop(): void {
    const wasActive = this.active || this.speaking;
    this.active = false;
    this.buffer = "";
    this.queue = [];
    this.speaking = false;
    if (typeof window !== "undefined" && "speechSynthesis" in window && wasActive) {
      window.speechSynthesis.cancel();
    }
    if (wasActive) this.emit("idle");
  }

  private enqueue(text: string) {
    const clean = cleanForSpeech(text);
    if (!clean) return;
    this.queue.push(clean);
    if (!this.speaking) this.next();
  }

  private next() {
    const text = this.queue.shift();
    if (text === undefined) {
      if (this.speaking) {
        this.speaking = false;
        this.emit("idle");
      }
      return;
    }
    if (!this.speaking) {
      this.speaking = true;
      this.emit("speaking");
    }
    const u = makeUtterance(text);
    u.onend = () => this.next();
    u.onerror = () => this.next();
    window.speechSynthesis.speak(u);
  }
}

export const liveSpeech = new LiveSpeech();

// Hands-free preference: speak a question, hear the answer, no taps between
const HF_KEY = "faithbrains.handsfree.v1";

export function handsFreeEnabled(): boolean {
  try {
    return window.localStorage.getItem(HF_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHandsFree(on: boolean): void {
  try {
    window.localStorage.setItem(HF_KEY, on ? "1" : "0");
  } catch {
    // storage blocked: the toggle just does not persist
  }
}

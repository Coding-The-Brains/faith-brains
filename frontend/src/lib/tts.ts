// Browser text-to-speech shared by the Listen button and hands-free mode.
// Answer prose only; Quranic Arabic on verse cards is never synthesized.

export function speakText(text: string, onEnd?: () => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const clean = text.replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();
  if (!clean) return false;
  const utterance = new SpeechSynthesisUtterance(clean);
  // Urdu answers are written in Arabic script; pick the matching voice family
  utterance.lang = /[؀-ۿ]/.test(clean) ? "ur-PK" : "en-US";
  utterance.rate = 0.95;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

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

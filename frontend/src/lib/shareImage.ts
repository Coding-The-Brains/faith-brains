// Renders a verse/hadith as an Aqua Noir share card (1080x1350, Instagram
// portrait) on a client canvas. No server round-trip; fonts come from the page.

const W = 1080;
const H = 1350;
const MARGIN = 96;

const DARK = {
  bg: "#060b0b",
  surface: "#0e1717",
  border: "#21302e",
  text: "#e8edec",
  muted: "#9db0ad",
  primary: "#00e6c3",
  accent: "#14b8a6",
};

function fontFamily(cssVar: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return v || fallback;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const half = size / 2;
  ctx.save();
  ctx.strokeStyle = DARK.primary;
  ctx.lineWidth = 3;
  ctx.strokeRect(cx - half, cy - half, size, size);
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-half, -half, size, size);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = DARK.primary;
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export async function buildShareImage({
  arabic,
  english,
  reference,
}: {
  arabic: string | null;
  english: string | null;
  reference: string;
}): Promise<Blob> {
  const amiri = fontFamily("--font-amiri", "serif");
  const sans = fontFamily("--font-geist-sans", "sans-serif");
  const mono = fontFamily("--font-geist-mono", "monospace");

  // Make sure glyphs are actually loaded before measuring
  await Promise.all([
    document.fonts.load(`400 64px ${amiri}`, arabic ?? "بسم"),
    document.fonts.load(`400 40px ${sans}`, "A"),
    document.fonts.load(`400 26px ${mono}`, "A"),
  ]).catch(() => {});

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ground + card
  ctx.fillStyle = DARK.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = DARK.surface;
  ctx.strokeStyle = DARK.border;
  ctx.lineWidth = 2;
  const r = 48;
  const cardX = 48;
  const cardY = 48;
  const cardW = W - 96;
  const cardH = H - 96;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, r);
  ctx.fill();
  ctx.stroke();

  // top hairline accent
  const grad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(0.5, DARK.primary);
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(cardX + r, cardY, cardW - 2 * r, 3);

  const maxWidth = W - 2 * MARGIN;
  // measure first so the block can be vertically centered
  ctx.font = `400 64px ${amiri}`;
  const arabicLines = arabic ? wrap(ctx, arabic, maxWidth) : [];
  ctx.font = `400 40px ${sans}`;
  const cleanEnglish = english?.replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ") ?? null;
  let englishLines = cleanEnglish ? wrap(ctx, cleanEnglish, maxWidth) : [];
  const maxEnglish = arabicLines.length > 4 ? 6 : 10;
  if (englishLines.length > maxEnglish) {
    englishLines = englishLines.slice(0, maxEnglish);
    englishLines[maxEnglish - 1] = englishLines[maxEnglish - 1].replace(/\s+\S*$/, "") + "…";
  }
  const arabicLH = 128; // generous leading, matches the reader
  const englishLH = 58;
  const blockH =
    arabicLines.length * arabicLH +
    (arabicLines.length && englishLines.length ? 72 : 0) +
    englishLines.length * englishLH;
  let y = Math.max(240, (H - blockH) / 2 - 40);

  // star mark
  drawStar(ctx, W / 2, 160, 44);

  // Arabic, centered RTL
  ctx.textAlign = "center";
  ctx.direction = "rtl";
  ctx.fillStyle = DARK.text;
  ctx.font = `400 64px ${amiri}`;
  for (const line of arabicLines) {
    ctx.fillText(line, W / 2, y + 64);
    y += arabicLH;
  }

  // divider
  if (arabicLines.length && englishLines.length) {
    ctx.fillStyle = DARK.border;
    ctx.fillRect(W / 2 - 120, y + 8, 240, 2);
    y += 72;
  }

  // translation
  ctx.direction = "ltr";
  ctx.fillStyle = "rgba(232, 237, 236, 0.88)";
  ctx.font = `400 40px ${sans}`;
  for (const line of englishLines) {
    ctx.fillText(line, W / 2, y + 40);
    y += englishLH;
  }

  // reference, mono uppercase tracked
  ctx.fillStyle = DARK.accent;
  ctx.font = `500 26px ${mono}`;
  const ref = reference.toUpperCase().split("").join(" "); // light tracking
  ctx.fillText(ref, W / 2, H - 170);

  ctx.fillStyle = DARK.muted;
  ctx.font = `400 24px ${sans}`;
  ctx.fillText("FaithBrains · every answer from the source", W / 2, H - 116);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas export failed"))), "image/png")
  );
}

export async function shareImage(args: Parameters<typeof buildShareImage>[0]): Promise<void> {
  const blob = await buildShareImage(args);
  const file = new File([blob], `${args.reference.replace(/[^\w:]+/g, "-").toLowerCase()}.png`, {
    type: "image/png",
  });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch {
      // user cancelled or share failed: fall through to download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

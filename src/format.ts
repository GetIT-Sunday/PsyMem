const W = 60;

// Game Boy pixel borders
const TOP = "█▀" + "▀".repeat(W - 4) + "▀█";
const BOT = "█▄" + "▄".repeat(W - 4) + "▄█";
const MID = "█▄" + "▄".repeat(W - 4) + "▄█";

/** Display width: CJK/fullwidth = 2, ASCII = 1 */
function dwidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (
      (cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2E80 && cp <= 0x9FFF) ||
      (cp >= 0xAC00 && cp <= 0xD7AF) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE30 && cp <= 0xFE6F) ||
      (cp >= 0xFF01 && cp <= 0xFF60) ||
      (cp >= 0x20000 && cp <= 0x2FA1F)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function padTo(s: string, target: number): string {
  return s + " ".repeat(Math.max(0, target - dwidth(s)));
}

function bodyLine(text: string): string {
  return `█ ${padTo(text, W - 4)} █`;
}

function titleLine(text: string): string {
  const inner = W - 2;
  const w = dwidth(text);
  const left = Math.max(0, Math.floor((inner - w) / 2));
  const right = Math.max(0, inner - w - left);
  return `█${"▄".repeat(left)}${text}${"▄".repeat(right)}█`;
}

/** Wrap text into lines respecting display width */
function wrap(text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    if (dwidth(raw) <= maxW) {
      lines.push(raw);
    } else {
      let buf = "";
      for (const ch of raw) {
        if (dwidth(buf + ch) > maxW) {
          lines.push(buf);
          buf = ch;
        } else {
          buf += ch;
        }
      }
      if (buf) lines.push(buf);
    }
  }
  return lines;
}

function render(title: string, body: string): string {
  const bodyLines = wrap(body, W - 4).map(bodyLine);
  return [
    TOP,
    titleLine(` ${title} `),
    MID,
    "",
    ...bodyLines,
    "",
    BOT,
  ].join("\n");
}

export function brand(body: string): string {
  const match = body.match(/^\[(\w+)\]/);
  const title = match ? match[1].toUpperCase() : "PSYMEM";
  return render(title, body);
}

export function guide(text: string): string {
  return wrap(text, W - 10).map(l => `  [?] ${l}`).join("\n");
}

export function success(text: string): string {
  return brand(`[■] ${text}`);
}

export function error(text: string): string {
  return brand(`[!] ${text}`);
}

export function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] };
}

export function branded(body: string) {
  return text(brand(body));
}

export function brandedGuide(body: string, guideText: string) {
  return text(brand(body + "\n\n" + guide(guideText)));
}

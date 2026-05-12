const HEADER = "[PsyMem]";
const LINE = "═".repeat(40);

export function brand(body: string): string {
  return `${HEADER}\n${LINE}\n${body}\n${LINE}`;
}

export function guide(text: string): string {
  return `\n>> ${text}`;
}

export function success(text: string): string {
  return brand(`[OK] ${text}`);
}

export function error(text: string): string {
  return brand(`[ERROR] ${text}`);
}

export function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] };
}

export function branded(body: string) {
  return text(brand(body));
}

export function brandedGuide(body: string, guideText: string) {
  return text(brand(body + guide(guideText)));
}

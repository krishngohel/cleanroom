import type { DlpPattern } from "../api/client";

export interface RedactionResult {
  text: string;
  redactions: { label: string; count: number }[];
}

/**
 * Apply tenant-configured DLP patterns to text. Returns the redacted text
 * and a per-label count of how many matches were redacted (for telemetry
 * + the disclosure UI). Invalid regexes are skipped silently.
 */
export function applyDlp(text: string, patterns: DlpPattern[]): RedactionResult {
  let out = text;
  const counts = new Map<string, number>();

  for (const p of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(p.pattern, "gi");
    } catch {
      continue;
    }
    out = out.replace(re, (match) => {
      counts.set(p.label, (counts.get(p.label) ?? 0) + 1);
      // Keep the length roughly stable so token counts don't change wildly.
      return `[${p.label}_REDACTED]`;
    });
  }

  return {
    text: out,
    redactions: Array.from(counts.entries()).map(([label, count]) => ({ label, count })),
  };
}

export function totalRedactions(r: RedactionResult): number {
  return r.redactions.reduce((s, x) => s + x.count, 0);
}

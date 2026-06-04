/**
 * Minimal line-based diff. Uses an LCS-based algorithm sized for whole-file
 * rewrites (typically < a few thousand lines). Renders a unified two-color view:
 * additions in green, removals in red.
 */

interface DiffLine {
  type: "context" | "add" | "del";
  oldNum: number | null;
  newNum: number | null;
  text: string;
}

function computeDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const m = aLines.length;
  const n = bLines.length;

  // LCS DP table — fine for files up to a few thousand lines.
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldNum = 1;
  let newNum = 1;
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      result.push({ type: "context", oldNum, newNum, text: aLines[i] });
      i++; j++; oldNum++; newNum++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "del", oldNum, newNum: null, text: aLines[i] });
      i++; oldNum++;
    } else {
      result.push({ type: "add", oldNum: null, newNum, text: bLines[j] });
      j++; newNum++;
    }
  }
  while (i < m) {
    result.push({ type: "del", oldNum, newNum: null, text: aLines[i] });
    i++; oldNum++;
  }
  while (j < n) {
    result.push({ type: "add", oldNum: null, newNum, text: bLines[j] });
    j++; newNum++;
  }
  return result;
}

export function diffStats(a: string, b: string): { added: number; removed: number } {
  const lines = computeDiff(a, b);
  return {
    added: lines.filter((l) => l.type === "add").length,
    removed: lines.filter((l) => l.type === "del").length,
  };
}

export default function Diff({ before, after }: { before: string; after: string }) {
  const lines = computeDiff(before, after);

  return (
    <div
      style={{
        background: "var(--c-codeBg)",
        border: "1px solid var(--c-border)",
        borderRadius: 10,
        overflow: "hidden",
        fontFamily: "ui-monospace, Consolas, Menlo, monospace",
        fontSize: 12.5,
      }}
    >
      <div style={{ maxHeight: 480, overflowY: "auto" }}>
        {lines.map((l, idx) => {
          const bg =
            l.type === "add"
              ? "rgba(34,197,94,0.12)"
              : l.type === "del"
              ? "rgba(239,68,68,0.12)"
              : "transparent";
          const marker = l.type === "add" ? "+" : l.type === "del" ? "−" : " ";
          const markerColor =
            l.type === "add"
              ? "var(--c-success)"
              : l.type === "del"
              ? "var(--c-danger)"
              : "var(--c-textSubtle)";
          return (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: "44px 44px 12px 1fr",
                background: bg,
                color: "var(--c-codeText)",
                lineHeight: 1.45,
                whiteSpace: "pre",
                paddingRight: 8,
              }}
            >
              <span
                style={{
                  textAlign: "right",
                  paddingRight: 8,
                  color: "var(--c-textSubtle)",
                  userSelect: "none",
                }}
              >
                {l.oldNum ?? ""}
              </span>
              <span
                style={{
                  textAlign: "right",
                  paddingRight: 8,
                  color: "var(--c-textSubtle)",
                  userSelect: "none",
                }}
              >
                {l.newNum ?? ""}
              </span>
              <span style={{ color: markerColor, userSelect: "none" }}>{marker}</span>
              <span>{l.text || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

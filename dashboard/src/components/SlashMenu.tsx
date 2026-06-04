import { useEffect, useMemo, useRef } from "react";
import type { SavedPrompt } from "../types";
import { QUICK_ACTIONS } from "../chat/quickActions";

interface MenuItem {
  key: string;
  slash: string;
  title: string;
  icon: string;
  hint: string;
  apply: (existing: string) => string;
}

function buildItems(prompts: SavedPrompt[]): MenuItem[] {
  const fromQuick: MenuItem[] = QUICK_ACTIONS.map((q) => ({
    key: `quick:${q.key}`,
    slash: q.key,
    title: q.label,
    icon: q.icon,
    hint: "built-in",
    apply: q.apply,
  }));
  const fromUser: MenuItem[] = prompts
    .filter((p) => p.slash)
    .map((p) => ({
      key: `user:${p.id}`,
      slash: p.slash as string,
      title: p.title,
      icon: p.icon,
      hint: p.is_shared ? "shared" : "personal",
      apply: () => p.body,
    }));
  return [...fromUser, ...fromQuick];
}

/**
 * A floating menu that filters slash commands by what the user typed after `/`.
 * The parent passes the textarea's current value + caret position; we surface
 * the active token, render matching items, and call back when an item is
 * picked or when Tab/Enter is pressed.
 */
export default function SlashMenu({
  query,
  prompts,
  selectedIndex,
  onSelect,
  onClose,
}: {
  query: string;
  prompts: SavedPrompt[];
  selectedIndex: number;
  onSelect: (item: { slash: string; apply: (existing: string) => string }) => void;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => {
    const all = buildItems(prompts);
    const q = query.toLowerCase();
    if (!q) return all.slice(0, 8);
    return all
      .filter((i) => i.slash.includes(q) || i.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, prompts]);

  useEffect(() => {
    const el = wrapRef.current?.querySelector<HTMLDivElement>(`[data-idx="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "absolute",
        bottom: "calc(100% + 8px)",
        left: 0,
        right: 0,
        maxWidth: 420,
        background: "var(--c-bgElevated)",
        border: "1px solid var(--c-border)",
        borderRadius: 12,
        boxShadow: "var(--c-shadow)",
        padding: 4,
        maxHeight: 260,
        overflowY: "auto",
        zIndex: 60,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: "var(--c-textSubtle)",
          textTransform: "uppercase",
          padding: "6px 8px 4px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>Slash commands</span>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--c-textSubtle)",
            cursor: "pointer",
            fontSize: 14,
            padding: 0,
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      {items.map((it, idx) => {
        const active = idx === selectedIndex;
        return (
          <div
            key={it.key}
            data-idx={idx}
            onClick={() => onSelect(it)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 10px",
              borderRadius: 8,
              cursor: "pointer",
              background: active ? "var(--c-accentSoft)" : "transparent",
              color: active ? "var(--c-accent)" : "var(--c-text)",
            }}
          >
            <span style={{ fontSize: 15 }}>{it.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{it.title}</div>
              <div
                style={{
                  fontSize: 11,
                  color: active ? "var(--c-accent)" : "var(--c-textSubtle)",
                  fontFamily: "ui-monospace, Consolas, monospace",
                }}
              >
                /{it.slash}
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                color: "var(--c-textSubtle)",
                background: "var(--c-bgSubtle)",
                padding: "2px 6px",
                borderRadius: 4,
                border: "1px solid var(--c-border)",
              }}
            >
              {it.hint}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Returns the slash token at the caret position, or null. The token must be
 * preceded by start-of-input or whitespace, start with `/`, and consist of
 * only `[a-z0-9_-]+`.
 */
export function detectSlashToken(text: string, caret: number): string | null {
  if (caret === 0 || caret > text.length) return null;
  // Walk backwards from caret to find the start of the token
  let start = caret;
  while (start > 0) {
    const c = text[start - 1];
    if (c === "/") {
      start--;
      break;
    }
    if (!/[a-z0-9_-]/i.test(c)) return null;
    start--;
  }
  if (text[start] !== "/") return null;
  if (start > 0) {
    const prev = text[start - 1];
    if (!/\s/.test(prev)) return null;
  }
  return text.slice(start + 1, caret);
}

export { buildItems };

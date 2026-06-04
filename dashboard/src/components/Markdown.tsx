import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Lightweight markdown renderer. No external deps — handles:
 * fenced code blocks (```lang), inline code, bold, italics, headings,
 * lists, links, blockquotes, and paragraphs.
 *
 * Security: HTML in source is escaped. Only the tags this renderer emits
 * are present in output.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  // Inline code
  out = out.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  // Bold **x**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic *x*
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // Links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    const safe = href.startsWith("http") || href.startsWith("/") ? href : "#";
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  return out;
}

interface Block {
  type: "p" | "h1" | "h2" | "h3" | "ul" | "ol" | "blockquote" | "code" | "hr";
  content: string;
  lang?: string;
  items?: string[];
}

function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    const fence = /^```(\w+)?\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", content: buf.join("\n"), lang });
      continue;
    }

    // Heading
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const level = h[1].length as 1 | 2 | 3;
      blocks.push({ type: (`h${level}` as Block["type"]), content: h[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line)) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", content: buf.join(" ") });
      continue;
    }

    // Lists
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", content: "", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", content: "", items });
      continue;
    }

    // Blank line -> paragraph break
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (collect until blank line, heading, code fence, or list)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", content: buf.join(" ") });
  }

  return blocks;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div style={{ position: "relative", margin: "0.5em 0" }}>
      {lang && (
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 12,
            fontSize: 11,
            color: "var(--c-textMuted)",
            fontFamily: "ui-monospace, monospace",
            textTransform: "lowercase",
          }}
        >
          {lang}
        </div>
      )}
      <button
        onClick={handleCopy}
        title="Copy code"
        style={{
          position: "absolute",
          top: 6,
          right: 6,
          background: "var(--c-bgElevated)",
          border: "1px solid var(--c-border)",
          color: "var(--c-textMuted)",
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 11,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <pre style={{ paddingTop: lang ? 26 : undefined }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);

  return (
    <div className="md-body">
      {blocks.map((b, idx) => {
        if (b.type === "code") return <CodeBlock key={idx} code={b.content} lang={b.lang} />;
        if (b.type === "hr") return <hr key={idx} style={{ border: "none", borderTop: "1px solid var(--c-border)", margin: "0.6em 0" }} />;
        if (b.type === "ul") {
          return (
            <ul key={idx}>
              {b.items?.map((it, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />
              ))}
            </ul>
          );
        }
        if (b.type === "ol") {
          return (
            <ol key={idx}>
              {b.items?.map((it, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />
              ))}
            </ol>
          );
        }
        if (b.type === "blockquote") {
          return <blockquote key={idx} dangerouslySetInnerHTML={{ __html: renderInline(b.content) }} />;
        }
        if (b.type === "h1") return <h1 key={idx} dangerouslySetInnerHTML={{ __html: renderInline(b.content) }} />;
        if (b.type === "h2") return <h2 key={idx} dangerouslySetInnerHTML={{ __html: renderInline(b.content) }} />;
        if (b.type === "h3") return <h3 key={idx} dangerouslySetInnerHTML={{ __html: renderInline(b.content) }} />;
        return <p key={idx} dangerouslySetInnerHTML={{ __html: renderInline(b.content) }} />;
      })}
    </div>
  );
}

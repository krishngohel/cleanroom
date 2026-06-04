import { useState } from "react";
import { Check, Copy, FileText, RefreshCw, User2, Sparkles } from "lucide-react";
import type { Message } from "../types";
import Markdown from "./Markdown";

interface Props {
  messages: Message[];
  streaming?: boolean;
  onRegenerate?: (messageId: string) => void;
  onSaveAsDocument?: (message: Message) => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageActions({
  text,
  onRegenerate,
  onSaveAsDocument,
}: {
  text: string;
  onRegenerate?: () => void;
  onSaveAsDocument?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  const btnStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "var(--c-textMuted)",
    cursor: "pointer",
    padding: 4,
    borderRadius: 4,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
  };

  return (
    <div style={{ display: "flex", gap: 4, marginTop: 4, opacity: 0.75 }}>
      <button onClick={handleCopy} title="Copy" style={btnStyle}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
      {onSaveAsDocument && (
        <button onClick={onSaveAsDocument} title="Save as document" style={btnStyle}>
          <FileText size={12} />
          Save as document
        </button>
      )}
      {onRegenerate && (
        <button onClick={onRegenerate} title="Regenerate" style={btnStyle}>
          <RefreshCw size={12} />
          Regenerate
        </button>
      )}
    </div>
  );
}

export default function MessageList({
  messages,
  streaming = false,
  onRegenerate,
  onSaveAsDocument,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 820, margin: "0 auto", width: "100%" }}>
      {messages.map((msg, idx) => {
        const isUser = msg.role === "user";
        const isLast = idx === messages.length - 1;
        const isStreaming = streaming && isLast && msg.role === "assistant";

        if (msg.role === "system") {
          return (
            <div key={msg.id} style={{ textAlign: "center", fontSize: 12, color: "var(--c-textSubtle)", padding: "0 1rem" }}>
              {msg.content}
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: isUser ? "var(--c-accent)" : "var(--c-bgSubtle)",
                color: isUser ? "var(--c-accentFg)" : "var(--c-accent)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
                border: isUser ? "none" : "1px solid var(--c-border)",
              }}
            >
              {isUser ? <User2 size={15} /> : <Sparkles size={15} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text)" }}>
                  {isUser ? "You" : "Assistant"}
                </span>
                <span style={{ fontSize: 11, color: "var(--c-textSubtle)" }}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div style={{ color: "var(--c-text)" }}>
                {msg.content ? (
                  <Markdown source={msg.content} />
                ) : isStreaming ? (
                  <div style={{ color: "var(--c-textMuted)", fontSize: 14 }}>
                    <span className="cursor-blink">▋</span>
                  </div>
                ) : null}
                {isStreaming && msg.content && (
                  <span style={{ color: "var(--c-textMuted)" }} className="cursor-blink">
                    ▋
                  </span>
                )}
              </div>
              {!isUser && !isStreaming && msg.content && (
                <MessageActions
                  text={msg.content}
                  onRegenerate={onRegenerate ? () => onRegenerate(msg.id) : undefined}
                  onSaveAsDocument={onSaveAsDocument ? () => onSaveAsDocument(msg) : undefined}
                />
              )}
              {isUser && <MessageActions text={msg.content} />}
            </div>
          </div>
        );
      })}
      <style>{`@keyframes blink { 0%,49%{opacity:1} 50%,100%{opacity:0} } .cursor-blink { animation: blink 1s steps(1) infinite; }`}</style>
    </div>
  );
}

import type { Message } from "../types";

interface Props {
  messages: Message[];
  streaming?: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderContent(content: string): string {
  // Minimal markdown: bold
  return content
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
}

export default function MessageList({ messages, streaming = false }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {messages.map((msg, idx) => {
        const isUser = msg.role === "user";
        const isLast = idx === messages.length - 1;
        const isStreaming = streaming && isLast && msg.role === "assistant";

        if (msg.role === "system") {
          return (
            <div key={msg.id} style={{ textAlign: "center", fontSize: 12, color: "#475569", padding: "0 1rem" }}>
              {msg.content}
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: isUser ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "75%",
                background: isUser ? "#0369a1" : "#1e293b",
                borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                padding: "0.6rem 0.875rem",
                fontSize: 14,
                lineHeight: 1.6,
                color: "#e2e8f0",
                border: isUser ? "none" : "1px solid #334155",
              }}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                __html: renderContent(msg.content) + (isStreaming ? '<span style="opacity:0.6;animation:blink 1s step-end infinite">▋</span>' : ""),
              }}
            />
            <div style={{ fontSize: 11, color: "#475569", marginTop: 3 }}>
              {formatTime(msg.timestamp)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

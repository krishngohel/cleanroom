import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Message } from "../types";
import MessageList from "../components/MessageList";

let msgCounter = 0;
const nextId = () => `msg-${++msgCounter}`;

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.models
      .list()
      .then((list) => {
        const names = list.map((m) => m.id);
        setModels(names);
        if (names.length > 0) setSelectedModel(names[0]);
      })
      .catch(() => setModels([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);

    const userMsg: Message = {
      id: nextId(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    const assistantMsg: Message = {
      id: nextId(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setStreaming(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    try {
      await api.chat.complete(history, selectedModel, (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m,
          ),
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Chat</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {models.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 6,
                color: "#e2e8f0",
                padding: "4px 8px",
                fontSize: 13,
              }}
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setMessages([])}
            style={{
              background: "transparent",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#94a3b8",
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            New chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", marginBottom: 16 }}>
        {messages.length === 0 ? (
          <div style={{ color: "#475569", textAlign: "center", marginTop: "4rem", fontSize: 15 }}>
            Start a conversation. Your data never leaves this network.
          </div>
        ) : (
          <MessageList messages={messages} streaming={streaming} />
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.1)",
          border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 6,
          padding: "0.5rem 0.75rem",
          fontSize: 13,
          color: "#fca5a5",
          marginBottom: 8,
        }}>
          {error}
        </div>
      )}

      {/* Input */}
      <div style={{
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 10,
        padding: "0.75rem",
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
      }}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Cleanroom AI… (Enter to send, Shift+Enter for new line)"
          rows={1}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#e2e8f0",
            fontSize: 14,
            resize: "none",
            maxHeight: 160,
            overflowY: "auto",
            fontFamily: "inherit",
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || streaming}
          style={{
            background: streaming || !input.trim() ? "#334155" : "#0ea5e9",
            border: "none",
            borderRadius: 6,
            color: streaming || !input.trim() ? "#64748b" : "#fff",
            padding: "0.5rem 1rem",
            cursor: streaming || !input.trim() ? "not-allowed" : "pointer",
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {streaming ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

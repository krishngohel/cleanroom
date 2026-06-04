import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FolderOpen,
  Loader2,
  MessageSquare,
  Paperclip,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Send,
  SlashSquare,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api/client";
import type { Message, ProjectSummary, SavedPrompt } from "../types";
import MessageList from "../components/MessageList";
import { useToast } from "../components/Toast";
import {
  loadConversations,
  newId,
  saveConversations,
  summarizeTitle,
  type Conversation,
} from "../chat/storage";
import { useCompliance } from "../compliance/useCompliance";
import { applyDlp, totalRedactions } from "../compliance/dlp";
import ActivityPanel, {
  initialActivity,
  type ActivityState,
} from "../components/ActivityPanel";
import SlashMenu, { detectSlashToken, buildItems } from "../components/SlashMenu";
import { QUICK_ACTIONS, QUICK_GROUPS, type QuickAction } from "../chat/quickActions";
import SaveAsDocumentModal from "../components/SaveAsDocumentModal";
import { summarizeTitle as makeTitle } from "../chat/storage";

const ACTIVE_PROJECT_KEY = "cleanroom_active_project_v1";
const ACTIVITY_OPEN_KEY = "cleanroom_activity_open_v1";

let msgCounter = 0;
const nextMsgId = () => `msg-${Date.now().toString(36)}-${++msgCounter}`;

const MAX_ATTACH_SIZE = 2 * 1024 * 1024;
const TEXT_EXTS = /\.(txt|md|csv|tsv|json|yaml|yml|log|py|js|ts|tsx|jsx|sql|html|css|sh|c|cpp|h|hpp|go|rs|java|kt|swift|rb|php|env|ini|toml|xml)$/i;

export default function Chat() {
  const toast = useToast();
  const { settings: compliance } = useCompliance();
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string | null>(() => loadConversations()[0]?.id ?? null);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<{ name: string; content: string }[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_PROJECT_KEY);
    } catch {
      return null;
    }
  });
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showActivity, setShowActivity] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ACTIVITY_OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [activity, setActivity] = useState<ActivityState>(initialActivity);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIdx, setSlashIdx] = useState(0);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [saveAsDoc, setSaveAsDoc] = useState<Message | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );
  const messages = active?.messages ?? [];

  // When switching conversations, restore that conversation's bound project (if any).
  useEffect(() => {
    if (active?.projectId !== undefined) {
      setActiveProjectId(active.projectId ?? null);
    }
  }, [activeId]);

  // Persist sidebar toggles.
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVITY_OPEN_KEY, showActivity ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [showActivity]);

  useEffect(() => {
    try {
      if (activeProjectId) localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
      else localStorage.removeItem(ACTIVE_PROJECT_KEY);
    } catch {
      /* ignore */
    }
  }, [activeProjectId]);

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    api.models
      .list()
      .then((list) => {
        const names = list.map((m) => m.id);
        setModels(names);
        if (names.length > 0) setSelectedModel(active?.model ?? names[0]);
      })
      .catch(() => setModels([]));
    api.projects
      .list()
      .then(setProjects)
      .catch(() => setProjects([]));
    api.prompts
      .list()
      .then(setPrompts)
      .catch(() => setPrompts([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streaming]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  const ensureActive = (model: string): Conversation => {
    if (active) return active;
    const fresh: Conversation = {
      id: newId(),
      title: "New chat",
      model,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      projectId: activeProjectId,
    };
    setConversations((p) => [fresh, ...p]);
    setActiveId(fresh.id);
    return fresh;
  };

  const updateConversation = (id: string, update: (c: Conversation) => Conversation) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? update(c) : c)));
  };

  const newChat = () => {
    setActiveId(null);
    setInput("");
    setAttachments([]);
    setError(null);
    setActivity(initialActivity);
  };

  const deleteChat = (id: string) => {
    setConversations((p) => p.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const handleAttach = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACH_SIZE) {
        toast.error(`${file.name}: file too large (max 2MB)`);
        continue;
      }
      if (!TEXT_EXTS.test(file.name) && !file.type.startsWith("text/")) {
        toast.error(`${file.name}: only text files supported`);
        continue;
      }
      const content = await file.text();
      setAttachments((p) => [...p, { name: file.name, content }]);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const composeContent = (text: string) => {
    if (attachments.length === 0) return text;
    const blocks = attachments
      .map((a) => `### Attachment: ${a.name}\n\n\`\`\`\n${a.content}\n\`\`\``)
      .join("\n\n");
    return `${text}\n\n${blocks}`;
  };

  const send = async (overrideMessages?: Message[]) => {
    const text = input.trim();
    if (!overrideMessages && !text && attachments.length === 0) return;
    if (streaming) return;

    const conv = ensureActive(selectedModel);
    setError(null);

    const attachBytes = attachments.reduce((s, a) => s + a.content.length, 0);
    const projectCtxBytes = activeProject
      ? activeProject.system_prompt.length + activeProject.total_bytes
      : 0;
    let redactionCount = 0;

    let baseMessages: Message[];
    if (overrideMessages) {
      baseMessages = overrideMessages;
    } else {
      let composed = composeContent(text);
      if (compliance.dlp_enabled && compliance.dlp_patterns.length > 0) {
        const r = applyDlp(composed, compliance.dlp_patterns);
        composed = r.text;
        redactionCount = totalRedactions(r);
        if (redactionCount > 0) {
          const summary = r.redactions.map((x) => `${x.count} ${x.label}`).join(", ");
          toast.info(`DLP redacted ${redactionCount} item${redactionCount === 1 ? "" : "s"}: ${summary}`);
        }
      }
      const userMsg: Message = {
        id: nextMsgId(),
        role: "user",
        content: composed,
        timestamp: new Date().toISOString(),
      };
      baseMessages = [...conv.messages, userMsg];
      setInput("");
      setAttachments([]);
    }

    const assistantMsg: Message = {
      id: nextMsgId(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
    };

    updateConversation(conv.id, (c) => ({
      ...c,
      messages: [...baseMessages, assistantMsg],
      title:
        c.title === "New chat" && baseMessages[0]?.role === "user"
          ? summarizeTitle(baseMessages[0].content)
          : c.title,
      model: selectedModel,
      projectId: activeProjectId,
      updatedAt: new Date().toISOString(),
    }));

    setStreaming(true);
    const startedAt = Date.now();
    setActivity({
      ...initialActivity,
      phase: "thinking",
      startedAt,
      model: selectedModel,
      inputChars: baseMessages.reduce((s, m) => s + m.content.length, 0),
      attachmentBytes: attachBytes,
      projectContextBytes: projectCtxBytes,
      redactionCount,
      step: activeProject ? "Loading project knowledge…" : "Preparing request…",
    });

    const history = baseMessages.map((m) => ({ role: m.role, content: m.content }));
    let firstChunkSeen = false;

    try {
      await api.chat.complete(
        history,
        selectedModel,
        (chunk) => {
          if (!firstChunkSeen) {
            firstChunkSeen = true;
            setActivity((a) => ({
              ...a,
              phase: "streaming",
              firstTokenAt: Date.now(),
              step: "Streaming response…",
            }));
          }
          updateConversation(conv.id, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m,
            ),
          }));
          setActivity((a) => ({ ...a, outputChars: a.outputChars + chunk.length }));
        },
        activeProjectId,
      );
      setActivity((a) => ({ ...a, phase: "done", endedAt: Date.now(), step: "Complete" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setError(msg);
      toast.error(msg);
      updateConversation(conv.id, (c) => ({
        ...c,
        messages: c.messages.filter((m) => m.id !== assistantMsg.id),
      }));
      setActivity((a) => ({ ...a, phase: "error", endedAt: Date.now(), step: msg }));
    } finally {
      setStreaming(false);
    }
  };

  const handleRegenerate = (assistantMessageId: string) => {
    if (!active) return;
    const idx = active.messages.findIndex((m) => m.id === assistantMessageId);
    if (idx < 0) return;
    const truncated = active.messages.slice(0, idx);
    updateConversation(active.id, (c) => ({ ...c, messages: truncated }));
    void send(truncated);
  };

  const applyQuickAction = (action: QuickAction) => {
    setInput((cur) => action.apply(cur));
    setShowQuickActions(false);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setInput(v);
    const tok = detectSlashToken(v, e.target.selectionStart ?? v.length);
    if (tok !== null) {
      setSlashOpen(true);
      setSlashQuery(tok);
      setSlashIdx(0);
    } else {
      setSlashOpen(false);
    }
  };

  const applySlashItem = (item: { slash: string; apply: (existing: string) => string }) => {
    // Strip the active "/token" from the input, then run the action against
    // the rest. Also fire-and-forget bump the use_count for saved prompts.
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? input.length;
    const tok = detectSlashToken(input, caret);
    let rest = input;
    if (tok !== null) {
      const start = caret - (tok.length + 1); // include the slash
      rest = input.slice(0, start) + input.slice(caret);
    }
    setInput(item.apply(rest.trim()));
    setSlashOpen(false);
    setSlashQuery("");
    // Track usage for saved prompts (the keys we build are `user:<id>` or `quick:<key>`)
    const userMatch = buildItems(prompts).find((b) => b.slash === item.slash && b.key.startsWith("user:"));
    if (userMatch) {
      const id = userMatch.key.slice(5);
      api.prompts.recordUse(id).catch(() => undefined);
    }
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen) {
      const items = buildItems(prompts).filter(
        (i) =>
          !slashQuery ||
          i.slash.includes(slashQuery.toLowerCase()) ||
          i.title.toLowerCase().includes(slashQuery.toLowerCase()),
      );
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => Math.min(items.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && items[slashIdx]) {
        e.preventDefault();
        applySlashItem(items[slashIdx]);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const exportConversation = () => {
    if (!active) return;
    const proj = projects.find((p) => p.id === active.projectId);
    const header = [
      `# ${active.title}`,
      ``,
      `*Exported ${new Date().toLocaleString()}*`,
      `*Model:* ${active.model}`,
      proj ? `*Project:* ${proj.icon} ${proj.name}` : null,
      ``,
      `---`,
      ``,
    ]
      .filter((l) => l !== null)
      .join("\n");
    const body = active.messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        const who = m.role === "user" ? "**You**" : "**Assistant**";
        const ts = new Date(m.timestamp).toLocaleString();
        return `### ${who} — ${ts}\n\n${m.content}\n`;
      })
      .join("\n");
    const blob = new Blob([header + body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = active.title.replace(/[^\w-]+/g, "-").toLowerCase() || "conversation";
    a.href = url;
    a.download = `${slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Conversation exported");
  };

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--c-bg)" }}>
      {/* Conversation list */}
      <aside
        style={{
          width: 240,
          borderRight: "1px solid var(--c-border)",
          padding: "0.85rem",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <button
          onClick={newChat}
          style={{
            background: "var(--c-accentSoft)",
            border: "1px solid var(--c-border)",
            color: "var(--c-accent)",
            borderRadius: 10,
            padding: "0.55rem 0.75rem",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "center",
            marginBottom: 6,
          }}
        >
          <Plus size={14} />
          New chat
        </button>
        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {conversations.length === 0 && (
            <div style={{ color: "var(--c-textSubtle)", fontSize: 12, padding: "0.6rem" }}>
              No conversations yet.
            </div>
          )}
          {conversations.map((c) => {
            const isActive = c.id === activeId;
            const proj = projects.find((p) => p.id === c.projectId);
            return (
              <div
                key={c.id}
                onClick={() => setActiveId(c.id)}
                style={{
                  padding: "0.55rem 0.65rem",
                  borderRadius: 8,
                  background: isActive ? "var(--c-accentSoft)" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  color: isActive ? "var(--c-accent)" : "var(--c-textMuted)",
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MessageSquare size={13} style={{ flexShrink: 0 }} />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(c.id);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--c-textSubtle)",
                      cursor: "pointer",
                      padding: 2,
                      display: "inline-flex",
                    }}
                    aria-label="Delete chat"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {proj && (
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--c-textSubtle)",
                      paddingLeft: 21,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span>{proj.icon}</span>
                    {proj.name}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.5rem 0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--c-text)" }}>
                {active?.title ?? "New chat"}
              </div>
              <div style={{ fontSize: 11, color: "var(--c-textSubtle)", marginTop: 2 }}>
                {messages.length} messages · data stays on your network
              </div>
            </div>
            <ProjectChip
              project={activeProject}
              onOpen={() => setShowProjectPicker(true)}
              onClear={activeProject ? () => setActiveProjectId(null) : undefined}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {models.length > 0 && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{
                  background: "var(--c-bgElevated)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 8,
                  color: "var(--c-text)",
                  padding: "5px 10px",
                  fontSize: 13,
                  outline: "none",
                }}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={exportConversation}
              disabled={!active || messages.length === 0}
              title="Download conversation as Markdown"
              style={{
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: 8,
                color: active && messages.length > 0 ? "var(--c-textMuted)" : "var(--c-textSubtle)",
                padding: "5px 9px",
                cursor: active && messages.length > 0 ? "pointer" : "not-allowed",
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Download size={12} />
              Export
            </button>
            <button
              onClick={() => setShowActivity((s) => !s)}
              title={showActivity ? "Hide activity panel" : "Show activity panel"}
              style={{
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: 8,
                color: "var(--c-textMuted)",
                padding: "5px 9px",
                cursor: "pointer",
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              {showActivity ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
              {showActivity ? "Hide" : "Activity"}
            </button>
          </div>
        </div>

        {/* Body: messages | activity */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: "0.5rem 1.5rem 1rem",
              minWidth: 0,
            }}
          >
            <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem 0" }}>
              {messages.length === 0 ? (
                <EmptyState project={activeProject} />
              ) : (
                <MessageList
                  messages={messages}
                  streaming={streaming}
                  onRegenerate={handleRegenerate}
                  onSaveAsDocument={(m) => setSaveAsDoc(m)}
                />
              )}
              <div ref={bottomRef} />
            </div>

            {error && (
              <div
                style={{
                  background: "var(--c-dangerSoft)",
                  border: "1px solid var(--c-danger)",
                  borderRadius: 8,
                  padding: "0.55rem 0.75rem",
                  fontSize: 13,
                  color: "var(--c-danger)",
                  marginBottom: 8,
                }}
              >
                {error}
              </div>
            )}

            {attachments.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {attachments.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--c-bgElevated)",
                      border: "1px solid var(--c-border)",
                      borderRadius: 8,
                      padding: "4px 8px",
                      fontSize: 12,
                      display: "inline-flex",
                      gap: 8,
                      alignItems: "center",
                      color: "var(--c-textMuted)",
                    }}
                  >
                    <Paperclip size={11} />
                    {a.name}
                    <button
                      onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--c-textSubtle)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                      aria-label="Remove attachment"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showQuickActions && (
              <QuickActionsBar
                onPick={applyQuickAction}
                onClose={() => setShowQuickActions(false)}
              />
            )}
            <div
              style={{
                background: "var(--c-bgElevated)",
                border: "1px solid var(--c-border)",
                borderRadius: 14,
                padding: "0.65rem 0.75rem",
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
                maxWidth: 820,
                margin: "0 auto",
                width: "100%",
                position: "relative",
              }}
            >
              {slashOpen && (
                <SlashMenu
                  query={slashQuery}
                  prompts={prompts}
                  selectedIndex={slashIdx}
                  onSelect={applySlashItem}
                  onClose={() => setSlashOpen(false)}
                />
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(e) => void handleAttach(e.target.files)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                title="Attach file"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--c-textMuted)",
                  cursor: "pointer",
                  padding: 6,
                  borderRadius: 6,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <Paperclip size={16} />
              </button>
              <button
                onClick={() => setShowQuickActions((s) => !s)}
                title="Quick actions"
                style={{
                  background: showQuickActions ? "var(--c-accentSoft)" : "transparent",
                  border: "none",
                  color: showQuickActions ? "var(--c-accent)" : "var(--c-textMuted)",
                  cursor: "pointer",
                  padding: 6,
                  borderRadius: 6,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <SlashSquare size={16} />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeProject
                    ? `Message ${activeProject.name}… (try "/" for shortcuts)`
                    : 'Message…   Try "/" for shortcuts, or click the slash icon for quick actions'
                }
                rows={1}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--c-text)",
                  fontSize: 14,
                  resize: "none",
                  maxHeight: 200,
                  overflowY: "auto",
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                  padding: "4px 0",
                }}
              />
              <button
                onClick={() => void send()}
                disabled={(!input.trim() && attachments.length === 0) || streaming}
                style={{
                  background:
                    streaming || (!input.trim() && attachments.length === 0)
                      ? "var(--c-border)"
                      : "var(--c-accent)",
                  border: "none",
                  borderRadius: 10,
                  color:
                    streaming || (!input.trim() && attachments.length === 0)
                      ? "var(--c-textSubtle)"
                      : "var(--c-accentFg)",
                  padding: "0.5rem 0.85rem",
                  cursor:
                    streaming || (!input.trim() && attachments.length === 0)
                      ? "not-allowed"
                      : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {streaming ? (
                  <>
                    <Loader2 size={14} className="cleanroom-spin" />
                    Sending
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    Send
                  </>
                )}
              </button>
              <style>{`@keyframes cleanroom-spin { to { transform: rotate(360deg) } } .cleanroom-spin { animation: cleanroom-spin 0.8s linear infinite; }`}</style>
            </div>
          </div>

          {/* Right rail: live activity */}
          {showActivity && (
            <aside
              style={{
                width: 280,
                borderLeft: "1px solid var(--c-border)",
                padding: "1rem 1rem 1rem 0.75rem",
                flexShrink: 0,
                overflowY: "auto",
              }}
            >
              <ActivityPanel state={activity} />
            </aside>
          )}
        </div>
      </div>

      {showProjectPicker && (
        <ProjectPickerModal
          projects={projects}
          activeId={activeProjectId}
          onClose={() => setShowProjectPicker(false)}
          onPick={(id) => {
            setActiveProjectId(id);
            setShowProjectPicker(false);
          }}
        />
      )}

      {saveAsDoc && (
        <SaveAsDocumentModal
          content={saveAsDoc.content}
          suggestedName={makeTitle(saveAsDoc.content)}
          onClose={() => setSaveAsDoc(null)}
        />
      )}
    </div>
  );
}

function QuickActionsBar({
  onPick,
  onClose,
}: {
  onPick: (a: QuickAction) => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--c-bgElevated)",
        border: "1px solid var(--c-border)",
        borderRadius: 12,
        padding: "0.65rem 0.8rem",
        maxWidth: 820,
        margin: "0 auto 8px",
        width: "100%",
        boxShadow: "var(--c-shadow)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--c-textSubtle)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Quick actions
        </div>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--c-textMuted)",
            cursor: "pointer",
            display: "inline-flex",
          }}
        >
          <X size={13} />
        </button>
      </div>
      {QUICK_GROUPS.map((g) => {
        const items = QUICK_ACTIONS.filter((q) => q.group === g.key);
        if (items.length === 0) return null;
        return (
          <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--c-textSubtle)",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {g.label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {items.map((q) => (
                <button
                  key={q.key}
                  onClick={() => onPick(q)}
                  style={{
                    background: "var(--c-bgSubtle)",
                    border: "1px solid var(--c-border)",
                    borderRadius: 99,
                    padding: "5px 12px",
                    cursor: "pointer",
                    fontSize: 12.5,
                    color: "var(--c-text)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span>{q.icon}</span>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectChip({
  project,
  onOpen,
  onClear,
}: {
  project: ProjectSummary | null;
  onOpen: () => void;
  onClear?: () => void;
}) {
  if (!project) {
    return (
      <button
        onClick={onOpen}
        style={{
          background: "transparent",
          border: "1px dashed var(--c-border)",
          borderRadius: 99,
          color: "var(--c-textMuted)",
          padding: "4px 12px",
          cursor: "pointer",
          fontSize: 12,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <FolderOpen size={12} />
        Attach a project
      </button>
    );
  }
  return (
    <div
      style={{
        background: "var(--c-accentSoft)",
        border: `1px solid ${project.color}`,
        borderRadius: 99,
        padding: "3px 4px 3px 12px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--c-text)",
      }}
    >
      <span style={{ fontSize: 13 }}>{project.icon}</span>
      <button
        onClick={onOpen}
        style={{
          background: "transparent",
          border: "none",
          color: "inherit",
          fontWeight: 600,
          cursor: "pointer",
          fontSize: 12,
          padding: 0,
        }}
      >
        {project.name}
      </button>
      {onClear && (
        <button
          onClick={onClear}
          aria-label="Detach project"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--c-textMuted)",
            cursor: "pointer",
            padding: 2,
            borderRadius: 99,
            display: "inline-flex",
          }}
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

function EmptyState({ project }: { project: ProjectSummary | null }) {
  return (
    <div
      style={{
        color: "var(--c-textSubtle)",
        textAlign: "center",
        marginTop: "4rem",
        fontSize: 14,
      }}
    >
      <div style={{ fontSize: 30, marginBottom: 8 }}>{project?.icon ?? "✨"}</div>
      <div style={{ color: "var(--c-textMuted)", fontSize: 16, marginBottom: 6 }}>
        {project ? `Cowork on ${project.name}` : "Ask anything. Process anything."}
      </div>
      <div>
        {project?.description ||
          "Your queries, attachments, and answers stay on your network."}
      </div>
    </div>
  );
}

function ProjectPickerModal({
  projects,
  activeId,
  onClose,
  onPick,
}: {
  projects: ProjectSummary[];
  activeId: string | null;
  onClose: () => void;
  onPick: (id: string | null) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--c-bgElevated)",
          border: "1px solid var(--c-border)",
          borderRadius: 14,
          padding: "1.25rem",
          width: 460,
          maxHeight: "70vh",
          overflowY: "auto",
          boxShadow: "var(--c-shadow)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--c-text)" }}>
            Attach a project
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--c-textMuted)",
              cursor: "pointer",
              fontSize: 18,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            onClick={() => onPick(null)}
            style={{
              textAlign: "left",
              background: activeId == null ? "var(--c-accentSoft)" : "transparent",
              border: `1px solid ${activeId == null ? "var(--c-accent)" : "var(--c-border)"}`,
              color: activeId == null ? "var(--c-accent)" : "var(--c-textMuted)",
              borderRadius: 10,
              padding: "10px 12px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            <strong>No project</strong>
            <div style={{ fontSize: 11.5, color: "var(--c-textSubtle)", marginTop: 2 }}>
              Send messages without any project context.
            </div>
          </button>
          {projects.length === 0 && (
            <div
              style={{
                padding: "1rem",
                border: "1px dashed var(--c-border)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--c-textSubtle)",
                textAlign: "center",
              }}
            >
              No projects yet — create one in the Projects tab.
            </div>
          )}
          {projects.map((p) => {
            const active = p.id === activeId;
            return (
              <button
                key={p.id}
                onClick={() => onPick(p.id)}
                style={{
                  textAlign: "left",
                  background: active ? "var(--c-accentSoft)" : "transparent",
                  border: `1px solid ${active ? "var(--c-accent)" : "var(--c-border)"}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  cursor: "pointer",
                  fontSize: 13,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  color: "var(--c-text)",
                }}
              >
                <div style={{ fontSize: 18 }}>{p.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--c-textSubtle)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.description || `${p.file_count} files attached`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Copy, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { api } from "../api/client";
import type { SavedPrompt } from "../types";
import { useToast } from "../components/Toast";

const ICON_CHOICES = ["✨", "📝", "✅", "✂️", "✉️", "🎩", "💡", "🌍", "📊", "⚖️"];
const CATEGORIES = ["general", "writing", "summarize", "draft", "translate", "extract"];

export default function Prompts() {
  const toast = useToast();
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SavedPrompt | null>(null);
  const [filter, setFilter] = useState("");

  const refresh = () => {
    setLoading(true);
    api.prompts
      .list()
      .then(setPrompts)
      .catch(() => setPrompts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleDelete = async (p: SavedPrompt) => {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    try {
      await api.prompts.remove(p.id);
      toast.success("Deleted");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const filtered = filter
    ? prompts.filter(
        (p) =>
          p.title.toLowerCase().includes(filter.toLowerCase()) ||
          (p.slash ?? "").includes(filter.toLowerCase()) ||
          p.category.toLowerCase().includes(filter.toLowerCase()),
      )
    : prompts;

  return (
    <div style={{ padding: "1.5rem", overflowY: "auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 18,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "var(--c-text)" }}>
            Saved prompts
          </h1>
          <div
            style={{
              fontSize: 13,
              color: "var(--c-textMuted)",
              marginTop: 4,
              maxWidth: 640,
              lineHeight: 1.55,
            }}
          >
            Reusable prompts you can drop into any chat. Give one a slash command and you'll be
            able to insert it by typing <code style={{ fontFamily: "ui-monospace, Consolas, monospace" }}>/yourcommand</code>.
          </div>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowModal(true);
          }}
          style={{
            background: "var(--c-accent)",
            border: "none",
            borderRadius: 10,
            color: "var(--c-accentFg)",
            padding: "9px 16px",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Plus size={14} /> New prompt
        </button>
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by title, command, or category…"
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--c-bgInput)",
          border: "1px solid var(--c-border)",
          borderRadius: 8,
          padding: "0.5rem 0.85rem",
          color: "var(--c-text)",
          fontSize: 13,
          outline: "none",
          boxSizing: "border-box",
          marginBottom: 14,
        }}
      />

      {loading ? (
        <div style={{ color: "var(--c-textSubtle)" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            border: "1px dashed var(--c-border)",
            borderRadius: 14,
            padding: "3rem 1.5rem",
            textAlign: "center",
            color: "var(--c-textMuted)",
          }}
        >
          <Wand2 size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
          <div style={{ fontSize: 15, color: "var(--c-text)", fontWeight: 600 }}>
            {prompts.length === 0 ? "No saved prompts yet" : "No matches"}
          </div>
          <div style={{ fontSize: 13, marginTop: 6, maxWidth: 460, marginInline: "auto" }}>
            {prompts.length === 0
              ? "Create your first reusable prompt. Tip: pair it with a short slash command like /standup or /reject."
              : "Try clearing the filter."}
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {filtered.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{
                padding: "1rem 1.1rem",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
              onClick={() => {
                setEditing(p);
                setShowModal(true);
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 20 }}>{p.icon}</div>
                <div style={{ flex: 1, color: "var(--c-text)", fontWeight: 600, fontSize: 14 }}>
                  {p.title}
                </div>
                {p.slash && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--c-accent)",
                      background: "var(--c-accentSoft)",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontFamily: "ui-monospace, Consolas, monospace",
                      fontWeight: 600,
                    }}
                  >
                    /{p.slash}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--c-textMuted)",
                  lineHeight: 1.5,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  minHeight: 54,
                }}
              >
                {p.body}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: "var(--c-textSubtle)",
                  borderTop: "1px solid var(--c-border)",
                  paddingTop: 8,
                }}
              >
                <span>{p.category}</span>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{p.is_shared ? "shared" : "personal"}</span>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>used {p.use_count}×</span>
                <div style={{ flex: 1 }} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void navigator.clipboard.writeText(p.body);
                    toast.success("Copied to clipboard");
                  }}
                  title="Copy body"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--c-textSubtle)",
                    cursor: "pointer",
                    padding: 4,
                    display: "inline-flex",
                  }}
                >
                  <Copy size={11} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(p);
                  }}
                  title="Delete"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--c-danger)",
                    cursor: "pointer",
                    padding: 4,
                    display: "inline-flex",
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <PromptModal
          initial={editing}
          onClose={() => {
            setShowModal(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowModal(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function PromptModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: SavedPrompt | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    slash: initial?.slash ?? "",
    category: initial?.category ?? "general",
    icon: initial?.icon ?? ICON_CHOICES[0],
    is_shared: initial?.is_shared ?? false,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        slash: form.slash.trim() || null,
      };
      if (initial) {
        await api.prompts.update(initial.id, payload);
        toast.success("Prompt saved");
      } else {
        await api.prompts.create(payload);
        toast.success("Prompt created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

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
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: "var(--c-bgElevated)",
          border: "1px solid var(--c-border)",
          borderRadius: 14,
          padding: "1.5rem",
          width: 520,
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "var(--c-shadow)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--c-text)" }}>
            {initial ? "Edit prompt" : "New prompt"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--c-textMuted)",
              cursor: "pointer",
              display: "inline-flex",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <Field label="Title" help="Short, memorable label.">
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Standup summary"
            style={inputStyle}
          />
        </Field>

        <Field
          label="Slash command (optional)"
          help="Type / in chat and pick from a menu. Lowercase letters, numbers, _, - only."
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--c-textSubtle)", fontFamily: "ui-monospace, Consolas, monospace" }}>
              /
            </span>
            <input
              value={form.slash}
              onChange={(e) => setForm({ ...form, slash: e.target.value })}
              placeholder="standup"
              style={{ ...inputStyle, fontFamily: "ui-monospace, Consolas, monospace" }}
            />
          </div>
        </Field>

        <Field label="Prompt body" help="What should the AI do? Use plain English.">
          <textarea
            required
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={8}
            placeholder="Summarize today's standup notes into: (1) what got done, (2) what's blocked, (3) who needs help."
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>

        <div style={{ display: "flex", gap: 14 }}>
          <Field label="Category">
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              style={{ ...inputStyle, paddingRight: 24 }}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Icon">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {ICON_CHOICES.map((i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setForm({ ...form, icon: i })}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: `1px solid ${form.icon === i ? "var(--c-accent)" : "var(--c-border)"}`,
                    background: form.icon === i ? "var(--c-accentSoft)" : "transparent",
                    cursor: "pointer",
                    fontSize: 14,
                  }}
                >
                  {i}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--c-text)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={form.is_shared}
            onChange={(e) => setForm({ ...form, is_shared: e.target.checked })}
          />
          <span>
            <Sparkles size={11} style={{ display: "inline", marginRight: 4 }} />
            Share with everyone in my company
          </span>
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--c-border)",
              borderRadius: 8,
              color: "var(--c-textMuted)",
              padding: "7px 14px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !form.title.trim() || !form.body.trim()}
            style={{
              background:
                saving || !form.title.trim() || !form.body.trim()
                  ? "var(--c-border)"
                  : "var(--c-accent)",
              border: "none",
              borderRadius: 8,
              color:
                saving || !form.title.trim() || !form.body.trim()
                  ? "var(--c-textSubtle)"
                  : "var(--c-accentFg)",
              padding: "7px 18px",
              cursor:
                saving || !form.title.trim() || !form.body.trim() ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--c-bgInput)",
  border: "1px solid var(--c-border)",
  borderRadius: 8,
  padding: "0.55rem 0.8rem",
  color: "var(--c-text)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          color: "var(--c-text)",
          marginBottom: help ? 2 : 6,
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      {help && (
        <div style={{ fontSize: 11.5, color: "var(--c-textSubtle)", marginBottom: 6, lineHeight: 1.45 }}>
          {help}
        </div>
      )}
      {children}
    </div>
  );
}

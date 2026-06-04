import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  ClipboardList,
  Database,
  FolderOpen,
  Gavel,
  HeartPulse,
  Lock,
  MessageSquare,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";
import { api } from "../api/client";
import type { ProjectSummary } from "../types";
import { useToast } from "../components/Toast";

const ICON_CHOICES = ["✨", "📊", "📈", "📁", "🧬", "⚖️", "🏥", "💼", "🔬", "🧠"];
const COLOR_CHOICES = [
  "#38bdf8",
  "#a855f7",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
];

interface StarterTemplate {
  key: string;
  icon: string;
  color: string;
  title: string;
  blurb: string;
  background: string; // system prompt
  Icon: typeof Briefcase;
}

const STARTERS: StarterTemplate[] = [
  {
    key: "hr",
    icon: "💼",
    color: "#a855f7",
    title: "HR helper",
    blurb: "Answer policy questions from handbooks, benefits docs, and FAQs.",
    background:
      "You are an HR assistant for our company. Use the attached policies, benefits documents, and handbooks to answer employee questions accurately. If something isn't covered by the documents, say so clearly and recommend they contact the HR team. Always cite the specific document and section your answer comes from.",
    Icon: Briefcase,
  },
  {
    key: "finance",
    icon: "📊",
    color: "#22c55e",
    title: "Finance analyst",
    blurb: "Summarize earnings reports, financial statements, or budget docs.",
    background:
      "You are a financial analyst. When the user attaches earnings, budgets, or financial statements, give concise, accurate summaries. Always quote exact figures with units (USD, millions, etc.). Flag anything unusual — major variances, missing data, or numbers that don't reconcile. Never invent figures that aren't in the source documents.",
    Icon: ClipboardList,
  },
  {
    key: "legal",
    icon: "⚖️",
    color: "#f59e0b",
    title: "Contract reviewer",
    blurb: "Summarize contracts and flag clauses that need attention.",
    background:
      "You are a contract review assistant. For any contract the user attaches, produce: (1) a one-paragraph plain-English summary, (2) a bullet list of key dates, parties, and obligations, (3) a bullet list of clauses that typically warrant legal review (auto-renewal, liability caps, IP assignment, termination, indemnification). Do not give legal advice — always recommend the user consult counsel for binding interpretation.",
    Icon: Gavel,
  },
  {
    key: "research",
    icon: "🔬",
    color: "#38bdf8",
    title: "Research & summaries",
    blurb: "Read long reports and answer specific questions about them.",
    background:
      "You are a careful research assistant. When summarizing, preserve numerical accuracy and quote sources verbatim where useful. When answering questions, cite the file and section. If the documents don't answer the question, say so rather than guess.",
    Icon: HeartPulse,
  },
];

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Projects() {
  const toast = useToast();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: ICON_CHOICES[0],
    color: COLOR_CHOICES[0],
    is_shared: true,
    system_prompt: "",
  });

  const refresh = () => {
    setLoading(true);
    api.projects
      .list()
      .then(setProjects)
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const createFromTemplate = async (t: StarterTemplate) => {
    setCreating(true);
    try {
      const created = await api.projects.create({
        name: t.title,
        description: t.blurb,
        system_prompt: t.background,
        icon: t.icon,
        color: t.color,
        is_shared: true,
      });
      toast.success(`Created "${created.name}" — add some files next`);
      navigate(`/projects/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setCreating(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await api.projects.create(form);
      toast.success(`Project "${created.name}" created`);
      setShowModal(false);
      navigate(`/projects/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

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
            Projects
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
            A project is a "hat" the AI wears — give it background instructions and reference
            files once, and every chat inside the project will use them automatically.
          </div>
        </div>
        <button
          onClick={() => setShowModal(true)}
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
          <Plus size={14} /> New project
        </button>
      </div>

      {/* Starter templates */}
      {projects.length === 0 && !loading && (
        <div style={{ marginBottom: 26 }}>
          <div
            style={{
              fontSize: 11,
              color: "var(--c-textSubtle)",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Wand2 size={12} /> Start with a template
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {STARTERS.map((t) => (
              <button
                key={t.key}
                disabled={creating}
                onClick={() => void createFromTemplate(t)}
                className="card"
                style={{
                  padding: "1rem",
                  textAlign: "left",
                  cursor: creating ? "wait" : "pointer",
                  borderTop: `3px solid ${t.color}`,
                  background: "var(--c-bgElevated)",
                  fontFamily: "inherit",
                  color: "var(--c-text)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 22 }}>{t.icon}</div>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>{t.title}</div>
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--c-textMuted)",
                    lineHeight: 1.5,
                    minHeight: 36,
                  }}
                >
                  {t.blurb}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11.5,
                    color: t.color,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  Use this template <ArrowRight size={11} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: "var(--c-textSubtle)" }}>Loading projects…</div>
      ) : projects.length === 0 ? (
        <div
          style={{
            border: "1px dashed var(--c-border)",
            borderRadius: 14,
            padding: "2.5rem 1.5rem",
            textAlign: "center",
            color: "var(--c-textMuted)",
          }}
        >
          <FolderOpen size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
          <div style={{ fontSize: 14.5, color: "var(--c-text)", fontWeight: 600 }}>
            Or build your own
          </div>
          <div style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.5 }}>
            Click <strong>New project</strong> above to start from scratch.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 14,
          }}
        >
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} style={{ textDecoration: "none", display: "block" }}>
              <div
                className="card"
                style={{
                  padding: "1rem 1.1rem",
                  height: "100%",
                  borderTop: `3px solid ${p.color}`,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 22 }}>{p.icon}</div>
                  <div style={{ flex: 1, color: "var(--c-text)", fontWeight: 600, fontSize: 15 }}>
                    {p.name}
                  </div>
                  {!p.is_shared && <Lock size={12} style={{ color: "var(--c-textSubtle)" }} />}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--c-textMuted)",
                    minHeight: 36,
                    lineHeight: 1.5,
                    marginBottom: 10,
                  }}
                >
                  {p.description || (
                    <span style={{ color: "var(--c-textSubtle)" }}>No description yet</span>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: 11,
                    color: "var(--c-textSubtle)",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Database size={11} />
                    {p.file_count} {p.file_count === 1 ? "file" : "files"} · {formatBytes(p.total_bytes)}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <MessageSquare size={11} />
                    {new Date(p.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
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
          onClick={() => setShowModal(false)}
        >
          <form
            onSubmit={handleCreate}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--c-bgElevated)",
              borderRadius: 14,
              padding: "1.5rem",
              width: 520,
              border: "1px solid var(--c-border)",
              boxShadow: "var(--c-shadow)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              maxHeight: "85vh",
              overflowY: "auto",
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
                New project
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
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

            <Field label="Name" help="What's this project about? Use any short name.">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="HR policies · Q4 reports · Vendor contracts"
                style={inputStyle}
              />
            </Field>

            <Field
              label="One-line description (optional)"
              help="A reminder of what's in here for your colleagues."
            >
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Onboarding handbook & benefits FAQs"
                style={inputStyle}
              />
            </Field>

            <Field
              label="Background instructions (optional)"
              help="What should the AI always keep in mind for this project? E.g., 'Always answer in plain English' or 'Cite the source document for every answer.' Leave blank if you don't need any."
            >
              <textarea
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                rows={4}
                placeholder="Act as our internal HR assistant. Use the attached handbook to answer questions, and cite the section number for every answer."
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </Field>

            <div style={{ display: "flex", gap: 18 }}>
              <div>
                <label style={labelStyle}>Icon</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {ICON_CHOICES.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setForm({ ...form, icon: i })}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        border: `1px solid ${form.icon === i ? "var(--c-accent)" : "var(--c-border)"}`,
                        background: form.icon === i ? "var(--c-accentSoft)" : "transparent",
                        cursor: "pointer",
                        fontSize: 16,
                      }}
                    >
                      {i}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Color</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {COLOR_CHOICES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border:
                          form.color === c
                            ? "2px solid var(--c-text)"
                            : "1px solid var(--c-border)",
                        background: c,
                        cursor: "pointer",
                      }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <Field label="Who can use this project?">
              <div style={{ display: "flex", gap: 8 }}>
                <ChoiceBtn
                  active={!form.is_shared}
                  onClick={() => setForm({ ...form, is_shared: false })}
                  title="Only me"
                  sub="Keep this private to your account."
                />
                <ChoiceBtn
                  active={form.is_shared}
                  onClick={() => setForm({ ...form, is_shared: true })}
                  title="Everyone in my company"
                  sub="Colleagues can use it too."
                />
              </div>
            </Field>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
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
                disabled={creating || !form.name.trim()}
                style={{
                  background: creating || !form.name.trim() ? "var(--c-border)" : "var(--c-accent)",
                  border: "none",
                  borderRadius: 8,
                  color:
                    creating || !form.name.trim() ? "var(--c-textSubtle)" : "var(--c-accentFg)",
                  padding: "7px 18px",
                  cursor: creating || !form.name.trim() ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {creating ? "Creating…" : "Create project"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--c-bgInput)",
  border: "1px solid var(--c-border)",
  borderRadius: 8,
  padding: "0.6rem 0.85rem",
  color: "var(--c-text)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "var(--c-textMuted)",
  marginBottom: 6,
  fontWeight: 600,
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
    <div>
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

function ChoiceBtn({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        background: active ? "var(--c-accentSoft)" : "transparent",
        border: `1px solid ${active ? "var(--c-accent)" : "var(--c-border)"}`,
        color: active ? "var(--c-accent)" : "var(--c-text)",
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
      <div
        style={{
          fontSize: 11.5,
          marginTop: 3,
          color: active ? "var(--c-accent)" : "var(--c-textSubtle)",
        }}
      >
        {sub}
      </div>
    </button>
  );
}

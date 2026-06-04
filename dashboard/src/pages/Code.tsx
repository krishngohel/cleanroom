import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, FolderTree, Lock, Plus, Server, Upload, X } from "lucide-react";
import { api } from "../api/client";
import type { Workspace } from "../types";
import { useToast } from "../components/Toast";

export default function Code() {
  const toast = useToast();
  const navigate = useNavigate();
  const user = api.auth.getUser();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSimple, setShowSimple] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const refresh = () => {
    setLoading(true);
    api.code
      .listWorkspaces()
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

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
            Your files
          </h1>
          <div
            style={{
              fontSize: 13,
              color: "var(--c-textMuted)",
              marginTop: 4,
              maxWidth: 600,
              lineHeight: 1.5,
            }}
          >
            Upload a folder of documents — the AI can read them, edit them, and answer
            questions about them. Every change goes through your review before being saved.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowSimple(true)}
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
            <Plus size={14} /> New folder
          </button>
          {user?.role === "admin" && (
            <button
              onClick={() => setShowAdvanced(true)}
              title="Point at an existing directory on the server"
              style={{
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: 10,
                color: "var(--c-textMuted)",
                padding: "9px 14px",
                cursor: "pointer",
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Server size={13} /> Server folder
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--c-textSubtle)" }}>Loading…</div>
      ) : workspaces.length === 0 ? (
        <div
          style={{
            border: "1px dashed var(--c-border)",
            borderRadius: 14,
            padding: "3rem 1.5rem",
            textAlign: "center",
            color: "var(--c-textMuted)",
          }}
        >
          <FolderTree size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
          <div style={{ fontSize: 16, color: "var(--c-text)", fontWeight: 600 }}>
            No folders yet
          </div>
          <div style={{ fontSize: 13.5, marginTop: 6, maxWidth: 460, marginInline: "auto", lineHeight: 1.55 }}>
            Click <strong>New folder</strong>, give it a name, then drop in any documents
            (.docx → save as .txt first, .csv, .md, .txt, code). The AI can summarize,
            rewrite, translate, or answer questions about them.
          </div>
          <button
            onClick={() => setShowSimple(true)}
            style={{
              marginTop: 16,
              background: "var(--c-accent)",
              border: "none",
              borderRadius: 10,
              color: "var(--c-accentFg)",
              padding: "9px 18px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Plus size={13} /> Create your first folder
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {workspaces.map((w) => (
            <Link key={w.id} to={`/code/${w.id}`} style={{ textDecoration: "none" }}>
              <div className="card" style={{ padding: "1rem 1.1rem", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: "var(--c-accentSoft)",
                      color: "var(--c-accent)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    <FileText size={15} />
                  </div>
                  <div style={{ flex: 1, color: "var(--c-text)", fontWeight: 600 }}>{w.name}</div>
                  {!w.is_writable && (
                    <span title="Read-only" style={{ color: "var(--c-textSubtle)" }}>
                      <Lock size={11} />
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--c-textMuted)",
                    minHeight: 32,
                    lineHeight: 1.45,
                  }}
                >
                  {w.description || (
                    <span style={{ color: "var(--c-textSubtle)" }}>
                      Click to open and add files
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showSimple && (
        <NewFolderModal
          onClose={() => setShowSimple(false)}
          onCreated={(ws) => {
            toast.success(`Created "${ws.name}". Now add some files.`);
            navigate(`/code/${ws.id}?firstrun=1`);
          }}
        />
      )}

      {showAdvanced && (
        <ServerFolderModal
          onClose={() => setShowAdvanced(false)}
          onCreated={(ws) => {
            toast.success(`Server folder "${ws.name}" linked`);
            navigate(`/code/${ws.id}`);
          }}
        />
      )}
    </div>
  );
}

function NewFolderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ws: Workspace) => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sharing, setSharing] = useState<"private" | "shared">("private");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const ws = await api.code.createPersonalWorkspace({
        name,
        description,
        is_shared: sharing === "shared",
      });
      onCreated(ws);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create folder");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal title="New folder" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field
          label="What should we call this folder?"
          help="Use something memorable like 'Q1 reports' or 'Customer emails'."
        >
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Q1 reports"
            style={inputStyle}
          />
        </Field>
        <Field
          label="What's in it? (optional)"
          help="A one-line note so you remember why you created it."
        >
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="January–March earnings summaries from the finance team"
            style={inputStyle}
          />
        </Field>
        <Field label="Who can see this folder?">
          <div style={{ display: "flex", gap: 8 }}>
            <ChoiceBtn
              active={sharing === "private"}
              onClick={() => setSharing("private")}
              title="Only me"
              sub="Keep these files private to your account."
            />
            <ChoiceBtn
              active={sharing === "shared"}
              onClick={() => setSharing("shared")}
              title="Everyone in my company"
              sub="All colleagues in this tenant can see and edit."
            />
          </div>
        </Field>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--c-border)",
              borderRadius: 8,
              color: "var(--c-textMuted)",
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            style={{
              background: creating || !name.trim() ? "var(--c-border)" : "var(--c-accent)",
              border: "none",
              borderRadius: 8,
              color: creating || !name.trim() ? "var(--c-textSubtle)" : "var(--c-accentFg)",
              padding: "8px 20px",
              cursor: creating || !name.trim() ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {creating ? "Creating…" : "Create & add files"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ServerFolderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ws: Workspace) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: "",
    description: "",
    root_path: "",
    is_shared: true,
    is_writable: true,
  });
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const ws = await api.code.createWorkspace(form);
      onCreated(ws);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link server folder");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal title="Link a server folder (admin)" onClose={onClose}>
      <div
        style={{
          background: "var(--c-bgSubtle)",
          border: "1px solid var(--c-border)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12.5,
          color: "var(--c-textMuted)",
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        This is the advanced option. Most people should use <strong>New folder</strong> instead.
        Use this only when you need the AI to work on a directory that already exists on the
        Cleanroom server.
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Display name">
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={inputStyle}
            placeholder="backend-api"
          />
        </Field>
        <Field label="Description">
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={inputStyle}
          />
        </Field>
        <Field label="Path on the server" help="Absolute path. Must already exist.">
          <input
            required
            value={form.root_path}
            onChange={(e) => setForm({ ...form, root_path: e.target.value })}
            placeholder="/srv/repos/backend"
            style={{ ...inputStyle, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13 }}
          />
        </Field>
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
            checked={form.is_writable}
            onChange={(e) => setForm({ ...form, is_writable: e.target.checked })}
          />
          Allow the AI to edit files (uncheck for read-only review)
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--c-border)",
              borderRadius: 8,
              color: "var(--c-textMuted)",
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating}
            style={{
              background: creating ? "var(--c-border)" : "var(--c-accent)",
              border: "none",
              borderRadius: 8,
              color: creating ? "var(--c-textSubtle)" : "var(--c-accentFg)",
              padding: "8px 20px",
              cursor: creating ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {creating ? "Linking…" : "Link folder"}
          </button>
        </div>
      </form>
    </Modal>
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
  fontFamily: "inherit",
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
        <div style={{ fontSize: 11.5, color: "var(--c-textSubtle)", marginBottom: 6 }}>{help}</div>
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
      <div style={{ fontSize: 11.5, marginTop: 3, color: active ? "var(--c-accent)" : "var(--c-textSubtle)" }}>
        {sub}
      </div>
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--c-bgElevated)",
          border: "1px solid var(--c-border)",
          borderRadius: 14,
          padding: "1.5rem",
          width: 500,
          boxShadow: "var(--c-shadow)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--c-text)" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--c-textMuted)",
              cursor: "pointer",
              display: "inline-flex",
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

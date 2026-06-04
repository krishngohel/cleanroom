import { useEffect, useMemo, useState } from "react";
import { File as FileIcon, FileText, Folder, FolderOpen, X } from "lucide-react";
import { api } from "../api/client";
import type { ProjectSummary, Workspace } from "../types";
import { useToast } from "./Toast";

type Destination = "workspace" | "project";

interface Props {
  /** The text content to save. */
  content: string;
  /** Suggested filename (no extension required). */
  suggestedName?: string;
  /** Initial destination selection. */
  initialDestination?: Destination;
  onClose: () => void;
  onSaved?: (info: {
    destination: Destination;
    location: string;
    filename: string;
  }) => void;
}

const EXTENSIONS: { ext: string; label: string }[] = [
  { ext: ".md", label: "Markdown (.md)" },
  { ext: ".txt", label: "Plain text (.txt)" },
  { ext: ".html", label: "HTML (paste into Word, .html)" },
  { ext: ".csv", label: "CSV (.csv)" },
  { ext: ".json", label: "JSON (.json)" },
];

function slugify(s: string): string {
  return (
    s
      .replace(/[^\w\s.-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "document"
  );
}

function ensureExt(name: string, ext: string): string {
  const stripped = name.replace(/\.[a-z0-9]+$/i, "");
  return stripped + ext;
}

function toHtml(markdown: string): string {
  // Tiny markdown → HTML so an exported file pastes cleanly into Word/Outlook.
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = markdown.split("\n");
  const html: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (heading) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      const level = heading[1].length;
      html.push(`<h${level}>${esc(heading[2])}</h${level}>`);
    } else if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${esc(bullet[1])}</li>`);
    } else if (line === "") {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push("");
    } else {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(
        `<p>${esc(line).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>")}</p>`,
      );
    }
  }
  if (inList) html.push("</ul>");
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family: Calibri, Arial, sans-serif">${html.join(
    "\n",
  )}</body></html>`;
}

export default function SaveAsDocumentModal({
  content,
  suggestedName,
  initialDestination = "workspace",
  onClose,
  onSaved,
}: Props) {
  const toast = useToast();
  const [destination, setDestination] = useState<Destination>(initialDestination);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [targetId, setTargetId] = useState<string>("");
  const [folder, setFolder] = useState<string>("");
  const [filename, setFilename] = useState<string>(slugify(suggestedName ?? "document"));
  const [ext, setExt] = useState<string>(".md");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.code
      .listWorkspaces()
      .then((all) => {
        const writable = all.filter((w) => w.is_writable);
        setWorkspaces(writable);
        if (destination === "workspace" && writable.length > 0 && !targetId) {
          setTargetId(writable[0].id);
        }
      })
      .catch(() => setWorkspaces([]));
    api.projects
      .list()
      .then((all) => {
        setProjects(all);
        if (destination === "project" && all.length > 0 && !targetId) {
          setTargetId(all[0].id);
        }
      })
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    // When the destination changes, reset the target to the first available item.
    if (destination === "workspace") {
      setTargetId(workspaces[0]?.id ?? "");
    } else {
      setTargetId(projects[0]?.id ?? "");
    }
  }, [destination, workspaces, projects]);

  const finalPath = useMemo(() => {
    const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
    const cleanName = ensureExt(filename.trim() || "document", ext);
    return cleanFolder ? `${cleanFolder}/${cleanName}` : cleanName;
  }, [folder, filename, ext]);

  const finalContent = useMemo(() => {
    if (ext === ".html") return toHtml(content);
    return content;
  }, [content, ext]);

  const handleSave = async () => {
    if (!targetId) {
      toast.error(
        destination === "workspace"
          ? "Create a Files folder first, then try again."
          : "Create a Project first, then try again.",
      );
      return;
    }
    setSaving(true);
    try {
      if (destination === "workspace") {
        await api.code.writeFile(targetId, finalPath, finalContent);
        const ws = workspaces.find((w) => w.id === targetId);
        toast.success(`Saved to "${ws?.name}" · ${finalPath}`);
        onSaved?.({ destination, location: ws?.name ?? "", filename: finalPath });
      } else {
        // Project upload: convert content + filename to a File and upload.
        const file = new File([finalContent], finalPath.replace(/\//g, "_"), {
          type: ext === ".html" ? "text/html" : "text/plain",
        });
        const proj = projects.find((p) => p.id === targetId);
        await api.projects.uploadFile(targetId, file);
        toast.success(`Added to project "${proj?.name}"`);
        onSaved?.({ destination, location: proj?.name ?? "", filename: file.name });
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const downloadLocal = () => {
    const mime =
      ext === ".html"
        ? "text/html"
        : ext === ".json"
        ? "application/json"
        : ext === ".csv"
        ? "text/csv"
        : "text/plain";
    const blob = new Blob([finalContent], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ensureExt(filename || "document", ext);
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };

  const hasAnyDest = destination === "workspace" ? workspaces.length > 0 : projects.length > 0;

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
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--c-bgElevated)",
          border: "1px solid var(--c-border)",
          borderRadius: 14,
          padding: "1.5rem",
          width: 560,
          maxHeight: "90vh",
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
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              margin: 0,
              color: "var(--c-text)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <FileText size={16} />
            Save as document
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

        <Field label="Where should this go?">
          <div style={{ display: "flex", gap: 8 }}>
            <DestBtn
              active={destination === "workspace"}
              onClick={() => setDestination("workspace")}
              icon={<FolderOpen size={14} />}
              title="A Files folder"
              sub="Saved as a real file you can edit later."
            />
            <DestBtn
              active={destination === "project"}
              onClick={() => setDestination("project")}
              icon={<Folder size={14} />}
              title="A Project"
              sub="Added as a reference file the AI will use in that project's chats."
            />
          </div>
        </Field>

        {!hasAnyDest ? (
          <div
            style={{
              padding: "10px 12px",
              background: "var(--c-bgSubtle)",
              border: "1px dashed var(--c-border)",
              borderRadius: 8,
              fontSize: 13,
              color: "var(--c-textMuted)",
            }}
          >
            {destination === "workspace"
              ? "You don't have any writable Files folders yet. Create one under Files → New folder."
              : "You don't have any Projects yet. Create one under Projects → New project."}
            <button
              type="button"
              onClick={downloadLocal}
              style={{
                display: "block",
                marginTop: 8,
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: 8,
                color: "var(--c-text)",
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 12.5,
              }}
            >
              Or download to your computer
            </button>
          </div>
        ) : (
          <>
            <Field label={destination === "workspace" ? "Folder" : "Project"}>
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                style={inputStyle}
              >
                {destination === "workspace"
                  ? workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))
                  : projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.icon} {p.name}
                      </option>
                    ))}
              </select>
            </Field>

            <Field label="File name">
              <div style={{ display: "flex", gap: 6 }}>
                {destination === "workspace" && (
                  <input
                    value={folder}
                    onChange={(e) => setFolder(e.target.value)}
                    placeholder="optional/sub-folder"
                    style={{
                      ...inputStyle,
                      fontFamily: "ui-monospace, Consolas, monospace",
                      fontSize: 13,
                      width: 180,
                    }}
                  />
                )}
                <input
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="summary"
                  style={{ ...inputStyle, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13 }}
                />
                <select
                  value={ext}
                  onChange={(e) => setExt(e.target.value)}
                  style={{ ...inputStyle, width: 220 }}
                >
                  {EXTENSIONS.map((e) => (
                    <option key={e.ext} value={e.ext}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--c-textSubtle)",
                  marginTop: 6,
                  fontFamily: "ui-monospace, Consolas, monospace",
                }}
              >
                <FileIcon size={10} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                {finalPath}
              </div>
            </Field>

            <Field label="Preview">
              <pre
                style={{
                  background: "var(--c-codeBg)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  margin: 0,
                  fontSize: 12,
                  color: "var(--c-codeText)",
                  maxHeight: 200,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily: "ui-monospace, Consolas, monospace",
                }}
              >
                {finalContent.length > 4000 ? finalContent.slice(0, 4000) + "\n…" : finalContent}
              </pre>
            </Field>
          </>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <button
            type="button"
            onClick={downloadLocal}
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
            Download to my computer
          </button>
          <div style={{ display: "flex", gap: 8 }}>
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
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !hasAnyDest || !filename.trim()}
              style={{
                background:
                  saving || !hasAnyDest || !filename.trim()
                    ? "var(--c-border)"
                    : "var(--c-accent)",
                border: "none",
                borderRadius: 8,
                color:
                  saving || !hasAnyDest || !filename.trim()
                    ? "var(--c-textSubtle)"
                    : "var(--c-accentFg)",
                padding: "7px 18px",
                cursor:
                  saving || !hasAnyDest || !filename.trim() ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DestBtn({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: "left",
        background: active ? "var(--c-accentSoft)" : "transparent",
        border: `1px solid ${active ? "var(--c-accent)" : "var(--c-border)"}`,
        color: active ? "var(--c-accent)" : "var(--c-text)",
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, display: "inline-flex", gap: 6, alignItems: "center" }}>
        {icon}
        {title}
      </div>
      <div
        style={{
          fontSize: 11.5,
          color: active ? "var(--c-accent)" : "var(--c-textSubtle)",
          lineHeight: 1.4,
        }}
      >
        {sub}
      </div>
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--c-bgInput)",
  border: "1px solid var(--c-border)",
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  color: "var(--c-text)",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 13,
          color: "var(--c-text)",
          marginBottom: 6,
          fontWeight: 600,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

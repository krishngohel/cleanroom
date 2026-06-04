import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  MessageSquare,
  Paperclip,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "../api/client";
import type { ProjectDetail as ProjectDetailType, ProjectSearchResult } from "../types";
import { useToast } from "../components/Toast";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const ACTIVE_PROJECT_KEY = "cleanroom_active_project_v1";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const navigate = useNavigate();
  const [project, setProject] = useState<ProjectDetailType | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ProjectSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    if (!id) return;
    api.projects
      .get(id)
      .then((p) => {
        setProject(p);
        setSystemPrompt(p.system_prompt);
        setDescription(p.description);
        setName(p.name);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load project");
        navigate("/projects");
      });
  };

  useEffect(() => {
    refresh();
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await api.projects.update(id, {
        name,
        description,
        system_prompt: systemPrompt,
      });
      toast.success("Project saved");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm(`Delete project "${project?.name}"? This cannot be undone.`)) return;
    try {
      await api.projects.remove(id);
      toast.success("Project deleted");
      navigate("/projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!id || !files) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        await api.projects.uploadFile(id, file);
        toast.success(`Uploaded ${file.name}`);
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    refresh();
  };

  const handleDeleteFile = async (fileId: string, name: string) => {
    if (!id) return;
    if (!window.confirm(`Remove ${name}?`)) return;
    try {
      await api.projects.removeFile(id, fileId);
      toast.success("File removed");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const runSearch = async () => {
    if (!id) return;
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const r = await api.search.project(id, searchQuery.trim());
      setSearchResult(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const openInChat = () => {
    if (!id) return;
    try {
      localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    } catch {
      /* ignore */
    }
    navigate("/chat");
  };

  if (!project) {
    return (
      <div style={{ padding: "1.5rem", color: "var(--c-textSubtle)" }}>Loading…</div>
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
    fontFamily: "inherit",
  };

  return (
    <div style={{ padding: "1.5rem", overflowY: "auto" }}>
      <button
        onClick={() => navigate("/projects")}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--c-textMuted)",
          cursor: "pointer",
          fontSize: 12.5,
          marginBottom: 14,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <ArrowLeft size={12} /> Back to projects
      </button>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 22,
          borderTop: `3px solid ${project.color}`,
          paddingTop: 14,
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ fontSize: 36 }}>{project.icon}</div>
          <div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                background: "transparent",
                border: "1px solid transparent",
                color: "var(--c-text)",
                fontSize: 22,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 6,
                outline: "none",
              }}
            />
            <div style={{ fontSize: 11, color: "var(--c-textSubtle)", paddingLeft: 6 }}>
              Updated {new Date(project.updated_at).toLocaleString()} · {project.file_count} files · {formatBytes(project.total_bytes)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={openInChat}
            style={{
              background: "var(--c-accent)",
              border: "none",
              borderRadius: 8,
              color: "var(--c-accentFg)",
              padding: "8px 14px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <MessageSquare size={13} /> Open in Cowork
          </button>
          <button
            onClick={handleDelete}
            style={{
              background: "transparent",
              border: "1px solid var(--c-border)",
              borderRadius: 8,
              color: "var(--c-danger)",
              padding: "8px 12px",
              cursor: "pointer",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      {/* Search across files */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div
          style={{
            fontSize: 11,
            color: "var(--c-textSubtle)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Search size={11} /> Search inside this project
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Find a word or phrase across every file in this project…"
            style={{ ...inputStyle, fontSize: 13 }}
          />
          <button
            onClick={() => void runSearch()}
            disabled={searching || searchQuery.trim().length < 2}
            style={{
              background:
                searching || searchQuery.trim().length < 2
                  ? "var(--c-border)"
                  : "var(--c-accent)",
              border: "none",
              borderRadius: 8,
              color:
                searching || searchQuery.trim().length < 2
                  ? "var(--c-textSubtle)"
                  : "var(--c-accentFg)",
              padding: "7px 16px",
              cursor:
                searching || searchQuery.trim().length < 2 ? "not-allowed" : "pointer",
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {searching ? "Searching…" : "Search"}
          </button>
          {searchResult && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchResult(null);
              }}
              style={{
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: 8,
                color: "var(--c-textMuted)",
                padding: "7px 12px",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Clear
            </button>
          )}
        </div>

        {searchResult && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: "var(--c-textSubtle)", marginBottom: 8 }}>
              {searchResult.total_matches === 0
                ? "No matches"
                : `${searchResult.total_matches} matches in ${searchResult.file_count} ${
                    searchResult.file_count === 1 ? "file" : "files"
                  }`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {searchResult.files.map((f) => (
                <div
                  key={f.file_id}
                  style={{
                    background: "var(--c-bgSubtle)",
                    border: "1px solid var(--c-border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12.5,
                      color: "var(--c-text)",
                      fontWeight: 600,
                      marginBottom: 4,
                      display: "flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <FileText size={12} />
                    {f.filename}
                    <span style={{ color: "var(--c-textSubtle)", fontWeight: 400 }}>
                      · {f.match_count} {f.match_count === 1 ? "match" : "matches"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {f.snippets.map((s, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 12,
                          color: "var(--c-textMuted)",
                          fontFamily: "ui-monospace, Consolas, monospace",
                          background: "var(--c-bgInput)",
                          border: "1px solid var(--c-border)",
                          borderRadius: 6,
                          padding: "4px 8px",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                      >
                        <span style={{ color: "var(--c-textSubtle)" }}>L{s.line}: </span>
                        {s.before}
                        <strong
                          style={{ background: "var(--c-accentSoft)", color: "var(--c-accent)" }}
                        >
                          {s.match}
                        </strong>
                        {s.after}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
        <div className="card">
          <div
            style={{
              fontSize: 11,
              color: "var(--c-textSubtle)",
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            What the AI should remember
          </div>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--c-textMuted)",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Description
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={inputStyle}
              placeholder="What is this project for?"
            />
          </div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              color: "var(--c-textMuted)",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Background instructions (sent at the start of every chat in this project)
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={12}
            placeholder="Tell the AI who it is and how to behave. For example: 'Act as our finance analyst. Always cite the row number when answering. Use plain English. If something isn't in the attached docs, say so.'"
            style={{
              ...inputStyle,
              resize: "vertical",
              fontFamily: "ui-monospace, Consolas, monospace",
              fontSize: 13,
              minHeight: 200,
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <span style={{ fontSize: 11, color: "var(--c-textSubtle)" }}>
              {systemPrompt.length.toLocaleString()} characters
            </span>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: "var(--c-accent)",
                border: "none",
                borderRadius: 8,
                color: "var(--c-accentFg)",
                padding: "7px 18px",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
                fontSize: 13,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Save size={13} /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--c-textSubtle)",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Reference files ({project.files.length})
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => void handleUpload(e.target.files)}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                background: "transparent",
                border: "1px solid var(--c-border)",
                color: "var(--c-textMuted)",
                borderRadius: 8,
                padding: "5px 11px",
                fontSize: 12,
                cursor: uploading ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Upload size={12} /> {uploading ? "Uploading…" : "Add files"}
            </button>
          </div>

          {project.files.length === 0 ? (
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
              <Paperclip size={14} style={{ opacity: 0.5, marginBottom: 6 }} />
              <div>
                No reference files yet. Upload text files (.txt, .md, .csv, .json) and the AI will
                automatically use them in every chat in this project.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {project.files.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid var(--c-border)",
                  }}
                >
                  <FileText size={14} style={{ color: "var(--c-textMuted)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--c-text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.filename}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--c-textSubtle)" }}>
                      {formatBytes(f.size_bytes)} · {new Date(f.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => void handleDeleteFile(f.id, f.filename)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--c-textSubtle)",
                      cursor: "pointer",
                      padding: 4,
                      display: "inline-flex",
                    }}
                    aria-label="Delete file"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

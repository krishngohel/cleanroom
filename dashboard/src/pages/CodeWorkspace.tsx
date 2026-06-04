import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  FilePlus,
  FileText,
  FolderPlus,
  FolderUp,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { api } from "../api/client";
import type { TreeEntry, Workspace } from "../types";
import FileTree from "../components/FileTree";
import Diff, { diffStats } from "../components/Diff";
import { useToast } from "../components/Toast";
import { useCompliance } from "../compliance/useCompliance";

const MAX_UPLOAD_BYTES = 1_000_000;
const TEXT_EXT_RE = /\.(txt|md|markdown|rst|csv|tsv|json|yaml|yml|toml|ini|cfg|env|log|xml|html|htm|css|scss|less|js|jsx|ts|tsx|mjs|cjs|vue|svelte|py|pyi|rb|php|pl|lua|sh|bash|zsh|fish|ps1|bat|cmd|sql|graphql|gql|go|rs|java|kt|swift|c|cpp|cc|h|hpp|hh|m|mm|cs|fs|fsx|vb|lisp|clj|cljs|elm|ex|exs|erl|hs|scala|dart|tf)$/i;

type EditPhase = "idle" | "thinking" | "ready" | "applying" | "applied" | "error";

interface ProposedEdit {
  path: string;
  before: string;
  proposed: string;
  model: string;
}

export default function CodeWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { settings: compliance } = useCompliance();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [instruction, setInstruction] = useState("");
  const [editPhase, setEditPhase] = useState<EditPhase>("idle");
  const [proposed, setProposed] = useState<ProposedEdit | null>(null);
  const [editStartedAt, setEditStartedAt] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [showFirstRun, setShowFirstRun] = useState(searchParams.get("firstrun") === "1");
  const [draggingOver, setDraggingOver] = useState(false);
  const [createKind, setCreateKind] = useState<null | "file" | "folder">(null);
  const [createName, setCreateName] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [genName, setGenName] = useState("");
  const [genInstruction, setGenInstruction] = useState("");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshTree = () => {
    if (!id) return;
    api.code
      .listTree(id)
      .then((r) => setEntries(r.entries))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Tree load failed"));
  };

  useEffect(() => {
    if (!id) return;
    api.code
      .getWorkspace(id)
      .then(setWorkspace)
      .catch(() => {
        toast.error("Workspace not found");
        navigate("/code");
      });
    refreshTree();
    api.models
      .list()
      .then((list) => {
        const names = list.map((m) => m.id);
        setModels(names);
        if (names.length > 0) setSelectedModel(names[0]);
      })
      .catch(() => setModels([]));
  }, [id]);

  // Block accidental navigation away from dirty content.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const handleSelectFile = async (path: string) => {
    if (!id) return;
    if (dirty && !window.confirm("You have unsaved edits — discard them?")) return;
    try {
      const f = await api.code.readFile(id, path);
      setSelectedPath(path);
      setFileContent(f.content);
      setDirty(false);
      setProposed(null);
      setEditPhase("idle");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open file");
    }
  };

  const handleSave = async () => {
    if (!id || !selectedPath) return;
    try {
      await api.code.writeFile(id, selectedPath, fileContent);
      toast.success(`Saved ${selectedPath}`);
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDelete = async () => {
    if (!id || !selectedPath) return;
    if (!window.confirm(`Delete ${selectedPath}?`)) return;
    try {
      await api.code.deleteFile(id, selectedPath);
      toast.success("File deleted");
      setSelectedPath(null);
      setFileContent("");
      setDirty(false);
      refreshTree();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handlePropose = async () => {
    if (!id || !selectedPath || !instruction.trim()) return;
    setEditPhase("thinking");
    setProposed(null);
    setEditStartedAt(Date.now());

    // DLP scrub the instruction itself (the request body) before sending.
    let scrubbedInstruction = instruction;
    if (compliance.dlp_enabled && compliance.dlp_patterns.length > 0) {
      // Lazy-import dlp module
      const { applyDlp, totalRedactions } = await import("../compliance/dlp");
      const r = applyDlp(instruction, compliance.dlp_patterns);
      scrubbedInstruction = r.text;
      const total = totalRedactions(r);
      if (total > 0) {
        toast.info(`DLP redacted ${total} item${total === 1 ? "" : "s"} from your instruction`);
      }
    }

    try {
      const res = await api.code.proposeEdit(
        id,
        selectedPath,
        scrubbedInstruction,
        selectedModel || undefined,
      );
      setProposed({
        path: res.path,
        before: res.current_content,
        proposed: res.proposed_content,
        model: res.model,
      });
      setEditPhase("ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Edit failed";
      toast.error(msg);
      setEditPhase("error");
    }
  };

  const handleApply = async () => {
    if (!id || !proposed) return;
    setEditPhase("applying");
    try {
      await api.code.writeFile(id, proposed.path, proposed.proposed);
      setFileContent(proposed.proposed);
      setDirty(false);
      setProposed(null);
      setEditPhase("applied");
      toast.success(`Applied edit to ${proposed.path}`);
      window.setTimeout(() => setEditPhase("idle"), 1500);
      refreshTree();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
      setEditPhase("error");
    }
  };

  const handleReject = () => {
    setProposed(null);
    setEditPhase("idle");
  };

  const uploadFiles = async (files: File[]) => {
    if (!id || files.length === 0) return;
    const accepted: { rel: string; file: File }[] = [];
    const rejected: string[] = [];
    for (const f of files) {
      const rel = ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(/\\/g, "/");
      // Strip the leading directory the picker prepends so files don't all get a "folder/" prefix.
      const cleanRel = rel.includes("/") ? rel.slice(rel.indexOf("/") + 1) : rel;
      const isText = TEXT_EXT_RE.test(f.name) || f.type.startsWith("text/");
      if (!isText) {
        rejected.push(`${f.name} (not a text file)`);
        continue;
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        rejected.push(`${f.name} (too large)`);
        continue;
      }
      accepted.push({ rel: cleanRel, file: f });
    }
    if (rejected.length > 0) {
      toast.error(`Skipped ${rejected.length}: ${rejected.slice(0, 3).join(", ")}${rejected.length > 3 ? "…" : ""}`);
    }
    if (accepted.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: accepted.length });
    let succeeded = 0;
    for (const { rel, file } of accepted) {
      try {
        const content = await file.text();
        await api.code.writeFile(id, rel, content);
        succeeded++;
      } catch (err) {
        toast.error(`${rel}: ${err instanceof Error ? err.message : "upload failed"}`);
      }
      setUploadProgress({ done: succeeded, total: accepted.length });
    }
    setUploading(false);
    setUploadProgress(null);
    toast.success(`Uploaded ${succeeded} file${succeeded === 1 ? "" : "s"}`);
    refreshTree();
    if (showFirstRun) {
      setShowFirstRun(false);
      setSearchParams({}, { replace: true });
    }
  };

  const handleFolderPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    await uploadFiles(files);
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    await uploadFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCreate = async () => {
    if (!id || !createKind || !createName.trim()) return;
    const path = createName.trim().replace(/^\/+/, "");
    try {
      if (createKind === "file") {
        await api.code.writeFile(id, path, "");
        toast.success(`Created ${path}`);
        setCreateKind(null);
        setCreateName("");
        await refreshTree();
        await handleSelectFile(path);
      } else {
        await api.code.createDir(id, path);
        toast.success(`Created folder ${path}`);
        setCreateKind(null);
        setCreateName("");
        await refreshTree();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    }
  };

  const handleGenerateNew = async () => {
    if (!id || !genName.trim() || !genInstruction.trim()) return;
    const path = genName.trim().replace(/^\/+/, "");
    setEditPhase("thinking");
    setProposed(null);
    setEditStartedAt(Date.now());

    let scrubbed = genInstruction;
    if (compliance.dlp_enabled && compliance.dlp_patterns.length > 0) {
      const { applyDlp, totalRedactions } = await import("../compliance/dlp");
      const r = applyDlp(genInstruction, compliance.dlp_patterns);
      scrubbed = r.text;
      const total = totalRedactions(r);
      if (total > 0) {
        toast.info(`DLP redacted ${total} item${total === 1 ? "" : "s"} from your instruction`);
      }
    }

    try {
      // The propose endpoint accepts a non-existent path — current_content
      // comes back empty and the model writes from scratch.
      const res = await api.code.proposeEdit(id, path, scrubbed, selectedModel || undefined);
      setSelectedPath(path);
      setFileContent(""); // base is empty since this is a new file
      setDirty(false);
      setProposed({
        path: res.path,
        before: res.current_content,
        proposed: res.proposed_content,
        model: res.model,
      });
      setEditPhase("ready");
      setShowGenerate(false);
      setInstruction("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
      setEditPhase("error");
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(false);
    const items = e.dataTransfer.items;
    if (items && items.length > 0 && (items[0] as DataTransferItem & { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry) {
      // Walk dropped folders via the entries API
      const walked = await walkEntries(items);
      await uploadFiles(walked);
    } else {
      // Plain file list
      const files = Array.from(e.dataTransfer.files);
      await uploadFiles(files);
    }
  };

  const elapsedMs = useMemo(() => {
    if (!editStartedAt) return 0;
    return Date.now() - editStartedAt;
  }, [editStartedAt, editPhase]);

  if (!workspace) {
    return <div style={{ padding: "1.5rem", color: "var(--c-textSubtle)" }}>Loading…</div>;
  }

  const stats = proposed ? diffStats(proposed.before, proposed.proposed) : null;
  const canWrite = workspace.is_writable;
  const isEmpty = entries.length === 0;

  return (
    <div
      style={{ display: "flex", height: "100%", background: "var(--c-bg)", position: "relative" }}
      onDragOver={(e) => {
        if (!canWrite) return;
        e.preventDefault();
        setDraggingOver(true);
      }}
      onDragLeave={(e) => {
        // Only clear if leaving the whole panel
        if (e.currentTarget === e.target) setDraggingOver(false);
      }}
      onDrop={canWrite ? handleDrop : undefined}
    >
      {draggingOver && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--c-accentSoft)",
            border: "3px dashed var(--c-accent)",
            borderRadius: 14,
            zIndex: 50,
            display: "grid",
            placeItems: "center",
            color: "var(--c-accent)",
            fontSize: 18,
            fontWeight: 700,
            pointerEvents: "none",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <FolderUp size={32} style={{ marginBottom: 8 }} />
            <div>Drop to upload to "{workspace.name}"</div>
          </div>
        </div>
      )}
      {uploadProgress && (
        <div
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--c-bgElevated)",
            border: "1px solid var(--c-border)",
            borderRadius: 10,
            padding: "8px 14px",
            fontSize: 12.5,
            color: "var(--c-text)",
            zIndex: 80,
            boxShadow: "var(--c-shadow)",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Loader2 size={13} className="cleanroom-spin" />
          Uploading {uploadProgress.done}/{uploadProgress.total}…
        </div>
      )}

      {/* Hidden inputs */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error — non-standard but widely supported
        webkitdirectory=""
        directory=""
        onChange={handleFolderPick}
        style={{ display: "none" }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFilePick}
        style={{ display: "none" }}
      />

      {/* File tree */}
      <aside
        style={{
          width: 260,
          borderRight: "1px solid var(--c-border)",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          background: "var(--c-bgElevated)",
        }}
      >
        <div
          style={{
            padding: "0.75rem 0.85rem",
            borderBottom: "1px solid var(--c-border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            onClick={() => navigate("/code")}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--c-textMuted)",
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
            }}
            aria-label="Back to workspaces"
          >
            <ArrowLeft size={14} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--c-text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {workspace.name}
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--c-textSubtle)",
                fontFamily: "ui-monospace, Consolas, monospace",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={workspace.root_path}
            >
              {workspace.root_path}
            </div>
          </div>
          <button
            onClick={refreshTree}
            title="Refresh file list"
            style={{
              background: "transparent",
              border: "1px solid var(--c-border)",
              borderRadius: 6,
              color: "var(--c-textMuted)",
              cursor: "pointer",
              padding: "3px 6px",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <RefreshCw size={11} />
          </button>
        </div>
        {canWrite && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              padding: "0.5rem 0.6rem 0.4rem",
              borderBottom: "1px solid var(--c-border)",
            }}
          >
            <button
              onClick={() => {
                setCreateKind("file");
                setCreateName("");
              }}
              disabled={uploading}
              title="Create a blank file"
              style={tinyBtn(true)}
            >
              <FilePlus size={11} />
              New file
            </button>
            <button
              onClick={() => {
                setCreateKind("folder");
                setCreateName("");
              }}
              disabled={uploading}
              title="Create a new folder"
              style={tinyBtn(false)}
            >
              <FolderPlus size={11} />
              Folder
            </button>
            <button
              onClick={() => folderInputRef.current?.click()}
              disabled={uploading}
              title="Upload a folder of existing files"
              style={tinyBtn(false)}
            >
              <FolderUp size={11} />
              Upload
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Upload individual files"
              style={{ ...tinyBtn(false), flex: "0 0 auto", paddingInline: 8 }}
            >
              <Upload size={11} />
            </button>
          </div>
        )}
        {createKind && (
          <div
            style={{
              padding: "6px 10px 8px",
              borderBottom: "1px solid var(--c-border)",
              background: "var(--c-bgSubtle)",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--c-textSubtle)", marginBottom: 4 }}>
              {createKind === "file" ? "New file name (path optional)" : "New folder path"}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                autoFocus
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleCreate();
                  }
                  if (e.key === "Escape") setCreateKind(null);
                }}
                placeholder={createKind === "file" ? "notes/draft.md" : "reports/2026"}
                style={{
                  flex: 1,
                  background: "var(--c-bgInput)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 6,
                  color: "var(--c-text)",
                  padding: "4px 8px",
                  fontSize: 12,
                  fontFamily: "ui-monospace, Consolas, monospace",
                  outline: "none",
                  minWidth: 0,
                }}
              />
              <button
                onClick={() => void handleCreate()}
                disabled={!createName.trim()}
                style={{
                  background: createName.trim() ? "var(--c-accent)" : "var(--c-border)",
                  color: createName.trim() ? "var(--c-accentFg)" : "var(--c-textSubtle)",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: createName.trim() ? "pointer" : "not-allowed",
                }}
              >
                Create
              </button>
              <button
                onClick={() => setCreateKind(null)}
                style={{
                  background: "transparent",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-textMuted)",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
              >
                <X size={10} />
              </button>
            </div>
          </div>
        )}
        {isEmpty && canWrite ? (
          <div
            style={{
              flex: 1,
              padding: "1rem 0.75rem",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: "var(--c-textMuted)",
            }}
          >
            <FolderUp size={28} style={{ opacity: 0.5 }} />
            <div style={{ fontSize: 13, color: "var(--c-text)", fontWeight: 600 }}>
              Drop a folder here
            </div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5, padding: "0 0.5rem" }}>
              Or click <strong>Upload folder</strong> above. The AI can summarize,
              edit, and answer questions about whatever you add.
            </div>
          </div>
        ) : (
          <FileTree entries={entries} selected={selectedPath} onSelect={handleSelectFile} />
        )}
      </aside>

      {/* Editor */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {showFirstRun && (
          <FirstRunBanner
            onDismiss={() => {
              setShowFirstRun(false);
              setSearchParams({}, { replace: true });
            }}
            onUploadFolder={() => folderInputRef.current?.click()}
          />
        )}
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--c-border)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--c-bgElevated)",
          }}
        >
          {selectedPath ? (
            <>
              <FileText size={14} style={{ color: "var(--c-textMuted)" }} />
              <span
                style={{
                  fontFamily: "ui-monospace, Consolas, monospace",
                  fontSize: 13,
                  color: "var(--c-text)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedPath}
                {dirty && <span style={{ color: "var(--c-warning)", marginLeft: 6 }}>●</span>}
              </span>
              <button
                onClick={handleSave}
                disabled={!dirty || !canWrite}
                style={{
                  background: dirty && canWrite ? "var(--c-accent)" : "transparent",
                  border: `1px solid ${dirty && canWrite ? "var(--c-accent)" : "var(--c-border)"}`,
                  borderRadius: 8,
                  color: dirty && canWrite ? "var(--c-accentFg)" : "var(--c-textSubtle)",
                  padding: "5px 12px",
                  cursor: dirty && canWrite ? "pointer" : "not-allowed",
                  fontSize: 12.5,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Save size={11} />
                Save
              </button>
              {canWrite && (
                <button
                  onClick={handleDelete}
                  title="Delete file"
                  style={{
                    background: "transparent",
                    border: "1px solid var(--c-border)",
                    borderRadius: 8,
                    color: "var(--c-danger)",
                    padding: "5px 8px",
                    cursor: "pointer",
                    display: "inline-flex",
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </>
          ) : (
            <span style={{ color: "var(--c-textSubtle)", fontSize: 13 }}>
              Select a file from the tree to begin
            </span>
          )}
        </div>

        {proposed ? (
          <DiffReviewer
            proposed={proposed}
            stats={stats!}
            onApply={handleApply}
            onReject={handleReject}
            applying={editPhase === "applying"}
            disabled={!canWrite}
          />
        ) : selectedPath ? (
          <textarea
            ref={editorRef}
            value={fileContent}
            onChange={(e) => {
              setFileContent(e.target.value);
              setDirty(true);
            }}
            readOnly={!canWrite}
            spellCheck={false}
            style={{
              flex: 1,
              width: "100%",
              border: "none",
              outline: "none",
              resize: "none",
              padding: "0.85rem 1rem",
              background: "var(--c-bg)",
              color: "var(--c-text)",
              fontFamily: "ui-monospace, Consolas, Menlo, monospace",
              fontSize: 13,
              lineHeight: 1.55,
              tabSize: 2,
              whiteSpace: "pre",
              overflowWrap: "normal",
              overflowX: "auto",
            }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: "grid",
              placeItems: "center",
              color: "var(--c-textSubtle)",
              fontSize: 14,
              padding: "1rem",
            }}
          >
            <div style={{ textAlign: "center", maxWidth: 380 }}>
              <FileText size={32} style={{ opacity: 0.4, marginBottom: 10 }} />
              <div style={{ fontSize: 15, color: "var(--c-text)", fontWeight: 600 }}>
                {isEmpty ? "No files yet" : "Pick a file from the left"}
              </div>
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.55 }}>
                {isEmpty
                  ? "Use the Upload folder button on the left, or drag a folder anywhere in this window."
                  : "Click any file in the tree to read it, edit it, or ask the AI to change it."}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI assistant */}
      <aside
        style={{
          width: 320,
          borderLeft: "1px solid var(--c-border)",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--c-textSubtle)",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            gap: 6,
            justifyContent: "space-between",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={12} />
            {selectedPath ? "Ask the AI to change this file" : "Ask the AI to create a file"}
          </span>
          {canWrite && (
            <button
              onClick={() => {
                setShowGenerate(true);
                if (!genName) {
                  setGenName("new-file.md");
                }
              }}
              title="Have the AI generate a brand-new file from a description"
              style={{
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: 6,
                color: "var(--c-textMuted)",
                padding: "3px 8px",
                fontSize: 10.5,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                textTransform: "none",
                letterSpacing: 0,
              }}
            >
              <Wand2 size={10} />
              New file with AI
            </button>
          )}
        </div>

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

        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={
            selectedPath
              ? "Describe what you want changed. For example: 'Fix any typos' · 'Make this more concise' · 'Translate to Spanish' · 'Add a summary at the top'"
              : "First pick a file on the left, then describe the change you want."
          }
          rows={6}
          disabled={!selectedPath || editPhase === "thinking" || editPhase === "applying"}
          style={{
            background: "var(--c-bgInput)",
            border: "1px solid var(--c-border)",
            borderRadius: 10,
            padding: "0.65rem 0.8rem",
            color: "var(--c-text)",
            fontSize: 13,
            outline: "none",
            resize: "vertical",
            fontFamily: "inherit",
            minHeight: 90,
          }}
        />

        <button
          onClick={handlePropose}
          disabled={
            !selectedPath ||
            !instruction.trim() ||
            !canWrite ||
            editPhase === "thinking" ||
            editPhase === "applying"
          }
          style={{
            background:
              !selectedPath || !instruction.trim() || !canWrite
                ? "var(--c-border)"
                : "var(--c-accent)",
            border: "none",
            borderRadius: 10,
            color:
              !selectedPath || !instruction.trim() || !canWrite
                ? "var(--c-textSubtle)"
                : "var(--c-accentFg)",
            padding: "9px 14px",
            cursor:
              !selectedPath || !instruction.trim() || !canWrite
                ? "not-allowed"
                : "pointer",
            fontSize: 13,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {editPhase === "thinking" ? (
            <>
              <Loader2 size={14} className="cleanroom-spin" /> Thinking…
            </>
          ) : (
            <>
              <Sparkles size={14} /> Suggest a change
            </>
          )}
        </button>

        <ActivitySteps phase={editPhase} elapsedMs={elapsedMs} model={selectedModel} />

        <style>{`@keyframes cleanroom-spin { to { transform: rotate(360deg) } } .cleanroom-spin { animation: cleanroom-spin 0.8s linear infinite; }`}</style>
      </aside>

      {showGenerate && (
        <div
          onClick={() => setShowGenerate(false)}
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
              width: 520,
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
                <Wand2 size={16} />
                Create a new file with AI
              </h2>
              <button
                onClick={() => setShowGenerate(false)}
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
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  color: "var(--c-text)",
                  marginBottom: 4,
                  fontWeight: 600,
                }}
              >
                File path
              </label>
              <input
                value={genName}
                onChange={(e) => setGenName(e.target.value)}
                placeholder="notes/quarterly-summary.md"
                style={{
                  width: "100%",
                  background: "var(--c-bgInput)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 8,
                  padding: "0.55rem 0.8rem",
                  color: "var(--c-text)",
                  fontSize: 13,
                  fontFamily: "ui-monospace, Consolas, monospace",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ fontSize: 11.5, color: "var(--c-textSubtle)", marginTop: 4 }}>
                Use any path inside this workspace. Folders will be created automatically.
              </div>
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  color: "var(--c-text)",
                  marginBottom: 4,
                  fontWeight: 600,
                }}
              >
                What should be in it?
              </label>
              <textarea
                value={genInstruction}
                onChange={(e) => setGenInstruction(e.target.value)}
                placeholder={`e.g. "A 1-page summary of these meeting notes:\\n…" or "A Python script that renames every .jpg in a folder to lowercase".`}
                rows={6}
                style={{
                  width: "100%",
                  background: "var(--c-bgInput)",
                  border: "1px solid var(--c-border)",
                  borderRadius: 8,
                  padding: "0.55rem 0.8rem",
                  color: "var(--c-text)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                  resize: "vertical",
                  fontFamily: "inherit",
                  minHeight: 110,
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowGenerate(false)}
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
                onClick={() => void handleGenerateNew()}
                disabled={!genName.trim() || !genInstruction.trim() || editPhase === "thinking"}
                style={{
                  background:
                    !genName.trim() || !genInstruction.trim() || editPhase === "thinking"
                      ? "var(--c-border)"
                      : "var(--c-accent)",
                  border: "none",
                  borderRadius: 8,
                  color:
                    !genName.trim() || !genInstruction.trim() || editPhase === "thinking"
                      ? "var(--c-textSubtle)"
                      : "var(--c-accentFg)",
                  padding: "7px 18px",
                  cursor:
                    !genName.trim() || !genInstruction.trim() || editPhase === "thinking"
                      ? "not-allowed"
                      : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {editPhase === "thinking" ? (
                  <>
                    <Loader2 size={12} className="cleanroom-spin" /> Writing…
                  </>
                ) : (
                  <>
                    <Wand2 size={12} /> Draft it
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiffReviewer({
  proposed,
  stats,
  onApply,
  onReject,
  applying,
  disabled,
}: {
  proposed: ProposedEdit;
  stats: { added: number; removed: number };
  onApply: () => void;
  onReject: () => void;
  applying: boolean;
  disabled: boolean;
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          padding: "10px 14px",
          background: "var(--c-bgSubtle)",
          borderBottom: "1px solid var(--c-border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Sparkles size={13} style={{ color: "var(--c-accent)" }} />
        <span style={{ fontSize: 13, color: "var(--c-text)", fontWeight: 600 }}>Suggested change — review before applying</span>
        <span style={{ color: "var(--c-success)", fontSize: 12, fontWeight: 600 }}>
          +{stats.added}
        </span>
        <span style={{ color: "var(--c-danger)", fontSize: 12, fontWeight: 600 }}>
          −{stats.removed}
        </span>
        <span style={{ fontSize: 11, color: "var(--c-textSubtle)" }}>by {proposed.model}</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onReject}
          disabled={applying}
          style={{
            background: "transparent",
            border: "1px solid var(--c-border)",
            borderRadius: 8,
            color: "var(--c-textMuted)",
            padding: "5px 12px",
            cursor: applying ? "not-allowed" : "pointer",
            fontSize: 12.5,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <X size={11} /> Reject
        </button>
        <button
          onClick={onApply}
          disabled={applying || disabled}
          style={{
            background: applying || disabled ? "var(--c-border)" : "var(--c-success)",
            border: "none",
            borderRadius: 8,
            color: applying || disabled ? "var(--c-textSubtle)" : "#fff",
            padding: "5px 14px",
            cursor: applying || disabled ? "not-allowed" : "pointer",
            fontSize: 12.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {applying ? <Loader2 size={11} className="cleanroom-spin" /> : <Check size={11} />}
          Apply
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
        <Diff before={proposed.before} after={proposed.proposed} />
      </div>
    </div>
  );
}

function tinyBtn(primary: boolean): React.CSSProperties {
  return {
    background: primary ? "var(--c-accentSoft)" : "transparent",
    border: `1px solid ${primary ? "var(--c-accent)" : "var(--c-border)"}`,
    color: primary ? "var(--c-accent)" : "var(--c-textMuted)",
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 11.5,
    fontWeight: 600,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    cursor: "pointer",
    flex: 1,
  };
}

// Walk DataTransferItemList entries to flatten dropped folders. Each yielded
// File carries a `webkitRelativePath` so we can preserve the folder structure.
async function walkEntries(items: DataTransferItemList): Promise<File[]> {
  type Entry = {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
    fullPath: string;
    file: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
    createReader: () => {
      readEntries: (cb: (entries: Entry[]) => void) => void;
    };
  };

  const results: File[] = [];

  async function walk(entry: Entry, prefix: string) {
    if (entry.isFile) {
      const file: File = await new Promise((resolve, reject) =>
        entry.file(resolve, reject),
      );
      // Re-wrap with webkitRelativePath so uploadFiles sees the structure
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      Object.defineProperty(file, "webkitRelativePath", {
        value: rel,
        configurable: true,
      });
      results.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const children: Entry[] = await new Promise((resolve) => reader.readEntries(resolve));
      for (const child of children) {
        await walk(child, prefix ? `${prefix}/${entry.name}` : entry.name);
      }
    }
  }

  for (let i = 0; i < items.length; i++) {
    const it = items[i] as DataTransferItem & { webkitGetAsEntry?: () => unknown };
    const entry = it.webkitGetAsEntry?.() as Entry | null | undefined;
    if (entry) {
      await walk(entry, "");
    }
  }
  return results;
}

function FirstRunBanner({ onDismiss, onUploadFolder }: { onDismiss: () => void; onUploadFolder: () => void }) {
  return (
    <div
      style={{
        background: "var(--c-accentSoft)",
        border: "1px solid var(--c-accent)",
        borderRadius: 12,
        padding: "12px 16px",
        margin: "12px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Sparkles size={16} style={{ color: "var(--c-accent)", flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 13, color: "var(--c-text)", lineHeight: 1.5 }}>
        <strong>You're ready.</strong> Click <strong>Upload folder</strong> on the left to add
        your documents, or just drag a folder into this window.
      </div>
      <button
        onClick={onUploadFolder}
        style={{
          background: "var(--c-accent)",
          border: "none",
          borderRadius: 8,
          color: "var(--c-accentFg)",
          padding: "6px 14px",
          cursor: "pointer",
          fontSize: 12.5,
          fontWeight: 600,
        }}
      >
        Upload folder
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--c-textMuted)",
          cursor: "pointer",
          display: "inline-flex",
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function ActivitySteps({
  phase,
  elapsedMs,
  model,
}: {
  phase: EditPhase;
  elapsedMs: number;
  model: string;
}) {
  const steps: { key: EditPhase | "any"; label: string }[] = [
    { key: "thinking", label: "Reading file & sending to model" },
    { key: "ready", label: "Diff ready to review" },
    { key: "applying", label: "Writing to disk" },
    { key: "applied", label: "Done" },
  ];

  const phaseRank: Record<EditPhase, number> = {
    idle: 0,
    thinking: 1,
    ready: 2,
    applying: 3,
    applied: 4,
    error: 0,
  };

  return (
    <div
      style={{
        background: "var(--c-bgElevated)",
        border: "1px solid var(--c-border)",
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: 2,
          width: phase === "thinking" || phase === "applying" ? "100%" : phase === "applied" ? "100%" : "0%",
          background:
            phase === "error"
              ? "var(--c-danger)"
              : phase === "applied"
              ? "var(--c-success)"
              : "var(--c-accent)",
          opacity: phase === "thinking" || phase === "applying" ? 1 : 0.6,
          transition: "width 200ms, background 160ms",
        }}
      />
      <div
        style={{
          fontSize: 10.5,
          color: "var(--c-textSubtle)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 700,
        }}
      >
        Steps
      </div>
      {steps.map((s) => {
        const active = phase === s.key;
        const done = phaseRank[phase] > phaseRank[s.key as EditPhase];
        return (
          <div
            key={s.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: active ? "var(--c-text)" : done ? "var(--c-textMuted)" : "var(--c-textSubtle)",
              fontWeight: active ? 600 : 500,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: done
                  ? "var(--c-success)"
                  : active
                  ? "var(--c-accent)"
                  : "var(--c-border)",
                boxShadow: active ? "0 0 0 3px var(--c-accentSoft)" : "none",
              }}
            />
            <span>{s.label}</span>
          </div>
        );
      })}
      <div
        style={{
          fontSize: 10.5,
          color: "var(--c-textSubtle)",
          marginTop: 4,
          paddingTop: 4,
          borderTop: "1px solid var(--c-border)",
        }}
      >
        Model: {model || "—"}
        {(phase === "thinking" || phase === "applying") &&
          ` · ${(elapsedMs / 1000).toFixed(1)}s`}
        {phase === "error" && " · failed"}
      </div>
    </div>
  );
}

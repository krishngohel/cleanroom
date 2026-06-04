import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import type { TreeEntry } from "../types";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  size?: number;
  children: TreeNode[];
}

function buildTree(entries: TreeEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", type: "dir", children: [] };
  const dirMap = new Map<string, TreeNode>([["", root]]);

  // Ensure parent dirs exist for files even if not listed
  const ensureDir = (p: string): TreeNode => {
    if (dirMap.has(p)) return dirMap.get(p)!;
    const parentPath = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    const parent = ensureDir(parentPath);
    const name = p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p;
    const node: TreeNode = { name, path: p, type: "dir", children: [] };
    parent.children.push(node);
    dirMap.set(p, node);
    return node;
  };

  for (const e of entries) {
    if (e.type === "dir") {
      ensureDir(e.path);
    } else {
      const parentPath = e.path.includes("/") ? e.path.slice(0, e.path.lastIndexOf("/")) : "";
      const parent = ensureDir(parentPath);
      const name = e.path.includes("/") ? e.path.slice(e.path.lastIndexOf("/") + 1) : e.path;
      parent.children.push({ name, path: e.path, type: "file", size: e.size, children: [] });
    }
  }

  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const c of n.children) sortRec(c);
  };
  sortRec(root);
  return root.children;
}

function Node({
  node,
  depth,
  selected,
  expanded,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const isExpanded = expanded.has(node.path);
  const isSelected = node.type === "file" && selected === node.path;

  const handleClick = () => {
    if (node.type === "dir") onToggle(node.path);
    else onSelect(node.path);
  };

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 6px",
          paddingLeft: depth * 12 + 6,
          fontSize: 12.5,
          cursor: "pointer",
          color: isSelected ? "var(--c-accent)" : "var(--c-textMuted)",
          background: isSelected ? "var(--c-accentSoft)" : "transparent",
          borderRadius: 4,
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
        title={node.path}
      >
        {node.type === "dir" ? (
          <>
            {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {isExpanded ? <FolderOpen size={12} /> : <Folder size={12} />}
          </>
        ) : (
          <>
            <span style={{ width: 11 }} />
            <File size={12} />
          </>
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{node.name}</span>
      </div>
      {node.type === "dir" &&
        isExpanded &&
        node.children.map((c) => (
          <Node
            key={c.path}
            node={c}
            depth={depth + 1}
            selected={selected}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export default function FileTree({
  entries,
  selected,
  onSelect,
}: {
  entries: TreeEntry[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(entries), [entries]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [filter, setFilter] = useState("");

  const handleToggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const filteredEntries = useMemo(() => {
    if (!filter.trim()) return tree;
    const term = filter.toLowerCase();
    const matched: TreeEntry[] = entries.filter(
      (e) => e.type === "file" && e.path.toLowerCase().includes(term),
    );
    return buildTree(matched);
  }, [filter, entries, tree]);

  // When filtering, auto-expand everything
  const effExpanded = filter.trim()
    ? new Set(entries.filter((e) => e.type === "dir").map((e) => e.path).concat(""))
    : expanded;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "0.5rem 0.5rem 0.4rem" }}>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter files…"
          style={{
            width: "100%",
            background: "var(--c-bgInput)",
            border: "1px solid var(--c-border)",
            borderRadius: 6,
            color: "var(--c-text)",
            padding: "4px 8px",
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 0.3rem 0.5rem" }}>
        {filteredEntries.length === 0 ? (
          <div style={{ color: "var(--c-textSubtle)", fontSize: 12, padding: "0.5rem" }}>
            {filter ? "No matches" : "Empty workspace"}
          </div>
        ) : (
          filteredEntries.map((n) => (
            <Node
              key={n.path}
              node={n}
              depth={0}
              selected={selected}
              expanded={effExpanded}
              onToggle={handleToggle}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, FolderOpen, FileText, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../api/client";
import { useTenantBrand } from "../theme/useTenant";
import { useCompliance } from "../compliance/useCompliance";

interface QuickStats {
  conversations: number;
  projects: number;
  workspaces: number;
}

export default function Welcome() {
  const brand = useTenantBrand();
  const { settings: compliance } = useCompliance();
  const user = api.auth.getUser();
  const [stats, setStats] = useState<QuickStats>({
    conversations: 0,
    projects: 0,
    workspaces: 0,
  });

  useEffect(() => {
    // Best-effort: pull counts in parallel, fall back silently
    Promise.all([
      api.projects.list().catch(() => []),
      api.code.listWorkspaces().catch(() => []),
    ]).then(([projects, workspaces]) => {
      let conversations = 0;
      try {
        const raw = localStorage.getItem("cleanroom_conversations_v1");
        if (raw) conversations = (JSON.parse(raw) as unknown[]).length;
      } catch {
        /* ignore */
      }
      setStats({
        conversations,
        projects: projects.length,
        workspaces: workspaces.length,
      });
    });
  }, []);

  const greeting = (() => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 18) return "Good afternoon";
    return "Good evening";
  })();

  const cards = [
    {
      to: "/chat",
      title: "Start a conversation",
      blurb: "Ask any question. Summarize a document. Draft an email. Work through a problem together.",
      icon: <MessageSquare size={20} />,
      color: "var(--c-accent)",
      cta: "Open chat",
      stat: `${stats.conversations} conversations`,
    },
    {
      to: "/projects",
      title: "Set up a project",
      blurb:
        "Give the AI long-term memory. Add reference files (policies, contracts, manuals) once — they'll be available in every chat tied to that project.",
      icon: <FolderOpen size={20} />,
      color: "#a855f7",
      cta: "Browse projects",
      stat: `${stats.projects} projects`,
    },
    {
      to: "/code",
      title: "Work on files together",
      blurb:
        "Upload a folder of documents or code. Ask the AI to edit, reformat, or summarize — review every change before it's applied.",
      icon: <FileText size={20} />,
      color: "#22c55e",
      cta: "Open files",
      stat: `${stats.workspaces} folders`,
    },
  ];

  return (
    <div style={{ padding: "2rem 2.5rem", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <Sparkles size={20} style={{ color: "var(--c-accent)" }} />
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            margin: 0,
            color: "var(--c-text)",
          }}
        >
          {greeting}{user?.username ? `, ${user.username}` : ""}
        </h1>
      </div>
      <p
        style={{
          color: "var(--c-textMuted)",
          fontSize: 14.5,
          marginBottom: 24,
          maxWidth: 720,
          lineHeight: 1.55,
        }}
      >
        Welcome to {brand.brand_name}. This is your private AI assistant — running entirely on your
        organization's servers. Nothing you type or upload ever leaves this network. What would you like to do?
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            style={{ textDecoration: "none", display: "block" }}
          >
            <div
              className="card"
              style={{
                padding: "1.25rem 1.35rem",
                height: "100%",
                position: "relative",
                overflow: "hidden",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                borderTop: `3px solid ${c.color}`,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: c.color + "22",
                  color: c.color,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {c.icon}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--c-text)" }}>{c.title}</div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--c-textMuted)",
                  lineHeight: 1.55,
                  flex: 1,
                }}
              >
                {c.blurb}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 12,
                  paddingTop: 8,
                  borderTop: "1px solid var(--c-border)",
                }}
              >
                <span style={{ color: "var(--c-textSubtle)" }}>{c.stat}</span>
                <span
                  style={{
                    color: c.color,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {c.cta} <ArrowRight size={12} />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="card" style={{ maxWidth: 920 }}>
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
          <ShieldCheck size={12} /> How your data is protected
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            fontSize: 13,
            color: "var(--c-textMuted)",
            lineHeight: 1.55,
          }}
        >
          <div>
            <strong style={{ color: "var(--c-text)" }}>Stays on-prem.</strong>{" "}
            Every message, file, and answer is processed on your organization's servers. The AI model never
            sees the public internet.
          </div>
          <div>
            <strong style={{ color: "var(--c-text)" }}>Auto-redacts sensitive info.</strong>{" "}
            Things like Social Security numbers, credit cards, and email addresses are scrubbed automatically
            before the AI sees them.
          </div>
          <div>
            <strong style={{ color: "var(--c-text)" }}>Audit-logged.</strong>{" "}
            Every action is recorded for compliance{" "}
            {compliance.compliance_frameworks.length > 0 &&
              `(${compliance.compliance_frameworks.join(", ")})`}{" "}
            — kept for {compliance.audit_retention_days} days.
          </div>
        </div>
      </div>
    </div>
  );
}

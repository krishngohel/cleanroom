import { useEffect } from "react";
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { LogOut, MessageSquare, FileText, Activity, Settings, Shield, FileSearch, FolderOpen, Home, BarChart3, Wand2 } from "lucide-react";
import { api } from "./api/client";
import Chat from "./pages/Chat";
import Reports from "./pages/Reports";
import Status from "./pages/Status";
import Admin from "./pages/Admin";
import AuditLog from "./pages/AuditLog";
import Login from "./pages/Login";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Code from "./pages/Code";
import CodeWorkspace from "./pages/CodeWorkspace";
import Welcome from "./pages/Welcome";
import Prompts from "./pages/Prompts";
import Insights from "./pages/Insights";
import { useTheme } from "./theme/ThemeProvider";
import { useTenantBrand } from "./theme/useTenant";
import { useCompliance } from "./compliance/useCompliance";
import ThemeToggle from "./components/ThemeToggle";
import ComplianceBanner, { ComplianceFooter } from "./components/ComplianceBanner";
import AssistantDock from "./components/AssistantDock";

const sidebarStyle: React.CSSProperties = {
  width: 232,
  background: "var(--c-bgElevated)",
  padding: "1.25rem 0.85rem",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  flexShrink: 0,
  borderRight: "1px solid var(--c-border)",
};

const navStyle = (isActive: boolean): React.CSSProperties => ({
  color: isActive ? "var(--c-accent)" : "var(--c-textMuted)",
  textDecoration: "none",
  padding: "0.5rem 0.75rem",
  borderRadius: 8,
  background: isActive ? "var(--c-accentSoft)" : "transparent",
  fontWeight: isActive ? 600 : 500,
  fontSize: 13.5,
  display: "flex",
  alignItems: "center",
  gap: 10,
});

function AuthGuard({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const token = api.auth.getToken();
  const user = api.auth.getUser();

  if (!token || !user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/chat" replace />;
  return <>{children}</>;
}

function Layout() {
  const navigate = useNavigate();
  const user = api.auth.getUser();
  const brand = useTenantBrand();
  const { settings: compliance } = useCompliance();
  const { setTenantDefault } = useTheme();

  useEffect(() => {
    setTenantDefault(brand.default_theme);
    if (brand.accent_color) {
      document.documentElement.style.setProperty("--c-accent", brand.accent_color);
    }
  }, [brand.default_theme, brand.accent_color, setTenantDefault]);

  const handleLogout = () => {
    api.auth.logout();
    navigate("/login");
  };

  const navItems: { to: string; label: string; icon: ReactNode }[] = [
    { to: "/welcome", label: "Home", icon: <Home size={15} /> },
    { to: "/chat", label: "Chat", icon: <MessageSquare size={15} /> },
    { to: "/projects", label: "Projects", icon: <FolderOpen size={15} /> },
    { to: "/code", label: "Files", icon: <FileText size={15} /> },
    { to: "/prompts", label: "Prompts", icon: <Wand2 size={15} /> },
    { to: "/reports", label: "Reports", icon: <Activity size={15} /> },
  ];

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--c-bg)",
        color: "var(--c-text)",
        marginRight: "var(--c-dock-width, 0px)",
        transition: "margin-right 160ms ease",
      }}
    >
      <nav style={sidebarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0.5rem", marginBottom: 16 }}>
          {brand.logo_url ? (
            <img src={brand.logo_url} alt="" style={{ width: 22, height: 22, borderRadius: 4 }} />
          ) : (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: "var(--c-accent)",
                display: "grid",
                placeItems: "center",
                color: "var(--c-accentFg)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {brand.brand_name.charAt(0)}
            </div>
          )}
          <div style={{ color: "var(--c-text)", fontWeight: 700, fontSize: 14 }}>{brand.brand_name}</div>
        </div>

        {navItems.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} style={({ isActive }) => navStyle(isActive)}>
            {icon}
            {label}
          </NavLink>
        ))}

        {user?.role === "admin" && (
          <>
            <div style={{ borderTop: "1px solid var(--c-border)", margin: "10px 0 6px" }} />
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1,
                color: "var(--c-textSubtle)",
                padding: "4px 0.75rem 6px",
                textTransform: "uppercase",
              }}
            >
              Admin
            </div>
            <NavLink to="/insights" style={({ isActive }) => navStyle(isActive)}>
              <BarChart3 size={15} />
              Insights
            </NavLink>
            <NavLink to="/admin" style={({ isActive }) => navStyle(isActive)}>
              <Settings size={15} />
              Settings
            </NavLink>
            <NavLink to="/admin/audit" style={({ isActive }) => navStyle(isActive)}>
              <FileSearch size={15} />
              Audit Log
            </NavLink>
          </>
        )}

        <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--c-border)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 0.4rem 8px",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "var(--c-textMuted)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Shield size={12} />
              <span>
                {user?.username}
                <span style={{ color: "var(--c-textSubtle)" }}> · {user?.role}</span>
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {brand.allow_theme_toggle && <ThemeToggle compact />}
            <button
              onClick={handleLogout}
              style={{
                flex: 1,
                background: "transparent",
                border: "1px solid var(--c-border)",
                borderRadius: 8,
                color: "var(--c-textMuted)",
                padding: "6px 10px",
                cursor: "pointer",
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main
        style={{
          flex: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <ComplianceBanner settings={compliance} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/code" element={<Code />} />
            <Route path="/code/:id" element={<CodeWorkspace />} />
            <Route path="/prompts" element={<Prompts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/status" element={<Status />} />
            <Route path="/insights" element={<AuthGuard adminOnly><Insights /></AuthGuard>} />
            <Route path="/admin" element={<AuthGuard adminOnly><Admin /></AuthGuard>} />
            <Route path="/admin/audit" element={<AuthGuard adminOnly><AuditLog /></AuthGuard>} />
            <Route path="*" element={<Navigate to="/welcome" replace />} />
          </Routes>
        </div>
        <ComplianceFooter settings={compliance} />
      </main>
      {compliance.assistant_dock_enabled && (
        <AssistantDock
          controlEnabled={compliance.computer_control_enabled}
          agentUrl={compliance.agent_socket_url}
          requireConfirmation={compliance.require_action_confirmation}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

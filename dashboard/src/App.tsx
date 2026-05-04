import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { api } from "./api/client";
import Chat from "./pages/Chat";
import Reports from "./pages/Reports";
import Status from "./pages/Status";
import Admin from "./pages/Admin";
import AuditLog from "./pages/AuditLog";
import Login from "./pages/Login";

const sidebarStyle: React.CSSProperties = {
  width: 220,
  background: "#1e293b",
  padding: "1.5rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: 4,
  flexShrink: 0,
  borderRight: "1px solid #334155",
};

const navStyle = (isActive: boolean): React.CSSProperties => ({
  color: isActive ? "#38bdf8" : "#94a3b8",
  textDecoration: "none",
  padding: "0.5rem 0.75rem",
  borderRadius: 6,
  background: isActive ? "rgba(56,189,248,0.1)" : "transparent",
  fontWeight: isActive ? 600 : 400,
  fontSize: 14,
  display: "block",
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

  const handleLogout = () => {
    api.auth.logout();
    navigate("/login");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f172a", color: "#e2e8f0" }}>
      <nav style={sidebarStyle}>
        <div style={{ color: "#38bdf8", fontWeight: 700, fontSize: 16, marginBottom: 20, padding: "0 0.75rem" }}>
          Cleanroom AI
        </div>

        {[
          { to: "/chat", label: "Chat" },
          { to: "/reports", label: "Reports" },
          { to: "/status", label: "Status" },
        ].map(({ to, label }) => (
          <NavLink key={to} to={to} style={({ isActive }) => navStyle(isActive)}>
            {label}
          </NavLink>
        ))}

        {user?.role === "admin" && (
          <>
            <div style={{ borderTop: "1px solid #334155", margin: "8px 0" }} />
            <NavLink to="/admin" style={({ isActive }) => navStyle(isActive)}>Admin</NavLink>
            <NavLink to="/admin/audit" style={({ isActive }) => navStyle(isActive)}>Audit Log</NavLink>
          </>
        )}

        <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #334155" }}>
          <div style={{ fontSize: 12, color: "#64748b", padding: "0 0.75rem", marginBottom: 8 }}>
            {user?.username} · {user?.role}
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#94a3b8",
              padding: "0.4rem 0.75rem",
              cursor: "pointer",
              fontSize: 13,
              textAlign: "left",
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <Routes>
          <Route path="/chat" element={<Chat />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/status" element={<Status />} />
          <Route path="/admin" element={<AuthGuard adminOnly><Admin /></AuthGuard>} />
          <Route path="/admin/audit" element={<AuthGuard adminOnly><AuditLog /></AuthGuard>} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>
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

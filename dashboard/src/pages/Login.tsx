import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.auth.login(username, password);
      navigate("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 8,
    padding: "0.65rem 0.875rem",
    color: "#e2e8f0",
    fontSize: 15,
    boxSizing: "border-box",
    outline: "none",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f172a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#e2e8f0",
    }}>
      <div style={{
        width: 360,
        background: "#1e293b",
        borderRadius: 12,
        padding: "2.5rem 2rem",
        border: "1px solid #334155",
      }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#38bdf8", marginBottom: 8 }}>
            Cleanroom AI
          </div>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Sign in to your organization's AI platform
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
              autoFocus
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid #ef4444",
              borderRadius: 6,
              padding: "0.5rem 0.75rem",
              fontSize: 13,
              color: "#fca5a5",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: "#0ea5e9",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "0.7rem",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              marginTop: 4,
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", fontSize: 12, color: "#475569", textAlign: "center" }}>
          Accounts are created by your system administrator.
        </div>
      </div>
    </div>
  );
}

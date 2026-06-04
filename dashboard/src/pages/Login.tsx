import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Loader2 } from "lucide-react";
import { api } from "../api/client";
import { useTenantBrand } from "../theme/useTenant";
import { useTheme } from "../theme/ThemeProvider";

export default function Login() {
  const navigate = useNavigate();
  const brand = useTenantBrand();
  const { setTenantDefault } = useTheme();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTenantDefault(brand.default_theme);
  }, [brand.default_theme, setTenantDefault]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.auth.login(username, password);
      navigate("/welcome");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "var(--c-bgInput)",
    border: "1px solid var(--c-border)",
    borderRadius: 10,
    padding: "0.7rem 0.9rem",
    color: "var(--c-text)",
    fontSize: 15,
    boxSizing: "border-box",
    outline: "none",
    transition: "border-color 120ms",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 20% 0%, var(--c-accentSoft), transparent 50%), var(--c-bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--c-text)",
        padding: "2rem",
      }}
    >
      <div
        style={{
          width: 380,
          background: "var(--c-bgElevated)",
          borderRadius: 16,
          padding: "2.25rem 2rem",
          border: "1px solid var(--c-border)",
          boxShadow: "var(--c-shadow)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          {brand.logo_url ? (
            <img
              src={brand.logo_url}
              alt=""
              style={{ width: 44, height: 44, borderRadius: 10, marginBottom: 12 }}
            />
          ) : (
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "var(--c-accent)",
                color: "var(--c-accentFg)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 12px",
                fontWeight: 800,
                fontSize: 20,
              }}
            >
              {brand.brand_name.charAt(0)}
            </div>
          )}
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--c-text)", marginBottom: 4 }}>
            {brand.brand_name}
          </div>
          <div style={{ fontSize: 13, color: "var(--c-textSubtle)" }}>
            Sign in to your organization's AI platform
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
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
            <label style={{ display: "block", fontSize: 12, color: "var(--c-textMuted)", marginBottom: 6, fontWeight: 600 }}>
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
            <div
              style={{
                background: "var(--c-dangerSoft)",
                border: "1px solid var(--c-danger)",
                borderRadius: 8,
                padding: "0.55rem 0.75rem",
                fontSize: 13,
                color: "var(--c-danger)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: "var(--c-accent)",
              color: "var(--c-accentFg)",
              border: "none",
              borderRadius: 10,
              padding: "0.75rem",
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={15} className="cleanroom-spin" /> Signing in…
              </>
            ) : (
              <>
                <Lock size={14} /> Sign in
              </>
            )}
          </button>
        </form>

        <div
          style={{
            marginTop: "1.5rem",
            fontSize: 12,
            color: "var(--c-textSubtle)",
            textAlign: "center",
          }}
        >
          Accounts are created by your system administrator.
        </div>
        <style>{`@keyframes cleanroom-spin { to { transform: rotate(360deg) } } .cleanroom-spin { animation: cleanroom-spin 0.8s linear infinite; }`}</style>
      </div>
    </div>
  );
}

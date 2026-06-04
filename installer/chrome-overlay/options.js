const $ = (id) => document.getElementById(id);

const DEFAULTS = {
  apiUrl: "http://localhost:8000",
  token: "",
  model: "",
  theme: "dark",
};

async function load() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  $("apiUrl").value = stored.apiUrl;
  $("token").value = stored.token;
  $("model").value = stored.model;
  $("theme").value = stored.theme;
}

async function save() {
  const data = {
    apiUrl: $("apiUrl").value.trim().replace(/\/$/, ""),
    token: $("token").value.trim(),
    model: $("model").value.trim(),
    theme: $("theme").value,
  };
  await chrome.storage.sync.set(data);
  setStatus("Saved.", false);
}

async function testConnection() {
  setStatus("Testing…", false);
  const apiUrl = $("apiUrl").value.trim().replace(/\/$/, "");
  const token = $("token").value.trim();
  try {
    const r = await fetch(`${apiUrl}/v1/models`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      setStatus(`Server returned ${r.status}`, true);
      return;
    }
    const data = await r.json();
    const count = (data.data ?? []).length;
    setStatus(`Connected — ${count} models available`, false);
  } catch (err) {
    setStatus(`Connection failed: ${err.message}`, true);
  }
}

function setStatus(text, isError) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (isError ? " err" : "");
}

document.addEventListener("DOMContentLoaded", () => {
  void load();
  $("save").addEventListener("click", save);
  $("test").addEventListener("click", testConnection);
});

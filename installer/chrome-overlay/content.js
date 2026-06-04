// Cleanroom AI Overlay — content script.
// Injects a floating chat panel that can read the current selection
// (works great for Excel cells, Word selections, Google Docs/Sheets).

(() => {
  if (window.__cleanroomOverlayInjected) return;
  window.__cleanroomOverlayInjected = true;

  const ROOT_ID = "cleanroom-overlay-root";
  const SHADOW_HOST_ID = "cleanroom-overlay-host";

  // -------- State --------
  let visible = false;
  let messages = []; // { role, content }
  let model = "";
  let availableModels = [];
  let streaming = false;
  let currentRequestId = null;
  let pendingAssistant = null;

  // -------- DOM --------
  let host, shadow, panel, msgEl, inputEl, sendBtn, modelSelect, statusEl;

  function ensureMounted() {
    if (host) return;
    host = document.createElement("div");
    host.id = SHADOW_HOST_ID;
    host.style.cssText =
      "all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; pointer-events: none;";
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });

    // Styles inside shadow (so we don't pollute page styles)
    const style = document.createElement("style");
    style.textContent = STYLE_CSS;
    shadow.appendChild(style);

    panel = document.createElement("div");
    panel.id = ROOT_ID;
    panel.className = "cr-panel cr-hidden";
    panel.innerHTML = TEMPLATE_HTML;
    shadow.appendChild(panel);

    // Refs
    msgEl = shadow.getElementById("cr-messages");
    inputEl = shadow.getElementById("cr-input");
    sendBtn = shadow.getElementById("cr-send");
    modelSelect = shadow.getElementById("cr-model");
    statusEl = shadow.getElementById("cr-status");

    // Events
    shadow.getElementById("cr-close").addEventListener("click", hide);
    shadow.getElementById("cr-min").addEventListener("click", hide);
    shadow.getElementById("cr-clear").addEventListener("click", () => {
      messages = [];
      render();
    });
    shadow.getElementById("cr-grab-selection").addEventListener("click", grabSelection);
    sendBtn.addEventListener("click", send);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    modelSelect.addEventListener("change", () => {
      model = modelSelect.value;
    });

    // Drag handle
    makeDraggable(panel, shadow.getElementById("cr-titlebar"));

    // Theme
    applyThemeFromSettings();
    loadModels();
  }

  function show() {
    ensureMounted();
    panel.classList.remove("cr-hidden");
    host.style.pointerEvents = "auto";
    visible = true;
    setTimeout(() => inputEl?.focus(), 30);
  }

  function hide() {
    if (!panel) return;
    panel.classList.add("cr-hidden");
    host.style.pointerEvents = "none";
    visible = false;
  }

  function toggle() {
    if (visible) hide();
    else show();
  }

  // -------- Theme --------
  async function applyThemeFromSettings() {
    const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
    const theme = settings?.theme === "light" ? "light" : "dark";
    panel.setAttribute("data-theme", theme);
  }

  async function loadModels() {
    const r = await chrome.runtime.sendMessage({ type: "LIST_MODELS" });
    if (r?.models?.length) {
      availableModels = r.models;
      const settings = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" });
      model = settings?.model || availableModels[0];
      modelSelect.innerHTML = availableModels
        .map((m) => `<option value="${m}" ${m === model ? "selected" : ""}>${m}</option>`)
        .join("");
    } else {
      statusEl.textContent = r?.error ?? "No models — configure extension options";
    }
  }

  // -------- Selection grabbing (works for plain text + Office.com Excel/Word) --------
  function grabSelection() {
    const sel = window.getSelection?.()?.toString().trim();
    if (sel) {
      injectSelection(sel);
      return;
    }
    // Excel Online: try clipboard read fallback
    statusEl.textContent =
      "Select text first (or copy Excel cells with Ctrl+C, then click Grab again).";
    setTimeout(() => (statusEl.textContent = ""), 4000);
    navigator.clipboard
      ?.readText()
      .then((text) => {
        if (text?.trim()) injectSelection(text.trim());
      })
      .catch(() => {});
  }

  function injectSelection(text) {
    const trimmed = text.length > 8000 ? text.slice(0, 8000) + "\n…(truncated)" : text;
    const prefix = inputEl.value ? inputEl.value + "\n\n" : "";
    inputEl.value =
      prefix + "Context (selected from " + getPageKind() + "):\n```\n" + trimmed + "\n```\n\n";
    inputEl.focus();
    autoresize();
  }

  function getPageKind() {
    const h = location.hostname;
    if (h.includes("officeapps.live") || h.includes("office.com")) {
      if (location.pathname.includes("/x/")) return "Excel";
      if (location.pathname.includes("/wv/") || location.pathname.includes("/w/")) return "Word";
      return "Office";
    }
    if (h.includes("docs.google.com")) {
      if (location.pathname.includes("/spreadsheets/")) return "Google Sheets";
      if (location.pathname.includes("/document/")) return "Google Docs";
      return "Google Drive";
    }
    if (h.includes("sharepoint.com")) return "SharePoint";
    return "this page";
  }

  // -------- Chat --------
  function send() {
    const text = inputEl.value.trim();
    if (!text || streaming) return;
    messages.push({ role: "user", content: text });
    pendingAssistant = { role: "assistant", content: "" };
    messages.push(pendingAssistant);
    inputEl.value = "";
    autoresize();
    streaming = true;
    sendBtn.disabled = true;
    statusEl.textContent = "Thinking…";
    render();

    currentRequestId = "req-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    chrome.runtime
      .sendMessage({
        type: "CLEANROOM_CHAT",
        payload: {
          messages: messages
            .filter((m) => m !== pendingAssistant)
            .map((m) => ({ role: m.role, content: m.content })),
          model,
          requestId: currentRequestId,
        },
      })
      .then((res) => {
        streaming = false;
        sendBtn.disabled = false;
        statusEl.textContent = "";
        if (res?.error) {
          pendingAssistant.content = "⚠ " + res.error;
          render();
        }
      });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_OVERLAY") {
      toggle();
      return;
    }
    if (msg.type === "ASK_WITH_SELECTION") {
      show();
      injectSelection(msg.selection || "");
      return;
    }
    if (msg.type === "CLEANROOM_CHUNK" && msg.requestId === currentRequestId && pendingAssistant) {
      pendingAssistant.content += msg.delta;
      renderMessageContent(pendingAssistant);
      scrollMessages();
    }
  });

  // -------- Rendering --------
  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMarkdown(s) {
    let out = escapeHtml(s);
    out = out.replace(/```([\w]*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
      return `<pre><code>${code}</code></pre>`;
    });
    out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/\n/g, "<br/>");
    return out;
  }

  function render() {
    msgEl.innerHTML = "";
    for (const m of messages) {
      const div = document.createElement("div");
      div.className = "cr-msg cr-msg-" + m.role;
      div.dataset.role = m.role;
      div.innerHTML =
        `<div class="cr-msg-role">${m.role === "user" ? "You" : "Assistant"}</div>` +
        `<div class="cr-msg-content">${renderMarkdown(m.content || "…")}</div>`;
      msgEl.appendChild(div);
    }
    scrollMessages();
  }

  function renderMessageContent(m) {
    // Update only the last message's content for streaming
    const all = msgEl.querySelectorAll(".cr-msg");
    const last = all[all.length - 1];
    if (last && last.dataset.role === m.role) {
      const content = last.querySelector(".cr-msg-content");
      if (content) content.innerHTML = renderMarkdown(m.content || "…");
    } else {
      render();
    }
  }

  function scrollMessages() {
    msgEl.scrollTop = msgEl.scrollHeight;
  }

  function autoresize() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(160, inputEl.scrollHeight) + "px";
  }
  // Wire autoresize after mount
  setTimeout(() => {
    inputEl?.addEventListener("input", autoresize);
  }, 0);

  // -------- Drag --------
  function makeDraggable(panelEl, handleEl) {
    let dragging = false;
    let offsetX = 0,
      offsetY = 0;
    handleEl.addEventListener("mousedown", (e) => {
      dragging = true;
      const rect = panelEl.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const x = Math.max(0, Math.min(window.innerWidth - 200, e.clientX - offsetX));
      const y = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - offsetY));
      host.style.left = x + "px";
      host.style.top = y + "px";
      host.style.right = "auto";
      host.style.bottom = "auto";
    });
    window.addEventListener("mouseup", () => (dragging = false));
  }

  // -------- Templates --------
  const TEMPLATE_HTML = `
    <div id="cr-titlebar" class="cr-titlebar">
      <div class="cr-brand">
        <div class="cr-logo">C</div>
        <div class="cr-title">Cleanroom AI</div>
      </div>
      <div class="cr-titlebar-actions">
        <button id="cr-min" title="Minimize">—</button>
        <button id="cr-close" title="Close">×</button>
      </div>
    </div>
    <div class="cr-controls">
      <select id="cr-model"></select>
      <button id="cr-grab-selection" class="cr-btn cr-btn-ghost" title="Grab selection (or clipboard)">Grab selection</button>
      <button id="cr-clear" class="cr-btn cr-btn-ghost">Clear</button>
    </div>
    <div id="cr-messages" class="cr-messages">
      <div class="cr-hint">
        Select a range in Excel or text in Word/Docs, then click <b>Grab selection</b> — or just type below.
        Everything stays on your network.
      </div>
    </div>
    <div id="cr-status" class="cr-status"></div>
    <div class="cr-input-row">
      <textarea id="cr-input" rows="1" placeholder="Ask Cleanroom… (Enter to send)"></textarea>
      <button id="cr-send" class="cr-btn cr-btn-primary">Send</button>
    </div>
  `;

  const STYLE_CSS = `
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .cr-panel {
      width: 380px;
      height: 540px;
      background: var(--cr-bg);
      color: var(--cr-text);
      border: 1px solid var(--cr-border);
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 18px 48px rgba(0,0,0,0.35);
      font-size: 13px;
    }
    .cr-panel[data-theme="dark"] {
      --cr-bg: #0f172a;
      --cr-bg-elev: #1e293b;
      --cr-bg-sub: #0b1220;
      --cr-border: #334155;
      --cr-text: #e2e8f0;
      --cr-text-muted: #94a3b8;
      --cr-text-sub: #64748b;
      --cr-accent: #38bdf8;
      --cr-accent-fg: #0b1220;
    }
    .cr-panel[data-theme="light"] {
      --cr-bg: #ffffff;
      --cr-bg-elev: #f8fafc;
      --cr-bg-sub: #f1f5f9;
      --cr-border: #e2e8f0;
      --cr-text: #0f172a;
      --cr-text-muted: #475569;
      --cr-text-sub: #64748b;
      --cr-accent: #0284c7;
      --cr-accent-fg: #ffffff;
    }
    .cr-hidden { display: none !important; }
    .cr-titlebar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 9px 12px;
      background: var(--cr-bg-elev);
      border-bottom: 1px solid var(--cr-border);
      cursor: move;
      user-select: none;
    }
    .cr-brand { display: flex; align-items: center; gap: 8px; }
    .cr-logo {
      width: 22px; height: 22px; border-radius: 6px;
      background: var(--cr-accent);
      color: var(--cr-accent-fg);
      display: grid; place-items: center;
      font-weight: 700; font-size: 12px;
    }
    .cr-title { font-weight: 700; font-size: 13px; }
    .cr-titlebar-actions button {
      background: transparent; border: none; color: var(--cr-text-muted);
      width: 22px; height: 22px; cursor: pointer; font-size: 14px;
      border-radius: 4px;
    }
    .cr-titlebar-actions button:hover { background: var(--cr-bg-sub); color: var(--cr-text); }

    .cr-controls {
      display: flex; gap: 6px; padding: 8px 10px;
      border-bottom: 1px solid var(--cr-border);
      background: var(--cr-bg);
    }
    .cr-controls select {
      flex: 0 1 auto; min-width: 0;
      background: var(--cr-bg-elev); color: var(--cr-text);
      border: 1px solid var(--cr-border); border-radius: 6px;
      padding: 4px 8px; font-size: 12px;
    }
    .cr-btn {
      border-radius: 6px; padding: 4px 10px; font-size: 12px;
      cursor: pointer; border: 1px solid var(--cr-border);
      background: var(--cr-bg-elev); color: var(--cr-text-muted);
    }
    .cr-btn:hover { color: var(--cr-text); }
    .cr-btn-primary {
      background: var(--cr-accent); color: var(--cr-accent-fg);
      border-color: var(--cr-accent); font-weight: 600;
    }
    .cr-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .cr-messages {
      flex: 1; overflow-y: auto; padding: 12px;
      display: flex; flex-direction: column; gap: 10px;
      background: var(--cr-bg);
    }
    .cr-hint {
      color: var(--cr-text-sub); font-size: 12px; line-height: 1.55;
      padding: 12px; border: 1px dashed var(--cr-border); border-radius: 10px;
    }
    .cr-msg { display: flex; flex-direction: column; gap: 3px; }
    .cr-msg-role { font-size: 11px; font-weight: 600; color: var(--cr-text-sub); }
    .cr-msg-content {
      background: var(--cr-bg-elev);
      border: 1px solid var(--cr-border);
      border-radius: 10px; padding: 8px 10px;
      line-height: 1.55; word-wrap: break-word; overflow-wrap: break-word;
    }
    .cr-msg-user .cr-msg-content {
      background: var(--cr-accent);
      color: var(--cr-accent-fg);
      border-color: var(--cr-accent);
    }
    .cr-msg-content pre {
      background: var(--cr-bg-sub); border: 1px solid var(--cr-border);
      padding: 8px; border-radius: 8px; overflow-x: auto; margin: 6px 0;
      font-family: ui-monospace, Consolas, monospace; font-size: 12px;
    }
    .cr-msg-content code {
      background: var(--cr-bg-sub); padding: 1px 4px;
      border-radius: 3px; font-family: ui-monospace, Consolas, monospace;
      font-size: 12px;
    }
    .cr-msg-user .cr-msg-content code,
    .cr-msg-user .cr-msg-content pre {
      background: rgba(255,255,255,0.18);
      color: inherit;
      border-color: rgba(255,255,255,0.25);
    }

    .cr-status {
      padding: 0 12px; font-size: 11px; color: var(--cr-text-sub); min-height: 14px;
    }
    .cr-input-row {
      display: flex; gap: 6px; padding: 8px 10px 10px;
      border-top: 1px solid var(--cr-border); background: var(--cr-bg);
    }
    #cr-input {
      flex: 1; background: var(--cr-bg-elev); color: var(--cr-text);
      border: 1px solid var(--cr-border); border-radius: 8px;
      padding: 8px 10px; resize: none; font-size: 13px;
      max-height: 160px; outline: none; font-family: inherit;
    }
    #cr-input:focus { border-color: var(--cr-accent); }
  `;
})();

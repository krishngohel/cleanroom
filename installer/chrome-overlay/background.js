// Cleanroom AI Overlay — background service worker
// Handles: action click → inject overlay, context menu, settings storage.

const DEFAULT_SETTINGS = {
  apiUrl: "http://localhost:8000",
  token: "",
  model: "",
  theme: "dark",
};

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

async function toggleOverlay(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "TOGGLE_OVERLAY" });
  } catch {
    // Content script not injected (e.g., not on a matched origin) — inject on the fly.
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ["overlay.css"],
      });
      await chrome.tabs.sendMessage(tabId, { type: "TOGGLE_OVERLAY" });
    } catch (err) {
      console.warn("Cleanroom: cannot inject on this page", err);
    }
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) await toggleOverlay(tab.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-overlay") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await toggleOverlay(tab.id);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "cleanroom-ask",
    title: "Ask Cleanroom about \"%s\"",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "cleanroom-toggle",
    title: "Toggle Cleanroom panel",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "cleanroom-toggle") {
    await toggleOverlay(tab.id);
    return;
  }
  if (info.menuItemId === "cleanroom-ask" && info.selectionText) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "ASK_WITH_SELECTION",
        selection: info.selectionText,
      });
    } catch {
      await toggleOverlay(tab.id);
      await chrome.tabs.sendMessage(tab.id, {
        type: "ASK_WITH_SELECTION",
        selection: info.selectionText,
      });
    }
  }
});

// Proxy chat requests from the content script. Doing the fetch in the
// service worker means the content script doesn't need the API origin
// in its CSP, and we keep the token in extension storage rather than
// in any per-page localStorage.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "CLEANROOM_CHAT") {
    handleChat(msg.payload, sendResponse);
    return true; // async
  }
  if (msg.type === "GET_SETTINGS") {
    getSettings().then(sendResponse);
    return true;
  }
  if (msg.type === "LIST_MODELS") {
    listModels().then(sendResponse);
    return true;
  }
});

async function handleChat({ messages, model, requestId }, sendResponse) {
  const { apiUrl, token } = await getSettings();
  if (!apiUrl) {
    sendResponse({ error: "Cleanroom API URL not configured. Open extension options." });
    return;
  }
  try {
    const resp = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages, model, stream: true }),
    });
    if (!resp.ok) {
      const body = await resp.text();
      sendResponse({ error: `API error ${resp.status}: ${body.slice(0, 240)}` });
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            // Send streaming chunk back to all tabs interested in this request.
            chrome.runtime
              .sendMessage({ type: "CLEANROOM_CHUNK", requestId, delta })
              .catch(() => {});
          }
        } catch {
          /* incomplete chunk */
        }
      }
    }
    sendResponse({ ok: true });
  } catch (err) {
    sendResponse({ error: err.message || "Network error" });
  }
}

async function listModels() {
  const { apiUrl, token } = await getSettings();
  if (!apiUrl) return { error: "No API URL configured" };
  try {
    const resp = await fetch(`${apiUrl.replace(/\/$/, "")}/v1/models`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const data = await resp.json();
    return { models: (data.data ?? []).map((m) => m.id) };
  } catch (err) {
    return { error: err.message };
  }
}

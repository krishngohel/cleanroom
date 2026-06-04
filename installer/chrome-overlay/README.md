# Cleanroom AI — Chrome Overlay

A Manifest V3 Chrome extension that adds a floating Cleanroom AI panel
to **Excel Online, Word Online, SharePoint, Google Sheets, and Google Docs**.
Everything stays on your network — the extension talks directly to *your*
Cleanroom server.

## Features

- Floating chat panel (draggable, dark/light theme follows tenant default).
- "Grab selection" button pulls the current Excel/Word/Docs selection into
  the prompt (with clipboard fallback for Excel Online's contentless DOM).
- Right-click any selected text on any page → **Ask Cleanroom**.
- `Ctrl+Shift+K` (`⌘⇧K` on Mac) toggles the panel.
- Streaming responses, code-block + markdown rendering.
- Uses extension storage for the API token — never lives in page localStorage.

## Install (developer mode)

1. Build the dashboard so the icons & manifest are present:
   ```
   ls installer/chrome-overlay
   ```
2. Open **chrome://extensions** → enable *Developer mode* → **Load unpacked**
   → select `installer/chrome-overlay/`.
3. Click the extension's puzzle icon → **Options** → set your API URL
   (e.g. `https://cleanroom.acme.internal`) and paste a long-lived token.
4. Click **Test connection** — you should see your available models.

## Usage

- Visit **excel.cloud.microsoft** or **office.com/x/**, open a workbook,
  press `Ctrl+Shift+K`.
- Select cells, then click **Grab selection** in the panel.
  (If Office hasn't exposed the cells to the DOM yet, the extension reads
  your clipboard as a fallback — press Ctrl+C in Excel first.)
- Type "Summarize what's in here" → Send.

## Packaging for distribution

```
zip -r cleanroom-overlay.zip installer/chrome-overlay -x "**/*.DS_Store"
```

Upload `cleanroom-overlay.zip` to the Chrome Web Store under your tenant's
admin Google account.

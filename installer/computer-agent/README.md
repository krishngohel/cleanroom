# Cleanroom Computer Use — local agent

A small WebSocket server that runs on the user's own machine and lets the
Cleanroom Assistant Dock drive the mouse and keyboard.

This is the only piece of Cleanroom that needs to touch your operating system.
The Cleanroom server itself never sees these commands — they fly directly
between your browser and `localhost`. Every action the assistant takes is
still recorded centrally in the audit log via `POST /control/events`.

## Install

```bash
cd installer/computer-agent
python -m venv .venv
. .venv/Scripts/activate    # Windows
# . .venv/bin/activate      # macOS / Linux
pip install -r requirements.txt
```

## Run

```bash
python agent.py --token MY-SHARED-SECRET
```

Output:

```
INFO Cleanroom Computer Use agent listening on ws://127.0.0.1:9777
INFO Screen: 2560x1440
```

The dashboard connects to `ws://127.0.0.1:9777?token=MY-SHARED-SECRET`.
Token comparison is exact-match; mismatches close the socket with code 4401.

## Configure the dashboard

1. Sign in as a tenant admin.
2. **Settings → Compliance → Computer Use**.
3. Tick **Allow Computer Use** and (recommended) **Require explicit user approval for every action**.
4. Set the agent socket URL — the default `ws://127.0.0.1:9777` matches the
   reference agent. The dashboard appends `?token=<auth token>` automatically
   if you use the Cleanroom session token, but the reference agent expects a
   shared secret instead — set `CLEANROOM_AGENT_TOKEN` to the same value the
   user's browser will send (the simplest setup: don't pass `--token`, accept
   anyone on the local machine; only do this when you trust the machine).

## Protocol

The dashboard sends JSON frames like

```json
{ "id": 7, "kind": "click", "x": 540, "y": 320, "button": "left" }
```

Supported `kind` values:

| kind            | payload                                  | description                       |
| --------------- | ---------------------------------------- | --------------------------------- |
| `ping`          | —                                        | returns screen size               |
| `screenshot`    | —                                        | returns base64 PNG of full screen |
| `move`          | `x, y`                                   | move pointer                      |
| `click`         | `x, y, button?`                          | single click                      |
| `double_click`  | `x, y`                                   | double click                      |
| `type`          | `text` (≤ 2000 chars)                    | type text                         |
| `key`           | `key, modifiers?: ["ctrl", "shift", …]`  | hotkey                            |
| `scroll`        | `dx?, dy?`                               | scroll                            |

Replies:

```json
{ "id": 7, "ok": true }
{ "id": 7, "ok": false, "error": "…" }
```

`ping` and `screenshot` additionally return `screen: { width, height }` and,
for screenshot, `image_b64`.

## Safety notes

- **Loopback only.** The default bind is `127.0.0.1`. Don't open this to other
  hosts unless you've front-ended it with mTLS / WireGuard / a reverse proxy.
- **Fail-safe.** pyautogui aborts if you slam the mouse into the top-left
  corner of the screen — useful "escape hatch" if the assistant gets stuck.
- **Token rotation.** Treat `--token` like a password. Rotate it any time you
  suspect it has leaked.
- **Audit log.** Every action the assistant takes is posted to the Cleanroom
  audit log with the user's identity, the action kind, and a human-readable
  summary. Disable Computer Use to revoke the capability instantly.

"""Cleanroom Computer Use — reference local agent.

Runs on the user's machine, exposes a WebSocket the Cleanroom dashboard can
talk to, and drives the mouse + keyboard via pyautogui. Listens only on the
loopback interface by default. Every action is structured JSON; the agent
refuses anything it does not recognize.

This is intentionally simple. In production you'll want to:
  - rotate the session token regularly
  - present a tray icon with a "stop" button
  - lock the WebSocket to a specific origin via the Origin header
  - require a 2nd-factor confirmation for destructive keystrokes (e.g. Ctrl+W)

Install:
    pip install -r requirements.txt

Run:
    python agent.py --token MYTOKEN
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import logging
import os
import sys
from typing import Any
from urllib.parse import parse_qs, urlparse

try:
    import pyautogui  # type: ignore
except ImportError:
    sys.stderr.write(
        "pyautogui is required: pip install pyautogui pillow websockets\n"
    )
    sys.exit(1)

import websockets
from websockets.server import WebSocketServerProtocol

log = logging.getLogger("cleanroom-agent")

# pyautogui safety: moving the mouse to the top-left corner aborts the script.
pyautogui.FAILSAFE = True
# Small built-in pause keeps actions visible to the user.
pyautogui.PAUSE = 0.08


def _reply(req_id: int, ok: bool, **extra: Any) -> str:
    return json.dumps({"id": req_id, "ok": ok, **extra})


def _screenshot_b64() -> str:
    img = pyautogui.screenshot()
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _screen_size() -> dict[str, int]:
    w, h = pyautogui.size()
    return {"width": int(w), "height": int(h)}


async def handle_message(req_id: int, kind: str, msg: dict[str, Any]) -> str:
    """Apply a single structured command and return the reply frame."""
    try:
        if kind == "ping":
            return _reply(req_id, True, screen=_screen_size())

        if kind == "screenshot":
            return _reply(req_id, True, image_b64=_screenshot_b64(), screen=_screen_size())

        if kind == "move":
            pyautogui.moveTo(int(msg["x"]), int(msg["y"]), duration=0.15)
            return _reply(req_id, True)

        if kind == "click":
            button = msg.get("button", "left")
            pyautogui.click(int(msg["x"]), int(msg["y"]), button=button)
            return _reply(req_id, True)

        if kind == "double_click":
            pyautogui.doubleClick(int(msg["x"]), int(msg["y"]))
            return _reply(req_id, True)

        if kind == "type":
            text = str(msg.get("text", ""))
            if len(text) > 2000:
                return _reply(req_id, False, error="text too long")
            pyautogui.typewrite(text, interval=0.01)
            return _reply(req_id, True)

        if kind == "key":
            key = str(msg["key"])
            modifiers = list(msg.get("modifiers") or [])
            keys = [*modifiers, key]
            pyautogui.hotkey(*keys)
            return _reply(req_id, True)

        if kind == "scroll":
            dx = int(msg.get("dx", 0))
            dy = int(msg.get("dy", 0))
            if dy:
                pyautogui.scroll(dy)
            if dx:
                pyautogui.hscroll(dx)
            return _reply(req_id, True)

        return _reply(req_id, False, error=f"unknown action: {kind}")
    except Exception as e:  # noqa: BLE001
        log.exception("action %s failed", kind)
        return _reply(req_id, False, error=str(e))


async def connection(ws: WebSocketServerProtocol, expected_token: str | None) -> None:
    peer = ws.remote_address
    log.info("connection from %s", peer)
    try:
        query = parse_qs(urlparse(ws.path).query)
        token = (query.get("token") or [""])[0]
        if expected_token and token != expected_token:
            await ws.close(code=4401, reason="invalid token")
            log.warning("rejected %s: token mismatch", peer)
            return

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                continue
            req_id = int(msg.get("id", 0))
            kind = str(msg.get("kind", ""))
            reply = await handle_message(req_id, kind, msg)
            await ws.send(reply)
    finally:
        log.info("disconnected %s", peer)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Cleanroom Computer Use agent")
    parser.add_argument("--host", default="127.0.0.1", help="bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=9777, help="bind port (default: 9777)")
    parser.add_argument(
        "--token",
        default=os.environ.get("CLEANROOM_AGENT_TOKEN"),
        help="session token clients must provide via ?token=… (recommended)",
    )
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        log.warning(
            "binding to %s — for safety, prefer 127.0.0.1 so only this machine can connect",
            args.host,
        )

    if not args.token:
        log.warning(
            "no --token provided. ANYONE on this machine can drive your mouse/keyboard. "
            "Set --token or the CLEANROOM_AGENT_TOKEN env var for any non-trivial use."
        )

    log.info("Cleanroom Computer Use agent listening on ws://%s:%d", args.host, args.port)
    log.info("Screen: %dx%d", *pyautogui.size())

    async def handler(ws: WebSocketServerProtocol) -> None:
        await connection(ws, args.token)

    async with websockets.serve(handler, args.host, args.port):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nshutting down")

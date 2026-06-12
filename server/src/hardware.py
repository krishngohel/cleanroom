"""Hardware detection and automatic model configuration.

On startup Cleanroom probes the host it is running on — GPUs (via nvidia-smi),
total RAM, and CPU cores — and automatically selects the best model the
hardware can serve well. Admins can override the choice at any time; the
override is persisted in the database and survives restarts.

Everything here is stdlib-only and best-effort: a failed probe never blocks
startup, it just degrades the recommendation (worst case: CPU-only profile
with the smallest model).
"""
from __future__ import annotations

import asyncio
import ctypes
import os
import platform
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog

from .config import settings

log = structlog.get_logger()

SYSTEM_SETTING_MODEL_OVERRIDE = "model_override"


# ── Model catalog ─────────────────────────────────────────────────────────────
# Ordered best-first. min_vram_gb is what the model needs to run fully on GPU;
# min_ram_gb is the CPU-only fallback requirement.

@dataclass(frozen=True)
class CatalogModel:
    id: str
    label: str
    size_gb: float
    min_vram_gb: float
    min_ram_gb: float
    quality: int  # relative quality rank, higher is better
    supports_tools: bool
    cpu_ok: bool  # acceptable to run on CPU at all
    best_for: str


MODEL_CATALOG: list[CatalogModel] = [
    CatalogModel(
        id="llama3.1:70b",
        label="Llama 3.1 70B",
        size_gb=40,
        min_vram_gb=48,
        min_ram_gb=80,
        quality=100,
        supports_tools=True,
        cpu_ok=False,
        best_for="Flagship — complex analysis, agentic work",
    ),
    CatalogModel(
        id="llama3.1:8b",
        label="Llama 3.1 8B",
        size_gb=5,
        min_vram_gb=8,
        min_ram_gb=12,
        quality=70,
        supports_tools=True,
        cpu_ok=True,
        best_for="Default — general use, fast",
    ),
    CatalogModel(
        id="mistral:7b",
        label="Mistral 7B",
        size_gb=4.5,
        min_vram_gb=8,
        min_ram_gb=10,
        quality=65,
        supports_tools=True,
        cpu_ok=True,
        best_for="Document-heavy workloads",
    ),
    CatalogModel(
        id="llama3.2:3b",
        label="Llama 3.2 3B",
        size_gb=2.0,
        min_vram_gb=4,
        min_ram_gb=6,
        quality=50,
        supports_tools=True,
        cpu_ok=True,
        best_for="Small GPUs and modest CPU-only servers",
    ),
    CatalogModel(
        id="llama3.2:1b",
        label="Llama 3.2 1B",
        size_gb=1.3,
        min_vram_gb=2,
        min_ram_gb=4,
        quality=35,
        supports_tools=True,
        cpu_ok=True,
        best_for="Minimal hardware — evaluation only",
    ),
]


# ── Hardware probing ──────────────────────────────────────────────────────────

@dataclass
class GPUInfo:
    name: str
    vram_gb: float


@dataclass
class HardwareProfile:
    gpus: list[GPUInfo] = field(default_factory=list)
    total_vram_gb: float = 0.0
    ram_gb: float = 0.0
    cpu_cores: int = 0
    cpu_model: str = ""
    os_name: str = ""
    apple_silicon: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "gpus": [{"name": g.name, "vram_gb": round(g.vram_gb, 1)} for g in self.gpus],
            "total_vram_gb": round(self.total_vram_gb, 1),
            "ram_gb": round(self.ram_gb, 1),
            "cpu_cores": self.cpu_cores,
            "cpu_model": self.cpu_model,
            "os": self.os_name,
            "apple_silicon": self.apple_silicon,
        }


def _detect_nvidia_gpus() -> list[GPUInfo]:
    if shutil.which("nvidia-smi") is None:
        return []
    try:
        out = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if out.returncode != 0:
            return []
        gpus = []
        for line in out.stdout.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 2:
                try:
                    gpus.append(GPUInfo(name=parts[0], vram_gb=float(parts[1]) / 1024.0))
                except ValueError:
                    continue
        return gpus
    except (subprocess.TimeoutExpired, OSError):
        return []


def _detect_rocm_gpus() -> list[GPUInfo]:
    if shutil.which("rocm-smi") is None:
        return []
    try:
        out = subprocess.run(
            ["rocm-smi", "--showmeminfo", "vram", "--csv"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if out.returncode != 0:
            return []
        gpus = []
        for line in out.stdout.strip().splitlines()[1:]:
            m = re.search(r"(\d+)", line.split(",")[-1])
            if m:
                gpus.append(GPUInfo(name="AMD GPU", vram_gb=int(m.group(1)) / (1024**3)))
        return gpus
    except (subprocess.TimeoutExpired, OSError):
        return []


def _detect_ram_gb() -> float:
    system = platform.system()
    try:
        if system == "Linux":
            with open("/proc/meminfo") as f:
                for line in f:
                    if line.startswith("MemTotal:"):
                        return int(line.split()[1]) / (1024**2)
        elif system == "Darwin":
            out = subprocess.run(
                ["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, timeout=5
            )
            return int(out.stdout.strip()) / (1024**3)
        elif system == "Windows":
            class MEMORYSTATUSEX(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong),
                    ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong),
                    ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]

            stat = MEMORYSTATUSEX()
            stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))  # type: ignore[attr-defined]
            return stat.ullTotalPhys / (1024**3)
    except (OSError, ValueError, AttributeError):
        pass
    return 0.0


def _detect_cpu_model() -> str:
    system = platform.system()
    try:
        if system == "Linux":
            with open("/proc/cpuinfo") as f:
                for line in f:
                    if line.lower().startswith("model name"):
                        return line.split(":", 1)[1].strip()
        elif system == "Darwin":
            out = subprocess.run(
                ["sysctl", "-n", "machdep.cpu.brand_string"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            return out.stdout.strip()
    except OSError:
        pass
    return platform.processor() or platform.machine()


def detect_hardware() -> HardwareProfile:
    """Probe the host. Never raises — failures degrade gracefully."""
    gpus = _detect_nvidia_gpus() or _detect_rocm_gpus()
    ram_gb = _detect_ram_gb()
    apple = platform.system() == "Darwin" and platform.machine() == "arm64"
    if apple and not gpus and ram_gb:
        # Apple Silicon unified memory: Metal can address ~75% of RAM.
        gpus = [GPUInfo(name=f"Apple Silicon ({_detect_cpu_model()})", vram_gb=ram_gb * 0.75)]

    profile = HardwareProfile(
        gpus=gpus,
        total_vram_gb=sum(g.vram_gb for g in gpus),
        ram_gb=ram_gb,
        cpu_cores=os.cpu_count() or 1,
        cpu_model=_detect_cpu_model(),
        os_name=f"{platform.system()} {platform.release()}",
        apple_silicon=apple,
    )
    log.info("hardware_detected", **profile.to_dict())
    return profile


# ── Recommendation ────────────────────────────────────────────────────────────

@dataclass
class Recommendation:
    model: CatalogModel
    mode: str  # "gpu" | "cpu"
    reason: str
    options: dict[str, Any]  # tuned ollama options for warm-up

    def to_dict(self) -> dict[str, Any]:
        return {
            "model": self.model.id,
            "label": self.model.label,
            "mode": self.mode,
            "reason": self.reason,
            "options": self.options,
            "best_for": self.model.best_for,
        }


def recommend_model(hw: HardwareProfile) -> Recommendation:
    """Pick the best catalog model the detected hardware can serve well."""
    vram = hw.total_vram_gb
    ram = hw.ram_gb

    # GPU path: best model whose VRAM requirement fits.
    if vram > 0:
        for m in MODEL_CATALOG:
            if vram >= m.min_vram_gb:
                headroom = vram - m.size_gb
                options = {
                    # Larger context when there is VRAM to spare.
                    "num_ctx": 16384 if headroom >= m.size_gb else 8192,
                    # Offload every layer to GPU.
                    "num_gpu": -1,
                }
                keep_alive = "-1" if headroom >= 4 else "10m"
                gpu_names = ", ".join(g.name for g in hw.gpus)
                return Recommendation(
                    model=m,
                    mode="gpu",
                    reason=(
                        f"{gpu_names} with {vram:.0f} GB VRAM detected — "
                        f"{m.label} fits fully on GPU"
                    ),
                    options={**options, "keep_alive": keep_alive},
                )

    # CPU path: best cpu_ok model that fits in RAM, threads tuned to cores.
    for m in MODEL_CATALOG:
        if m.cpu_ok and ram >= m.min_ram_gb:
            return Recommendation(
                model=m,
                mode="cpu",
                reason=(
                    f"No usable GPU detected; {ram:.0f} GB RAM and {hw.cpu_cores} cores — "
                    f"{m.label} on CPU"
                ),
                options={
                    "num_ctx": 4096,
                    "num_thread": max(1, hw.cpu_cores - 1),
                    "keep_alive": "10m",
                },
            )

    # Unknown / tiny host: smallest model, hope for the best.
    smallest = MODEL_CATALOG[-1]
    return Recommendation(
        model=smallest,
        mode="cpu",
        reason="Hardware probe inconclusive — defaulting to the smallest model",
        options={"num_ctx": 2048, "keep_alive": "5m"},
    )


# ── Manager (singleton on app.state) ──────────────────────────────────────────

class ModelManager:
    """Holds the detected profile, the recommendation, and the admin override.

    Resolution order for the active model:
      1. admin override (persisted in system_settings)
      2. hardware recommendation
      3. settings.default_model
    """

    def __init__(self) -> None:
        self.profile: HardwareProfile | None = None
        self.recommendation: Recommendation | None = None
        self.override: str | None = None  # None = automatic
        self.pull_status: dict[str, Any] = {"state": "idle"}
        self._warmed = False

    # -- lifecycle --------------------------------------------------------

    def detect(self) -> None:
        self.profile = detect_hardware()
        self.recommendation = recommend_model(self.profile)
        log.info(
            "model_auto_configured",
            model=self.recommendation.model.id,
            mode=self.recommendation.mode,
            reason=self.recommendation.reason,
        )

    async def load_override(self, db) -> None:
        from .database import SystemSetting  # local import to avoid cycle

        from sqlalchemy import select

        row = (
            await db.execute(
                select(SystemSetting).where(SystemSetting.key == SYSTEM_SETTING_MODEL_OVERRIDE)
            )
        ).scalar_one_or_none()
        self.override = row.value if row and row.value else None

    async def set_override(self, db, model_id: str | None) -> None:
        """Persist an admin override. None / 'auto' returns to automatic mode."""
        from sqlalchemy import select

        from .database import SystemSetting

        if model_id in (None, "", "auto"):
            model_id = None
        row = (
            await db.execute(
                select(SystemSetting).where(SystemSetting.key == SYSTEM_SETTING_MODEL_OVERRIDE)
            )
        ).scalar_one_or_none()
        if row is None:
            row = SystemSetting(key=SYSTEM_SETTING_MODEL_OVERRIDE, value=model_id or "")
            db.add(row)
        else:
            row.value = model_id or ""
        await db.commit()
        self.override = model_id

    # -- resolution --------------------------------------------------------

    @property
    def active_model(self) -> str:
        if self.override:
            return self.override
        if self.recommendation:
            return self.recommendation.model.id
        return settings.default_model

    @property
    def active_options(self) -> dict[str, Any]:
        if self.recommendation and not self.override:
            return dict(self.recommendation.options)
        return {}

    def status(self) -> dict[str, Any]:
        return {
            "hardware": self.profile.to_dict() if self.profile else None,
            "recommendation": self.recommendation.to_dict() if self.recommendation else None,
            "override": self.override,
            "active_model": self.active_model,
            "pull": self.pull_status,
            "catalog": [
                {
                    "id": m.id,
                    "label": m.label,
                    "size_gb": m.size_gb,
                    "min_vram_gb": m.min_vram_gb,
                    "quality": m.quality,
                    "best_for": m.best_for,
                }
                for m in MODEL_CATALOG
            ],
        }

    # -- ollama interaction (best-effort) -----------------------------------

    async def installed_models(self) -> list[str]:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"{settings.ollama_base_url}/api/tags")
                resp.raise_for_status()
            return [m["name"] for m in resp.json().get("models", [])]
        except (httpx.HTTPError, KeyError, ValueError):
            return []

    async def warm_up(self) -> None:
        """Load the active model into memory with tuned options. Best-effort."""
        if self._warmed:
            return
        model = self.active_model
        opts = self.active_options
        keep_alive = opts.pop("keep_alive", "10m")
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                await client.post(
                    f"{settings.ollama_base_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": "",
                        "keep_alive": keep_alive,
                        "options": opts,
                    },
                )
            self._warmed = True
            log.info("model_warmed", model=model, keep_alive=keep_alive, options=opts)
        except httpx.HTTPError as e:
            log.warning("model_warmup_failed", model=model, error=str(e))

    async def pull_model(self, model_id: str) -> None:
        """Background pull with progress tracked in self.pull_status."""
        self.pull_status = {"state": "pulling", "model": model_id, "percent": 0}
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream(
                    "POST",
                    f"{settings.ollama_base_url}/api/pull",
                    json={"name": model_id},
                ) as resp:
                    import json as _json

                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            data = _json.loads(line)
                        except ValueError:
                            continue
                        total = data.get("total") or 0
                        completed = data.get("completed") or 0
                        if total:
                            self.pull_status = {
                                "state": "pulling",
                                "model": model_id,
                                "percent": round(completed / total * 100, 1),
                                "status": data.get("status", ""),
                            }
            self.pull_status = {"state": "done", "model": model_id, "percent": 100}
            self._warmed = False
            await self.warm_up()
        except httpx.HTTPError as e:
            self.pull_status = {"state": "error", "model": model_id, "error": str(e)}

    async def auto_configure(self) -> None:
        """Full startup sequence: detect, pick, ensure available, warm up."""
        self.detect()
        assert self.recommendation is not None
        installed = await self.installed_models()
        target = self.active_model
        base_target = target.split(":")[0]
        have = any(m == target or m.split(":")[0] == base_target for m in installed)
        if installed and not have and not self.override:
            # Recommended model not present — fall back to the best installed
            # catalog model rather than blocking startup on a multi-GB pull.
            for m in MODEL_CATALOG:
                if m.id in installed:
                    log.info("auto_configure_fallback", wanted=target, using=m.id)
                    self.recommendation = Recommendation(
                        model=m,
                        mode=self.recommendation.mode,
                        reason=self.recommendation.reason
                        + f" (recommended {target} not installed yet — using {m.id}; "
                        "pull the recommended model from Admin → Hardware)",
                        options=self.recommendation.options,
                    )
                    break
        asyncio.get_event_loop().create_task(self.warm_up())


model_manager = ModelManager()


def get_model_manager() -> ModelManager:
    return model_manager

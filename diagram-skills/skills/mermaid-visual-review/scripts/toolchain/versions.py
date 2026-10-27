"""Shared toolchain accessors: pinned versions and the mmdc launch path.

Single source of truth for both render toolchains. Imported by the pin tests,
by compat_check.py, and by the eval assertions, so none of them can disagree
about what is pinned or how to launch it.
"""

from __future__ import annotations

import os
from pathlib import Path

VERSIONS_FILE = Path(__file__).resolve().parent / "VERSIONS"
TOOLCHAIN_DIR = Path(__file__).resolve().parent


def read_versions() -> dict[str, str]:
    """Parse VERSIONS into a dict. Blank lines and `#` comments are ignored."""
    out: dict[str, str] = {}
    for line in VERSIONS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        out[key.strip()] = value.strip()
    return out


TOOLCHAINS = ("target", "baseline")


def resolve_mmdc(which: str = "target") -> Path:
    """Return a launchable mmdc path for the `target` or `baseline` toolchain.

    npm installs TWO entry points: an extensionless POSIX shim carrying a
    shebang, and a `.cmd` wrapper. bash can launch either — which is why
    render.sh never hit this — but Python's subprocess goes through
    CreateProcess on Windows, which does not parse shebangs and fails with
    WinError 2 on the shim. So the `.cmd` must be preferred on Windows.

    Checking `.exists()` on the bare path and falling back is NOT sufficient:
    the shim always exists, so the fallback never fires.
    """
    if which not in TOOLCHAINS:
        raise ValueError(f"unknown toolchain {which!r}; expected one of {TOOLCHAINS}")
    base = TOOLCHAIN_DIR / which / "node_modules" / ".bin" / "mmdc"
    if os.name == "nt":
        windows = base.with_suffix(".cmd")
        if windows.exists():
            return windows
        if base.exists():
            raise RuntimeError(
                f"{which} toolchain has the POSIX shim but no mmdc.cmd — Python cannot "
                f"launch it on Windows. Reinstall with: bash {TOOLCHAIN_DIR / 'install.sh'}"
            )
    return base


def resolve_bash() -> str:
    """Return the bash that can run render.sh: Git Bash on Windows, never WSL.

    A bare "bash" handed to subprocess on Windows can resolve to
    C:\\Windows\\System32\\bash.exe -- the WSL launcher -- because CreateProcess's
    search order is not PATH order, even when `shutil.which("bash")` reports Git
    Bash. WSL then reads the Windows-style paths it is given as missing and exits
    127 naming a file that plainly exists. Same rule as `_bash()` in
    scripts/tests/test_render_outputs.py; System32 is rejected outright rather than
    used as a fallback, because it fails in a way that looks like a missing file.
    """
    import shutil

    if os.name != "nt":
        return shutil.which("bash") or "bash"
    for c in (r"C:\Program Files\Git\bin\bash.exe",
              r"C:\Program Files\Git\usr\bin\bash.exe",
              shutil.which("bash")):
        if c and os.path.exists(c) and "system32" not in c.lower():
            return c
    raise RuntimeError("Git Bash not found; render.sh needs it on Windows "
                       "(WSL bash cannot resolve Windows-style paths)")


def mmdc_missing_hint() -> str:
    return (
        "Pinned toolchain not installed. "
        f"Run: bash {TOOLCHAIN_DIR / 'install.sh'}"
    )

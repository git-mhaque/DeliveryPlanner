"""Atomic output and confined workspace plan paths."""
from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path


def plan_directory(workspace: Path, plan_id: str) -> Path:
    if not re.fullmatch(r"[a-z][a-z0-9-]{0,99}", plan_id):
        raise ValueError("Use an exact plan ID: lowercase letters, digits, and hyphens, starting with a letter.")
    root = workspace.resolve()
    plans = root / "Plans"
    if plans.is_symlink():
        raise ValueError("Plans must be a directory inside the workspace, not a symlink.")
    target = plans / plan_id
    if target.is_symlink():
        raise ValueError("Plan directories must not be symlinks.")
    if target.exists() and not target.is_dir():
        raise ValueError("The plan path is not a directory.")
    return target


def atomic_write(path: Path, content: bytes):
    if path.is_symlink():
        raise ValueError(f"Refusing to replace a symlink: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".delivery-", suffix=".tmp", dir=path.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, 0o644)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def publish_html(destination: Path, plan_id: str, content: bytes) -> Path:
    output_dir = destination / plan_id
    if output_dir.is_symlink():
        raise ValueError("The publication plan directory must not be a symlink.")
    output = output_dir / "delivery_plan.html"
    atomic_write(output, content)
    return output.resolve()

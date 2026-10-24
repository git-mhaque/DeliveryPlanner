"""Portable, deterministic HTML rendering; no network or wall-clock inputs."""
from __future__ import annotations

import hashlib
import json

from jinja2 import Environment, FileSystemLoader, StrictUndefined

from . import VERSION
from .validation import SKILL_ROOT, ValidationResult


def render_plan(result: ValidationResult) -> tuple[bytes, str]:
    if not result.valid:
        raise ValueError("Cannot render a plan with validation errors.")
    templates = SKILL_ROOT / "assets/templates"
    env = Environment(loader=FileSystemLoader(str(templates)), autoescape=True,
                      undefined=StrictUndefined, keep_trailing_newline=True)
    fingerprint = hashlib.sha256(result.source).hexdigest()
    payload = {
        "data": result.data,
        "diagnostics": [item.to_dict() for item in result.diagnostics],
        "version": VERSION,
        "fingerprint": fingerprint,
    }
    # Escape HTML delimiters before placing data in a script element. json.dumps
    # alone would permit an authored </script> to terminate that element.
    serialized = json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    serialized = serialized.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
    html = env.get_template("plan.html.j2").render(
        plan=result.data["plan"], data=result.data, version=VERSION,
        fingerprint=fingerprint, payload=serialized,
        css=(templates / "plan.css").read_text(encoding="utf-8"),
        js=(templates / "graph-layout.js").read_text(encoding="utf-8") + "\n" +
           (templates / "plan.js").read_text(encoding="utf-8"),
    )
    return html.encode("utf-8"), fingerprint

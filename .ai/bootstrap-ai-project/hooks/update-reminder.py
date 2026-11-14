#!/usr/bin/env python3
# bootstrap-ai-project:hook:update-reminder sha256=e7ba769f16c3243376e04691c255f767142cc15dc5fbff5b3e3595d56d090937
"""SessionStart hook：受管檔落後、手改或還是舊版時，提醒使用者執行更新模式。

只給使用者看：輸出 JSON 的 systemMessage。Claude 把它當成顯示給使用者的警告，Codex 把它
顯示在 UI 或事件串流；純文字 stdout 與 additionalContext 則會進 agent 的 context，agent
可能未經要求就動手更新，所以兩者都不用。

同一組狀態只提醒一次，狀態變了才再提醒。下游專案只知道當初寫入的是什麼，不知道現在的
canonical 版本，所以要呼叫使用者層安裝的 bootstrap；找不到、執行失敗或逾時都靜默放行——
這支 hook 只是提醒，不能擋住 session。標準函式庫，無第三方相依。
"""

from __future__ import annotations

import hashlib
import json
import os
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="UTF-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="UTF-8")

STATE_DIR = Path(tempfile.gettempdir()) / "bootstrap-ai-project-update-reminder"
HOOK_PATH = Path(".ai") / "bootstrap-ai-project" / "hooks" / "update-reminder.py"
STATUS_TIMEOUT = 20
ATTENTION = ("behind", "hand-edited", "legacy")
LABELS = {"behind": "落後", "hand-edited": "手改過", "legacy": "舊版"}


def read_stdin_text() -> str:
    """宿主送來的是 UTF-8 JSON；直接解 bytes，不受 locale 或 UTF-8 mode 影響。"""
    stream = getattr(sys.stdin, "buffer", None)
    if stream is None:
        return sys.stdin.read()
    return stream.read().decode("UTF-8", errors="replace")


def load_event() -> dict:
    try:
        event = json.loads(read_stdin_text() or "{}")
    except (OSError, ValueError):
        return {}
    return event if isinstance(event, dict) else {}


def resolve_project_dir(event: dict) -> Path:
    """Claude 提供 CLAUDE_PROJECT_DIR；Codex 只給 session 的 cwd，從那裡往上找到 git root 為止。"""
    explicit = os.environ.get("CLAUDE_PROJECT_DIR")
    if explicit:
        return Path(explicit).resolve(strict=False)
    start = Path(str(event.get("cwd") or Path.cwd())).resolve(strict=False)
    for candidate in (start, *start.parents):
        if (candidate / HOOK_PATH).is_file():
            return candidate
        if (candidate / ".git").exists():
            break
    return start


def find_cli() -> Path | None:
    """使用者層安裝位置：Claude 是 ~/.claude/skills，Codex 是 ~/.agents/skills。"""
    for host_dir in (".claude", ".agents"):
        candidate = Path.home() / host_dir / "skills" / "bootstrap-ai-project" / "scripts" / "bootstrap.py"
        if candidate.is_file():
            return candidate
    return None


def run_status(cli: Path, project: Path) -> dict | None:
    try:
        completed = subprocess.run(
            [sys.executable, "-I", str(cli), "status"],
            input=json.dumps({"target": str(project)}, ensure_ascii=False).encode("UTF-8"),
            capture_output=True,
            timeout=STATUS_TIMEOUT,
            check=False,
        )
        report = json.loads(completed.stdout.decode("UTF-8"))
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    return report if isinstance(report, dict) and report.get("ok") is True else None


def state_dir() -> Path | None:
    """系統暫存目錄在 POSIX 上是多人共用的 /tmp：別人可以先建好同名目錄、在裡面放符號連結。

    只用自己擁有、別人寫不進去、而且不是連結的目錄；不符合就不存狀態（照樣提醒，只是不去重）。
    """
    try:
        STATE_DIR.mkdir(mode=0o700, exist_ok=True)
        info = os.lstat(STATE_DIR)
    except OSError:
        return None
    if not stat.S_ISDIR(info.st_mode):
        return None
    if hasattr(os, "getuid") and (info.st_uid != os.getuid() or info.st_mode & 0o022):
        return None
    return STATE_DIR


def state_name(project: Path) -> str:
    return hashlib.sha256(str(project).encode("UTF-8")).hexdigest()[:16] + ".txt"


def read_state(path: Path) -> str | None:
    try:
        if stat.S_ISLNK(os.lstat(path).st_mode):
            return None
        return path.read_text(encoding="UTF-8").strip()
    except OSError:
        return None


def write_state(directory: Path, path: Path, value: str) -> None:
    """先寫到同目錄的新檔再 os.replace：replace 取代的是目錄項目本身，不會跟著連結寫到別處。"""
    try:
        handle, temporary = tempfile.mkstemp(dir=directory, prefix=".reminder-")
    except OSError:
        return
    try:
        with os.fdopen(handle, "w", encoding="UTF-8") as stream:
            stream.write(value)
        os.replace(temporary, path)
    except OSError:
        try:
            os.unlink(temporary)
        except OSError:
            pass


def fingerprint(attention: list[dict], notes: list) -> str:
    rows = [[item.get("path"), item.get("state"), item.get("recorded_sha256"), item.get("canonical_sha256")] for item in attention]
    payload = json.dumps([sorted(rows, key=str), notes], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(payload.encode("UTF-8")).hexdigest()


def message(attention: list[dict], notes: list) -> str:
    counts = {state: sum(1 for item in attention if item.get("state") == state) for state in ATTENTION}
    parts = [f"{counts[state]} 個{LABELS[state]}" for state in ATTENTION if counts[state]]
    if notes:
        parts.append(f"{len(notes)} 處設定與專案不符（例如 Rule 的 paths）")
    return (
        "bootstrap 受管檔有 " + "、".join(parts) + "。"
        "要更新請執行 /bootstrap-ai-project（Codex 為 $bootstrap-ai-project）並選「更新既有安裝」；"
        "手改過的檔案會先列出差異讓你確認。"
    )


def main() -> int:
    project = resolve_project_dir(load_event())
    cli = find_cli()
    report = run_status(cli, project) if cli is not None else None
    if report is None:
        return 0
    files = report.get("files") if isinstance(report.get("files"), list) else []
    notes = report.get("notes") if isinstance(report.get("notes"), list) else []
    attention = [item for item in files if isinstance(item, dict) and item.get("state") in ATTENTION]
    directory = state_dir()
    path = directory / state_name(project) if directory is not None else None
    if not attention and not notes:
        if path is not None:
            try:
                path.unlink()  # 連結被移除的是連結本身，不是它指向的檔案。
            except OSError:
                pass
        return 0
    current = fingerprint(attention, notes)
    if path is not None:
        if read_state(path) == current:
            return 0
        write_state(directory, path, current)
    sys.stdout.write(json.dumps({"systemMessage": message(attention, notes)}, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

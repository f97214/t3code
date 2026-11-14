#!/usr/bin/env python3
# bootstrap-ai-project:hook:verify-gate sha256=095a71cfd7ecbc4ca3d06610a518b3d7b6ff5ca764cbe707193333f73cf4bd05
"""Session lifecycle hook：追蹤本次工作變更，收工前驗證，結束時清理。

設定檔 .ai/bootstrap-ai-project/verify-gate.json。命令以陣列形式執行，不經 shell、不用 eval。
判定依退出碼，不猜輸出樣式。標準函式庫，無第三方相依。

本檔自含所有邏輯——hook 會被部署到別的專案，少一個相依就少一個失效點。
"""

from __future__ import annotations

import hashlib
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="UTF-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="UTF-8")

EXIT_OK = 0
EXIT_BLOCK = 2

DEFAULT_MAX_BLOCKS = 3
DEFAULT_TIMEOUT = 300
# verify-gate.json 的 total_timeout 是整個 Stop 的總時間預算，從 main() 開始計，
# git 與所有 check 都算在內。它必須比宿主給 Stop hook 的 timeout 至少短 30 秒，
# 留給直譯器啟動與結束行程樹：被宿主中止時 hook 來不及擋下也來不及告知，閘門會
# 無聲失效。沒設定時不啟用預算——既有專案的 verify-gate.json 是 create-only，
# 套用預設值會讓原本在宿主上限內通過的 Stop 改成被擋。
KILL_WAIT = 5
OUTPUT_LINES = 20
STATE_DIR = Path(tempfile.gettempdir()) / "bootstrap-ai-project-verify-gate"
HOOK_PATH = Path(".ai") / "bootstrap-ai-project" / "hooks" / "verify-gate.py"


def safe_session_id(session_id: str) -> str:
    return "".join(char for char in session_id if char.isalnum() or char in "-_") or "unknown"


def read_stdin_text() -> str:
    """宿主送來的是 UTF-8 JSON；直接解 bytes，不受 locale 或 UTF-8 mode 影響。

    繁中 Windows 的 sys.stdin 預設是 cp950，照常讀會把中文解成亂碼。
    """
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
    """Claude 提供 CLAUDE_PROJECT_DIR；Codex 沒有對應變數，只給 session 的 cwd。

    Codex 可能從子目錄啟動，所以從 cwd 往上找本 hook 所在的專案，到 git root
    為止——越過 git root 就可能綁到上層別的專案的設定。找不到時沿用 cwd。
    """
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


def state_file(session_id: str) -> Path:
    return STATE_DIR / f"{safe_session_id(session_id)}.count"


def checkpoint_file(session_id: str, project_dir: Path) -> Path:
    project_key = hashlib.sha256(str(project_dir.resolve(strict=False)).encode("UTF-8")).hexdigest()[:16]
    return STATE_DIR / f"{safe_session_id(session_id)}-{project_key}.json"


def read_block_count(session_id: str) -> int:
    path = state_file(session_id)
    try:
        return int(path.read_text(encoding="UTF-8").strip())
    except (OSError, ValueError):
        return 0


def write_block_count(session_id: str, value: int) -> None:
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        state_file(session_id).write_text(str(value), encoding="UTF-8")
    except OSError:
        pass  # 計數失效時寧可放行，不要讓 hook 自己變成故障點


def clear_block_count(session_id: str) -> None:
    try:
        state_file(session_id).unlink()
    except OSError:
        pass


def read_checkpoint(session_id: str, project_dir: Path) -> dict | None:
    try:
        value = json.loads(
            checkpoint_file(session_id, project_dir).read_text(encoding="UTF-8")
        )
    except (OSError, json.JSONDecodeError):
        return None
    expected_root = str(project_dir.resolve(strict=False))
    if (
        not isinstance(value, dict)
        or value.get("schema_version") != 1
        or value.get("project_dir") != expected_root
        or not isinstance(value.get("fingerprint"), str)
        or not isinstance(value.get("paths"), list)
        or not all(isinstance(path, str) for path in value["paths"])
        or (value.get("head") is not None and not isinstance(value.get("head"), str))
    ):
        return None
    return value


def write_checkpoint(session_id: str, project_dir: Path, state: dict) -> None:
    path = checkpoint_file(session_id, project_dir)
    temporary = path.with_suffix(f".{os.getpid()}.tmp")
    value = {
        "schema_version": 1,
        "project_dir": str(project_dir.resolve(strict=False)),
        "head": state["head"],
        "fingerprint": state["fingerprint"],
        "paths": state["paths"],
    }
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        temporary.write_text(
            json.dumps(value, ensure_ascii=False, sort_keys=True),
            encoding="UTF-8",
        )
        os.replace(temporary, path)
    except OSError:
        try:
            temporary.unlink()
        except OSError:
            pass


def clear_checkpoint(session_id: str, project_dir: Path) -> None:
    try:
        checkpoint_file(session_id, project_dir).unlink()
    except OSError:
        pass


def load_config(project_dir: Path) -> dict | None:
    path = project_dir / ".ai" / "bootstrap-ai-project" / "verify-gate.json"
    if not path.is_file():
        return None
    try:
        config = json.loads(path.read_text(encoding="UTF-8"))
    except (json.JSONDecodeError, OSError):
        return None
    return config if isinstance(config, dict) else None


def git_bytes(project_dir: Path, *arguments: str) -> bytes | None:
    try:
        result = subprocess.run(
            ["git", *arguments],
            cwd=str(project_dir),
            capture_output=True,
            timeout=20,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return result.stdout


def nul_paths(raw: bytes) -> list[str]:
    return [
        value.replace("\\", "/")
        for value in raw.decode("UTF-8", errors="replace").split("\0")
        if value
    ]


def workspace_state(project_dir: Path) -> dict | None:
    """取得 HEAD、工作區 fingerprint 與未提交路徑；非 Git repo 時回傳 None。"""
    status = git_bytes(
        project_dir,
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
    )
    if status is None:
        return None

    head_raw = git_bytes(project_dir, "rev-parse", "--verify", "HEAD")
    head = (
        head_raw.decode("ASCII", errors="replace").strip()
        if head_raw is not None
        else None
    )
    unstaged = git_bytes(
        project_dir, "diff", "--name-only", "--no-renames", "-z", "--"
    )
    staged = git_bytes(
        project_dir,
        "diff",
        "--cached",
        "--name-only",
        "--no-renames",
        "-z",
        "--",
    )
    untracked = git_bytes(
        project_dir,
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
    )
    if unstaged is None or staged is None or untracked is None:
        return None

    diff_arguments = (
        ("diff", "--binary", "HEAD", "--")
        if head
        else ("diff", "--binary", "--cached", "--")
    )
    tracked_diff = git_bytes(project_dir, *diff_arguments)
    working_diff = git_bytes(project_dir, "diff", "--binary", "--")
    if tracked_diff is None or working_diff is None:
        return None

    untracked_paths = nul_paths(untracked)
    fingerprint = hashlib.sha256()
    fingerprint.update((head or "<unborn>").encode("ASCII"))
    fingerprint.update(status)
    fingerprint.update(tracked_diff)
    fingerprint.update(working_diff)
    for relative in sorted(untracked_paths):
        fingerprint.update(relative.encode("UTF-8"))
        try:
            stat = (project_dir / Path(relative)).lstat()
        except OSError:
            return None
        fingerprint.update(f"{stat.st_mode}:{stat.st_size}:{stat.st_mtime_ns}".encode("ASCII"))

    paths = sorted(set(nul_paths(unstaged) + nul_paths(staged) + untracked_paths))
    return {
        "head": head,
        "fingerprint": fingerprint.hexdigest(),
        "paths": paths,
    }


def committed_paths(
    project_dir: Path,
    previous_head: str | None,
    current_head: str | None,
) -> list[str] | None:
    if previous_head == current_head:
        return []
    if current_head is None:
        return None
    if previous_head is None:
        raw = git_bytes(project_dir, "ls-tree", "-r", "--name-only", "-z", current_head)
    else:
        raw = git_bytes(
            project_dir,
            "diff",
            "--name-only",
            "--no-renames",
            "-z",
            previous_head,
            current_head,
            "--",
        )
    return None if raw is None else nul_paths(raw)


def changes_since_checkpoint(
    project_dir: Path,
    checkpoint: dict | None,
    current: dict | None,
) -> list[str] | None:
    if checkpoint is None or current is None:
        return None
    if checkpoint["fingerprint"] == current["fingerprint"]:
        return []
    committed = committed_paths(project_dir, checkpoint.get("head"), current.get("head"))
    if committed is None:
        return None
    return sorted(set(current["paths"]) | set(committed))


def changed_paths(project_dir: Path) -> list[str] | None:
    """相容舊呼叫端：回傳目前未提交路徑；無法判斷時回傳 None。"""
    state = workspace_state(project_dir)
    return None if state is None else state["paths"]


def check_applies(check: dict, changed: list[str] | None) -> bool:
    prefixes = check.get("paths")
    if not prefixes:
        return True
    if changed is None:
        return True  # 無從判斷變更時一律跑，不要靜默跳過檢查
    return any(path.startswith(tuple(prefixes)) for path in changed)


def resolve_command(command: list[str]) -> list[str]:
    """把 python 換成目前的直譯器，避免 PATH 上沒有或版本不同。"""
    if command and command[0] in {"python", "python3"}:
        return [sys.executable, *command[1:]]
    return list(command)


def positive_int(value: object, default: int) -> int:
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        return default
    return value


def kill_tree(process: subprocess.Popen) -> None:
    """連同孫行程一起結束。只殺直接子行程的話，孫行程會繼續跑。"""
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/T", "/F", "/PID", str(process.pid)],
                capture_output=True,
                timeout=KILL_WAIT,
            )
        else:
            os.killpg(process.pid, signal.SIGKILL)
    except (OSError, subprocess.SubprocessError):
        pass
    try:
        process.kill()
        process.wait(timeout=KILL_WAIT)
    except (OSError, subprocess.SubprocessError):
        pass


def run_check(check: dict, project_dir: Path, budget: float | None = None) -> tuple[bool, str]:
    """budget 是總時間預算剩下的秒數；比單項 timeout 短時以它為上限。

    輸出寫到暫存檔而不是 pipe：孫行程繼承 pipe 時，讀 pipe 會一直等到孫行程結束，
    逾時就形同虛設，hook 會拖到被宿主中止。
    """
    command = check.get("command")
    if not isinstance(command, list) or not command:
        return True, ""
    timeout = positive_int(check.get("timeout"), DEFAULT_TIMEOUT)
    capped = budget is not None and budget < timeout
    limit = max(1, int(budget)) if capped else timeout
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "UTF-8"}
    group = (
        {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        if os.name == "nt"
        else {"start_new_session": True}
    )
    # stdout 與 stderr 分開寫，最後把 stderr 接在後面：失敗訊息多半在 stderr，
    # 只取尾端幾行時才不會被大量 stdout 擠掉。
    with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
        try:
            process = subprocess.Popen(
                resolve_command(command),
                cwd=str(project_dir),
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                env=env,
                **group,
            )
        except (OSError, ValueError, subprocess.SubprocessError) as error:
            return False, f"無法執行：{error}"
        try:
            returncode = process.wait(timeout=limit)
        except subprocess.TimeoutExpired:
            kill_tree(process)
            if capped:
                return False, f"逾時（總時間預算只剩 {limit} 秒）"
            return False, f"逾時（{timeout} 秒）"
        if returncode == 0:
            return True, ""
        stdout.seek(0)
        stderr.seek(0)
        captured = stdout.read() + stderr.read()
        lines = captured.decode("UTF-8", errors="replace").strip().splitlines()
    tail = "\n".join(lines[-OUTPUT_LINES:]) if lines else "（無輸出）"
    return False, f"退出碼 {returncode}\n{tail}"


def emit_release(event: dict, claude_message: str, codex_message: str) -> None:
    """達上限放行時的告知。exit 0 時 stderr 只進 debug log，必須走 JSON 輸出。

    Claude 的 Stop 支援 additionalContext：Claude 會再回一輪處理這段回饋，下一次
    Stop 帶 stop_hook_active 而直接放行。Codex 的 Stop 輸出只接受固定欄位，多一個
    就整份判為無效、訊息遺失，所以改用 systemMessage 直接顯示給使用者。
    """
    if "turn_id" in event:
        payload: dict = {"systemMessage": codex_message}
    else:
        payload = {
            "hookSpecificOutput": {
                "hookEventName": "Stop",
                "additionalContext": claude_message,
            }
        }
    print(json.dumps(payload, ensure_ascii=False))


def allow(event: dict) -> int:
    """Codex 接受空輸出或合法 JSON，這裡輸出 {} 維持既有行為；Claude 保持無輸出。"""
    if "turn_id" in event:
        print("{}")
    return EXIT_OK


def main() -> int:
    started = time.monotonic()
    event = load_event()
    session_id = str(event.get("session_id", "unknown"))
    project_dir = resolve_project_dir(event)
    hook_event = str(
        event.get("hook_event_name") or event.get("hookEventName") or "Stop"
    )

    if hook_event == "SessionStart":
        if read_checkpoint(session_id, project_dir) is None:
            initial = workspace_state(project_dir)
            if initial is not None:
                write_checkpoint(session_id, project_dir, initial)
        return allow(event)

    if hook_event == "SessionEnd":
        clear_block_count(session_id)
        clear_checkpoint(session_id, project_dir)
        return allow(event)

    if event.get("stop_hook_active") is True:
        return allow(event)

    config = load_config(project_dir)
    if not config:
        return allow(event)

    checks = config.get("checks")
    if not isinstance(checks, list) or not checks:
        return allow(event)

    checkpoint = read_checkpoint(session_id, project_dir)
    current = workspace_state(project_dir)
    changed = changes_since_checkpoint(project_dir, checkpoint, current)
    if config.get("skip_when_clean", True) and changed == []:
        clear_block_count(session_id)
        if current is not None:
            write_checkpoint(session_id, project_dir, current)
        return allow(event)

    total = positive_int(config.get("total_timeout"), 0)
    failures: list[str] = []
    for check in checks:
        if not isinstance(check, dict) or not check_applies(check, changed):
            continue
        remaining = started + total - time.monotonic() if total else None
        if remaining is None:
            ok, detail = run_check(check, project_dir)
        elif remaining < 1:
            ok, detail = False, f"未執行：已用完總時間預算 {total} 秒"
        else:
            ok, detail = run_check(check, project_dir, budget=remaining)
        if not ok:
            name = check.get("name") or " ".join(check.get("command", []))
            shown = " ".join(check.get("command", []))
            failures.append(f"✗ {name}\n  $ {shown}\n  {detail}")

    if not failures:
        clear_block_count(session_id)
        if current is not None:
            write_checkpoint(session_id, project_dir, current)
        return allow(event)

    max_blocks = int(config.get("max_blocks", DEFAULT_MAX_BLOCKS))
    count = read_block_count(session_id) + 1
    write_block_count(session_id, count)
    body = "\n\n".join(failures)

    if count > max_blocks:
        clear_block_count(session_id)
        summary = f"驗證閘門仍未通過，但已達 {max_blocks} 次上限，本次放行。\n\n{body}"
        emit_release(
            event,
            f"{summary}\n\n請如實告訴使用者哪些驗證沒過，不要宣稱已完成。",
            summary,
        )
        return EXIT_OK

    print(
        f"驗證閘門擋下收工（第 {count}/{max_blocks} 次）\n\n{body}\n\n"
        "修好再結束。若判斷不必修，明確說明理由——不要靜默略過。",
        file=sys.stderr,
    )
    return EXIT_BLOCK


if __name__ == "__main__":
    sys.exit(main())

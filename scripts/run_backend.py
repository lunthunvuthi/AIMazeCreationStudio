#!/usr/bin/env python3
"""Start the maze_api backend so that it always dies with its terminal.

Running `uvicorn ... --reload` by hand leaks servers: the reloader ignores the
SIGHUP a closing terminal sends, so the process gets reparented to PID 1 and
keeps holding the port. The next start then fails with `[Errno 48] Address
already in use` while an invisible server from days ago serves stale code. One
such orphan ran for a week and burned 700 CPU-minutes, because `--reload` with
no `--reload-dir` watches the whole repo root, `node_modules` included.

This script fixes both halves of that:

* it reclaims the port from a stale *maze_api* server before starting, and
* it tears the server down when this process ends, however it ends -- Ctrl-C,
  `kill`, or the terminal window closing.

Usage:
    python scripts/run_backend.py                # 127.0.0.1:8000, reload on
    python scripts/run_backend.py --port 8001
    python scripts/run_backend.py --no-reload    # closest to production
    python scripts/run_backend.py --stop         # just free the port, exit
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "Web App" / "backend"
GENERATOR_DIR = REPO_ROOT / "Maze-All-Contents" / "pickaxe-maze-creation"
APP = "maze_api.main:app"

# A process tree is only ours to kill if its command line looks like this
# backend. Anything else on the port is somebody else's service and we refuse to
# touch it. The marker lives on the reloader; its worker children are anonymous
# `multiprocessing.spawn` processes, so ownership is judged from the ancestors.
OWNERSHIP_MARKERS = ("maze_api", "run_backend.py")

TERM_GRACE_SECONDS = 5.0
WATCHDOG_INTERVAL_SECONDS = 1.0


# --------------------------------------------------------------------------- #
# Finding and clearing whatever holds the port
# --------------------------------------------------------------------------- #

def listeners_on(port: int) -> list[int]:
    """PIDs listening on `port`, newest last. Empty if lsof is unavailable."""
    try:
        out = subprocess.run(
            ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
            capture_output=True, text=True, check=False,
        ).stdout
    except FileNotFoundError:
        return []
    seen: list[int] = []
    for line in out.split():
        pid = int(line)
        if pid not in seen:
            seen.append(pid)
    return seen


def command_line(pid: int) -> str:
    return subprocess.run(
        ["ps", "-o", "command=", "-p", str(pid)],
        capture_output=True, text=True, check=False,
    ).stdout.strip()


def parent_of(pid: int) -> int:
    out = subprocess.run(
        ["ps", "-o", "ppid=", "-p", str(pid)],
        capture_output=True, text=True, check=False,
    ).stdout.strip()
    return int(out) if out else 0


def descendants(pid: int) -> list[int]:
    """`pid` and every process below it, children before parents."""
    kids = subprocess.run(
        ["pgrep", "-P", str(pid)], capture_output=True, text=True, check=False,
    ).stdout.split()
    below: list[int] = []
    for kid in kids:
        below.extend(descendants(int(kid)))
    return below + [pid]


def looks_like_ours(pid: int) -> bool:
    return any(marker in command_line(pid) for marker in OWNERSHIP_MARKERS)


def owning_root(pid: int) -> int | None:
    """The top of `pid`'s tree if that tree is one of our backends, else None.

    Walks up from the port holder, and only ever across an *unbroken* run of
    processes that look like ours. Killing the top matters: a worker killed on
    its own is simply respawned by the reloader above it.

    The contiguity rule is not fussiness, it is the whole safety property. Any
    shell that merely mentions `maze_api` on its command line -- `grep maze_api`,
    or the very test script that exercised this function -- matches
    OWNERSHIP_MARKERS. An earlier version walked up past non-matching processes
    to the topmost match, found one of those shells above an unrelated gap, and
    killed it. So: a gap ends the walk.

    The one process allowed not to match is the holder itself, which for uvicorn
    `--reload` is an anonymous `multiprocessing.spawn` worker. Past that the
    chain must match all the way up.
    """
    chain: list[int] = []
    current = pid
    for _ in range(8):  # guard against a cycle in the ps output
        if current <= 1:
            break
        chain.append(current)
        current = parent_of(current)

    start = next((i for i, q in enumerate(chain) if looks_like_ours(q)), None)
    if start is None or start > 1:
        # No marker on the holder or on its immediate parent: not our tree.
        return None

    root = chain[start]
    for candidate in chain[start + 1:]:
        if not looks_like_ours(candidate):
            break
        root = candidate
    return root


def reclaim_port(port: int) -> bool:
    """Kill any of *our* backends holding `port`. False if a stranger holds it."""
    holders = listeners_on(port)
    if not holders:
        return True

    roots: list[int] = []
    for pid in holders:
        root = owning_root(pid)
        if root is None:
            print(
                f"port {port} is held by PID {pid}, which is not a maze_api "
                f"server:\n    {command_line(pid)}\nRefusing to kill it. Stop it "
                f"yourself, or start on another port with --port.",
                file=sys.stderr,
            )
            return False
        if root not in roots:
            roots.append(root)

    for root in roots:
        print(f"reclaiming port {port} from stale backend PID {root}")
        for victim in descendants(root):
            terminate(victim)

    deadline = time.monotonic() + TERM_GRACE_SECONDS
    while time.monotonic() < deadline:
        if not listeners_on(port):
            return True
        time.sleep(0.1)

    for root in roots:
        for victim in descendants(root):
            terminate(victim, signal.SIGKILL)
    time.sleep(0.3)
    return not listeners_on(port)


def terminate(pid: int, sig: int = signal.SIGTERM) -> None:
    try:
        os.kill(pid, sig)
    except (ProcessLookupError, PermissionError, OSError):
        pass


def signal_group(pgid: int, sig: int) -> bool:
    """Signal a whole process group. False if it is already gone.

    Once the group leader has been reaped the kernel may answer either ESRCH or
    EPERM, depending on whether the id has been recycled; both mean there is
    nothing left of ours to kill.
    """
    try:
        os.killpg(pgid, sig)
        return True
    except (ProcessLookupError, PermissionError, OSError):
        return False


# --------------------------------------------------------------------------- #
# Running the server, and making sure it goes away
# --------------------------------------------------------------------------- #

def interpreter() -> str:
    """Prefer the repo venv, so `python3 scripts/run_backend.py` also works."""
    venv_python = REPO_ROOT / ".venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable


def uvicorn_command(args: argparse.Namespace) -> list[str]:
    cmd = [
        interpreter(), "-m", "uvicorn", APP,
        "--app-dir", str(BACKEND_DIR),
        "--host", args.host,
        "--port", str(args.port),
    ]
    if args.reload:
        # Watch only the code that the app imports. Without these the reloader
        # walks the repo root -- node_modules, output/, .venv -- and spins a
        # core forever.
        cmd += [
            "--reload",
            "--reload-dir", str(BACKEND_DIR),
            "--reload-dir", str(GENERATOR_DIR / "pickaxe_maze"),
        ]
    return cmd


_shutdown_lock = threading.Lock()
_shutdown_started = False


def gone_within(proc: subprocess.Popen, timeout: float) -> bool:
    """Poll for the child to exit.

    Deliberately not `proc.wait(timeout=...)`: teardown can run on the watchdog
    thread while the main thread is already blocked in `proc.wait()`, and two
    waits racing for the same child is how the reaped-then-SIGKILL bug appeared.
    `poll()` is safe to call from either.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return True
        time.sleep(0.1)
    return proc.poll() is not None


def shut_down(proc: subprocess.Popen, reason: str) -> None:
    """Kill the server's whole process group, reload children included.

    Runs at most once per process: a signal handler, the watchdog thread and
    main()'s `finally` may all reach for it, and only the first should act.
    """
    global _shutdown_started
    with _shutdown_lock:
        if _shutdown_started:
            return
        _shutdown_started = True

    if proc.poll() is not None:
        return
    print(f"\nstopping backend ({reason})")

    # `start_new_session=True` made the child its own group leader, so its pid
    # is the group id -- no getpgid lookup that could race with the exit.
    group = proc.pid
    if not signal_group(group, signal.SIGTERM):
        return
    if gone_within(proc, TERM_GRACE_SECONDS):
        return

    print("backend ignored SIGTERM; sending SIGKILL")
    signal_group(group, signal.SIGKILL)
    if not gone_within(proc, TERM_GRACE_SECONDS):
        print("warning: backend may still be running", file=sys.stderr)


def start_watchdog(proc: subprocess.Popen, stop: threading.Event) -> None:
    """Notice a terminal that went away without signalling us.

    A closing window normally SIGHUPs us and the signal handler does the work.
    But if the shell is killed outright there is no SIGHUP, so we also watch for
    our parent disappearing (getppid becomes 1) and for the controlling tty's
    device node vanishing. macOS has no PDEATHSIG; polling is the substitute.
    """
    original_ppid = os.getppid()
    try:
        tty_path: str | None = os.ttyname(0) if os.isatty(0) else None
    except OSError:
        tty_path = None

    def watch() -> None:
        while not stop.wait(WATCHDOG_INTERVAL_SECONDS):
            if proc.poll() is not None:
                return
            if os.getppid() != original_ppid:
                shut_down(proc, "parent shell exited")
                return
            if tty_path is not None and not os.path.exists(tty_path):
                shut_down(proc, "controlling terminal closed")
                return

    threading.Thread(target=watch, daemon=True).start()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the maze_api backend, tied to this terminal's lifetime.",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--no-reload", dest="reload", action="store_false",
        help="disable auto-reload (no watcher, no reload child process)",
    )
    parser.add_argument(
        "--no-reclaim", dest="reclaim", action="store_false",
        help="fail instead of killing a stale backend already on the port",
    )
    parser.add_argument(
        "--stop", action="store_true",
        help="stop a backend on the port and exit without starting one",
    )
    args = parser.parse_args()

    if args.stop:
        if not listeners_on(args.port):
            print(f"nothing is listening on port {args.port}")
            return 0
        return 0 if reclaim_port(args.port) else 1

    if listeners_on(args.port):
        if not args.reclaim:
            print(
                f"port {args.port} is already in use and --no-reclaim was "
                f"given; run with --stop to free it.",
                file=sys.stderr,
            )
            return 1
        if not reclaim_port(args.port):
            return 1

    cmd = uvicorn_command(args)
    print(f"starting backend on http://{args.host}:{args.port}  (docs at /docs)")
    print("press Ctrl-C, or just close this terminal, to stop it")

    # Its own process group, so one killpg takes the reloader and its children
    # together. Nothing else inherits the group, so nothing else gets hit.
    proc = subprocess.Popen(cmd, cwd=str(REPO_ROOT), start_new_session=True)

    stop = threading.Event()
    reason: list[str] = []

    def on_signal(signum: int, _frame: object) -> None:
        # Only note why we are stopping and unwind. Doing the teardown here
        # would mean racing main()'s own `proc.wait()` from inside a handler.
        stop.set()
        reason.append(f"received {signal.Signals(signum).name}")
        raise SystemExit(0)

    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, on_signal)

    start_watchdog(proc, stop)

    try:
        return proc.wait()
    finally:
        stop.set()
        shut_down(proc, reason[0] if reason else "run_backend.py exiting")


if __name__ == "__main__":
    sys.exit(main())

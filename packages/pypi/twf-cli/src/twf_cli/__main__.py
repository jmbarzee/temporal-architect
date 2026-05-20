"""Resolve and exec the bundled twf binary with the wrapper's argv.

Pattern: the wheel ships a single platform-specific binary at
``twf_cli/_binary/twf`` (or ``twf.exe`` on Windows). The wrapper's
console-script (``twf = twf_cli.__main__:main``) execs it.

On POSIX, ``os.execv`` replaces the Python process so the binary's exit
code and signals propagate directly. On Windows, ``os.execv`` exists but
doesn't quite share the same semantics, so we use ``subprocess`` and
forward the return code.
"""
import os
import sys
from pathlib import Path


def _binary_path() -> Path:
    here = Path(__file__).parent / "_binary"
    name = "twf.exe" if sys.platform == "win32" else "twf"
    return here / name


def main() -> int:
    binary = _binary_path()
    if not binary.exists():
        sys.stderr.write(
            f"twf-cli: bundled binary not found at {binary}.\n"
            "Reinstall twf-cli from PyPI. If you installed from source, "
            "stage the binary into this directory first.\n"
        )
        return 1

    if sys.platform == "win32":
        import subprocess

        return subprocess.call([str(binary), *sys.argv[1:]])

    # POSIX: replace this process with the binary so signals + exit code
    # propagate naturally.
    os.execv(str(binary), [str(binary), *sys.argv[1:]])
    # Unreachable, but satisfies type checkers / linters.
    return 0


if __name__ == "__main__":
    sys.exit(main())

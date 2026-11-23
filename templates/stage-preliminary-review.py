"""Publish, revise, refresh or change the status of a preliminary design release.

This file holds no behaviour. It calls the staging command of the installed Agent FRC plugin, so the project follows
the plugin's current release and has nothing to copy again. Name the plugin folder once: set AGENT_FRC_PLUGIN, or pass
--plugin PATH.

    python cad/preliminary-design/stage.py 1.0 --design-name "NAME"
    python cad/preliminary-design/stage.py --set-status 1.0 effective
    python cad/preliminary-design/stage.py --refresh-view 1.0
"""
import os
from pathlib import Path
import runpy
import sys

if __name__ == "__main__":
    args = sys.argv[1:]
    plugin = os.environ.get("AGENT_FRC_PLUGIN")
    if "--plugin" in args[:-1]:
        at = args.index("--plugin")
        plugin = args[at + 1]
        del args[at:at + 2]
    command = Path(plugin or "") / "scripts" / "stage_preliminary_review.py"
    if not plugin or not command.is_file():
        sys.exit("Name the installed Agent FRC plugin folder: set AGENT_FRC_PLUGIN or pass --plugin PATH. "
                 + ("No staging command at " + command.as_posix() if plugin else "Neither is set") + ".")
    sys.argv = [str(command), "--base", str(Path(__file__).resolve().parent), *args]
    runpy.run_path(str(command), run_name="__main__")

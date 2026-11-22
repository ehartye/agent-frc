"""Write a generated file so a concurrent reader sees the previous bytes or the new bytes, never a gap."""
import os
from pathlib import Path
import tempfile
import time


def write_atomic(path, data, *, exclusive=False):
    """Write bytes to a temporary file beside `path`, then rename it over the target.

    A failed write leaves the previous file intact and removes the temporary file. With `exclusive`,
    an existing target raises FileExistsError and is never replaced."""
    path = Path(path)
    if exclusive and os.path.lexists(path):
        raise FileExistsError(str(path))
    handle, name = tempfile.mkstemp(dir=path.parent, prefix="." + path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if exclusive and os.path.lexists(path):
            raise FileExistsError(str(path))
        for attempt in range(50):
            try:
                os.replace(name, path)
                break
            except PermissionError:
                # Windows refuses the rename while a reader holds the target open; the reader finishes shortly.
                if attempt == 49:
                    raise
                time.sleep(0.02)
    except BaseException:
        try:
            os.unlink(name)
        except OSError:
            pass
        raise

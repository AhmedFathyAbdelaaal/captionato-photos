"""Stream a zip of files without building it in memory or on disk.

A gallery's originals can run to gigabytes, so the zip is generated on the fly:
zipfile writes into a sink we drain after every chunk. Photos are already
compressed, so entries are STORED (no deflate) — fast, and CPU-light.
"""
import io
import zipfile
from collections.abc import Iterable, Iterator
from pathlib import Path

CHUNK = 1024 * 1024


class _Sink(io.RawIOBase):
    """Write-only buffer. It has no tell()/seek(), so zipfile switches to its
    streaming mode (sizes go in data descriptors after each entry)."""

    def __init__(self) -> None:
        self._parts: list[bytes] = []

    def writable(self) -> bool:
        return True

    def write(self, b) -> int:
        self._parts.append(bytes(b))
        return len(b)

    def drain(self) -> bytes:
        out = b"".join(self._parts)
        self._parts.clear()
        return out


def unique_names(names: Iterable[str]) -> list[str]:
    """De-duplicate archive names: 'a.jpg', 'a.jpg' → 'a.jpg', 'a (2).jpg'."""
    seen: dict[str, int] = {}
    out = []
    for name in names:
        key = name.lower()
        if key in seen:
            seen[key] += 1
            stem, dot, ext = name.rpartition(".")
            name = f"{stem} ({seen[key]}).{ext}" if dot else f"{name} ({seen[key]})"
        else:
            seen[key] = 1
        out.append(name)
    return out


def stream_zip(entries: list[tuple[str, Path]]) -> Iterator[bytes]:
    """Yield zip bytes for (archive name, file path) pairs. Missing files are
    skipped so one lost original doesn't break the whole download."""
    sink = _Sink()
    with zipfile.ZipFile(sink, "w", zipfile.ZIP_STORED) as zf:
        for name, path in entries:
            if not path.exists():
                continue
            with open(path, "rb") as src, zf.open(name, "w") as dst:
                while chunk := src.read(CHUNK):
                    dst.write(chunk)
                    yield sink.drain()
            yield sink.drain()
    yield sink.drain()

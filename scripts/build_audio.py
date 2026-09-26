"""Generate narration mp3 + word timings for every line in content/audio-lines.json.

public/audio and its subfolders hold generated clips only: every .mp3/.json there
(other than manifest.json) is expected to come from a current line, and anything
that doesn't is deleted as stale (see stale_files).
"""
import asyncio
import hashlib
import json
import pathlib
import re

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
LINES = ROOT / "content" / "audio-lines.json"
VOICE = ROOT / "content" / "voice.json"
OUT = ROOT / "public" / "audio"
MANIFEST = OUT / "manifest.json"
READER_VERSIONS = ROOT / "src" / "content" / "readerAudioVersions.json"


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


LOOKAHEAD = 3
MIN_PARTIAL = 3


def _is_match(tok: str, p: int, bw: str, compound: bool) -> bool:
    if not tok[p:].startswith(bw):
        return False
    # A short boundary word (like "a" or "an") is only allowed to prefix-match
    # part of a token when that token is a hyphenated compound (e.g.
    # "U-turn" spoken as "u" then "turn"), since that's the only legitimate
    # reason a caption token gets built up from several short boundaries.
    # Otherwise it must match the whole token, so it can't falsely prefix-
    # match the start of an unrelated longer token (e.g. "a" into "away").
    if not compound and len(bw) < MIN_PARTIAL and len(bw) != len(tok):
        return False
    return True


def match_words(text: str, boundaries: list[dict]) -> list[dict]:
    """Map each spoken word to the index of the whitespace-separated caption token it belongs to."""
    raw = text.split()
    toks = [norm(t) for t in raw]
    compound = ["-" in t for t in raw]
    out: list[dict] = []
    ti, pos = 0, 0
    for bd in boundaries:
        bw = norm(bd["text"])
        if not bw:
            continue
        j, p = ti, pos
        limit = min(len(toks), ti + LOOKAHEAD + 1)
        while j < limit and not _is_match(toks[j], p, bw, compound[j]):
            j, p = j + 1, 0
        if j >= limit:
            continue
        start = bd["offset"] // 10000
        out.append({"i": j, "start": start, "end": start + bd["duration"] // 10000})
        p += len(bw)
        if p >= len(toks[j]):
            j, p = j + 1, 0
        ti, pos = j, p
    return out


def line_hash(text: str, voice: dict) -> str:
    return hashlib.sha1(f"{voice['voice']}|{voice.get('rate', '+0%')}|{text}".encode()).hexdigest()


def line_dir(out: pathlib.Path, line: dict) -> pathlib.Path:
    """Where a line's files go: `out`, or its subfolder (e.g. public/audio/reader) when the line has a "dir"."""
    return out / line["dir"] if line.get("dir") else out


def stale_files(out: pathlib.Path, lines: list[dict]) -> list[pathlib.Path]:
    """Files in `out` and its subfolders that aren't a current line's output, so are safe to delete.

    public/audio (and each subfolder, like public/audio/reader) holds only generated
    .mp3/.json clips plus manifest.json: anything else there is a leftover from a line
    that no longer exists (renamed id, removed content, ...) and is treated as stale.
    manifest.json itself is never considered stale.
    """
    keep = {(line.get("dir", ""), line["id"]) for line in lines}
    found: list[pathlib.Path] = []
    for folder in [out, *sorted(d for d in out.iterdir() if d.is_dir())]:
        rel = "" if folder == out else folder.name
        for f in sorted(folder.iterdir()):
            if f.is_file() and f.suffix in (".mp3", ".json") and f.name != "manifest.json" and (rel, f.stem) not in keep:
                found.append(f)
    return found


async def synth(text: str, voice: dict) -> tuple[bytes, list[dict]]:
    comm = edge_tts.Communicate(text, voice["voice"], rate=voice.get("rate", "+0%"), boundary="WordBoundary")
    audio = bytearray()
    bounds: list[dict] = []
    async for ch in comm.stream():
        if ch["type"] == "audio":
            audio.extend(ch["data"])
        elif ch["type"] == "WordBoundary":
            bounds.append(ch)
    if not audio:
        raise RuntimeError(f"no audio returned for: {text!r}")
    return bytes(audio), bounds


async def build_one(line: dict, voice: dict, manifest: dict, sem: asyncio.Semaphore) -> bool:
    h = line_hash(line["text"], voice)
    folder = line_dir(OUT, line)
    folder.mkdir(parents=True, exist_ok=True)
    mp3 = folder / f"{line['id']}.mp3"
    js = folder / f"{line['id']}.json"
    if manifest.get(line["id"]) == h and mp3.exists() and js.exists():
        return False
    async with sem:
        for attempt in range(3):
            try:
                audio, bounds = await synth(line["text"], voice)
                break
            except Exception:
                if attempt == 2:
                    raise
                await asyncio.sleep(2 * (attempt + 1))
    mp3.write_bytes(audio)
    js.write_text(json.dumps({"text": line["text"], "words": match_words(line["text"], bounds)}), encoding="utf-8")
    manifest[line["id"]] = h
    return True


def reader_versions(lines: list[dict], manifest: dict) -> dict[str, str]:
    """id -> first 8 chars of its manifest hash, for every line whose dir is "reader".

    Read by the browser (src/content/readerAudioVersions.json) so a corrected paragraph's clip gets
    a new URL and isn't served forever from a device's old runtime cache of the previous recording.
    """
    return {line["id"]: manifest[line["id"]][:8] for line in lines if line.get("dir") == "reader"}


ID_RE = re.compile(r"^[a-z0-9_-]+$")


def check_unique_ids(lines: list[dict]) -> None:
    """Raise SystemExit naming the first duplicate id: the manifest is keyed by id only, so two
    lines sharing an id would silently overwrite each other's clip and hash entry."""
    seen: set[str] = set()
    for line in lines:
        if line["id"] in seen:
            raise SystemExit(f"duplicate audio line id: {line['id']!r}")
        seen.add(line["id"])


async def main() -> None:
    lines = json.loads(LINES.read_text(encoding="utf-8"))
    for line in lines:
        assert ID_RE.match(line["id"]), f"invalid audio line id: {line['id']!r}"
        if "dir" in line:
            assert ID_RE.match(line["dir"]), f"invalid audio dir: {line['dir']!r}"
    check_unique_ids(lines)
    voice = json.loads(VOICE.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    sem = asyncio.Semaphore(4)
    try:
        made = await asyncio.gather(*(build_one(l, voice, manifest, sem) for l in lines))
    finally:
        keep = {l["id"] for l in lines}
        for k in list(manifest):
            if k not in keep:
                del manifest[k]
        MANIFEST.write_text(json.dumps(manifest, indent=1, sort_keys=True), encoding="utf-8")
        READER_VERSIONS.write_text(json.dumps(reader_versions(lines, manifest), indent=1, sort_keys=True) + "\n", encoding="utf-8")
    stale = stale_files(OUT, lines)
    for f in stale:
        f.unlink()
    print(f"{sum(made)} generated, {len(lines) - sum(made)} unchanged, {len(stale)} stale files removed")


if __name__ == "__main__":
    asyncio.run(main())

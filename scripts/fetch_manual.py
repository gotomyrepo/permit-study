"""Download the official NYS Driver's Manual (MV-21) and extract per-page text."""
import json
import pathlib
import urllib.request

from pypdf import PdfReader

URL = "https://dmv.ny.gov/brochure/mv21.pdf"
ROOT = pathlib.Path(__file__).resolve().parent.parent
PDF = ROOT / "public" / "manual" / "mv21.pdf"
OUT = ROOT / "content" / "manual"


def main() -> None:
    PDF.parent.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    if not data.startswith(b"%PDF"):
        raise SystemExit("Download is not a PDF")
    PDF.write_bytes(data)
    reader = PdfReader(str(PDF))
    pages = [{"page": i + 1, "text": p.extract_text() or ""} for i, p in enumerate(reader.pages)]
    (OUT / "pages.json").write_text(json.dumps(pages, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "mv21.txt").write_text(
        "\n".join(f"=== PAGE {p['page']} ===\n{p['text']}" for p in pages), encoding="utf-8"
    )
    print(f"Saved {len(pages)} pages")


if __name__ == "__main__":
    main()

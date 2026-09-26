"""Crop manual figures (content/reader/figures.yaml) to public/reader/figures/<id>.png at 2x, and copy
scene stills (picture: scene:<id> in content/reader/ch*.yaml) from screenshots/<id>.png (npm run shots)
to public/reader/scenes/<id>.png. Look at every PNG after running."""
import pathlib
import re
import shutil
import sys

import fitz  # PyMuPDF
import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
PDF = ROOT / "public" / "manual" / "mv21.pdf"
READER = ROOT / "content" / "reader"
FIGURES = READER / "figures.yaml"
OUT_FIG = ROOT / "public" / "reader" / "figures"
OUT_SCENE = ROOT / "public" / "reader" / "scenes"
SHOTS = ROOT / "screenshots"
ZOOM = 2
FIG_ID = re.compile(r"^fig-[a-z0-9-]+$")


def load_figures(path: pathlib.Path) -> list[dict]:
    figs = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    seen: set[str] = set()
    for f in figs:
        if not FIG_ID.match(str(f.get("id", ""))):
            raise ValueError(f"bad figure id: {f.get('id')!r}")
        if f["id"] in seen:
            raise ValueError(f"duplicate figure id: {f['id']}")
        seen.add(f["id"])
        page = f.get("page")
        if not isinstance(page, int) or isinstance(page, bool):
            raise ValueError(f"{f['id']}: missing page (a whole page number)")
        box = f.get("box")
        if not (isinstance(box, list) and len(box) == 4
                and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in box)):
            raise ValueError(f"{f['id']}: box must be 4 numbers [x0, y0, x1, y1]")
        x0, y0, x1, y1 = box
        if not (x0 < x1 and y0 < y1):
            raise ValueError(f"{f['id']}: box must be [x0, y0, x1, y1] with x0 < x1 and y0 < y1")
    return figs


def check_pages(doc: fitz.Document, figs: list[dict]) -> None:
    """Every figure's page is in the manual and its box lies inside that page."""
    for f in figs:
        n = f["page"]
        if not 1 <= n <= doc.page_count:
            raise ValueError(f"{f['id']}: page {n} is not in the manual (1\u2013{doc.page_count})")
        rect = doc[n - 1].rect
        if not rect.contains(fitz.Rect(*f["box"])):
            raise ValueError(f"{f['id']}: box {f['box']} is outside page {n} "
                             f"(0, 0, {rect.width:g}, {rect.height:g})")


def crop(doc: fitz.Document, fig: dict, out_dir: pathlib.Path) -> pathlib.Path:
    out = out_dir / f"{fig['id']}.png"
    page = doc[fig["page"] - 1]
    page.get_pixmap(matrix=fitz.Matrix(ZOOM, ZOOM), clip=fitz.Rect(*fig["box"])).save(out)
    return out


def scene_pictures(reader_dir: pathlib.Path) -> set[str]:
    ids: set[str] = set()
    for p in sorted(reader_dir.glob("ch*.yaml")):
        ch = yaml.safe_load(p.read_text(encoding="utf-8"))
        for s in ch["sections"]:
            for para in s["paragraphs"]:
                pic = str(para.get("picture", ""))
                if pic.startswith("scene:"):
                    ids.add(pic[len("scene:"):])
    return ids


def main() -> None:
    figs = load_figures(FIGURES)
    OUT_FIG.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF)
    check_pages(doc, figs)
    for f in figs:
        print(crop(doc, f, OUT_FIG).relative_to(ROOT).as_posix())
    keep = {f["id"] for f in figs}
    for png in sorted(OUT_FIG.glob("*.png")):
        if png.stem not in keep:
            png.unlink()
            print(f"removed {png.name}")
    missing = []
    scenes = scene_pictures(READER)
    for sid in sorted(scenes):
        src = SHOTS / f"{sid}.png"
        if not src.exists():
            missing.append(sid)
            continue
        OUT_SCENE.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, OUT_SCENE / f"{sid}.png")
        print(f"public/reader/scenes/{sid}.png")
    for png in sorted(OUT_SCENE.glob("*.png")):
        if png.stem not in scenes:
            png.unlink()
            print(f"removed scenes/{png.name}")
    if missing:
        sys.exit("missing screenshots, run: npm run shots -- " + " ".join(missing))


if __name__ == "__main__":
    main()

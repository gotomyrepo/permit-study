import pathlib
import sys

import fitz
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
from crop_figures import PDF, crop, load_figures, scene_pictures  # noqa: E402


def write(p: pathlib.Path, text: str) -> pathlib.Path:
    p.write_text(text, encoding="utf-8")
    return p


def test_load_figures_accepts_a_good_list(tmp_path):
    figs = load_figures(write(tmp_path / "f.yaml", "- { id: fig-a, page: 29, box: [10, 20, 110, 70] }\n"))
    assert figs == [{"id": "fig-a", "page": 29, "box": [10, 20, 110, 70]}]


@pytest.mark.parametrize("line", [
    "- { id: stop, page: 29, box: [10, 20, 110, 70] }",
    "- { id: fig-a, page: 29, box: [110, 20, 10, 70] }",
    "- { id: fig-a, page: 29, box: [10, 20, 110, 70] }\n- { id: fig-a, page: 30, box: [10, 20, 110, 70] }",
])
def test_load_figures_rejects_bad_entries(tmp_path, line):
    with pytest.raises(ValueError):
        load_figures(write(tmp_path / "f.yaml", line + "\n"))


def test_crop_renders_the_box_at_2x(tmp_path):
    out = crop(fitz.open(PDF), {"id": "fig-t", "page": 29, "box": [100, 200, 200, 250]}, tmp_path)
    pix = fitz.Pixmap(str(out))
    assert (pix.width, pix.height) == (200, 100)


def test_scene_pictures_lists_scene_stills(tmp_path):
    write(tmp_path / "ch05.yaml", """
id: ch05
number: 5
title: T
sections:
  - id: ch05-a
    title: A
    paragraphs:
      - { id: ch05-a-1, say: x, source: { page: 34, quote: q }, picture: "scene:turn-left" }
      - { id: ch05-a-2, say: x, source: { page: 34, quote: q }, picture: fig-stop-sign }
""")
    assert scene_pictures(tmp_path) == {"turn-left"}


def use_tmp_dirs(monkeypatch, tmp_path, figures_yaml: str) -> dict:
    import crop_figures as cf
    dirs = {"READER": tmp_path / "reader", "OUT_FIG": tmp_path / "out" / "figures",
            "OUT_SCENE": tmp_path / "out" / "scenes", "SHOTS": tmp_path / "shots"}
    dirs["READER"].mkdir()
    dirs["SHOTS"].mkdir()
    for name, path in dirs.items():
        monkeypatch.setattr(cf, name, path)
    monkeypatch.setattr(cf, "ROOT", tmp_path)
    monkeypatch.setattr(cf, "FIGURES", write(dirs["READER"] / "figures.yaml", figures_yaml))
    return dirs


def test_main_removes_pngs_of_deleted_figures(monkeypatch, tmp_path):
    import crop_figures as cf
    dirs = use_tmp_dirs(monkeypatch, tmp_path, "- { id: fig-a, page: 29, box: [10, 20, 110, 70] }\n")
    dirs["OUT_FIG"].mkdir(parents=True)
    (dirs["OUT_FIG"] / "fig-old.png").write_bytes(b"x")
    cf.main()
    assert sorted(p.name for p in dirs["OUT_FIG"].iterdir()) == ["fig-a.png"]


def test_main_fails_when_a_scene_still_has_no_screenshot(monkeypatch, tmp_path):
    import crop_figures as cf
    dirs = use_tmp_dirs(monkeypatch, tmp_path, "[]\n")
    write(dirs["READER"] / "ch05.yaml", """
id: ch05
number: 5
title: T
sections:
  - id: ch05-a
    title: A
    paragraphs:
      - { id: ch05-a-1, say: x, source: { page: 34, quote: q }, picture: "scene:turn-left" }
      - { id: ch05-a-2, say: x, source: { page: 34, quote: q }, picture: "scene:park" }
""")
    (dirs["SHOTS"] / "park.png").write_bytes(b"png")
    with pytest.raises(SystemExit) as e:
        cf.main()
    assert "turn-left" in str(e.value.code) and "park" not in str(e.value.code)
    assert (dirs["OUT_SCENE"] / "park.png").read_bytes() == b"png"

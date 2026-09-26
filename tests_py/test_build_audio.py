import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
from build_audio import line_dir, match_words, stale_files  # noqa: E402


def b(text, ms):
    return {"text": text, "offset": ms * 10000, "duration": 100 * 10000}


def test_simple_sentence():
    words = match_words("This is a yield sign.", [b("This", 0), b("is", 100), b("a", 200), b("yield", 300), b("sign", 400)])
    assert [w["i"] for w in words] == [0, 1, 2, 3, 4]


def test_times_are_milliseconds():
    words = match_words("Go now.", [b("Go", 50), b("now", 300)])
    assert words[0] == {"i": 0, "start": 50, "end": 150}
    assert words[1]["start"] == 300


def test_hyphenated_token_gets_several_boundaries():
    words = match_words("Yield the right-of-way now.", [b("Yield", 0), b("the", 1), b("right", 2), b("of", 3), b("way", 4), b("now", 5)])
    assert [w["i"] for w in words] == [0, 1, 2, 2, 2, 3]


def test_unmatched_boundary_is_skipped():
    words = match_words("Park 15 feet away.", [b("Park", 0), b("fifteen", 1), b("feet", 2), b("away", 3)])
    assert [w["i"] for w in words] == [0, 2, 3]


def test_search_does_not_jump_past_nearby_unmatched_words():
    text = "Go 55 mph here. It takes an hour."
    boundaries = [
        b("Go", 0), b("fifty", 1), b("five", 2), b("miles", 3), b("per", 4), b("hour", 5),
        b("here", 6), b("It", 7), b("takes", 8), b("an", 9), b("hour", 10),
    ]
    words = match_words(text, boundaries)
    tail = [w["i"] for w in words if w["i"] >= 3]
    assert tail == [3, 4, 5, 6, 7]


def test_short_word_does_not_prefix_match_longer_token():
    words = match_words("Go away now.", [b("Go", 0), b("a", 1), b("now", 2)])
    assert [w["i"] for w in words] == [0, 2]


def test_short_word_matches_at_current_token():
    text = "Make a U-turn and a K-turn here."
    boundaries = [
        b("Make", 0), b("a", 1), b("U", 2), b("turn", 3), b("and", 4),
        b("a", 5), b("K", 6), b("turn", 7), b("here", 8),
    ]
    words = match_words(text, boundaries)
    assert [w["i"] for w in words] == [0, 1, 2, 2, 3, 4, 5, 5, 6]


def test_line_dir_uses_the_subfolder(tmp_path):
    assert line_dir(tmp_path, {"id": "card-a", "text": "x"}) == tmp_path
    assert line_dir(tmp_path, {"id": "reader-a", "text": "x", "dir": "reader"}) == tmp_path / "reader"


def test_stale_files_looks_in_subfolders(tmp_path):
    (tmp_path / "reader").mkdir()
    for p in ["card-a.mp3", "card-a.json", "card-old.mp3", "manifest.json",
              "reader/reader-a.mp3", "reader/reader-a.json", "reader/reader-old.json", "reader/notes.txt"]:
        (tmp_path / p).write_text("x")
    lines = [{"id": "card-a", "text": "x"}, {"id": "reader-a", "text": "y", "dir": "reader"}]
    stale = sorted(f.relative_to(tmp_path).as_posix() for f in stale_files(tmp_path, lines))
    assert stale == ["card-old.mp3", "reader/reader-old.json"]


def test_a_clip_in_the_wrong_folder_is_stale(tmp_path):
    (tmp_path / "reader").mkdir()
    (tmp_path / "reader-a.mp3").write_text("x")
    lines = [{"id": "reader-a", "text": "y", "dir": "reader"}]
    assert [f.name for f in stale_files(tmp_path, lines)] == ["reader-a.mp3"]

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "scripts"))
from build_audio import match_words  # noqa: E402


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

"""Make short samples of candidate voices so the parent can choose one."""
import asyncio
import pathlib

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "voice-samples"
VOICES = ["en-US-AvaNeural", "en-US-EmmaNeural", "en-US-JennyNeural", "en-US-AndrewNeural"]
TEXT = ("This is a yield sign. Yield means: let the other cars go first. "
        "Slow down as you get close. If a car is coming, stop and wait.")
RATE = "-10%"


async def main() -> None:
    OUT.mkdir(exist_ok=True)
    for v in VOICES:
        await edge_tts.Communicate(TEXT, v, rate=RATE).save(str(OUT / f"{v}.mp3"))
    rows = "\n".join(f'<p><b>{i + 1}. {v.split("-")[2].replace("Neural", "")}</b><br><audio controls src="{v}.mp3"></audio></p>'
                     for i, v in enumerate(VOICES))
    (OUT / "index.html").write_text(f"<!doctype html><meta charset=utf-8><title>Voices</title>"
                                    f"<body style='font:20px system-ui;margin:40px'><h1>Pick a voice</h1>{rows}</body>",
                                    encoding="utf-8")
    print(OUT / "index.html")


if __name__ == "__main__":
    asyncio.run(main())

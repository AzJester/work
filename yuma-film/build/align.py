#!/usr/bin/env python3
"""Transcribe the narration with word timestamps (faster-whisper) -> audio/words.json."""
import json, sys
from faster_whisper import WhisperModel
src = sys.argv[1]
m = WhisperModel(sys.argv[2] if len(sys.argv) > 2 else "small.en", device="cpu", compute_type="int8")
segs, info = m.transcribe(src, word_timestamps=True, beam_size=5, vad_filter=False)
words = []
for s in segs:
    print(f"[{s.start:6.2f} - {s.end:6.2f}] {s.text.strip()}", flush=True)
    for w in s.words:
        words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)})
json.dump(words, open("audio/words.json", "w"), indent=0)
print("words", len(words), "dur", round(info.duration, 2))

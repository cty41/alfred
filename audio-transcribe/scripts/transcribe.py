# /// script
# requires-python = ">=3.11"
# dependencies = ["faster-whisper>=1.0"]
# ///
"""Transcribe an audio file to JSON segments on stdout."""

import argparse
import json
import os
import subprocess
import sys

SUPPORTED = {".m4a", ".mp3", ".wav", ".aac", ".ogg", ".opus", ".flac", ".amr", ".mp4", ".webm"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--language", default=None)
    parser.add_argument("--model", default="medium", choices=["small", "medium", "large-v3"])
    args = parser.parse_args()

    if not os.path.isfile(args.path):
        print(f"file not found: {args.path}", file=sys.stderr)
        return 2
    ext = os.path.splitext(args.path)[1].lower()
    if ext not in SUPPORTED:
        hint = " WeChat .silk voice notes must be converted to mp3 first." if ext == ".silk" else ""
        print(f"unsupported audio format: {ext or '(none)'}; supported: {', '.join(sorted(SUPPORTED))}.{hint}", file=sys.stderr)
        return 2

    # Decode with ffmpeg ourselves: faster-whisper's PyAV decoder breaks on newer av releases.
    try:
        pcm = subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-i", args.path, "-f", "f32le", "-ar", "16000", "-ac", "1", "-"],
            check=True,
            capture_output=True,
        ).stdout
    except FileNotFoundError:
        print("ffmpeg not found on PATH", file=sys.stderr)
        return 3
    except subprocess.CalledProcessError as error:
        print(f"ffmpeg failed: {error.stderr.decode('utf-8', 'replace').strip()}", file=sys.stderr)
        return 3

    import numpy as np
    from faster_whisper import WhisperModel

    audio = np.frombuffer(pcm, dtype=np.float32)
    model = WhisperModel(args.model, compute_type="int8")
    segments, info = model.transcribe(audio, language=args.language, vad_filter=True)
    result = {
        "language": info.language,
        "duration": round(info.duration, 2),
        "segments": [
            {"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()}
            for s in segments
        ],
    }

    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

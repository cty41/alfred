---
name: audio-transcribe
description: "Use when the user asks to transcribe, read out, or translate an audio recording (录音、语音转文字、听写、音频翻译) — run the bundled local faster-whisper script, proofread the transcript, and deliver a full-text translation."
---

# Audio Transcribe

Turn a local audio recording into a proofread transcript plus a coherent full-text translation, using a bundled offline script.

## Quick Reference

| Situation | Action |
|---|---|
| Audio path given | Run the bundled script, then proofread |
| Language stated by the user | Pass `--language <code>` |
| Long recording or slow machine | Default `medium`; offer `small` for speed, `large-v3` for accuracy |
| Translation requested or implied | Full-text translation following the original paragraphs |
| Side-by-side table | Only when the user explicitly asks |
| Saving | Only when asked; confirm the path first |

## When to use

- The user shares an audio file (m4a, mp3, wav, aac, ogg, opus, flac, amr, mp4, webm) and wants its words.
- The user wants a recording translated, summarized after transcription, or checked for language errors.

Do not trigger for live dictation or for audio the user has not provided as a local file.

## Workflow

### Step 1: Transcribe

Requires `uv` and `ffmpeg` on PATH. Run from any directory:

```powershell
uv run --quiet <this-skill-dir>/scripts/transcribe.py "<audio path>" [--language en] [--model small|medium|large-v3]
```

The script prints JSON `{language, duration, segments:[{start,end,text}]}` to stdout. The first run downloads the model (medium is about 1.5 GB); warn the user that it can take several minutes. On failure, report the script's stderr; if `uv` or `ffmpeg` is missing, tell the user which one to install.

### Step 2: Proofread

- Keep the speaker's original wording; do not silently fix grammar.
- Mark likely mis-hearings inferred from context as `[guess]` and unintelligible parts as `[?]`.
- Merge fragments into natural sentences and paragraphs.

### Step 3: Translate and present

Unless the user asks otherwise, translate into Chinese (or into English when the source is Chinese) and present:

1. the proofread original text;
2. a coherent full-text translation that follows the original paragraphs, rendering `[guess]` content naturally;
3. optional notes, such as grammar suggestions, in a separate section only when useful.

### Step 4: Save on request

Save as Markdown only when the user asks. Confirm the target path; never write next to the source recording without confirmation.

## Anti-patterns

| Wrong | Correct | Reason |
|---|---|---|
| Correct the speaker's grammar in the transcript | Keep the original; list suggestions separately | Preserves the record |
| Default to a sentence-by-sentence table | Full-text translation | Reads as prose |
| Present guesses as certain | Mark `[guess]` / `[?]` | Honest about ASR limits |
| Install `uv` or `ffmpeg` silently | Tell the user what is missing | Software installs need consent |

## Checklist

- [ ] Script ran and returned JSON, or its error was reported
- [ ] Transcript keeps original wording with uncertain parts marked
- [ ] Full-text translation provided in the requested language
- [ ] Files written only after the user asked and confirmed the path

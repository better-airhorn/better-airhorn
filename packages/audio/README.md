# `@better-airhorn/audio`

Thin wrappers around `ffmpeg` and `ffprobe`, used by voicenode. Both binaries must be on `PATH`, built with libopus
and libmp3lame (the voicenode image copies them from `mwader/static-ffmpeg`).

| Function                                                  | Does                                                                                                                                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `convertToOpus(input, output, trim?)`                     | Converts any audio file to 48 kHz stereo Ogg/Opus at 96 kbit/s, loudness-normalised (`loudnorm` I=-16, TP=-1.5, LRA=11). The optional `startMs`/`endMs` trim is applied first; metadata and video are dropped. |
| `probeDurationMs(path)`                                   | Duration in milliseconds; rejects when the file is not readable media.                                                                                                                                         |
| `encodeMp3Clip(input, { startMs, durationMs, maxBytes })` | Cuts a clip as mp3 for Discord's built-in soundboard, lowering the bitrate (192 → 32 kbit/s) until it fits `maxBytes`; rejects with a `RangeError` when `startMs` is past the end.                             |

Sounds are stored as Ogg/Opus because Discord voice plays it without transcoding and it is small on disk.

`bun test packages/audio` converts the samples in `test/testfiles` (see its `LICENSE`).

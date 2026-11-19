# Audio QA — Wukong 3-chapter build

## Measured (ffmpeg ebur128)

| Asset | Integrated | True peak |
|---|---:|---:|
| BGM battle.mp3 (original 64s loop) | -12.7 LUFS | -1.4 dBFS |
| Voice start.wav (after normalization) | -15.9 LUFS | +0.1 dBFS |
| Voice boss-intro.wav | -15.0 LUFS | 0.0 dBFS |
| Ambience fire.mp3 | -37.9 LUFS | -9.5 dBFS |

## Mix chain

- All buses -> Gain(0.58) -> Limiter(-1 dBFS) -> destination
- BGM player -15 dB; combat duck -21 dB, restores -15 dB
- Voice player 0 dB, source normalized around -16 LUFS
- Ambience player -20 dB, -20 dB below dialogue
- SFX player -5 dB
- BGM / voice / ambience are crossfaded on chapter change and pause.

## Caveats

- Headless Chrome cannot audition sound; these are file and bus measurements, not human listening.
- Voice remains TTS (Edge Yunjian), not an actor. No claim of actor-level performance.
- A human must still check: dialogue intelligibility over boss phase, no clipping on laptop speakers, ambience not masking cues.

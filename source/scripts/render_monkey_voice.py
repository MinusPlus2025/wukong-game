"""Render Mandarin character lines offline with praat-parselmouth, NumPy and FFmpeg."""
from pathlib import Path
import subprocess
import tempfile
import numpy as np
import parselmouth as pm
from parselmouth.praat import call

root = Path(__file__).resolve().parents[1] / "public/audio"
# Formant ratio, median pitch ratio, time ratio, phrase contour (semitones).
roles = {
    "start": (1.10, 1.18, .94, (0, 2, -1, 1)),
    "boss-intro": (1.09, 1.15, .95, (1, 2, -1, -3)),
    "combo": (1.10, 1.16, .92, (0, 2, 1, -2)),
    "heavy": (1.04, 1.06, .96, (2, 1, -2, -4)),
    "dodge": (1.11, 1.18, .90, (0, 2, 1, -1)),
    "ding": (1.08, 1.16, .96, (2, 1, 0, -2)),
    "fan": (1.09, 1.16, .94, (0, 2, 1, -2)),
    "phase": (1.06, 1.12, 1.0, (-1, 1, 2, -2)),
    "victory": (1.11, 1.18, .94, (2, -1, 3, -2)),
    "low-hp": (1.05, 1.06, 1.05, (-2, -1, 1, -3)),
    "death": (1.04, 1.05, 1.07, (0, 1, -2, -4)),
    "choice": (1.08, 1.12, 1.0, (0, 2, -1, 1)),
    "ending-good": (1.07, 1.08, 1.03, (0, 1, 0, -2)),
    "ending-bad": (1.05, 1.05, 1.04, (0, -1, 1, -3)),
}
out = root / "monkey-voice"
out.mkdir(exist_ok=True)
for key, (resonance, register, duration, contour) in roles.items():
    group = "staff-performance" if key in ("start", "boss-intro", "heavy") else "battle-voices"
    source = pm.Sound(str(root / group / (key + ".wav")))
    pitch = source.to_pitch(pitch_floor=65, pitch_ceiling=500)
    median = call(pitch, "Get quantile", 0, 0, .5, "Hertz")
    shifted = call([source, pitch], "Change gender", resonance, median * register, 1, duration)
    manip = call(shifted, "To Manipulation", .01, 65, 550)
    tier = call(manip, "Extract pitch tier")
    count = call(tier, "Get number of points")
    times = np.array([call(tier, "Get time from index", i + 1) for i in range(count)])
    values = [call(tier, "Get value at index", i + 1) for i in range(count)]
    if count > 1:
        bends = np.interp(times, np.linspace(times[0], times[-1], 4), contour)
        call(tier, "Remove points between", 0, shifted.duration)
        for t, value, bend in zip(times, values, bends):
            call(tier, "Add point", t, value * 2**(bend / 12))
        call([tier, manip], "Replace pitch tier")
    rendered = call(manip, "Get resynthesis (overlap-add)")
    with tempfile.TemporaryDirectory() as folder:
        dry = Path(folder) / "dry.wav"
        rendered.scale_peak(.85)
        rendered.save(str(dry), "WAV")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(dry), "-af",
                        "equalizer=f=2300:t=q:w=1.1:g=1.4,loudnorm=I=-18:TP=-2:LRA=8",
                        "-ar", "48000", "-ac", "1", str(out / (key + ".wav"))], check=True)

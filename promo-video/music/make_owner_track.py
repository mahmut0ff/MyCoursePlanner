"""
SabakHub «для владельца» — soundtrack + sound design, synthesized from scratch.

120 BPM, 4/4. The video runs at 60 fps → 1 beat = 30 frames, 1 bar = 120.
Music sections are hard-coded below; every UI sound (clicks, the approval
stamp, the WhatsApp chime, coins, blips) is read from src/owner/cues.json —
the same file the Remotion scenes read — so picture and sound share one clock.

Sections (0-based bars):
   0-1   hook        filtered groove opening up, chord stab on every cut
   2     logo        impact, riser + snare roll
   3-12  drop A      finance + payroll
  13-16  breakdown   reminders: pads, clock ticks, no kick
  17-25  drop B      control + migration, lead on top
  26-27  outro drop  impact, full groove
  28-30  tail        final chord ringing out
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
rng = np.random.default_rng(11)

ROOT = Path(__file__).resolve().parent.parent
CUES = json.loads((ROOT / 'src' / 'owner' / 'cues.json').read_text(encoding='utf-8'))
BARS = CUES['bars']
N = int(SR * BARS * BAR)  # exactly the composition length, so the fade-out ends on its last frame


def t_of(bar, beat=0.0):
    return (bar * 4 + beat) * BEAT


def idx(sec):
    return int(round(sec * SR))


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR / 2 - 100), 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR / 2 - 100)], 'band', fs=SR, output='sos'), x)


def add(buf, sig, start_sec, gain=1.0):
    i = idx(start_sec)
    if i < 0:
        sig = sig[-i:]
        i = 0
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def svf(x, fc, q=0.8, mode='lp'):
    """Zavalishin TPT state-variable filter with a per-sample cutoff array —
    sweeps stay click-free (block-wise filtering resets state at each seam)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    out = np.empty_like(x)
    ic1 = ic2 = 0.0
    for i in range(len(x)):
        v3 = x[i] - ic2
        v1 = a1[i] * ic1 + a2[i] * v3
        v2 = ic2 + a2[i] * ic1 + a3[i] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[i] = v2 if mode == 'lp' else v1
    return out


def saw(freq, dur, detune_cents=0.0, phase=None):
    t = np.arange(int(dur * SR)) / SR
    f = freq * 2 ** (detune_cents / 1200)
    ph = rng.random() if phase is None else phase
    out = np.zeros_like(t)
    k = 1
    while f * k < 10000 and k < 48:
        out += np.sin(2 * np.pi * (f * k * t + ph * k)) / k
        k += 1
    return out * 0.55


def adsr(n, a, d, s, r):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate([np.linspace(0, 1, a_n, endpoint=False), np.linspace(1, s, d_n, endpoint=False),
                        np.full(s_n, s), np.linspace(s, 0, r_n)])[:n]
    env = np.zeros(n)
    env[: len(e)] = e
    return env


def bell(freq, dur, bright=1.0, decay=3.0):
    t = np.arange(int(dur * SR)) / SR
    mod = np.sin(2 * np.pi * freq * 3.5 * t) * 1.3 * bright * np.exp(-t * 7)
    tone = np.sin(2 * np.pi * freq * t + mod) + 0.25 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t * 5)
    return tone * np.exp(-t * decay) * np.minimum(1, t * 400)


# ── harmony: i – VI – III – VII in D minor (Dm9 · B♭maj9 · Fadd9 · Cadd9) ────
CHORDS = [
    dict(root=38, pad=[53, 57, 60, 64]),   # Dm9  (F A C E over D)
    dict(root=34, pad=[53, 57, 60, 62]),   # B♭maj9 (F A C D over B♭)
    dict(root=41, pad=[53, 57, 60, 67]),   # Fadd9
    dict(root=36, pad=[55, 60, 62, 64]),   # Cadd9
]


def chord(bar):
    return CHORDS[bar % 4]


HOOK = range(0, 2)
LOGO = 2
DROP_A = range(3, 13)
BREAK = range(13, 17)
DROP_B = range(17, 26)
OUTRO_DROP = range(26, 28)
TAIL = range(28, 31)
FULL = set(DROP_A) | set(DROP_B) | set(OUTRO_DROP)

pad_L, pad_R = np.zeros(N), np.zeros(N)
pluck_L, pluck_R = np.zeros(N), np.zeros(N)
lead = np.zeros(N)
bass = np.zeros(N)
drums = np.zeros(N)
hook_drums = np.zeros(N)
fx = np.zeros(N)
ui = np.zeros(N)
verb_send = np.zeros(N)

# ── pad ─────────────────────────────────────────────────────────────────────
for bar in range(BARS):
    if bar in HOOK:
        continue
    c = chord(bar)
    dur = BAR + (2.5 if bar == BARS - 3 else 0.6)
    if bar > BARS - 3:
        continue
    n = int(dur * SR)
    env = adsr(n, 0.25 if bar != LOGO else 0.02, 0.4, 0.85, 0.7 if bar != BARS - 3 else 2.4)
    fc = 1400 if bar in BREAK else (900 if bar == LOGO else 2600)
    for note in c['pad']:
        f = midi(note)
        l = saw(f, dur, -8) + saw(f, dur, +4)
        r = saw(f, dur, +8) + saw(f, dur, -4)
        add(pad_L, lp(l * env, fc), t_of(bar), 0.075)
        add(pad_R, lp(r * env, fc), t_of(bar), 0.075)

# ── hook: chord stab on every cut (beats 0, 2, 4, 6) ────────────────────────
def stab(c, dur=0.42):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for note in c['pad'] + [c['pad'][0] + 12]:
        out += saw(midi(note), dur, rng.uniform(-6, 6))
    env = np.exp(-t * 7) * np.minimum(1, t * 500)
    return lp(out * env, 3200)


for b in (0, 2, 4, 6):
    bar = b // 4
    s = stab(chord(bar))
    add(pad_L, s, t_of(0, b), 0.085)
    add(pad_R, s, t_of(0, b), 0.085)
    add(verb_send, s, t_of(0, b), 0.12)

# ── pluck arpeggio (8ths, dotted-8th ping-pong) ─────────────────────────────
ARP = [0, 2, 1, 3, 2, 3, 1, 2]
for bar in range(BARS):
    if bar in HOOK or bar == LOGO or bar >= 29:
        continue
    notes = sorted(chord(bar)['pad'])
    for step in range(8):
        note = notes[ARP[step] % len(notes)] + 12
        f = midi(note)
        dur = 0.4
        t = np.arange(int(dur * SR)) / SR
        tone = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * 2 * f * t) + 0.1 * np.sin(2 * np.pi * 3 * f * t)
        env = np.exp(-t * 10) * np.minimum(1, t * 400)
        sig = lp(tone * env, 4200)
        vel = 0.7 + 0.3 * (step % 2 == 0)
        g = 0.05 if bar in BREAK else 0.045
        add(pluck_L, sig, t_of(bar, step * 0.5), g * vel)
        add(pluck_R, sig, t_of(bar, step * 0.5), g * vel * 0.85)
d = idx(BEAT * 0.75)
for k, gk in enumerate([0.36, 0.22, 0.12]):
    sh = d * (k + 1)
    src = pluck_L.copy() if k % 2 == 0 else pluck_R.copy()
    tgt = pluck_R if k % 2 == 0 else pluck_L
    tgt[sh:] += lp(src[:-sh], 2600) * gk

# ── lead (drop B + outro) ───────────────────────────────────────────────────
MOTIF = [
    [81, None, 77, None, 76, 77, None, 74],
    [77, None, 74, None, 72, 74, None, 70],
    [81, None, 84, None, 81, 79, None, 77],
    [79, None, 76, None, 79, None, 81, None],
]
for bar in list(DROP_B) + list(OUTRO_DROP) + [28]:
    line = MOTIF[bar % 4]
    for step, note in enumerate(line):
        if note is None:
            continue
        f = midi(note)
        dur = 0.9
        b = bell(f, dur, 0.8, 4.0)
        s = lp(saw(f, dur, 5) * np.exp(-np.arange(int(dur * SR)) / SR * 9), 2800)
        add(lead, b * 0.8 + s * 0.35, t_of(bar, step * 0.5), 0.075)

# ── bass ────────────────────────────────────────────────────────────────────
def bass_note(f, dur):
    t = np.arange(int(dur * SR)) / SR
    sub = np.sin(2 * np.pi * f * t)
    body = lp(saw(f, dur, 0, 0.0), 480)
    env = adsr(len(t), 0.005, 0.1, 0.8, 0.04)
    return np.tanh((sub * 0.95 + body * 0.65) * env * 1.5)


for bar in range(BARS):
    f = midi(chord(bar)['root'])
    if bar in HOOK:
        for b in (0, 2):
            add(bass, bass_note(f, BEAT * 1.6), t_of(bar, b), 0.22)
    elif bar == LOGO or bar in BREAK or bar == 28:
        add(bass, bass_note(f, BAR * 0.97), t_of(bar), 0.2)
    elif bar in FULL:
        for b, octave in [(0.5, 0), (1.5, 12), (1.75, 0), (2.5, 0), (3.5, 12)]:
            add(bass, bass_note(f * 2 ** (octave / 12), BEAT * 0.4), t_of(bar, b), 0.23)

# ── drums ───────────────────────────────────────────────────────────────────
def kick():
    dur = 0.4
    t = np.arange(int(dur * SR)) / SR
    freq = 48 + 120 * np.exp(-t * 30)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t * 8)
    click = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 350) * 0.35
    return np.tanh((body + click) * 1.8)


def clap():
    n = int(0.32 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 5000)
    env = np.zeros(n)
    for off in (0, 0.01, 0.021):
        o = idx(off)
        env[o:] += np.exp(-t[: n - o] * 120)
    env += np.exp(-t * 16) * 0.4
    snare_body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30) * 0.5
    return noise * env * 0.5 + snare_body


def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7800, 4) * np.exp(-t * (15 if open_ else 80))


def shaker():
    n = int(0.07 * SR)
    t = np.arange(n) / SR
    return bp(rng.standard_normal(n), 5000, 11000) * np.sin(np.pi * t / t[-1]) ** 2


def crash(dur=2.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 4200, 2) * np.exp(-t * 2.0) * 0.35


def impact():
    t = np.arange(int(2.6 * SR)) / SR
    boom = np.sin(2 * np.pi * (36 + 34 * np.exp(-t * 6)) * t) * np.exp(-t * 2.0)
    out = np.tanh(boom * 1.5) * 0.9
    c = crash(2.6)
    out[: len(c)] += c * 0.6
    return out


def tick(freq):
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return bp(rng.standard_normal(n), freq * 0.8, freq * 1.25) * np.exp(-t * 220) + np.sin(2 * np.pi * freq * t) * np.exp(-t * 300) * 0.3


K, CL, H, HO, SH = kick(), clap(), hat(), hat(True), shaker()
kick_times = []

for bar in range(BARS):
    if bar in HOOK:
        for b in range(4):
            add(hook_drums, K, t_of(bar, b), 0.5)
        for b in range(4):
            add(hook_drums, H, t_of(bar, b + 0.5), 0.25)
        add(hook_drums, CL, t_of(bar, 1), 0.4)
        add(hook_drums, CL, t_of(bar, 3), 0.4)
    if bar in FULL:
        for b in range(4):
            add(drums, K, t_of(bar, b), 0.9)
            kick_times.append(t_of(bar, b))
        for b in (1, 3):
            add(drums, CL, t_of(bar, b), 0.55)
            add(verb_send, CL, t_of(bar, b), 0.22)
        for s16 in range(16):
            accent = 0.26 if s16 % 4 == 2 else (0.09 if s16 % 2 else 0.12)
            add(drums, H, t_of(bar, s16 * 0.25), accent)
        if bar >= 7:
            for b in range(4):
                add(drums, HO, t_of(bar, b + 0.5), 0.1)
        if bar in DROP_B:
            for s16 in range(16):
                add(drums, SH, t_of(bar, s16 * 0.25), 0.05 + 0.04 * (s16 % 2))
    if bar in BREAK:
        for e in range(8):
            add(drums, tick(3400 if e % 2 == 0 else 2500), t_of(bar, e * 0.5), 0.24 if e % 2 == 0 else 0.16)
    if bar == 28:
        add(drums, K, t_of(bar), 0.9)

# hook filter: the groove opens from muffled to full over two bars
cut_hi = idx(t_of(2))
frac = np.arange(cut_hi) / cut_hi
hook_drums[:cut_hi] = svf(hook_drums[:cut_hi], 300 + 7000 * frac ** 2.2, q=0.9)
drums += hook_drums
kick_times += [t_of(b, k) for b in HOOK for k in range(4)]

# fills + rolls
for bar in (6, 10, 20, 24):
    for b in (3.5, 3.75):
        add(drums, CL, t_of(bar, b), 0.32)
for bar in (LOGO, 16):
    steps = np.concatenate([np.arange(0, 2, 0.5), np.arange(2, 3, 0.25), np.arange(3, 4, 0.125)])
    for i, s in enumerate(steps):
        add(drums, CL, t_of(bar, s), 0.1 + 0.38 * i / len(steps))

for bar in (3, 7, 13, 17, 21):
    add(fx, crash(), t_of(bar), 0.5)
for bar in (LOGO, 26):
    add(fx, impact(), t_of(bar), 0.85)
    add(verb_send, impact(), t_of(bar), 0.25)


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = svf(rng.standard_normal(n), 400 + 8000 * (t / dur) ** 2, q=1.4, mode='bp')
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (t / dur * 2)) / SR) * 0.12
    return (out * 0.5 + tone) * (t / dur) ** 2


add(fx, riser(BAR), t_of(LOGO), 0.4)
add(fx, riser(BAR), t_of(16), 0.4)
add(fx, riser(BAR), t_of(25), 0.28)

# ── UI sound design from cues.json ─────────────────────────────────────────
def whoosh(dur=0.5, soft=False):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = svf(rng.standard_normal(n), 600 + 5000 * np.sin(np.pi * t / dur) ** 1.5, q=1.2, mode='bp')
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return out * env * (0.5 if soft else 0.9)


def click():
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return (hp(rng.standard_normal(n), 3000) * np.exp(-t * 900) * 0.6
            + np.sin(2 * np.pi * 1700 * t) * np.exp(-t * 120) * 0.35)


def stamp():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    thud = np.sin(2 * np.pi * (60 + 90 * np.exp(-t * 40)) * t) * np.exp(-t * 14)
    slap = lp(rng.standard_normal(n), 1500) * np.exp(-t * 60) * 0.7
    return np.tanh((thud + slap) * 1.6)


def chime():
    a = bell(midi(83), 1.2, 0.6, 5)       # B5
    b = bell(midi(88), 1.2, 0.6, 4)       # E6
    out = np.zeros(int(1.4 * SR))
    out[: len(a)] += a
    o = idx(0.11)
    out[o:o + len(b)] += b[: len(out) - o]
    return out * 0.6


def coin():
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f, g, dcy in [(2093, 1, 6), (2637, 0.7, 7), (3322, 0.5, 9), (4186, 0.35, 11), (5274, 0.2, 14)]:
        out += np.sin(2 * np.pi * f * t) * g * np.exp(-t * dcy)
    second = np.zeros(n)
    o = idx(0.07)
    second[o:] = out[: n - o] * 0.7
    return (out + second) * np.minimum(1, t * 800) * 0.3


def ping():
    return bell(midi(86), 1.0, 0.4, 5) * 0.5


def blip(semi):
    f = midi(86 + semi)
    n = int(0.18 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 26) * np.minimum(1, t * 600) * 0.4


def pop_():
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 500 + 900 * np.exp(-t * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 30) * 0.45


for cue in CUES['sfx']:
    at = cue['beat'] * BEAT
    kind = cue['type']
    if kind == 'whoosh':
        w = whoosh(0.55)
        add(ui, w, at - 0.42, 0.55)
    elif kind == 'whoosh_soft':
        w = whoosh(0.45, soft=True)
        add(ui, w, at - 0.34, 0.45)
    elif kind == 'click':
        add(ui, click(), at, 0.55)
    elif kind == 'tick':
        add(ui, tick(2900), at, 0.4)
    elif kind == 'ping':
        add(ui, ping(), at, 0.6)
        add(verb_send, ping(), at, 0.2)
    elif kind == 'stamp':
        add(ui, stamp(), at, 0.8)
    elif kind == 'chime':
        add(ui, chime(), at, 0.7)
        add(verb_send, chime(), at, 0.25)
    elif kind == 'coin':
        add(ui, coin(), at, 0.7)
        add(verb_send, coin(), at, 0.2)
    elif kind == 'blip':
        add(ui, blip(cue.get('pitch', 0)), at, 0.5)
        add(verb_send, blip(cue.get('pitch', 0)), at, 0.2)
    elif kind == 'pop':
        add(ui, pop_(), at, 0.5)

# ── sidechain ───────────────────────────────────────────────────────────────
duck = np.ones(N)
dn = idx(0.3)
shape = 1 - 0.62 * np.exp(-np.arange(dn) / SR * 12)
for kt in kick_times:
    i = idx(kt)
    j = min(N, i + dn)
    duck[i:j] = np.minimum(duck[i:j], shape[: j - i])
pad_L *= duck
pad_R *= duck
bass *= duck ** 0.8
pluck_L *= duck ** 0.5
pluck_R *= duck ** 0.5

# ── reverb ──────────────────────────────────────────────────────────────────
ir_len = int(2.4 * SR)
ti = np.arange(ir_len) / SR
ir_L = lp(rng.standard_normal(ir_len), 5200) * np.exp(-ti * 2.8)
ir_R = lp(rng.standard_normal(ir_len), 5200) * np.exp(-ti * 2.8)
ir_L /= np.sqrt(np.sum(ir_L ** 2))
ir_R /= np.sqrt(np.sum(ir_R ** 2))
send = verb_send + (pad_L + pad_R) * 0.22 + (pluck_L + pluck_R) * 0.3 + lead * 0.55
rev_L = fftconvolve(send, ir_L)[:N] * 0.33
rev_R = fftconvolve(send, ir_R)[:N] * 0.33

# ── mix ─────────────────────────────────────────────────────────────────────
drums *= 0.66
for bus in (pluck_L, pluck_R):
    bus *= 2.2
lead *= 1.5
ui *= 1.0
lead_L = lead * 0.9
lead_R = np.concatenate([np.zeros(idx(0.011)), lead])[:N] * 0.9
L = pad_L + pluck_L + lead_L + bass + drums + fx + rev_L + ui * 0.95
R = pad_R + pluck_R + lead_R + bass + drums + fx + rev_R + ui * 0.95

a, b = idx(t_of(3)), idx(t_of(13))
for name, bus in [('pad', pad_L), ('pluck', pluck_L), ('lead', lead), ('bass', bass), ('drums', drums), ('ui', ui), ('rev', rev_L)]:
    print(f'{name:6s} dropA rms {np.sqrt(np.mean(bus[a:b] ** 2)):.4f}')

L, R = hp(L, 28), hp(R, 28)
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L, R = L / peak * 1.6, R / peak * 1.6
L, R = np.tanh(L) / np.tanh(1.6), np.tanh(R) / np.tanh(1.6)
fo = idx(3.0)
L[-fo:] *= np.linspace(1, 0, fo) ** 2
R[-fo:] *= np.linspace(1, 0, fo) ** 2
fi = idx(0.02)
L[:fi] *= np.linspace(0, 1, fi)
R[:fi] *= np.linspace(0, 1, fi)
stereo = np.stack([L, R], axis=1) * 0.89

out_path = sys.argv[1] if len(sys.argv) > 1 else 'music-owner.wav'
wavfile.write(out_path, SR, (stereo * 32767).astype(np.int16))
print(f'wrote {out_path}: {N / SR:.1f}s')

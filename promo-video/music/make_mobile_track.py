"""
SabakHub «в телефоне» — soundtrack + UI sound design, synthesized from scratch.

120 BPM, 4/4, but the drums play HALF-TIME (clap on beat 3), so the film feels
like a calm 60 BPM while every cut still lands on a 2-second bar. 60 fps →
1 beat = 30 frames, 1 bar = 120. Sections and every UI sound are read from
src/mobile/cues.json — the same file the Remotion scenes read.

Sections (0-based bars):
   0-1   hook        pad swell + arpeggio, no drums
   2-3   home        groove enters softly (kick + hats, no clap)
   4-16  modules     full half-time groove, keys comping
  17-19  exam        breakdown — no kick, soft ticks, pad opens up
  20-27  modules     groove + bell lead
  28     outro hit   soft impact, final chord
  29-30  tail        chord rings out
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
rng = np.random.default_rng(23)

ROOT = Path(__file__).resolve().parent.parent
CUES = json.loads((ROOT / 'src' / 'mobile' / 'cues.json').read_text(encoding='utf-8'))
BARS = CUES['bars']
N = int(SR * BARS * BAR)  # exactly the composition length, so the fade-out ends on its last frame
SEC = CUES['sections']


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


def ep(freq, dur, decay=2.2):
    """Soft electric-piano tone: sine + a little 2nd/3rd harmonic, slow decay."""
    t = np.arange(int(dur * SR)) / SR
    tone = (np.sin(2 * np.pi * freq * t)
            + 0.35 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t * 4)
            + 0.12 * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t * 6))
    return tone * np.exp(-t * decay) * np.minimum(1, t * 300)


# ── harmony: I – V – vi – IV in F major (Fmaj9 · Cadd9 · Dm9 · B♭maj9) ──────
CHORDS = [
    dict(root=41, pad=[57, 60, 64, 67]),   # Fmaj9  (A C E G over F)
    dict(root=36, pad=[55, 60, 62, 64]),   # Cadd9  (G C D E over C)
    dict(root=38, pad=[53, 57, 60, 64]),   # Dm9    (F A C E over D)
    dict(root=34, pad=[53, 57, 60, 62]),   # B♭maj9 (F A C D over B♭)
]


def chord(bar):
    return CHORDS[bar % 4]


HOOK = range(SEC['hook'][0], SEC['hook'][0] + SEC['hook'][1])          # 0-1
SOFT = range(SEC['home'][0], SEC['home'][0] + SEC['home'][1])          # 2-3
BREAK = range(SEC['exam'][0], SEC['exam'][0] + SEC['exam'][1])         # 17-19
GROOVE_A = range(SEC['journal'][0], SEC['exam'][0])                    # 4-16
GROOVE_B = range(SEC['kpi'][0], SEC['outro'][0])                       # 20-27
HIT = SEC['outro'][0]                                                  # 28
FULL = set(GROOVE_A) | set(GROOVE_B)
LEAD_BARS = set(range(12, 17)) | set(GROOVE_B)

pad_L, pad_R = np.zeros(N), np.zeros(N)
pluck_L, pluck_R = np.zeros(N), np.zeros(N)
keys = np.zeros(N)
lead = np.zeros(N)
bass = np.zeros(N)
drums = np.zeros(N)
fx = np.zeros(N)
ui = np.zeros(N)
verb_send = np.zeros(N)

# ── pad ─────────────────────────────────────────────────────────────────────
for bar in range(BARS):
    if bar > HIT:
        continue
    c = chord(bar)
    dur = BAR + (3.0 if bar == HIT else 0.6)
    n = int(dur * SR)
    env = adsr(n, 0.9 if bar in HOOK else 0.3, 0.4, 0.85, 0.7 if bar != HIT else 2.8)
    fc = 1100 if bar in HOOK else (1500 if bar in BREAK else 2200)
    for note in c['pad']:
        f = midi(note)
        l = saw(f, dur, -7) + saw(f, dur, +4)
        r = saw(f, dur, +7) + saw(f, dur, -4)
        add(pad_L, lp(l * env, fc), t_of(bar), 0.07)
        add(pad_R, lp(r * env, fc), t_of(bar), 0.07)

# ── pluck arpeggio (8ths, dotted-8th ping-pong delay) ────────────────────────
ARP = [0, 2, 1, 3, 2, 3, 1, 2]
for bar in range(BARS):
    if bar > HIT:
        continue
    notes = sorted(chord(bar)['pad'])
    for step in range(8):
        if bar in HOOK and step % 2 == 1:
            continue  # quarter notes only while the film opens
        note = notes[ARP[step] % len(notes)] + 12
        f = midi(note)
        dur = 0.45
        t = np.arange(int(dur * SR)) / SR
        tone = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
        env = np.exp(-t * 9) * np.minimum(1, t * 400)
        sig = lp(tone * env, 3800)
        vel = 0.7 + 0.3 * (step % 2 == 0)
        g = 0.05 if bar in BREAK else 0.042
        add(pluck_L, sig, t_of(bar, step * 0.5), g * vel)
        add(pluck_R, sig, t_of(bar, step * 0.5), g * vel * 0.85)
d = idx(BEAT * 0.75)
for k, gk in enumerate([0.36, 0.22, 0.12]):
    sh = d * (k + 1)
    src = pluck_L.copy() if k % 2 == 0 else pluck_R.copy()
    tgt = pluck_R if k % 2 == 0 else pluck_L
    tgt[sh:] += lp(src[:-sh], 2600) * gk

# ── keys comping (half-time: beat 1 and the "and" of 2) ─────────────────────
for bar in range(BARS):
    if bar not in FULL and bar not in SOFT:
        continue
    c = chord(bar)
    for beat_, g in ((0, 1.0), (2.5, 0.7)):
        for note in c['pad']:
            add(keys, ep(midi(note), 1.4), t_of(bar, beat_), 0.05 * g)

# ── lead (bell, sparse) ─────────────────────────────────────────────────────
MOTIF = [
    [81, None, 79, None, 77, None, 79, None],
    [76, None, None, 74, None, 76, None, None],
    [77, None, 81, None, 79, None, 77, None],
    [74, None, 72, None, None, 74, None, None],
]
for bar in range(BARS):
    if bar not in LEAD_BARS and bar != HIT:
        continue
    line = MOTIF[bar % 4] if bar != HIT else [81, None, None, None, None, None, None, None]
    for step, note in enumerate(line):
        if note is None:
            continue
        f = midi(note)
        dur = 1.2 if bar != HIT else 3.0
        bl = bell(f, dur, 0.6, 3.2 if bar != HIT else 1.4)
        add(lead, bl, t_of(bar, step * 0.5), 0.06 if bar != HIT else 0.09)

# ── bass ────────────────────────────────────────────────────────────────────
def bass_note(f, dur):
    t = np.arange(int(dur * SR)) / SR
    sub = np.sin(2 * np.pi * f * t)
    body = lp(saw(f, dur, 0, 0.0), 420)
    env = adsr(len(t), 0.008, 0.1, 0.8, 0.06)
    return np.tanh((sub * 0.95 + body * 0.55) * env * 1.4)


for bar in range(BARS):
    f = midi(chord(bar)['root'])
    if bar in HOOK:
        add(bass, bass_note(f, BAR * 0.95), t_of(bar), 0.16)
    elif bar in BREAK or bar == HIT:
        add(bass, bass_note(f, BAR * 0.97 if bar != HIT else BAR * 2.5), t_of(bar), 0.19)
    elif bar in FULL or bar in SOFT:
        for beat_, octave, length in [(0, 0, 1.4), (2.5, 0, 0.6), (3.5, 12, 0.35)]:
            add(bass, bass_note(f * 2 ** (octave / 12), BEAT * length), t_of(bar, beat_), 0.2)

# ── drums (half-time) ───────────────────────────────────────────────────────
def kick():
    dur = 0.4
    t = np.arange(int(dur * SR)) / SR
    freq = 46 + 110 * np.exp(-t * 28)
    body = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t * 7)
    click = hp(rng.standard_normal(len(t)), 3000) * np.exp(-t * 350) * 0.2
    return np.tanh((body + click) * 1.6)


def snap():
    """Finger-snap / soft clap instead of a hard snare."""
    n = int(0.26 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 1200, 5200)
    env = np.exp(-t * 55) + np.exp(-t * 14) * 0.25
    body = np.sin(2 * np.pi * 210 * t) * np.exp(-t * 40) * 0.35
    return noise * env * 0.45 + body


def hat(open_=False):
    n = int((0.26 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 8000, 4) * np.exp(-t * (13 if open_ else 80))


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
    boom = np.sin(2 * np.pi * (38 + 30 * np.exp(-t * 6)) * t) * np.exp(-t * 2.2)
    out = np.tanh(boom * 1.3) * 0.8
    c = crash(2.6)
    out[: len(c)] += c * 0.45
    return out


def tick(freq):
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    return bp(rng.standard_normal(n), freq * 0.8, freq * 1.25) * np.exp(-t * 220) + np.sin(2 * np.pi * freq * t) * np.exp(-t * 300) * 0.3


K, SN, H, HO, SH = kick(), snap(), hat(), hat(True), shaker()
kick_times = []

for bar in range(BARS):
    groove = bar in FULL
    soft = bar in SOFT
    if groove or soft:
        for beat_ in (0, 2.5):
            add(drums, K, t_of(bar, beat_), 0.8 if groove else 0.55)
            kick_times.append(t_of(bar, beat_))
        if groove:
            add(drums, SN, t_of(bar, 2), 0.6)
            add(verb_send, SN, t_of(bar, 2), 0.3)
        for e in range(8):
            accent = 0.2 if e % 2 == 1 else 0.11
            add(drums, H, t_of(bar, e * 0.5), accent * (1 if groove else 0.6))
        if bar in GROOVE_B or bar >= 12:
            add(drums, HO, t_of(bar, 3.5), 0.1)
        if bar >= 8 and groove:
            for s16 in range(16):
                add(drums, SH, t_of(bar, s16 * 0.25), 0.035 + 0.03 * (s16 % 2))
    if bar in BREAK:
        for e in range(8):
            add(drums, tick(3400 if e % 2 == 0 else 2500), t_of(bar, e * 0.5), 0.2 if e % 2 == 0 else 0.13)
        for e in range(8):
            add(drums, H, t_of(bar, e * 0.5), 0.06)
    if bar == HIT:
        add(drums, K, t_of(bar), 0.85)
        add(drums, SN, t_of(bar), 0.4)

# fills before section changes
for bar in (7, 10, 14, 16, 23, 25):
    for beat_ in (3.5, 3.75):
        add(drums, SN, t_of(bar, beat_), 0.22)

for bar in (SEC['journal'][0], SEC['finance'][0], SEC['kpi'][0], SEC['montage'][0]):
    add(fx, crash(), t_of(bar), 0.32)
add(fx, impact(), t_of(HIT), 0.7)
add(verb_send, impact(), t_of(HIT), 0.2)


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = svf(rng.standard_normal(n), 400 + 7000 * (t / dur) ** 2, q=1.4, mode='bp')
    tone = np.sin(2 * np.pi * np.cumsum(220 * 2 ** (t / dur * 2)) / SR) * 0.1
    return (out * 0.5 + tone) * (t / dur) ** 2


add(fx, riser(BAR), t_of(SEC['kpi'][0] - 1), 0.22)
add(fx, riser(BAR), t_of(SEC['montage'][0] - 1), 0.3)
add(fx, riser(BAR), t_of(HIT - 1), 0.22)

# ── UI sound design from cues.json ─────────────────────────────────────────
def whoosh(dur=0.5, soft=False):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = svf(rng.standard_normal(n), 600 + 5000 * np.sin(np.pi * t / dur) ** 1.5, q=1.2, mode='bp')
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return out * env * (0.45 if soft else 0.8)


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
    a = bell(midi(83), 1.2, 0.6, 5)
    b_ = bell(midi(88), 1.2, 0.6, 4)
    out = np.zeros(int(1.4 * SR))
    out[: len(a)] += a
    o = idx(0.11)
    out[o:o + len(b_)] += b_[: len(out) - o]
    return out * 0.6


def ding():
    return bell(midi(88), 1.3, 0.5, 4) * 0.55


def rec():
    """Two rising sines — the «listening» start sound."""
    out = np.zeros(int(0.5 * SR))
    for i, n in enumerate((79, 86)):
        t = np.arange(int(0.25 * SR)) / SR
        s = np.sin(2 * np.pi * midi(n) * t) * np.exp(-t * 14) * np.minimum(1, t * 600)
        o = idx(0.09 * i)
        out[o:o + len(s)] += s
    return out * 0.4


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


def pop_(semi=0):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    base = 500 * 2 ** (semi / 12)
    f = base + 900 * np.exp(-t * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 30) * 0.45


for cue in CUES['sfx']:
    at = cue['beat'] * BEAT
    kind = cue['type']
    if kind == 'whoosh':
        add(ui, whoosh(0.55), at - 0.42, 0.5)
    elif kind == 'whoosh_soft':
        add(ui, whoosh(0.45, soft=True), at - 0.34, 0.42)
    elif kind == 'click':
        add(ui, click(), at, 0.5)
    elif kind == 'tick':
        add(ui, tick(2900), at, 0.35)
    elif kind == 'ping':
        add(ui, ping(), at, 0.55)
        add(verb_send, ping(), at, 0.2)
    elif kind == 'ding':
        add(ui, ding(), at, 0.6)
        add(verb_send, ding(), at, 0.25)
    elif kind == 'rec':
        add(ui, rec(), at, 0.6)
    elif kind == 'stamp':
        add(ui, stamp(), at, 0.7)
    elif kind == 'chime':
        add(ui, chime(), at, 0.65)
        add(verb_send, chime(), at, 0.25)
    elif kind == 'coin':
        add(ui, coin(), at, 0.65)
        add(verb_send, coin(), at, 0.2)
    elif kind == 'blip':
        add(ui, blip(cue.get('pitch', 0)), at, 0.45)
        add(verb_send, blip(cue.get('pitch', 0)), at, 0.2)
    elif kind == 'pop':
        add(ui, pop_(cue.get('pitch', 0)), at, 0.45)

# ── sidechain (gentle) ──────────────────────────────────────────────────────
duck = np.ones(N)
dn = idx(0.3)
shape = 1 - 0.42 * np.exp(-np.arange(dn) / SR * 12)
for kt in kick_times:
    i = idx(kt)
    j = min(N, i + dn)
    duck[i:j] = np.minimum(duck[i:j], shape[: j - i])
pad_L *= duck
pad_R *= duck
bass *= duck ** 0.7
pluck_L *= duck ** 0.4
pluck_R *= duck ** 0.4
keys *= duck ** 0.5

# ── reverb ──────────────────────────────────────────────────────────────────
ir_len = int(2.6 * SR)
ti = np.arange(ir_len) / SR
ir_L = lp(rng.standard_normal(ir_len), 5000) * np.exp(-ti * 2.6)
ir_R = lp(rng.standard_normal(ir_len), 5000) * np.exp(-ti * 2.6)
ir_L /= np.sqrt(np.sum(ir_L ** 2))
ir_R /= np.sqrt(np.sum(ir_R ** 2))
send = verb_send + (pad_L + pad_R) * 0.22 + (pluck_L + pluck_R) * 0.32 + lead * 0.6 + keys * 0.4
rev_L = fftconvolve(send, ir_L)[:N] * 0.36
rev_R = fftconvolve(send, ir_R)[:N] * 0.36

# ── mix ─────────────────────────────────────────────────────────────────────
drums *= 0.58
for bus in (pluck_L, pluck_R):
    bus *= 2.1
lead *= 1.4
lead_L = lead * 0.9
lead_R = np.concatenate([np.zeros(idx(0.011)), lead])[:N] * 0.9
keys_R = np.concatenate([np.zeros(idx(0.007)), keys])[:N]
L = pad_L + pluck_L + lead_L + keys + bass + drums + fx + rev_L + ui * 0.95
R = pad_R + pluck_R + lead_R + keys_R + bass + drums + fx + rev_R + ui * 0.95

a, b = idx(t_of(4)), idx(t_of(17))
for name, bus in [('pad', pad_L), ('pluck', pluck_L), ('keys', keys), ('lead', lead), ('bass', bass), ('drums', drums), ('ui', ui), ('rev', rev_L)]:
    print(f'{name:6s} groove rms {np.sqrt(np.mean(bus[a:b] ** 2)):.4f}')

L, R = hp(L, 28), hp(R, 28)
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L, R = L / peak * 1.5, R / peak * 1.5
L, R = np.tanh(L) / np.tanh(1.5), np.tanh(R) / np.tanh(1.5)
fo = idx(3.0)
L[-fo:] *= np.linspace(1, 0, fo) ** 2
R[-fo:] *= np.linspace(1, 0, fo) ** 2
fi = idx(0.02)
L[:fi] *= np.linspace(0, 1, fi)
R[:fi] *= np.linspace(0, 1, fi)
stereo = np.stack([L, R], axis=1) * 0.88

out_path = sys.argv[1] if len(sys.argv) > 1 else 'music-mobile.wav'
wavfile.write(out_path, SR, (stereo * 32767).astype(np.int16))
print(f'wrote {out_path}: {N / SR:.1f}s')

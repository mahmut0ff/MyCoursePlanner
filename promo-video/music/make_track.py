"""
SabakHub promo soundtrack — synthesized from scratch (no samples, no licensing).

120 BPM, 4/4 → 1 beat = 0.5 s = 15 frames @ 30 fps, 1 bar = 2 s = 60 frames.
The video timeline (src/timeline.ts) is cut on the same bar grid, so every
scene change lands on a downbeat and every in-scene accent on a beat.

Structure (0-based bars):
   0-3   intro       pad + soft pluck, filter opening
   4-5   logo        impact, half-time kick
   6-7   build       four-on-floor + hats, riser + snare roll into the drop
   8-19  drop A      full groove (schedule, classrooms, branches)
  20-23  breakdown   no kick, pad + pluck + light hats (Telegram AI)
  24-33  drop B      full groove + bell lead (copilot, analytics, montage)
  34-37  outro       impact, pad, final chord ring
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 44100
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
BARS = 38
TAIL = 2.0
N = int(SR * (BARS * BAR + TAIL))
rng = np.random.default_rng(7)


def t_of(bar, beat=0.0):
    return (bar * 4 + beat) * BEAT


def idx(sec):
    return int(round(sec * SR))


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], 'band', fs=SR, output='sos'), x)


def add(buf, sig, start_sec, gain=1.0):
    i = idx(start_sec)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def saw(freq, dur, detune_cents=0.0, phase=None):
    t = np.arange(int(dur * SR)) / SR
    f = freq * 2 ** (detune_cents / 1200)
    ph = rng.random() if phase is None else phase
    # band-limited-ish saw: sum of harmonics below 9 kHz
    out = np.zeros_like(t)
    k = 1
    while f * k < 9000 and k < 40:
        out += np.sin(2 * np.pi * (f * k * t + ph * k)) / k
        k += 1
    return out * 0.55


def adsr(n, a, d, s, r, sustain_len=None):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    env = np.zeros(n)
    s_n = max(0, n - a_n - d_n - r_n) if sustain_len is None else int(sustain_len * SR)
    seg = [np.linspace(0, 1, a_n, endpoint=False), np.linspace(1, s, d_n, endpoint=False),
           np.full(s_n, s), np.linspace(s, 0, r_n)]
    e = np.concatenate(seg)[:n]
    env[: len(e)] = e
    return env


# ── harmony: vi – IV – I – V in C (Am7 · Fmaj7 · Cmaj7 · G6add9) ─────────────
CHORDS = [
    dict(root=45, pad=[57, 60, 64, 67, 71]),   # Am9-ish
    dict(root=41, pad=[53, 57, 60, 64, 67]),   # Fmaj9
    dict(root=48, pad=[55, 59, 60, 64, 74]),   # Cmaj7(9)
    dict(root=43, pad=[55, 59, 62, 64, 69]),   # G6/9
]


def chord(bar):
    return CHORDS[bar % 4]


# ── buses ───────────────────────────────────────────────────────────────────
pad_L, pad_R = np.zeros(N), np.zeros(N)
pluck_L, pluck_R = np.zeros(N), np.zeros(N)
lead = np.zeros(N)
bass = np.zeros(N)
drums = np.zeros(N)
fx = np.zeros(N)
verb_send = np.zeros(N)

# ── pad ─────────────────────────────────────────────────────────────────────
for bar in range(BARS):
    c = chord(bar)
    dur = BAR + 0.6
    n = int(dur * SR)
    env = adsr(n, 0.35, 0.4, 0.8, 0.6)
    for note in c['pad']:
        f = midi(note)
        l = saw(f, dur, -7) + saw(f, dur, +3)
        r = saw(f, dur, +7) + saw(f, dur, -3)
        # filter opens through the intro, then sits warm
        if bar < 4:
            fc = 500 + 1300 * (bar / 4)
        elif 20 <= bar < 24:
            fc = 1500
        else:
            fc = 2300
        add(pad_L, lp(l * env, fc, 2), t_of(bar), 0.085)
        add(pad_R, lp(r * env, fc, 2), t_of(bar), 0.085)

# ── pluck arpeggio (8ths, ping-pong delay) ──────────────────────────────────
ARP = [0, 2, 1, 3, 4, 3, 2, 1]
for bar in range(BARS):
    if bar >= 36:
        break
    c = chord(bar)
    notes = sorted(c['pad'])
    for step in range(8):
        note = notes[ARP[step] % len(notes)] + 12
        f = midi(note)
        dur = 0.45
        t = np.arange(int(dur * SR)) / SR
        tone = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t)
                + 0.12 * np.sin(2 * np.pi * 3 * f * t))
        env = np.exp(-t * 9) * np.minimum(1, t * 400)
        sig = lp(tone * env, 3800)
        vel = 0.75 + 0.25 * (step % 2 == 0)
        g = 0.07 if bar < 4 else 0.06
        st = t_of(bar, step * 0.5)
        add(pluck_L, sig, st, g * vel)
        add(pluck_R, sig, st, g * vel * 0.9)
# ping-pong delay (dotted 8th)
d = idx(BEAT * 0.75)
for k, gk in enumerate([0.38, 0.24, 0.14]):
    sh = d * (k + 1)
    src = pluck_L.copy() if k % 2 == 0 else pluck_R.copy()
    tgt = pluck_R if k % 2 == 0 else pluck_L
    tgt[sh:] += lp(src[:-sh], 2500) * gk

# ── bell lead (drop B) ──────────────────────────────────────────────────────
# 8th-note grid per chord, None = rest
MOTIF = [
    [76, None, 72, None, 74, 76, None, None],
    [72, None, 69, None, 72, 74, None, None],
    [76, None, 79, None, 76, 74, None, 72],
    [74, None, None, 71, None, 74, None, None],
]
for bar in range(24, 34):
    line = MOTIF[bar % 4]
    for step, note in enumerate(line):
        if note is None:
            continue
        f = midi(note)
        dur = 1.2
        t = np.arange(int(dur * SR)) / SR
        mod = np.sin(2 * np.pi * f * 3.5 * t) * 1.2 * np.exp(-t * 6)
        tone = np.sin(2 * np.pi * f * t + mod) + 0.2 * np.sin(2 * np.pi * 2 * f * t)
        env = np.exp(-t * 3.2) * np.minimum(1, t * 300)
        add(lead, tone * env, t_of(bar, step * 0.5), 0.07)

# ── bass ────────────────────────────────────────────────────────────────────
def bass_note(f, dur, gain):
    t = np.arange(int(dur * SR)) / SR
    sub = np.sin(2 * np.pi * f * t)
    body = lp(saw(f, dur, 0, 0.0), 420)
    env = adsr(len(t), 0.006, 0.12, 0.75, 0.05)
    return np.tanh((sub * 0.9 + body * 0.6) * env * 1.4) * gain


for bar in range(4, 36):
    f = midi(chord(bar)['root'])
    if 20 <= bar < 24 or bar < 8:
        # long sustained notes in breakdown / build
        add(bass, bass_note(f, BAR * 0.98, 1), t_of(bar), 0.20)
    else:
        # house offbeat + push: x . x x | . x . x
        for b in [0.5, 1.5, 1.75, 2.5, 3.5]:
            add(bass, bass_note(f, BEAT * 0.42, 1), t_of(bar, b), 0.24)

# ── drums ───────────────────────────────────────────────────────────────────
def kick():
    dur = 0.42
    t = np.arange(int(dur * SR)) / SR
    freq = 46 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(freq) / SR
    body = np.sin(ph) * np.exp(-t * 7.5)
    click = hp(rng.standard_normal(len(t)), 2500) * np.exp(-t * 300) * 0.25
    return np.tanh((body + click) * 1.6)


def clap():
    dur = 0.35
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 4200)
    env = np.zeros(n)
    for off in [0, 0.011, 0.022]:
        o = idx(off)
        env[o:] += np.exp(-(t[: n - o]) * 120)
    env += np.exp(-t * 18) * 0.35
    return noise * env * 0.5


def hat(open_=False):
    dur = 0.25 if open_ else 0.06
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = hp(rng.standard_normal(n), 7500, 4)
    return noise * np.exp(-t * (14 if open_ else 70))


def crash():
    dur = 2.4
    n = int(dur * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 4000, 2) * np.exp(-t * 2.2) * 0.35


def impact():
    dur = 2.5
    t = np.arange(int(dur * SR)) / SR
    boom = np.sin(2 * np.pi * (38 + 30 * np.exp(-t * 6)) * t) * np.exp(-t * 2.2)
    c = crash()
    out = np.tanh(boom * 1.4) * 0.9
    out[: len(c)] += c * 0.6
    return out


K, C, H, HO = kick(), clap(), hat(), hat(True)
kick_times = []

for bar in range(BARS):
    full = 8 <= bar < 20 or 24 <= bar < 34
    if bar in (4, 5):
        for b in [0, 2.5]:
            add(drums, K, t_of(bar, b), 0.75)
            kick_times.append(t_of(bar, b))
    if bar in (6, 7) or full:
        for b in range(4):
            add(drums, K, t_of(bar, b), 0.85)
            kick_times.append(t_of(bar, b))
    if full or bar == 7:
        for b in (1, 3):
            add(drums, C, t_of(bar, b), 0.55)
            add(verb_send, C, t_of(bar, b), 0.25)
    if bar >= 6 and bar < 34:
        for b in range(4):
            add(drums, H, t_of(bar, b + 0.5), 0.22 if bar < 8 else 0.28)
        if full:
            for b in range(4):
                add(drums, H, t_of(bar, b + 0.25), 0.07)
                add(drums, H, t_of(bar, b + 0.75), 0.09)
        if bar in range(20, 24):
            for b in range(4):
                add(drums, H, t_of(bar, b), 0.08)
    if bar in (32, 33):
        # montage: open hat on every offbeat for lift
        for b in range(4):
            add(drums, HO, t_of(bar, b + 0.5), 0.14)

# fills: little clap flam before every 4-bar phrase inside the drops
for bar in (11, 15, 27, 31):
    for b in (3.5, 3.75):
        add(drums, C, t_of(bar, b), 0.3)

# snare roll into drops
for bar in (7, 23):
    steps = np.concatenate([np.arange(0, 2, 0.5), np.arange(2, 3, 0.25), np.arange(3, 4, 0.125)])
    for i, s in enumerate(steps):
        add(drums, C, t_of(bar, s), 0.12 + 0.35 * i / len(steps))

# crashes / impacts at section heads
for bar in (8, 24, 12, 16, 28, 32):
    add(fx, crash(), t_of(bar), 0.55)
for bar in (4, 34):
    add(fx, impact(), t_of(bar), 0.85)
    add(verb_send, impact(), t_of(bar), 0.3)


# risers (noise sweep + rising tone) over 2 bars
def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    hop = 2048
    for i in range(0, n, hop):
        frac = i / n
        fc = 400 + 7000 * frac ** 2
        seg = noise[i:i + hop]
        out[i:i + hop] = bp(seg, fc * 0.7, min(fc * 1.3, 18000), 1)
    tone_f = 200 * 2 ** (t / dur * 2)
    tone = np.sin(2 * np.pi * np.cumsum(tone_f) / SR) * 0.15
    env = (t / dur) ** 2
    return (out * 0.5 + tone) * env


for bar in (6, 22, 32):
    add(fx, riser(BAR * 2), t_of(bar), 0.35)
# whooshes for scene changes inside drops (half-bar reverse noise)
for bar in (12, 16, 20, 28):
    n = int(BEAT * 2 * SR)
    t = np.arange(n) / SR
    w = bp(rng.standard_normal(n), 1500, 9000, 1) * (t / t[-1]) ** 3
    add(fx, w, t_of(bar) - BEAT * 2, 0.18)

# ── sidechain (pump) on pad, pluck, bass ────────────────────────────────────
duck = np.ones(N)
dn = idx(0.32)
shape = 1 - 0.6 * np.exp(-np.arange(dn) / SR * 11)
for kt in kick_times:
    i = idx(kt)
    j = min(N, i + dn)
    duck[i:j] = np.minimum(duck[i:j], shape[: j - i])
pad_L *= duck
pad_R *= duck
bass *= duck ** 0.8
pluck_L *= duck ** 0.5
pluck_R *= duck ** 0.5

# ── reverb (convolution with decaying-noise IR) ─────────────────────────────
ir_len = int(2.6 * SR)
ti = np.arange(ir_len) / SR
ir_L = lp(rng.standard_normal(ir_len), 5000) * np.exp(-ti * 2.6)
ir_R = lp(rng.standard_normal(ir_len), 5000) * np.exp(-ti * 2.6)
ir_L /= np.sqrt(np.sum(ir_L ** 2))
ir_R /= np.sqrt(np.sum(ir_R ** 2))
send = verb_send + (pad_L + pad_R) * 0.25 + (pluck_L + pluck_R) * 0.35 + lead * 0.6
rev_L = fftconvolve(send, ir_L)[:N] * 0.35
rev_R = fftconvolve(send, ir_R)[:N] * 0.35

# ── mix ─────────────────────────────────────────────────────────────────────
# Balance (measured bus RMS in drop A: drums 0.28, bass 0.11, pad 0.10,
# pluck 0.017) — pull drums back, push the pluck hook forward, lift the intro.
drums *= 0.68
for bus in (pluck_L, pluck_R):
    bus *= 2.3
lead *= 1.6
intro = idx(t_of(4))
for bus in (pad_L, pad_R, pluck_L, pluck_R, rev_L, rev_R):
    bus[:intro] *= 1.8
lead_L = lead * 0.9
lead_R = np.concatenate([np.zeros(idx(0.012)), lead])[:N] * 0.9
L = pad_L + pluck_L + lead_L + bass + drums + fx + rev_L
R = pad_R + pluck_R + lead_R + bass + drums + fx + rev_R

# gentle master: low-cut, glue, soft clip, fades
L, R = hp(L, 28), hp(R, 28)
peak = max(np.max(np.abs(L)), np.max(np.abs(R)))
L, R = L / peak * 1.5, R / peak * 1.5
L, R = np.tanh(L) / np.tanh(1.5), np.tanh(R) / np.tanh(1.5)
fade_in = idx(0.05)
L[:fade_in] *= np.linspace(0, 1, fade_in)
R[:fade_in] *= np.linspace(0, 1, fade_in)
fo = idx(2.5)
L[-fo:] *= np.linspace(1, 0, fo) ** 2
R[-fo:] *= np.linspace(1, 0, fo) ** 2
stereo = np.stack([L, R], axis=1) * 0.89

out = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
wavfile.write(out, SR, (stereo * 32767).astype(np.int16))
print(f'wrote {out}: {N / SR:.1f}s')




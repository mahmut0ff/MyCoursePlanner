import { loadFont as loadUnbounded } from '@remotion/google-fonts/Unbounded';
import { loadFont as loadGolos } from '@remotion/google-fonts/GolosText';
import { Easing, interpolate, spring } from 'remotion';

// Brand layer from tailwind.config.js: warm paper/ink landing palette,
// indigo-600 primary and the teal node from the logo. Accents are muted
// so the whole film reads as one calm, warm system — no neon.
export const C = {
  paper: '#F7F5F0',
  paperDeep: '#EFECE4',
  card: '#FFFFFF',
  line: '#E2DDD2',
  ink: '#16141F',
  inkSoft: '#5B5768',
  inkMute: '#8D8898',
  night: '#16141F',
  nightCard: '#221F2E',
  nightLine: '#34303F',
  indigo: '#4F46E5',
  indigoDeep: '#3730A3',
  indigoSoft: '#E6E4FB',
  violet: '#7C3AED',
  teal: '#14B8A6',
  tealDeep: '#0E8C7E',
  tealSoft: '#D7F1EC',
  amber: '#D9962B',
  amberSoft: '#F6E8CC',
  coral: '#D9674E',
  coralSoft: '#F7DDD5',
  plum: '#9A6BBF',
  plumSoft: '#EEE3F5',
};

export const { fontFamily: DISPLAY } = loadUnbounded('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['cyrillic', 'latin'],
});
export const { fontFamily: BODY } = loadGolos('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['cyrillic', 'latin'],
});

// 120 BPM @ 30 fps → one beat is exactly 15 frames, one bar 60.
export const FPS = 30;
export const BEAT = 15;
export const BAR = 60;
export const beat = (n: number) => Math.round(n * BEAT);

const OUT = Easing.bezier(0.16, 1, 0.3, 1);
const IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

/** 0→1 eased progress between `at` and `at + dur`. */
export const ease = (frame: number, at: number, dur: number, curve: 'out' | 'inOut' | 'in' = 'out') =>
  interpolate(frame, [at, at + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: curve === 'out' ? OUT : curve === 'inOut' ? IN_OUT : Easing.bezier(0.5, 0, 0.75, 0),
  });

/** Physical pop with a little overshoot — for things that land on a beat. */
export const pop = (frame: number, at: number, bouncy = true) =>
  spring({
    frame: frame - at,
    fps: FPS,
    config: bouncy ? { damping: 13, stiffness: 190, mass: 0.6 } : { damping: 200, stiffness: 160 },
  });

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Fade/slide a whole scene out over its last frames. */
export const exitStyle = (frame: number, duration: number, len = 10): React.CSSProperties => {
  const t = ease(frame, duration - len, len, 'in');
  return { opacity: 1 - t, transform: `scale(${1 - 0.03 * t}) translateY(${-24 * t}px)` };
};

export const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/,/g, ' ');

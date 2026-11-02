import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { BAR, C, ease } from './theme';
import { BrandBug, Grain, Paper } from './components/ui';
import { S1Intro } from './scenes/S1Intro';
import { S2Logo } from './scenes/S2Logo';
import { S3Modules } from './scenes/S3Modules';
import { S4Schedule } from './scenes/S4Schedule';
import { S5Classrooms } from './scenes/S5Classrooms';
import { S6Branches } from './scenes/S6Branches';
import { S7Telegram } from './scenes/S7Telegram';
import { S8Copilot } from './scenes/S8Copilot';
import { S9Analytics } from './scenes/S9Analytics';
import { S10Montage } from './scenes/S10Montage';
import { S11Outro } from './scenes/S11Outro';

// Cut list on the soundtrack's bar grid (music/make_track.py) — every scene
// starts on a downbeat. [startBar, bars]
const CUTS = {
  intro: [0, 4],
  logo: [4, 2],
  modules: [6, 2],
  schedule: [8, 4],
  rooms: [12, 4],
  branches: [16, 4],
  telegram: [20, 4],
  copilot: [24, 4],
  analytics: [28, 4],
  montage: [32, 2],
  outro: [34, 5],
} as const;

export const TOTAL = 39 * BAR; // 78 s — 38 bars + the reverb tail

const at = (k: keyof typeof CUTS) => ({ from: CUTS[k][0] * BAR, durationInFrames: CUTS[k][1] * BAR });

export const Promo: React.FC = () => {
  const frame = useCurrentFrame();
  const featureStart = CUTS.schedule[0] * BAR;
  const featureEnd = CUTS.montage[0] * BAR;
  const night = [CUTS.telegram[0] * BAR, (CUTS.telegram[0] + CUTS.telegram[1]) * BAR];
  const bug =
    ease(frame, featureStart + 6, 12) * (1 - ease(frame, featureEnd - 10, 10)) *
    (frame >= night[0] && frame < night[1] ? 0 : 1);

  return (
    <AbsoluteFill style={{ backgroundColor: C.paper }}>
      <Paper />
      <Audio src={staticFile('music.wav')} />

      <Sequence {...at('intro')}>
        <S1Intro />
      </Sequence>
      <Sequence {...at('logo')}>
        <S2Logo duration={at('logo').durationInFrames} />
      </Sequence>
      <Sequence {...at('modules')}>
        <S3Modules />
      </Sequence>
      <Sequence {...at('schedule')}>
        <S4Schedule duration={at('schedule').durationInFrames} />
      </Sequence>
      <Sequence {...at('rooms')}>
        <S5Classrooms duration={at('rooms').durationInFrames} />
      </Sequence>
      <Sequence {...at('branches')}>
        <S6Branches duration={at('branches').durationInFrames} />
      </Sequence>
      <Sequence {...at('telegram')}>
        <S7Telegram duration={at('telegram').durationInFrames} />
      </Sequence>
      <Sequence {...at('copilot')}>
        <S8Copilot duration={at('copilot').durationInFrames} />
      </Sequence>
      <Sequence {...at('analytics')}>
        <S9Analytics duration={at('analytics').durationInFrames} />
      </Sequence>
      <Sequence {...at('montage')}>
        <S10Montage />
      </Sequence>
      <Sequence {...at('outro')}>
        <S11Outro duration={at('outro').durationInFrames} />
      </Sequence>

      <BrandBug opacity={bug} />
      <Grain />
    </AbsoluteFill>
  );
};

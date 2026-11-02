import React from 'react';
import { AbsoluteFill } from 'remotion';

// Reels frame is 1080×1920, but Instagram paints over parts of it:
//   top ~220 px     — «Reels» header + camera button
//   bottom ~380 px  — author, caption, audio line
//   right ~120 px   — like / comment / share column (lower half)
// Everything that must be read lives in a 900-wide column between TOP and
// BOTTOM; the lower-third caption sits just above Instagram's caption.
export const W = 1080;
export const H = 1920;
export const X = 60;
export const CW = 900;
export const TOP = 340;
export const BOTTOM = 1380;
export const CAP_Y = 1408;
/** Screen point the camera keeps its target on — the middle of the safe column. */
export const CX = X + CW / 2;
export const CY = (TOP + BOTTOM) / 2;

/** QA only: Instagram's overlays, rendered when inputProps.guides is true. */
export const Guides: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 220, background: 'rgba(255,0,0,0.25)' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 380, background: 'rgba(255,0,0,0.25)' }} />
    <div style={{ position: 'absolute', right: 0, width: 120, top: 1040, bottom: 380, background: 'rgba(255,0,0,0.25)' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 240, height: 1440, border: '3px dashed rgba(0,120,255,0.6)' }} />
  </AbsoluteFill>
);

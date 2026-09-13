/**
 * Attached units for the pipeline. Kaldi 16 kHz front-end + codec code units.
 * Conversions are the ones already in the lattice — not a new architecture equation.
 */

import {
  FRAME_SEC,
  HOP,
  hzToMel,
  MEL_HI,
  MEL_LO,
  melToHz,
  N_FFT,
  N_MELS,
  N_MFCC,
  PREEMPH,
  SAMPLE_RATE,
  WIN,
} from "../audio/dsp.ts";
import { ENC_DIM, STACKS } from "../audio/encoder.ts";
import { PHONES, type Phone } from "../audio/phonemes.ts";

export { hzToMel, melToHz };

export type UnitKind =
  | "Hz"
  | "mel"
  | "Bark"
  | "ERB"
  | "ms"
  | "s"
  | "samples"
  | "frames"
  | "cents"
  | "bytes"
  | "code-units"
  | "code-points"
  | "filters"
  | "bins"
  | "ceps"
  | "ch"
  | "α"
  | "ratio"
  | "nats";

export type LatticeQty = {
  name: string;
  value: number;
  unit: UnitKind;
  note: string;
};

export const NYQUIST = SAMPLE_RATE / 2;
export const BIN_HZ = SAMPLE_RATE / N_FFT;
export const FRAME_HZ = SAMPLE_RATE / HOP;
export const HOP_MS = (HOP / SAMPLE_RATE) * 1000;
export const WIN_MS = (WIN / SAMPLE_RATE) * 1000;
export const SOUND_M_S = 343;

/** Being clock = the hop. One tick is one frame. */
export const TICK_SEC = FRAME_SEC;
export const TICK_HZ = FRAME_HZ;
export const TICK_MS = HOP_MS;
export const SHAKER_FRAMES = WIN_MS * 2;
export const SHAKER_HZ = TICK_HZ / SHAKER_FRAMES;
export const CUBE_DWELL_FRAMES = WIN_MS;
export const FORGET_FRAMES = TICK_MS;
export const RESTORE_FRAMES = SHAKER_FRAMES;
export const DWELL0_FRAMES = SHAKER_FRAMES;

export const LATTICE: LatticeQty[] = [
  { name: "fs", value: SAMPLE_RATE, unit: "Hz", note: "Kaldi 16 kHz" },
  { name: "Nyquist", value: NYQUIST, unit: "Hz", note: "fs / 2" },
  { name: "hop", value: HOP, unit: "samples", note: `${HOP_MS} ms` },
  { name: "win", value: WIN, unit: "samples", note: `${WIN_MS} ms Hamming` },
  { name: "frame", value: HOP_MS, unit: "ms", note: "hop / fs" },
  { name: "frame rate", value: FRAME_HZ, unit: "Hz", note: "100 frames/s" },
  { name: "N_FFT", value: N_FFT, unit: "bins", note: "radix-2" },
  { name: "bin", value: BIN_HZ, unit: "Hz", note: "fs / N_FFT" },
  { name: "mels", value: N_MELS, unit: "filters", note: `${MEL_LO}–${MEL_HI} Hz` },
  { name: "mfcc", value: N_MFCC, unit: "ceps", note: "DCT of log-mel" },
  { name: "preemph", value: PREEMPH, unit: "α", note: "1 − z⁻¹" },
  { name: "enc dim", value: ENC_DIM, unit: "ch", note: "Zipformer out" },
];

export const STACK_RATES = STACKS.map((s) => ({
  name: s.name,
  rate: s.rate,
  hz: FRAME_HZ / s.rate,
}));

/** Traunmüller (1990). */
export function hzToBark(hz: number) {
  if (hz <= 0) return 0;
  return (26.81 * hz) / (1960 + hz) - 0.53;
}

export function barkToHz(bark: number) {
  const B = bark + 0.53;
  if (B <= 0 || B >= 26.81) return 0;
  return (1960 * B) / (26.81 - B);
}

/** Glasberg & Moore equivalent rectangular bandwidth, in Hz. */
export function hzToErb(hz: number) {
  if (hz <= 0) return 0;
  return 24.7 * (4.37 * (hz / 1000) + 1);
}

export function cents(fromHz: number, toHz: number) {
  if (fromHz <= 0 || toHz <= 0) return 0;
  return 1200 * Math.log2(toHz / fromHz);
}

export function periodMs(hz: number) {
  if (hz <= 0) return 0;
  return 1000 / hz;
}

export function wavelengthM(hz: number) {
  if (hz <= 0) return 0;
  return SOUND_M_S / hz;
}

export function samplesToSec(n: number, fs = SAMPLE_RATE) {
  return n / fs;
}

export function framesToSec(n: number) {
  return n * FRAME_SEC;
}

export function secToFrames(t: number) {
  return t / FRAME_SEC;
}

export function shannon(p: ArrayLike<number>) {
  let h = 0;
  for (let i = 0; i < p.length; i++) {
    const x = p[i]!;
    if (x > 0) h -= x * Math.log(x);
  }
  return h;
}

export function nearestPhone(f1: number, f2: number): { phone: Phone; dist: number } {
  let best = PHONES[1] ?? PHONES[0]!;
  let bestD = Infinity;
  for (const ph of PHONES) {
    if (ph.kind === "sil") continue;
    const d = Math.hypot((f1 - ph.f1) / 400, (f2 - ph.f2) / 600);
    if (d < bestD) {
      bestD = d;
      best = ph;
    }
  }
  return { phone: best, dist: bestD };
}

export function vowels(): Phone[] {
  return PHONES.filter((p) => p.kind === "vowel");
}

export type ConvertFrom = "Hz" | "mel" | "Bark" | "ms" | "samples" | "frames";

export type Conversion = {
  from: ConvertFrom;
  hz: number;
  mel: number;
  bark: number;
  erb: number;
  periodMs: number;
  wavelengthM: number;
  centsFromA4: number;
  samples: number;
  frames: number;
  ms: number;
};

export function convert(value: number, from: ConvertFrom): Conversion {
  let hz = 0;
  let ms = 0;
  let samples = 0;
  let frames = 0;

  if (from === "Hz") hz = value;
  else if (from === "mel") hz = melToHz(value);
  else if (from === "Bark") hz = barkToHz(value);
  else if (from === "ms") {
    ms = value;
    hz = value > 0 ? 1000 / value : 0;
  } else if (from === "samples") {
    samples = value;
    ms = samplesToSec(value) * 1000;
    hz = ms > 0 ? 1000 / ms : 0;
    frames = value / HOP;
  } else if (from === "frames") {
    frames = value;
    ms = framesToSec(value) * 1000;
    samples = value * HOP;
    hz = FRAME_HZ;
  }

  if (from === "Hz" || from === "mel" || from === "Bark" || from === "ms") {
    samples = (ms || periodMs(hz)) * (SAMPLE_RATE / 1000);
    frames = samples / HOP;
    if (!ms) ms = periodMs(hz);
  }

  return {
    from,
    hz,
    mel: hzToMel(hz),
    bark: hzToBark(hz),
    erb: hzToErb(hz),
    periodMs: periodMs(hz),
    wavelengthM: wavelengthM(hz),
    centsFromA4: cents(440, hz),
    samples,
    frames,
    ms,
  };
}

export function fmt(n: number, digits = 2) {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function framesOf(sec: number) {
  return Math.round(sec / TICK_SEC);
}

export function fmtFrames(sec: number) {
  return `${framesOf(sec)} fr`;
}

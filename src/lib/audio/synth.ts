/** Klatt-lite source-filter TTS. Same phone table the encoder classifies. */

import { SAMPLE_RATE } from "./dsp.ts";
import { PHONES, PHONE_INDEX, textToPhones, type TimedPhone } from "./phonemes.ts";

function glottal(phase: number) {
  if (phase < 0.62) {
    const x = phase / 0.62;
    return 3 * x * x - 2 * x * x * x;
  }
  const x = (phase - 0.62) / 0.38;
  return 1 - x * x;
}

function hashNoise(i: number, seed: number) {
  let x = Math.imul(i + 1, 374761393) ^ Math.imul(seed + 1, 668265263);
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x >>> 0) / 4294967295) * 2 - 1;
}

export type SynthResult = {
  pcm: Float32Array;
  phones: TimedPhone[];
  duration: number;
};

export function synthesizePhones(
  phonesIn: TimedPhone[],
  opts?: { f0?: number },
): SynthResult {
  const f0 = opts?.f0 ?? 148;
  const phones = phonesIn.map((p) => ({ ...p }));
  let t = 0;
  for (const p of phones) {
    p.start = t;
    t += p.dur;
  }
  const n = Math.max(1, Math.floor(t * SAMPLE_RATE) + Math.floor(SAMPLE_RATE / 12));
  const pcm = new Float32Array(n);
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const time = i / SAMPLE_RATE;
    let phone = phones[0]!;
    for (const ph of phones) if (time >= ph.start) phone = ph;
    const pidx = PHONE_INDEX[phone.id] ?? 0;
    const proto = PHONES[pidx]!;
    const local = (time - phone.start) / Math.max(phone.dur, 1e-4);
    let env = 0;
    if (proto.kind === "sil") env = 0;
    else if (proto.kind === "stop") {
      env = local < 0.5 ? 0.015 : Math.exp(-(((local - 0.5) * 8) ** 2));
    } else {
      env = 0.3 + 0.7 * Math.sin(Math.min(1, local) * Math.PI);
    }

    const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.1 * time);
    const f0i = f0 * vibrato;
    phase += (proto.voiced ? f0i : 0) / SAMPLE_RATE;
    phase -= Math.floor(phase);

    const noise = hashNoise(i, pidx);
    let source = 0;
    if (proto.kind === "sil") source = noise * 0.002;
    else if (!proto.voiced) source = noise * (proto.kind === "fric" ? 0.38 : 0.24);
    else if (proto.kind === "fric" || proto.kind === "affric") {
      source = glottal(phase) * 0.2 + noise * 0.28;
    } else {
      source = glottal(phase) * 0.72 + noise * 0.025;
    }
    pcm[i] = source * env;
  }

  filterCascade(pcm, phones);

  const fade = Math.min(400, Math.floor(n / 20));
  for (let i = 0; i < fade; i++) {
    pcm[i]! *= i / fade;
    pcm[n - 1 - i]! *= i / fade;
  }
  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(pcm[i]!));
  const g = 0.7 / peak;
  for (let i = 0; i < n; i++) pcm[i]! *= g;

  return { pcm, phones, duration: n / SAMPLE_RATE };
}

export function synthesizePhone(id: string, dur = 0.2, f0 = 148) {
  return synthesizePhones(
    [
      { id: "SIL", start: 0, dur: 0.03 },
      { id, start: 0, dur },
      { id: "SIL", start: 0, dur: 0.03 },
    ],
    { f0 },
  );
}

export function synthesize(
  text: string,
  opts?: { f0?: number; rate?: number; tilt?: number },
): SynthResult {
  const rate = Math.max(0.6, Math.min(1.6, opts?.rate ?? 1));
  const phones = textToPhones(text).map((p) => ({ ...p, dur: p.dur / rate, start: 0 }));
  return synthesizePhones(phones, { f0: opts?.f0 });
}

function filterCascade(pcm: Float32Array, phones: TimedPhone[]) {
  let y1a = 0,
    y1b = 0,
    y2a = 0,
    y2b = 0,
    y3a = 0,
    y3b = 0,
    rad = 0;
  let f1 = 500,
    f2 = 1500,
    f3 = 2500,
    b1 = 80,
    b2 = 100;
  const pole = (freq: number, bw: number) => {
    const r = Math.exp((-Math.PI * bw) / SAMPLE_RATE);
    return {
      a: 2 * r * Math.cos((2 * Math.PI * freq) / SAMPLE_RATE),
      b: -r * r,
      g: 1 - r,
    };
  };
  for (let i = 0; i < pcm.length; i++) {
    const time = i / SAMPLE_RATE;
    let phone = phones[0]!;
    for (const ph of phones) if (time >= ph.start) phone = ph;
    const proto = PHONES[PHONE_INDEX[phone.id] ?? 0]!;
    f1 += 0.14 * (proto.f1 - f1);
    f2 += 0.14 * (proto.f2 - f2);
    f3 += 0.1 * (proto.f3 - f3);
    b1 += 0.1 * (proto.bw1 - b1);
    b2 += 0.1 * (proto.bw2 - b2);
    const p1 = pole(f1, b1);
    const p2 = pole(f2, b2);
    const p3 = pole(f3, 160);
    const n1 = pcm[i]! * p1.g + p1.a * y1a + p1.b * y1b;
    y1b = y1a;
    y1a = n1;
    const n2 = n1 * p2.g + p2.a * y2a + p2.b * y2b;
    y2b = y2a;
    y2a = n2;
    const n3 = n2 * p3.g + p3.a * y3a + p3.b * y3b;
    y3b = y3a;
    y3a = n3;
    const radiated = n3 - 0.92 * rad;
    rad = n3;
    pcm[i] = radiated;
  }
}

export const DEMO_LINE = "Filament in. Codec. Booth out.";

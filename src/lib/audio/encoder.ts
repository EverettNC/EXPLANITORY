/**
 * Zipformer-shaped acoustic encoder.
 *
 * Not a 65M-param checkpoint — those don't fit in a browser tab. This is the
 * architecture Kaldi was retired for: U-Net stacks, multi-band self-attention
 * over 80-dim fbank, depthwise temporal conv, residual bypass. Attention is
 * acoustic (cosine in mel bands + locality), so similar phones actually bind.
 */

import { cmvn, deltas, extractFrames, N_MELS, N_MFCC, type Frame } from "./dsp.ts";
import {
  collapseCtc,
  N_PHONES,
  PHONES,
  PHONE_INDEX,
  type Phone,
} from "./phonemes.ts";
import { synthesizePhone } from "./synth.ts";

export const ENC_DIM = 64;
export const STACKS = [
  { name: "conv-embed", rate: 1 },
  { name: "stack-1 · 50 Hz", rate: 1 },
  { name: "stack-2 · 25 Hz", rate: 2 },
  { name: "stack-3 · 12 Hz", rate: 4 },
  { name: "stack-4 · 25 Hz", rate: 2 },
  { name: "out-proj", rate: 1 },
] as const;

const BANDS = [
  [0, 20],
  [16, 48],
  [40, 80],
  [0, 80],
] as const;

function cosineBand(a: Float32Array, b: Float32Array, lo: number, hi: number) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = lo; i < hi; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na * nb) + 1e-8);
}

function softmax(scores: Float32Array) {
  let max = -Infinity;
  for (let i = 0; i < scores.length; i++) if (scores[i]! > max) max = scores[i]!;
  let sum = 0;
  for (let i = 0; i < scores.length; i++) {
    const e = Math.exp((scores[i]! - max) * 8);
    scores[i] = e;
    sum += e;
  }
  const inv = 1 / (sum + 1e-12);
  for (let i = 0; i < scores.length; i++) scores[i]! *= inv;
}

function pool2(seq: Float32Array[]): Float32Array[] {
  const out: Float32Array[] = [];
  for (let i = 0; i < seq.length; i += 2) {
    const a = seq[i]!;
    const b = seq[i + 1] ?? a;
    const m = new Float32Array(a.length);
    for (let k = 0; k < a.length; k++) m[k] = 0.5 * (a[k]! + b[k]!);
    out.push(m);
  }
  return out.length ? out : seq;
}

function upsample2(seq: Float32Array[], target: number): Float32Array[] {
  const out: Float32Array[] = [];
  for (const row of seq) {
    out.push(row);
    if (out.length < target) out.push(new Float32Array(row));
  }
  while (out.length < target) out.push(new Float32Array(seq[seq.length - 1] ?? ENC_DIM));
  return out.slice(0, target);
}

function mix(a: Float32Array[], b: Float32Array[], wa = 0.65, wb = 0.35) {
  return a.map((row, i) => {
    const other = b[Math.min(i, b.length - 1)]!;
    const o = new Float32Array(row.length);
    for (let k = 0; k < row.length; k++) o[k] = wa * row[k]! + wb * (other[k] ?? 0);
    return o;
  });
}

function convTemporal(seq: Float32Array[], kernel = [0.08, 0.2, 0.44, 0.2, 0.08]) {
  const T = seq.length;
  const D = seq[0]?.length ?? 0;
  const half = (kernel.length - 1) >> 1;
  const out: Float32Array[] = new Array(T);
  for (let t = 0; t < T; t++) {
    const row = new Float32Array(D);
    for (let k = 0; k < kernel.length; k++) {
      const src = seq[Math.max(0, Math.min(T - 1, t + k - half))]!;
      const w = kernel[k]!;
      for (let d = 0; d < D; d++) row[d]! += w * src[d]!;
    }
    out[t] = row;
  }
  return out;
}

function projectMel(mel: Float32Array, extra: number[]): Float32Array {
  const o = new Float32Array(ENC_DIM);
  const srcLen = N_MELS + extra.length;
  for (let d = 0; d < ENC_DIM; d++) {
    let s = 0;
    for (let i = 0; i < N_MELS; i++) {
      const w = Math.cos((Math.PI * (d + 0.5) * (i + 0.5)) / srcLen);
      s += w * mel[i]!;
    }
    for (let i = 0; i < extra.length; i++) {
      const w = Math.cos((Math.PI * (d + 0.5) * (N_MELS + i + 0.5)) / srcLen);
      s += w * extra[i]!;
    }
    o[d] = s * Math.sqrt(2 / srcLen);
  }
  return o;
}

function attend(
  seq: Float32Array[],
  mels: Float32Array[],
): { out: Float32Array[]; attn: Float32Array } {
  const T = seq.length;
  const attn = new Float32Array(T * T);
  const out: Float32Array[] = new Array(T);
  const scores = new Float32Array(T);
  for (let i = 0; i < T; i++) {
    const mi = mels[Math.min(i, mels.length - 1)]!;
    for (let j = 0; j < T; j++) {
      const mj = mels[Math.min(j, mels.length - 1)]!;
      let s = 0;
      for (const [lo, hi] of BANDS) s += cosineBand(mi, mj, lo, hi);
      s /= BANDS.length;
      const dist = i - j;
      const local = Math.exp((-dist * dist) / (2 * 10 * 10));
      scores[j] = s * 0.75 + local * 0.25;
    }
    softmax(scores);
    const acc = new Float32Array(ENC_DIM);
    for (let j = 0; j < T; j++) {
      const a = scores[j]!;
      attn[i * T + j] = a;
      const v = seq[j]!;
      for (let d = 0; d < ENC_DIM; d++) acc[d]! += a * v[d]!;
    }
    const bypass = seq[i]!;
    const mixed = new Float32Array(ENC_DIM);
    for (let d = 0; d < ENC_DIM; d++) mixed[d] = 0.55 * bypass[d]! + 0.45 * acc[d]!;
    out[i] = mixed;
  }
  return { out, attn };
}

export type StackAct = { name: string; frames: Float32Array[] };

export type EncoderResult = {
  stacks: StackAct[];
  out: Float32Array[];
  attn: Float32Array;
  attnN: number;
  posteriors: Float32Array[];
  kaldiPost: Float32Array[];
  ctcPath: number[];
  kaldiPath: number[];
  phones: string[];
  kaldiPhones: string[];
  embedding: Float32Array;
};

function phoneDistance(frame: Frame, phone: Phone) {
  const f1 = frame.f1 || 500;
  const f2 = frame.f2 || 1500;
  const df1 = (f1 - phone.f1) / 400;
  const df2 = (f2 - phone.f2) / 600;
  const vDiff = frame.voiced - (phone.voiced ? 1 : 0);
  const z = frame.zcr;
  let kind = 0;
  if (phone.kind === "fric" || phone.kind === "affric") kind += Math.abs(z - 0.18) * 4;
  else kind += Math.abs(z - 0.04) * 3;
  if (phone.kind === "sil") {
    return frame.power * 40 + 0.4;
  }
  const energy = frame.power < 0.01 ? 2.5 : 0;
  return df1 * df1 + df2 * df2 + vDiff * vDiff * 0.6 + kind + energy;
}

const PROTO_DIM = N_MFCC + 4;
let PROTOS: Float32Array[] | null = null;

function frameVec(f: Frame) {
  const v = new Float32Array(PROTO_DIM);
  v.set(f.mfcc);
  v[N_MFCC] = Math.log(f.power + 1e-6);
  v[N_MFCC + 1] = f.zcr * 8;
  v[N_MFCC + 2] = f.voiced * 2;
  v[N_MFCC + 3] = (f.f1 || 500) / 800;
  return v;
}

function buildProtos() {
  if (PROTOS) return PROTOS;
  PROTOS = PHONES.map((p) => {
    const { pcm } = synthesizePhone(p.id, p.kind === "sil" ? 0.12 : 0.22);
    const frames = extractFrames(pcm);
    const voiced = frames.filter((f) => (p.kind === "sil" ? f.power < 0.04 : f.power > 0.02));
    const use = voiced.length ? voiced : frames;
    const mean = new Float32Array(PROTO_DIM);
    if (!use.length) return mean;
    for (const f of use) {
      const v = frameVec(f);
      for (let i = 0; i < PROTO_DIM; i++) mean[i]! += v[i]!;
    }
    for (let i = 0; i < PROTO_DIM; i++) mean[i]! /= use.length;
    return mean;
  });
  return PROTOS;
}

function protoDistance(frame: Frame, i: number) {
  const protos = buildProtos();
  const v = frameVec(frame);
  const p = protos[i]!;
  let s = 0;
  for (let k = 0; k < N_MFCC; k++) {
    const d = v[k]! - p[k]!;
    s += d * d;
  }
  for (let k = N_MFCC; k < PROTO_DIM; k++) {
    const d = v[k]! - p[k]!;
    s += 0.45 * d * d;
  }
  return s + 0.2 * phoneDistance(frame, PHONES[i]!);
}

function softmaxNegDist(dists: Float32Array, temp = 0.28) {
  let min = Infinity;
  for (let i = 0; i < dists.length; i++) if (dists[i]! < min) min = dists[i]!;
  let sum = 0;
  const out = new Float32Array(dists.length);
  for (let i = 0; i < dists.length; i++) {
    const e = Math.exp(-(dists[i]! - min) / temp);
    out[i] = e;
    sum += e;
  }
  for (let i = 0; i < out.length; i++) out[i]! /= sum + 1e-12;
  return out;
}

function classifyFrames(frames: Frame[], smooth: number): Float32Array[] {
  buildProtos();
  const raw = frames.map((f) => {
    const d = new Float32Array(N_PHONES);
    for (let i = 0; i < N_PHONES; i++) d[i] = protoDistance(f, i);
    return softmaxNegDist(d);
  });
  if (smooth <= 0) return raw;
  const T = raw.length;
  const out: Float32Array[] = new Array(T);
  for (let t = 0; t < T; t++) {
    const acc = new Float32Array(N_PHONES);
    let wsum = 0;
    for (let k = -smooth; k <= smooth; k++) {
      const i = t + k;
      if (i < 0 || i >= T) continue;
      const w = 1 - Math.abs(k) / (smooth + 1);
      const row = raw[i]!;
      for (let p = 0; p < N_PHONES; p++) acc[p]! += w * row[p]!;
      wsum += w;
    }
    for (let p = 0; p < N_PHONES; p++) acc[p]! /= wsum;
    out[t] = acc;
  }
  return out;
}

function argmaxPath(posts: Float32Array[]) {
  return posts.map((row) => {
    let best = 0;
    let v = -1;
    for (let i = 0; i < row.length; i++) {
      if (row[i]! > v) {
        v = row[i]!;
        best = i;
      }
    }
    return best;
  });
}

function idsToGlyphs(ids: number[]) {
  return collapseCtc(ids).map((id) => PHONES[id]?.g ?? "∅");
}

function statsPool(seq: Float32Array[]) {
  const D = seq[0]?.length ?? ENC_DIM;
  const mean = new Float32Array(D);
  const std = new Float32Array(D);
  if (!seq.length) return new Float32Array(D * 2);
  for (const row of seq) {
    for (let i = 0; i < D; i++) mean[i]! += row[i]!;
  }
  for (let i = 0; i < D; i++) mean[i]! /= seq.length;
  for (const row of seq) {
    for (let i = 0; i < D; i++) {
      const d = row[i]! - mean[i]!;
      std[i]! += d * d;
    }
  }
  const emb = new Float32Array(D * 2);
  for (let i = 0; i < D; i++) {
    emb[i] = mean[i]!;
    emb[D + i] = Math.sqrt(std[i]! / seq.length + 1e-6);
  }
  let n = 0;
  for (let i = 0; i < emb.length; i++) n += emb[i]! * emb[i]!;
  n = Math.sqrt(n) + 1e-8;
  for (let i = 0; i < emb.length; i++) emb[i]! /= n;
  return emb;
}

export function encode(frames: Frame[]): EncoderResult {
  if (frames.length < 4) {
    const empty = new Float32Array(0);
    return {
      stacks: [],
      out: [],
      attn: empty,
      attnN: 0,
      posteriors: [],
      kaldiPost: [],
      ctcPath: [],
      kaldiPath: [],
      phones: [],
      kaldiPhones: [],
      embedding: new Float32Array(ENC_DIM * 2),
    };
  }

  const mels = cmvn(frames.map((f) => f.mel));
  const dMel = deltas(mels);
  const extraOf = (i: number) => {
    const f = frames[i]!;
    const d = dMel[i]!;
    let dNorm = 0;
    for (let k = 0; k < Math.min(8, d.length); k++) dNorm += d[k]! * d[k]!;
    return [
      Math.log(f.power + 1e-6) * 0.5,
      (f.f0 ? Math.log(f.f0) - 5 : 0) * 0.4,
      f.voiced * 2 - 1,
      f.zcr * 8 - 1,
      f.centroid / 4000,
      Math.sqrt(dNorm),
    ];
  };

  const embed = mels.map((m, i) => projectMel(m, extraOf(i)));
  const s1 = convTemporal(embed);
  const { out: s1a, attn, } = attend(s1, mels);
  const s2in = pool2(s1a);
  const s2 = convTemporal(s2in, [0.15, 0.7, 0.15]);
  const s3in = pool2(s2);
  const s3 = convTemporal(s3in, [0.2, 0.6, 0.2]);
  const s4 = mix(s2, upsample2(s3, s2.length), 0.6, 0.4);
  const out = mix(s1a, upsample2(s4, s1a.length), 0.7, 0.3);

  const kaldiPost = classifyFrames(frames, 0);
  const posteriors = classifyFrames(frames, 3);
  const ctcPath = argmaxPath(posteriors);
  const kaldiPath = argmaxPath(kaldiPost);

  return {
    stacks: [
      { name: STACKS[0].name, frames: embed },
      { name: STACKS[1].name, frames: s1a },
      { name: STACKS[2].name, frames: s2 },
      { name: STACKS[3].name, frames: s3 },
      { name: STACKS[4].name, frames: s4 },
      { name: STACKS[5].name, frames: out },
    ],
    out,
    attn,
    attnN: s1a.length,
    posteriors,
    kaldiPost,
    ctcPath,
    kaldiPath,
    phones: idsToGlyphs(ctcPath),
    kaldiPhones: idsToGlyphs(kaldiPath),
    embedding: statsPool(out),
  };
}

export function cosine(a: Float32Array, b: Float32Array) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(na * nb) + 1e-8);
}

export function mfccMatrix(frames: Frame[]) {
  return frames.map((f) => {
    const row = new Float32Array(N_MFCC);
    row.set(f.mfcc);
    return row;
  });
}

export { PHONE_INDEX };

/**
 * In-tab recognizer. No checkpoint.
 *
 * Unknown audio → energy islands → DTW against Klatt word templates
 * (the same mouth Booth uses). Times from the island. CTC path still
 * feeds force-align when we already have words (host STT / a known line).
 */

import { extractFrames, FRAME_SEC, type Frame } from "./dsp.ts";
import type { EncoderResult } from "./encoder.ts";
import { g2p, LEXICON, PHONE_INDEX, PHONES } from "./phonemes.ts";
import { synthesize } from "./synth.ts";

export type AlignedWord = { word: string; start: number; end: number };

export type Recognition = {
  transcript: string;
  aligned: AlignedWord[];
  phones: string[];
};

type Span = { id: number; start: number; end: number };

export function spansFromPath(path: number[], hop = FRAME_SEC): Span[] {
  const out: Span[] = [];
  let i = 0;
  while (i < path.length) {
    const id = path[i]!;
    let j = i + 1;
    while (j < path.length && path[j] === id) j++;
    if (id !== 0) out.push({ id, start: i * hop, end: j * hop });
    i = j;
  }
  return out;
}

function levenshtein(a: number[], b: number[]) {
  const n = a.length;
  const m = b.length;
  const dp: Float32Array[] = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  for (let i = 0; i <= n; i++) dp[i]![0] = i;
  for (let j = 0; j <= m; j++) dp[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    const row = dp[i]!;
    const prev = dp[i - 1]!;
    const ai = a[i - 1]!;
    for (let j = 1; j <= m; j++) {
      const c = ai === b[j - 1]! ? 0 : 1;
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + c);
    }
  }
  return dp[n]![m]!;
}

type LexItem = { word: string; ids: number[] };

let LEX_ITEMS: LexItem[] | null = null;

function lexItems(): LexItem[] {
  if (LEX_ITEMS) return LEX_ITEMS;
  LEX_ITEMS = Object.entries(LEXICON)
    .map(([word, ph]) => ({
      word,
      ids: ph.map((p) => PHONE_INDEX[p] ?? 0).filter((id) => id > 0),
    }))
    .filter((it) => it.ids.length > 0)
    .sort((a, b) => b.ids.length - a.ids.length);
  return LEX_ITEMS;
}

export function decodePath(path: number[], hop = FRAME_SEC): Recognition {
  const spans = spansFromPath(path, hop);
  const ids = spans.map((s) => s.id);
  const phones = ids.map((id) => PHONES[id]?.g ?? "?");
  if (!ids.length) return { transcript: "", aligned: [], phones };

  const items = lexItems();
  const aligned: AlignedWord[] = [];
  let i = 0;
  while (i < ids.length) {
    let best: { word: string; n: number; quality: number } | null = null;
    for (const it of items) {
      const maxN = Math.min(ids.length - i, it.ids.length + 2);
      const minN = Math.max(1, it.ids.length - 1);
      for (let n = minN; n <= maxN; n++) {
        const slice = ids.slice(i, i + n);
        const d = levenshtein(slice, it.ids);
        const denom = Math.max(it.ids.length, slice.length);
        if (d / denom > 0.4) continue;
        const quality = it.ids.length - d * 1.4 - (n !== it.ids.length ? 0.15 : 0);
        if (!best || quality > best.quality) best = { word: it.word, n, quality };
      }
    }
    if (best) {
      const start = spans[i]!.start;
      const end = spans[i + best.n - 1]!.end;
      const last = aligned[aligned.length - 1];
      if (last && last.word === best.word && start - last.end < 0.12) last.end = end;
      else aligned.push({ word: best.word, start, end });
      i += best.n;
    } else {
      aligned.push({
        word: PHONES[ids[i]!]!.g,
        start: spans[i]!.start,
        end: spans[i]!.end,
      });
      i += 1;
    }
  }

  return {
    transcript: aligned.map((w) => w.word).join(" "),
    aligned,
    phones,
  };
}

function cmvnSeq(seq: Float32Array[]): Float32Array[] {
  if (!seq.length) return seq;
  const D = seq[0]!.length;
  const T = seq.length;
  const mean = new Float32Array(D);
  const std = new Float32Array(D);
  for (const row of seq) {
    for (let i = 0; i < D; i++) mean[i]! += row[i]!;
  }
  for (let i = 0; i < D; i++) mean[i]! /= T;
  for (const row of seq) {
    for (let i = 0; i < D; i++) {
      const d = row[i]! - mean[i]!;
      std[i]! += d * d;
    }
  }
  for (let i = 0; i < D; i++) std[i] = Math.sqrt(std[i]! / T + 1e-5);
  return seq.map((row) => {
    const o = new Float32Array(D);
    for (let i = 0; i < D; i++) o[i] = (row[i]! - mean[i]!) / std[i]!;
    return o;
  });
}

type Template = { word: string; mfcc: Float32Array[] };

let TEMPLATES: Template[] | null = null;

function templates(): Template[] {
  if (TEMPLATES) return TEMPLATES;
  TEMPLATES = Object.keys(LEXICON)
    .map((word) => {
      const { pcm } = synthesize(word, { f0: 148, rate: 1 });
      const frames = extractFrames(pcm).filter((f) => f.power > 0.018);
      return { word, mfcc: cmvnSeq(frames.map((f) => f.mfcc)) };
    })
    .filter((t) => t.mfcc.length >= 4)
    .sort((a, b) => b.mfcc.length - a.mfcc.length);
  return TEMPLATES;
}

function mfccDist(a: Float32Array, b: Float32Array) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    s += d * d;
  }
  return s;
}

function dtw(a: Float32Array[], b: Float32Array[]) {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return 1e9;
  const dp: Float32Array[] = Array.from({ length: n + 1 }, () => {
    const row = new Float32Array(m + 1);
    row.fill(1e9);
    return row;
  });
  dp[0]![0] = 0;
  for (let i = 1; i <= n; i++) {
    const row = dp[i]!;
    const prev = dp[i - 1]!;
    const ai = a[i - 1]!;
    for (let j = 1; j <= m; j++) {
      const cost = mfccDist(ai, b[j - 1]!);
      row[j] = cost + Math.min(prev[j]!, row[j - 1]!, prev[j - 1]!);
    }
  }
  return dp[n]![m]! / (n + m);
}

export function recognizeFrames(
  frames: Frame[],
  result?: Pick<EncoderResult, "ctcPath" | "phones">,
  hop = FRAME_SEC,
): Recognition {
  const phones = result?.phones ?? [];
  if (frames.length < 4) {
    return { transcript: "", aligned: [], phones };
  }
  const tpl = templates();
  const norm = cmvnSeq(frames.map((f) => f.mfcc));
  const aligned: AlignedWord[] = [];
  let i = 0;
  while (i < frames.length && frames[i]!.power < 0.02) i++;
  const lastVoiced = (() => {
    for (let k = frames.length - 1; k >= 0; k--) if (frames[k]!.power >= 0.02) return k + 1;
    return frames.length;
  })();
  while (i < lastVoiced - 4) {
    while (i < lastVoiced && frames[i]!.power < 0.018) i++;
    if (i >= lastVoiced - 4) break;
    const remaining = lastVoiced - i;
    let best: { word: string; n: number; cost: number } | null = null;
    for (const t of tpl) {
      const nMin = Math.max(4, Math.floor(t.mfcc.length * 0.7));
      const nMax = Math.min(remaining, Math.ceil(t.mfcc.length * 1.35));
      if (nMax < nMin) continue;
      for (let n = nMin; n <= nMax; n += 2) {
        const cost = dtw(norm.slice(i, i + n), t.mfcc) - t.mfcc.length * 0.015;
        if (!best || cost < best.cost) best = { word: t.word, n, cost };
      }
    }
    if (best && best.cost < 8) {
      aligned.push({
        word: best.word,
        start: i * hop,
        end: (i + best.n) * hop,
      });
      i += best.n;
    } else {
      i += 3;
    }
  }
  if (aligned.length) {
    return {
      transcript: aligned.map((w) => w.word).join(" "),
      aligned,
      phones,
    };
  }
  if (result?.ctcPath.length) return decodePath(result.ctcPath, hop);
  return { transcript: "", aligned: [], phones };
}

export function recognize(
  result: Pick<EncoderResult, "ctcPath" | "phones">,
  hop = FRAME_SEC,
): Recognition {
  return decodePath(result.ctcPath, hop);
}

export function forceAlign(text: string, path: number[], hop = FRAME_SEC): AlignedWord[] {
  const words = text
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z'-]/g, ""))
    .filter(Boolean);
  if (!words.length || !path.length) return [];

  const units: { word: string; id: number }[] = [];
  for (const raw of words) {
    const word = raw.toLowerCase();
    for (const p of g2p(word)) {
      const id = PHONE_INDEX[p] ?? 0;
      if (id) units.push({ word, id });
    }
  }
  if (!units.length) return [];

  const T = path.length;
  const U = units.length;
  const INF = 1e9;
  const dp: Float32Array[] = Array.from({ length: U + 1 }, () => {
    const row = new Float32Array(T + 1);
    row.fill(INF);
    return row;
  });
  dp[0]![0] = 0;
  for (let t = 1; t <= T; t++) {
    dp[0]![t] = dp[0]![t - 1]! + (path[t - 1] === 0 ? 0.05 : 0.35);
  }
  for (let u = 1; u <= U; u++) {
    const uid = units[u - 1]!.id;
    const row = dp[u]!;
    const prev = dp[u - 1]!;
    for (let t = 1; t <= T; t++) {
      const pid = path[t - 1]!;
      const match = uid === pid ? 0 : pid === 0 ? 0.2 : 1;
      const extra = pid === 0 ? 0.05 : 0.25;
      row[t] = Math.min(prev[t - 1]! + match, row[t - 1]! + extra, prev[t]! + 0.85);
    }
  }

  const first = new Int32Array(U);
  const last = new Int32Array(U);
  first.fill(-1);
  last.fill(-1);
  let u = U;
  let t = T;
  while (u > 0 && t > 0) {
    const pid = path[t - 1]!;
    const uid = units[u - 1]!.id;
    const match = uid === pid ? 0 : pid === 0 ? 0.2 : 1;
    const extra = pid === 0 ? 0.05 : 0.25;
    const v = dp[u]![t]!;
    const diag = dp[u - 1]![t - 1]! + match;
    const left = dp[u]![t - 1]! + extra;
    const up = dp[u - 1]![t]! + 0.85;
    if (Math.abs(v - diag) <= Math.abs(v - left) && Math.abs(v - diag) <= Math.abs(v - up)) {
      last[u - 1] = Math.max(last[u - 1]!, t - 1);
      if (first[u - 1] < 0 || t - 1 < first[u - 1]) first[u - 1] = t - 1;
      u--;
      t--;
    } else if (Math.abs(v - left) <= Math.abs(v - up)) {
      last[u - 1] = Math.max(last[u - 1]!, t - 1);
      if (first[u - 1] < 0 || t - 1 < first[u - 1]) first[u - 1] = t - 1;
      t--;
    } else {
      u--;
    }
  }

  const aligned: AlignedWord[] = [];
  for (let i = 0; i < U; i++) {
    const word = units[i]!.word;
    const t0 = first[i]! < 0 ? 0 : first[i]!;
    const t1 = last[i]! < 0 ? t0 : last[i]!;
    const start = t0 * hop;
    const end = (t1 + 1) * hop;
    const prev = aligned[aligned.length - 1];
    if (prev && prev.word === word) prev.end = Math.max(prev.end, end);
    else aligned.push({ word, start, end });
  }
  return aligned;
}

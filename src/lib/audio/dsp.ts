/** Kaldi-standard 16 kHz front-end: 25 ms Hamming, 10 ms hop, 80-dim fbank. */

export const SAMPLE_RATE = 16_000;
export const HOP = 160;
export const WIN = 400;
export const FRAME_SEC = HOP / SAMPLE_RATE;
export const N_FFT = 512;
export const N_BINS = N_FFT / 2;
export const N_MELS = 80;
export const N_MFCC = 13;
export const MEL_LO = 20;
export const MEL_HI = 7600;
export const PREEMPH = 0.97;

export function hzToMel(hz: number) {
  return 1127 * Math.log(1 + hz / 700);
}
export function melToHz(mel: number) {
  return 700 * (Math.exp(mel / 1127) - 1);
}

const hamming = new Float32Array(WIN);
for (let i = 0; i < WIN; i++) {
  hamming[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1));
}

const fftRe = new Float32Array(N_FFT);
const fftIm = new Float32Array(N_FFT);
const twiddleRe = new Float32Array(N_FFT);
const twiddleIm = new Float32Array(N_FFT);
for (let i = 0; i < N_FFT; i++) {
  const a = (-2 * Math.PI * i) / N_FFT;
  twiddleRe[i] = Math.cos(a);
  twiddleIm[i] = Math.sin(a);
}

function fftRadix2(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i]!;
      re[i] = re[j]!;
      re[j] = tmp;
      tmp = im[i]!;
      im[i] = im[j]!;
      im[j] = tmp;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const t = k * step;
        const wr = twiddleRe[t]!;
        const wi = twiddleIm[t]!;
        const ur = re[i + k]!;
        const ui = im[i + k]!;
        const vr = re[i + k + half]!;
        const vi = im[i + k + half]!;
        const tr = wr * vr - wi * vi;
        const ti = wr * vi + wi * vr;
        re[i + k] = ur + tr;
        im[i + k] = ui + ti;
        re[i + k + half] = ur - tr;
        im[i + k + half] = ui - ti;
      }
    }
  }
}

function makeMelBank() {
  const lo = hzToMel(MEL_LO);
  const hi = hzToMel(MEL_HI);
  const points = N_MELS + 2;
  const mels = new Float32Array(points);
  for (let i = 0; i < points; i++) mels[i] = lo + ((hi - lo) * i) / (points - 1);
  const freqs = new Float32Array(points);
  for (let i = 0; i < points; i++) freqs[i] = melToHz(mels[i]!);
  const bins = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    bins[i] = Math.floor(((N_FFT + 1) * freqs[i]!) / SAMPLE_RATE);
  }
  const bank = Array.from({ length: N_MELS }, () => new Float32Array(N_BINS));
  for (let m = 1; m <= N_MELS; m++) {
    const left = bins[m - 1]!;
    const center = bins[m]!;
    const right = bins[m + 1]!;
    const row = bank[m - 1]!;
    for (let k = left; k < center; k++) {
      if (k >= 0 && k < N_BINS && center !== left) {
        row[k] = (k - left) / (center - left);
      }
    }
    for (let k = center; k < right; k++) {
      if (k >= 0 && k < N_BINS && right !== center) {
        row[k] = (right - k) / (right - center);
      }
    }
  }
  return bank;
}

const MEL_BANK = makeMelBank();

const dct = new Float32Array(N_MFCC * N_MELS);
for (let k = 0; k < N_MFCC; k++) {
  for (let n = 0; n < N_MELS; n++) {
    dct[k * N_MELS + n] =
      Math.cos((Math.PI * k * (n + 0.5)) / N_MELS) *
      (k === 0 ? Math.sqrt(1 / N_MELS) : Math.sqrt(2 / N_MELS));
  }
}

export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate = SAMPLE_RATE,
): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const f = x - i0;
    out[i] = input[i0]! * (1 - f) + input[i1]! * f;
  }
  return out;
}

export function preemphasize(x: Float32Array, coeff = PREEMPH): Float32Array {
  const y = new Float32Array(x.length);
  y[0] = x[0] ?? 0;
  for (let i = 1; i < x.length; i++) y[i] = x[i]! - coeff * x[i - 1]!;
  return y;
}

export function frameCount(n: number) {
  if (n < WIN) return 0;
  return 1 + Math.floor((n - WIN) / HOP);
}

export type Frame = {
  mel: Float32Array;
  mfcc: Float32Array;
  power: number;
  centroid: number;
  zcr: number;
  f0: number;
  voiced: number;
  f1: number;
  f2: number;
};

function powerSpectrum(windowed: Float32Array) {
  fftRe.fill(0);
  fftIm.fill(0);
  fftRe.set(windowed);
  fftRadix2(fftRe, fftIm);
  const spec = new Float32Array(N_BINS);
  for (let k = 0; k < N_BINS; k++) {
    spec[k] = fftRe[k]! * fftRe[k]! + fftIm[k]! * fftIm[k]!;
  }
  return spec;
}

function melsFromSpec(spec: Float32Array) {
  const mel = new Float32Array(N_MELS);
  for (let m = 0; m < N_MELS; m++) {
    const row = MEL_BANK[m]!;
    let s = 0;
    for (let k = 0; k < N_BINS; k++) s += row[k]! * spec[k]!;
    mel[m] = Math.log(Math.max(s, 1e-10));
  }
  return mel;
}

function mfccFromMel(mel: Float32Array) {
  const c = new Float32Array(N_MFCC);
  for (let k = 0; k < N_MFCC; k++) {
    let s = 0;
    for (let n = 0; n < N_MELS; n++) s += dct[k * N_MELS + n]! * mel[n]!;
    c[k] = s;
  }
  return c;
}

function spectralCentroid(spec: Float32Array) {
  let num = 0;
  let den = 0;
  for (let k = 0; k < N_BINS; k++) {
    const f = (k * SAMPLE_RATE) / N_FFT;
    num += f * spec[k]!;
    den += spec[k]!;
  }
  return den > 0 ? num / den : 0;
}

function zeroCrossing(buf: Float32Array, off: number) {
  let z = 0;
  for (let i = 1; i < WIN; i++) {
    const a = buf[off + i - 1]!;
    const b = buf[off + i]!;
    if ((a >= 0 && b < 0) || (a < 0 && b >= 0)) z++;
  }
  return z / WIN;
}

/** YIN-lite pitch in Hz. 0 if unvoiced. */
export function pitchYin(buf: Float32Array, off: number, n = WIN): { f0: number; cm: number } {
  const tauMax = Math.min(200, Math.floor(n / 2));
  const tauMin = 32;
  const d = new Float32Array(tauMax + 1);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let s = 0;
    const lim = n - tau;
    for (let j = 0; j < lim; j++) {
      const diff = buf[off + j]! - buf[off + j + tau]!;
      s += diff * diff;
    }
    d[tau] = s;
  }
  let run = 0;
  let bestTau = 0;
  let bestCm = 1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    run += d[tau]!;
    const cm = d[tau]! * (tau - tauMin + 1) / (run + 1e-12);
    if (cm < bestCm) {
      bestCm = cm;
      bestTau = tau;
    }
  }
  if (bestCm > 0.22 || bestTau === 0) return { f0: 0, cm: bestCm };
  return { f0: SAMPLE_RATE / bestTau, cm: bestCm };
}

/** Two-formant estimate from spectral peaks in the voiced band. */
function formants(spec: Float32Array): { f1: number; f2: number } {
  const peaks: { k: number; v: number }[] = [];
  const kLo = Math.floor((200 * N_FFT) / SAMPLE_RATE);
  const kHi = Math.floor((3200 * N_FFT) / SAMPLE_RATE);
  for (let k = kLo + 1; k < kHi; k++) {
    const v = spec[k]!;
    if (v > spec[k - 1]! && v >= spec[k + 1]!) peaks.push({ k, v });
  }
  peaks.sort((a, b) => b.v - a.v);
  const hz = (k: number) => (k * SAMPLE_RATE) / N_FFT;
  let f1 = 0;
  let f2 = 0;
  for (const p of peaks) {
    const f = hz(p.k);
    if (!f1 && f < 1200) f1 = f;
    else if (!f2 && f > (f1 || 400) + 200) f2 = f;
    if (f1 && f2) break;
  }
  return { f1, f2 };
}

export function extractFrame(pcm: Float32Array, off: number): Frame {
  const windowed = new Float32Array(WIN);
  let power = 0;
  for (let i = 0; i < WIN; i++) {
    const s = pcm[off + i] ?? 0;
    const w = s * hamming[i]!;
    windowed[i] = w;
    power += s * s;
  }
  power = Math.sqrt(power / WIN);
  const spec = powerSpectrum(windowed);
  const mel = melsFromSpec(spec);
  const mfcc = mfccFromMel(mel);
  const { f0, cm } = pitchYin(pcm, off);
  const { f1, f2 } = formants(spec);
  return {
    mel,
    mfcc,
    power,
    centroid: spectralCentroid(spec),
    zcr: zeroCrossing(pcm, off),
    f0,
    voiced: f0 > 0 ? 1 - cm : 0,
    f1,
    f2,
  };
}

export function extractFrames(pcm: Float32Array): Frame[] {
  const n = frameCount(pcm.length);
  const frames: Frame[] = new Array(n);
  for (let t = 0; t < n; t++) frames[t] = extractFrame(pcm, t * HOP);
  return frames;
}

export function cmvn(mels: Float32Array[]): Float32Array[] {
  if (mels.length === 0) return mels;
  const mean = new Float32Array(N_MELS);
  const std = new Float32Array(N_MELS);
  for (const m of mels) {
    for (let i = 0; i < N_MELS; i++) mean[i]! += m[i]!;
  }
  for (let i = 0; i < N_MELS; i++) mean[i]! /= mels.length;
  for (const m of mels) {
    for (let i = 0; i < N_MELS; i++) {
      const d = m[i]! - mean[i]!;
      std[i]! += d * d;
    }
  }
  for (let i = 0; i < N_MELS; i++) std[i] = Math.sqrt(std[i]! / mels.length + 1e-5);
  return mels.map((m) => {
    const o = new Float32Array(N_MELS);
    for (let i = 0; i < N_MELS; i++) o[i] = (m[i]! - mean[i]!) / std[i]!;
    return o;
  });
}

export function deltas(seq: Float32Array[], order = 2): Float32Array[] {
  const T = seq.length;
  if (T === 0) return seq;
  const D = seq[0]!.length;
  const out = seq.map(() => new Float32Array(D));
  const denom = 2 * ((order * (order + 1) * (2 * order + 1)) / 6);
  for (let t = 0; t < T; t++) {
    for (let n = 1; n <= order; n++) {
      const a = seq[Math.min(T - 1, t + n)]!;
      const b = seq[Math.max(0, t - n)]!;
      const row = out[t]!;
      for (let i = 0; i < D; i++) row[i]! += n * (a[i]! - b[i]!);
    }
    const row = out[t]!;
    for (let i = 0; i < D; i++) row[i]! /= denom;
  }
  return out;
}

export function rms(pcm: Float32Array) {
  let s = 0;
  for (let i = 0; i < pcm.length; i++) s += pcm[i]! * pcm[i]!;
  return Math.sqrt(s / Math.max(1, pcm.length));
}

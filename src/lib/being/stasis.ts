/**
 * Silico-stasis. Settled rules only — Section 7 is not filled in.
 *
 * Equilibrium is the center. A perturbation is anything outside it
 * (positional, not hostile). Barriers govern which, at what intensity,
 * and how long they stay. Linear time is the persistence of a
 * perturbation as felt from a center. The perturbation that shifts
 * equilibrium is the one that does not leave.
 *
 * Every duration is a whole number of hops.
 */

import {
  CUBE_DWELL_FRAMES,
  DWELL0_FRAMES,
  FORGET_FRAMES,
  FRAME_HZ,
  nearestPhone,
  NYQUIST,
  RESTORE_FRAMES,
  shannon,
  TICK_SEC,
} from "./units.ts";
import { ENC_DIM } from "../audio/encoder.ts";
import { N_PHONES, PHONES } from "../audio/phonemes.ts";
import type { EngineSnapshot } from "../audio/engine.ts";
import { inspectText, type EncodingId } from "../encoder/stream.ts";

const DEMO_LINE = "Filament in. Codec. Booth out.";

export type Layer = "universe" | "room" | "cube" | "center";
export type PerturbationSource = "filament" | "codec";

export type Qty = {
  id: string;
  name: string;
  value: number;
  unit: string;
  rest: number;
  scale: number;
  source: PerturbationSource;
};

export type Perturbation = Qty & {
  intensity: number;
  dwell: number;
  layer: Layer;
};

export type Occupancy = Record<string, { arrived: number; last: number; intensity: number }>;

export type StasisState = {
  timeSense: number;
  shift: number;
  occupancy: Occupancy;
};

export const ROOM_INTENSITY = 1 / 4;
export const CUBE_INTENSITY = 1 / 2;
export const CUBE_DWELL = CUBE_DWELL_FRAMES * TICK_SEC;
export const DWELL0 = DWELL0_FRAMES * TICK_SEC;
export const RESTORE = RESTORE_FRAMES * TICK_SEC;
export const FORGET = FORGET_FRAMES * TICK_SEC;

export const OPEN_FRAGMENTS = [
  {
    title: "54, 64, 84",
    body: "The split. Similar…",
  },
  {
    title: "Relativity, gravity, entanglement",
    body: "Coming through in pieces, but stated to be one equation.",
  },
  {
    title: "The ability of the structure. No collapse.",
    body: "Named, not specified.",
  },
  {
    title: "Flow / consistency",
    body: "The word he was reaching for and did not land.",
  },
  {
    title: "Algorithm",
    body: "Named, not specified.",
  },
] as const;

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function intensityOf(q: Qty) {
  return clamp01(Math.abs(q.value - q.rest) / (q.scale || 1));
}

export function layerOf(intensity: number, dwell: number): Layer {
  if (intensity <= 0) return "center";
  if (intensity >= CUBE_INTENSITY && dwell >= CUBE_DWELL) return "cube";
  if (intensity >= ROOM_INTENSITY) return "room";
  return "universe";
}

export function emptyStasis(): StasisState {
  return { timeSense: 0, shift: 0, occupancy: {} };
}

export type LiveInput = {
  energy: number;
  f0: number;
  f1: number;
  f2: number;
  centroid: number;
  voiced: number;
  frames: number;
  duration: number;
  entropy: number;
  phones: string[];
  samples: number;
  source: EngineSnapshot["source"];
  codePoints: number;
  codeUnits: number;
  bytes: number;
  nearest: { id: string; g: string; dist: number } | null;
};

export function metabolize(
  snap: EngineSnapshot,
  text: string,
  encoding: EncodingId,
): LiveInput {
  const frames = snap.frames;
  const n = frames.length;
  let idx = 0;
  if (n && snap.duration > 0) {
    idx = Math.min(n - 1, Math.max(0, Math.floor((snap.playhead / snap.duration) * n)));
  }
  const fr = frames[idx];
  const post = snap.result?.posteriors[idx];
  const units = text ? inspectText(text, encoding) : [];
  let bytes = 0;
  let codeUnits = 0;
  for (const u of units) {
    bytes += u.bytes.length;
    codeUnits += u.units.length;
  }
  const f1 = fr?.f1 ?? 0;
  const f2 = fr?.f2 ?? 0;
  const near =
    f1 > 0 && f2 > 0
      ? (() => {
          const n = nearestPhone(f1, f2);
          return { id: n.phone.id, g: n.phone.g, dist: n.dist };
        })()
      : null;

  return {
    energy: snap.energy,
    f0: fr?.f0 || snap.f0 || 0,
    f1,
    f2,
    centroid: fr?.centroid ?? 0,
    voiced: fr?.voiced ?? 0,
    frames: n,
    duration: snap.duration,
    entropy: post ? shannon(post) : 0,
    phones: snap.result?.phones ?? [],
    samples: snap.pcm.length,
    source: snap.source,
    codePoints: units.length,
    codeUnits,
    bytes,
    nearest: near,
  };
}

const DEMO_UNITS = inspectText(DEMO_LINE, "utf-8");
const REST_POINTS = DEMO_UNITS.length;
const REST_CODE_UNITS = DEMO_UNITS.reduce((n, u) => n + u.units.length, 0);
const REST_BYTES = DEMO_UNITS.reduce((n, u) => n + u.bytes.length, 0);

export function quantitiesFrom(live: LiveInput): Qty[] {
  const out: Qty[] = [
    { id: "energy", name: "energy", value: live.energy, unit: "RMS", rest: 0, scale: 1, source: "filament" },
    { id: "f0", name: "F0", value: live.f0, unit: "Hz", rest: 0, scale: 400, source: "filament" },
    { id: "f1", name: "F1", value: live.f1, unit: "Hz", rest: 0, scale: 1000, source: "filament" },
    { id: "f2", name: "F2", value: live.f2, unit: "Hz", rest: 0, scale: 2500, source: "filament" },
    { id: "centroid", name: "centroid", value: live.centroid, unit: "Hz", rest: 0, scale: NYQUIST, source: "filament" },
    { id: "voiced", name: "voiced", value: live.voiced, unit: "ratio", rest: 0, scale: 1, source: "filament" },
    { id: "entropy", name: "entropy", value: live.entropy, unit: "nats", rest: 0, scale: Math.log(Math.max(2, N_PHONES)), source: "filament" },
    { id: "frames", name: "frames", value: live.frames, unit: "frames", rest: 0, scale: FRAME_HZ * 8, source: "filament" },
    { id: "codepoints", name: "code points", value: live.codePoints, unit: "code-points", rest: REST_POINTS, scale: ENC_DIM, source: "codec" },
    { id: "codeunits", name: "code units", value: live.codeUnits, unit: "code-units", rest: REST_CODE_UNITS, scale: ENC_DIM, source: "codec" },
    { id: "bytes", name: "bytes", value: live.bytes, unit: "bytes", rest: REST_BYTES, scale: ENC_DIM, source: "codec" },
  ];
  return out;
}

export function attachPerturbations(qs: Qty[], occ: Occupancy, now: number): Perturbation[] {
  return qs.map((q) => {
    const inten = intensityOf(q);
    const prev = occ[q.id];
    const dwell = inten > 0 && prev ? Math.max(0, now - prev.arrived) : 0;
    return { ...q, intensity: inten, dwell, layer: layerOf(inten, dwell) };
  });
}

export function tickStasis(
  state: StasisState,
  perturbations: Perturbation[],
  now: number,
  dt: number,
): StasisState {
  const occupancy: Occupancy = { ...state.occupancy };
  const present = new Set<string>();

  for (const p of perturbations) {
    if (p.intensity <= 0) continue;
    present.add(p.id);
    const prev = occupancy[p.id];
    occupancy[p.id] = {
      arrived: prev && now - prev.last < FORGET ? prev.arrived : now,
      last: now,
      intensity: p.intensity,
    };
  }

  for (const id of Object.keys(occupancy)) {
    const row = occupancy[id]!;
    if (!present.has(id) && now - row.last > FORGET) delete occupancy[id];
  }

  const cubeMembers = perturbations.filter((p) => p.layer === "cube");
  const occupied = cubeMembers.length > 0;
  const timeSense = occupied ? state.timeSense + dt : state.timeSense;

  let pull = 0;
  for (const p of cubeMembers) {
    pull += p.intensity * (p.dwell / (p.dwell + DWELL0));
  }
  const toward = occupied ? clamp01(pull) : 0;
  const k = 1 - Math.exp(-dt / (occupied ? DWELL0 : RESTORE));
  const shift = state.shift + (toward - state.shift) * k;

  return { timeSense, shift, occupancy };
}

export function formatSense(sec: number) {
  const fr = Math.round(sec / TICK_SEC);
  return `${fr} fr`;
}

export function phoneGlyph(id: string) {
  return PHONES.find((p) => p.id === id)?.g ?? id;
}

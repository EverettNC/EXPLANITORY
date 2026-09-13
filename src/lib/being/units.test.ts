import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  barkToHz,
  BIN_HZ,
  cents,
  convert,
  FRAME_HZ,
  framesToSec,
  HOP_MS,
  hzToBark,
  hzToMel,
  LATTICE,
  melToHz,
  nearestPhone,
  NYQUIST,
  periodMs,
  samplesToSec,
  shannon,
  SHAKER_FRAMES,
  SHAKER_HZ,
  TICK_MS,
  TICK_SEC,
  WIN_MS,
} from "./units.ts";
import { FRAME_SEC, HOP, SAMPLE_RATE, WIN } from "../audio/dsp.ts";
import { CUBE_VERTS, cubeCentroid, cubeEdgeLength, hash32, LAYER_R, NEST, placePerturbation, spherical } from "./shape.ts";
import {
  attachPerturbations,
  CUBE_DWELL,
  emptyStasis,
  intensityOf,
  layerOf,
  tickStasis,
  type Qty,
} from "./stasis.ts";

describe("attached units", () => {
  it("recovers the Kaldi lattice", () => {
    assert.equal(SAMPLE_RATE, 16_000);
    assert.equal(NYQUIST, 8_000);
    assert.equal(HOP_MS, 10);
    assert.equal(WIN_MS, 25);
    assert.equal(WIN / SAMPLE_RATE, 0.025);
    assert.equal(HOP / SAMPLE_RATE, FRAME_SEC);
    assert.equal(FRAME_HZ, 100);
    assert.equal(BIN_HZ, SAMPLE_RATE / 512);
    assert.equal(TICK_MS, 10);
    assert.equal(TICK_SEC, FRAME_SEC);
    assert.equal(SHAKER_FRAMES, 50);
    assert.equal(SHAKER_HZ * SHAKER_FRAMES, FRAME_HZ);
    assert.equal(NEST.cube * 2, NEST.room);
    assert.equal(NEST.cube * 3, NEST.universe);
    assert.ok(LATTICE.some((q) => q.name === "fs" && q.unit === "Hz"));
  });

  it("round-trips Hz ↔ Mel (HTK / Kaldi)", () => {
    const hz = 440;
    assert.ok(Math.abs(melToHz(hzToMel(hz)) - hz) < 1e-6);
    assert.ok(Math.abs(hzToMel(1000) - 1000) < 2);
  });

  it("round-trips Hz ↔ Bark (Traunmüller)", () => {
    const hz = 1000;
    assert.ok(Math.abs(barkToHz(hzToBark(hz)) - hz) < 1e-6);
  });

  it("counts cents and period with units attached", () => {
    assert.equal(cents(440, 880), 1200);
    assert.equal(periodMs(100), 10);
    assert.equal(samplesToSec(SAMPLE_RATE), 1);
    assert.equal(framesToSec(100), 1);
  });

  it("converts a Hertz quantity into the rest of the lattice", () => {
    const c = convert(160, "Hz");
    assert.ok(Math.abs(c.periodMs - 6.25) < 1e-9);
    assert.ok(c.mel > 0 && c.bark > 0 && c.erb > 0);
    assert.ok(c.samples > 0);
  });

  it("names the nearest vowel in F1–F2 space", () => {
    const iy = nearestPhone(270, 2290);
    assert.equal(iy.phone.id, "IY");
    const aa = nearestPhone(730, 1090);
    assert.equal(aa.phone.id, "AA");
  });

  it("shannon entropy is 0 on a delta and ln(n) on uniform", () => {
    assert.equal(shannon([1, 0, 0]), 0);
    const n = 4;
    const u = Array(n).fill(1 / n);
    assert.ok(Math.abs(shannon(u) - Math.log(n)) < 1e-12);
  });
});

describe("silico-stasis — settled rules", () => {
  const q = (over: Partial<Qty>): Qty => ({
    id: "energy",
    name: "energy",
    value: 0,
    unit: "RMS",
    rest: 0,
    scale: 1,
    source: "filament",
    ...over,
  });

  it("defines perturbation by position, not severity — rest has intensity 0", () => {
    assert.equal(intensityOf(q({ value: 0 })), 0);
    assert.ok(intensityOf(q({ value: 0.5 })) > 0);
  });

  it("gates which / intensity / how long", () => {
    assert.equal(layerOf(0, 10), "center");
    assert.equal(layerOf(0.3, 0), "room");
    assert.equal(layerOf(0.1, 0), "universe");
    assert.equal(layerOf(0.5, CUBE_DWELL), "cube");
  });

  it("does not start linear time while the cube is empty", () => {
    const now = 10;
    const ps = attachPerturbations([q({ value: 0 })], {}, now);
    const next = tickStasis(emptyStasis(), ps, now, TICK_SEC);
    assert.equal(next.timeSense, 0);
  });

  it("starts linear time once a perturbation occupies the cube", () => {
    const arrived = 0;
    const now = arrived + CUBE_DWELL + TICK_SEC;
    const occ = { energy: { arrived, last: now, intensity: 0.9 } };
    const ps = attachPerturbations([q({ id: "energy", value: 0.9, scale: 1 })], occ, now);
    assert.equal(ps[0]!.layer, "cube");
    const next = tickStasis({ timeSense: 0, shift: 0, occupancy: occ }, ps, now, TICK_SEC);
    assert.equal(next.timeSense, TICK_SEC);
  });

  it("the one that does not leave shifts the center more than a brief spike", () => {
    const spikeOcc = { energy: { arrived: 9.95, last: 10, intensity: 1 } };
    const holdOcc = { energy: { arrived: 0, last: 10, intensity: 0.6 } };
    const spikePs = attachPerturbations([q({ value: 1, scale: 1 })], spikeOcc, 10);
    const holdPs = attachPerturbations([q({ value: 0.6, scale: 1 })], holdOcc, 10);
    let spike = emptyStasis();
    let hold = emptyStasis();
    for (let i = 0; i < 40; i++) {
      const t = 10 + i * TICK_SEC;
      spike = tickStasis(spike, spikePs, t, TICK_SEC);
      hold = tickStasis(hold, holdPs, t, TICK_SEC);
    }
    assert.ok(
      hold.shift > spike.shift,
      `persistent 0.6 (${hold.shift}) should outrun brief 1.0 (${spike.shift})`,
    );
  });
});

describe("the shape", () => {
  it("is concentric — center inside cube inside room inside universe", () => {
    assert.ok(LAYER_R.center < LAYER_R.cube);
    assert.ok(LAYER_R.cube < LAYER_R.room);
    assert.ok(LAYER_R.room < LAYER_R.universe);
  });

  it("is a cube — twelve equal edges, origin at the middle", () => {
    assert.equal(CUBE_VERTS.length, 8);
    assert.equal(cubeEdgeLength(), 2);
    const c = cubeCentroid();
    assert.ok(Math.abs(c.x) < 1e-12);
    assert.ok(Math.abs(c.y) < 1e-12);
    assert.ok(Math.abs(c.z) < 1e-12);
  });

  it("places a named perturbation on a stable angle", () => {
    const q: Qty = {
      id: "f0",
      name: "F0",
      value: 1,
      unit: "Hz",
      rest: 0,
      scale: 1,
      source: "filament",
    };
    const p = attachPerturbations([q], { f0: { arrived: 0, last: 10, intensity: 1 } }, 10)[0]!;
    const a = placePerturbation(p);
    const b = placePerturbation(p);
    assert.equal(a.theta, b.theta);
    assert.equal(a.phi, b.phi);
    assert.equal(a.r, LAYER_R[p.layer]);
    assert.equal(hash32("f0"), hash32("f0"));
    const s = spherical(1, 0, Math.PI / 2);
    assert.ok(Math.abs(s.x - 1) < 1e-12);
    assert.ok(Math.abs(s.y) < 1e-12);
  });
});

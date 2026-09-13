import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractFrames } from "./dsp.ts";
import { encode } from "./encoder.ts";
import { decodePath, forceAlign, recognizeFrames, spansFromPath } from "./recognize.ts";
import { PHONE_INDEX } from "./phonemes.ts";
import { synthesize } from "./synth.ts";

describe("unknown audio → words", () => {
  it("recovers a synthesized line it was not given", () => {
    const line = "filament booth";
    const { pcm } = synthesize(line, { f0: 148, rate: 1 });
    const frames = extractFrames(pcm);
    const result = encode(frames);
    const rec = recognizeFrames(frames, result);
    const got = rec.transcript.toLowerCase();
    assert.ok(rec.aligned.length > 0, "expected aligned captions");
    assert.ok(
      got.includes("filament") && got.includes("booth"),
      `expected filament/booth in "${rec.transcript}"`,
    );
  });

  it("does not need the original text on the snapshot", () => {
    const { pcm } = synthesize("listen", { f0: 148, rate: 1 });
    const rec = recognizeFrames(extractFrames(pcm), encode(extractFrames(pcm)));
    assert.notEqual(rec.transcript, "");
    assert.ok(rec.aligned.some((w) => w.end > w.start));
  });
});

describe("lexicon decode", () => {
  it("segments an exact phone path into words with times", () => {
    const ids = [
      ...Array(4).fill(PHONE_INDEX.SIL),
      ...Array(3).fill(PHONE_INDEX.F),
      ...Array(3).fill(PHONE_INDEX.IH),
      ...Array(3).fill(PHONE_INDEX.L),
      ...Array(2).fill(PHONE_INDEX.AH),
      ...Array(2).fill(PHONE_INDEX.M),
      ...Array(2).fill(PHONE_INDEX.AH),
      ...Array(2).fill(PHONE_INDEX.N),
      ...Array(3).fill(PHONE_INDEX.T),
      ...Array(3).fill(PHONE_INDEX.SIL),
      ...Array(3).fill(PHONE_INDEX.B),
      ...Array(4).fill(PHONE_INDEX.UW),
      ...Array(3).fill(PHONE_INDEX.TH),
    ];
    const rec = decodePath(ids, 0.01);
    assert.equal(rec.transcript, "filament booth");
    assert.equal(rec.aligned.length, 2);
    assert.ok(rec.aligned[0]!.start < rec.aligned[1]!.start);
  });
});

describe("force align", () => {
  it("puts known words on the CTC timeline", () => {
    const ids = [
      ...Array(2).fill(PHONE_INDEX.SIL),
      ...Array(4).fill(PHONE_INDEX.B),
      ...Array(6).fill(PHONE_INDEX.UW),
      ...Array(4).fill(PHONE_INDEX.TH),
    ];
    const aligned = forceAlign("booth", ids, 0.01);
    assert.equal(aligned.length, 1);
    assert.equal(aligned[0]!.word, "booth");
    assert.ok(aligned[0]!.end > aligned[0]!.start);
  });
});

describe("spans", () => {
  it("drops SIL and keeps duration", () => {
    const spans = spansFromPath([0, 0, PHONE_INDEX.B!, PHONE_INDEX.B!, 0], 0.01);
    assert.equal(spans.length, 1);
    assert.equal(spans[0]!.id, PHONE_INDEX.B);
    assert.ok(Math.abs(spans[0]!.end - spans[0]!.start - 0.02) < 1e-9);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeBytes,
  encodeText,
  hexDump,
  inspectText,
  parseHex,
  StreamDecoder,
  StreamEncoder,
} from "./stream.ts";

function hexOf(bytes: Uint8Array) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
}

describe("encode / decode round-trip", () => {
  it("utf-8 keeps the demo line", () => {
    const { bytes, state } = encodeText("Filament in. Codec. Booth out.", "utf-8");
    const { text, replacements } = decodeBytes(bytes, "utf-8");
    assert.equal(text, "Filament in. Codec. Booth out.");
    assert.equal(replacements, 0);
    assert.equal(state.replacements, 0);
    assert.equal(state.leadSurrogate, -1);
  });

  it("utf-8 encodes 𝄞 as f0 9d 84 9e", () => {
    const { bytes } = encodeText("𝄞", "utf-8");
    assert.equal(hexOf(bytes), "f0 9d 84 9e");
    assert.equal(decodeBytes(bytes, "utf-8").text, "𝄞");
  });

  it("utf-16le splits 𝄞 into d834 dd1e", () => {
    const { bytes } = encodeText("𝄞", "utf-16le");
    assert.equal(hexOf(bytes), "34 d8 1e dd");
    const units = inspectText("𝄞", "utf-16le");
    assert.deepEqual(units[0]?.surrogate, [0xd834, 0xdd1e]);
    assert.equal(decodeBytes(bytes, "utf-16le").text, "𝄞");
  });

  it("utf-16be is the swapped pair", () => {
    const { bytes } = encodeText("𝄞", "utf-16be");
    assert.equal(hexOf(bytes), "d8 34 dd 1e");
    assert.equal(decodeBytes(bytes, "utf-16be").text, "𝄞");
  });

  it("utf-32le is one code point, four bytes", () => {
    const { bytes } = encodeText("A", "utf-32le");
    assert.equal(hexOf(bytes), "41 00 00 00");
    assert.equal(decodeBytes(bytes, "utf-32le").text, "A");
  });

  it("ascii replaces CJK", () => {
    const { bytes, state } = encodeText("你好", "ascii");
    assert.equal(state.replacements, 2);
    assert.equal(hexOf(bytes), "3f 3f");
  });

  it("windows-1252 encodes euro as 0x80", () => {
    const { bytes } = encodeText("€", "windows-1252");
    assert.equal(hexOf(bytes), "80");
    assert.equal(decodeBytes(bytes, "windows-1252").text, "€");
  });

  it("latin1 is byte = code point", () => {
    const { bytes } = encodeText("é", "latin1");
    assert.equal(bytes[0], 0xe9);
    assert.equal(decodeBytes(bytes, "latin1").text, "é");
  });
});

describe("streaming encoder", () => {
  it("holds a lead surrogate across write, flushes on end", () => {
    const enc = new StreamEncoder("utf-8");
    const a = enc.write("\uD834");
    assert.equal(a.length, 0);
    assert.equal(enc.state().leadSurrogate, 0xd834);
    const b = enc.write("\uDD1E");
    assert.equal(hexOf(b), "f0 9d 84 9e");
    assert.equal(enc.end().length, 0);
    assert.equal(enc.state().leadSurrogate, -1);
  });

  it("replaces a dangling lead on end", () => {
    const enc = new StreamEncoder("utf-8");
    enc.write("\uD800");
    const tail = enc.end();
    assert.equal(hexOf(tail), "3f");
    assert.equal(enc.state().replacements, 1);
  });
});

describe("streaming decoder", () => {
  it("buffers an incomplete utf-8 sequence until the rest arrives", () => {
    const dec = new StreamDecoder("utf-8");
    const first = dec.write(Uint8Array.from([0xf0, 0x9d]));
    assert.equal(first, "");
    assert.equal(dec.state().pending, 2);
    const rest = dec.write(Uint8Array.from([0x84, 0x9e]));
    assert.equal(rest, "𝄞");
    assert.equal(dec.state().pending, 0);
    assert.equal(dec.end(), "");
  });

  it("flushes leftover bytes as replacement on end", () => {
    const dec = new StreamDecoder("utf-8");
    dec.write(Uint8Array.from([0xf0, 0x9d]));
    const tail = dec.end();
    assert.equal(tail, "\uFFFD");
    assert.equal(dec.state().replacements, 1);
    assert.equal(dec.state().pending, 0);
  });

  it("rejects overlong utf-8", () => {
    const { text, replacements } = decodeBytes(Uint8Array.from([0xc0, 0x80]), "utf-8");
    assert.equal(replacements > 0, true);
    assert.notEqual(text, "\u0000");
  });

  it("utf-16le unpaired trail is a replacement", () => {
    const { text, replacements } = decodeBytes(Uint8Array.from([0x1e, 0xdd]), "utf-16le");
    assert.equal(text, "\uFFFD");
    assert.equal(replacements, 1);
  });
});

describe("hex helpers", () => {
  it("parseHex accepts 0x, spaces, and odd nibble padding", () => {
    assert.deepEqual(Array.from(parseHex("0x48 65 6c 6c 6f")), [0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    assert.equal(parseHex("a").length, 1);
    assert.equal(parseHex("a")[0], 0xa0);
  });

  it("hexDump rows stay 16 wide", () => {
    const rows = hexDump(parseHex("48 65 6c 6c 6f"));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.ascii, "Hello");
  });
});

/**
 * Streaming text encoder / decoder.
 * Architecture from the DBCS codec: write/end, lead surrogates,
 * replacement on UNASSIGNED. No Node Buffer — Uint8Array.
 */

export const UNASSIGNED = -1;
const LEAD_MIN = 0xd800;
const LEAD_MAX = 0xdbff;
const TRAIL_MIN = 0xdc00;
const TRAIL_MAX = 0xdfff;

export type EncodingId =
  | "utf-8"
  | "utf-16le"
  | "utf-16be"
  | "utf-32le"
  | "utf-32be"
  | "ascii"
  | "latin1"
  | "windows-1252"
  | "gb18030";

export const ENCODINGS: { id: EncodingId; label: string; note: string }[] = [
  { id: "utf-8", label: "UTF-8", note: "Unicode, 1–4 bytes" },
  { id: "utf-16le", label: "UTF-16LE", note: "Surrogate pairs, little-endian" },
  { id: "utf-16be", label: "UTF-16BE", note: "Surrogate pairs, big-endian" },
  { id: "utf-32le", label: "UTF-32LE", note: "One code point, four bytes" },
  { id: "utf-32be", label: "UTF-32BE", note: "One code point, four bytes" },
  { id: "ascii", label: "ASCII", note: "7-bit, replacement on high bytes" },
  { id: "latin1", label: "Latin-1", note: "ISO-8859-1, byte = code point" },
  { id: "windows-1252", label: "Windows-1252", note: "Latin-1 with 0x80–0x9F" },
  { id: "gb18030", label: "GB18030", note: "4-byte Unicode mapping" },
];

const ENCODING_IDS = new Set<string>(ENCODINGS.map((e) => e.id));

export function isEncodingId(v: unknown): v is EncodingId {
  return typeof v === "string" && ENCODING_IDS.has(v);
}

/** CP1252 overrides for 0x80–0x9F (rest matches Latin-1). */
const CP1252_FROM = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c,
  0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d,
  0x017e, 0x0178,
];
const CP1252_TO = new Map<number, number>();
CP1252_FROM.forEach((cp, i) => {
  if (cp !== 0x80 + i) CP1252_TO.set(cp, 0x80 + i);
});

export type EncoderState = {
  leadSurrogate: number;
  replacements: number;
  units: number;
};

export type DecoderState = {
  pending: number;
  leadSurrogate: number;
  replacements: number;
  units: number;
};

const REPLACEMENT = 0xfffd;
const DEF_BYTE = 0x3f;
const CP_CHUNK = 8192;

function fromCodePoints(cps: number[]): string {
  if (cps.length === 0) return "";
  if (cps.length <= CP_CHUNK) return String.fromCodePoint(...cps);
  let out = "";
  for (let i = 0; i < cps.length; i += CP_CHUNK) {
    out += String.fromCodePoint(...cps.slice(i, i + CP_CHUNK));
  }
  return out;
}

function pushByte(out: number[], b: number) {
  out.push(b & 0xff);
}
function pushU16(out: number[], cp: number, le: boolean) {
  if (le) {
    pushByte(out, cp);
    pushByte(out, cp >> 8);
  } else {
    pushByte(out, cp >> 8);
    pushByte(out, cp);
  }
}
function pushU32(out: number[], cp: number, le: boolean) {
  if (le) {
    pushByte(out, cp);
    pushByte(out, cp >> 8);
    pushByte(out, cp >> 16);
    pushByte(out, cp >> 24);
  } else {
    pushByte(out, cp >> 24);
    pushByte(out, cp >> 16);
    pushByte(out, cp >> 8);
    pushByte(out, cp);
  }
}

function encodeUtf8(cp: number, out: number[]) {
  if (cp < 0x80) pushByte(out, cp);
  else if (cp < 0x800) {
    pushByte(out, 0xc0 | (cp >> 6));
    pushByte(out, 0x80 | (cp & 0x3f));
  } else if (cp < 0x10000) {
    pushByte(out, 0xe0 | (cp >> 12));
    pushByte(out, 0x80 | ((cp >> 6) & 0x3f));
    pushByte(out, 0x80 | (cp & 0x3f));
  } else {
    pushByte(out, 0xf0 | (cp >> 18));
    pushByte(out, 0x80 | ((cp >> 12) & 0x3f));
    pushByte(out, 0x80 | ((cp >> 6) & 0x3f));
    pushByte(out, 0x80 | (cp & 0x3f));
  }
}

/** Range starts: Unicode, matching 4-byte pointer. Binary search like the codec. */
const GB_U = [0x80, 0x10000];
const GB_P = [0x0000, 0x2e248];

function findIdx(table: number[], val: number) {
  if (!table.length || table[0]! > val) return -1;
  let l = 0;
  let r = table.length;
  while (l < r - 1) {
    const mid = l + ((r - l + 1) >> 1);
    if (table[mid]! <= val) l = mid;
    else r = mid;
  }
  return l;
}

function gb18030Bytes(cp: number, out: number[]) {
  if (cp < 0x80) {
    pushByte(out, cp);
    return;
  }
  const idx = findIdx(GB_U, cp);
  if (idx < 0) {
    pushByte(out, DEF_BYTE);
    return;
  }
  let n = GB_P[idx]! + (cp - GB_U[idx]!);
  const b1 = 0x81 + Math.floor(n / 12600);
  n %= 12600;
  const b2 = 0x30 + Math.floor(n / 1260);
  n %= 1260;
  const b3 = 0x81 + Math.floor(n / 10);
  const b4 = 0x30 + (n % 10);
  if (b1 > 0xfe || b3 > 0xfe || b2 > 0x39 || b4 > 0x39) {
    pushByte(out, DEF_BYTE);
    return;
  }
  pushByte(out, b1);
  pushByte(out, b2);
  pushByte(out, b3);
  pushByte(out, b4);
}

function encodeCodePoint(cp: number, enc: EncodingId, out: number[]): boolean {
  if (cp < 0) return false;
  switch (enc) {
    case "utf-8":
      encodeUtf8(cp, out);
      return true;
    case "utf-16le":
    case "utf-16be": {
      const le = enc === "utf-16le";
      if (cp < 0x10000) pushU16(out, cp, le);
      else {
        const u = cp - 0x10000;
        pushU16(out, 0xd800 | (u >> 10), le);
        pushU16(out, 0xdc00 | (u & 0x3ff), le);
      }
      return true;
    }
    case "utf-32le":
      pushU32(out, cp, true);
      return true;
    case "utf-32be":
      pushU32(out, cp, false);
      return true;
    case "ascii":
      if (cp < 0x80) pushByte(out, cp);
      else return false;
      return true;
    case "latin1":
      if (cp < 0x100) pushByte(out, cp);
      else return false;
      return true;
    case "windows-1252": {
      if (cp < 0x80 || (cp < 0x100 && cp > 0x9f)) pushByte(out, cp);
      else if (CP1252_TO.has(cp)) pushByte(out, CP1252_TO.get(cp)!);
      else return false;
      return true;
    }
    case "gb18030":
      gb18030Bytes(cp, out);
      return true;
  }
}

export class StreamEncoder {
  leadSurrogate = -1;
  replacements = 0;
  units = 0;
  readonly encoding: EncodingId;

  constructor(encoding: EncodingId) {
    this.encoding = encoding;
  }

  write(str: string): Uint8Array {
    const out: number[] = [];
    let lead = this.leadSurrogate;
    let nextChar = -1;
    let i = 0;
    while (true) {
      let uCode: number;
      if (nextChar === -1) {
        if (i === str.length) break;
        uCode = str.charCodeAt(i++);
      } else {
        uCode = nextChar;
        nextChar = -1;
      }

      if (uCode >= LEAD_MIN && uCode < 0xe000) {
        if (uCode <= LEAD_MAX) {
          if (lead === -1) {
            lead = uCode;
            continue;
          }
          lead = uCode;
          uCode = UNASSIGNED;
        } else if (lead !== -1) {
          uCode = 0x10000 + (lead - LEAD_MIN) * 0x400 + (uCode - TRAIL_MIN);
          lead = -1;
        } else {
          uCode = UNASSIGNED;
        }
      } else if (lead !== -1) {
        nextChar = uCode;
        uCode = UNASSIGNED;
        lead = -1;
      }

      this.units++;
      if (uCode === UNASSIGNED || !encodeCodePoint(uCode, this.encoding, out)) {
        this.replacements++;
        pushByte(out, DEF_BYTE);
      }
    }
    this.leadSurrogate = lead;
    return Uint8Array.from(out);
  }

  end(): Uint8Array {
    const out: number[] = [];
    if (this.leadSurrogate !== -1) {
      this.replacements++;
      pushByte(out, DEF_BYTE);
      this.leadSurrogate = -1;
    }
    return Uint8Array.from(out);
  }

  state(): EncoderState {
    return {
      leadSurrogate: this.leadSurrogate,
      replacements: this.replacements,
      units: this.units,
    };
  }
}

export function encodeText(
  str: string,
  encoding: EncodingId,
): { bytes: Uint8Array; state: EncoderState } {
  const enc = new StreamEncoder(encoding);
  const a = enc.write(str);
  const b = enc.end();
  const bytes = new Uint8Array(a.length + b.length);
  bytes.set(a, 0);
  bytes.set(b, a.length);
  return { bytes, state: enc.state() };
}

function readU16(buf: Uint8Array, i: number, le: boolean) {
  return le ? buf[i]! | (buf[i + 1]! << 8) : (buf[i]! << 8) | buf[i + 1]!;
}
function readU32(buf: Uint8Array, i: number, le: boolean) {
  return le
    ? buf[i]! | (buf[i + 1]! << 8) | (buf[i + 2]! << 16) | (buf[i + 3]! << 24)
    : (buf[i]! << 24) | (buf[i + 1]! << 16) | (buf[i + 2]! << 8) | buf[i + 3]!;
}

function concatPending(pending: number[], buf: Uint8Array): Uint8Array {
  if (pending.length === 0) return buf;
  const data = new Uint8Array(pending.length + buf.length);
  data.set(pending, 0);
  data.set(buf, pending.length);
  return data;
}

function tryGb18030(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("gb18030", { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

function gb18030PointerToCp(ptr: number): number {
  const idx = findIdx(GB_P, ptr);
  if (idx < 0) return REPLACEMENT;
  return GB_U[idx]! + ptr - GB_P[idx]!;
}

export class StreamDecoder {
  pendingBytes: number[] = [];
  leadSurrogate = -1;
  replacements = 0;
  units = 0;
  readonly encoding: EncodingId;

  constructor(encoding: EncodingId) {
    this.encoding = encoding;
  }

  write(buf: Uint8Array): string {
    const data = concatPending(this.pendingBytes, buf);
    this.pendingBytes = [];
    const cps: number[] = [];
    const enc = this.encoding;

    if (enc === "utf-8") this.decodeUtf8(data, cps);
    else if (enc === "utf-16le" || enc === "utf-16be")
      this.decodeUtf16(data, cps, enc === "utf-16le");
    else if (enc === "utf-32le" || enc === "utf-32be")
      this.decodeUtf32(data, cps, enc === "utf-32le");
    else if (enc === "ascii" || enc === "latin1") this.decodeLatin(data, cps, enc === "ascii");
    else if (enc === "windows-1252") this.decodeCp1252(data, cps);
    else this.decodeGb18030(data, cps);

    this.units += cps.length;
    return fromCodePoints(cps);
  }

  end(): string {
    const cps: number[] = [];
    if (this.encoding === "gb18030" && this.pendingBytes.length) {
      const rest = Uint8Array.from(this.pendingBytes);
      const via = tryGb18030(rest);
      if (via !== null) {
        this.pendingBytes = [];
        this.units += via.length;
        return via;
      }
    }
    if (this.leadSurrogate !== -1) {
      cps.push(REPLACEMENT);
      this.replacements++;
      this.leadSurrogate = -1;
    }
    if (this.pendingBytes.length) {
      cps.push(REPLACEMENT);
      this.replacements++;
      this.pendingBytes = [];
    }
    this.units += cps.length;
    return fromCodePoints(cps);
  }

  state(): DecoderState {
    return {
      pending: this.pendingBytes.length,
      leadSurrogate: this.leadSurrogate,
      replacements: this.replacements,
      units: this.units,
    };
  }

  private replace(cps: number[]) {
    cps.push(REPLACEMENT);
    this.replacements++;
  }

  private decodeUtf8(data: Uint8Array, cps: number[]) {
    let i = 0;
    while (i < data.length) {
      const b = data[i]!;
      let need = 0;
      let cp = 0;
      if (b < 0x80) {
        cps.push(b);
        i += 1;
        continue;
      }
      if (b < 0xc2 || b >= 0xf5) {
        this.replace(cps);
        i += 1;
        continue;
      }
      if (b < 0xe0) {
        need = 1;
        cp = b & 0x1f;
      } else if (b < 0xf0) {
        need = 2;
        cp = b & 0x0f;
      } else {
        need = 3;
        cp = b & 0x07;
      }
      if (i + need >= data.length) {
        this.pendingBytes = Array.from(data.subarray(i));
        break;
      }
      let ok = true;
      for (let k = 1; k <= need; k++) {
        const c = data[i + k]!;
        if ((c & 0xc0) !== 0x80) {
          ok = false;
          break;
        }
        cp = (cp << 6) | (c & 0x3f);
      }
      if (!ok) {
        this.replace(cps);
        i += 1;
        continue;
      }
      const min = need === 1 ? 0x80 : need === 2 ? 0x800 : 0x10000;
      if (cp < min || cp > 0x10ffff || (cp >= LEAD_MIN && cp <= TRAIL_MAX)) {
        this.replace(cps);
        i += 1 + need;
        continue;
      }
      cps.push(cp);
      i += 1 + need;
    }
  }

  private decodeUtf16(data: Uint8Array, cps: number[], le: boolean) {
    let i = 0;
    if (this.leadSurrogate !== -1) {
      if (i + 1 >= data.length) {
        this.pendingBytes = Array.from(data);
        return;
      }
      const v = readU16(data, i, le);
      if (v >= TRAIL_MIN && v <= TRAIL_MAX) {
        cps.push(0x10000 + ((this.leadSurrogate - LEAD_MIN) << 10) + (v - TRAIL_MIN));
        this.leadSurrogate = -1;
        i += 2;
      } else {
        this.replace(cps);
        this.leadSurrogate = -1;
      }
    }
    while (i + 1 < data.length) {
      const u = readU16(data, i, le);
      i += 2;
      if (u >= LEAD_MIN && u <= LEAD_MAX) {
        if (i + 1 < data.length) {
          const v = readU16(data, i, le);
          if (v >= TRAIL_MIN && v <= TRAIL_MAX) {
            cps.push(0x10000 + ((u - LEAD_MIN) << 10) + (v - TRAIL_MIN));
            i += 2;
          } else {
            this.replace(cps);
          }
        } else {
          this.leadSurrogate = u;
        }
      } else if (u >= TRAIL_MIN && u <= TRAIL_MAX) {
        this.replace(cps);
      } else {
        cps.push(u);
      }
    }
    if (i < data.length) this.pendingBytes = [data[i]!];
  }

  private decodeUtf32(data: Uint8Array, cps: number[], le: boolean) {
    let i = 0;
    while (i + 3 < data.length) {
      const u = readU32(data, i, le) >>> 0;
      i += 4;
      if (u > 0x10ffff || (u >= LEAD_MIN && u <= TRAIL_MAX)) this.replace(cps);
      else cps.push(u);
    }
    if (i < data.length) this.pendingBytes = Array.from(data.subarray(i));
  }

  private decodeLatin(data: Uint8Array, cps: number[], ascii: boolean) {
    for (let i = 0; i < data.length; i++) {
      const b = data[i]!;
      if (ascii && b > 0x7f) this.replace(cps);
      else cps.push(b);
    }
  }

  private decodeCp1252(data: Uint8Array, cps: number[]) {
    for (let i = 0; i < data.length; i++) {
      const b = data[i]!;
      cps.push(b >= 0x80 && b <= 0x9f ? CP1252_FROM[b - 0x80]! : b);
    }
  }

  private decodeGb18030(data: Uint8Array, cps: number[]) {
    let i = 0;
    while (i < data.length) {
      const b = data[i]!;
      if (b < 0x80) {
        cps.push(b);
        i += 1;
        continue;
      }
      if (i + 1 >= data.length) {
        this.pendingBytes = Array.from(data.subarray(i));
        break;
      }
      const b2 = data[i + 1]!;
      if (b >= 0x81 && b <= 0xfe && b2 >= 0x30 && b2 <= 0x39) {
        if (i + 3 >= data.length) {
          this.pendingBytes = Array.from(data.subarray(i));
          break;
        }
        const b3 = data[i + 2]!;
        const b4 = data[i + 3]!;
        const slice = data.subarray(i, i + 4);
        const via = tryGb18030(slice);
        if (via !== null && via !== "\uFFFD") {
          for (const ch of via) cps.push(ch.codePointAt(0) ?? REPLACEMENT);
        } else if (b3 >= 0x81 && b3 <= 0xfe && b4 >= 0x30 && b4 <= 0x39) {
          const ptr =
            (b - 0x81) * 12600 + (b2 - 0x30) * 1260 + (b3 - 0x81) * 10 + (b4 - 0x30);
          const cp = gb18030PointerToCp(ptr);
          if (cp === REPLACEMENT) this.replace(cps);
          else cps.push(cp);
        } else {
          this.replace(cps);
          i += 1;
          continue;
        }
        i += 4;
        continue;
      }
      if (b >= 0x81 && b <= 0xfe && ((b2 >= 0x40 && b2 <= 0x7e) || (b2 >= 0x80 && b2 <= 0xfe))) {
        const slice = data.subarray(i, i + 2);
        const via = tryGb18030(slice);
        if (via !== null) {
          for (const ch of via) cps.push(ch.codePointAt(0) ?? REPLACEMENT);
        } else {
          this.replace(cps);
        }
        i += 2;
        continue;
      }
      this.replace(cps);
      i += 1;
    }
  }
}

export function decodeBytes(
  buf: Uint8Array,
  encoding: EncodingId,
): { text: string; replacements: number } {
  const dec = new StreamDecoder(encoding);
  const text = dec.write(buf) + dec.end();
  return { text, replacements: dec.replacements };
}

export function hexDump(bytes: Uint8Array, width = 16) {
  const rows: { offset: number; hex: string[]; ascii: string }[] = [];
  for (let i = 0; i < bytes.length; i += width) {
    const slice = bytes.subarray(i, i + width);
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, "0"));
    const ascii = Array.from(slice, (b) =>
      b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "·",
    ).join("");
    rows.push({ offset: i, hex, ascii });
  }
  return rows;
}

export function parseHex(input: string): Uint8Array {
  const clean = input.replace(/0x/gi, " ").replace(/[^0-9a-f]/gi, "");
  const padded = clean.length % 2 ? clean + "0" : clean;
  const bytes = new Uint8Array(padded.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export type CodeUnit = {
  cp: number;
  glyph: string;
  units: number[];
  bytes: number[];
  surrogate?: [number, number];
};

export function inspectText(str: string, encoding: EncodingId): CodeUnit[] {
  const out: CodeUnit[] = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0) ?? 0;
    const units: number[] = [];
    if (cp > 0xffff) {
      const u = cp - 0x10000;
      units.push(0xd800 | (u >> 10), 0xdc00 | (u & 0x3ff));
    } else units.push(cp);
    const buf: number[] = [];
    encodeCodePoint(cp, encoding, buf);
    out.push({
      cp,
      glyph: ch,
      units,
      bytes: buf,
      surrogate: units.length === 2 ? [units[0]!, units[1]!] : undefined,
    });
  }
  return out;
}

/** ARPAbet inventory with Klatt-style formant targets. SIL is the blank. */

export type Phone = {
  id: string;
  /** Display glyph */
  g: string;
  kind: "vowel" | "glide" | "nasal" | "stop" | "fric" | "affric" | "liq" | "sil";
  f1: number;
  f2: number;
  f3: number;
  bw1: number;
  bw2: number;
  voiced: boolean;
  dur: number;
};

export const PHONES: Phone[] = [
  { id: "SIL", g: "∅", kind: "sil", f1: 200, f2: 900, f3: 2200, bw1: 90, bw2: 120, voiced: false, dur: 0.06 },
  { id: "AA", g: "ɑ", kind: "vowel", f1: 730, f2: 1090, f3: 2440, bw1: 70, bw2: 90, voiced: true, dur: 0.1 },
  { id: "AE", g: "æ", kind: "vowel", f1: 660, f2: 1720, f3: 2410, bw1: 70, bw2: 100, voiced: true, dur: 0.1 },
  { id: "AH", g: "ʌ", kind: "vowel", f1: 640, f2: 1190, f3: 2390, bw1: 80, bw2: 90, voiced: true, dur: 0.07 },
  { id: "AO", g: "ɔ", kind: "vowel", f1: 570, f2: 840, f3: 2410, bw1: 70, bw2: 80, voiced: true, dur: 0.1 },
  { id: "AW", g: "aʊ", kind: "vowel", f1: 570, f2: 980, f3: 2300, bw1: 80, bw2: 90, voiced: true, dur: 0.14 },
  { id: "AY", g: "aɪ", kind: "vowel", f1: 660, f2: 1720, f3: 2410, bw1: 80, bw2: 100, voiced: true, dur: 0.14 },
  { id: "EH", g: "ɛ", kind: "vowel", f1: 530, f2: 1840, f3: 2480, bw1: 70, bw2: 90, voiced: true, dur: 0.08 },
  { id: "ER", g: "ɝ", kind: "vowel", f1: 490, f2: 1350, f3: 1690, bw1: 80, bw2: 90, voiced: true, dur: 0.12 },
  { id: "EY", g: "eɪ", kind: "vowel", f1: 400, f2: 2000, f3: 2550, bw1: 60, bw2: 90, voiced: true, dur: 0.13 },
  { id: "IH", g: "ɪ", kind: "vowel", f1: 390, f2: 1990, f3: 2550, bw1: 50, bw2: 90, voiced: true, dur: 0.07 },
  { id: "IY", g: "i", kind: "vowel", f1: 270, f2: 2290, f3: 3010, bw1: 50, bw2: 90, voiced: true, dur: 0.1 },
  { id: "OW", g: "oʊ", kind: "vowel", f1: 430, f2: 980, f3: 2300, bw1: 70, bw2: 80, voiced: true, dur: 0.13 },
  { id: "OY", g: "ɔɪ", kind: "vowel", f1: 550, f2: 920, f3: 2400, bw1: 70, bw2: 90, voiced: true, dur: 0.14 },
  { id: "UH", g: "ʊ", kind: "vowel", f1: 440, f2: 1020, f3: 2240, bw1: 70, bw2: 80, voiced: true, dur: 0.07 },
  { id: "UW", g: "u", kind: "vowel", f1: 300, f2: 870, f3: 2240, bw1: 60, bw2: 80, voiced: true, dur: 0.1 },
  { id: "B", g: "b", kind: "stop", f1: 200, f2: 720, f3: 2400, bw1: 60, bw2: 90, voiced: true, dur: 0.06 },
  { id: "D", g: "d", kind: "stop", f1: 200, f2: 1700, f3: 2600, bw1: 60, bw2: 100, voiced: true, dur: 0.05 },
  { id: "G", g: "g", kind: "stop", f1: 200, f2: 1400, f3: 2200, bw1: 80, bw2: 120, voiced: true, dur: 0.06 },
  { id: "P", g: "p", kind: "stop", f1: 200, f2: 720, f3: 2400, bw1: 80, bw2: 120, voiced: false, dur: 0.06 },
  { id: "T", g: "t", kind: "stop", f1: 200, f2: 1700, f3: 2600, bw1: 80, bw2: 140, voiced: false, dur: 0.05 },
  { id: "K", g: "k", kind: "stop", f1: 200, f2: 1400, f3: 2200, bw1: 100, bw2: 140, voiced: false, dur: 0.06 },
  { id: "F", g: "f", kind: "fric", f1: 400, f2: 1100, f3: 3800, bw1: 200, bw2: 400, voiced: false, dur: 0.09 },
  { id: "V", g: "v", kind: "fric", f1: 300, f2: 1100, f3: 2800, bw1: 120, bw2: 200, voiced: true, dur: 0.07 },
  { id: "TH", g: "θ", kind: "fric", f1: 400, f2: 1400, f3: 3600, bw1: 180, bw2: 300, voiced: false, dur: 0.08 },
  { id: "DH", g: "ð", kind: "fric", f1: 300, f2: 1400, f3: 2700, bw1: 120, bw2: 180, voiced: true, dur: 0.06 },
  { id: "S", g: "s", kind: "fric", f1: 500, f2: 1800, f3: 7000, bw1: 200, bw2: 400, voiced: false, dur: 0.09 },
  { id: "Z", g: "z", kind: "fric", f1: 300, f2: 1700, f3: 5000, bw1: 140, bw2: 250, voiced: true, dur: 0.07 },
  { id: "SH", g: "ʃ", kind: "fric", f1: 400, f2: 1800, f3: 3500, bw1: 180, bw2: 280, voiced: false, dur: 0.1 },
  { id: "ZH", g: "ʒ", kind: "fric", f1: 350, f2: 1800, f3: 3200, bw1: 140, bw2: 220, voiced: true, dur: 0.08 },
  { id: "HH", g: "h", kind: "fric", f1: 500, f2: 1500, f3: 2500, bw1: 300, bw2: 400, voiced: false, dur: 0.06 },
  { id: "CH", g: "tʃ", kind: "affric", f1: 300, f2: 1800, f3: 2800, bw1: 120, bw2: 200, voiced: false, dur: 0.09 },
  { id: "JH", g: "dʒ", kind: "affric", f1: 300, f2: 1800, f3: 2700, bw1: 100, bw2: 180, voiced: true, dur: 0.08 },
  { id: "M", g: "m", kind: "nasal", f1: 250, f2: 1000, f3: 2200, bw1: 60, bw2: 80, voiced: true, dur: 0.07 },
  { id: "N", g: "n", kind: "nasal", f1: 250, f2: 1600, f3: 2500, bw1: 60, bw2: 80, voiced: true, dur: 0.07 },
  { id: "NG", g: "ŋ", kind: "nasal", f1: 250, f2: 1200, f3: 2300, bw1: 70, bw2: 90, voiced: true, dur: 0.08 },
  { id: "L", g: "l", kind: "liq", f1: 360, f2: 1200, f3: 2600, bw1: 50, bw2: 80, voiced: true, dur: 0.07 },
  { id: "R", g: "r", kind: "liq", f1: 400, f2: 1100, f3: 1600, bw1: 70, bw2: 80, voiced: true, dur: 0.07 },
  { id: "W", g: "w", kind: "glide", f1: 300, f2: 700, f3: 2200, bw1: 60, bw2: 80, voiced: true, dur: 0.07 },
  { id: "Y", g: "j", kind: "glide", f1: 300, f2: 2100, f3: 3000, bw1: 50, bw2: 90, voiced: true, dur: 0.07 },
];

export const PHONE_INDEX = Object.fromEntries(PHONES.map((p, i) => [p.id, i])) as Record<string, number>;
export const N_PHONES = PHONES.length;

export const LEXICON: Record<string, string[]> = {
  the: ["DH", "AH"],
  encoder: ["EH", "N", "K", "OW", "D", "ER"],
  replaced: ["R", "IH", "P", "L", "EY", "S", "T"],
  kaldi: ["K", "AE", "L", "D", "IY"],
  filament: ["F", "IH", "L", "AH", "M", "AH", "N", "T"],
  booth: ["B", "UW", "TH"],
  a: ["AH"],
  is: ["IH", "Z"],
  listening: ["L", "IH", "S", "AH", "N", "IH", "NG"],
  speaking: ["S", "P", "IY", "K", "IH", "NG"],
  ready: ["R", "EH", "D", "IY"],
  hello: ["HH", "AH", "L", "OW"],
  this: ["DH", "IH", "S"],
  speech: ["S", "P", "IY", "CH"],
  neural: ["N", "UH", "R", "AH", "L"],
  stack: ["S", "T", "AE", "K"],
  zipformer: ["Z", "IH", "P", "F", "AO", "R", "M", "ER"],
  retired: ["R", "IH", "T", "AY", "ER", "D"],
  and: ["AE", "N", "D"],
  to: ["T", "UW"],
  of: ["AH", "V"],
  for: ["F", "AO", "R"],
  you: ["Y", "UW"],
  i: ["AY"],
  we: ["W", "IY"],
  can: ["K", "AE", "N"],
  do: ["D", "UW"],
  that: ["DH", "AE", "T"],
  want: ["W", "AA", "N", "T"],
  an: ["AE", "N"],
  replace: ["R", "IH", "P", "L", "EY", "S"],
  voice: ["V", "OY", "S"],
  studio: ["S", "T", "UW", "D", "IY", "OW"],
  lattice: ["L", "AE", "T", "AH", "S"],
  listen: ["L", "IH", "S", "AH", "N"],
  speak: ["S", "P", "IY", "K"],
  codec: ["K", "OW", "D", "EH", "K"],
  in: ["IH", "N"],
  out: ["AW", "T"],
  middle: ["M", "IH", "D", "AH", "L"],
  decoder: ["D", "IY", "K", "OW", "D", "ER"],
  captions: ["K", "AE", "P", "SH", "AH", "N", "Z"],
  audio: ["AO", "D", "IY", "OW"],
  file: ["F", "AY", "L"],
  demo: ["D", "EH", "M", "OW"],
  line: ["L", "AY", "N"],
  unknown: ["AH", "N", "N", "OW", "N"],
  words: ["W", "ER", "D", "Z"],
  from: ["F", "R", "AH", "M"],
  with: ["W", "IH", "DH"],
  on: ["AA", "N"],
  it: ["IH", "T"],
  not: ["N", "AA", "T"],
  be: ["B", "IY"],
  are: ["AA", "R"],
  was: ["W", "AA", "Z"],
  have: ["HH", "AE", "V"],
  has: ["HH", "AE", "Z"],
  yes: ["Y", "EH", "S"],
  no: ["N", "OW"],
  ok: ["OW", "K", "EY"],
  please: ["P", "L", "IY", "Z"],
  thanks: ["TH", "AE", "NG", "K", "S"],
  time: ["T", "AY", "M"],
  now: ["N", "AW"],
  go: ["G", "OW"],
  stop: ["S", "T", "AA", "P"],
  start: ["S", "T", "AA", "R", "T"],
  record: ["R", "EH", "K", "ER", "D"],
  play: ["P", "L", "EY"],
  byte: ["B", "AY", "T"],
  hex: ["HH", "EH", "K", "S"],
  text: ["T", "EH", "K", "S", "T"],
  unicode: ["Y", "UW", "N", "IH", "K", "OW", "D"],
  being: ["B", "IY", "IH", "NG"],
  equilibrium: ["IY", "K", "W", "AH", "L", "IH", "B", "R", "IY", "AH", "M"],
  stasis: ["S", "T", "EY", "S", "IH", "S"],
  cube: ["K", "Y", "UW", "B"],
  room: ["R", "UW", "M"],
  center: ["S", "EH", "N", "T", "ER"],
};

const LETTER: Record<string, string[]> = {
  a: ["AE"],
  b: ["B"],
  c: ["K"],
  d: ["D"],
  e: ["EH"],
  f: ["F"],
  g: ["G"],
  h: ["HH"],
  i: ["IH"],
  j: ["JH"],
  k: ["K"],
  l: ["L"],
  m: ["M"],
  n: ["N"],
  o: ["OW"],
  p: ["P"],
  q: ["K"],
  r: ["R"],
  s: ["S"],
  t: ["T"],
  u: ["AH"],
  v: ["V"],
  w: ["W"],
  x: ["K", "S"],
  y: ["Y"],
  z: ["Z"],
};

export function g2p(word: string): string[] {
  const w = word.toLowerCase().replace(/[^a-z']/g, "");
  if (!w) return [];
  if (LEXICON[w]) return LEXICON[w]!;
  const out: string[] = [];
  for (const ch of w) {
    const p = LETTER[ch];
    if (p) out.push(...p);
  }
  return out.length ? out : ["AH"];
}

export type TimedPhone = { id: string; start: number; dur: number; word?: string };

export function textToPhones(text: string): TimedPhone[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const out: TimedPhone[] = [];
  let t = 0.12;
  out.push({ id: "SIL", start: 0, dur: t });
  for (const raw of words) {
    const word = raw.replace(/[^a-zA-Z'-]/g, "");
    if (!word) continue;
    const phones = g2p(word);
    phones.forEach((id, i) => {
      const proto = PHONES[PHONE_INDEX[id] ?? 0]!;
      const dur = proto.dur * (i === 0 || i === phones.length - 1 ? 1.05 : 0.95);
      out.push({ id, start: t, dur, word });
      t += dur;
    });
    out.push({ id: "SIL", start: t, dur: 0.08 });
    t += 0.08;
  }
  return out;
}

export function collapseCtc(ids: number[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const id of ids) {
    if (id !== prev && id !== 0) out.push(id);
    prev = id;
  }
  return out;
}

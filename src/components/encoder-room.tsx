import { useMemo, useState } from "react";
import { ArrowDown, Copy, RotateCcw } from "lucide-react";
import { ByteTape, HexRows } from "@/components/byte-tape";
import { Panel, Stat } from "@/components/panel";
import { Button } from "@/components/ui/button";
import {
  decodeBytes,
  encodeText,
  ENCODINGS,
  hexDump,
  inspectText,
  parseHex,
  StreamDecoder,
  type EncodingId,
} from "@/lib/encoder/stream";
import { DEMO_LINE, useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

function EncodingPicker({
  encoding,
  onChange,
}: {
  encoding: EncodingId;
  onChange: (id: EncodingId) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Encoding"
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
    >
      {ENCODINGS.map((enc) => (
        <button
          key={enc.id}
          type="button"
          role="radio"
          aria-checked={encoding === enc.id}
          aria-label={`${enc.label}. ${enc.note}`}
          title={enc.note}
          onClick={() => onChange(enc.id)}
          className={cn(
            "h-11 shrink-0 rounded-sm px-3 font-mono text-xs tracking-wide transition-colors duration-[var(--motion-quick)]",
            encoding === enc.id
              ? "bg-linen text-bg"
              : "bg-elevated text-muted hover:text-fg",
          )}
        >
          {enc.label}
        </button>
      ))}
    </div>
  );
}

export function EncoderRoom() {
  const text = useStudio((s) => s.encoderText);
  const setText = useStudio((s) => s.setEncoderText);
  const encoding = useStudio((s) => s.encoding);
  const setEncoding = useStudio((s) => s.setEncoding);
  const setBooth = useStudio((s) => s.setBoothText);
  const face = useStudio((s) => s.face);
  const setFace = useStudio((s) => s.setFace);
  const hexIn = useStudio((s) => s.hexIn);
  const setHexIn = useStudio((s) => s.setHexIn);
  const [copied, setCopied] = useState(false);

  const encoded = useMemo(() => {
    const result = encodeText(text, encoding);
    const units = inspectText(text, encoding);
    const decoded = decodeBytes(result.bytes, encoding);
    return { ...result, units, decoded };
  }, [text, encoding]);

  const fromHex = useMemo(() => {
    if (!hexIn.trim()) {
      return {
        buf: new Uint8Array(0),
        live: "",
        flushed: "",
        pending: 0,
        leadSurrogate: -1,
        replacements: 0,
        units: 0,
      };
    }
    const buf = parseHex(hexIn);
    const dec = new StreamDecoder(encoding);
    const live = dec.write(buf);
    const liveState = dec.state();
    const flushed = live + dec.end();
    return { buf, live, flushed, ...liveState };
  }, [hexIn, encoding]);

  const tape = face === "decoder" ? fromHex.buf : encoded.bytes;
  const units = face === "decoder" ? inspectText(fromHex.flushed, encoding) : encoded.units;

  const copyHex = async () => {
    const dump = hexDump(tape)
      .map((r) => r.hex.join(" "))
      .join("\n");
    try {
      await navigator.clipboard.writeText(dump);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-3 lg:col-span-12">
        <div
          role="tablist"
          aria-label="Codec face"
          className="inline-flex h-11 w-fit rounded-md bg-elevated p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={face === "encoder"}
            onClick={() => setFace("encoder")}
            className={cn(
              "h-9 rounded-sm px-4 text-sm transition-colors duration-[var(--motion-quick)]",
              face === "encoder" ? "bg-linen text-bg" : "text-muted hover:text-fg",
            )}
          >
            Encoder
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={face === "decoder"}
            onClick={() => setFace("decoder")}
            className={cn(
              "h-9 rounded-sm px-4 text-sm transition-colors duration-[var(--motion-quick)]",
              face === "decoder" ? "bg-linen text-bg" : "text-muted hover:text-fg",
            )}
          >
            Decoder
          </button>
        </div>
        <EncodingPicker encoding={encoding} onChange={setEncoding} />
      </div>

      {face === "encoder" ? (
        <>
          <Panel
            kicker="encoder.write"
            title="Unicode in"
            className="lg:col-span-5"
            action={
              <button
                type="button"
                className="h-11 font-mono text-xs text-muted hover:text-fg"
                onClick={() => setText(DEMO_LINE)}
              >
                reset
              </button>
            }
          >
            <label htmlFor="codec-unicode" className="sr-only">
              Unicode to encode
            </label>
            <textarea
              id="codec-unicode"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              rows={7}
              className="min-h-40 w-full resize-y rounded-md bg-elevated px-3 py-3 text-base leading-relaxed text-fg shadow-[var(--shadow-border)] outline-none transition-[box-shadow] duration-[var(--motion-quick)] focus:shadow-[var(--shadow-border-hover)]"
              placeholder="Type, paste, or take from Filament."
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  ["Demo", DEMO_LINE],
                  ["你好", "你好 · Codec"],
                  ["𝄞", "𝄞"],
                ] as const
              ).map(([label, sample]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setText(sample)}
                  className="h-11 rounded-sm bg-elevated px-3 font-mono text-xs text-muted hover:text-fg"
                >
                  {label}
                </button>
              ))}
            </div>
          </Panel>

          <Panel kicker="encoder.state" title="Streaming encoder" className="lg:col-span-7">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="bytes" value={String(encoded.bytes.length)} />
              <Stat label="units" value={String(encoded.state.units)} />
              <Stat
                label="lead surrogate"
                value={
                  encoded.state.leadSurrogate === -1
                    ? "clean"
                    : "0x" + encoded.state.leadSurrogate.toString(16)
                }
                hot={encoded.state.leadSurrogate !== -1}
              />
              <Stat
                label="replacement"
                value={String(encoded.state.replacements)}
                hot={encoded.state.replacements > 0}
              />
            </div>
            <p className="mt-4 font-mono text-xs tracking-widest text-subtle uppercase">
              byte tape
            </p>
            <div className="mt-2">
              <ByteTape bytes={encoded.bytes} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="quiet" onClick={copyHex}>
                <Copy />
                {copied ? "Copied" : "Copy hex"}
              </Button>
              <Button variant="quiet" onClick={() => setBooth(encoded.decoded.text)}>
                Send to Booth
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setText("");
                  setHexIn("");
                }}
              >
                <RotateCcw />
                Clear
              </Button>
            </div>
          </Panel>
        </>
      ) : (
        <>
          <Panel
            kicker="decoder.write"
            title="Bytes in"
            className="lg:col-span-5"
            action={<span className="font-mono text-xs text-subtle">{encoding}</span>}
          >
            <label htmlFor="codec-hex" className="sr-only">
              Hex bytes to decode
            </label>
            <textarea
              id="codec-hex"
              value={hexIn}
              onChange={(e) => setHexIn(e.target.value)}
              spellCheck={false}
              rows={7}
              className="min-h-40 w-full resize-y rounded-md bg-elevated px-3 py-3 font-mono text-sm text-fg shadow-[var(--shadow-border)] outline-none transition-[box-shadow] duration-[var(--motion-quick)] focus:shadow-[var(--shadow-border-hover)]"
              placeholder="Paste hex — 48 65 6c 6c 6f"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(
                [
                  ["Hello", "48 65 6c 6c 6f"],
                  ["𝄞 UTF-16LE", "34 d8 1e dd"],
                  ["From encoder", hexDump(encoded.bytes).map((r) => r.hex.join(" ")).join(" ")],
                ] as const
              ).map(([label, sample]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setHexIn(sample)}
                  className="h-11 rounded-sm bg-elevated px-3 font-mono text-xs text-muted hover:text-fg"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-start gap-2 text-sm">
              <ArrowDown className="mt-0.5 size-4 shrink-0 text-subtle" />
              <p className="min-w-0 break-words text-fg">
                {hexIn.trim() ? fromHex.live || "Waiting on the rest of the sequence." : "Decoder waits on a tape."}
              </p>
            </div>
          </Panel>

          <Panel kicker="decoder.state" title="Streaming decoder" className="lg:col-span-7">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="bytes" value={String(fromHex.buf.length)} />
              <Stat label="pending" value={String(fromHex.pending)} hot={fromHex.pending > 0} />
              <Stat
                label="lead surrogate"
                value={
                  fromHex.leadSurrogate === -1
                    ? "clean"
                    : "0x" + fromHex.leadSurrogate.toString(16)
                }
                hot={fromHex.leadSurrogate !== -1}
              />
              <Stat
                label="replacement"
                value={String(fromHex.replacements)}
                hot={fromHex.replacements > 0}
              />
            </div>
            <p className="mt-4 font-mono text-xs tracking-widest text-subtle uppercase">
              byte tape
            </p>
            <div className="mt-2">
              <ByteTape bytes={fromHex.buf} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="quiet" onClick={copyHex}>
                <Copy />
                {copied ? "Copied" : "Copy hex"}
              </Button>
              <Button
                variant="quiet"
                onClick={() => setBooth(fromHex.flushed)}
                disabled={!fromHex.flushed}
              >
                Send to Booth
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setHexIn("");
                }}
              >
                <RotateCcw />
                Clear
              </Button>
            </div>
          </Panel>
        </>
      )}

      <Panel kicker="code points" title="Surrogates & units" className="lg:col-span-12">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {units.length === 0 ? (
            <p className="text-sm text-muted">
              {face === "decoder" ? "Nothing to decode." : "Nothing to encode."}
            </p>
          ) : (
            units.slice(0, 80).map((u, i) => (
              <div key={i} className="w-20 shrink-0 rounded-md bg-elevated p-2">
                <p className="h-7 text-center text-lg leading-7 text-fg">
                  {u.glyph === " " ? "␣" : u.glyph === "\n" ? "↵" : u.glyph}
                </p>
                <p className="mt-1 text-center font-mono text-xs text-signal tabular-nums">
                  U+{u.cp.toString(16).toUpperCase().padStart(4, "0")}
                </p>
                {u.surrogate ? (
                  <p className="mt-1 text-center font-mono text-xs text-warn">
                    {u.surrogate.map((s) => s.toString(16)).join("·")}
                  </p>
                ) : (
                  <p className="mt-1 text-center font-mono text-xs text-subtle">
                    {u.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </Panel>

      <Panel kicker="dump" title="Hex" className="lg:col-span-12">
        <HexRows bytes={tape} />
        <p className="mt-3 text-sm text-muted">
          {face === "encoder" ? (
            <>
              Round-trip {encoded.decoded.replacements ? "with replacements" : "clean"}:{" "}
              <span className="text-fg">{encoded.decoded.text || "—"}</span>
            </>
          ) : (
            <>
              Flushed {fromHex.replacements ? "with replacements" : "clean"}:{" "}
              <span className="text-fg">{fromHex.flushed || "—"}</span>
            </>
          )}
        </p>
      </Panel>
    </div>
  );
}

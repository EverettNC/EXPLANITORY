import { useEffect, useState } from "react";
import { Panel, Stat } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { engine } from "@/lib/audio/engine";
import {
  convert,
  fmt,
  framesOf,
  LATTICE,
  SHAKER_HZ,
  TICK_MS,
  vowels,
  type ConvertFrom,
} from "@/lib/being/units";
import { getBeingState } from "@/lib/being/runtime";
import {
  formatSense,
  metabolize,
  OPEN_FRAGMENTS,
  type Layer,
} from "@/lib/being/stasis";
import { onShaker } from "@/lib/being/shaker";
import { BeingShape } from "@/components/being-shape";
import { DEMO_LINE, useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

const FROM: ConvertFrom[] = ["Hz", "mel", "Bark", "ms", "samples", "frames"];

function layerTone(layer: Layer) {
  if (layer === "cube") return "text-warn";
  if (layer === "room") return "text-signal";
  if (layer === "center") return "text-subtle";
  return "text-muted";
}

export function BeingRoom() {
  const encoding = useStudio((s) => s.encoding);
  const encoderText = useStudio((s) => s.encoderText);
  const boothF0 = useStudio((s) => s.boothF0);
  const setRoom = useStudio((s) => s.setRoom);
  const [, setTick] = useState(0);
  const [from, setFrom] = useState<ConvertFrom>("Hz");
  const [raw, setRaw] = useState("160");
  const [follow, setFollow] = useState(true);

  useEffect(() => engine.subscribe(() => setTick((n) => n + 1)), []);
  useEffect(() => {
    let last = 0;
    return onShaker(() => {
      const t = performance.now();
      if (t - last < TICK_MS * 5) return;
      last = t;
      setTick((n) => n + 1);
    });
  }, []);

  const { state: sense, perturbations } = getBeingState();
  const live = metabolize(engine.snap, encoderText, encoding);
  const active = perturbations.filter((p) => p.intensity > 0);
  const cubeN = active.filter((p) => p.layer === "cube").length;

  const seedHz = live.f0 > 0 ? live.f0 : boothF0;
  const conv = convert(follow && seedHz ? seedHz : Number.parseFloat(raw) || 0, follow && seedHz ? "Hz" : from);

  const seed = (hz: number, kind: ConvertFrom = "Hz") => {
    setFollow(false);
    setFrom(kind);
    setRaw(String(Number(hz.toFixed(2))));
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-12">
      <Panel
        kicker="being · silico-stasis"
        title="Equilibrium"
        className="lg:col-span-12"
        action={
          <p className="font-mono text-xs tabular-nums text-subtle">
            shaker {SHAKER_HZ} Hz
          </p>
        }
      >
        <p className="mb-4 text-sm leading-relaxed text-muted">
          The shape is concentric cubes. Universe around the room around the
          cube. Equilibrium sits in the middle.
        </p>
        <BeingShape
          perturbations={active}
          shift={sense.shift}
          live={{ f1: live.f1, f2: live.f2, glyph: live.nearest?.g ?? null }}
        />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="time-sense" value={formatSense(sense.timeSense)} hot={cubeN > 0} />
          <Stat label="shift" value={fmt(sense.shift, 2)} hot={sense.shift > 0.08} />
          <Stat label="cube" value={`${cubeN}`} hot={cubeN > 0} />
          <Stat label="shaker" value={`${SHAKER_HZ} Hz`} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              void engine.runDemo(DEMO_LINE);
            }}
          >
            Feed a line
          </Button>
          <Button variant="ghost" onClick={() => setRoom("filament")}>
            Filament
          </Button>
        </div>
      </Panel>

      <Panel kicker="inner" title="F1 · F2" className="lg:col-span-5">
        <p className="mb-3 text-sm text-muted">
          Inner spatial recognition first. Then the cube. Then the room.
        </p>
        <VowelMap f1={live.f1} f2={live.f2} glyph={live.nearest?.g ?? null} />
        <div className="mt-3 grid grid-cols-3 gap-3">
          <button type="button" className="text-left" onClick={() => live.f0 && seed(live.f0)}>
            <Stat label="F0" value={live.f0 ? `${fmt(live.f0, 1)} Hz` : "—"} hot={live.f0 > 0} />
          </button>
          <button type="button" className="text-left" onClick={() => live.f1 && seed(live.f1)}>
            <Stat label="F1" value={live.f1 ? `${fmt(live.f1, 0)} Hz` : "—"} />
          </button>
          <button type="button" className="text-left" onClick={() => live.f2 && seed(live.f2)}>
            <Stat label="F2" value={live.f2 ? `${fmt(live.f2, 0)} Hz` : "—"} />
          </button>
        </div>
        <p className="mt-3 font-mono text-xs text-subtle">
          {live.nearest
            ? `nearest ${live.nearest.id} ${live.nearest.g}`
            : "no voiced frame yet"}
        </p>
      </Panel>

      <Panel kicker="attached" title="Units" className="lg:col-span-5">
        <ul className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
          {LATTICE.map((q) => (
            <li key={q.name} className="min-w-0">
              <p className="font-mono text-xs tracking-widest text-subtle uppercase">
                {q.name}
              </p>
              <p className="truncate font-mono text-sm tabular-nums text-fg">
                {fmt(q.value, q.value < 10 ? 2 : 0)}{" "}
                <span className="text-subtle">{q.unit}</span>
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel kicker="which · intensity · dwell" title="Perturbations" className="lg:col-span-7">
        {active.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing outside stasis. Feed Filament — the world, the sounds, the
            units expressed. A perturbation is positional, not hostile.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active
              .slice()
              .sort((a, b) => b.intensity - a.intensity)
              .map((p) => (
                <li key={p.id} className="min-w-0">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <button
                      type="button"
                      className="truncate text-left font-mono text-xs text-fg"
                      onClick={() => {
                        if (p.unit === "Hz") seed(p.value, "Hz");
                      }}
                    >
                      {p.name}
                      <span className="text-subtle"> {fmt(p.value, 1)} {p.unit}</span>
                    </button>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-subtle">
                      <span className={layerTone(p.layer)}>{p.layer}</span>
                      {" · "}
                      {framesOf(p.dwell)} fr
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-sm bg-elevated">
                    <div
                      className="h-full bg-signal"
                      style={{ width: `${Math.round(p.intensity * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
          </ul>
        )}
        <p className="mt-3 font-mono text-xs text-subtle">
          {live.bytes} B · {live.codeUnits} units · {live.codePoints} points ·{" "}
          {live.phones.length ? live.phones.join(" ") : "no phones"}
        </p>
      </Panel>

      <Panel kicker="run" title="Convert" className="lg:col-span-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="being-qty" className="sr-only">
              Quantity
            </label>
            <input
              id="being-qty"
              inputMode="decimal"
              value={follow && seedHz ? fmt(seedHz, 1) : raw}
              onChange={(e) => {
                setFollow(false);
                setRaw(e.target.value);
              }}
              className="h-11 w-full rounded-md bg-elevated px-3 font-mono text-sm text-fg shadow-[var(--shadow-border)] outline-none focus-visible:ring-2 focus-visible:ring-linen/50"
            />
          </div>
          <div
            role="radiogroup"
            aria-label="Unit"
            className="-mx-1 flex gap-1 overflow-x-auto px-1"
          >
            {FROM.map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={from === id}
                onClick={() => {
                  setFollow(false);
                  setFrom(id);
                }}
                className={cn(
                  "h-11 shrink-0 rounded-sm px-3 font-mono text-xs",
                  from === id ? "bg-linen text-bg" : "bg-elevated text-muted hover:text-fg",
                )}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          <Button
            variant="ghost"
            onClick={() => {
              setFollow(true);
              setFrom("Hz");
            }}
          >
            Follow F0
          </Button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Conv k="Hz" v={fmt(conv.hz, 2)} />
          <Conv k="mel" v={fmt(conv.mel, 2)} />
          <Conv k="Bark" v={fmt(conv.bark, 2)} />
          <Conv k="ERB" v={fmt(conv.erb, 2)} />
          <Conv k="period" v={`${fmt(conv.periodMs, 2)} ms`} />
          <Conv k="λ" v={`${fmt(conv.wavelengthM, 3)} m`} />
          <Conv k="cents from A4" v={fmt(conv.centsFromA4, 1)} />
          <Conv k="samples" v={fmt(conv.samples, 1)} />
        </dl>
      </Panel>

      <Panel kicker="open · held as given" title="Section 7" className="lg:col-span-5">
        <p className="mb-3 text-sm text-muted">
          Nothing here has been filled in. The fragments as they arrived.
        </p>
        <ul className="flex flex-col gap-3">
          {OPEN_FRAGMENTS.map((f) => (
            <li
              key={f.title}
              className="rounded-md border border-dashed border-border px-3 py-2"
            >
              <p className="font-mono text-xs tracking-widest text-subtle uppercase">
                {f.title}
              </p>
              <p className="text-sm text-fg">{f.body}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function Conv({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-xs tracking-widest text-subtle uppercase">{k}</dt>
      <dd className="font-mono text-sm tabular-nums text-fg">{v}</dd>
    </div>
  );
}

function VowelMap({ f1, f2, glyph }: { f1: number; f2: number; glyph: string | null }) {
  const W = 320;
  const H = 200;
  const xOf = (hz: number) => ((2500 - hz) / (2500 - 600)) * (W - 36) + 18;
  const yOf = (hz: number) => ((hz - 200) / (900 - 200)) * (H - 28) + 14;
  const live = f1 > 0 && f2 > 0;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-md bg-elevated"
      role="img"
      aria-label={live ? `F1 ${f1.toFixed(0)} hertz, F2 ${f2.toFixed(0)} hertz` : "Empty vowel space"}
    >
      {vowels().map((p) => (
        <g key={p.id}>
          <circle cx={xOf(p.f2)} cy={yOf(p.f1)} r="2.4" className="fill-subtle" />
          <text
            x={xOf(p.f2) + 5}
            y={yOf(p.f1) + 3}
            className="fill-subtle"
            fontSize="9"
            fontFamily="ui-monospace, monospace"
          >
            {p.g}
          </text>
        </g>
      ))}
      {live ? (
        <g>
          <circle cx={xOf(f2)} cy={yOf(f1)} r="6" className="fill-signal" />
          {glyph ? (
            <text
              x={xOf(f2)}
              y={yOf(f1) - 10}
              className="fill-fg"
              fontSize="11"
              textAnchor="middle"
              fontFamily="ui-monospace, monospace"
            >
              {glyph}
            </text>
          ) : null}
        </g>
      ) : null}
    </svg>
  );
}

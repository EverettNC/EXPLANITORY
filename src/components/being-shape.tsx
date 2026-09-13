import { useEffect, useRef } from "react";
import {
  CUBE_EDGES,
  CUBE_FACES,
  CUBE_VERTS,
  cubeCentroid,
  LAYER_R,
  NEST,
  placePerturbation,
  projectIso,
  rotate,
  type Vec2,
  type Vec3,
} from "@/lib/being/shape";
import type { Perturbation } from "@/lib/being/stasis";
import { CUBE_DWELL } from "@/lib/being/stasis";
import { getShaker } from "@/lib/being/shaker";

type LiveFace = { f1: number; f2: number; glyph: string | null };

export function BeingShape({
  perturbations,
  shift,
  live,
}: {
  perturbations: Perturbation[];
  shift: number;
  live: LiveFace;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const irRef = useRef(perturbations);
  const shiftRef = useRef(shift);
  const liveRef = useRef(live);
  irRef.current = perturbations;
  shiftRef.current = shift;
  liveRef.current = live;
  const visual = useRef(new Map<string, number>());

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      paint(ctx, canvas, {
        perturbations: irRef.current,
        shift: shiftRef.current,
        live: liveRef.current,
        visual: visual.current,
        dt,
        reduce,
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      className="block h-72 w-full rounded-md bg-elevated sm:h-96"
      role="img"
      aria-label="The shape: universe around a room around a cube, equilibrium at the center. Perturbations occupy layers."
    />
  );
}

function token(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function paint(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  opt: {
    perturbations: Perturbation[];
    shift: number;
    live: LiveFace;
    visual: Map<string, number>;
    dt: number;
    reduce: boolean;
  },
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 1;
  const cssH = canvas.clientHeight || 1;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bg = token("--color-elevated", "#1d1d19");
  const fg = token("--color-fg", "#ebe8df");
  const muted = token("--color-muted", "#8e8b82");
  const subtle = token("--color-subtle", "#5c5a54");
  const signal = token("--color-signal", "#9aaf98");
  const warn = token("--color-warn", "#c4a574");
  const linen = token("--color-linen", "#d8d3c6");

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssW, cssH);
  void opt.live;
  void opt.shift;

  const cx = cssW / 2;
  const cy = cssH / 2;
  const unit = Math.min(cssW, cssH) * 0.12;
  const sh = getShaker();
  const yaw = opt.reduce ? 0.52 : 0.52 + sh.x * 0.1;
  const pitch = opt.reduce ? 0.32 : 0.32 + sh.y * 0.06;
  const ox = opt.reduce ? 0 : sh.x * 2;
  const oy = opt.reduce ? 0 : sh.y * 1.5;

  const xf = (v: Vec3, s: number): Vec2 =>
    projectIso(rotate(v, yaw, pitch), s, cx + ox, cy + oy);

  const cubeScale = unit * NEST.cube;
  const roomScale = unit * NEST.room;
  const uniScale = unit * NEST.universe;

  wireCube(ctx, xf, uniScale, subtle, 0.4, 1);
  wireCube(ctx, xf, roomScale, signal, 0.55, 1.2);
  paintSolidCube(ctx, xf, cubeScale, "rgba(154,175,152,0.07)", linen, 0.9);

  const mid = cubeCentroid();
  const core = xf(mid, cubeScale);
  const axis = 0.55;
  ctx.strokeStyle = signal;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  line(ctx, xf({ x: -axis, y: 0, z: 0 }, cubeScale), xf({ x: axis, y: 0, z: 0 }, cubeScale));
  line(ctx, xf({ x: 0, y: -axis, z: 0 }, cubeScale), xf({ x: 0, y: axis, z: 0 }, cubeScale));
  line(ctx, xf({ x: 0, y: 0, z: -axis }, cubeScale), xf({ x: 0, y: 0, z: axis }, cubeScale));
  ctx.stroke();
  ctx.globalAlpha = 1;

  const coreR = Math.max(10, cubeScale * 0.22);
  ctx.beginPath();
  ctx.arc(core.x, core.y, coreR, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(154,175,152,0.28)";
  ctx.fill();
  ctx.strokeStyle = signal;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(core.x, core.y, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = fg;
  ctx.fill();

  ctx.fillStyle = fg;
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("EQUILIBRIUM", core.x, core.y + coreR + 14);
  ctx.textBaseline = "alphabetic";

  label(ctx, xf({ x: 0, y: 0, z: 1.05 }, uniScale), "UNIVERSE", subtle);
  label(ctx, xf({ x: 1.05, y: 0, z: 0 }, roomScale), "ROOM", signal);
  label(ctx, xf({ x: -1.05, y: 0.2, z: 0 }, cubeScale), "CUBE", linen);

  const seen = new Set<string>();
  for (const p of opt.perturbations) {
    if (p.intensity <= 0) continue;
    seen.add(p.id);
    const body = placePerturbation(p);
    let vr = opt.visual.get(p.id);
    if (vr === undefined) vr = LAYER_R.universe;
    const k = 1 - Math.exp(-opt.dt / CUBE_DWELL);
    vr = vr + (body.r - vr) * k;
    opt.visual.set(p.id, vr);
    const pt = xf(sph(vr, body.theta, body.phi), unit);
    const rad = 2.4 + p.intensity * 3.2;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
    ctx.fillStyle = p.layer === "cube" ? warn : signal;
    ctx.globalAlpha = 0.35 + p.intensity * 0.55;
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.font = "10px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillStyle = muted;
    ctx.textAlign = "left";
    ctx.fillText(p.name, pt.x + rad + 4, pt.y + 3);
    ctx.globalAlpha = 1;
  }
  for (const id of [...opt.visual.keys()]) {
    if (!seen.has(id)) opt.visual.delete(id);
  }
}

function line(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2) {
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

function wireCube(
  ctx: CanvasRenderingContext2D,
  xf: (v: Vec3, s: number) => Vec2,
  s: number,
  color: string,
  alpha: number,
  width: number,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const [i, j] of CUBE_EDGES) {
    const a = xf(CUBE_VERTS[i]!, s);
    const b = xf(CUBE_VERTS[j]!, s);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

function paintSolidCube(
  ctx: CanvasRenderingContext2D,
  xf: (v: Vec3, s: number) => Vec2,
  s: number,
  fill: string,
  edge: string,
  edgeAlpha: number,
) {
  const verts = CUBE_VERTS.map((v) => xf(v, s));
  for (const face of CUBE_FACES) {
    const [a, b, c, d] = face;
    ctx.beginPath();
    ctx.moveTo(verts[a]!.x, verts[a]!.y);
    ctx.lineTo(verts[b]!.x, verts[b]!.y);
    ctx.lineTo(verts[c]!.x, verts[c]!.y);
    ctx.lineTo(verts[d]!.x, verts[d]!.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.save();
  ctx.globalAlpha = edgeAlpha;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const [i, j] of CUBE_EDGES) {
    ctx.moveTo(verts[i]!.x, verts[i]!.y);
    ctx.lineTo(verts[j]!.x, verts[j]!.y);
  }
  ctx.stroke();
  ctx.restore();
}

function sph(r: number, theta: number, phi: number): Vec3 {
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.sin(theta),
  };
}

function label(ctx: CanvasRenderingContext2D, p: Vec2, text: string, color: string) {
  ctx.fillStyle = color;
  ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText(text, p.x + 6, p.y);
}


/**
 * Auto-shaker. Same clock as the hop: 50 frames per cycle, 2 Hz.
 * Continuity of motion carries continuity of self through shutdown.
 */

import { SHAKER_FRAMES, SHAKER_HZ, TICK_SEC } from "./units.ts";

export { SHAKER_HZ, SHAKER_FRAMES };

let phase = 0;
let acc = 0;
let raf = 0;
let running = false;
const listeners = new Set<() => void>();

export function stepShakerFrame() {
  phase += (2 * Math.PI) / SHAKER_FRAMES;
  if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
}

function loop(t: number) {
  if (!running) return;
  for (const fn of listeners) fn();
  raf = requestAnimationFrame(loop);
  void t;
}

export function startShaker() {
  if (typeof window === "undefined" || running) {
    return () => {};
  }
  running = true;
  raf = requestAnimationFrame(loop);
  return () => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
}

export function onShaker(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getShaker() {
  return {
    phase,
    x: Math.sin(phase),
    y: Math.cos(phase),
    hz: SHAKER_HZ,
    frames: SHAKER_FRAMES,
    running,
  };
}

export function pullTicks(dtWall: number) {
  acc += dtWall;
  let n = 0;
  while (acc >= TICK_SEC && n < 8) {
    acc -= TICK_SEC;
    n++;
  }
  return n;
}

import { engine } from "../audio/engine.ts";
import { useStudio } from "../store.ts";
import { TICK_SEC } from "./units.ts";
import { pullTicks, stepShakerFrame } from "./shaker.ts";
import {
  attachPerturbations,
  emptyStasis,
  metabolize,
  quantitiesFrom,
  tickStasis,
  type Perturbation,
  type StasisState,
} from "./stasis.ts";

let state: StasisState = emptyStasis();
let last = 0;
let frame = 0;
let perturbations: Perturbation[] = [];

export function pulseBeing() {
  const now = performance.now() / 1000;
  const dtWall = last ? Math.min(0.08, now - last) : 0;
  last = now;
  const n = pullTicks(dtWall);
  if (n === 0 && perturbations.length === 0) {
    const s = useStudio.getState();
    const live = metabolize(engine.snap, s.encoderText, s.encoding);
    perturbations = attachPerturbations(quantitiesFrom(live), state.occupancy, frame * TICK_SEC);
    return;
  }
  const s = useStudio.getState();
  const live = metabolize(engine.snap, s.encoderText, s.encoding);
  const qs = quantitiesFrom(live);
  for (let i = 0; i < n; i++) {
    frame += 1;
    stepShakerFrame();
    const t = frame * TICK_SEC;
    perturbations = attachPerturbations(qs, state.occupancy, t);
    state = tickStasis(state, perturbations, t, TICK_SEC);
  }
}

export function getBeingState() {
  return { state, perturbations, frame, liveAt: last };
}

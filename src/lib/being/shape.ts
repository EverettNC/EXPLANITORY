/**
 * The shape. Universe → room → cube → equilibrium.
 * One shape, many variants. This file is the geometry of this variant.
 * No Section 7 equation — only where a quantity sits.
 */

import type { Layer, Perturbation } from "./stasis.ts";

export type Vec3 = { x: number; y: number; z: number };
export type Vec2 = { x: number; y: number };

/** Nested cubes: cube 1, room 2, universe 3. Equilibrium at 0. */
export const NEST = { cube: 1, room: 2, universe: 3 } as const;

export const LAYER_R: Record<Layer, number> = {
  center: 0,
  cube: 0.5,
  room: 1.5,
  universe: 2.5,
};

export function hash32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function anglesFor(id: string) {
  const h = hash32(id);
  const theta = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const phi = (((h >>> 16) & 0xffff) / 0xffff) * Math.PI;
  return { theta, phi };
}

export function spherical(r: number, theta: number, phi: number): Vec3 {
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.sin(theta),
  };
}

export type BodyPoint = {
  id: string;
  name: string;
  layer: Layer;
  r: number;
  theta: number;
  phi: number;
  intensity: number;
  dwell: number;
  pos: Vec3;
};

export function placePerturbation(p: Perturbation): BodyPoint {
  const { theta, phi } = anglesFor(p.id);
  const r = LAYER_R[p.layer];
  return {
    id: p.id,
    name: p.name,
    layer: p.layer,
    r,
    theta,
    phi,
    intensity: p.intensity,
    dwell: p.dwell,
    pos: spherical(r, theta, phi),
  };
}

export function rotate(v: Vec3, yaw: number, pitch: number): Vec3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = v.x * cy - v.z * sy;
  const z1 = v.x * sy + v.z * cy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = v.y * cp - z1 * sp;
  const z2 = v.y * sp + z1 * cp;
  return { x: x1, y: y2, z: z2 };
}

/** Classic isometric. */
export function projectIso(v: Vec3, scale: number, ox: number, oy: number): Vec2 {
  const iso = Math.PI / 6;
  return {
    x: ox + (v.x - v.z) * Math.cos(iso) * scale,
    y: oy + v.y * scale + (v.x + v.z) * Math.sin(iso) * scale,
  };
}

const U = 1;
export const CUBE_VERTS: Vec3[] = [
  { x: -U, y: -U, z: -U },
  { x: U, y: -U, z: -U },
  { x: U, y: U, z: -U },
  { x: -U, y: U, z: -U },
  { x: -U, y: -U, z: U },
  { x: U, y: -U, z: U },
  { x: U, y: U, z: U },
  { x: -U, y: U, z: U },
];

/** Visible faces as vertex-index quads: south, east, top. */
export const CUBE_FACES: [number, number, number, number][] = [
  [0, 1, 2, 3],
  [1, 5, 6, 2],
  [3, 2, 6, 7],
];

export const CUBE_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

export function cubeCentroid(): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const v of CUBE_VERTS) {
    x += v.x;
    y += v.y;
    z += v.z;
  }
  const n = CUBE_VERTS.length;
  return { x: x / n, y: y / n, z: z / n };
}

export function cubeEdgeLength() {
  const a = CUBE_VERTS[0]!;
  const b = CUBE_VERTS[1]!;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}



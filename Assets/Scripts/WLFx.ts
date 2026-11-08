// Witch's Lab — lightweight effects drawn in ONE draw call per system:
// cauldron steam (soft round puffs, WL_VertexAlpha), success sparkles
// (4-point stars, WL_Glow) and brew bubbles. Each particle is a small
// camera-facing shape rebuilt in a single dynamic mesh every frame.

import {RGB} from "./WLLogic"
import {ColorMesh, child} from "./WLMesh"

const STRIDE = 10

export type Shape = "puff" | "star" | "bubble"

interface P {
  alive: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  life: number
  size: number
  grow: number
  spin: number
  color: RGB
  alpha: number
}

/** Template: list of [u, v, alphaScale] points + triangles, in a unit square. */
function template(shape: Shape): {pts: [number, number, number][]; tris: number[]} {
  const pts: [number, number, number][] = []
  const tris: number[] = []
  if (shape === "star") {
    pts.push([0, 0, 1])
    const n = 8
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2
      const r = i % 2 === 0 ? 1 : 0.16
      pts.push([Math.cos(th) * r, Math.sin(th) * r, i % 2 === 0 ? 0 : 0.55])
    }
    for (let i = 0; i < n; i++) tris.push(0, 1 + i, 1 + ((i + 1) % n))
    // soft halo
    const h0 = pts.length
    pts.push([0, 0, 0.35])
    for (let i = 0; i < 8; i++) {
      const th = (i / 8) * Math.PI * 2
      pts.push([Math.cos(th) * 0.45, Math.sin(th) * 0.45, 0])
    }
    for (let i = 0; i < 8; i++) tris.push(h0, h0 + 1 + i, h0 + 1 + ((i + 1) % 8))
    return {pts, tris}
  }
  if (shape === "bubble") {
    // a ring with a bright rim and a highlight dot
    const n = 12
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2
      pts.push([Math.cos(th) * 0.72, Math.sin(th) * 0.72, 0.15])
      pts.push([Math.cos(th), Math.sin(th), 0.85])
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2
      const b = ((i + 1) % n) * 2
      tris.push(a, a + 1, b + 1, a, b + 1, b)
    }
    const c = pts.length
    pts.push([0, 0, 0.12])
    for (let i = 0; i < n; i++) tris.push(c, i * 2, ((i + 1) % n) * 2)
    return {pts, tris}
  }
  // puff: soft gaussian disc
  pts.push([0, 0, 1])
  const n = 10
  for (const [r, a] of [
    [0.45, 0.6],
    [1, 0],
  ] as [number, number][]) {
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2
      pts.push([Math.cos(th) * r, Math.sin(th) * r, a])
    }
  }
  for (let i = 0; i < n; i++) tris.push(0, 1 + i, 1 + ((i + 1) % n))
  for (let i = 0; i < n; i++) {
    const a = 1 + i
    const b = 1 + ((i + 1) % n)
    tris.push(a, a + n, b + n, a, b + n, b)
  }
  return {pts, tris}
}

export class Particles {
  readonly obj: SceneObject
  private mesh: ColorMesh
  private ps: P[] = []
  private tpl: {pts: [number, number, number][]; tris: number[]}
  private dirty = true

  constructor(
    parent: SceneObject,
    name: string,
    private max: number,
    shape: Shape,
    material: Material,
    private gravity: number = 0,
    private drag: number = 0.6,
    /** "smoke" fades out over its life; "hold" stays solid and fades only at the very end (drops, powder). */
    private fade: "smoke" | "hold" = "smoke",
  ) {
    this.obj = child(parent, name)
    this.tpl = template(shape)
    this.mesh = new ColorMesh()
    for (let k = 0; k < max; k++) {
      this.ps.push({alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 1, grow: 0, spin: 0, color: [1, 1, 1], alpha: 0})
      const base = this.mesh.vertexCount
      for (const q of this.tpl.pts) this.mesh.vertex(q[0], q[1], 0, 0, 0, 1, [1, 1, 1], 0)
      for (let i = 0; i < this.tpl.tris.length; i += 3) this.mesh.tri(base + this.tpl.tris[i], base + this.tpl.tris[i + 1], base + this.tpl.tris[i + 2])
    }
    this.mesh.attach(this.obj, material)
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grow: number, color: RGB, alpha: number): void {
    const p = this.ps.find((q) => !q.alive)
    if (!p) return
    p.alive = true
    p.x = x
    p.y = y
    p.z = z
    p.vx = vx
    p.vy = vy
    p.vz = vz
    p.age = 0
    p.life = life
    p.size = size
    p.grow = grow
    p.spin = Math.random() * Math.PI * 2
    p.color = color
    p.alpha = alpha
    this.dirty = true
  }

  get activeCount(): number {
    let n = 0
    for (const p of this.ps) if (p.alive) n++
    return n
  }

  /** right / up = camera axes expressed in this system's parent space. */
  tick(dt: number, right: vec3, up: vec3, fadeIn: number = 0.2): void {
    let any = false
    const d = this.mesh.data
    const np = this.tpl.pts.length
    for (let k = 0; k < this.ps.length; k++) {
      const p = this.ps[k]
      const base = k * np
      if (!p.alive) {
        if (this.dirty) for (let i = 0; i < np; i++) d[(base + i) * STRIDE + 9] = 0
        continue
      }
      any = true
      p.age += dt
      if (p.age >= p.life) {
        p.alive = false
        for (let i = 0; i < np; i++) d[(base + i) * STRIDE + 9] = 0
        continue
      }
      const damp = Math.max(0, 1 - this.drag * dt)
      p.vx *= damp
      p.vz *= damp
      p.vy = p.vy * damp - this.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      const t = p.age / p.life
      const a = this.fade === "hold" ? p.alpha * Math.min(1, t / fadeIn) * Math.min(1, (1 - t) / 0.12) : p.alpha * Math.min(1, t / fadeIn) * (1 - t) * (1 - t)
      const s = p.size * (1 + p.grow * t)
      const cs = Math.cos(p.spin + t * 1.5)
      const sn = Math.sin(p.spin + t * 1.5)
      for (let i = 0; i < np; i++) {
        const q = this.tpl.pts[i]
        const u = (q[0] * cs - q[1] * sn) * s
        const v = (q[0] * sn + q[1] * cs) * s
        const o = (base + i) * STRIDE
        d[o] = p.x + right.x * u + up.x * v
        d[o + 1] = p.y + right.y * u + up.y * v
        d[o + 2] = p.z + right.z * u + up.z * v
        d[o + 6] = p.color[0]
        d[o + 7] = p.color[1]
        d[o + 8] = p.color[2]
        d[o + 9] = a * q[2]
      }
    }
    if (any || this.dirty) this.mesh.commit()
    this.dirty = any
  }
}

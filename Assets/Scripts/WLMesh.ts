// Witch's Lab — code-authored meshes (MeshBuilder, vertex colours).
// Every prop is generated here at runtime, at real size (cm). Since v2 (9 Nov)
// they are drawn with real materials instead of flat colour:
//   - glass   : WL_Glass   (fresnel edges, studio reflections, premultiplied alpha)
//               vertex rgb = tint, a = wall thickness
//   - liquid  : WL_Liquid  (depth gradient, inner scattering, meniscus, shimmer)
//               vertex rgb = colour, a = height in the glass 0..1
//   - props   : WL_PBR_Vertex clones (Uber PBR, vertex colour = albedo,
//               metallic / roughness per material, lit by the scene envmap)
//   - shadows, steam, panels : WL_VertexAlpha ; sparkles, runes : WL_Glow
// The lathe and box helpers follow CLAD's mesh-builder-scripting references
// (Apache-2.0, Specs Inc.): CCW winding seen from outside.
//
// Vertex layout: position(3) normal(3) color(4) = 10 floats per vertex.

import {RGB, clamp01} from "./WLLogic"

const STRIDE = 10

/** [radius, y] or [radius, y, alpha] */
export type ProfilePt = [number, number] | [number, number, number]

export class ColorMesh {
  readonly builder: MeshBuilder
  /** Interleaved copy of every vertex, kept so colours / positions can be rewritten. */
  readonly data: number[] = []
  private indices: number[] = []
  private count = 0

  constructor() {
    this.builder = new MeshBuilder([
      {name: "position", components: 3},
      {name: "normal", components: 3, normalized: true},
      {name: "color", components: 4},
    ])
    this.builder.topology = MeshTopology.Triangles
    this.builder.indexType = MeshIndexType.UInt16
  }

  get vertexCount(): number {
    return this.count
  }

  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: RGB, a: number = 1): number {
    this.data.push(x, y, z, nx, ny, nz, c[0], c[1], c[2], a)
    return this.count++
  }

  tri(a: number, b: number, c: number): void {
    this.indices.push(a, b, c)
  }

  /**
   * Revolve a [radius, y(, alpha)] profile around Y. Smooth normals from the
   * profile tangent. colorFn (optional) recolours each vertex from its position.
   */
  lathe(
    profile: ProfilePt[],
    segments: number,
    color: RGB,
    capBottom: boolean = false,
    capTop: boolean = false,
    colorFn?: (x: number, y: number, z: number) => RGB,
  ): void {
    const P = profile.length
    const n2: [number, number][] = []
    for (let j = 0; j < P; j++) {
      const prev = profile[Math.max(0, j - 1)]
      const next = profile[Math.min(P - 1, j + 1)]
      const dx = next[0] - prev[0]
      const dy = next[1] - prev[1]
      const len = Math.hypot(dy, dx) || 1
      n2.push([dy / len, -dx / len])
    }
    const start = this.count
    for (let i = 0; i <= segments; i++) {
      const th = (i / segments) * Math.PI * 2
      const c = Math.cos(th)
      const s = Math.sin(th)
      for (let j = 0; j < P; j++) {
        const r = profile[j][0]
        const y = profile[j][1]
        const a = profile[j].length > 2 ? (profile[j] as number[])[2] : 1
        const x = r * c
        const z = r * s
        this.vertex(x, y, z, n2[j][0] * c, n2[j][1], n2[j][0] * s, colorFn ? colorFn(x, y, z) : color, a)
      }
    }
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < P - 1; j++) {
        const bl = start + i * P + j
        const br = start + i * P + j + 1
        const tl = start + (i + 1) * P + j
        const tr = start + (i + 1) * P + j + 1
        this.tri(bl, br, tr)
        this.tri(bl, tr, tl)
      }
    }
    if (capBottom && profile[0][0] > 1e-6) this.disc(profile[0][0], profile[0][1], segments, color, false)
    if (capTop && profile[P - 1][0] > 1e-6) this.disc(profile[P - 1][0], profile[P - 1][1], segments, color, true)
  }

  /** Horizontal disc at height y. up=true faces +Y. */
  disc(r: number, y: number, segments: number, color: RGB, up: boolean, alpha: number = 1): void {
    const ny = up ? 1 : -1
    const center = this.vertex(0, y, 0, 0, ny, 0, color, alpha)
    const ring = this.count
    for (let i = 0; i <= segments; i++) {
      const th = (i / segments) * Math.PI * 2
      this.vertex(r * Math.cos(th), y, r * Math.sin(th), 0, ny, 0, color, alpha)
    }
    for (let i = 0; i < segments; i++) {
      if (up) this.tri(center, ring + i + 1, ring + i)
      else this.tri(center, ring + i, ring + i + 1)
    }
  }

  /** Torus lying flat (axis Y). */
  torus(R: number, r: number, y: number, segments: number, tubeSegs: number, color: RGB, alpha: number = 1): void {
    const prof: ProfilePt[] = []
    for (let k = 0; k <= tubeSegs; k++) {
      const a = -Math.PI / 2 + (k / tubeSegs) * Math.PI * 2
      prof.push([R + r * Math.cos(a), y + r * Math.sin(a), alpha])
    }
    this.lathe(prof, segments, color)
  }

  /** Torus standing up in the XY plane (a handle ring), centred at (cx, cy, cz). */
  ringXYTube(cx: number, cy: number, cz: number, R: number, r: number, segs: number, tube: number, color: RGB, rotY: number = 0): void {
    const start = this.count
    const cr = Math.cos(rotY)
    const sr = Math.sin(rotY)
    for (let i = 0; i <= segs; i++) {
      const u = (i / segs) * Math.PI * 2
      const cu = Math.cos(u)
      const su = Math.sin(u)
      for (let j = 0; j <= tube; j++) {
        const v = (j / tube) * Math.PI * 2
        const cv = Math.cos(v)
        const sv = Math.sin(v)
        // ring in local XY plane, tube around it
        const lx = (R + r * cv) * cu
        const ly = (R + r * cv) * su
        const lz = r * sv
        const nx = cv * cu
        const ny = cv * su
        const nz = sv
        this.vertex(cx + lx * cr + lz * sr, cy + ly, cz - lx * sr + lz * cr, nx * cr + nz * sr, ny, -nx * sr + nz * cr, color)
      }
    }
    const T = tube + 1
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < tube; j++) {
        const a = start + i * T + j
        const b = start + (i + 1) * T + j
        this.tri(a, b, b + 1)
        this.tri(a, b + 1, a + 1)
      }
    }
  }

  /** Axis-aligned box (per-face normals, CCW from outside). */
  box(cx: number, cy: number, cz: number, hw: number, hh: number, hd: number, color: RGB, alpha: number = 1): void {
    const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh, z0 = cz - hd, z1 = cz + hd
    const face = (p: number[][], n: number[]) => {
      const b = this.count
      for (const q of p) this.vertex(q[0], q[1], q[2], n[0], n[1], n[2], color, alpha)
      this.tri(b, b + 1, b + 2)
      this.tri(b, b + 2, b + 3)
    }
    face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0])
    face([[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0])
    face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0])
    face([[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0])
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1])
    face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1])
  }

  /**
   * Slab with bevelled top edges (cutting board, book cover). Top face is a
   * grid so colorFn can paint grain / texture per vertex.
   */
  bevelSlab(cx: number, cy: number, cz: number, hw: number, hh: number, hd: number, bevel: number, nx: number, nz: number, colorFn: (x: number, y: number, z: number) => RGB): void {
    const yTop = cy + hh
    const yBot = cy - hh
    const ix0 = cx - hw + bevel, ix1 = cx + hw - bevel, iz0 = cz - hd + bevel, iz1 = cz + hd - bevel
    // top grid
    const start = this.count
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const x = ix0 + ((ix1 - ix0) * i) / nx
        const z = iz0 + ((iz1 - iz0) * j) / nz
        this.vertex(x, yTop, z, 0, 1, 0, colorFn(x, yTop, z))
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = start + j * (nx + 1) + i
        const b = a + 1
        const c = a + (nx + 1)
        const d = c + 1
        this.tri(a, c, d)
        this.tri(a, d, b)
      }
    }
    const quad = (p: number[][], n: number[]) => {
      const b = this.count
      for (const q of p) this.vertex(q[0], q[1], q[2], n[0], n[1], n[2], colorFn(q[0], q[1], q[2]))
      this.tri(b, b + 1, b + 2)
      this.tri(b, b + 2, b + 3)
    }
    const yb = yTop - bevel
    const x0 = cx - hw, x1 = cx + hw, z0 = cz - hd, z1 = cz + hd
    const s = Math.SQRT1_2
    // bevels (front +z, back -z, right +x, left -x)
    quad([[ix0, yTop, iz1], [x0, yb, z1], [x1, yb, z1], [ix1, yTop, iz1]], [0, s, s])
    quad([[ix1, yTop, iz0], [x1, yb, z0], [x0, yb, z0], [ix0, yTop, iz0]], [0, s, -s])
    quad([[ix1, yTop, iz1], [x1, yb, z1], [x1, yb, z0], [ix1, yTop, iz0]], [s, s, 0])
    quad([[ix0, yTop, iz0], [x0, yb, z0], [x0, yb, z1], [ix0, yTop, iz1]], [-s, s, 0])
    // sides
    quad([[x0, yBot, z1], [x1, yBot, z1], [x1, yb, z1], [x0, yb, z1]], [0, 0, 1])
    quad([[x1, yBot, z0], [x0, yBot, z0], [x0, yb, z0], [x1, yb, z0]], [0, 0, -1])
    quad([[x1, yBot, z1], [x1, yBot, z0], [x1, yb, z0], [x1, yb, z1]], [1, 0, 0])
    quad([[x0, yBot, z0], [x0, yBot, z1], [x0, yb, z1], [x0, yb, z0]], [-1, 0, 0])
    // bottom
    quad([[x0, yBot, z0], [x1, yBot, z0], [x1, yBot, z1], [x0, yBot, z1]], [0, -1, 0])
  }

  /** Flat quad in the XY plane facing +Z. */
  quadXY(x0: number, y0: number, x1: number, y1: number, z: number, color: RGB, alpha: number = 1): void {
    const b = this.count
    this.vertex(x0, y0, z, 0, 0, 1, color, alpha)
    this.vertex(x1, y0, z, 0, 0, 1, color, alpha)
    this.vertex(x1, y1, z, 0, 0, 1, color, alpha)
    this.vertex(x0, y1, z, 0, 0, 1, color, alpha)
    this.tri(b, b + 1, b + 2)
    this.tri(b, b + 2, b + 3)
  }

  /** Thick line segment (quad) in the XY plane facing +Z. */
  strokeXY(x0: number, y0: number, x1: number, y1: number, width: number, z: number, color: RGB, alpha: number = 1): void {
    const dx = x1 - x0, dy = y1 - y0
    const l = Math.hypot(dx, dy) || 1
    const nx = (-dy / l) * (width / 2), ny = (dx / l) * (width / 2)
    const b = this.count
    this.vertex(x0 - nx, y0 - ny, z, 0, 0, 1, color, alpha)
    this.vertex(x1 - nx, y1 - ny, z, 0, 0, 1, color, alpha)
    this.vertex(x1 + nx, y1 + ny, z, 0, 0, 1, color, alpha)
    this.vertex(x0 + nx, y0 + ny, z, 0, 0, 1, color, alpha)
    this.tri(b, b + 1, b + 2)
    this.tri(b, b + 2, b + 3)
  }

  /** Soft radial glow / blob in the XY plane: alpha a0 at the centre → 0 at r. */
  glowXY(cx: number, cy: number, r: number, z: number, color: RGB, a0: number, segments: number = 24): void {
    const rings = [0, 0.25, 0.5, 0.75, 1]
    const start = this.count
    for (let k = 0; k < rings.length; k++) {
      const rr = rings[k] * r
      const a = a0 * Math.pow(1 - rings[k], 2.2)
      const n = k === 0 ? 1 : segments + 1
      for (let i = 0; i < n; i++) {
        const th = (i / segments) * Math.PI * 2
        this.vertex(cx + rr * Math.cos(th), cy + rr * Math.sin(th), z, 0, 0, 1, color, a)
      }
    }
    // centre fan
    for (let i = 0; i < segments; i++) this.tri(start, start + 1 + i, start + 2 + i)
    for (let k = 1; k < rings.length - 1; k++) {
      const a0i = start + 1 + (k - 1) * (segments + 1)
      const b0i = start + 1 + k * (segments + 1)
      for (let i = 0; i < segments; i++) {
        this.tri(a0i + i, b0i + i, b0i + i + 1)
        this.tri(a0i + i, b0i + i + 1, a0i + i + 1)
      }
    }
  }

  /** Soft contact shadow lying on the surface (XZ plane, facing up): an ellipse, darkest under the object. */
  shadowXZ(cx: number, cz: number, rx: number, rz: number, y: number, a0: number, segments: number = 28): void {
    const rings = [0, 0.35, 0.6, 0.8, 1]
    const start = this.count
    const black: RGB = [0.02, 0.015, 0.01]
    for (let k = 0; k < rings.length; k++) {
      const a = a0 * Math.pow(1 - rings[k], 1.8)
      const n = k === 0 ? 1 : segments + 1
      for (let i = 0; i < n; i++) {
        const th = (i / segments) * Math.PI * 2
        this.vertex(cx + rings[k] * rx * Math.cos(th), y, cz + rings[k] * rz * Math.sin(th), 0, 1, 0, black, a)
      }
    }
    for (let i = 0; i < segments; i++) this.tri(start, start + 2 + i, start + 1 + i)
    for (let k = 1; k < rings.length - 1; k++) {
      const a0i = start + 1 + (k - 1) * (segments + 1)
      const b0i = start + 1 + k * (segments + 1)
      for (let i = 0; i < segments; i++) {
        this.tri(a0i + i, b0i + i + 1, b0i + i)
        this.tri(a0i + i, a0i + i + 1, b0i + i + 1)
      }
    }
  }

  /** Rounded rectangle panel in the XY plane facing +Z, vertical gradient, soft alpha. */
  roundRectXY(w: number, h: number, r: number, z: number, top: RGB, bottom: RGB, aTop: number, aBottom: number, segs: number = 6): number[] {
    const pts: [number, number][] = []
    const corners: [number, number, number][] = [
      [w / 2 - r, h / 2 - r, 0],
      [-w / 2 + r, h / 2 - r, Math.PI / 2],
      [-w / 2 + r, -h / 2 + r, Math.PI],
      [w / 2 - r, -h / 2 + r, (3 * Math.PI) / 2],
    ]
    for (const c of corners) {
      for (let i = 0; i <= segs; i++) {
        const a = c[2] + (i / segs) * (Math.PI / 2)
        pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)])
      }
    }
    const col = (y: number): RGB => {
      const k = clamp01((y + h / 2) / h)
      return [bottom[0] + (top[0] - bottom[0]) * k, bottom[1] + (top[1] - bottom[1]) * k, bottom[2] + (top[2] - bottom[2]) * k]
    }
    const al = (y: number) => aBottom + (aTop - aBottom) * clamp01((y + h / 2) / h)
    const center = this.vertex(0, 0, z, 0, 0, 1, col(0), al(0))
    const first = this.count
    for (const p of pts) this.vertex(p[0], p[1], z, 0, 0, 1, col(p[1]), al(p[1]))
    for (let i = 0; i < pts.length; i++) this.tri(center, first + i, first + ((i + 1) % pts.length))
    return pts.map((p) => p[0]).concat(pts.map((p) => p[1]))
  }

  /** Thin outline of a rounded rectangle (hairline border), alpha fading toward the bottom. */
  roundRectLineXY(w: number, h: number, r: number, width: number, z: number, color: RGB, aTop: number, aBottom: number, segs: number = 6): void {
    const outline = (ww: number, hh: number, rr: number): [number, number][] => {
      const out: [number, number][] = []
      const cs: [number, number, number][] = [
        [ww / 2 - rr, hh / 2 - rr, 0],
        [-ww / 2 + rr, hh / 2 - rr, Math.PI / 2],
        [-ww / 2 + rr, -hh / 2 + rr, Math.PI],
        [ww / 2 - rr, -hh / 2 + rr, (3 * Math.PI) / 2],
      ]
      for (const c of cs) for (let i = 0; i <= segs; i++) {
        const a = c[2] + (i / segs) * (Math.PI / 2)
        out.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)])
      }
      return out
    }
    const o = outline(w, h, r)
    const inn = outline(w - width * 2, h - width * 2, Math.max(0.01, r - width))
    const al = (y: number) => aBottom + (aTop - aBottom) * clamp01((y + h / 2) / h)
    const start = this.count
    for (let i = 0; i < o.length; i++) {
      this.vertex(o[i][0], o[i][1], z, 0, 0, 1, color, al(o[i][1]))
      this.vertex(inn[i][0], inn[i][1], z, 0, 0, 1, color, al(inn[i][1]))
    }
    const n = o.length
    for (let i = 0; i < n; i++) {
      const a = start + i * 2
      const b = start + ((i + 1) % n) * 2
      this.tri(a, b, b + 1)
      this.tri(a, b + 1, a + 1)
    }
  }

  /** Upload to the GPU and attach to a new RenderMeshVisual on obj. */
  attach(obj: SceneObject, material: Material): RenderMeshVisual {
    this.builder.appendVerticesInterleaved(this.data)
    this.builder.appendIndices(this.indices)
    const rmv = obj.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
    rmv.mesh = this.builder.getMesh()
    rmv.mainMaterial = material
    this.builder.updateMesh()
    return rmv
  }

  /** Rewrite vertex colours in place. fn receives the vertex index and its position. Alpha kept unless given. */
  recolor(fn: (index: number, y: number, x: number, z: number) => RGB, alpha?: number): void {
    for (let i = 0; i < this.count; i++) {
      const o = i * STRIDE
      const c = fn(i, this.data[o + 1], this.data[o], this.data[o + 2])
      this.data[o + 6] = clamp01(c[0])
      this.data[o + 7] = clamp01(c[1])
      this.data[o + 8] = clamp01(c[2])
      if (alpha !== undefined) this.data[o + 9] = alpha
      this.builder.setVertexInterleaved(i, this.data.slice(o, o + STRIDE))
    }
    this.builder.updateMesh()
  }

  /** Rewrite the whole vertex buffer after editing `data` directly (particles, wobble). */
  commit(from: number = 0, to: number = this.count): void {
    for (let i = from; i < to; i++) {
      const o = i * STRIDE
      this.builder.setVertexInterleaved(i, this.data.slice(o, o + STRIDE))
    }
    this.builder.updateMesh()
  }
}

/** Create a child SceneObject at a local position. */
export function child(parent: SceneObject, name: string, x: number = 0, y: number = 0, z: number = 0): SceneObject {
  const o = global.scene.createSceneObject(name)
  o.setParent(parent)
  o.getTransform().setLocalPosition(new vec3(x, y, z))
  return o
}

// ---------------------------------------------------------------------------
// Small deterministic noise for vertex texturing (wood grain, iron patina).
// ---------------------------------------------------------------------------
function h3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
  return s - Math.floor(s)
}
export function vnoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = x - ix, fy = y - iy, fz = z - iz
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  return l(
    l(l(h3(ix, iy, iz), h3(ix + 1, iy, iz), ux), l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), ux), uy),
    l(l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), ux), l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), ux), uy),
    uz,
  )
}
function mixRGB(a: RGB, b: RGB, t: number): RGB {
  const k = clamp01(t)
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

// ---------------------------------------------------------------------------
// Prop builders. Sizes are real-world centimetres.
// ---------------------------------------------------------------------------

// Tumbler: 9 cm tall, 7.2 cm across the rim (the classic kitchen glass of the cover image).
export const GLASS_R = 3.6
export const GLASS_H = 9
export const GLASS_FLOOR = 1.1 // thick glass base (a visible lens of glass under the liquid)
export const LIQUID_H = 4.4 // half full, as the instructions ask
const GLASS_TINT: RGB = [0.86, 0.94, 1.0]

/** Inner radius of the tumbler at height y (the liquid follows it). */
export function glassInnerR(y: number): number {
  const t = clamp01((y - GLASS_FLOOR) / (GLASS_H - 0.1 - GLASS_FLOOR))
  return 2.9 + (3.26 - 2.9) * t
}

/** Thick-walled tumbler: outer wall, rounded rim, inner wall, thick base. */
export function buildGlass(m: ColorMesh): void {
  const H = GLASS_H
  const prof: ProfilePt[] = [
    [0.01, 0.0, 1.0],
    [2.6, 0.0, 1.0],
    [2.95, 0.05, 1.0],
    [3.08, 0.25, 1.0],
    [3.12, 0.6, 0.9],
    [3.2, 2.5, 0.55],
    [3.4, 6.5, 0.55],
    [3.54, H - 0.3, 0.7],
    [3.57, H - 0.1, 0.95],
    [3.5, H, 1.0],
    [3.38, H - 0.02, 1.0],
    [3.3, H - 0.12, 1.0],
    [glassInnerR(H - 0.3), H - 0.3, 0.6],
    [glassInnerR(4), 4, 0.45],
    [glassInnerR(GLASS_FLOOR + 0.3), GLASS_FLOOR + 0.3, 0.55],
    [2.75, GLASS_FLOOR + 0.05, 1.0],
    [2.3, GLASS_FLOOR, 1.0],
    [0.01, GLASS_FLOOR - 0.05, 1.0],
  ]
  m.lathe(prof, 48, GLASS_TINT)
}

/**
 * Liquid volume inside the tumbler, with a meniscus that climbs the wall.
 * Origin = inner floor. Vertex alpha = height 0..1 (for the shader's depth).
 * Returns the index range of the top surface (for the gentle wobble).
 */
export function buildLiquid(m: ColorMesh, c: RGB): {topStart: number; topEnd: number} {
  const H = LIQUID_H
  const seg = 40
  const rows = 12
  const prof: ProfilePt[] = []
  for (let j = 0; j <= rows; j++) {
    const y = (j / rows) * (H - 0.12)
    prof.push([glassInnerR(GLASS_FLOOR + y) - 0.03, y, y / H])
  }
  // the meniscus: liquid climbs ~1.2 mm on the glass
  prof.push([glassInnerR(GLASS_FLOOR + H) - 0.03, H + 0.12, 1])
  m.lathe(prof, seg, c)
  // top surface: concentric rings, slightly concave toward the wall
  const topStart = m.vertexCount
  const R = glassInnerR(GLASS_FLOOR + H) - 0.03
  const rings = [0, 0.25, 0.5, 0.7, 0.85, 0.95, 1]
  for (let k = 0; k < rings.length; k++) {
    const r = rings[k] * R
    const y = H + 0.12 * Math.pow(rings[k], 6)
    const n = k === 0 ? 1 : seg + 1
    for (let i = 0; i < n; i++) {
      const th = (i / seg) * Math.PI * 2
      m.vertex(r * Math.cos(th), y, r * Math.sin(th), 0, 1, 0, c, 1)
    }
  }
  const s0 = topStart
  for (let i = 0; i < seg; i++) m.tri(s0, s0 + 2 + i, s0 + 1 + i)
  for (let k = 1; k < rings.length - 1; k++) {
    const a = s0 + 1 + (k - 1) * (seg + 1)
    const b = s0 + 1 + k * (seg + 1)
    for (let i = 0; i < seg; i++) {
      m.tri(a + i, b + i + 1, b + i)
      m.tri(a + i, a + i + 1, b + i + 1)
    }
  }
  return {topStart, topEnd: m.vertexCount}
}

/** Cast-iron cauldron, ~25 cm tall on its legs, with a thick lip and two ear handles. */
export function buildCauldron(m: ColorMesh): {mouthY: number; mouthR: number} {
  // hammered copper with verdigris in the creases and a darker, fire-kissed belly
  const iron: RGB = [0.82, 0.48, 0.3]
  const patina = (x: number, y: number, z: number): RGB => {
    const n = vnoise(x * 0.35, y * 0.35, z * 0.35) * 0.6 + vnoise(x * 1.3, y * 1.3, z * 1.3) * 0.4
    const ham = vnoise(x * 2.2, y * 2.2, z * 2.2)
    const verdigris: RGB = [0.45, 0.78, 0.66]
    const fire: RGB = [0.62, 0.3, 0.17]
    let c = mixRGB(iron, [1.0, 0.72, 0.5], ham * 0.35)
    c = mixRGB(c, fire, clamp01((6 - y) / 7) * 0.55)
    c = mixRGB(c, verdigris, Math.max(0, n - 0.6) * 1.9)
    return c
  }
  const L = 4.2 // leg height
  // body: round-bellied pot, outer then inner wall
  const body: ProfilePt[] = [
    [0.01, L + 0.2],
    [4.5, L + 0.5],
    [8.0, L + 2.2],
    [10.6, L + 5.0],
    [12.0, L + 8.5],
    [12.2, L + 11.5],
    [11.6, L + 14.5],
    [10.6, L + 16.6],
    [10.3, L + 17.6],
    [10.9, L + 18.4],
    [11.3, L + 19.2],
    [11.0, L + 19.9],
    [10.3, L + 20.0],
    [9.7, L + 19.4],
    [9.6, L + 18.0],
    [10.6, L + 14.0],
    [10.2, L + 8.0],
    [7.0, L + 3.4],
    [0.01, L + 2.2],
  ]
  m.lathe(body, 96, iron, false, false, patina)
  // rolled rim and a riveted band round the belly
  m.torus(10.7, 0.62, L + 19.75, 96, 14, iron)
  m.torus(12.18, 0.22, L + 11.2, 96, 8, [0.8, 0.47, 0.29])
  for (let k = 0; k < 18; k++) {
    const th = (k / 18) * Math.PI * 2
    rivet(m, Math.cos(th) * 12.3, L + 11.2, Math.sin(th) * 12.3, Math.cos(th), Math.sin(th), 0.42, [0.92, 0.62, 0.38])
  }
  // three curved legs
  for (let k = 0; k < 3; k++) {
    const th = (k / 3) * Math.PI * 2 + Math.PI / 6
    const lx = Math.cos(th) * 7.2
    const lz = Math.sin(th) * 7.2
    const legM: ProfilePt[] = [
      [0.01, 0],
      [0.95, 0.05],
      [1.05, 0.5],
      [0.8, 2.2],
      [1.25, L + 1.4],
      [0.01, L + 1.8],
    ]
    const before = m.vertexCount
    m.lathe(legM, 24, iron, false, false, patina)
    // shift the leg (positions only)
    for (let i = before; i < m.vertexCount; i++) {
      m.data[i * STRIDE] += lx
      m.data[i * STRIDE + 2] += lz
    }
  }
  // ear handles with hanging rings
  for (const side of [-1, 1]) {
    const ex = side * 11.4
    m.box(ex, L + 16.6, 0, 0.9, 1.1, 0.8, [0.8, 0.5, 0.3])
    rivet(m, ex + side * 0.9, L + 16.9, 0.45, side, 0, 0.22, [0.92, 0.62, 0.38])
    rivet(m, ex + side * 0.9, L + 16.9, -0.45, side, 0, 0.22, [0.92, 0.62, 0.38])
    m.ringXYTube(side * 12.6, L + 14.6, 0, 2.2, 0.32, 40, 12, [0.95, 0.74, 0.42], Math.PI / 2)
  }
  return {mouthY: L + 18.6, mouthR: 9.4}
}

/** A small domed rivet on a surface whose outward direction is (nx, 0, nz). */
export function rivet(m: ColorMesh, cx: number, cy: number, cz: number, nx: number, nz: number, r: number, c: RGB): void {
  const before = m.vertexCount
  const prof: ProfilePt[] = []
  for (let k = 0; k <= 5; k++) {
    const a = (k / 5) * (Math.PI / 2)
    prof.push([Math.max(0.005, r * Math.cos(a)), r * 0.7 * Math.sin(a) - 0.05])
  }
  m.lathe(prof, 12, c)
  // local frame: lathe Y -> outward normal, lathe X -> tangent, lathe Z -> up
  const tx = -nz, tz = nx
  for (let i = before; i < m.vertexCount; i++) {
    const o = i * STRIDE
    const x = m.data[o], y = m.data[o + 1], z = m.data[o + 2]
    const ax = m.data[o + 3], ay = m.data[o + 4], az = m.data[o + 5]
    m.data[o] = cx + tx * x + nx * y
    m.data[o + 1] = cy + z
    m.data[o + 2] = cz + tz * x + nz * y
    m.data[o + 3] = tx * ax + nx * ay
    m.data[o + 4] = az
    m.data[o + 5] = tz * ax + nz * ay
  }
}

/** Small glass water carafe (glass material). Origin = table under it; spout on the -x side. */
export const CARAFE_H = 12.2
export function buildCarafe(m: ColorMesh): void {
  const prof: ProfilePt[] = [
    [0.01, 0.0, 1.0],
    [2.7, 0.0, 1.0],
    [3.05, 0.25, 1.0],
    [3.15, 1.0, 0.6],
    [3.2, 5.5, 0.5],
    [2.8, 8.0, 0.55],
    [1.75, 9.6, 0.6],
    [1.6, 11.2, 0.6],
    [1.75, 11.9, 0.9],
    [1.8, CARAFE_H, 1.0],
    [1.62, CARAFE_H - 0.05, 1.0],
    [1.4, 11.2, 0.8],
    [1.55, 9.6, 0.6],
    [2.6, 8.0, 0.5],
    [2.95, 5.5, 0.45],
    [2.9, 1.0, 0.6],
    [2.4, 0.75, 1.0],
    [0.01, 0.7, 1.0],
  ]
  const before = m.vertexCount
  m.lathe(prof, 56, [0.86, 0.94, 1.0])
  // pull the lip into a pouring spout on the -x side
  for (let i = before; i < m.vertexCount; i++) {
    const o = i * STRIDE
    const x = m.data[o], y = m.data[o + 1], z = m.data[o + 2]
    if (y > 11.0) {
      const w = Math.max(0, -x / Math.max(0.01, Math.hypot(x, z)))
      const k = Math.pow(w, 6) * (y - 11.0) / (CARAFE_H - 11.0)
      m.data[o] = x - k * 0.9
      m.data[o + 1] = y - k * 0.25
    }
  }
}

/** Water inside the carafe (liquid material), two thirds full. */
export function buildCarafeWater(m: ColorMesh): void {
  m.lathe(
    [
      [0.01, 0.75, 0.0],
      [2.38, 0.8, 0.1],
      [2.85, 1.2, 0.2],
      [2.9, 5.5, 0.85],
      [2.7, 7.2, 1.0],
    ],
    40,
    [0.72, 0.84, 0.95],
    false,
    true,
  )
}

/** The brew surface inside the cauldron (liquid shader), slightly domed. */
export function buildBrew(m: ColorMesh, c: RGB): void {
  const rings = [0, 0.35, 0.7, 1]
  const R = 9.7
  const seg = 36
  const s0 = m.vertexCount
  for (let k = 0; k < rings.length; k++) {
    const n = k === 0 ? 1 : seg + 1
    const y = 0.25 * (1 - rings[k] * rings[k])
    for (let i = 0; i < n; i++) {
      const th = (i / seg) * Math.PI * 2
      m.vertex(rings[k] * R * Math.cos(th), y, rings[k] * R * Math.sin(th), 0, 1, 0, c, 1)
    }
  }
  for (let i = 0; i < seg; i++) m.tri(s0, s0 + 2 + i, s0 + 1 + i)
  for (let k = 1; k < rings.length - 1; k++) {
    const a = s0 + 1 + (k - 1) * (seg + 1)
    const b = s0 + 1 + k * (seg + 1)
    for (let i = 0; i < seg; i++) {
      m.tri(a + i, b + i + 1, b + i)
      m.tri(a + i, a + i + 1, b + i + 1)
    }
  }
}

/** Oak cutting board with bevelled edges and painted grain (vertex colour). */
export function buildBoard(m: ColorMesh, w: number, d: number, h: number): void {
  const light: RGB = [0.62, 0.45, 0.29]
  const dark: RGB = [0.36, 0.23, 0.13]
  const grain = (x: number, y: number, z: number): RGB => {
    // quarter-sawn oak: long flowing rings + fine pores + a few medullary flecks
    const warp = vnoise(x * 0.035, 0, z * 0.25) * 1.3 + vnoise(x * 0.2, 3, z * 0.8) * 0.25
    const ring = 0.5 + 0.5 * Math.sin((z + warp) * 3.6)
    const fine = 0.5 + 0.5 * Math.sin((z + warp * 0.8) * 11 + vnoise(x * 0.3, 5, z) * 1.5)
    const fleck = Math.max(0, vnoise(x * 0.7, 2, z * 3.5) - 0.66) * 2
    let c = mixRGB(light, dark, Math.pow(ring, 2.2) * 0.5 + fine * 0.2)
    c = mixRGB(c, [0.7, 0.54, 0.37], fleck)
    if (y < h * 0.5 - 0.2) c = mixRGB(c, dark, 0.3)
    return c
  }
  m.bevelSlab(0, -h / 2, 0, w / 2, h / 2, d / 2, 0.45, 40, 120, grain)
}

/** Porcelain dish (coupelle) with a heap of baking soda. Origin = table. */
export function buildSaucer(m: ColorMesh): void {
  const white: RGB = [0.56, 0.54, 0.5]
  m.lathe(
    [
      [0.01, 0.0],
      [2.6, 0.0],
      [2.9, 0.25],
      [4.6, 1.2],
      [5.0, 1.55],
      [4.86, 1.62],
      [4.4, 1.3],
      [2.7, 0.62],
      [0.01, 0.55],
    ],
    40,
    white,
  )
}

/** A heap of baking soda in the dish (matte powder). */
export function buildPowder(m: ColorMesh): void {
  const powder: RGB = [0.66, 0.65, 0.62]
  m.lathe(
    [
      [0.01, 1.95],
      [0.7, 1.88],
      [1.6, 1.5],
      [2.5, 0.95],
      [3.0, 0.66],
      [3.3, 0.6],
    ],
    28,
    powder,
    false,
    false,
    (x, y, z) => mixRGB(powder, [0.9, 0.9, 0.88], vnoise(x * 3, y * 3, z * 3) * 0.5),
  )
}

/** Teaspoon lying on the table, bowl at the origin, handle toward +x. */
export function buildSpoon(m: ColorMesh): void {
  const steel: RGB = [0.7, 0.7, 0.72]
  // bowl: shallow ellipsoid cap, squashed later through vertex positions
  const before = m.vertexCount
  m.lathe(
    [
      [0.01, 0.0],
      [0.8, 0.08],
      [1.3, 0.3],
      [1.45, 0.55],
      [1.38, 0.6],
      [1.15, 0.42],
      [0.6, 0.24],
      [0.01, 0.2],
    ],
    24,
    steel,
  )
  for (let i = before; i < m.vertexCount; i++) m.data[i * STRIDE + 2] *= 0.72
  // handle: an oval section swept along a gentle S curve (shaded like real cutlery)
  const seg = 14
  const ring = 8
  const start = m.vertexCount
  for (let k = 0; k <= seg; k++) {
    const t = k / seg
    const x = 1.25 + t * 9.6
    const y = 0.5 + Math.sin(t * Math.PI * 0.5) * 0.9
    const w = 0.2 + 0.28 * Math.pow(t, 1.3) // half width (z)
    const th = 0.09 + 0.03 * t // half thickness (y)
    for (let r = 0; r <= ring; r++) {
      const a = (r / ring) * Math.PI * 2
      const cz = Math.cos(a)
      const cy = Math.sin(a)
      const nl = Math.hypot(cz / w, cy / th) || 1
      m.vertex(x, y + cy * th, cz * w, 0, cy / th / nl, cz / w / nl, steel)
    }
  }
  for (let k = 0; k < seg; k++) {
    for (let r = 0; r < ring; r++) {
      const a = start + k * (ring + 1) + r
      const b = a + ring + 1
      m.tri(a, a + 1, b + 1)
      m.tri(a, b + 1, b)
    }
  }
}

/** A whole lemon lying on its side (long axis along x), with its two tips. Origin = table under it. */
export function buildWholeLemon(m: ColorMesh): void {
  const peel: RGB = [0.86, 0.6, 0.05]
  const prof: ProfilePt[] = []
  const L = 3.8 // half length
  const R = 2.75 // equatorial radius
  for (let k = 0; k <= 18; k++) {
    const t = -1 + (2 * k) / 18
    // lemon silhouette: ellipse with pinched, slightly pointed tips
    let r = R * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - 0.08 * t * t)
    if (Math.abs(t) > 0.86) r = Math.max(r, 0.22 * (1 - (Math.abs(t) - 0.86) / 0.14))
    const y = t * L * (Math.abs(t) > 0.9 ? 1.06 : 1)
    prof.push([Math.max(0.01, r), y])
  }
  const before = m.vertexCount
  m.lathe(prof, 36, peel, false, false, (x, y, z) => mixRGB(peel, [0.74, 0.5, 0.04], vnoise(x * 4, y * 4, z * 4) * 0.4 + vnoise(x * 18, y * 18, z * 18) * 0.12))
  // lay it down: lathe axis Y -> world X, resting on the table (lowest point at y = 0)
  for (let i = before; i < m.vertexCount; i++) {
    const o = i * STRIDE
    const x = m.data[o], y = m.data[o + 1], nx = m.data[o + 3], ny = m.data[o + 4]
    m.data[o] = y
    m.data[o + 1] = -x + R // the widest point touches the table exactly
    m.data[o + 3] = ny
    m.data[o + 4] = -nx
  }
}

/** Half a lemon, cut face up, resting on its peel. Origin = table. */
export function buildLemon(m: ColorMesh): void {
  const peel: RGB = [0.86, 0.6, 0.05]
  const R = 3.1
  const prof: ProfilePt[] = []
  for (let k = 0; k <= 10; k++) {
    const a = -Math.PI / 2 + (k / 10) * (Math.PI / 2)
    prof.push([Math.max(0.01, R * Math.cos(a)), R * 0.92 + R * 0.92 * Math.sin(a)])
  }
  m.lathe(prof, 32, peel, false, false, (x, y, z) => mixRGB(peel, [0.9, 0.62, 0.06], vnoise(x * 3, y * 3, z * 3) * 0.35))
  // cut face: pith ring + 10 juicy segments
  const yTop = R * 0.92
  const pith: RGB = [0.7, 0.62, 0.38]
  const flesh: RGB = [0.78, 0.54, 0.09]
  const seg = 40
  const c0 = m.vertex(0, yTop + 0.02, 0, 0, 1, 0, pith)
  const ring1 = m.vertexCount
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI * 2
    const inSeg = Math.abs(Math.sin(th * 5)) > 0.18
    const r = R * 0.82
    m.vertex(r * Math.cos(th), yTop + 0.02, r * Math.sin(th), 0, 1, 0, inSeg ? flesh : pith)
  }
  for (let i = 0; i < seg; i++) m.tri(c0, ring1 + i + 1, ring1 + i)
  const ring2 = m.vertexCount
  for (let i = 0; i <= seg; i++) {
    const th = (i / seg) * Math.PI * 2
    m.vertex(R * 0.995 * Math.cos(th), yTop, R * 0.995 * Math.sin(th), 0, 1, 0, pith)
  }
  for (let i = 0; i < seg; i++) {
    m.tri(ring1 + i, ring1 + i + 1, ring2 + i + 1)
    m.tri(ring1 + i, ring2 + i + 1, ring2 + i)
  }
}

/** Round-bottom potion vial: glass shell (glass material). Origin = table under the vial. */
export function buildVialGlass(m: ColorMesh): void {
  // round-bottom flask: the bulb is a true sphere section (smooth silhouette), then a slim neck and a lip
  const prof: ProfilePt[] = [[0.01, 0.0, 1.0]]
  const R = 2.78
  const cy = 2.9
  for (let k = 1; k <= 14; k++) {
    const a = -Math.PI / 2 + (k / 14) * (Math.PI * 0.83)
    prof.push([R * Math.cos(a), cy + R * Math.sin(a), 0.5 + 0.4 * Math.abs(Math.sin(a))])
  }
  prof.push([1.05, 6.2, 0.7], [0.95, 6.6, 0.75], [0.95, 8.2, 0.75], [1.2, 8.45, 1.0], [1.22, 8.75, 1.0], [1.0, 8.85, 1.0], [0.85, 8.6, 0.9])
  m.lathe(prof, 56, GLASS_TINT)
}

/** Potion inside the vial (liquid material): fills the bulb to the shoulder. */
export function buildVialLiquid(m: ColorMesh, c: RGB): void {
  const prof: ProfilePt[] = [[0.01, 0.2, 0.0]]
  const R = 2.6
  const cy = 2.9
  for (let k = 1; k <= 11; k++) {
    const a = -Math.PI / 2 + (k / 11) * (Math.PI * 0.62)
    prof.push([R * Math.cos(a), cy + R * Math.sin(a), (k / 11) * 0.95])
  }
  m.lathe(prof, 44, c, false, true)
}

/** Cork stopper (PBR). */
export function buildCork(m: ColorMesh): void {
  const cork: RGB = [0.66, 0.48, 0.3]
  m.lathe(
    [
      [0.01, 7.6],
      [0.82, 7.6],
      [0.9, 9.2],
      [1.02, 9.9],
      [0.95, 10.2],
      [0.01, 10.25],
    ],
    20,
    cork,
    false,
    false,
    (x, y, z) => mixRGB(cork, [0.48, 0.32, 0.18], vnoise(x * 4, y * 4, z * 4) * 0.7),
  )
}

/** Thin falling stream (liquid material), unit length along -Y, origin at the top. */
export function buildStream(m: ColorMesh, c: RGB): void {
  const prof: ProfilePt[] = []
  for (let j = 0; j <= 10; j++) {
    const t = j / 10
    prof.push([0.16 - 0.06 * t + 0.02 * Math.sin(t * 9), -t, 0.6])
  }
  prof.reverse()
  m.lathe(prof, 10, c, false, false)
}

/** Leather-bound grimoire (closed). Origin = table, spine along -x. Returns the half sizes. */
export const BOOK_W = 17 // closed width (x)
export const BOOK_D = 23 // depth (z)
export const BOOK_T = 5 // thickness
export function buildBookBlock(m: ColorMesh): void {
  // the page block (cream with gilt edges painted on the sides)
  const paper: RGB = [0.95, 0.9, 0.78]
  const gilt: RGB = [0.86, 0.66, 0.3]
  m.bevelSlab(0.4, BOOK_T / 2, 0, BOOK_W / 2 - 1.0, BOOK_T / 2 - 0.55, BOOK_D / 2 - 0.8, 0.05, 4, 4, (x, y, z) => {
    const edge = Math.abs(x - 0.4) > BOOK_W / 2 - 1.2 || Math.abs(z) > BOOK_D / 2 - 1.0
    return edge ? mixRGB(gilt, paper, 0.25 + 0.2 * Math.sin(y * 40)) : paper
  })
}
export function buildBookCover(m: ColorMesh, top: boolean): void {
  // one cover board, hinged at x = -BOOK_W/2 (spine side): built relative to the hinge
  const leather: RGB = [0.42, 0.21, 0.11]
  const dark: RGB = [0.26, 0.11, 0.06]
  const tooled = (x: number, y: number, z: number): RGB => {
    // pebbled leather: large mottling + fine grain + a few creases
    const n = vnoise(x * 1.2, y * 1.2, z * 1.2) * 0.45 + vnoise(x * 6, y * 6, z * 6) * 0.35 + vnoise(x * 15, y * 15, z * 15) * 0.2
    const crease = Math.max(0, 1 - Math.abs(Math.sin(x * 0.9 + vnoise(x * 0.5, 1, z * 0.5) * 4 + z * 0.35)) * 8) * 0.35
    let c = mixRGB(leather, dark, n * 0.75 + crease)
    // blind-tooled frame on the front cover
    const fx = Math.abs(x - BOOK_W / 2)
    const fz = Math.abs(z)
    const inFrame = (Math.abs(fx - (BOOK_W / 2 - 2.2)) < 0.25 && fz < BOOK_D / 2 - 2.2) || (Math.abs(fz - (BOOK_D / 2 - 2.2)) < 0.25 && fx < BOOK_W / 2 - 2.2)
    if (top && inFrame) c = mixRGB(c, dark, 0.8)
    return c
  }
  m.bevelSlab(BOOK_W / 2, 0, 0, BOOK_W / 2, 0.28, BOOK_D / 2, 0.22, 70, 96, tooled)
}
/** Brass corner guards + a centre medallion for the front cover. Built relative to the hinge. */
export function buildBookBrass(m: ColorMesh): void {
  const brass: RGB = [0.9, 0.7, 0.36]
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const cx = BOOK_W / 2 + sx * (BOOK_W / 2 - 1.2)
    const cz = sz * (BOOK_D / 2 - 1.2)
    m.box(cx, 0.32, cz, 1.25, 0.08, 1.25, brass)
  }
  m.lathe(
    [
      [0.01, 0.3],
      [2.3, 0.3],
      [2.35, 0.42],
      [1.9, 0.5],
      [1.3, 0.44],
      [0.01, 0.52],
    ],
    32,
    brass,
  )
  for (let i = m.vertexCount - 33 * 6; i < m.vertexCount; i++) m.data[i * STRIDE] += BOOK_W / 2
}
/** The spine (rounded leather), along z, at x = 0 local. */
export function buildBookSpine(m: ColorMesh): void {
  const leather: RGB = [0.48, 0.25, 0.13]
  const seg = 10
  const start = m.vertexCount
  for (let j = 0; j <= 1; j++) {
    const z = (j - 0.5) * BOOK_D
    for (let i = 0; i <= seg; i++) {
      const a = Math.PI / 2 + (i / seg) * Math.PI
      const x = Math.cos(a) * 1.2
      const y = BOOK_T / 2 + Math.sin(a) * (BOOK_T / 2)
      m.vertex(x, y, z, Math.cos(a), Math.sin(a), 0, leather)
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = start + i
    const b = start + seg + 1 + i
    m.tri(a, b, b + 1)
    m.tri(a, b + 1, a + 1)
  }
  // gilt bands
  for (const z of [-7, -2.4, 2.4, 7]) m.box(-1.15, BOOK_T / 2, z, 0.12, BOOK_T / 2 - 0.2, 0.25, [0.86, 0.66, 0.3])
}

/** One open page (cream sheet) hinged at x = 0, lying along +x. */
export function buildPage(m: ColorMesh, w: number, d: number): void {
  const paper: RGB = [0.76, 0.7, 0.58]
  const seg = 8
  const start = m.vertexCount
  for (let j = 0; j <= 1; j++) {
    for (let i = 0; i <= seg; i++) {
      const t = i / seg
      const x = t * w
      const y = Math.sin(t * Math.PI) * 0.35 // gentle curl
      const z = (j - 0.5) * d
      m.vertex(x, y, z, 0, 1, 0, mixRGB(paper, [0.86, 0.79, 0.64], Math.pow(1 - t, 6) * 0.6))
    }
  }
  for (let i = 0; i < seg; i++) {
    const a = start + i
    const b = start + seg + 1 + i
    m.tri(a, b, b + 1)
    m.tri(a, b + 1, a + 1)
    m.tri(a, b + 1, b)
    m.tri(a, a + 1, b + 1)
  }
}

/** Rune: a hovering sigil (glow material): soft halo, double ring with ticks, check mark. */
export function buildRune(m: ColorMesh, gold: RGB): void {
  m.glowXY(0, 0, 4.6, -0.05, gold, 0.18)
  m.glowXY(0, 0, 2.6, -0.02, [1, 0.92, 0.8], 0.08)
  const ring = (r0: number, r1: number, z: number, a: number) => {
    const b = m.vertexCount
    const seg = 48
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2
      m.vertex(r0 * Math.cos(th), r0 * Math.sin(th), z, 0, 0, 1, gold, a)
      m.vertex(r1 * Math.cos(th), r1 * Math.sin(th), z, 0, 0, 1, gold, a)
    }
    for (let i = 0; i < seg; i++) {
      const k = b + i * 2
      m.tri(k, k + 1, k + 3)
      m.tri(k, k + 3, k + 2)
    }
  }
  ring(2.95, 3.25, 0.02, 0.78)
  ring(2.5, 2.62, 0.02, 0.45)
  for (let k = 0; k < 12; k++) {
    const th = (k / 12) * Math.PI * 2
    const c = Math.cos(th), s = Math.sin(th)
    m.strokeXY(c * 2.7, s * 2.7, c * 2.95, s * 2.95, 0.1, 0.03, gold, 0.8)
  }
  m.strokeXY(-1.2, 0.05, -0.3, -0.9, 0.42, 0.05, [1, 0.9, 0.72], 0.82)
  m.strokeXY(-0.3, -0.9, 1.35, 1.1, 0.42, 0.05, [1, 0.9, 0.72], 0.82)
}

/** Arrow (chevron) pointing +X in the XY plane, facing +Z, with a soft glow. */
export function buildChevron(m: ColorMesh, c: RGB): void {
  m.glowXY(0, 0, 3.2, -0.02, c, 0.25)
  const b = m.vertex(2.0, 0, 0, 0, 0, 1, c)
  m.vertex(-1.2, 1.6, 0, 0, 0, 1, c)
  m.vertex(-0.4, 0, 0, 0, 0, 1, c)
  m.vertex(-1.2, -1.6, 0, 0, 0, 1, c)
  m.tri(b + 2, b, b + 1)
  m.tri(b + 2, b + 3, b)
}

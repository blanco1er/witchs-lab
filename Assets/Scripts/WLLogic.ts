// Witch's Lab — pure logic (no Lens Studio API).
// Chemistry data, the experiment state machine, colour maths, and the
// geometry helpers used by the Lens layer. Everything here is plain
// TypeScript so it can be unit-tested outside Lens Studio (tools/test_logic.mjs).

export type RGB = [number, number, number]
export type V3 = [number, number, number]

/** The three prediction vials. Real red-cabbage colour families. */
export type Family = "red" | "violet" | "blue"

export const FAMILIES: Family[] = ["red", "violet", "blue"]

/**
 * Display colours. Bright on purpose: Specs uses an additive display, so dark
 * colours read as transparent. Values approximate published red-cabbage
 * indicator charts (Univ. of Illinois IGB, TeachEngineering / CU Boulder,
 * Fleet Science Center). Real colours vary with cabbage strength.
 */
export const COLOR: Record<string, RGB> = {
  indicator: [0.52, 0.3, 0.86], // purple cabbage water as poured
  red: [0.98, 0.18, 0.32],
  violet: [0.58, 0.36, 0.94],
  blue: [0.24, 0.5, 1.0],
  gold: [1.0, 0.78, 0.36], // runes and highlights
  glass: [0.82, 0.92, 1.0], // glass edges
  table: [0.16, 0.12, 0.2], // near-black: almost invisible on Specs, a soft surface in Preview
  tableEdge: [0.55, 0.42, 0.75],
  cauldronRim: [0.95, 0.72, 0.38],
  cauldronBody: [0.22, 0.2, 0.3],
  text: [1, 1, 1],
}

export const FAMILY_COLOR: Record<Family, RGB> = {
  red: COLOR.red,
  violet: COLOR.violet,
  blue: COLOR.blue,
}

export const FAMILY_LABEL: Record<Family, string> = {
  red: "RED",
  violet: "PURPLE",
  blue: "BLUE",
}

export interface Substance {
  id: string
  name: string // what the user pours
  amount: string // how much
  ph: number // approximate pH of the household product
  phText: string
  family: Family // the colour family red cabbage turns
  why: string // one line, shown on the glass after the reveal
  kind: string // acid / neutral / base
  source: string
}

/** The three real glasses. Only safe household products (lemon, water, baking soda). */
export const GLASSES: Substance[] = [
  {
    id: "lemon",
    name: "Lemon juice",
    amount: "1 spoon of lemon juice",
    ph: 2.3,
    phText: "pH ~2",
    family: "red",
    kind: "ACID",
    why: "Acid! Extra H+ turns the cabbage pigment into its red form.",
    source: "US FDA 'Approximate pH of Foods' (lemon juice 2.0-2.6)",
  },
  {
    id: "water",
    name: "Plain water",
    amount: "1 spoon of tap water",
    ph: 7,
    phText: "pH ~7",
    family: "violet",
    kind: "NEUTRAL",
    why: "No change: water is neutral. This is your control glass.",
    source: "Neutral reference, TeachEngineering colour chart",
  },
  {
    id: "soda",
    name: "Baking soda",
    amount: "1 spoon of baking soda in water",
    ph: 8.3,
    phText: "pH ~8",
    family: "blue",
    kind: "BASE",
    why: "Base! The pigment loses H+ and shifts toward blue.",
    source: "0.1 M sodium bicarbonate, pH 8.3 (Merck; NIST SRM 2191a)",
  },
]

/** pH 1..14 colour scale for the grimoire. Index 0 = pH 1. */
export const PH_SCALE: RGB[] = [
  [0.98, 0.16, 0.28], // 1 red
  [0.98, 0.18, 0.32], // 2 red
  [0.94, 0.26, 0.52], // 3 pink-red
  [0.84, 0.3, 0.7], // 4 pink-purple
  [0.72, 0.32, 0.82], // 5 purple
  [0.64, 0.34, 0.9], // 6 purple-violet
  [0.58, 0.36, 0.94], // 7 violet
  [0.36, 0.44, 1.0], // 8 blue-violet
  [0.24, 0.5, 1.0], // 9 blue
  [0.16, 0.66, 0.86], // 10 blue-green
  [0.2, 0.8, 0.62], // 11 teal-green
  [0.32, 0.88, 0.36], // 12 green
  [0.7, 0.92, 0.28], // 13 yellow-green
  [0.96, 0.9, 0.26], // 14 yellow
]

export const SAFETY_LINE = "A grown-up handles hot water. Never drink the potions."
export const VARY_LINE = "Your colours may vary with cabbage strength."
export const DANGER_LINE = "Green and yellow (pH 12-14) need harsh chemicals: seen here only."

// ---------------------------------------------------------------------------
// Experiment state machine
// ---------------------------------------------------------------------------

export type Phase = "prep" | "predict" | "pour" | "reveal" | "finale"

export interface LabState {
  phase: Phase
  glass: number // active glass index (0..2), meaningful in predict/pour/reveal
  bets: (Family | null)[]
  correct: (boolean | null)[]
  score: number
  filled: boolean // base indicator poured into the glasses
}

export function newLab(): LabState {
  return {
    phase: "prep",
    glass: 0,
    bets: GLASSES.map(() => null),
    correct: GLASSES.map(() => null),
    score: 0,
    filled: false,
  }
}

export type LabEvent =
  | {type: "baseFilled"}
  | {type: "bet"; family: Family}
  | {type: "poured"}
  | {type: "revealDone"}
  | {type: "restart"}

export interface StepResult {
  state: LabState
  accepted: boolean
  /** Side effects the Lens layer should play. */
  cues: string[]
}

function clone(s: LabState): LabState {
  return {...s, bets: s.bets.slice(), correct: s.correct.slice()}
}

/**
 * Pure transition function. Invalid events are refused (accepted=false) and
 * never change the state — so a stray pinch or a vial thrown at the wrong
 * moment cannot break the experiment.
 */
export function step(s: LabState, e: LabEvent): StepResult {
  const n = clone(s)
  switch (e.type) {
    case "restart":
      return {state: newLab(), accepted: true, cues: ["restart"]}
    case "baseFilled":
      if (s.phase !== "prep") return {state: s, accepted: false, cues: []}
      n.filled = true
      n.phase = "predict"
      n.glass = 0
      return {state: n, accepted: true, cues: ["fillAll", "focus:0"]}
    case "bet":
      // You may change your mind until you pour.
      if (s.phase !== "predict" && s.phase !== "pour") return {state: s, accepted: false, cues: []}
      n.bets[s.glass] = e.family
      n.phase = "pour"
      return {state: n, accepted: true, cues: ["betPlaced:" + e.family]}
    case "poured": {
      if (s.phase !== "pour") return {state: s, accepted: false, cues: []}
      const bet = s.bets[s.glass]
      const ok = bet === GLASSES[s.glass].family
      n.correct[s.glass] = ok
      if (ok) n.score += 1
      n.phase = "reveal"
      return {state: n, accepted: true, cues: ["reveal:" + s.glass, ok ? "right" : "wrong"]}
    }
    case "revealDone":
      if (s.phase !== "reveal") return {state: s, accepted: false, cues: []}
      if (s.glass < GLASSES.length - 1) {
        n.glass = s.glass + 1
        n.phase = "predict"
        return {state: n, accepted: true, cues: ["focus:" + n.glass]}
      }
      n.phase = "finale"
      return {state: n, accepted: true, cues: ["finale"]}
  }
  return {state: s, accepted: false, cues: []}
}

// ---------------------------------------------------------------------------
// Text shown on the glass card (short: "show only what's needed now")
// ---------------------------------------------------------------------------

export interface CardText {
  title: string
  body: string
  accent: RGB
}

export function cardFor(s: LabState, glassIndex: number): CardText | null {
  const g = GLASSES[glassIndex]
  const label = `GLASS ${glassIndex + 1} - ${g.name.toUpperCase()}`
  if (s.phase === "prep") {
    if (glassIndex !== 1) return null
    return {
      title: "BREW THE BASE",
      body: "Pour purple cabbage water into all 3 glasses, half full.\nPinch the rune when done.",
      accent: COLOR.indicator,
    }
  }
  if (glassIndex !== s.glass && s.phase !== "finale") return null
  switch (s.phase) {
    case "predict":
      return {title: label, body: "Predict the colour:\ndrop a vial into the cauldron.", accent: COLOR.gold}
    case "pour": {
      const bet = s.bets[glassIndex] as Family
      return {
        title: label,
        body: `Your bet: ${FAMILY_LABEL[bet]}. Now add ${g.amount}.\nPinch the rune when poured.`,
        accent: FAMILY_COLOR[bet],
      }
    }
    case "reveal": {
      const ok = s.correct[glassIndex] === true
      return {
        title: `${FAMILY_LABEL[g.family]}  |  ${g.phText}  |  ${g.kind}`,
        body: `${ok ? "Right prediction! +1" : "Not this time."}\n${g.why}`,
        accent: FAMILY_COLOR[g.family],
      }
    }
    default:
      return null
  }
}

export function finaleSummary(s: LabState): string[] {
  const lines: string[] = []
  GLASSES.forEach((g, i) => {
    const bet = s.bets[i]
    const mark = s.correct[i] ? "Right" : "Missed"
    lines.push(`${g.name}: ${FAMILY_LABEL[g.family]} (${g.phText}). You said ${bet ? FAMILY_LABEL[bet] : "-"}. ${mark}`)
  })
  return lines
}

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

export function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  const k = clamp01(t)
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

export function easeInOut(t: number): number {
  const k = clamp01(t)
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
}

/**
 * Colour of a liquid vertex during the reveal: the new colour rises from the
 * bottom of the glass like a stirred-in reagent. y01 = vertex height (0 bottom,
 * 1 surface), t = reveal progress 0..1.
 */
export function swirlColor(from: RGB, to: RGB, y01: number, t: number): RGB {
  const front = t * 1.6 - 0.3 // wave front moves bottom → top
  const local = clamp01((front - y01) / 0.3)
  return lerpRGB(from, to, easeInOut(local))
}

/**
 * Organic diffusion for the reveal (replaces the flat colour swap): the new
 * colour blooms from the pour point at the surface and sinks through the
 * glass in curling tendrils, like a reagent dripping into indicator.
 * p = vertex (cm, liquid-local, y up from the liquid floor), impact = where
 * the pour lands, size = liquid height (cm), t = progress 0..1.
 * Returns the mix factor 0 (old colour) .. 1 (new colour); exactly 1 at t = 1.
 */
export function diffuseMix(p: V3, impact: V3, size: number, t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const dx = p[0] - impact[0]
  const dy = p[1] - impact[1]
  const dz = p[2] - impact[2]
  const d = Math.sqrt(dx * dx + dy * dy * 1.3 + dz * dz) / Math.max(0.001, size)
  const th = Math.atan2(p[2], p[0])
  const y = p[1] / Math.max(0.001, size)
  const curl = 0.5 * Math.sin(3 * th + 5 * y + t * 4) + 0.3 * Math.sin(5 * th - 3 * y - t * 3)
  const dd = d * (1 + 0.28 * curl)
  const e = 1 - Math.pow(1 - t, 3)
  const front = e * 1.9
  const k = clamp01((front - dd) / 0.35)
  const tail = clamp01((t - 0.82) / 0.18)
  return k + (1 - k) * tail * tail
}

/** Colour for a pH value on the grimoire scale (1..14, interpolated). */
export function phColor(ph: number): RGB {
  const x = Math.min(14, Math.max(1, ph)) - 1
  const i = Math.floor(x)
  const j = Math.min(13, i + 1)
  return lerpRGB(PH_SCALE[i], PH_SCALE[j], x - i)
}

// ---------------------------------------------------------------------------
// Vector helpers (tuples) — used by the off-screen guide and the throw.
// ---------------------------------------------------------------------------

export const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const vscale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
export const vdot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const vlen = (a: V3): number => Math.sqrt(vdot(a, a))
export function vnorm(a: V3): V3 {
  const l = vlen(a)
  return l > 1e-9 ? vscale(a, 1 / l) : [0, 0, 0]
}

export interface OffscreenCue {
  inView: boolean
  angleDeg: number // angle between gaze and target
  /** Unit direction toward the target, projected on the view plane (for the arrow). */
  screenDir: [number, number]
}

/**
 * Is the target inside the view? Specs' display is narrow (about 46° diagonal),
 * so the horizontal and vertical half-angles are checked separately
 * (defaults 20° and 26°: a glass low on the table is still "in view").
 * camRight/camUp/camFwd are world-space unit vectors; camFwd is the gaze.
 */
export function offscreenCue(
  camPos: V3,
  camFwd: V3,
  camRight: V3,
  camUp: V3,
  target: V3,
  halfHDeg: number = 20,
  halfVDeg: number = 26,
): OffscreenCue {
  const d = vnorm(vsub(target, camPos))
  const f = vdot(d, camFwd)
  const angleDeg = (Math.acos(Math.max(-1, Math.min(1, f))) * 180) / Math.PI
  const sx = vdot(d, camRight)
  const sy = vdot(d, camUp)
  const yaw = (Math.atan2(sx, f) * 180) / Math.PI
  const pitch = (Math.atan2(sy, f) * 180) / Math.PI
  const l = Math.sqrt(sx * sx + sy * sy)
  const screenDir: [number, number] = l > 1e-6 ? [sx / l, sy / l] : [0, -1]
  const inView = f > 0 && Math.abs(yaw) <= halfHDeg && Math.abs(pitch) <= halfVDeg
  return {inView, angleDeg, screenDir}
}

export interface ThrowResult {
  hit: boolean
  points: V3[] // sampled flight path
  landing: V3
}

/**
 * Simple ballistic flight (cm, seconds, Y up). The vial "hits" when it comes
 * down through the cauldron mouth plane inside the mouth radius.
 */
export function simulateThrow(
  start: V3,
  velocity: V3,
  mouthCenter: V3,
  mouthRadius: number,
  gravity: number = 980,
  dt: number = 1 / 60,
  maxTime: number = 2.5,
): ThrowResult {
  let p: V3 = [start[0], start[1], start[2]]
  let v: V3 = [velocity[0], velocity[1], velocity[2]]
  const points: V3[] = [p]
  for (let t = 0; t < maxTime; t += dt) {
    const next: V3 = vadd(p, vscale(v, dt))
    v = [v[0], v[1] - gravity * dt, v[2]]
    // crossing the mouth plane downward?
    if (p[1] >= mouthCenter[1] && next[1] < mouthCenter[1] && v[1] < 0) {
      const k = (p[1] - mouthCenter[1]) / (p[1] - next[1] || 1)
      const cross: V3 = vadd(p, vscale(vsub(next, p), k))
      const dx = cross[0] - mouthCenter[0]
      const dz = cross[2] - mouthCenter[2]
      if (Math.sqrt(dx * dx + dz * dz) <= mouthRadius) {
        points.push(cross)
        return {hit: true, points, landing: cross}
      }
    }
    p = next
    points.push(p)
    if (p[1] < mouthCenter[1] - 40) break // fell well below the table
  }
  return {hit: false, points, landing: p}
}

// ---------------------------------------------------------------------------
// Contact physics for the Lens layer: nothing solid goes through the table,
// the board, the stand or another vial.
// ---------------------------------------------------------------------------

/**
 * Cut a flight path at its first contact: the object's bottom (centre y minus
 * halfHeight) may never go below groundAt(x, z). Returns the kept points, the
 * last one resting exactly on the surface, and whether a contact happened.
 */
export function clipToGround(points: V3[], groundAt: (x: number, z: number) => number, halfHeight: number): {points: V3[]; landed: boolean} {
  const out: V3[] = []
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const g = groundAt(p[0], p[2]) + halfHeight
    if (p[1] < g) {
      if (i === 0) return {points: [[p[0], g, p[2]]], landed: true}
      const q = points[i - 1]
      const gq = groundAt(q[0], q[2]) + halfHeight
      const k = (q[1] - gq) / Math.max(1e-6, q[1] - gq - (p[1] - g))
      const x = q[0] + (p[0] - q[0]) * k
      const z = q[2] + (p[2] - q[2]) * k
      out.push([x, groundAt(x, z) + halfHeight, z])
      return {points: out, landed: true}
    }
    out.push(p)
  }
  return {points: out, landed: false}
}

/** A released object falls straight down under gravity (sampled at 60 Hz) until it rests on the surface. */
export function dropPath(start: V3, groundAt: (x: number, z: number) => number, halfHeight: number, gravity: number = 980): V3[] {
  const pts: V3[] = [start]
  let y = start[1]
  let v = 0
  for (let i = 0; i < 120; i++) {
    v -= gravity / 60
    y += v / 60
    pts.push([start[0], y, start[2]])
    if (y < groundAt(start[0], start[2]) + halfHeight) break
  }
  return clipToGround(pts, groundAt, halfHeight).points
}

/**
 * Path from a to b that never sweeps through neighbours: rise to `clearY`,
 * travel above everything, then come straight down into the slot
 * (sampled at 60 Hz over `seconds`).
 */
export function arcPath(a: V3, b: V3, clearY: number, seconds: number): V3[] {
  const n = Math.max(2, Math.round(seconds * 60))
  const apex = Math.max(clearY, a[1], b[1])
  const ease = (t: number) => {
    const k = clamp01(t)
    return k * k * (3 - 2 * k)
  }
  const pts: V3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const h = ease((t - 0.22) / 0.56) // horizontal travel happens at the top
    const up = ease(t / 0.28)
    const down = ease((t - 0.72) / 0.28)
    const y = a[1] + (apex - a[1]) * up - (apex - b[1]) * down
    pts.push([a[0] + (b[0] - a[0]) * h, y, a[2] + (b[2] - a[2]) * h])
  }
  pts[n] = [b[0], b[1], b[2]]
  return pts
}

/** Arc used when the user just taps a vial: a guaranteed lob into the cauldron. */
export function lobVelocity(start: V3, target: V3, flightTime: number, gravity: number = 980): V3 {
  const d = vsub(target, start)
  return [d[0] / flightTime, (d[1] + 0.5 * gravity * flightTime * flightTime) / flightTime, d[2] / flightTime]
}

/** Release velocity from the last samples of a grab (cm/s). */
export function releaseVelocity(samples: {t: number; p: V3}[], window: number = 0.12): V3 {
  if (samples.length < 2) return [0, 0, 0]
  const last = samples[samples.length - 1]
  let first = samples[0]
  for (let i = samples.length - 1; i >= 0; i--) {
    if (last.t - samples[i].t >= window) {
      first = samples[i]
      break
    }
  }
  const dt = last.t - first.t
  if (dt <= 1e-4) return [0, 0, 0]
  return vscale(vsub(last.p, first.p), 1 / dt)
}

/** Released right above the cauldron? (drop-in, the most reliable gesture in Preview) */
export function isDropIn(p: V3, mouthCenter: V3, mouthRadius: number): boolean {
  const dx = p[0] - mouthCenter[0]
  const dz = p[2] - mouthCenter[2]
  return Math.sqrt(dx * dx + dz * dz) <= mouthRadius * 1.25 && p[1] >= mouthCenter[1] - 2 && p[1] <= mouthCenter[1] + 45
}

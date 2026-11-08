// Witch's Lab — main component. Put it on ONE SceneObject named "WitchsLab".
// It builds the whole lab at runtime (no prefab, no imported model), sets it
// on a REAL surface found with World Query (fallback: 68 cm ahead, 32 cm below
// the eyes) at real scale, and runs the real red-cabbage pH-indicator
// experiment as a 3-glass potion game:
//   brew the base → predict (drop a vial in the cauldron: it tips and pours) →
//   pour for real → pinch the rune → a spoon pours, the true colour blooms
//   through the glass + one line of chemistry → next glass (chime + arrow if
//   out of view) → the grimoire lifts off the table and opens.
//
// Who decides what:
//   - the colour of each glass comes from a fixed table of published indicator
//     charts (WLLogic.GLASSES) — never guessed at runtime;
//   - the user decides when they have poured (pinch); the Lens never claims to
//     see the glass (camera colour reading is out of scope in Preview);
//   - invalid inputs (a vial thrown while revealing, a double pinch) are refused
//     by the pure state machine and change nothing.

import {Interactable, InteractableManipulation} from "./WLKit"
import {
  COLOR,
  FAMILIES,
  FAMILY_COLOR,
  FAMILY_LABEL,
  Family,
  GLASSES,
  LabEvent,
  LabState,
  RGB,
  SAFETY_LINE,
  V3,
  arcPath,
  cardFor,
  clipToGround,
  diffuseMix,
  dropPath,
  easeInOut,
  isDropIn,
  lerpRGB,
  lobVelocity,
  newLab,
  offscreenCue,
  releaseVelocity,
  simulateThrow,
  step,
} from "./WLLogic"
import {
  ColorMesh,
  GLASS_FLOOR,
  GLASS_H,
  LIQUID_H,
  buildBoard,
  buildBrew,
  buildCarafe,
  buildCarafeWater,
  CARAFE_H,
  buildCauldron,
  buildChevron,
  buildCork,
  buildGlass,
  buildLemon,
  buildWholeLemon,
  buildLiquid,
  buildRune,
  buildPowder,
  buildSaucer,
  buildSpoon,
  buildStream,
  buildVialGlass,
  buildVialLiquid,
  child,
} from "./WLMesh"
import {Particles} from "./WLFx"
import {WLCardUI} from "./WLCardUI"
import {WLGrimoireUI} from "./WLGrimoireUI"

// ---------------------------------------------------------------------------
// Layout (cm, lab-local: origin = the real table surface, +X right, +Y up,
// +Z toward the user). Everything is real size.
// ---------------------------------------------------------------------------
const BOARD_H = 1.8 // oak board thickness
const BOARD_W = 44
const BOARD_D = 20
const BOARD_Z = 7 // board spans z -3..17 (plan: >= 2 cm from the room's place mat)
const GLASS_X = [-11.5, 0, 11.5]
const GLASS_Z = 6
const RUNE_Z = BOARD_Z + BOARD_D / 2 + 4.5 // hovering in front of the board, over the darker table
const RUNE_Y = 4.2
const CAULDRON_POS: V3 = [-23, 0, -38] // back left: fully in the starting view, clear of the board and the mat
const VIAL_X = [15, 23, 31] // 8 cm apart: 2.4 cm between flasks
const VIAL_Z = -38
const STAND_HALF_W = 12
const VIAL_HALF = 5.1 // the vial origin sits at mid-height so its collider wraps the flask
const VIAL_TOP = 8.8 // mouth height above the vial's base
const GLASS_R_OUT = 3.6
const CARD_Y = 24 // one card spot, centred over the board: from a seated view it only covers the empty gap behind the glasses
const CARD_Z = 9
const SAUCER_POS: V3 = [29, 0, 4]
const LEMON_POS: V3 = [-28, 0, 8] // whole lemon lying on the table
const HALF_LEMON_POS: V3 = [-29, 0, -2]
const CARAFE_POS: V3 = [29, 0, -12]
const BOOK_REST: V3 = [4, 0, -48.2] // rotated 90°: spans x -7.5..15.5, z -65.2..-47
const BOOK_OPEN: V3 = [0, 22, -10]

// timings (s)
const POUR_SPOON = 0.85 // spoon rises out of the dish, crosses above the glasses, stops over the glass
const POUR_START = 1.15 // stream starts
const DIFFUSE_START = 1.35
const DIFFUSE_LEN = 2.6
const RESULT_AT = 3.2 // card shows the result
const READ_TIME = 4.6

// 0.4 mm: a glass base exactly in the plane of the board z-fights (radial streaks); well inside the ±1 mm contact tolerance
const CONTACT_LIFT = 0.04
const SPOON_YAW = 0.93 // handle toward the back right, clear of the board

const toV3 = (v: vec3): V3 => [v.x, v.y, v.z]

type Timer = {at: number; fn: () => void}

function pbr(base: Material, metallic: number, roughness: number, twoSided: boolean = false): Material {
  const m = base.clone()
  try {
    ;(m.mainPass as any).metallic = metallic
    ;(m.mainPass as any).roughness = roughness
    m.mainPass.twoSided = twoSided
  } catch (e) {}
  return m
}

function order(v: RenderMeshVisual, n: number): RenderMeshVisual {
  v.setRenderOrder(n)
  return v
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------
class Sfx {
  private comps: Record<string, AudioComponent> = {}

  add(parent: SceneObject, name: string, track: AudioTrackAsset | undefined, volume: number, spatial: boolean): void {
    if (!track) return
    const o = child(parent, "Sfx_" + name)
    const a = o.createComponent("Component.AudioComponent") as AudioComponent
    a.audioTrack = track
    a.volume = volume
    if (spatial) a.spatialAudio.enabled = true
    this.comps[name] = a
  }

  play(name: string, loops: number = 1): void {
    const a = this.comps[name]
    if (!a) return
    if (a.isPlaying()) a.stop(false)
    a.play(loops)
  }

  has(name: string): boolean {
    return !!this.comps[name]
  }

  sceneObject(name: string): SceneObject | null {
    const a = this.comps[name]
    return a ? a.getSceneObject() : null
  }
}

// ---------------------------------------------------------------------------
// Rune: the one big pinch target ("I poured it"). A 6.4 cm glowing sigil,
// shown only when it is the next thing to do.
// ---------------------------------------------------------------------------
class Rune {
  readonly obj: SceneObject
  readonly interactable: Interactable
  private visual: SceneObject
  private active = false
  private hover = false
  private appear = 0

  constructor(parent: SceneObject, name: string, x: number, label: string, glow: Material, labelSize: number, font: Font | undefined, onPinch: () => void) {
    this.obj = child(parent, name, x, RUNE_Y, RUNE_Z)
    // tilt the face up toward the user's eyes
    this.obj.getTransform().setLocalRotation(quat.angleAxis(-0.55, vec3.right()))
    this.visual = child(this.obj, name + "_Visual")
    const m = new ColorMesh()
    buildRune(m, COLOR.gold)
    order(m.attach(this.visual, glow), 6)

    const col = this.obj.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createSphereShape()
    shape.radius = 3.6
    col.shape = shape
    col.fitVisual = false

    this.interactable = this.obj.createComponent(Interactable.getTypeName()) as Interactable
    this.interactable.onHoverEnter.add(() => (this.hover = true))
    this.interactable.onHoverExit.add(() => (this.hover = false))
    this.interactable.onTriggerEnd.add(() => {
      if (this.active) onPinch()
    })

    const lo = child(this.obj, name + "_Label", 4.0, 0, 0.2) // beside the rune: never over the glass
    const t = lo.createComponent("Component.Text") as Text
    t.depthTest = true
    t.size = labelSize
    if (font) t.font = font
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.layoutRect = Rect.create(0, 16, -1.2, 1.2)
    t.horizontalAlignment = HorizontalAlignment.Left
    t.verticalAlignment = VerticalAlignment.Center
    t.textFill.color = new vec4(0.92, 0.78, 0.55, 0.9)
    t.outlineSettings.enabled = true
    t.outlineSettings.size = 0.07
    t.outlineSettings.fill.color = new vec4(0.92, 0.78, 0.55, 0.9)
    t.text = label
    this.setActive(false)
  }

  setActive(on: boolean): void {
    this.active = on
    this.obj.enabled = on
    if (on) this.appear = 0
  }

  get isActive(): boolean {
    return this.active
  }

  tick(t: number, dt: number): void {
    if (!this.active) return
    this.appear = Math.min(1, this.appear + dt * 3.5)
    const pulse = 1 + 0.05 * Math.sin(t * 3.2)
    const s = easeInOut(this.appear) * pulse * (this.hover ? 1.12 : 1)
    const tr = this.visual.getTransform()
    tr.setLocalScale(new vec3(s, s, s))
    tr.setLocalRotation(quat.angleAxis(t * 0.35, vec3.forward()))
  }
}

// ---------------------------------------------------------------------------
// Vial: grab-and-drop (or tap, or toss) over the cauldron to place a bet.
// It flies over the mouth, tips, pours a thin stream, then floats home.
// ---------------------------------------------------------------------------
type VialMode = "idle" | "held" | "flying" | "pouring" | "resting"

class Vial {
  readonly obj: SceneObject
  readonly family: Family
  readonly interactable: Interactable
  readonly manip: InteractableManipulation
  private home: vec3
  private mode: VialMode = "idle"
  private samples: {t: number; p: V3}[] = []
  private heldAt = 0
  private path: V3[] = []
  private pathT = 0
  private pathHit = false
  private enabledForBets = false
  private pourT = 0
  private restT = 0
  private tipSign = 1
  private shadow: SceneObject
  private cork: SceneObject

  constructor(parent: SceneObject, family: Family, x: number, private lab: WitchsLab, labelSize: number) {
    this.family = family
    this.home = new vec3(x, VIAL_HALF + lab.standTop, VIAL_Z)
    this.obj = child(parent, "Vial_" + family, x, this.home.y, VIAL_Z)
    const vis = child(this.obj, "Vial_" + family + "_Visual", 0, -VIAL_HALF + CONTACT_LIFT, 0)
    const liq = new ColorMesh()
    buildVialLiquid(liq, FAMILY_COLOR[family])
    order(liq.attach(child(vis, "Potion"), lab.matLiquid), 1)
    const gl = new ColorMesh()
    buildVialGlass(gl)
    order(gl.attach(child(vis, "Flask"), lab.matGlass), 3)
    const cork = new ColorMesh()
    buildCork(cork)
    this.cork = child(vis, "Cork")
    cork.attach(this.cork, lab.matCork)

    // soft contact shadow on the stand (fades when the vial leaves)
    this.shadow = child(parent, "VialShadow_" + family, x, lab.standTop + 0.04, VIAL_Z)
    const sm = new ColorMesh()
    sm.shadowXZ(0.3, -0.3, 3.4, 3.0, 0, 0.5)
    order(sm.attach(this.shadow, lab.matAlpha), 2)

    const col = this.obj.createComponent("Physics.ColliderComponent") as ColliderComponent
    const shape = Shape.createBoxShape()
    shape.size = new vec3(6, 10.6, 6) // the flask: 5.5 cm wide, 10.3 cm tall with its cork
    col.shape = shape
    col.fitVisual = false

    this.interactable = this.obj.createComponent(Interactable.getTypeName()) as Interactable
    this.interactable.enableInstantDrag = true // Preview mouse grabs immediately
    this.manip = this.obj.createComponent(InteractableManipulation.getTypeName()) as InteractableManipulation
    this.manip.setNewInteractable(this.interactable)
    this.manip.setCanScale(false)

    this.manip.onManipulationStart.add(() => this.onGrab())
    this.manip.onManipulationUpdate.add(() => this.onMove())
    this.manip.onManipulationEnd.add(() => this.onRelease())
    // a short pinch that never became a grab = "tap": the vial lobs itself into the cauldron
    this.interactable.onTriggerEnd.add(() => {
      if (this.mode === "idle") this.lob()
    })

    // small engraved label on the stand's front edge
    const lo = child(parent, "VialLabel_" + family, x, lab.standTop - 0.9, VIAL_Z + 4.62)
    const t = lo.createComponent("Component.Text") as Text
    t.depthTest = true
    t.size = labelSize
    if (lab.uiFont) t.font = lab.uiFont
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.textFill.color = new vec4(0.9, 0.8, 0.64, 0.85)
    t.text = FAMILY_LABEL[family]
  }

  setBetsEnabled(on: boolean): void {
    this.enabledForBets = on
    if (this.mode === "idle") {
      this.interactable.enabled = on
      this.manip.enabled = on
    }
  }

  get state(): VialMode {
    return this.mode
  }

  private onGrab(): void {
    if (!this.enabledForBets || this.mode !== "idle") return
    print(`[WitchsLab] grab ${this.family}`)
    this.mode = "held"
    this.heldAt = getTime()
    this.samples = [{t: this.heldAt, p: toV3(this.obj.getTransform().getLocalPosition())}]
  }

  private onMove(): void {
    if (this.mode !== "held") return
    this.samples.push({t: getTime(), p: toV3(this.obj.getTransform().getLocalPosition())})
    if (this.samples.length > 30) this.samples.shift()
  }

  /** Where the vial hovers to pour: above the mouth, offset so the tipped mouth is over the centre. */
  private pourPoint(): V3 {
    const m = this.lab.mouthCenter
    return [m[0] + 4.5 * this.tipSign, m[1] + 9.5, m[2]]
  }

  private onRelease(): void {
    if (this.mode !== "held") return
    const p = toV3(this.obj.getTransform().getLocalPosition())
    const moved = Math.hypot(p[0] - this.home.x, p[1] - this.home.y, p[2] - this.home.z)
    const quick = getTime() - this.heldAt < 1.2
    const mouth = this.lab.mouthCenter
    const R = this.lab.mouthRadius
    print(`[WitchsLab] release ${this.family} moved=${moved.toFixed(1)}cm`)
    if (quick && moved < 3) {
      this.fly(this.liftedLob(p), true)
      return
    }
    if (isDropIn(p, mouth, R)) {
      this.fly([p, this.pourPoint()], true)
      return
    }
    const ground = (x: number, z: number) => this.lab.groundAt(x, z, this)
    const v = releaseVelocity(this.samples)
    if (Math.hypot(v[0], v[1], v[2]) > 60) {
      const r = simulateThrow(p, v, mouth, R)
      if (r.hit) {
        this.fly(this.toPour(r.points), true)
        return
      }
      // a miss: the flight stops where the vial meets a surface, then it rests there
      this.fly(clipToGround(r.points, ground, VIAL_HALF).points, false)
      return
    }
    // let go in the air: it falls straight down and stands on whatever is below
    this.fly(dropPath(p, ground, VIAL_HALF), false)
  }

  /** Path home that rises above the other vials and comes straight down into the slot. */
  private homePath(from: V3): V3[] {
    return arcPath(from, toV3(this.home), this.lab.standTop + 10.4 + VIAL_HALF + 2.5, 0.85)
  }

  /** Rise straight out of the rack (above the neighbours), then lob into the cauldron. */
  private liftedLob(p: V3): V3[] {
    const top = this.lab.standTop + 10.4 + 2 + VIAL_HALF
    const rise: V3[] = []
    const n = 14
    for (let i = 0; i <= n; i++) {
      const k = easeInOut(i / n)
      rise.push([p[0], p[1] + (Math.max(top, p[1]) - p[1]) * k, p[2]])
    }
    const q = rise[rise.length - 1]
    const mouth = this.lab.mouthCenter
    const arc = this.toPour(simulateThrow(q, lobVelocity(q, mouth, 0.55), mouth, this.lab.mouthRadius).points)
    return rise.concat(arc.slice(1))
  }

  /** Bend a ballistic path so it ends hovering above the mouth instead of inside it. */
  private toPour(points: V3[]): V3[] {
    if (points.length < 2) return points
    const end = points[points.length - 1]
    const target = this.pourPoint()
    const last = points.length - 1
    return points.map((q, i) => {
      const k = easeInOut(i / last)
      return [q[0] + (target[0] - end[0]) * k, q[1] + (target[1] - end[1]) * k, q[2] + (target[2] - end[2]) * k] as V3
    })
  }

  /** Programmatic bet (LEAF scenarios and accessibility). */
  lob(): void {
    if (!this.enabledForBets || this.mode !== "idle") return
    print(`[WitchsLab] lob ${this.family}`)
    this.fly(this.liftedLob(toV3(this.home)), true)
  }

  private fly(points: V3[], hit: boolean): void {
    this.mode = "flying"
    this.interactable.enabled = false
    this.manip.enabled = false
    this.path = points.length > 1 ? points : [toV3(this.home), toV3(this.home)]
    this.pathT = 0
    this.pathHit = hit
    this.lab.sfx.play("toss")
    this.obj.getTransform().setLocalRotation(quat.quatIdentity())
  }

  tick(t: number, dt: number): void {
    const tr = this.obj.getTransform()
    const away = Math.min(1, Math.abs(tr.getLocalPosition().y - this.home.y) / 6 + Math.hypot(tr.getLocalPosition().x - this.home.x, tr.getLocalPosition().z - this.home.z) / 6)
    this.shadow.getTransform().setLocalScale(new vec3(1 - away * 0.9 + 0.001, 1, 1 - away * 0.9 + 0.001))
    if (this.mode === "flying") {
      // ballistic paths are sampled at 60 Hz; straight returns take 0.45 s
      const straight = this.path.length === 2
      this.pathT += straight ? dt / 0.45 : dt * 60
      const last = this.path.length - 1
      const f = straight ? Math.min(1, this.pathT) * last : Math.min(last, this.pathT)
      const i = Math.min(last - 1, Math.floor(f))
      const k = straight ? easeInOut(f - i) : f - i
      const a = this.path[i]
      const b = this.path[i + 1]
      tr.setLocalPosition(new vec3(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k))
      if (f >= last) {
        if (this.pathHit) {
          this.mode = "pouring"
          this.pourT = 0
        } else if (Math.abs(tr.getLocalPosition().x - this.home.x) < 0.01 && Math.abs(tr.getLocalPosition().z - this.home.z) < 0.01 && Math.abs(tr.getLocalPosition().y - this.home.y) < 0.01) {
          this.settle()
        } else {
          // landed somewhere: stand there a moment, then float back to the rack
          this.mode = "resting"
          this.restT = 0
          const lp = tr.getLocalPosition()
          print(`[WitchsLab] ${this.family} landed: bottom at ${(lp.y - VIAL_HALF).toFixed(2)} cm, surface ${this.lab.groundAt(lp.x, lp.z, this).toFixed(2)} cm`)
        }
      }
      return
    }
    if (this.mode === "resting") {
      this.restT += dt
      if (this.restT > 0.8) {
        this.mode = "flying"
        this.path = this.homePath(toV3(tr.getLocalPosition()))
        this.pathT = 0
        this.pathHit = false
      }
      return
    }
    if (this.mode === "held") {
      // a held vial never sinks into the table, the board or the stand
      const lp = tr.getLocalPosition()
      const g = this.lab.groundAt(lp.x, lp.z, this) + VIAL_HALF
      if (lp.y < g) tr.setLocalPosition(new vec3(lp.x, g, lp.z))
      return
    }
    if (this.mode === "pouring") {
      // tip (0.4 s) → pour (0.75 s) → straighten + fly home
      this.pourT += dt
      if (this.cork.enabled && this.pourT > 0.12) {
        this.cork.enabled = false
        this.lab.corkPop(tr.getWorldPosition().add(tr.getWorldRotation().multiplyVec3(new vec3(0, VIAL_TOP - VIAL_HALF + 1, 0))))
      }
      const tip = Math.min(1, this.pourT / 0.4) - Math.max(0, (this.pourT - 1.2) / 0.3)
      const ang = easeInOut(Math.max(0, Math.min(1, tip))) * 2.0 * this.tipSign
      tr.setLocalRotation(quat.angleAxis(ang, vec3.forward()))
      const pouring = this.pourT > 0.3 && this.pourT < 1.25
      const mouth = tr.getWorldPosition().add(tr.getWorldRotation().multiplyVec3(new vec3(0, VIAL_TOP - VIAL_HALF, 0)))
      this.lab.cauldronStream(pouring, mouth, FAMILY_COLOR[this.family])
      if (this.pourT > 0.55 && this.pourT - dt <= 0.55) this.lab.onVialInCauldron(this.family)
      if (this.pourT >= 1.5) {
        tr.setLocalRotation(quat.quatIdentity())
        this.mode = "flying"
        this.path = this.homePath(toV3(tr.getLocalPosition()))
        this.pathT = 0
        this.pathHit = false
      }
      return
    }
    if (this.mode === "idle") {
      // breathe a little while bets are open ("this is what you can touch")
      const s = this.enabledForBets ? 1 + 0.025 * Math.sin(t * 3 + this.home.x) : 1
      const cur = tr.getLocalScale().x
      const ns = cur + (s - cur) * Math.min(1, dt * 8)
      tr.setLocalScale(new vec3(ns, ns, ns))
    }
  }

  private settle(): void {
    this.mode = "idle"
    this.cork.enabled = true
    const tr = this.obj.getTransform()
    tr.setLocalPosition(this.home)
    tr.setLocalRotation(quat.quatIdentity())
    this.interactable.enabled = this.enabledForBets
    this.manip.enabled = this.enabledForBets
  }
}

// ---------------------------------------------------------------------------
// Off-screen guide: spatial chime from the glass + arrow at the edge of view.
// ---------------------------------------------------------------------------
class Guide {
  private arrow: SceneObject
  private outSince = -1
  private lastChime = -10
  private chimes = 0
  testYawDeg = 0

  constructor(private cam: SceneObject, mat: Material, private sfx: Sfx) {
    this.arrow = child(cam, "GuideArrow", 0, 0, -50)
    const m = new ColorMesh()
    buildChevron(m, COLOR.gold)
    order(m.attach(this.arrow, mat), 9)
    this.arrow.enabled = false
  }

  reset(): void {
    this.outSince = -1
    this.chimes = 0
    this.lastChime = -10
    this.arrow.enabled = false
  }

  get arrowVisible(): boolean {
    return this.arrow.enabled
  }

  tick(t: number, target: vec3 | null): void {
    if (!target) {
      this.arrow.enabled = false
      return
    }
    const ct = this.cam.getTransform()
    let fwd = ct.forward.uniformScale(-1)
    let right = ct.right
    if (this.testYawDeg !== 0) {
      const q = quat.angleAxis((this.testYawDeg * Math.PI) / 180, vec3.up())
      fwd = q.multiplyVec3(fwd)
      right = q.multiplyVec3(right)
    }
    const cue = offscreenCue(toV3(ct.getWorldPosition()), toV3(fwd), toV3(right), toV3(ct.up), toV3(target), 20, 26)
    if (cue.inView) {
      this.outSince = -1
      this.arrow.enabled = false
      return
    }
    if (this.outSince < 0) this.outSince = t
    if (t - this.outSince < 0.8) return
    this.arrow.enabled = true
    const d = cue.screenDir
    this.arrow.getTransform().setLocalPosition(new vec3(d[0] * 10, d[1] * 7, -50))
    this.arrow.getTransform().setLocalRotation(quat.angleAxis(Math.atan2(d[1], d[0]), vec3.forward()))
    if (this.chimes < 3 && t - this.lastChime > 4) {
      const so = this.sfx.sceneObject("chime")
      if (so) so.getTransform().setWorldPosition(target)
      this.sfx.play("chime")
      this.lastChime = t
      this.chimes++
    }
  }
}

type Liquid = {
  obj: SceneObject
  mesh: ColorMesh
  color: RGB
  fill: number
  fillTarget: number
  topStart: number
  topEnd: number
  baseY: number[]
  ripple: number
  rippleAt: number
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
@component
export class WitchsLab extends BaseScriptComponent {
  @input
  @hint("The scene's Camera Object (world tracking).")
  cameraObject!: SceneObject

  @input
  @allowUndefined
  @hint("Legacy flat vertex-colour material (fallback only).")
  vertexMaterial: Material

  @input @allowUndefined @hint("WL_Glass") glassMaterial: Material
  @input @allowUndefined @hint("WL_Liquid") liquidMaterial: Material
  @input @allowUndefined @hint("WL_VertexAlpha") alphaMaterial: Material
  @input @allowUndefined @hint("WL_Glow") glowMaterial: Material
  @input @allowUndefined @hint("WL_PBR_Vertex (Uber PBR, vertex colour = base colour)") pbrMaterial: Material
  @input @allowUndefined @hint("UI font") uiFont: Font
  @input @allowUndefined @hint("WL_Paper (opaque unlit vertex colour, depth write)") paperMaterial: Material

  @input
  @hint("How far in front of you the table centre sits if no real surface is found (cm).")
  tableDistanceCm: number = 68

  @input
  @hint("How far below your eyes the table top sits if no real surface is found (cm).")
  tableDropCm: number = 32

  @input
  @hint("Look for a real table with World Query and set the lab on it.")
  useWorldQuery: boolean = true

  @input
  @hint("Lens Studio only: World Query gets no hit in the simulated rooms, so stage the lab on this surface point (world cm). Ignored on Specs.")
  usePreviewAnchor: boolean = true

  @input
  @hint("Surface point in the Preview room (Sunlit Room coffee table top).")
  previewAnchor: vec3 = new vec3(2, -144, -292)

  @input
  @hint("Yaw of the lab on the preview anchor (degrees, 0 = facing +Z).")
  previewYawDeg: number = 0

  @input
  @hint("Capture helper (off by default): plays the whole run by itself, same events as the pinches.")
  demoAutoplay: boolean = false

  @input
  @hint("Capture helper: freeze the lab's animation clock at this many seconds after start (-1 = never).")
  demoFreezeAt: number = -1

  @input @allowUndefined sfxPinch: AudioTrackAsset
  @input @allowUndefined sfxPour: AudioTrackAsset
  @input @allowUndefined sfxSwirl: AudioTrackAsset
  @input @allowUndefined sfxToss: AudioTrackAsset
  @input @allowUndefined sfxPlop: AudioTrackAsset
  @input @allowUndefined sfxRight: AudioTrackAsset
  @input @allowUndefined sfxWrong: AudioTrackAsset
  @input @allowUndefined sfxChime: AudioTrackAsset
  @input @allowUndefined sfxGrimoire: AudioTrackAsset
  @input @allowUndefined ambBubbles: AudioTrackAsset

  sfx = new Sfx()
  mouthCenter: V3 = [0, 0, 0]
  mouthRadius = 9.4
  standTop = 2.2

  // materials (built in start)
  matGlass!: Material
  matLiquid!: Material
  matAlpha!: Material
  matGlow!: Material
  matCork!: Material

  private state: LabState = newLab()
  private root!: SceneObject
  private liquids: Liquid[] = []
  private glassObjs: SceneObject[] = []
  private brew!: ColorMesh
  private brewObj!: SceneObject
  private brewColor: RGB = COLOR.indicator
  private brewFrom: RGB = COLOR.indicator
  private brewT = 1
  private runes: Rune[] = []
  private prepRune!: Rune
  private againRune!: Rune
  private vials: Vial[] = []
  private cards: WLCardUI[] = []
  private grimoire!: WLGrimoireUI
  private guide!: Guide
  private timers: Timer[] = []
  private reveal: {glass: number; t: number; from: RGB; to: RGB} | null = null
  private steam!: Particles
  private sparks!: Particles
  private bubbles!: Particles
  private stream!: SceneObject
  private streamMesh!: ColorMesh
  private streamColor: RGB = [1, 1, 1]
  private spoon!: SceneObject
  private leader!: SceneObject
  private leaderMesh!: ColorMesh
  private spoonRest!: vec3
  /** The ingredient gesture that mirrors the user's real pour: lemon squeeze, soda shake, water from the carafe. */
  private pour: {glass: number; t: number; kind: string; obj: SceneObject; rest: vec3; restRot: quat; lastEmit: number} | null = null
  private lemonHalf!: SceneObject
  private carafe!: SceneObject
  private drops!: Particles
  private powder!: Particles
  private caustics: {obj: SceneObject; mesh: ColorMesh}[] = []
  private lastSteam = 0
  private lastBubble = 0
  private built = false
  private clock = 0
  private hitSession: any = null
  private surfaceFound = false
  private surfaceHits: vec3[] = []
  private hitCalls = 0
  private searchUntil = 0
  private glide: {from: vec3; to: vec3; rotFrom: quat; rotTo: quat; t: number} | null = null
  /** Every solid prop, for the bounding-box contact checks (see checkLayout). */
  private solids: {name: string; objs: SceneObject[]; floor: number | null}[] = []
  private motionHits: Record<string, string[]> = {}

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.start())
    this.createEvent("UpdateEvent").bind(() => this.update())
  }

  // ---------------------------------------------------------------- build
  private start(): void {
    if (this.built) return
    this.built = true
    const fb = this.vertexMaterial
    this.matGlass = this.glassMaterial || fb
    this.matLiquid = this.liquidMaterial || fb
    this.matAlpha = this.alphaMaterial || fb
    this.matGlow = this.glowMaterial || fb
    const P = this.pbrMaterial
    const iron = P ? pbr(P, 0.85, 0.36, true) : fb
    const oak = P ? pbr(P, 0.0, 0.58) : fb
    const porcelain = P ? pbr(P, 0.0, 0.34, true) : fb
    const steel = P ? pbr(P, 1.0, 0.18, true) : fb
    const fruit = P ? pbr(P, 0.0, 0.42, true) : fb
    this.matCork = P ? pbr(P, 0.0, 0.8) : fb
    const k = this.tableDistanceCm / 110

    this.root = child(this.sceneObject, "LabRoot")
    this.placeInFrontOfUser()

    // ---- oak board (the stage) + engraved safety line on its front edge
    const board = new ColorMesh()
    buildBoard(board, BOARD_W, BOARD_D, BOARD_H)
    board.attach(child(this.root, "Board", 0, BOARD_H, BOARD_Z), oak)
    const safety = child(this.root, "SafetyLine", 0, BOARD_H * 0.5, BOARD_Z + BOARD_D / 2 + 0.08)
    const st = safety.createComponent("Component.Text") as Text
    st.depthTest = true
    st.size = 21 * k
    if (this.uiFont) st.font = this.uiFont
    st.horizontalAlignment = HorizontalAlignment.Center
    st.verticalAlignment = VerticalAlignment.Center
    st.textFill.color = new vec4(0.86, 0.74, 0.56, 0.75)
    st.text = SAFETY_LINE

    // ---- contact shadows (one mesh, one draw call)
    const sh = new ColorMesh()
    sh.shadowXZ(0.6, BOARD_Z - 0.4, BOARD_W / 2 + 2.2, BOARD_D / 2 + 2.0, 0.04, 0.42)
    GLASS_X.forEach((x) => sh.shadowXZ(x + 0.5, GLASS_Z - 0.4, 4.6, 4.2, BOARD_H + 0.03, 0.5))
    sh.shadowXZ(CAULDRON_POS[0] + 0.8, CAULDRON_POS[2] - 0.6, 15, 14, 0.04, 0.62)
    sh.shadowXZ(SAUCER_POS[0] + 0.4, SAUCER_POS[2] - 0.3, 5.8, 5.4, 0.04, 0.45)
    sh.shadowXZ(LEMON_POS[0] + 0.4, LEMON_POS[2] - 0.3, 4.4, 3.2, 0.04, 0.45)
    sh.shadowXZ(HALF_LEMON_POS[0] + 0.3, HALF_LEMON_POS[2] - 0.3, 3.6, 3.4, 0.04, 0.45)
    sh.shadowXZ((VIAL_X[0] + VIAL_X[2]) / 2 + 0.5, VIAL_Z - 0.3, STAND_HALF_W + 1.5, 6.4, 0.04, 0.45)
    sh.shadowXZ(4, -56.1, 13.5, 10.5, 0.04, 0.5)
    order(sh.attach(child(this.root, "ContactShadows"), this.matAlpha), 2)

    // ---- cauldron (cast iron) + brew + steam + bubbles
    const cauldron = child(this.root, "Cauldron", CAULDRON_POS[0], CAULDRON_POS[1], CAULDRON_POS[2])
    const cm = new ColorMesh()
    const mouth = buildCauldron(cm)
    cm.attach(cauldron, iron)
    this.mouthCenter = [CAULDRON_POS[0], CAULDRON_POS[1] + mouth.mouthY, CAULDRON_POS[2]]
    this.mouthRadius = mouth.mouthR
    this.brew = new ColorMesh()
    buildBrew(this.brew, this.brewColor)
    this.brewObj = child(cauldron, "Brew", 0, mouth.mouthY - 1.2, 0)
    order(this.brew.attach(this.brewObj, this.matLiquid), 1)
    this.steam = new Particles(this.root, "Steam", 22, "puff", this.matGlow, -2.5, 0.4)
    this.bubbles = new Particles(this.root, "Bubbles", 10, "bubble", this.matGlow, 0, 2)
    this.sparks = new Particles(this.root, "Sparkles", 30, "star", this.matGlow, 14, 1.4)

    // ---- glasses + liquids + cards + runes
    GLASSES.forEach((g, i) => {
      const go = child(this.root, "Glass" + i, GLASS_X[i], BOARD_H, GLASS_Z)
      const lo = child(go, "Liquid" + i, 0, GLASS_FLOOR, 0)
      const lm = new ColorMesh()
      const top = buildLiquid(lm, COLOR.indicator)
      order(lm.attach(lo, this.matLiquid), 1)
      lo.getTransform().setLocalScale(new vec3(1, 0.001, 1))
      lo.enabled = false
      const baseY: number[] = []
      for (let v = top.topStart; v < top.topEnd; v++) baseY.push(lm.data[v * 10 + 1])
      this.liquids.push({obj: lo, mesh: lm, color: COLOR.indicator, fill: 0, fillTarget: 0, topStart: top.topStart, topEnd: top.topEnd, baseY, ripple: 0, rippleAt: 0})

      // soft caustic: light focused through the glass and its liquid, thrown on the board away from the key light
      const ca = child(this.root, "Caustic" + i, GLASS_X[i] + 1.6, BOARD_H + 0.02, GLASS_Z - 2.6)
      ca.getTransform().setLocalRotation(quat.angleAxis(-Math.PI / 2, vec3.right()))
      const cm2 = new ColorMesh()
      cm2.glowXY(0, 0, 3.4, 0, [1, 1, 1], 0.32, 28)
      cm2.glowXY(0.4, 0.3, 1.2, 0.001, [1, 1, 1], 0.25, 16)
      order(cm2.attach(ca, this.matGlow), 2)
      ca.getTransform().setLocalScale(new vec3(1, 0.7, 1))
      ca.enabled = false
      this.caustics.push({obj: ca, mesh: cm2})

      const gm = new ColorMesh()
      buildGlass(gm)
      order(gm.attach(child(go, "GlassShell" + i, 0, CONTACT_LIFT, 0), this.matGlass), 3)
      this.glassObjs.push(go)

      const co = child(this.root, "Card" + i, 0, CARD_Y, CARD_Z)
      const card = co.createComponent(WLCardUI.getTypeName()) as WLCardUI
      card.readingDistanceCm = this.tableDistanceCm
      card.panelMaterial = this.matAlpha
      if (this.uiFont) card.font = this.uiFont
      this.cards.push(card)

      this.runes.push(new Rune(this.root, "Rune_Glass" + i, GLASS_X[i], "POURED", this.matGlow, 44 * k, this.uiFont, () => this.dispatch({type: "poured"})))
    })
    this.prepRune = new Rune(this.root, "Rune_Prep", GLASS_X[1], "BASE POURED", this.matGlow, 44 * k, this.uiFont, () => this.dispatch({type: "baseFilled"}))
    this.againRune = new Rune(this.root, "Rune_Again", GLASS_X[1], "BREW AGAIN", this.matGlow, 44 * k, this.uiFont, () => this.dispatch({type: "restart"}))

    // ---- a hairline of light from the card to the glass it talks about
    this.leader = child(this.root, "CardLeader")
    this.leaderMesh = new ColorMesh()
    this.leaderMesh.strokeXY(0, 0, 0, -1, 0.06, 0, [1, 0.86, 0.6], 0.5)
    this.leaderMesh.glowXY(0, -1, 0.35, 0.01, [1, 0.86, 0.6], 0.5, 12)
    order(this.leaderMesh.attach(this.leader, this.matGlow), 8)
    this.leader.enabled = false

    // ---- props: half lemon, porcelain dish of baking soda, teaspoon
    const lemon = child(this.root, "Lemon", LEMON_POS[0], LEMON_POS[1], LEMON_POS[2])
    lemon.getTransform().setLocalRotation(quat.angleAxis(0.35, vec3.up()))
    const wl = new ColorMesh()
    buildWholeLemon(wl)
    wl.attach(lemon, fruit)
    const half = child(this.root, "LemonHalf", HALF_LEMON_POS[0], HALF_LEMON_POS[1], HALF_LEMON_POS[2])
    this.lemonHalf = half
    const lmesh = new ColorMesh()
    buildLemon(lmesh)
    lmesh.attach(half, fruit)
    const saucer = child(this.root, "Saucer", SAUCER_POS[0], SAUCER_POS[1], SAUCER_POS[2])
    const smesh = new ColorMesh()
    buildSaucer(smesh)
    smesh.attach(saucer, porcelain)
    const pmesh = new ColorMesh()
    buildPowder(pmesh)
    pmesh.attach(child(saucer, "BakingSoda"), this.matCork)
    this.spoonRest = new vec3(SAUCER_POS[0] - 0.5, SAUCER_POS[1] + 0.86, SAUCER_POS[2] + 0.6) // bowl scooping the baking soda, handle on the rim
    this.spoon = child(this.root, "Spoon", this.spoonRest.x, this.spoonRest.y, this.spoonRest.z)
    this.spoon.getTransform().setLocalRotation(quat.angleAxis(SPOON_YAW, vec3.up()))
    const spm = new ColorMesh()
    buildSpoon(spm)
    spm.attach(this.spoon, steel)

    // ---- small glass carafe of water (the control glass)
    this.carafe = child(this.root, "Carafe", CARAFE_POS[0], CARAFE_POS[1], CARAFE_POS[2])
    const cw = new ColorMesh()
    buildCarafeWater(cw)
    order(cw.attach(child(this.carafe, "CarafeWater", 0, CONTACT_LIFT, 0), this.matLiquid), 1)
    const cg = new ColorMesh()
    buildCarafe(cg)
    order(cg.attach(child(this.carafe, "CarafeGlass", 0, CONTACT_LIFT, 0), this.matGlass), 3)
    this.drops = new Particles(this.root, "Drops", 24, "puff", this.matGlow, 980, 0, "hold")
    this.powder = new Particles(this.root, "Powder", 140, "puff", this.matGlow, 420, 0.5, "hold")

    // ---- the pour stream (shared by vials and the carafe)
    this.stream = child(this.root, "Stream")
    this.streamMesh = new ColorMesh()
    buildStream(this.streamMesh, [1, 1, 1])
    order(this.streamMesh.attach(this.stream, this.matLiquid), 1)
    this.stream.enabled = false

    // ---- vial stand (oak) + vials
    const stand = new ColorMesh()
    const sx = (VIAL_X[0] + VIAL_X[2]) / 2
    stand.bevelSlab(0, this.standTop / 2, 0, STAND_HALF_W, this.standTop / 2, 4.6, 0.35, 24, 6, (x, y, z) => [0.6 + 0.08 * Math.sin(z * 3 + (x + sx) * 0.2), 0.42 + 0.05 * Math.sin(z * 3 + (x + sx) * 0.2), 0.26])
    stand.attach(child(this.root, "VialStand", sx, 0, VIAL_Z), oak) // centred on its own object: exact bounding box
    FAMILIES.forEach((f, i) => this.vials.push(new Vial(this.root, f, VIAL_X[i], this, 22 * k)))

    // ---- grimoire: a real book resting on the table until the end
    const gro = child(this.root, "Grimoire", BOOK_REST[0], BOOK_REST[1], BOOK_REST[2])
    gro.getTransform().setLocalRotation(quat.angleAxis(Math.PI / 2, vec3.up()))
    this.grimoire = gro.createComponent(WLGrimoireUI.getTypeName()) as WLGrimoireUI
    this.grimoire.pbrMaterial = P
    this.grimoire.paperMaterial = this.paperMaterial || this.matAlpha
    if (this.uiFont) this.grimoire.font = this.uiFont
    this.grimoire.readingDistanceCm = this.tableDistanceCm + 10
    this.grimoire.openPos = new vec3(BOOK_OPEN[0], BOOK_OPEN[1], BOOK_OPEN[2])
    this.grimoire.buildBook()

    // ---- sound
    const so = child(this.root, "Sound")
    this.sfx.add(so, "pinch", this.sfxPinch, 0.8, false)
    this.sfx.add(so, "pour", this.sfxPour, 0.9, false)
    this.sfx.add(so, "swirl", this.sfxSwirl, 0.8, false)
    this.sfx.add(so, "toss", this.sfxToss, 0.6, false)
    this.sfx.add(so, "plop", this.sfxPlop, 0.9, false)
    this.sfx.add(so, "right", this.sfxRight, 0.85, false)
    this.sfx.add(so, "wrong", this.sfxWrong, 0.6, false)
    this.sfx.add(so, "chime", this.sfxChime, 1.0, true)
    this.sfx.add(so, "grimoire", this.sfxGrimoire, 0.8, false)
    this.sfx.add(cauldron, "amb", this.ambBubbles, 0.3, true)
    this.sfx.play("amb", -1)

    this.guide = new Guide(this.cameraObject, this.matGlow, this.sfx)

    // World Query: look for the real table during the first seconds
    this.searchUntil = 3
    if (this.useWorldQuery) {
      try {
        const WQ = require("LensStudio:WorldQueryModule") as WorldQueryModule
        const opts = HitTestSessionOptions.create()
        opts.filter = true
        this.hitSession = WQ.createHitTestSessionWithOptions(opts)
        print("[WitchsLab] world query: session ready")
      } catch (e) {
        print("[WitchsLab] world query unavailable: " + e)
        this.hitSession = null
      }
    }

    // solids: bounding boxes checked at start and during every motion
    const find = (name: string): SceneObject[] => {
      const out: SceneObject[] = []
      const walk = (o: SceneObject) => {
        if (o.name === name) out.push(o)
        for (let i = 0; i < o.getChildrenCount(); i++) walk(o.getChild(i))
      }
      walk(this.root)
      return out
    }
    const sol = (name: string, objs: SceneObject[], floor: number | null) => this.solids.push({name, objs, floor})
    sol("Board", find("Board"), 0)
    GLASSES.forEach((_g, i) => sol("Glass" + i, find("GlassShell" + i), BOARD_H))
    sol("Cauldron", [cauldron], 0)
    sol("VialStand", find("VialStand"), 0)
    this.vials.forEach((v) => sol("Vial_" + v.family, find("Flask").filter((o) => o.getParent().getParent() === v.obj), this.standTop))
    sol("Saucer", find("Saucer"), 0)
    sol("Spoon", [this.spoon], null)
    sol("Lemon", find("Lemon"), 0)
    sol("LemonHalf", find("LemonHalf"), 0)
    sol("Carafe", find("CarafeGlass"), 0)
    sol("Grimoire", find("BackCover").concat(find("PagesRight"), find("PagesLeft"), find("FrontCover"), find("Spine")), 0)
    this.after(1.0, () => this.checkLayout("start"))

    // first frame = the real lab, already on the first step (no title screen)
    this.applyPhase()
    if (this.demoAutoplay) this.scheduleDemo()
    this.after(0.4, () => {
      if (!this.surfaceFound) this.placeInFrontOfUser()
      this.logLayout()
    })
    const rp = this.root.getTransform().getWorldPosition()
    print(`[WitchsLab] lab built: ${GLASSES.length} glasses, ${this.vials.length} vials, sounds=${this.sfx.has("pour")}, table at (${rp.x.toFixed(0)}, ${rp.y.toFixed(0)}, ${rp.z.toFixed(0)}), phase=${this.state.phase}`)
  }

  private scheduleDemo(): void {
    print("[WitchsLab] demo autoplay ON (capture helper)")
    const seq: [number, () => void][] = [
      [2.0, () => this.dispatch({type: "baseFilled"})],
      [4.5, () => this.lobVial("red")],
      [8.0, () => this.dispatch({type: "poured"})],
      [17.5, () => this.lobVial("violet")],
      [21.0, () => this.dispatch({type: "poured"})],
      [30.5, () => this.lobVial("blue")],
      [34.0, () => this.dispatch({type: "poured"})],
    ]
    for (const [at, fn] of seq) this.after(at, fn)
  }

  /** Fallback: put the table ~68 cm ahead and ~32 cm below the eyes, facing the user. */
  placeInFrontOfUser(): void {
    if (!this.root || !this.cameraObject) return
    if (this.previewStaged()) {
      const tr0 = this.root.getTransform()
      tr0.setWorldPosition(this.previewAnchor)
      tr0.setWorldRotation(quat.angleAxis((this.previewYawDeg * Math.PI) / 180, vec3.up()))
      return
    }
    const ct = this.cameraObject.getTransform()
    const pos = ct.getWorldPosition()
    const f = this.flatForward()
    const center = pos.add(f.uniformScale(this.tableDistanceCm)).add(new vec3(0, -this.tableDropCm, 0))
    const tr = this.root.getTransform()
    tr.setWorldPosition(center)
    tr.setWorldRotation(quat.angleAxis(Math.atan2(-f.x, -f.z), vec3.up()))
  }

  /** True only inside Lens Studio when the staging anchor is enabled (never on Specs). */
  private previewStaged(): boolean {
    let editor = false
    try {
      editor = global.deviceInfoSystem.isEditor()
    } catch (e) {}
    return editor && this.usePreviewAnchor && !this.surfaceFound
  }

  private flatForward(): vec3 {
    const gaze = this.cameraObject.getTransform().forward.uniformScale(-1)
    const f = new vec3(gaze.x, 0, gaze.z)
    return f.length > 1e-4 ? f.normalize() : new vec3(0, 0, -1)
  }

  /** Cast a ray ahead and down; three agreeing hits on a level surface = the table. */
  private searchSurface(t: number): void {
    if (this.surfaceFound || !this.hitSession || t > this.searchUntil) return
    const ct = this.cameraObject.getTransform()
    const start = ct.getWorldPosition()
    const f = this.flatForward()
    // follow the user's gaze when they look down at a table; otherwise aim ~25° below the horizon
    const gaze = ct.forward.uniformScale(-1)
    const pitch = 0.44
    const dir = gaze.y < -0.2 ? gaze : f.uniformScale(Math.cos(pitch)).add(new vec3(0, -Math.sin(pitch), 0))
    const end = start.add(dir.uniformScale(220))
    this.hitSession.hitTest(start, end, (hit: WorldQueryHitTestResult) => {
      this.hitCalls++
      if (!hit) {
        if (this.hitCalls % 30 === 1) print(`[WitchsLab] world query: no hit yet (${this.hitCalls} rays)`)
        return
      }
      if (this.surfaceFound) return
      const d = hit.position.sub(start)
      if (this.hitCalls % 15 === 1) print(`[WitchsLab] world query hit (${hit.position.x.toFixed(0)}, ${hit.position.y.toFixed(0)}, ${hit.position.z.toFixed(0)}) n.y=${hit.normal.y.toFixed(2)}`)
      const flat = Math.hypot(d.x, d.z)
      if (hit.normal.y < 0.85 || flat < 25 || flat > 160 || d.y > -10) return
      this.surfaceHits.push(hit.position)
      if (this.surfaceHits.length < 3) return
      const a = this.surfaceHits[this.surfaceHits.length - 1]
      const b = this.surfaceHits[this.surfaceHits.length - 3]
      if (a.distance(b) > 4) return
      this.surfaceFound = true
      const tr = this.root.getTransform()
      const yaw = quat.angleAxis(Math.atan2(-f.x, -f.z), vec3.up())
      // keep the lab centred where you look, slightly toward you so the far props stay on the table
      const target = a.add(f.uniformScale(-12))
      this.glide = {from: tr.getWorldPosition(), to: target, rotFrom: tr.getWorldRotation(), rotTo: yaw, t: 0}
      print(`[WitchsLab] surface found (World Query) at (${a.x.toFixed(1)}, ${a.y.toFixed(1)}, ${a.z.toFixed(1)}), ${flat.toFixed(0)} cm ahead`)
      this.after(0.7, () => this.logLayout())
    })
  }

  /** One line with the world positions of every pinch target (recording + automated checks). */
  private logLayout(): void {
    const f = (o: SceneObject) => {
      const p = o.getTransform().getWorldPosition()
      return `${o.name}(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)})`
    }
    const items = [this.prepRune.obj, ...this.runes.map((r) => r.obj), ...this.vials.map((v) => v.obj), this.againRune.obj]
    print("[WitchsLab] targets " + items.map(f).join(" ") + " " + f(this.root) + (this.surfaceFound ? " [surface]" : this.previewStaged() ? " [preview anchor]" : " [fallback]"))
  }

  // ---------------------------------------------------------------- flow
  private dispatch(e: LabEvent): void {
    const r = step(this.state, e)
    if (!r.accepted) {
      print(`[WitchsLab] refused ${e.type} in phase ${this.state.phase}`)
      return
    }
    this.state = r.state
    print(`[WitchsLab] ${e.type} -> phase=${this.state.phase} glass=${this.state.glass} score=${this.state.score}`)
    if (e.type === "poured" || e.type === "baseFilled" || e.type === "restart") this.sfx.play("pinch")
    for (const cue of r.cues) this.handleCue(cue)
  }

  private handleCue(cue: string): void {
    const [name, arg] = cue.split(":")
    switch (name) {
      case "fillAll":
        this.sfx.play("pour")
        this.liquids.forEach((l, i) => {
          l.obj.enabled = true
          this.after(0.25 * i, () => {
            l.fillTarget = 1
            l.ripple = 0.25
            l.rippleAt = this.clock
          })
        })
        this.hideAllCards()
        this.prepRune.setActive(false)
        break
      case "focus":
        this.after(arg === "0" ? 1.4 : 0.2, () => this.applyPhase())
        break
      case "betPlaced":
        this.applyPhase()
        break
      case "reveal": {
        const i = parseInt(arg, 10)
        this.runes[i].setActive(false)
        this.vials.forEach((v) => v.setBetsEnabled(false))
        this.cards[i].hide()
        {
          const kind = GLASSES[i].id === "lemon" ? "lemon" : GLASSES[i].id === "soda" ? "soda" : "water"
          const obj = kind === "lemon" ? this.lemonHalf : kind === "soda" ? this.spoon : this.carafe
          this.pour = {glass: i, t: 0, kind, obj, rest: obj.getTransform().getLocalPosition(), restRot: obj.getTransform().getLocalRotation(), lastEmit: 0}
        }
        this.after(POUR_START, () => this.sfx.play("pour"))
        this.after(DIFFUSE_START + 0.1, () => this.sfx.play("swirl"))
        this.after(DIFFUSE_START, () => {
          this.reveal = {glass: i, t: 0, from: this.liquids[i].color, to: FAMILY_COLOR[GLASSES[i].family]}
          const l = this.liquids[i]
          l.ripple = 0.35
          l.rippleAt = this.clock
        })
        break
      }
      case "right":
      case "wrong": {
        const ok = name === "right"
        const gi = this.state.glass
        this.after(RESULT_AT, () => {
          this.sfx.play(ok ? "right" : "wrong")
          if (ok) this.burst(this.glassObjs[gi].getTransform().getLocalPosition().add(new vec3(0, GLASS_H + 1, 0)), [1, 0.85, 0.5], 22)
          this.applyPhase()
        })
        this.after(RESULT_AT + READ_TIME, () => this.dispatch({type: "revealDone"}))
        break
      }
      case "finale":
        this.hideAllCards()
        this.vials.forEach((v) => v.setBetsEnabled(false))
        this.after(0.4, () => {
          this.grimoire.open(this.state)
          this.sfx.play("grimoire")
          this.burst(new vec3(4, 6, -56), [1, 0.85, 0.5], 18)
        })
        this.after(3.4, () => {
          this.againRune.setActive(true)
          this.burst(new vec3(BOOK_OPEN[0], BOOK_OPEN[1] + 6, BOOK_OPEN[2] + 6), [1, 0.9, 0.6], 16)
        })
        break
      case "restart":
        this.grimoire.close()
        this.againRune.setActive(false)
        this.reveal = null
        this.pour = null
        this.liquids.forEach((l) => {
          l.fill = 0
          l.fillTarget = 0
          l.color = COLOR.indicator
          l.mesh.recolor(() => COLOR.indicator)
          l.obj.getTransform().setLocalScale(new vec3(1, 0.001, 1))
          l.obj.enabled = false
        })
        this.setBrew(COLOR.indicator)
        this.guide.reset()
        this.applyPhase()
        break
    }
  }

  /** Make the scene match the state: one card, one rune, vials open or closed. */
  private applyPhase(): void {
    const s = this.state
    this.cards.forEach((c, i) => {
      const txt = cardFor(s, i)
      if (txt) c.show(txt)
      else c.hide()
    })
    this.prepRune.setActive(s.phase === "prep")
    this.runes.forEach((r, i) => r.setActive(s.phase === "pour" && s.glass === i))
    const bets = s.phase === "predict" || s.phase === "pour"
    this.vials.forEach((v) => v.setBetsEnabled(bets))
    if (s.phase === "predict") this.guide.reset()
  }

  private hideAllCards(): void {
    this.cards.forEach((c) => c.hide())
  }

  onVialInCauldron(f: Family): void {
    this.sfx.play("plop")
    const m = this.mouthCenter
    this.burst(new vec3(m[0], m[1] + 1, m[2]), FAMILY_COLOR[f], 10)
    for (let i = 0; i < 5; i++) this.emitBubble(FAMILY_COLOR[f])
    this.setBrew(FAMILY_COLOR[f])
    this.dispatch({type: "bet", family: f})
  }

  /**
   * Height (cm, lab-local) of the solid surface under (x, z): table, oak board,
   * vial stand, dish, closed book, and the tops of the glasses, the cauldron and
   * the other vials (so a dropped vial stands on them instead of passing through).
   */
  groundAt(x: number, z: number, ignore?: Vial): number {
    let h = 0
    if (Math.abs(x) <= BOARD_W / 2 && Math.abs(z - BOARD_Z) <= BOARD_D / 2) h = BOARD_H
    const sx = (VIAL_X[0] + VIAL_X[2]) / 2
    if (Math.abs(x - sx) <= STAND_HALF_W && Math.abs(z - VIAL_Z) <= 4.6) h = Math.max(h, this.standTop)
    if (Math.hypot(x - SAUCER_POS[0], z - SAUCER_POS[2]) <= 5) h = Math.max(h, 1.6)
    if (Math.hypot(x - LEMON_POS[0], z - LEMON_POS[2]) <= 4) h = Math.max(h, 5.5)
    if (Math.hypot(x - HALF_LEMON_POS[0], z - HALF_LEMON_POS[2]) <= 3.1) h = Math.max(h, 2.9)
    if (Math.hypot(x - CARAFE_POS[0], z - CARAFE_POS[2]) <= 3.3 + 2.8) h = Math.max(h, CARAFE_H)
    for (const gx of GLASS_X) if (Math.hypot(x - gx, z - GLASS_Z) <= GLASS_R_OUT + 2.8) h = Math.max(h, BOARD_H + GLASS_H)
    if (Math.hypot(x - CAULDRON_POS[0], z - CAULDRON_POS[2]) <= 12.4 + 2.8) h = Math.max(h, this.mouthCenter[1] + 1.4)
    // closed book: 17 x 23 cm, 5 cm thick, lying across at the back
    if (this.grimoire && !this.grimoire.isOpenNow && x >= -7.5 && x <= 15.5 && z >= -65.2 && z <= -47) h = Math.max(h, 5.1)
    for (const v of this.vials) {
      if (v === ignore || v.state !== "idle") continue
      const hp = v.obj.getTransform().getLocalPosition()
      if (Math.hypot(x - hp.x, z - hp.z) <= 5.6) h = Math.max(h, this.standTop + 10.3)
    }
    return h
  }

  /** Axis-aligned box of some meshes, in lab-local cm. */
  private boxOf(objs: SceneObject[]): {min: vec3; max: vec3} | null {
    const inv = this.root.getTransform().getInvertedWorldTransform()
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9
    let any = false
    for (const o of objs) {
      if (!o.isEnabledInHierarchy) continue
      const r = o.getComponent("Component.RenderMeshVisual") as RenderMeshVisual
      if (!r || !r.mesh) continue
      const a = r.mesh.aabbMin
      const b = r.mesh.aabbMax
      const w = o.getTransform().getWorldTransform()
      for (let i = 0; i < 8; i++) {
        const q = inv.multiplyPoint(w.multiplyPoint(new vec3(i & 1 ? b.x : a.x, i & 2 ? b.y : a.y, i & 4 ? b.z : a.z)))
        x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); z0 = Math.min(z0, q.z)
        x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); z1 = Math.max(z1, q.z)
        any = true
      }
    }
    return any ? {min: new vec3(x0, y0, z0), max: new vec3(x1, y1, z1)} : null
  }

  /** Pairs whose boxes interpenetrate by more than 1 mm on all three axes (resting contact is not a collision). */
  private collisions(only?: string): string[] {
    const allowed = ["Saucer|Spoon", "Spoon|Saucer"]
    const boxes = this.solids.map((s) => ({name: s.name, box: this.boxOf(s.objs)}))
    const out: string[] = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i], B = boxes[j]
        if (!A.box || !B.box) continue
        if (only && A.name !== only && B.name !== only) continue
        if (allowed.indexOf(A.name + "|" + B.name) >= 0) continue
        const ox = Math.min(A.box.max.x, B.box.max.x) - Math.max(A.box.min.x, B.box.min.x)
        const oy = Math.min(A.box.max.y, B.box.max.y) - Math.max(A.box.min.y, B.box.min.y)
        const oz = Math.min(A.box.max.z, B.box.max.z) - Math.max(A.box.min.z, B.box.min.z)
        if (ox > 0.1 && oy > 0.1 && oz > 0.1) out.push(`${A.name}x${B.name}`)
      }
    }
    return out
  }

  /** Start-up audit: no interpenetration, and every prop's bottom sits on its surface (±1 mm). */
  private checkLayout(tag: string): void {
    const support: string[] = []
    for (const s of this.solids) {
      if (s.floor === null) continue
      const b = this.boxOf(s.objs)
      if (b && Math.abs(b.min.y - s.floor) > 0.1) support.push(`${s.name} bottom=${b.min.y.toFixed(2)} expected ${s.floor.toFixed(2)}`)
    }
    if (tag === "start") {
      const fmt = (v: vec3) => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`
      print("[WitchsLab] boxes " + this.solids.map((s2) => {
        const b = this.boxOf(s2.objs)
        return b ? `${s2.name}[${fmt(b.min)} .. ${fmt(b.max)}]` : `${s2.name}[none]`
      }).join(" "))
    }
    print(`[WitchsLab] layout check (${tag}): collisions=${JSON.stringify(this.collisions())} support=${JSON.stringify(support)} solids=${this.solids.length}`)
  }

  /** During motions: record any interpenetration of the moving prop; report when it stops. */
  private watchMotion(name: string, moving: boolean): void {
    if (moving) {
      const hits = this.collisions(name)
      const list = this.motionHits[name] || (this.motionHits[name] = [])
      for (const h of hits) if (list.indexOf(h) < 0) list.push(h)
    } else if (this.motionHits[name]) {
      print(`[WitchsLab] motion check ${name}: collisions=${JSON.stringify(this.motionHits[name])}`)
      delete this.motionHits[name]
    }
  }

  /** A cork pops off before the vial pours: a little puff of sparkles at the mouth. */
  corkPop(worldPos: vec3): void {
    const p = this.root.getTransform().getInvertedWorldTransform().multiplyPoint(worldPos)
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2
      this.sparks.emit(p.x, p.y, p.z, Math.cos(a) * 6, 8 + Math.random() * 6, Math.sin(a) * 6, 0.5, 0.3, -0.4, [1, 0.95, 0.85], 0.9)
    }
  }

  /** The vial's stream into the cauldron (called every frame while pouring). */
  cauldronStream(on: boolean, mouthWorld: vec3, c: RGB): void {
    if (!on) {
      if (!this.pour || this.pour.kind !== "water") this.stream.enabled = false
      return
    }
    const bottomY = this.root.getTransform().getWorldTransform().multiplyPoint(new vec3(0, this.mouthCenter[1] - 1.2, 0)).y
    this.showStream(mouthWorld, bottomY, c)
  }

  private showStream(topWorld: vec3, bottomWorldY: number, c: RGB): void {
    const len = Math.max(0.5, topWorld.y - bottomWorldY)
    const tr = this.stream.getTransform()
    tr.setWorldPosition(topWorld)
    tr.setWorldRotation(this.root.getTransform().getWorldRotation())
    const w = 0.85 + 0.15 * Math.sin(this.clock * 40)
    tr.setLocalScale(new vec3(w, len, w))
    if (c !== this.streamColor) {
      this.streamColor = c
      this.streamMesh.recolor(() => c)
    }
    this.stream.enabled = true
  }

  private setBrew(c: RGB): void {
    this.brewFrom = this.currentBrewColor()
    this.brewColor = c
    this.brewT = 0
  }

  private currentBrewColor(): RGB {
    return lerpRGB(this.brewFrom, this.brewColor, easeInOut(this.brewT))
  }

  private burst(localPos: vec3, c: RGB, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const sp = 6 + Math.random() * 14
      const col: RGB = Math.random() < 0.35 ? [1, 0.93, 0.8] : c
      this.sparks.emit(localPos.x, localPos.y, localPos.z, Math.cos(a) * sp, 10 + Math.random() * 16, Math.sin(a) * sp, 0.7 + Math.random() * 0.6, 0.3 + Math.random() * 0.35, -0.5, col, 0.6)
    }
  }

  private emitBubble(c: RGB): void {
    const m = this.mouthCenter
    const r = Math.random() * 7
    const a = Math.random() * Math.PI * 2
    const bc = lerpRGB(c, [1, 0.95, 0.85], 0.25)
    this.bubbles.emit(m[0] + Math.cos(a) * r, m[1] - 0.9, m[2] + Math.sin(a) * r, 0, 0.8, 0, 0.9 + Math.random() * 0.5, 0.35 + Math.random() * 0.5, 0.6, bc, 0.9)
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push({at: this.clock + seconds, fn})
  }

  /** The lab's own clock (seconds since start); stops when frozen for a capture. */
  get now(): number {
    return this.clock
  }

  // ---------------------------------------------------------------- frame
  private update(): void {
    if (!this.built) return
    let dt = Math.min(0.05, getDeltaTime())
    if (this.demoFreezeAt > 0 && this.clock >= this.demoFreezeAt) dt = 0
    this.clock += dt
    const t = this.clock

    // timers
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.at <= t)
      this.timers = this.timers.filter((x) => x.at > t)
      due.forEach((x) => x.fn())
    }

    // real surface: search, then glide the lab onto it
    this.searchSurface(t)
    if (this.glide) {
      const g = this.glide
      g.t = Math.min(1, g.t + dt / 0.5)
      const e = easeInOut(g.t)
      const tr = this.root.getTransform()
      tr.setWorldPosition(vec3.lerp(g.from, g.to, e))
      tr.setWorldRotation(quat.slerp(g.rotFrom, g.rotTo, e))
      if (g.t >= 1) this.glide = null
    }

    // liquids: fill, gentle surface motion, ripples after a pour
    this.liquids.forEach((l, i) => {
      if (l.fill !== l.fillTarget) {
        l.fill += (Math.sign(l.fillTarget - l.fill) * dt) / 1.1
        l.fill = Math.max(0, Math.min(1, l.fill))
        l.obj.getTransform().setLocalScale(new vec3(1, Math.max(0.001, easeInOut(l.fill)), 1))
      }
      const age = t - l.rippleAt
      const amp = l.ripple * Math.exp(-age * 1.6)
      const active = this.state.glass === i && this.state.phase !== "finale"
      if (l.obj.enabled && (amp > 0.004 || active)) this.wobble(l, t, Math.max(amp, 0.035), age)
    })

    // caustics follow the liquid: hidden while empty, tinted by its current colour
    this.liquids.forEach((l, i) => {
      const c = this.caustics[i]
      c.obj.enabled = l.obj.enabled && l.fill > 0.2
      if (!c.obj.enabled) return
      const col = this.reveal && this.reveal.glass === i ? lerpRGB(this.reveal.from, this.reveal.to, this.reveal.t) : l.color
      const key = col.map((v) => v.toFixed(2)).join(",")
      if ((c as any).key !== key) {
        ;(c as any).key = key
        const tint = lerpRGB(col, [1, 0.95, 0.85], 0.35)
        c.mesh.recolor(() => tint)
      }
    })

    // reveal: the true colour blooms from the pour point and curls through the glass
    if (this.reveal) {
      const r = this.reveal
      r.t = Math.min(1, r.t + dt / DIFFUSE_LEN)
      const l = this.liquids[r.glass]
      const imp: V3 = [0.9, LIQUID_H, 0.5]
      l.mesh.recolor((_i, y, x, z) => {
        const k = diffuseMix([x, y, z], imp, LIQUID_H, r.t)
        const glow = k * (1 - k) * 0.9
        const c = lerpRGB(r.from, r.to, k)
        return [c[0] + glow * 0.25, c[1] + glow * 0.25, c[2] + glow * 0.25]
      })
      if (r.t >= 1) {
        l.color = r.to
        this.reveal = null
      }
    }

    // the ingredient gesture (mirrors what the user just did for real)
    const camRot0 = this.cameraObject.getTransform().getWorldRotation()
    const local0 = this.root.getTransform().getWorldRotation().invert().multiply(camRot0)
    const right0 = local0.multiplyVec3(vec3.right())
    const up0 = local0.multiplyVec3(vec3.up())
    this.tickPour(dt)
    this.drops.tick(dt, right0, up0, 0.02)
    this.powder.tick(dt, right0, up0, 0.05)

    // cauldron: brew colour blend, bubbles, steam
    if (this.brewT < 1) {
      this.brewT = Math.min(1, this.brewT + dt / 1.2)
      const c = this.currentBrewColor()
      const e = easeInOut(this.brewT)
      const from = this.brewFrom
      const to = this.brewColor
      this.brew.recolor((_i, _y, x, z) => {
        const d = Math.hypot(x, z) / 9.7
        const k = Math.max(0, Math.min(1, (e * 1.4 - d) / 0.4))
        return lerpRGB(from, to, k)
      })
      void c
    }
    if (t - this.lastBubble > 0.55) {
      this.lastBubble = t
      this.emitBubble(this.brewColor)
    }
    if (t - this.lastSteam > 0.26) {
      this.lastSteam = t
      const m = this.mouthCenter
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * 5
      const tint = lerpRGB([0.9, 0.9, 0.95], this.brewColor, 0.3)
      this.steam.emit(m[0] + Math.cos(a) * r, m[1] + 0.5, m[2] + Math.sin(a) * r, (Math.random() - 0.5) * 1.5, 3.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5, 3.4 + Math.random(), 2.6, 2.2, tint, 0.24)
    }
    const camRot = this.cameraObject.getTransform().getWorldRotation()
    const local = this.root.getTransform().getWorldRotation().invert().multiply(camRot)
    const right = local.multiplyVec3(vec3.right())
    const up = local.multiplyVec3(vec3.up())
    this.steam.tick(dt, right, up, 0.25)
    this.bubbles.tick(dt, right, up, 0.1)
    this.sparks.tick(dt, right, up, 0.05)

    // runes, vials
    this.runes.forEach((r) => r.tick(t, dt))
    this.prepRune.tick(t, dt)
    this.againRune.tick(t, dt)
    this.vials.forEach((v) => {
      v.tick(t, dt)
      this.watchMotion("Vial_" + v.family, v.state !== "idle")
    })
    this.watchMotion("Spoon", !!this.pour && this.pour.kind === "soda")
    this.watchMotion("LemonHalf", !!this.pour && this.pour.kind === "lemon")
    this.watchMotion("Carafe", !!this.pour && this.pour.kind === "water")
    this.watchMotion("Grimoire", this.grimoire.isOpenNow && this.grimoire.isMoving)

    // cards face the user (yaw + a gentle pitch)
    const camPos = this.cameraObject.getTransform().getWorldPosition()
    for (const c of this.cards) {
      if (!c.sceneObject.enabled) continue
      const tr = c.sceneObject.getTransform()
      const d = camPos.sub(tr.getWorldPosition())
      const yaw = quat.angleAxis(Math.atan2(d.x, d.z), vec3.up())
      const pitch = quat.angleAxis(-Math.atan2(d.y, Math.hypot(d.x, d.z)) * 0.8, vec3.right())
      tr.setWorldRotation(yaw.multiply(pitch))
    }

    // the card's light thread to its glass (only while a card is open)
    const openCard = this.cards.findIndex((c) => c.sceneObject.enabled)
    if (openCard >= 0) {
      const top = new vec3(0, CARD_Y - 3.6, CARD_Z)
      const gx = this.state.phase === "prep" ? GLASS_X[1] : GLASS_X[this.state.glass]
      const bottom = new vec3(gx, BOARD_H + GLASS_H + 1.2, GLASS_Z)
      const d = top.sub(bottom)
      const L = Math.max(0.01, d.length)
      // the mesh runs from (0,0) down to (0,-1): +Y must point from the glass up to the card
      const tr = this.leader.getTransform()
      tr.setLocalPosition(top)
      tr.setLocalRotation(quat.angleAxis(Math.atan2(-d.x, d.y), vec3.forward()).multiply(quat.angleAxis(Math.asin(d.z / L), vec3.right())))
      tr.setLocalScale(new vec3(1, L, 1))
      this.leader.enabled = true
    } else this.leader.enabled = false

    // off-screen guide toward whatever needs you next
    this.guide.tick(t, this.guideTarget())
  }

  private wobble(l: Liquid, t: number, amp: number, age: number): void {
    const d = l.mesh.data
    for (let v = l.topStart, j = 0; v < l.topEnd; v++, j++) {
      const o = v * 10
      const x = d[o]
      const z = d[o + 2]
      const r = Math.hypot(x - 0.9, z - 0.5)
      const ring = Math.sin(r * 3.2 - age * 9) * Math.exp(-r * 0.25)
      const slosh = Math.sin(t * 1.7 + x * 0.6) * 0.3 + Math.sin(t * 2.3 + z * 0.8) * 0.3
      d[o + 1] = l.baseY[j] + amp * (ring * 0.8 + slosh)
    }
    l.mesh.commit(l.topStart, l.topEnd)
  }

  /**
   * The ingredient gesture over the active glass, each true to its material:
   *  - lemon: the half lemon turns cut-side down over the glass and is squeezed: a few drops fall;
   *  - soda: the teaspoon tips slowly and the powder falls in a fine rain;
   *  - water: the carafe tips and pours a real stream from its spout.
   * Every object rises straight up first, crosses above the glass rims, and comes straight back down.
   */
  private tickPour(dt: number): void {
    const a = this.pour
    if (!a) return
    a.t += dt
    const tr = a.obj.getTransform()
    const g = this.glassObjs[a.glass].getTransform().getLocalPosition()
    const rimY = BOARD_H + GLASS_H
    const liquidTopY = BOARD_H + GLASS_FLOOR + LIQUID_H
    const impact = new vec3(g.x + 0.9, liquidTopY, g.z + 0.5)
    // pose over the glass
    let over: vec3
    let pose: quat
    if (a.kind === "lemon") {
      // cut face down, tipped 35° toward the viewer like a hand squeezing it
      pose = quat.angleAxis(-0.6, vec3.right()).multiply(quat.angleAxis(Math.PI, vec3.right()))
      over = new vec3(impact.x, rimY + 3 + 2.85, impact.z)
    } else if (a.kind === "soda") {
      pose = quat.angleAxis(1.35, vec3.right())
      over = new vec3(impact.x, rimY + 4.4, impact.z - 0.25)
    } else {
      pose = quat.angleAxis(1.15, vec3.forward()) // tip toward -x: the spout leads
      const spoutLocal = new vec3(-2.6, CARAFE_H - 0.1, 0)
      const spoutTarget = new vec3(g.x + 0.6, rimY + 7.2, g.z)
      over = spoutTarget.sub(pose.multiplyVec3(spoutLocal))
    }
    const travelY = Math.max(over.y, rimY + 2.4)
    const T = POUR_SPOON
    const back = 2.25
    let p: vec3
    let rot: quat
    if (a.t < T) {
      const k = a.t / T
      const up = easeInOut(Math.min(1, k / 0.3))
      const side = easeInOut(Math.max(0, Math.min(1, (k - 0.25) / 0.55)))
      const settle = easeInOut(Math.max(0, (k - 0.8) / 0.2))
      const y = a.rest.y + (travelY - a.rest.y) * up + (over.y - travelY) * settle
      p = new vec3(a.rest.x + (over.x - a.rest.x) * side, y, a.rest.z + (over.z - a.rest.z) * side)
      rot = quat.slerp(a.restRot, a.kind === "water" ? quat.quatIdentity() : pose, easeInOut(Math.max(0, (k - 0.55) / 0.45)))
    } else if (a.t < back) {
      p = over
      const act = Math.min(1, (a.t - T) / 0.3) - Math.max(0, (a.t - (back - 0.3)) / 0.3)
      if (a.kind === "water") rot = quat.slerp(quat.quatIdentity(), pose, easeInOut(Math.max(0, Math.min(1, act))))
      else rot = pose
      if (a.kind === "lemon") {
        // squeeze: the half flattens a little in pulses
        const sq = Math.max(0, Math.sin((a.t - T) * 9)) * 0.1 * Math.max(0, Math.min(1, act))
        tr.setLocalScale(new vec3(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6))
      }
    } else {
      const k = Math.min(1, (a.t - back) / 0.85)
      const turn = easeInOut(Math.min(1, k / 0.35))
      const side = easeInOut(Math.max(0, Math.min(1, (k - 0.25) / 0.5)))
      const up = easeInOut(Math.min(1, k / 0.25))
      const down = easeInOut(Math.max(0, (k - 0.75) / 0.25))
      const y = over.y + (travelY - over.y) * up - (travelY - a.rest.y) * down
      p = new vec3(over.x + (a.rest.x - over.x) * side, y, over.z + (a.rest.z - over.z) * side)
      rot = quat.slerp(a.kind === "water" ? quat.quatIdentity() : pose, a.restRot, a.kind === "water" ? 1 : turn)
      tr.setLocalScale(new vec3(1, 1, 1))
      if (k >= 1) {
        tr.setLocalPosition(a.rest)
        tr.setLocalRotation(a.restRot)
        this.pour = null
        this.stream.enabled = false
        return
      }
    }
    tr.setLocalPosition(p)
    tr.setLocalRotation(rot)

    const acting = a.t > POUR_START && a.t < back - 0.3
    const rootW = this.root.getTransform().getWorldTransform()
    if (a.kind === "water") {
      if (acting) {
        const spout = tr.getWorldTransform().multiplyPoint(new vec3(-2.6, CARAFE_H - 0.1, 0))
        this.showStream(spout, rootW.multiplyPoint(new vec3(0, liquidTopY, 0)).y, [0.8, 0.88, 0.98])
      } else this.stream.enabled = false
      return
    }
    if (!acting) return
    if (a.kind === "lemon" && a.t - a.lastEmit > 0.08) {
      // a few juice drops from the cut face, falling into the glass
      a.lastEmit = a.t
      const start = new vec3(impact.x + (Math.random() - 0.5) * 1.2, over.y - 2.7, impact.z + 0.8 + (Math.random() - 0.5) * 1.2)
      const life = Math.sqrt((2 * (start.y - liquidTopY)) / 980)
      this.drops.emit(start.x, start.y, start.z, 0, 0, 0, life, 0.32, 0.1, [1, 0.9, 0.45], 1)
    }
    if (a.kind === "soda" && a.t - a.lastEmit > 0.02) {
      // a fine rain of powder from the spoon's lip
      a.lastEmit = a.t
      for (let n = 0; n < 4; n++) {
        const start = new vec3(impact.x + (Math.random() - 0.5) * 1.1, over.y - 1.0 - Math.random() * 0.4, impact.z + (Math.random() - 0.5) * 0.7)
        const life = Math.sqrt((2 * (start.y - liquidTopY)) / 420) * 1.15
        this.powder.emit(start.x, start.y, start.z, (Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2, life, 0.16 + Math.random() * 0.12, 0.2, [0.95, 0.95, 0.92], 0.95)
      }
    }
  }

  private guideTarget(): vec3 | null {
    const s = this.state
    if (s.phase === "predict" || s.phase === "pour" || s.phase === "reveal") {
      return this.glassObjs[s.glass].getTransform().getWorldPosition().add(new vec3(0, GLASS_H, 0))
    }
    if (s.phase === "prep") return this.glassObjs[1].getTransform().getWorldPosition()
    return null
  }

  // ---------------------------------------------------------------- read-only API (LEAF tests, debugging)
  get phase(): string {
    return this.state.phase
  }
  get score(): number {
    return this.state.score
  }
  get activeGlass(): number {
    return this.state.glass
  }
  get lastBet(): string {
    const b = this.state.bets[this.state.glass]
    return b ? b : ""
  }
  liquidColor(i: number): RGB {
    return this.liquids[i] ? this.liquids[i].color : COLOR.indicator
  }
  get arrowVisible(): boolean {
    return this.guide ? this.guide.arrowVisible : false
  }
  get grimoireScore(): string {
    return this.grimoire ? this.grimoire.scoreText : ""
  }
  cardTitle(i: number): string {
    return this.cards[i] ? this.cards[i].titleText : ""
  }
  get onRealSurface(): boolean {
    return this.surfaceFound
  }
  /** Test-only: rotate the virtual gaze (LEAF cannot turn the Preview camera). */
  setTestGazeYaw(deg: number): void {
    if (this.guide) this.guide.testYawDeg = deg
  }
  /** Programmatic bet, same path as a tap on the vial. */
  lobVial(f: Family): void {
    const v = this.vials.find((x) => x.family === f)
    if (v) v.lob()
  }
}

/** What the spoon pours (only the look of the stream; the chemistry comes from GLASSES). */
function pourColor(id: string): RGB {
  if (id === "lemon") return [0.99, 0.93, 0.55]
  if (id === "soda") return [0.95, 0.96, 0.97]
  return [0.82, 0.9, 1.0]
}

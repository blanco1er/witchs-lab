// Witch's Lab — the grimoire: a real leather-bound book resting closed on the
// table during the experiment. At the end it lifts off the table, tilts toward
// you, the cover swings open, three pages flip, and your results appear on
// the open pages: a real pH 1-14 colour strip with your three glasses pinned
// on it, your score, the one-line chemistry and the safety note about the
// colours we only show virtually (pH 12-14).

import {ColorMesh, vnoise, BOOK_D, BOOK_W, buildBookBrass, buildBookCover, buildBookSpine, buildPage, child} from "./WLMesh"
import {DANGER_LINE, FAMILY_COLOR, FAMILY_LABEL, GLASSES, LabState, PH_SCALE, RGB, VARY_LINE, easeInOut, finaleSummary} from "./WLLogic"

const TB = 2.0 // half page-block thickness
const BOARD = 0.56 // cover board thickness
const HINGE_Y = BOARD + TB
const PAGES = 3
const TILT = 0.95 // rad, ~54° toward the user when open

function pbr(base: Material, metallic: number, roughness: number, twoSided: boolean = false): Material {
  const m = base.clone()
  try {
    ;(m.mainPass as any).metallic = metallic
    ;(m.mainPass as any).roughness = roughness
    m.mainPass.twoSided = twoSided
  } catch (e) {}
  return m
}

@component
export class WLGrimoireUI extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("PBR vertex-colour material (WL_PBR_Vertex), cloned for leather, paper and brass.")
  pbrMaterial: Material

  @input
  @allowUndefined
  @hint("Unlit vertex-colour material for paper and ink (WL_VertexAlpha): pages read the same on both sides.")
  paperMaterial: Material

  @input
  @allowUndefined
  font: Font

  @input
  readingDistanceCm: number = 75

  /** Where the open book floats (local to the parent), set by WitchsLab. */
  openPos: vec3 = new vec3(0, 18, -6)
  /** Height the closed book rises to before gliding (above everything on the table). */
  liftY = 30

  private texts: Record<string, Text> = {}
  private built = false
  private restPos = new vec3(0, 0, 0)
  private restYaw = 0
  private tilt!: SceneObject
  private hinge!: SceneObject
  private spine!: SceneObject
  private pages: SceneObject[] = []
  private content!: SceneObject
  private t = -1 // -1 closed at rest; >= 0 seconds into the opening
  private isOpen = false
  /** Full sentence summary (kept for tests / accessibility). */
  summary = ""

  onAwake(): void {
    this.createEvent("UpdateEvent").bind(() => this.tick())
  }

  /** Build the closed book (called by WitchsLab right after creation). */
  buildBook(): void {
    if (this.built || !this.pbrMaterial) return
    this.built = true
    const leather = pbr(this.pbrMaterial, 0.0, 0.62, true)
    const paper = this.paperMaterial ? this.paperMaterial : pbr(this.pbrMaterial, 0.0, 0.85, true)
    const brass = pbr(this.pbrMaterial, 1.0, 0.32, true)
    this.restPos = this.getTransform().getLocalPosition()
    const r = this.getTransform().getLocalRotation()
    this.restYaw = 2 * Math.atan2(r.y, r.w)

    // tilt pivot = near edge of the book
    this.tilt = child(this.sceneObject, "BookTilt", 0, 0, BOOK_D / 2)
    const body = child(this.tilt, "BookBody", 0, 0, -BOOK_D / 2)

    // back cover (bottom board), right half of the page block, spine
    const back = new ColorMesh()
    buildBookCover(back, false)
    const backObj = child(body, "BackCover", 0, BOARD / 2, 0)
    back.attach(backObj, leather)
    const blockR = new ColorMesh()
    blockR.bevelSlab(BOOK_W / 2 + 0.2, BOARD + TB / 2, 0, BOOK_W / 2 - 0.9, TB / 2, BOOK_D / 2 - 0.7, 0.05, 40, 54, (x, y, z) => pageEdge(x, y, z))
    order(blockR.attach(child(body, "PagesRight"), paper), 5)
    const sp = new ColorMesh()
    buildBookSpine(sp)
    this.spine = child(body, "Spine")
    sp.attach(this.spine, leather)

    // hinge: front cover + left half of the page block + endpaper
    this.hinge = child(body, "CoverHinge", 0, HINGE_Y, 0)
    const blockL = new ColorMesh()
    blockL.bevelSlab(BOOK_W / 2 + 0.2, TB / 2, 0, BOOK_W / 2 - 0.9, TB / 2, BOOK_D / 2 - 0.7, 0.05, 40, 54, (x, y, z) => pageEdge(x, y, z))
    // the face you read once the book is open is this block's underside: mirror it so the fine (aged) grid faces there
    for (let v = 0; v < blockL.vertexCount; v++) blockL.data[v * 10 + 1] = TB - blockL.data[v * 10 + 1]
    order(blockL.attach(child(this.hinge, "PagesLeft"), paper), 5)
    const cover = new ColorMesh()
    buildBookCover(cover, true)
    cover.attach(child(this.hinge, "FrontCover", 0, TB + BOARD / 2, 0), leather)
    const br = new ColorMesh()
    buildBookBrass(br)
    br.attach(child(this.hinge, "Brass", 0, TB + BOARD / 2, 0), brass)

    // loose pages that flip right → left
    for (let i = 0; i < PAGES; i++) {
      const pm = new ColorMesh()
      buildPage(pm, BOOK_W - 1.4, BOOK_D - 1.6)
      const po = child(body, "Page" + i, 0.3, HINGE_Y + 0.03 + i * 0.015, 0)
      order(pm.attach(po, paper), 5)
      po.enabled = false
      this.pages.push(po)
    }

    // content printed on the open pages (lying on the page plane, top toward the far edge)
    this.content = child(body, "PageContent", 0, HINGE_Y + 0.12, 0)
    this.content.getTransform().setLocalRotation(quat.angleAxis(-Math.PI / 2, vec3.right()))
    this.buildContent(paper)
    this.content.enabled = false
  }

  private buildContent(ink: Material): void {
    const k = this.readingDistanceCm / 110
    const L = -BOOK_W / 2 - 0.3 // left page centre x
    const Rx = BOOK_W / 2 + 0.3 // right page centre x
    const brown = new vec4(0.13, 0.06, 0.025, 1)
    const soft = new vec4(0.17, 0.09, 0.04, 1)
    const pw = BOOK_W - 3

    this.texts.title = this.text("GrimoireTitle", L, 8.2, 74 * k, brown, 2.6, pw)
    this.texts.score = this.text("GrimoireScore", L, 4.6, 62 * k, new vec4(0.46, 0.08, 0.05, 1), 2.4, pw)
    this.texts.lines = this.text("GrimoireLines", L, -3.2, 50 * k, soft, 10, pw)
    this.texts.note = this.text("GrimoireNote", Rx, -7.6, 36 * k, soft, 4.6, pw)
    this.texts.chem = this.text("GrimoireChem", Rx, -2.0, 44 * k, brown, 4.4, pw)
    this.texts.stripTitle = this.text("StripTitle", Rx, 8.2, 54 * k, brown, 2.2, pw)
    this.texts.stripTitle.text = "Cabbage pH scale"

    // pH strip: 14 cells in the real indicator colours, inked onto the right page
    const strip = new ColorMesh()
    const SW = BOOK_W - 3
    const cell = SW / 14
    const sy = 2.6
    for (let i = 0; i < 14; i++) {
      const x0 = Rx - SW / 2 + i * cell
      strip.quadXY(x0 + 0.06, sy, x0 + cell - 0.06, sy + 2.6, 0, PH_SCALE[i])
    }
    // markers: one triangle per real glass, in its potion colour
    GLASSES.forEach((g) => {
      const x = Rx - SW / 2 + (g.ph - 1) * cell + cell / 2
      const c: RGB = FAMILY_COLOR[g.family]
      const b = strip.vertex(x, sy + 2.85, 0, 0, 0, 1, c)
      strip.vertex(x + 0.6, sy + 3.9, 0, 0, 0, 1, c)
      strip.vertex(x - 0.6, sy + 3.9, 0, 0, 0, 1, c)
      strip.tri(b, b + 1, b + 2)
      const dx = g.id === "water" ? -1.3 : g.id === "soda" ? 1.3 : 0
      const t = this.text("Marker_" + g.id, x + dx, sy + 4.7, 34 * k, soft, 1.4, 4)
      t.text = g.id === "soda" ? "soda" : g.id === "water" ? "water" : "lemon"
    })
    // decorative rule under the titles
    strip.quadXY(L - pw / 2, 7.0, L + pw / 2, 7.05, 0, [0.45, 0.3, 0.17])
    strip.quadXY(Rx - SW / 2, 7.0, Rx + SW / 2, 7.05, 0, [0.45, 0.3, 0.17])
    order(strip.attach(child(this.content, "PhStrip", 0, 0, 0.02), ink), 6)

    const n1 = this.text("Ph1", Rx - SW / 2 + cell, sy - 1.0, 34 * k, soft, 1.4, 5)
    const n7 = this.text("Ph7", Rx - SW / 2 + cell * 6.5, sy - 1.0, 34 * k, soft, 1.4, 5)
    const n14 = this.text("Ph14", Rx + SW / 2 - cell, sy - 1.0, 34 * k, soft, 1.4, 5)
    n1.text = "1 acid"
    n7.text = "7"
    n14.text = "14 base"
  }

  private text(name: string, x: number, y: number, size: number, color: vec4, h: number, w: number): Text {
    const o = child(this.content, name, x, y, 0.05)
    const t = o.createComponent("Component.Text") as Text
    t.setRenderOrder(9)
    t.depthTest = true
    t.size = size
    if (this.font) t.font = this.font
    t.horizontalOverflow = HorizontalOverflow.Wrap
    t.verticalOverflow = VerticalOverflow.Shrink
    t.layoutRect = Rect.create(-w / 2, w / 2, -h / 2, h / 2)
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.textFill.color = color
    const key = name.charAt(0).toLowerCase() + name.slice(1)
    this.texts[key] = t
    return t
  }

  /** Main → UI: open on the final state. */
  open(s: LabState): void {
    this.buildBook()
    if (!this.built) return
    this.texts.title.text = "Grimoire"
    this.texts.score.text = `${s.score} / ${GLASSES.length} right`
    this.texts.lines.text = GLASSES.map((g, i) => `${g.id === "soda" ? "Soda" : g.id === "water" ? "Water" : "Lemon"}: ${FAMILY_LABEL[g.family]} · ${s.correct[i] ? "right" : "missed"}`).join("\n")
    this.summary = finaleSummary(s).join(" ")
    this.texts.chem.text = "Acids turn the cabbage pigment red, bases turn it blue."
    this.texts.note.text = VARY_LINE + "\n" + DANGER_LINE
    this.t = 0
    this.isOpen = true
  }

  close(): void {
    this.isOpen = false
    this.t = -1
    this.applyPose(0, 0, [0, 0, 0], 0)
  }

  /** True while the book lifts, glides and opens (motion checks). */
  get isMoving(): boolean {
    return this.isOpen && this.t >= 0 && this.t < 4
  }

  get isOpenNow(): boolean {
    return this.isOpen
  }

  get scoreText(): string {
    return this.isOpen && this.texts.score ? this.texts.score.text : ""
  }

  /** lift 0..1, cover 0..1, pages[i] 0..1, content alpha. */
  private applyPose(lift: number, cover: number, pages: number[], content: number): void {
    if (!this.built) return
    const e = easeInOut(lift)
    // rise straight up first (clears the cauldron rim and the vials), then glide to the reading spot
    const up = easeInOut(Math.min(1, lift / 0.45))
    const fwd = easeInOut(Math.max(0, (lift - 0.35) / 0.65))
    const yA = this.restPos.y + (this.liftY - this.restPos.y) * up
    const p = new vec3(
      this.restPos.x + (this.openPos.x - this.restPos.x) * fwd,
      yA + (this.openPos.y - this.liftY) * fwd,
      this.restPos.z + (this.openPos.z - this.restPos.z) * fwd,
    )
    // a little float while open
    const bob = this.isOpen ? Math.sin(getTime() * 1.4) * 0.35 * e : 0
    this.getTransform().setLocalPosition(new vec3(p.x, p.y + bob, p.z))
    this.getTransform().setLocalRotation(quat.angleAxis(this.restYaw * (1 - e), vec3.up()))
    this.tilt.getTransform().setLocalRotation(quat.angleAxis(TILT * e, vec3.right()))
    this.hinge.getTransform().setLocalRotation(quat.angleAxis(Math.PI * easeInOut(cover), vec3.forward()))
    const sp = Math.max(0.001, 1 - easeInOut(cover) * 1.2)
    this.spine.getTransform().setLocalScale(new vec3(1, Math.max(0.001, sp), 1))
    this.pages.forEach((pg, i) => {
      const a = pages[i] || 0
      pg.enabled = cover > 0.6 && a < 1
      // curl through the air: rise in the middle of the flip
      pg.getTransform().setLocalRotation(quat.angleAxis(Math.PI * easeInOut(a), vec3.forward()))
    })
    this.content.enabled = content > 0.01
    if (this.content.enabled) {
      for (const key in this.texts) {
        const t = this.texts[key]
        const c = t.textFill.color
        t.textFill.color = new vec4(c.x, c.y, c.z, Math.min(1, content) * (key === "note" || key.indexOf("ph") === 0 || key.indexOf("marker") === 0 || key === "lines" ? 0.85 : 1))
      }
      this.content.getTransform().setLocalScale(new vec3(1, 1, 1))
    }
  }

  private tick(): void {
    if (!this.built) return
    if (this.t < 0) return
    this.t += getDeltaTime()
    const t = this.t
    const lift = Math.min(1, t / 1.6)
    const cover = Math.max(0, Math.min(1, (t - 1.5) / 0.9))
    const pages: number[] = []
    for (let i = 0; i < PAGES; i++) pages.push(Math.max(0, Math.min(1, (t - 2.3 - i * 0.18) / 0.55)))
    const content = Math.max(0, Math.min(1, (t - 3.1) / 0.5))
    this.applyPose(lift, cover, pages, content)
  }
}

function order(v: RenderMeshVisual, n: number): RenderMeshVisual {
  v.setRenderOrder(n)
  return v
}

function pageEdge(x: number, y: number, z: number): RGB {
  // aged parchment: warm cream, a little darker toward the gutter and the edges
  const fx = Math.abs(x - (BOOK_W / 2 + 0.2)) / (BOOK_W / 2 - 0.9)
  const fz = Math.abs(z) / (BOOK_D / 2 - 0.7)
  const foxing = Math.max(0, vnoise(x * 1.1, 7, z * 1.1) - 0.62) * 0.35 + Math.max(0, vnoise(x * 4, 3, z * 4) - 0.75) * 0.25
  const v = Math.pow(Math.max(fx, fz), 3) * 0.2 + Math.pow(1 - Math.min(1, x / 3), 2) * 0.12 + foxing + vnoise(x * 0.6, 1, z * 0.6) * 0.05
  const paper: RGB = [0.7 - v, 0.64 - v * 1.1, 0.52 - v * 1.3]
  const gilt: RGB = [0.5, 0.43, 0.32]
  const edge = Math.abs(z) > BOOK_D / 2 - 0.8 || x > BOOK_W - 0.8
  if (!edge) return paper
  const s = 0.5 + 0.5 * Math.sin(y * 50)
  return [gilt[0] + (paper[0] - gilt[0]) * s * 0.3, gilt[1] + (paper[1] - gilt[1]) * s * 0.3, gilt[2] + (paper[2] - gilt[2]) * s * 0.3]
}

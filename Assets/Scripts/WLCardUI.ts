// Witch's Lab — the small card that opens above the ACTIVE glass only.
// v2: a smoked-glass panel (rounded, hairline border, top sheen) in the
// Spectacles UIKit spirit, built without UIKit (UIKit cannot compile on this
// volume). One accent (warm gold) for the title; a small dot carries the
// potion colour when it matters. Opens with a short rise + fade.

import {CardText, RGB} from "./WLLogic"
import {ColorMesh} from "./WLMesh"

const W = 17 // cm
const H = 6.6 // cm
const R = 1.2
const CONTENT_Z = 0.08

@component
export class WLCardUI extends BaseScriptComponent {
  @input
  @hint("Distance (cm) the card is designed to be read from; scales the type.")
  readingDistanceCm: number = 70

  @input
  @allowUndefined
  @hint("Transparent vertex-colour material (WL_VertexAlpha).")
  panelMaterial: Material

  @input
  @allowUndefined
  font: Font

  private title: Text | null = null
  private body: Text | null = null
  private dot: ColorMesh | null = null
  private dotObj: SceneObject | null = null
  private openT = 0
  private target = 0
  private built = false
  private content: SceneObject | null = null

  onAwake(): void {
    this.createEvent("UpdateEvent").bind(() => this.tick())
  }

  private build(): void {
    if (this.built) return
    this.built = true
    const plateObj = global.scene.createSceneObject("CardPlate")
    plateObj.setParent(this.sceneObject)
    if (this.panelMaterial) {
      const m = new ColorMesh()
      // soft drop shadow, smoked glass body, hairline + top sheen
      m.glowXY(0, -0.4, W * 0.62, -0.06, [0, 0, 0], 0.25, 28)
      m.roundRectXY(W, H, R, 0, [0.11, 0.105, 0.12], [0.05, 0.048, 0.055], 0.82, 0.9)
      m.roundRectLineXY(W, H, R, 0.05, 0.01, [1, 0.96, 0.9], 0.2, 0.05)
      m.strokeXY(-W / 2 + R, H / 2 - 0.09, W / 2 - R, H / 2 - 0.09, 0.05, 0.02, [1, 0.96, 0.9], 0.12)
      m.attach(plateObj, this.panelMaterial).setRenderOrder(7)

      this.dotObj = global.scene.createSceneObject("CardDot")
      this.dotObj.setParent(this.sceneObject)
      this.dotObj.getTransform().setLocalPosition(new vec3(-W / 2 + 1.25, H / 2 - 1.3, 0.04))
      this.dot = new ColorMesh()
      this.dot.glowXY(0, 0, 0.75, 0, [1, 1, 1], 0.35, 20)
      this.dot.roundRectXY(0.62, 0.62, 0.31, 0.01, [1, 1, 1], [1, 1, 1], 1, 1, 5)
      this.dot.attach(this.dotObj, this.panelMaterial).setRenderOrder(8)
    }

    this.content = global.scene.createSceneObject("CardContent")
    this.content.setParent(this.sceneObject)
    this.content.getTransform().setLocalPosition(new vec3(0, 0, CONTENT_Z))

    const k = this.readingDistanceCm / 110
    this.title = this.makeText(this.content, "CardTitle", H / 2 - 1.3, 46 * k, new vec4(1, 0.84, 0.56, 1), 1.2, HorizontalAlignment.Left, -W / 2 + 2.1)
    this.body = this.makeText(this.content, "CardBody", -0.75, 52 * k, new vec4(1, 1, 1, 0.94), 4.2, HorizontalAlignment.Left, -W / 2 + 1.0)
  }

  private makeText(parent: SceneObject, name: string, y: number, size: number, color: vec4, h: number, align: HorizontalAlignment, left: number): Text {
    const o = global.scene.createSceneObject(name)
    o.setParent(parent)
    o.getTransform().setLocalPosition(new vec3(0, y, 0))
    const t = o.createComponent("Component.Text") as Text
    t.setRenderOrder(9) // after the smoked panel (7) and the dot (8): never dimmed by the glass
    t.depthTest = true
    t.size = size
    if (this.font) t.font = this.font
    t.horizontalOverflow = HorizontalOverflow.Wrap
    t.verticalOverflow = VerticalOverflow.Shrink
    t.layoutRect = Rect.create(left, W / 2 - 1.0, -h / 2, h / 2)
    t.horizontalAlignment = align
    t.verticalAlignment = VerticalAlignment.Center
    t.textFill.color = color
    // a hairline outline in the same colour = semi-bold glyphs that hold up on an additive display
    t.outlineSettings.enabled = true
    t.outlineSettings.size = 0.06
    t.outlineSettings.fill.color = color
    t.text = ""
    return t
  }

  /** Main → UI: show a step. */
  show(card: CardText): void {
    this.build()
    if (this.title) this.title.text = card.title
    if (this.body) this.body.text = card.body
    if (this.dot) {
      const c = luminous(card.accent)
      this.dot.recolor(() => c)
    }
    this.sceneObject.enabled = true
    this.openT = 0
    this.target = 1
  }

  hide(): void {
    this.target = 0
  }

  get titleText(): string {
    return this.title ? this.title.text : ""
  }

  get bodyText(): string {
    return this.body ? this.body.text : ""
  }

  private tick(): void {
    const dt = getDeltaTime()
    this.openT += (this.target - this.openT) * Math.min(1, dt * 9)
    const e = this.openT
    const s = 0.92 + 0.08 * e
    this.getTransform().setLocalScale(new vec3(s, s, s))
    if (this.content) this.content.getTransform().setLocalPosition(new vec3(0, -0.4 * (1 - e), CONTENT_Z))
    if (this.title) {
      this.title.textFill.color = new vec4(0.92, 0.76, 0.5, e)
      this.title.outlineSettings.fill.color = new vec4(0.92, 0.76, 0.5, e)
    }
    if (this.body) {
      this.body.textFill.color = new vec4(0.93, 0.91, 0.87, e)
      this.body.outlineSettings.fill.color = new vec4(0.93, 0.91, 0.87, e)
    }
    if (this.target === 0 && this.openT < 0.03) this.sceneObject.enabled = false
  }
}

function luminous(c: RGB): RGB {
  // keep the dot luminous on an additive display
  const m = Math.max(c[0], c[1], c[2], 0.001)
  return [Math.min(1, c[0] / m), Math.min(1, c[1] / m), Math.min(1, c[2] / m)]
}

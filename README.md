# Witch's Lab — real kitchen chemistry as a potion game for Snap Specs

A Lens for Snap Specs (Lens Studio 5.24, Spectacles preview). It guides the classic red-cabbage pH-indicator experiment and turns every step into a tiny game: **bet on the colour by dropping a vial into a cauldron, pour for real, pinch the rune, and watch the glass turn its true colour** with one line of chemistry shown on that glass.

**For** a parent or teacher doing the experiment with kids aged 8–12: hands busy, eyes on the glasses.

## Run it
1. Open `WitchsLab.esproj` in Lens Studio 5.24 (Spectacles target).
2. Preview panel: device **Spectacles (stereo)**, input **Interactive**, scene **"Evening Room"** (the lab is placed on its coffee table by World Query).
3. The bench appears in front of you. Mouse: click = pinch, right-drag = look, WASD = move. Click (or drag-and-drop) a vial over the cauldron to bet.

## The experiment (real values)
| Glass | You add | pH | Colour |
|---|---|---|---|
| 1 | lemon juice | ~2 (2.0–2.6, US FDA) | red |
| 2 | water (control) | 7 | stays purple |
| 3 | baking soda | 8.3 (0.1 M, Merck / NIST SRM 2191a) | blue |

Red cabbage anthocyanins change shape, and colour, with acidity (red flavylium cation in acid; purple then blue quinoidal bases as pH rises). Colours vary with cabbage strength. Green and yellow (pH 12–14) need harsh chemicals: the Lens shows them on the grimoire only.

**Safety**: an adult handles boiling water; never drink the potions; only lemon, water and baking soda; never mix bleach with acids.

## How it is built
- `Assets/Scripts/WLLogic.ts` — pure logic: chemistry table, state machine, card text, colour maths, throw and off-screen geometry (unit-tested outside Lens Studio).
- `Assets/Scripts/WitchsLab.ts` — builds the whole lab at runtime and runs the experiment: runes (`Interactable`), vials (`Interactable` + `InteractableManipulation`, ballistic flight), colour reveal, bubbles, off-screen arrow + spatial chime, sounds.
- `Assets/Scripts/WLMesh.ts` — every mesh is code-authored with MeshBuilder and vertex colours (no imported 3D model).
- `Assets/Scripts/WLCardUI.ts`, `WLGrimoireUI.ts` — the step card and the final grimoire.
- `Assets/GeneratedSFX/` — all sounds synthesized with CLAD's build-sfx engine (no samples, no third-party audio).
- `devpost/design-brief.md` — the design brief, in the Devpost Learn skill pack format (`plan-lens`).
- Interaction Kit v4.0.0 (`Packages/InteractionKit.lspkg`); vertex-colour material from CLAD (`Assets/SimpleVertexBaseColor.lspkg`).

Built by a coding agent with CLAD (Snap's Lens Studio agent plugin) through the Lens Studio MCP. No pre-existing code or assets from earlier projects.

## Licence
MIT for the project code and generated assets. Snap packages keep their own licences.

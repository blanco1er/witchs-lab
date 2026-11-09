# Witch's Lab: CLAD pass report

Date: 9 November 2026. Lens Studio 5.24.0 (build 26090816), target Spectacles (SPECS 27 preview).
Plugin: CLAD `ls-clad` 1.0.0. All Lens Studio work went through the Lens Studio MCP tools (no HTTP calls, nothing edited in `Cache/`).

## 1. CLAD skills used

| Skill | What it did here |
|---|---|
| `lens-studio-router` | Readiness gate: MCP reachable, the loaded project is `WitchsLab.esproj`, platform Specs (project target). The Lens already existed, so the builder agent was not spawned (no rebuild). Sign-in check returned `isAuthorized: false` at the time of the check. |
| `lens-studio-field-notes` | Hard rules applied: MCP tools only, VirtualScene as the scene writer, recompile + log check after each change. |
| `specs-project-init` | Status check only (table in section 2). |
| `editor-api` | `ExecuteEditorCode` calls: project path, target, sign-in, package unpack, project save. |
| `specs-leaf-install-packages` | Installed `Leaf` 4.0.0 from the Asset Library (pulled `Bitmoji 3D` 10.0.1; LEAF resolves the existing `InteractionKit` 4.0.0). |
| `lens-package-toolkit` | Unpacked `Leaf.lspkg` to `Assets/Leaf.lspkg/` to fix one compile error (section 4). |
| `specs-leaf-write-scenarios` (+ `leaf-reference.md`) | One scenario per done criterion of `devpost/design-brief.md`, plus one IK reachability scenario; `LeafIndex` attached to a root SceneObject through VirtualScene. |
| `specs-leaf-run-in-preview` | `open_leaf_panel`, `list_leaf_scenarios`, `run_leaf_scenario` one at a time; failures read from the scenario-manager lines in the Lens Studio log. |

## 2. Project status (`specs-project-init`)

| Check | Status | Detail |
|---|---|---|
| MCP connection | OK | Connected, scene loaded (16 objects before the pass) |
| Project target | OK | Spectacles |
| Preview device | OK | SPECS 27, Interactive, scene "Evening Room" |
| Project state | OK | Existing project: Camera Object, Lighting, InteractionKit, WitchsLab |
| Camera setup | OK | Perspective + DeviceTracking World (+ AudioListener) |
| SIK package | OK | InteractionKit 4.0.0 (`Packages/InteractionKit.lspkg`) |
| SIK prefab | OK | `InteractionKit` at scene root |
| UIKit package | WARN | Not installed on purpose: on this volume UIKit fails to compile (`EACCES` creating its build folders). The Lens uses meshes + `Component.Text` for its card and grimoire. |
| Blender CLI | OK | 5.2.1 LTS |
| Node.js | OK | v24.20.0 |
| FAST3D / SPECS Text-to-3D | WARN | Not needed (all meshes are code-authored); account not signed in at check time |

## 3. Brief vs. Lens

The five done criteria were compared with `Assets/Scripts/WitchsLab.ts`, `WLLogic.ts`, `WLCardUI.ts` and `WLGrimoireUI.ts`. Each one is already implemented, so **no change was made to the Lens code and no object was moved** (the scene diff only adds the `LeafIndex` object).

| # | Done criterion | Where it lives |
|---|---|---|
| 1 | Rune at the start fills all three glasses with purple cabbage water | `fillAll` cue, liquid colour `COLOR.indicator` |
| 2 | Red vial into the cauldron: brew red, card "Your bet: RED" | `onVialInCauldron` → `setBrew`, `cardFor` (pour phase) |
| 3 | POURED on glass 1: red, 2-3 s swirl from the pour point, chemistry line on the glass | `DIFFUSE_LEN = 2.6` s from the impact point; reveal card "RED / pH ~2 / ACID" + why |
| 4 | After glass 3: grimoire with "3 / 3" and the pH strip with three pins | `WLGrimoireUI.open` ("3 / 3 right", `PhStrip`, `Marker_lemon/water/soda`) |
| 5 | Vial thrown during the reveal, or a double pinch, changes nothing | Pure state machine refuses events; runes and vials disabled during the reveal |

## 4. Compile fix in the LEAF package

`Leaf` 4.0.0 was packaged with Lens Studio 5.25. On 5.24 it failed with:

```
Packages/Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator.ts(91,17): error TS2352:
Conversion of type 'string' to type 'TypeName<Scenario>' may be a mistake ...
```

Asset Library versions: 2.0.0-2.0.2 and 4.0.0. The project's SIK is `InteractionKit` 4.0.0, which LEAF 4.0.0 matches. So the package was unpacked (`AssetManager.unpack`, policy `CanBeUnpackedTransparent`) and the line was given the cast the compiler asks for:

```ts
typename: roles[role].getTypeName() as unknown as ScenarioMetadata["typename"], // LS 5.24: TS2352 without the unknown step
```

That is the only edit to package code. After it: `RecompileTypeScriptTool` → `succeeded`.

## 5. LEAF results (preview, final code, run one by one)

| Scenario | Done criterion | Result | Scenario-manager line |
|---|---|---|---|
| `wl-c1-base-fills-purple` | 1 | Passed | `PASSED: wl-c1-base-fills-purple` (6.4 s) |
| `wl-c2-red-bet` | 2 | Passed | `PASSED: wl-c2-red-bet` (7.0 s) |
| `wl-c3-pour-reveal-red` | 3 | Passed | `PASSED: wl-c3-pour-reveal-red` (12.3 s); `swirl lens-time=2.55 s wall-clock=3.38 s` |
| `wl-c4-grimoire-3-of-3` | 4 | Passed | `PASSED: wl-c4-grimoire-3-of-3` (45.3 s) |
| `wl-c5-invalid-input-ignored` | 5 | Passed | `PASSED: wl-c5-invalid-input-ignored` (16.8 s) |
| `wl-ik-reach-rune` | Reachability (CLAD skill requirement) | Passed | `PASSED: wl-ik-reach-rune` (6.4 s), no IK diagnostic between `RUNS` and `PASSED` |

**Every done criterion has a test. 6 / 6 scenarios pass.**

What each scenario asserts:
- **C1**: glasses empty before; after the real SIK pinch on `Rune_Prep`, all three liquids shown, filled (> 90 %), colour = purple indicator, glass 1 active.
- **C2**: tap on `Vial_red` through its SIK Interactable; bet recorded as red, cauldron brew colour = red, card body contains "Your bet: RED", POURED rune shown on glass 1.
- **C3**: after the pinch on `Rune_Glass0`, the swirl starts and ends; duration between 2 and 3 s; glass 1 = red; card title contains "RED" and "pH"; body "Right prediction"; score +1.
- **C4**: full run (red, purple, blue); finale; grimoire score contains "3 / 3"; `Grimoire`, `PhStrip`, `Marker_lemon`, `Marker_water`, `Marker_soda` shown.
- **C5**: second pinch on POURED reaches nothing; the blue vial cannot be pinched during the reveal, and a programmatic throw is ignored; bet stays red, brew stays red, score counted once, glass 1 still red.
- **IK**: a full IK arm (Bitmoji avatar) pinches the "BASE POURED" rune and the Lens moves to the predict phase.

### Test findings and how they were handled (test code only)

1. **LEAF's scripted pinch drags manipulable objects.** On a vial, `DefaultLeafInteractor.trigger` became a grab that moved it about 1 m (`release red moved=118.5cm`), so the vial missed the cauldron. A real short pinch in preview gives `moved=0.1cm`. The test pauses the vial's `InteractableManipulation` during the tap; the pinch still goes through the SIK Interactable and the Lens's own tap handler (`lob`).
2. **Swirl timing in the editor.** The Lens caps one frame step at 50 ms. Under LEAF the editor preview ran below 20 fps, so the 2.6 s swirl took 3.37 s of wall-clock time. C3 measures on the Lens clock (`lab().now`) and prints both values. On the device, at full frame rate, the two match.
3. **LEAF waits forever by default** (`eventTimeoutMs = -1`). A pinch on a disabled target never resolves, so the "does nothing" probes in C5 use a 2.5 s bound.
4. **Grimoire pages fade in after the cover opens.** C4 waits for `PhStrip` before asserting.
5. **IK interactor must be built inside `run()`** (LEAF's own error message), so LEAF can await the hand rig.

### Not covered by LEAF

- **Drop and throw bets (criterion 2).** LEAF covers the tap path only. Drop and throw were checked by hand with real SIK mouse pinches in the preview on 8 Nov (`release red moved=0.1cm`, `bet -> pour`).
- **Real hand tracking, comfort over time, the additive display, spatial audio.** Feel unproven: only real Specs can show these. No device was available.
- **Real colour recognition.** Out of scope by design (stand-in: the POURED pinch).

## 6. Compile and runtime status

- `RecompileTypeScriptTool`: **succeeded, 0 errors**.
- `RunAndCollectLogsTool` (refresh): **0 errors**. Two warnings, both outside the Lens scripts: `Depth format Depth24UnormStencil8 is not renderable` (engine, already present before this pass) and `[LeafPlugin] Skipping plugin state save` (editor plugin).
- Runtime self-checks still clean: `layout check (start): collisions=[] support=[] solids=15`.
- Project saved.

## 7. Files changed

- `Assets/Scripts/leaf/`:
  - `WLLeafCommon.ts` (shared helpers)
  - `WLC1BaseFillsPurple.ts`
  - `WLC2RedBet.ts`
  - `WLC3PourRevealRed.ts`
  - `WLC4Grimoire3of3.ts`
  - `WLC5InvalidInputIgnored.ts`
  - `WLC6IKReachRune.ts`
  - `WLLeafIndex.ts`

  Lens Studio allows one component class per file. The same sources are in `../scripts/leaf/`.
- `Assets/Leaf.lspkg/`: unpacked LEAF 4.0.0, one line changed (section 4).
- `Packages/Bitmoji 3D.lsc`: LEAF dependency, for the IK avatar.
- `Plugins/…/LeafPlugin`: project-scoped LEAF editor plugin, installed with the package.
- `Assets/Scene.scene`: adds the root object `LeafIndex` with `WLLeafIndex.ts`. Nothing else in the scene changed.
- `tsconfig.json`, `.gitignore`: updated by Lens Studio when LEAF was installed.
- `devpost/clad-pass-report.md`: this report.
- Lens code (`WitchsLab.ts`, `WLLogic.ts`, `WLMesh.ts`, `WLFx.ts`, `WLCardUI.ts`, `WLGrimoireUI.ts`, `WLKit.ts`): **unchanged**.

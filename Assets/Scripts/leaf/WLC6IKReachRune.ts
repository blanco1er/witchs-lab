// Witch's Lab - LEAF scenario (see WLLeafCommon.ts and devpost/design-brief.md).
// Reachability check required by the CLAD LEAF skill for reach-sensitive controls:
// a full IK arm (Bitmoji avatar) reaches for the golden rune the way a standing user would.
// LEAF's diagnostic policy is "fallback": if the reach does not converge, LEAF records a
// diagnostic in the log and finishes the pinch with the scripted interactor, so the log
// must be read for IK diagnostics, not only the pass/fail status.
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {findInteractableByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {createIKInteractor} from "Leaf.lspkg/Interactors/interactor/ik/visualizer/BitmojiAvatar"
import {lab, waitFor, ready} from "./WLLeafCommon"

/** IK - A standing user's arm reaches the "BASE POURED" rune (6.4 cm, about 57 cm ahead, below the eyes). */
@component
export class WLC6IKReachRune extends Scenario {
  async run(): Promise<void> {
    // built inside run() so LEAF can await the IK hand rig and the avatar
    const ik = createIKInteractor()
    await ready()
    const rune = findInteractableByName("Rune_Prep", undefined, true)
    if (!rune) throw new Error("Rune_Prep not found or not enabled")
    await ik.trigger(rune)
    await waitFor(() => lab().phase === "predict", 4000, "phase predict after the IK pinch")
    expect(lab().phase).toBe("predict")
  }
}

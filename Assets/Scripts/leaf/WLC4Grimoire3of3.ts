// Witch's Lab - LEAF scenario (see WLLeafCommon.ts and devpost/design-brief.md).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {Family} from "../WLLogic"
import {lab, enabled, waitFor, ready, brewBase, bet, pourAndReveal} from "./WLLeafCommon"

/** C4 - After the third glass the grimoire opens with "3 / 3" and the pH strip with the three results pinned. */
@component
export class WLC4Grimoire3of3 extends Scenario {
  async run(): Promise<void> {
    const io = new DefaultLeafInteractor()
    await ready()
    await brewBase(io)
    const answers: Family[] = ["red", "violet", "blue"]
    for (let g = 0; g < 3; g++) {
      await waitFor(() => lab().phase === "predict" && lab().activeGlass === g, 20000, "glass " + (g + 1) + " active")
      await bet(io, answers[g])
      await pourAndReveal(io, g)
    }
    await waitFor(() => lab().phase === "finale", 20000, "finale")
    await waitFor(() => lab().grimoireScore.length > 0, 5000, "grimoire open")
    expect(lab().grimoireScore.includes("3 / 3"), "score " + lab().grimoireScore).toBe(true)
    expect(enabled("Grimoire"), "grimoire shown").toBe(true)
    // the pages (pH strip + pins) fade in once the cover has opened
    await waitFor(() => enabled("PhStrip"), 10000, "pH strip on the open pages")
    expect(enabled("PhStrip"), "pH strip shown").toBe(true)
    for (const m of ["Marker_lemon", "Marker_water", "Marker_soda"]) expect(enabled(m), m).toBe(true)
  }
}

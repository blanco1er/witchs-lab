// Witch's Lab - LEAF scenario (see WLLeafCommon.ts and devpost/design-brief.md).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {FAMILY_COLOR} from "../WLLogic"
import {lab, view, near, waitFor, ready, brewBase, bet, pourAndReveal} from "./WLLeafCommon"

/** C3 - Pinching POURED for glass 1 turns it red with a 2-3 s swirl and shows the chemistry line on that glass. */
@component
export class WLC3PourRevealRed extends Scenario {
  async run(): Promise<void> {
    const io = new DefaultLeafInteractor()
    await ready()
    await brewBase(io)
    await bet(io, "red")
    const before = lab().score
    await pourAndReveal(io, 0)
    await waitFor(() => view().reveal !== null, 3000, "swirl start")
    // Measured on the Lens's own clock: the Lens caps a frame step at 50 ms, so when the
    // editor preview runs under 20 fps (LEAF + editor load) the swirl takes longer in
    // wall-clock time than on device. Both are printed; the criterion uses Lens time.
    const t0 = lab().now
    const w0 = getTime()
    await waitFor(() => view().reveal === null, 8000, "swirl end")
    const swirl = lab().now - t0
    print("[WLLeaf] swirl lens-time=" + swirl.toFixed(2) + " s wall-clock=" + (getTime() - w0).toFixed(2) + " s")
    expect(swirl >= 2 && swirl <= 3, "swirl lasted " + swirl.toFixed(2) + " s (Lens time)").toBe(true)
    expect(near(lab().liquidColor(0), FAMILY_COLOR.red), "glass 1 red").toBe(true)
    await waitFor(() => lab().cardTitle(0).includes("pH"), 3000, "chemistry line")
    expect(lab().cardTitle(0).includes("RED")).toBe(true)
    expect(view().cards[0].bodyText.includes("Right prediction")).toBe(true)
    expect(lab().score).toBe(before + 1)
  }
}

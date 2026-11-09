// Witch's Lab - LEAF scenario (see WLLeafCommon.ts and devpost/design-brief.md).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {FAMILY_COLOR} from "../WLLogic"
import {lab, view, near, waitFor, pinch, tryPinch, ready, brewBase, bet} from "./WLLeafCommon"

/** C5 - A vial thrown during the reveal, or a double pinch, changes nothing. */
@component
export class WLC5InvalidInputIgnored extends Scenario {
  async run(): Promise<void> {
    const io = new DefaultLeafInteractor()
    await ready()
    await brewBase(io)
    await bet(io, "red")
    const scoreBefore = lab().score
    // double pinch on POURED
    await pinch(io, "Rune_Glass0")
    const second = await tryPinch(io, "Rune_Glass0")
    expect(second, "second pinch on POURED reached nothing").toBe(false)
    expect(lab().phase).toBe("reveal")
    // vial thrown during the reveal: by tap on the vial and by the programmatic throw
    const thrown = await tryPinch(io, "Vial_blue")
    expect(thrown, "vial is not pinchable during the reveal").toBe(false)
    lab().lobVial("blue")
    await sleep(1500)
    expect(lab().phase).toBe("reveal")
    expect(lab().lastBet).toBe("red")
    expect(near(view().brewColor, FAMILY_COLOR.red), "brew still red").toBe(true)
    await waitFor(() => lab().phase === "predict", 20000, "next glass")
    expect(lab().score).toBe(scoreBefore + 1) // counted once
    expect(near(lab().liquidColor(0), FAMILY_COLOR.red), "glass 1 still red").toBe(true)
  }
}

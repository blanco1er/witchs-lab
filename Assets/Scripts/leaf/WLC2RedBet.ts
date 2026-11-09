// Witch's Lab - LEAF scenario (see WLLeafCommon.ts and devpost/design-brief.md).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {FAMILY_COLOR} from "../WLLogic"
import {view, near, enabled, waitFor, ready, brewBase, bet} from "./WLLeafCommon"

/** C2 - Tapping the red vial into the cauldron colours the brew red and the card says "Your bet: RED". */
@component
export class WLC2RedBet extends Scenario {
  async run(): Promise<void> {
    const io = new DefaultLeafInteractor()
    await ready()
    await brewBase(io)
    await bet(io, "red")
    expect(near(view().brewColor, FAMILY_COLOR.red), "brew red").toBe(true)
    await waitFor(() => view().cards[0].bodyText.includes("Your bet: RED"), 2000, "card text")
    expect(view().cards[0].bodyText.includes("Your bet: RED")).toBe(true)
    expect(enabled("Rune_Glass0"), "POURED rune on glass 1").toBe(true)
  }
}

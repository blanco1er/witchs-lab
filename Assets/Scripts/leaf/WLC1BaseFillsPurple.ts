// Witch's Lab - LEAF scenario (see WLLeafCommon.ts and devpost/design-brief.md).
import {Scenario} from "Leaf.lspkg/Scenarios/scenario/Scenario"
import {expect} from "Leaf.lspkg/Utils/common/Expect"
import {sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {COLOR} from "../WLLogic"
import {lab, view, near, ready, brewBase} from "./WLLeafCommon"

/** C1 - Pinching the rune at the start fills all three glasses with purple cabbage water. */
@component
export class WLC1BaseFillsPurple extends Scenario {
  async run(): Promise<void> {
    const io = new DefaultLeafInteractor()
    await ready()
    for (let i = 0; i < 3; i++) expect(view().liquids[i].fill < 0.05, "glass " + i + " empty before").toBe(true)
    await brewBase(io)
    await sleep(2500) // cascade (0.25 s apart) + fill animation
    for (let i = 0; i < 3; i++) {
      const l = view().liquids[i]
      expect(l.obj.isEnabledInHierarchy, "liquid " + i + " shown").toBe(true)
      expect(l.fill > 0.9, "glass " + i + " filled").toBe(true)
      expect(near(lab().liquidColor(i), COLOR.indicator), "glass " + i + " purple").toBe(true)
    }
    expect(lab().activeGlass).toBe(0)
  }
}

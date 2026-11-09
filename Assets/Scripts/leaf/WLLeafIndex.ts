// Witch's Lab - LEAF index: one scenario per done criterion of devpost/design-brief.md, plus one IK reachability check.
import {scenariosIndex} from "Leaf.lspkg/Scenarios/decorator/ScenarioIndexDecorator"
import {ScenarioMetadata} from "Leaf.lspkg/Scenarios/scenario/ScenarioMetadata"
import {WLC1BaseFillsPurple} from "./WLC1BaseFillsPurple"
import {WLC2RedBet} from "./WLC2RedBet"
import {WLC3PourRevealRed} from "./WLC3PourRevealRed"
import {WLC4Grimoire3of3} from "./WLC4Grimoire3of3"
import {WLC5InvalidInputIgnored} from "./WLC5InvalidInputIgnored"
import {WLC6IKReachRune} from "./WLC6IKReachRune"

@component
export class LeafIndex extends BaseScriptComponent {
  @scenariosIndex
  static scenariosIndex: ScenarioMetadata[] = [
    {id: "wl-c1-base-fills-purple", typename: WLC1BaseFillsPurple.getTypeName()},
    {id: "wl-c2-red-bet", typename: WLC2RedBet.getTypeName()},
    {id: "wl-c3-pour-reveal-red", typename: WLC3PourRevealRed.getTypeName()},
    {id: "wl-c4-grimoire-3-of-3", typename: WLC4Grimoire3of3.getTypeName()},
    {id: "wl-c5-invalid-input-ignored", typename: WLC5InvalidInputIgnored.getTypeName()},
    {id: "wl-ik-reach-rune", typename: WLC6IKReachRune.getTypeName()},
  ]
}

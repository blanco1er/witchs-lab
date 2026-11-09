// Witch's Lab - shared helpers for the LEAF scenarios (one scenario per done criterion of devpost/design-brief.md).
//
// run_leaf_scenario resets the Lens before each run, so every scenario plays
// the experiment from the start. Every interaction goes through the real SIK
// Interactables (rune pinch, vial tap) with DefaultLeafInteractor, and every
// LEAF call is awaited (an un-awaited call would hide its failure).
//
// Object names come from Assets/Scripts/WitchsLab.ts (Rune_Prep, Rune_Glass0..2,
// Vial_red / Vial_violet / Vial_blue, Marker_lemon / _water / _soda, PhStrip).
// State is read through the component's read-only API; a few private fields
// (brew colour, card body, reveal) are read through a typed view without
// changing the Lens code.

import {findSceneObjectByName, nextFrame, sleep} from "Leaf.lspkg/Utils/common/Utils"
import {DefaultLeafInteractor} from "Leaf.lspkg/Interactors/interactor/DefaultLeafInteractor"
import {findInteractablesByName} from "Leaf.lspkg/Interactors/InteractableUtils"
import {WitchsLab} from "../WitchsLab"
import {Family, RGB} from "../WLLogic"

/** Private fields read (never written) by the tests. */
export interface LabView {
  brewColor: RGB
  reveal: unknown
  cards: {titleText: string; bodyText: string}[]
  liquids: {obj: SceneObject; fill: number; color: RGB}[]
  vials: {family: Family; state: string; manip: {enabled: boolean}}[]
}

export function lab(): WitchsLab {
  const o = findSceneObjectByName("WitchsLab")
  if (!o) throw new Error("WitchsLab object not found")
  const c = o.getComponent(WitchsLab.getTypeName()) as WitchsLab
  if (!c) throw new Error("WitchsLab component not found")
  return c
}

export function view(): LabView {
  return lab() as unknown as LabView
}

export function near(a: RGB, b: RGB, tol: number = 0.03): boolean {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol
}

export function enabled(name: string): boolean {
  const o = findSceneObjectByName(name)
  return !!o && o.isEnabledInHierarchy
}

/** Polls every frame until cond() is true; throws with `what` after timeoutMs. */
export async function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const end = getTime() + timeoutMs / 1000
  while (!cond()) {
    if (getTime() > end) throw new Error("timed out waiting for " + what)
    await nextFrame()
  }
}

export async function pinch(io: DefaultLeafInteractor, name: string): Promise<void> {
  await waitFor(() => findInteractablesByName(name, undefined, true).length > 0, 6000, name + " enabled")
  const target = findInteractablesByName(name, undefined, true)[0]
  await io.trigger(target)
  await sleep(200)
}

/** Tries to pinch a target that should be inert; returns true if SIK delivered the pinch. */
export async function tryPinch(io: DefaultLeafInteractor, name: string): Promise<boolean> {
  const target = findInteractablesByName(name)[0]
  if (!target) return false
  // LEAF waits forever for interaction events by default (eventTimeoutMs = -1),
  // and a disabled target never answers: bound the wait for this probe only.
  const keep = io.eventTimeoutMs
  io.eventTimeoutMs = 2500
  try {
    await io.trigger(target)
    return true
  } catch (e) {
    return false // disabled target: no hover/trigger events
  } finally {
    io.eventTimeoutMs = keep
  }
}

/** Lens ready in its first step (the run starts from a reset Lens). */
export async function ready(): Promise<void> {
  await sleep(1500)
  await waitFor(() => lab().phase === "prep" && enabled("Rune_Prep"), 8000, "the prep rune")
  try {
    await waitFor(() => lab().onRealSurface, 4000, "a real surface")
  } catch (e) {
    // no surface: the lab stays at its fallback spot, which is fine for the tests
  }
  await sleep(900) // the lab glides onto the surface in 0.5 s
}

export async function brewBase(io: DefaultLeafInteractor): Promise<void> {
  await pinch(io, "Rune_Prep")
  await waitFor(() => lab().phase === "predict", 3000, "phase predict")
}

/**
 * Bet by tapping a vial (a short pinch: the Lens lobs the vial into the cauldron).
 * LEAF's scripted interactor turns any pinch on a manipulable object into a grab
 * that drags it about 1 m (log: "release red moved=118.5cm"), which a real short
 * pinch never does (mouse in preview: "moved=0.1cm"). So the vial's manipulation
 * is paused for the tap; the pinch itself still goes through the SIK Interactable
 * and the Lens's own tap handler. The Lens re-enables manipulation when the vial
 * is back at rest.
 */
export async function bet(io: DefaultLeafInteractor, f: Family): Promise<void> {
  const v = view().vials.find((x) => x.family === f)
  if (!v) throw new Error("vial " + f + " not found")
  // bets open 1.4 s after the base is poured; the Lens then re-enables the vial's manipulation
  await waitFor(() => findInteractablesByName("Vial_" + f, undefined, true).length > 0 && v.manip.enabled, 6000, "bets open")
  v.manip.enabled = false
  try {
    await pinch(io, "Vial_" + f)
  } finally {
    if (v.state === "idle") v.manip.enabled = true
  }
  await waitFor(() => lab().phase === "pour" && lab().lastBet === f, 5000, "bet " + f)
}

export async function pourAndReveal(io: DefaultLeafInteractor, glass: number): Promise<void> {
  await pinch(io, "Rune_Glass" + glass)
  await waitFor(() => lab().phase === "reveal", 2000, "phase reveal")
}


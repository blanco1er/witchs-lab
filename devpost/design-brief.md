---
status: approved
---

# Design brief: Witch's Lab

## The one spatial moment
I stand at my kitchen table with three real glasses of red-cabbage water. Before I pour lemon juice, plain water or baking soda into a glass, I bet on the colour by dropping a potion vial into a little cauldron; then I pour for real, pinch the golden rune, and the glass in front of me turns its true colour while one short line of chemistry appears right on that glass.

## Why it belongs on glasses
- Why I want to make it: I'm interested in the world of smart glasses.
- Uses: shares your view, draws in the world, leaves your body free.
- In my words: it's better with glasses because it's augmented reality — the magic happens on the real glasses in front of me.
- Why it's better than the phone or laptop version: both hands are busy with a spoon, a lemon and wet glasses; a phone would have to be held or propped up and would pull my eyes away from the experiment. On glasses the prediction, the instruction and the explanation sit on the glass I'm pouring into.

## Product or overlay
- Type: overlay — it accompanies a real kitchen experiment (red-cabbage pH indicator).
- What the real version would sense: the moment I poured and the real colour of the liquid.
- Stand-in for the preview: I confirm the pour by pinching a golden "POURED" rune; the Lens then shows the colour that published sources give for that ingredient (lemon → red, water → purple, baking soda → blue). The grimoire says colours may vary with cabbage strength.

## Where things live
- Where the user is looking during the main task: down at the table, at the glass being poured, about 60–80 cm away, a little below eye level.
- The lab: placed on the first real horizontal surface found where I'm looking (World Query), 25–160 cm away; fallback 68 cm ahead and 32 cm below the eyes (default).
- Three glasses: on a 44 × 20 cm oak board, 9 cm tall, 11.5 cm apart, in front of me.
- Cauldron (bet target): 25 cm copper cauldron on the left of the board, inside the initial view.
- Potion vials (red, purple, blue): 10 cm vials on a small rack to the right.
- Step card: one small smoked-glass card (24 × 10.5 cm) above the board, linked by a thin line of light to the active glass; it never covers an object.
- Grimoire: a leather-bound book at the back of the table that opens at the end.

## Hands and input
- Bet: grab a vial and drop it in the cauldron, throw it, or simply tap it (a short pinch launches it) — I can change my mind until I pour.
- Confirm a pour: pinch the golden rune (6.4 cm, highlights when aimed at) in front of the active glass.
- Brew again: pinch the "BREW AGAIN" rune on the grimoire.
- Targets are big and highlight when aimed at.
- Voice: none.

## When things show
- Step card: shows for the current step only, updates after each pinch.
- Rune: one at a time, only in front of the glass that is waiting for its pour.
- Vials: animate only when a bet is possible.
- Grimoire: appears only at the end, after the third glass.
- If something needs attention out of view: a soft sound and a small guide arrow (default).

## Done criteria
Each one can be checked in Lens Studio's preview.
1. Pinching the rune at the start fills all three glasses with purple cabbage water.
2. Dropping or tapping the red vial into the cauldron colours the brew red and the card says "Your bet: RED".
3. Pinching "POURED" for glass 1 turns it red with a 2–3 s swirl from the pour point and shows the chemistry line on that glass.
4. After the third glass, the grimoire opens with the score ("3 / 3") and the pH strip with the three results pinned.
5. A vial thrown during the reveal, or a double pinch, changes nothing.

## Out of scope
- Real colour recognition of the liquid (stand-in: the pinch).
- Green and yellow (pH 12–14): they need harsh chemicals, shown in the grimoire only.
- Multiplayer and memory across sessions.

## Risks and open questions
- Comfort over time, real hand tracking and how the additive display renders glass and coloured liquid can only be judged on real glasses.
- The real colour depends on cabbage strength; the Lens says so instead of claiming accuracy.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources

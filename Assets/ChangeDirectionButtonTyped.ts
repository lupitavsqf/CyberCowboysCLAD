// =============================================================================
//  ChangeDirectionButtonTyped.ts  —  "Change Direction" -> chiral (mirror) image
// -----------------------------------------------------------------------------
//  Drop this on a button next to Edit / Reload / Regenerate. Each press flips the
//  arena to its mirror image (chirality in the symmetrical sense): the layout is
//  reflected about its OWN centre line and comes back down on exactly the footprint
//  it already occupied, so you can ride the same pattern on the opposite rein.
//  Press again to flip back — it is its own inverse.
//
//  This does the same thing as the Change Direction(s) button on index.html and
//  calibrate.html, because it is literally the same operation: the button asks
//  ArenaStreamerTyped to send the server a 'changeDirection' message, and the server
//  runs the one shared changeDirectionInPlace() that both web pages call. The flip is
//  a real edit to the course — the server rewrites the raw rows, recomputes cal_*
//  through the normal pipeline, and pushes the result to everyone in the arena — so
//  the designer's page and the glasses always agree, and a rider flipping the course
//  is visible to the person at the computer.
//
//  It used to instead toggle a private view flag inside the lens, which reflected
//  about the RIDER while the website reflected about the LAYOUT's centre line. The two
//  agreed only for a course centred on the rider; anything off-centre jumped across
//  the arena here and stayed put there, and nobody outside these lenses saw the flip.
//
//  Wiring (Inspector) — unchanged:
//    • pinchButton   -> the Change Direction button's PinchButton component
//    • arenaStreamer -> the SceneObject/component running ArenaStreamerTyped
//                       (the same one Start / Edit / Reload already point at)
// =============================================================================

import { ArenaStreamerTyped } from "./ArenaStreamerTyped";
import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";

@component
export class ChangeDirectionButtonTyped extends BaseScriptComponent {
  @input @allowUndefined @hint("The Change Direction button's PinchButton component.") pinchButton: PinchButton;
  @input @allowUndefined @hint("The object running ArenaStreamerTyped (same one Start / Edit / Reload use).") arenaStreamer: ArenaStreamerTyped;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => {
      if (!this.pinchButton || !this.arenaStreamer) {
        print("[ChangeDirectionButtonTyped] Assign pinchButton and arenaStreamer on '"
              + this.getSceneObject().name + "'.");
        return;
      }
      this.pinchButton.onButtonPinched.add(() => {
        // Fire and forget: the flip is confirmed by the server's changeDirectionResult,
        // and the flipped layout arrives as a normal row snapshot that rebuilds the
        // floor. Both are logged by ArenaStreamerTyped, so there is no local state to
        // keep here and nothing to get out of step with the website.
        const sent = this.arenaStreamer.changeDirection();
        if (!sent) print("[ChangeDirectionButtonTyped] Change Direction not sent — see log above.");
      });
    });
  }
}
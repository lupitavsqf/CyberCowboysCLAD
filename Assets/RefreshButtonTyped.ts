// =============================================================================
//  RefreshButtonTyped.ts  —  "Reload" button (sits next to Edit)
// -----------------------------------------------------------------------------
//  Pressing it re-syncs the glasses with the arena currently on screen: it pulls
//  fresh data from the server and re-renders that arena_id's MAIN session —
//  whether the code was auto-generated on Start or typed in with the Edit button.
//  It does NOT change which arena is shown; it just makes sure you're seeing the
//  latest layout that's been pushed to it.
//
//  Wire two fields:
//    • Pinch Button   -> the PinchButton on this Reload button
//    • Arena Streamer -> the object running ArenaStreamerTyped
// =============================================================================

import { ArenaStreamerTyped } from "./ArenaStreamerTyped";
import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";

@component
export class RefreshButtonTyped extends BaseScriptComponent {
  @input @allowUndefined pinchButton: PinchButton;
  @input @allowUndefined arenaStreamer: ArenaStreamerTyped;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => {
      if (!this.pinchButton || !this.arenaStreamer) {
        print("[RefreshButtonTyped] Not wired (Pinch Button / Arena Streamer empty) on object: '"
              + this.getSceneObject().name + "'. Fill its fields or delete this copy.");
        return;
      }
      this.pinchButton.onButtonPinched.add(() => this.arenaStreamer.refresh());
    });
  }
}

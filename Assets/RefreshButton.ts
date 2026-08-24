// =============================================================================
//  RefreshButton.ts  —  Pinch a SIK button to force a fresh data pull
// -----------------------------------------------------------------------------
//  Your ArenaStreamer already updates automatically (the server pushes a new
//  snapshot within ~1s of any change). This button is a manual "re-sync": it
//  calls ArenaStreamer.refresh(), which re-requests every table from the server
//  immediately — handy if the connection hiccuped or you just want the latest.
//
//  Setup (see the chat instructions):
//   1. Put this component on a SIK PinchButton object under your ControlPanel.
//   2. Drag that same object into `pinchButton`.
//   3. Drag the object holding ArenaStreamer into `arenaStreamer`.
//
//  Requires: Spectacles Interaction Kit in the project.
// =============================================================================

import { ArenaStreamer } from "./ArenaStreamer";
import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";

@component
export class RefreshButton extends BaseScriptComponent {
  @input
  @hint("The PinchButton component (usually on this same object).")
  pinchButton: PinchButton;

  @input
  @hint("The object that has your ArenaStreamer component.")
  arenaStreamer: ArenaStreamer;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart() {
    if (!this.pinchButton) {
      print("[RefreshButton] ERROR: assign the pinchButton input.");
      return;
    }
    if (!this.arenaStreamer) {
      print("[RefreshButton] ERROR: assign the arenaStreamer input.");
      return;
    }
    // Fires once each time the button is pinched.
    this.pinchButton.onButtonPinched.add(() => {
      print("[RefreshButton] Refresh pressed — pulling latest data.");
      this.arenaStreamer.refresh();
    });
  }
}

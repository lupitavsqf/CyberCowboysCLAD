// =============================================================================
//  StartArenaButtonTyped.ts  —  "Start" -> create a new arena + session row
// -----------------------------------------------------------------------------
//  Drop this on the Start button object (the same PinchButton your StartMenu
//  already uses is fine — a button can have many listeners). When pinched, it
//  asks ArenaStreamerTyped to tell the server to begin a fresh run: mint a new
//  arena_id and session_ID (each one unit above the previous highest) and write
//  a new row into the Arenas table over the WebSocket.
//
//  Wiring (Inspector):
//    • pinchButton   -> the Start button's PinchButton component
//    • arenaStreamer -> the SceneObject/component running ArenaStreamerTyped
//
//  This is intentionally a twin of RefreshButtonTyped.ts, just calling
//  startNewArena() instead of refresh().
// =============================================================================

import { ArenaStreamerTyped } from "./ArenaStreamerTyped";
import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";

@component
export class StartArenaButtonTyped extends BaseScriptComponent {
  @input pinchButton: PinchButton;
  @input arenaStreamer: ArenaStreamerTyped;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => {
      if (!this.pinchButton || !this.arenaStreamer) {
        print("[StartArenaButtonTyped] Assign pinchButton and arenaStreamer.");
        return;
      }
      this.pinchButton.onButtonPinched.add(() => this.arenaStreamer.startNewArena());
    });
  }
}

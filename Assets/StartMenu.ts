// =============================================================================
//  StartMenu.ts  —  Front screen + Home button + WebView close/restart
// -----------------------------------------------------------------------------
//  Flow:
//    • Launch -> START SCREEN (logo + Start + Credits). Game + WebView hidden.
//    • START  -> show game. The WebView builds on first Start, and RELOADS
//                (fresh restart) on every Start after that.
//    • CREDITS -> show credits screen.
//    • RETURN  -> back to start screen.
//    • HOME (always-on, top-left) -> back to start screen AND stops the WebView
//                (halts its activity so it's effectively closed while hidden).
//
//  Note: the WebView has no true "destroy" — so "close" = stop() + hide, and
//  "restart" = reload(). First Start builds it; later Starts reload it.
//
//  Requires: Spectacles Interaction Kit. WebView control requires the WebView pkg.
// =============================================================================

import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";
import { WebView } from "WebView.lspkg/WebView";
import { ArenaStreamerTyped } from "./ArenaStreamerTyped";

@component
export class StartMenu extends BaseScriptComponent {
  @input
  @hint("The START screen object: main logo + Start button + Credits button.")
  startScreen: SceneObject;

  @input
  @hint("The CREDITS screen object: credits.png + the Return button.")
  creditsScreen: SceneObject;

  @input
  @hint("Your GAME root: the single object holding ALL gameplay (and the WebView). Hidden until Start.")
  gameRoot: SceneObject;

  @input
  @hint("The Start button's PinchButton component.")
  startButton: PinchButton;

  @input
  @hint("The Credits button's PinchButton component.")
  creditsButton: PinchButton;

  @input
  @hint("The Return button's PinchButton component (on the credits screen).")
  returnButton: PinchButton;

  @input @allowUndefined
  @hint("OPTIONAL: always-visible Home button. Returns to the start screen and stops the WebView.")
  homeButton: PinchButton;

  @input @allowUndefined
  @hint("OPTIONAL: the WebView component. Stopped on Home, reloaded on Start.")
  webView: WebView;

  @input @allowUndefined
  @hint("OPTIONAL: the ArenaStreamerTyped object. If set, pressing Start also generates a new arena (new arena_id + session_ID) so the on-screen arena code fills in.")
  arenaStreamer: ArenaStreamerTyped;

  // Tracks whether the player has started at least once (so we know to reload
  // rather than wait for the WebView's own first-time build).
  private hasStartedBefore: boolean = false;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart() {
    if (!this.startScreen || !this.creditsScreen || !this.gameRoot) {
      print("[StartMenu] ERROR: assign startScreen, creditsScreen and gameRoot.");
      return;
    }

    if (this.startButton) {
      this.startButton.onButtonPinched.add(() => this.showGame());
    } else {
      print("[StartMenu] ERROR: assign the startButton.");
    }

    if (this.creditsButton) {
      this.creditsButton.onButtonPinched.add(() => this.showCredits());
    } else {
      print("[StartMenu] ERROR: assign the creditsButton.");
    }

    if (this.returnButton) {
      this.returnButton.onButtonPinched.add(() => this.showStartScreen());
    } else {
      print("[StartMenu] ERROR: assign the returnButton.");
    }

    if (this.homeButton) {
      this.homeButton.onButtonPinched.add(() => {
        print("[StartMenu] Home pressed.");
        this.showStartScreen();
      });
    }

    this.showStartScreen();
  }

  // Safely reload the WebView (only if it has finished building).
  private restartWebView() {
    if (!this.webView) return;
    if (this.webView.isReady) {
      print("[StartMenu] Restarting WebView (reload).");
      this.webView.reload();
    }
    // If not ready yet, this is the first Start: the WebView builds and loads
    // itself automatically when GameRoot is enabled, so nothing to do here.
  }

  // Safely stop the WebView's activity (only if it exists / is ready).
  private stopWebView() {
    if (!this.webView) return;
    if (this.webView.isReady) {
      print("[StartMenu] Stopping WebView.");
      this.webView.stop();
    }
  }

  private showStartScreen() {
    this.stopWebView();              // close the webview's activity before hiding
    this.startScreen.enabled = true;
    this.creditsScreen.enabled = false;
    this.gameRoot.enabled = false;   // hides the webview (and the rest of the game)
    print("[StartMenu] Start screen.");
  }

  private showGame() {
    this.startScreen.enabled = false;
    this.creditsScreen.enabled = false;
    this.gameRoot.enabled = true;    // shows the game; first time, WebView builds+loads
    if (this.hasStartedBefore) {
      this.restartWebView();         // every later Start = fresh reload
    }
    this.hasStartedBefore = true;
    // Also generate a brand-new arena on Start, so the on-screen arena code fills
    // in and the glasses follow that arena's main session.
    if (this.arenaStreamer) {
      this.arenaStreamer.startNewArena();
    }
    print("[StartMenu] Start pressed — game is now visible.");
  }

  private showCredits() {
    this.startScreen.enabled = false;
    this.creditsScreen.enabled = true;
    this.gameRoot.enabled = false;
    print("[StartMenu] Credits screen.");
  }
}
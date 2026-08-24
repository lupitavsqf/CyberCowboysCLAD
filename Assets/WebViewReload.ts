// =============================================================================
//  WebViewReload.ts  —  Put this ON the reload button object.
// -----------------------------------------------------------------------------
//  When the button it sits on is pinched, it reloads the assigned WebView.
//  Because the reload button lives under GameRoot (with the WebView), this
//  script only wakes up after Start is pressed — exactly when the WebView exists.
//
//  Setup:
//    1. The object this is on must also have: Physics Collider + Interactable +
//       PinchButton (same three you added to the other buttons).
//    2. Drag the WebView object into the "Web View" slot below.
//
//  Requires: Spectacles Interaction Kit + the WebView package.
// =============================================================================

import { PinchButton } from "SpectaclesInteractionKit.lspkg/Components/UI/PinchButton/PinchButton";
import { WebView } from "WebView.lspkg/WebView";

@component
export class WebViewReload extends BaseScriptComponent {
  @input
  @hint("The WebView to reload when this button is pinched.")
  webView: WebView;

  onAwake() {
    this.createEvent("OnStartEvent").bind(() => this.onStart());
  }

  private onStart() {
    const button = this.sceneObject.getComponent(PinchButton.getTypeName()) as PinchButton;
    if (!button) {
      print("[WebViewReload] ERROR: this must be on the reload button (needs a PinchButton).");
      return;
    }
    if (!this.webView) {
      print("[WebViewReload] ERROR: assign the WebView.");
      return;
    }
    button.onButtonPinched.add(() => {
      print("[WebViewReload] Reloading WebView.");
      this.webView.reload();
    });
  }
}

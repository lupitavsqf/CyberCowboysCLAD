// =============================================================================
//  SpeedReadoutTyped.ts  —  show how fast the Spectacles are moving, on screen
// -----------------------------------------------------------------------------
//  Measures the wearer's speed by tracking the Camera (head) world position each
//  frame: speed = distance moved / time elapsed. The value is smoothed (head
//  tracking is jittery) and written into a Text you place anywhere — a Screen
//  Text for a fixed HUD, or a world-space label.
//
//  World units in this project are CENTIMETRES (1 m = 100 units), so the raw
//  cm/second is converted to the unit you pick.
//
//  Wiring (Inspector):
//    • camera -> the device Camera object (the same "Camera Object" / head that
//                FloorPlacer and ArenaStreamer use).
//    • label  -> a Text to write the speed into. If left empty, it uses a Text
//                on THIS same object, if there is one.
// =============================================================================

@component
export class SpeedReadoutTyped extends BaseScriptComponent {
  @input @allowUndefined @hint("The device Camera / head object. Speed = how fast this moves through the world.") camera: SceneObject;
  @input @allowUndefined @hint("Text to write the speed into. If empty, a Text on THIS object is used.") label: Text;

  @input @hint('Units to display: "m/s", "km/h" or "mph".') units: string = "km/h";
  @input @hint("Text shown before the number, e.g. \"Speed: \". Leave empty for just the value.") prefix: string = "";
  @input @hint("Decimal places to show.") decimals: number = 1;
  @input @hint("Also show the unit after the number (e.g. 12.4 km/h).") showUnit: boolean = true;

  @input @hint("Smoothing time in seconds. 0 = raw/jittery; 0.2-0.5 = steady, readable; higher = smoother but laggier.") smoothingSeconds: number = 0.3;
  @input @hint("Measure only horizontal (ground) speed, ignoring up/down head bob. OFF = true 3D device speed.") horizontalOnly: boolean = false;
  @input @hint("Ignore any single frame implying more than this many m/s (tracking jumps / recalibration teleports). 0 = never ignore. ~25 catches glitches while allowing real motion.") glitchRejectMps: number = 25;

  private havePrev = false;
  private prevX = 0;
  private prevY = 0;
  private prevZ = 0;
  private prevTime = 0;
  private smoothedMps = 0;

  onAwake() {
    // Fall back to a Text on this same object if none was assigned.
    if (!this.label) {
      const t = this.getSceneObject().getComponent("Component.Text") as Text;
      if (t) this.label = t;
    }
    this.createEvent("UpdateEvent").bind(() => this.tick());
  }

  private tick() {
    if (!this.camera) return;

    const p = this.camera.getTransform().getWorldPosition();
    const now = getTime();

    if (!this.havePrev) {
      this.prevX = p.x; this.prevY = p.y; this.prevZ = p.z;
      this.prevTime = now;
      this.havePrev = true;
      this.write(0);
      return;
    }

    const dt = now - this.prevTime;
    if (dt <= 1e-4) return;   // no time passed yet; avoid divide-by-zero

    let dxp = p.x - this.prevX;
    let dyp = p.y - this.prevY;
    let dzp = p.z - this.prevZ;
    if (this.horizontalOnly) dyp = 0;

    const distCm = Math.sqrt(dxp * dxp + dyp * dyp + dzp * dzp);
    const rawMps = (distCm / dt) / 100;   // cm/s -> m/s

    // Advance the sample point every frame regardless, so a rejected glitch
    // doesn't get re-measured as a huge jump on the next frame.
    this.prevX = p.x; this.prevY = p.y; this.prevZ = p.z;
    this.prevTime = now;

    // Drop implausible spikes from tracking resets / teleports.
    if (this.glitchRejectMps > 0 && rawMps > this.glitchRejectMps) return;

    // Frame-rate-independent low-pass smoothing.
    if (this.smoothingSeconds > 0) {
      const k = 1 - Math.exp(-dt / this.smoothingSeconds);
      this.smoothedMps += (rawMps - this.smoothedMps) * k;
    } else {
      this.smoothedMps = rawMps;
    }

    this.write(this.smoothedMps);
  }

  // Convert m/s to the chosen unit, format, and push to the label.
  private write(mps: number) {
    if (!this.label) return;
    let value = mps;
    let unit = "m/s";
    const u = (this.units || "").toLowerCase().replace(/\s+/g, "");
    if (u === "km/h" || u === "kmh" || u === "kph") { value = mps * 3.6; unit = "km/h"; }
    else if (u === "mph") { value = mps * 2.2369363; unit = "mph"; }
    else { value = mps; unit = "m/s"; }

    const d = Math.max(0, Math.floor(this.decimals));
    let txt = (this.prefix || "") + value.toFixed(d);
    if (this.showUnit) txt += " " + unit;
    this.label.text = txt;
  }
}

// =============================================================================
//  FloorPlacer.ts  —  Path-Pioneer-style floor detection for the arena
// -----------------------------------------------------------------------------
//  In Spectacles the scene origin starts at your HEAD height, so ArenaRoot
//  (and every cone/path point ArenaStreamer parents under it) would float at
//  eye level. ArenaStreamer already lays every object on ArenaRoot's local
//  y = 0 plane, so all this script does is keep ArenaRoot's WORLD y on the
//  real floor. Then local y = 0 == the floor, exactly as you want.
//
//  This mirrors how Snap's "Path Pioneer" sample finds the ground, so it also
//  works in the Lens Studio editor preview (where there is NO real depth):
//
//   1. ASSUMED FLOOR (instant): as soon as it starts, it drops ArenaRoot to a
//      floor assumed `assumedCameraHeightCm` below your head. So the arena is
//      never stuck at eye level — even in the editor it lands on the floor.
//   2. LOOK-TO-CONFIRM (on device): cast a ray along your gaze (slightly down),
//      accept only HORIZONTAL surfaces (floor, not walls), and once the hit
//      stays steady for `samplesToLock` frames, snap ArenaRoot to the real
//      measured floor and lock it.
//
//  You can also PINCH at any spot on the floor to recentre the arena's X/Z
//  there; the locked floor height is kept.
//
//  Requires: Lens Studio 5.9+ and Spectacles Interaction Kit in the scene.
//  Experimental APIs help (Ground classification) but are NOT required — the
//  horizontal-surface test works without them.
//  World units are CENTIMETRES (1 metre = 100 units).
// =============================================================================

import { InteractorInputType } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";

const WorldQueryModule = require("LensStudio:WorldQueryModule");

@component
export class FloorPlacer extends BaseScriptComponent {
  @input
  @hint("The object to pin to the floor — your ArenaRoot.")
  arenaRoot: SceneObject;

  @input
  @hint("The device Camera object (the wearer's head). Required: gaze + height come from this.")
  camera: SceneObject;

  @input @allowUndefined
  @hint("Optional marker shown at the floor spot you're aiming at while it calibrates.")
  reticle: SceneObject;

  @input
  @hint("ON (recommended): assume a floor below you instantly, then refine to the real floor by looking at it. OFF: classic aim-and-pinch placement.")
  autoDetectFloor: boolean = true;

  @input
  @hint("Assumed distance from your eyes down to the floor, in cm. Used instantly and as the editor/fallback floor (~100–120 for a standing adult).")
  assumedCameraHeightCm: number = 110;

  @input
  @hint("Only lock onto HORIZONTAL surfaces (real floor), ignoring walls/tilted surfaces.")
  groundOnly: boolean = true;

  @input
  @hint("MANUAL mode only. ON: keep the arena X/Z and just drop it to floor height. OFF: move the whole arena to where you pinch.")
  matchFloorHeightOnly: boolean = false;

  // ── AUTO-detection tuning ──────────────────────────────────────────────────
  @input
  @hint("AUTO: how far along your gaze to search for the floor, in cm. 1000 = up to 10 m.")
  maxFloorDistanceCm: number = 1000;

  @input
  @hint("AUTO: how many steady floor hits in a row before locking. ~10–30. Higher = steadier but slower.")
  samplesToLock: number = 15;

  @input
  @hint("AUTO: the floor hit must stay within this many cm to count as 'steady'.")
  stabilityToleranceCm: number = 6;

  @input
  @hint("AUTO: keep watching after locking and re-level if the floor drifts beyond the threshold below. OFF = lock once and stay put.")
  continuousTracking: boolean = false;

  @input
  @hint("AUTO + continuousTracking: re-level only if the floor moves more than this many cm from the locked height.")
  driftThresholdCm: number = 30;

  @input
  @hint("AUTO: on the first real lock, also slide the arena this many cm in front of you. 0 = leave X/Z where it is.")
  placeInFrontCm: number = 0;

  @input enableLogging: boolean = true;

  // ── Internal state ─────────────────────────────────────────────────────────
  private hitTestSession: any;
  private primaryInteractor: any;
  private lastHit: any = null;

  private camTr: Transform | null = null;
  private provisionalApplied: boolean = false;  // assumed-floor drop done?
  private locked: boolean = false;              // real floor locked?
  private lockedFloorY: number = 0;
  private placedInFront: boolean = false;
  private samples: number[] = [];

  private readonly MIN_HIT_CM = 40;             // ignore hits closer than this (your own body)

  onAwake() {
    const options = HitTestSessionOptions.create();
    options.filter = true;                                  // smooth the depth a little
    if (this.groundOnly) {
      try { options.classification = true; } catch (e) { /* experimental API off — fine */ }
    }
    this.hitTestSession = WorldQueryModule.createHitTestSessionWithOptions(options);
    if (this.hitTestSession && this.hitTestSession.start) {
      try { this.hitTestSession.start(); } catch (e) { /* some builds auto-start */ }
    }

    if (this.reticle) this.reticle.enabled = false;
    if (this.camera) this.camTr = this.camera.getTransform();

    this.setupPinch();
    this.createEvent("UpdateEvent").bind(() => this.onUpdate());

    this.log(
      this.autoDetectFloor
        ? "AUTO floor ON — arena drops to an assumed floor now; look at the floor to lock the real one."
        : "MANUAL mode — look at the floor and pinch to place the arena."
    );
  }

  private onUpdate() {
    if (this.autoDetectFloor) this.autoUpdate();
    else this.manualUpdate();
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  AUTO mode
  // ───────────────────────────────────────────────────────────────────────────
  private autoUpdate() {
    if (!this.camTr) {
      if (this.camera) this.camTr = this.camera.getTransform();
      else { this.log("ERROR: assign the Camera input."); return; }
    }

    // (1) Instant assumed floor — runs once, the first frame the head has a pose.
    if (!this.provisionalApplied) {
      this.applyAssumedFloor();
    }

    // Locked and not tracking → done.
    if (this.locked && !this.continuousTracking) {
      if (this.reticle) this.reticle.enabled = false;
      return;
    }

    // (2) Cast a ray along the gaze (slightly downward) to find the real floor.
    const camPos = this.camTr.getWorldPosition();
    const look = this.camTr.back;                 // gaze direction (= -forward)
    const dir = new vec3(look.x, look.y - 0.1, look.z); // bias a touch downward
    const rayStart = camPos.add(dir.uniformScale(this.MIN_HIT_CM));
    const rayEnd = camPos.add(dir.uniformScale(this.maxFloorDistanceCm));
    this.hitTestSession.hitTest(rayStart, rayEnd, (res: any) => this.onFloorHit(res));
  }

  private applyAssumedFloor() {
    const camPos = this.camTr.getWorldPosition();
    const t = this.arenaRoot.getTransform();
    const cur = t.getWorldPosition();
    t.setWorldPosition(new vec3(cur.x, camPos.y - this.assumedCameraHeightCm, cur.z));
    this.provisionalApplied = true;
    this.log("Assumed floor set ~" + this.assumedCameraHeightCm + " cm below your head.");
  }

  private onFloorHit(res: any) {
    if (res === null) {
      if (this.reticle && !this.locked) this.reticle.enabled = false;
      return;
    }

    // Accept only horizontal surfaces (real floor), unless groundOnly is off.
    const horizontal = this.isHorizontal(res);
    if (this.groundOnly && !horizontal) {
      this.samples = [];
      return;
    }

    const floorY = res.position.y;
    if (this.reticle) {
      this.reticle.enabled = true;
      this.reticle.getTransform().setWorldPosition(res.position);
    }

    // Already locked → only react to big drift (when continuousTracking is on).
    if (this.locked) {
      if (Math.abs(floorY - this.lockedFloorY) > this.driftThresholdCm) {
        this.log("Floor drifted — re-levelling.");
        this.samples = [];
        this.locked = false;
      } else {
        return;
      }
    }

    // Steady-hit calibration.
    const need = Math.max(1, Math.floor(this.samplesToLock));
    this.samples.push(floorY);
    if (this.samples.length > need) this.samples.shift();
    if (this.samples.length < need) return;

    const min = Math.min(...this.samples);
    const max = Math.max(...this.samples);
    if (max - min > this.stabilityToleranceCm) return; // not steady yet

    this.lockFloor(this.median(this.samples));
  }

  private lockFloor(floorY: number) {
    const t = this.arenaRoot.getTransform();
    const cur = t.getWorldPosition();
    let x = cur.x;
    let z = cur.z;

    if (!this.placedInFront && this.placeInFrontCm > 0 && this.camTr) {
      const fwd = this.flatLook();
      x = cur.x + fwd.x * this.placeInFrontCm;
      z = cur.z + fwd.z * this.placeInFrontCm;
      this.placedInFront = true;
    }

    t.setWorldPosition(new vec3(x, floorY, z));
    this.lockedFloorY = floorY;
    this.locked = true;
    if (this.reticle) this.reticle.enabled = false;
    this.log("Real floor LOCKED at y = " + floorY.toFixed(1) + " cm. Arena is on the floor.");
  }

  // Gaze projected onto the horizontal plane (unit length, y = 0).
  private flatLook(): vec3 {
    const b = this.camTr.back;
    const len = Math.sqrt(b.x * b.x + b.z * b.z);
    if (len < 1e-4) return new vec3(0, 0, -1);
    return new vec3(b.x / len, 0, b.z / len);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  MANUAL mode (original aim-and-pinch)
  // ───────────────────────────────────────────────────────────────────────────
  private manualUpdate() {
    this.primaryInteractor = SIK.InteractionManager.getTargetingInteractors().shift();
    const it = this.primaryInteractor;
    if (it && it.isActive() && it.isTargeting()) {
      const rayStart = new vec3(it.startPoint.x, it.startPoint.y, it.startPoint.z + 30);
      const rayEnd = it.endPoint;
      this.hitTestSession.hitTest(rayStart, rayEnd, (res: any) => this.onAimHit(res));
    } else if (this.reticle) {
      this.reticle.enabled = false;
    }
  }

  private onAimHit(res: any) {
    if (res === null || (this.groundOnly && !this.isHorizontal(res))) {
      this.lastHit = null;
      if (this.reticle) this.reticle.enabled = false;
      return;
    }
    this.lastHit = res;
    if (this.reticle) {
      this.reticle.enabled = true;
      this.reticle.getTransform().setWorldPosition(res.position);
    }
  }

  // ── Pinch (both modes) ──────────────────────────────────────────────────────
  private setupPinch() {
    const interactors = SIK.InteractionManager.getInteractorsByType(InteractorInputType.All);
    for (const it of interactors) {
      it.onTriggerEnd.add(() => {
        if (this.lastHit && this.primaryInteractor === it) this.onPinch();
      });
    }
  }

  private onPinch() {
    const pos = this.lastHit.position;
    const t = this.arenaRoot.getTransform();

    if (this.autoDetectFloor) {
      const y = this.locked ? this.lockedFloorY : pos.y;
      t.setWorldPosition(new vec3(pos.x, y, pos.z)); // recentre X/Z, keep floor height
      this.placedInFront = true;
      this.log("Arena recentred where you pinched (floor height kept).");
      return;
    }

    if (this.matchFloorHeightOnly) {
      const cur = t.getWorldPosition();
      t.setWorldPosition(new vec3(cur.x, pos.y, cur.z));
    } else {
      t.setWorldPosition(pos);
    }
    if (this.reticle) this.reticle.enabled = false;
    this.log("Arena placed on floor at y = " + pos.y.toFixed(1) + " cm.");
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  // Horizontal = surface normal points roughly up. Also accept Ground if the
  // experimental classification happens to be available.
  private isHorizontal(res: any): boolean {
    if (res.normal && typeof res.normal.distance === "function") {
      if (res.normal.distance(vec3.up()) < 0.2) return true;
    }
    if (typeof SurfaceClassification !== "undefined" &&
        res.classification === SurfaceClassification.Ground) {
      return true;
    }
    // If we can't tell (no normal, no classification), don't block placement.
    return !res.normal;
  }

  private median(arr: number[]): number {
    const a = arr.slice().sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  private log(m: string) {
    if (this.enableLogging) print("[FloorPlacer] " + m);
  }
}
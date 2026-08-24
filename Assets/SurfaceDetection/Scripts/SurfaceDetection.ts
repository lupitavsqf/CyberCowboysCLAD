/**
 * Specs Inc. 2026 — Surface Detection (Path Pioneer ground-plane detector).
 * Patched for the Cyber Cowboys arena:
 *   • Utilities.lspkg Logger dependency replaced by an inline logger.
 *   • Added: drops your ArenaRoot onto the detected floor when calibration
 *     completes, plus an instant "assumed floor" so the arena sits on the
 *     ground even in the Lens Studio editor (where there is no real depth).
 *
 * Look at the floor and hold steady: a ring appears and fills; when it
 * completes, the arena snaps to the real measured floor.
 */
import {CircleAnimation} from "./CircleAnimation"

// --- inline logger (replaces Utilities.lspkg/Scripts/Utils/Logger) ---
class Logger {
  constructor(private tag: string, private enabled: boolean, private _verbose?: boolean) {}
  debug(m: string) { if (this.enabled) print("[" + this.tag + "] " + m); }
  warn(m: string) { print("[" + this.tag + "] WARN: " + m); }
  error(m: string) { print("[" + this.tag + "] ERROR: " + m); }
}

@component
export class SurfaceDetection extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("Camera scene object whose forward direction defines the hit-test ray")
  camObj: SceneObject

  @input
  @allowUndefined
  @hint("Scene object moved to the detected surface position during calibration (the ring)")
  visualObj: SceneObject

  @input
  @allowUndefined
  @hint("CircleAnimation driving the calibration ring visual")
  animation: CircleAnimation

  // ── Arena hook-up (added) ───────────────────────────────────────────────────
  @input
  @allowUndefined
  @hint("Your ArenaRoot — dropped onto the detected floor when calibration completes.")
  arenaRoot: SceneObject

  @input
  @hint("Start floor calibration automatically when the lens starts.")
  autoStart: boolean = true

  @input
  @hint("Assumed eye-to-floor height (cm), applied instantly so the arena sits on the floor even before/without a real scan (e.g. in the editor).")
  assumedCameraHeightCm: number = 110

  @input
  @hint("ON: move the arena to where you looked. OFF: keep the arena's X/Z and only drop it to floor height.")
  recenterToHit: boolean = false

  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private worldQueryModule = require("LensStudio:WorldQueryModule") as any

  private readonly MAX_HIT_DISTANCE = 1000
  private readonly MIN_HIT_DISTANCE = 50
  private readonly CALIBRATION_FRAMES = 30
  private readonly MOVE_DISTANCE_THRESHOLD = 5
  private readonly DEFAULT_SCREEN_DISTANCE = 200
  private readonly SPEED = 10

  private camTrans
  private visualTrans

  private calibrationPosition = vec3.zero()
  private calibrationRotation = quat.quatIdentity()

  private desiredPosition = vec3.zero()
  private desiredRotation = quat.quatIdentity()

  private hitTestSession = null
  private updateEvent = null

  private history = []
  private calibrationFrames = 0

  private onGroundCallibratingCallback = null
  private onGroundFoundCallback = null

  onAwake(): void {
    this.logger = new Logger("SurfaceDetection", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
    // Kick everything off once the lens starts (head pose is valid by then).
    this.createEvent("OnStartEvent").bind(() => this.onLensStart())
  }

  // ── Lens start: instant assumed floor, then begin real calibration ──────────
  private onLensStart() {
    if (!this.camObj) {
      this.logger.warn("Please set Camera Obj input — floor detection needs the head transform.")
      return
    }
    if (this.arenaRoot) {
      const camY = this.camObj.getTransform().getWorldPosition().y
      const t = this.arenaRoot.getTransform()
      const cur = t.getWorldPosition()
      t.setWorldPosition(new vec3(cur.x, camY - this.assumedCameraHeightCm, cur.z))
      this.logger.debug("Assumed floor applied ~" + this.assumedCameraHeightCm + " cm below head.")
    }
    if (this.autoStart) this.recalibrateFloor()
  }

  // Public: (re)run the look-at-floor calibration; snaps the arena on completion.
  public recalibrateFloor() {
    if (!this.camObj) { this.logger.warn("No Camera Obj — cannot calibrate."); return }
    this.startGroundCalibration(
      (_pos, _rot) => {},
      (pos, _rot) => this.setArenaFloor(pos)
    )
  }

  private setArenaFloor(pos: vec3) {
    if (!this.arenaRoot) return
    const t = this.arenaRoot.getTransform()
    const cur = t.getWorldPosition()
    const np = this.recenterToHit ? new vec3(pos.x, pos.y, pos.z) : new vec3(cur.x, pos.y, cur.z)
    t.setWorldPosition(np)
    this.logger.debug("Arena floor LOCKED at y=" + pos.y.toFixed(1) + " cm.")
  }

  // ── Original Path Pioneer detection below (unchanged behaviour) ──────────────
  private init() {
    if (!this.camObj) {
      this.logger.warn("Please set Camera Obj input")
      return
    }
    this.camTrans = this.camObj.getTransform()
    this.visualTrans = this.visualObj.getTransform()
    this.visualObj.enabled = false

    try {
      const options = HitTestSessionOptions.create()
      options.filter = true
      this.hitTestSession = this.worldQueryModule.createHitTestSessionWithOptions(options)
    } catch (e) {
      this.logger.error(String(e))
    }
  }

  startGroundCalibration(
    groundCallibratingCallback: (pos: vec3, rot: quat) => void,
    groundFoundCallback: (pos: vec3, rot: quat) => void
  ) {
    this.init()
    this.setDefaultPosition()
    this.hitTestSession?.start()
    this.visualObj.enabled = true
    this.history = []
    this.calibrationFrames = 0
    this.onGroundCallibratingCallback = groundCallibratingCallback
    this.onGroundFoundCallback = groundFoundCallback
    this.updateEvent = this.createEvent("UpdateEvent")
    this.updateEvent.bind(() => {
      this.update()
    })
    this.animation.startCalibration(() => {
      this.onCalibrationComplete()
    })
  }

  private setDefaultPosition() {
    this.desiredPosition = this.camTrans
      .getWorldPosition()
      .add(this.camTrans.forward.uniformScale(-this.DEFAULT_SCREEN_DISTANCE))
    this.desiredRotation = this.camTrans.getWorldRotation()
    this.visualTrans.setWorldPosition(this.desiredPosition)
    this.visualTrans.setWorldRotation(this.desiredRotation)
  }

  private update() {
    const rayDirection = this.camTrans.forward
    rayDirection.y += 0.1
    const camPos = this.camTrans.getWorldPosition()
    const rayStart = camPos.add(rayDirection.uniformScale(-this.MIN_HIT_DISTANCE))
    const rayEnd = camPos.add(rayDirection.uniformScale(-this.MAX_HIT_DISTANCE))
    this.hitTestSession.hitTest(rayStart, rayEnd, (hitTestResult) => {
      this.onHitTestResult(hitTestResult)
    })
  }

  private onHitTestResult(hitTestResult) {
    let foundPosition = vec3.zero()
    let foundNormal = vec3.zero()
    if (hitTestResult != null) {
      foundPosition = hitTestResult.position
      foundNormal = hitTestResult.normal
    }
    this.updateCalibration(foundPosition, foundNormal)
  }

  private updateCalibration(foundPosition: vec3, foundNormal: vec3) {
    const currPosition = this.visualTrans.getWorldPosition()
    const currRotation = this.visualTrans.getWorldRotation()

    this.desiredPosition = this.camTrans
      .getWorldPosition()
      .add(this.camTrans.forward.uniformScale(-this.DEFAULT_SCREEN_DISTANCE))
    this.desiredRotation = this.camTrans.getWorldRotation()

    let horizontalPlaneTracked = false
    if (foundNormal.distance(vec3.up()) < 0.1) {
      horizontalPlaneTracked = true
      this.desiredPosition = foundPosition
      const worldCameraForward = this.camTrans.right.cross(vec3.up()).normalize()
      this.desiredRotation = quat.lookAt(worldCameraForward, foundNormal)
      this.desiredRotation = this.desiredRotation.multiply(quat.fromEulerVec(new vec3(-Math.PI / 2, 0, 0)))

      this.history.push(this.desiredPosition)
      if (this.history.length > this.CALIBRATION_FRAMES) {
        this.history.shift()
      }
      const distance = this.history[0].distance(this.history[this.history.length - 1])
      if (distance < this.MOVE_DISTANCE_THRESHOLD) {
        this.calibrationFrames++
      } else {
        this.calibrationFrames = 0
      }
    } else {
      this.calibrationFrames = 0
      this.history = []
    }

    const calibrationAmount = this.calibrationFrames / this.CALIBRATION_FRAMES
    this.animation.setLoadAmount(calibrationAmount)

    if (calibrationAmount == 1) {
      this.calibrationPosition = this.desiredPosition
      const rotOffset = quat.fromEulerVec(new vec3(Math.PI / 2, 0, 0))
      this.calibrationRotation = this.desiredRotation.multiply(rotOffset)
      this.removeEvent(this.updateEvent)
    }

    const targetPos: vec3 = vec3.lerp(currPosition, this.desiredPosition, getDeltaTime() * this.SPEED)
    const targetRot: quat = quat.slerp(currRotation, this.desiredRotation, getDeltaTime() * this.SPEED)
    this.visualTrans.setWorldPosition(targetPos)
    this.visualTrans.setWorldRotation(targetRot)

    if (horizontalPlaneTracked) {
      this.onGroundCallibratingCallback?.(targetPos, targetRot)
    }
  }

  reset() {
    this.animation.reset()
    this.removeEvent(this.updateEvent)
    this.onCalibrationComplete()
  }

  private onCalibrationComplete() {
    this.hitTestSession?.stop()
    this.onGroundFoundCallback?.(this.calibrationPosition, this.calibrationRotation)
    this.onGroundCallibratingCallback = null
    this.onGroundFoundCallback = null
  }
}

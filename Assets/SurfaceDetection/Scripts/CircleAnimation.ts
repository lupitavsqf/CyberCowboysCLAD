/**
 * Specs Inc. 2026 — Circle Animation (Path Pioneer surface-detection ring).
 * Patched for standalone use: the Utilities.lspkg Logger dependency is replaced
 * by a tiny inline logger so no extra package is required.
 */

// --- inline logger (replaces Utilities.lspkg/Scripts/Utils/Logger) ---
class Logger {
  constructor(private tag: string, private enabled: boolean, private _verbose?: boolean) {}
  debug(m: string) { if (this.enabled) print("[" + this.tag + "] " + m); }
  warn(m: string) { print("[" + this.tag + "] WARN: " + m); }
  error(m: string) { print("[" + this.tag + "] ERROR: " + m); }
}

@component
export class CircleAnimation extends BaseScriptComponent {
  @input
  @allowUndefined
  @hint("RenderMeshVisual whose material parameters are animated during calibration")
  calRenderer: RenderMeshVisual

  @input
  @allowUndefined
  @hint("AudioComponent played when calibration completes successfully")
  audio: AudioComponent

  @input
  @hint("Enable general logging")
  enableLogging: boolean = false;

  @input
  @hint("Enable lifecycle logging (onAwake, onStart, onUpdate, onDestroy)")
  enableLoggingLifecycle: boolean = false;

  private logger: Logger;
  private startSize = 0
  private desiredLoadAmount = 0
  private startCompleteAnimTime = 0
  private updateEvent = null
  private audioPlayed = false
  private onCompleteCallback = null

  onAwake(): void {
    this.logger = new Logger("CircleAnimation", this.enableLogging || this.enableLoggingLifecycle, true);
    if (this.enableLoggingLifecycle) this.logger.debug("LIFECYCLE: onAwake()");
  }

  init() {
    this.startSize = this.calRenderer.mainPass.StartSize
    this.calRenderer.mainPass.Amount = 0
    this.calRenderer.mainPass.CurrSize = this.startSize
  }

  setLoadAmount(amount: number) {
    this.desiredLoadAmount = amount
    if (this.desiredLoadAmount == 1) {
      this.startCompleteAnimTime = getTime()
    }
  }

  private update() {
    const currAmount = this.calRenderer.mainPass.Amount
    if (currAmount < 0.01) {
      this.calRenderer.mainPass.CurrSize = this.PingPong(this.startSize * 2, this.startSize * 3, getTime() * 0.75)
    } else if (currAmount > 0.99) {
      if (!this.audioPlayed) {
        this.audioPlayed = true
        if (this.audio) this.audio.play(1)
      }

      this.calRenderer.mainPass.CurrSize = this.PingPong(0.095, 0, (getTime() - this.startCompleteAnimTime) * 1)
      if (this.calRenderer.mainPass.CurrSize < 0.001) {
        this.calRenderer.mainPass.CurrSize = 0
        this.onCompleteCallback?.()
        this.removeEvent(this.updateEvent)
      }
    }
    this.calRenderer.mainPass.Amount = MathUtils.lerp(currAmount, this.desiredLoadAmount, getDeltaTime() * 6)
  }

  private PingPong(min, max, t) {
    const range = max - min
    const freq = t * (Math.PI * 2)
    return min + 0.5 * (1 + Math.sin(freq)) * range
  }

  public startCalibration(callback: () => void) {
    this.init()
    this.audioPlayed = false
    this.onCompleteCallback = callback
    this.calRenderer.mainPass.Amount = 0
    this.desiredLoadAmount = 0
    this.updateEvent = this.createEvent("UpdateEvent")
    this.updateEvent.bind(() => {
      this.update()
    })
  }

  reset() {
    this.calRenderer.mainPass.CurrSize = 0
    this.onCompleteCallback = null
    this.removeEvent(this.updateEvent)
  }
}

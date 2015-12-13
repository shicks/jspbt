/**
 * The TTYRec Player, which handles timing, play/pause/rewind.
 */
export default class Player {
  /**
   * @param {!TtyRec} ttyRec
   * @param {!Terminal} terminal
   */
  constructor(ttyRec, terminal) {
    /**
     * The current speed, as a linear factor.
     * @private {number}
     */
    this.speed_ = 1;
    /**
     * Whether the player is currently running.
     * @private {boolean}
     */
    this.playing_ = false;
    /**
     * The timeout handle for advancing to the next frame.
     * @private {?number}
     */
    this.timeout_ = null;
    /**
     * The amount of time we've waited so far, in millis.
     * @private {number}
     */
    this.waitedMs_ = 0;
    /**
     * The time for the next frame, in millis.
     * @private {number}
     */
    this.nextFrameMs_ = 0;
    /**
     * "Event handler" called just before a frame is drawn.
     * @type {function()}
     */
    this.onframe = () => {};
  }

  /**
   * Transforms the delay to what we should actually use.
   * @param {number} delay The actual delay.
   * @return {number} A new delay, at most two seconds.
   * @private
   */
  transform_(delay) {
    delay /= Math.abs(speed);
    return delay > 2000 ? 2000 : delay;
  }

  /**
   * Advances the given number of frames.
   * @param {number=} frames Number of frames to advance.
   */
  advance(frames = 1) {
    if (this.timeout_) clearTimeout(this.timeout_);
    this.timeout_ = null;
    if (frames < 0) return;  // TODO(sdh): support backtracking
    this.player_.onframe();  // TODO(sdh): make this a real event target
    while (frames--) this.ttyRec_.advance();
    this.terminal_.write(this.ttyRec_.data());
    this.waitedMs_ = 0;
    if (this.playing_) {
      const delay = this.transform_(this.ttyRec_.delayMs());
      this.nextFrameMs_ = +new Date() + delay;
      // TODO(sdh): don't set timeout if should be immediate.
      //            - or maybe requestAnimationFrame?
      this.timeout_ = setTimeout(() => this.advance(), delay);
    }
  }

  /**
   * Sets the play/pause state.
   * @param {boolean} play Whether playing is on.
   */
  play(play) {
    if (this.playing_ == play) return;
    this.playing_ = play;
    if (play) {
      const delay =
        Math.max(this.transform_(this.ttyRec.delayMs()) - this.waitedMs_, 0);
      this.timeout_ = setTimeout(() => this.advance(), delay);
    } else {
      // TODO(sdh): set waitedMs
    }
  }

  /**
   * @return {number} The current speed.
   */
  get speed() {
    return this.speed_;
  }

  /**
   * @param {number} speed The new speed.
   */
  set speed(speed) {
    this.speed_ = speed;
    // TODO(sdh): reset the timer, using the current amount waited...
  }
}

/**
 * Represents a TTYRec with a current position.
 */
export default class TtyRec {
  /**
   * @param {!ArrayBuffer} buffer
   */
  constructor(buffer) {
    /** @private @const {!ArrayBuffer} */
    this.buffer_ = buffer;
    /** @private @const {!DataView} */
    this.view_ = new DataView(buffer);
    /**
     * Byte index of current frame.
     * @private {!number}
     */
    this.pos_ = 0;
    /**
     * Frame index of current frame.
     * @private {!number}
     */
    this.frame_ = 0;
    /**
     * Array to convert frame index to byte index.
     * @private @const {!Array<number>}
     */
    this.framePositions_ = [0];
  }

  /**
   * Returns the byte length of the frame at position 'start'.
   * @param {number} start
   * @return {number}
   * @private
   */
  len_(start) {
    if (start >= this.buffer_.byteLength) return 0;
    return this.view_.getUint32(start + 8, true);
  }

  /**
   * Returns the duration of the frame at position 'start', in millis.
   * @param {number} start
   * @return {number}
   */
  timeMs_(start) {
    if (start >= this.buffer_.byteLength) return 0;
    return this.view_.getUint32(start, true) * 1000 +
        this.view_.getUint32(start + 4, true) / 1000;
  }

  /**
   * Returns the data for the given frame.
   * @return {!DataView}
   */
  data() {
    if (this.pos_ >= this.buffer_.byteLength) {
      return new DataView(this.buffer_, 0, 0);
    }
    return new DataView(this.buffer_, this.pos_ + 12, len(this.pos_));
  }

  /**
   * Returns the recorded time of the current position.
   * @return {!Date}
   */
  time() {
    return new Date(this.timeMs_(this.pos_));
  }

  /**
   * Returns the delay (in millis) to wait before showing the next frame.
   * @return {number}
   */
  delayMs() {
    // TODO(sdh): Provide a realtime -> playtime mapping and use that,
    // rather than delays.  Note: this won't work well with concatenation,
    // in which case we'll need to stitch all the times together (possibly
    // with a gap time).  This will cause absolute times to be wrong, but
    // will allow frames to advance without waiting days.  Also, log time
    // isn't feasible, either.
    const next = this.pos_ + 12 + this.len_(this.pos_);
    if (next >= this.view_.byteLength) return 0;
    return Math.max(0, timeMs(next) - timeMs(pos));
  }

  /**
   * Returns the current frame index.
   */
  get frame() {
    return this.frame_;
  }

  /**
   * Sets the frame.
   * @param {frame}
   */
  set frame(frame) {
    while (frame >= this.framePositions_.length) {
      const last = this.framePositions_[this.framePositions_.length - 1];
      this.framePositions_.push(last + 12 + this.len_(last));
    }
    this.frame_ = frame;
    this.pos_ = this.framePositions_[frame];
  }

  /**
   * Advances the frame by one.
   */
  advance() {
    this.pos_ = this.pos_ + 12 + this.len_(this.pos_);
  }
}

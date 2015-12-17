
import Command from './command';
import Reader from './reader';

export default class Frame {
  constructor() {
    /** @private @const {!Array<!Command>} */
    this.commands_ = [];
    /** @private {number} */
    this.startMs_ = 0;
    /** @private {number} */
    this.durationMs_ = 0;
    /** @private {boolean} */
    this.keyframe_ = false;
  }

  /** Parses a TTYRec file into many frames. */
  static *parse(/** !ArrayBuffer */ buf) {
    const reader = new Reader();
    const view = new DataView(buf);
    let /** number */ pos = 0;
    while (pos < buf.byteLength) {
      // Read the frame header
      const startMs = timeMs(view, pos);
      const len = view.getUint32(pos + 8, true);
      const endMs = pos + 12 + len < buf.byteLength
          ? timeMs(view, pos + 12 + len) : Infinity;
      const frame = new Frame();
      frame.startMs_ = startMs;
      frame.durationMs_ = endMs - startMs;
      reader.add(new DataView(buf, pos + 12, len));
      let cmd;
      while ((cmd = Command.parse(reader))) {
        if (cmd.keyframe) frame.keyframe_ = true;
        frame.commands_.push(cmd);
      }
      yield frame;
      pos += 12 + len;
    }
  }

  get startMs() { return this.startMs_; }

  get durationMs() { return this.durationMs_; }
  set durationMs(ms) { this.durationMs_ = ms; }

  get keyframe() { return this.keyframe_; }

  get commands() { return this.commands_; }
}

function /** number */ timeMs(/** !DataView */ view, /** number */ pos) {
  return view.getUint32(pos, true) * 1000
      + view.getUint32(pos + 4, true) / 1000;
}

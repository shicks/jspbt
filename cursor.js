/**
 * The state of the cursor.
 */
export default class Cursor {
  /**
   * @param {number=} row
   * @param {number=} column
   * @param {number=} flags
   */
  constructor(row = 0, column = 0, flags = FG) {
    /** @private {number} Row index. */
    this.row_ = row;
    /** @private {number} Column index. */
    this.column_ = column;
    /** @private {number} Colors, boldness, etc. */
    this.flags_ = flags;
    /** @private {!Array<number>} Stack of saved states. */
    this.stack_ = [];
  }

  /** Saves the cursor onto the stack. */
  save(/** ?Array<number>= */ state = null) {
    if (!state) state = [this.row_, this.column_, this.flags_];
    this.stack_.push(...state);
  }

  /** @return {!Array<number>} The overwritten state (3 elements). */
  restore() {
    const state = [this.flags_, this.column_, this.row_];
    this.flags_ = this.stack_.pop();
    this.column_ = this.stack_.pop();
    this.row_ = this.stack_.pop();
    return state;
  }

  /** @return {!Cursor} */
  clone() {
    const clone = new Cursor(this.row_, this.column_, this.flags_);
    Array.prototype.push.apply(clone.stack_, this.stack_);
    return clone;
  }

  /** @return {number} Row index. */
  get r() {
    return this.row_;
  }
  /** @param {number} row */
  set r(row) {
    this.row_ = Math.max(1, row);
    this.updateCursor(this.row_, this.column_);
  }

  /** @return {number} Column index. */
  get c() {
    return this.column_;
  }
  /** @param {number} column */
  set c(column) {
    this.column_ = Math.max(1, column);
    this.updateCursor(this.row_, this.column_);
  }

  /** @return {number} All flags. */
  get flags() {
    return this.flags_;
  }
  /** @param {number} flags */
  set flags(flags) {
    this.flags_ = flags & 2047;
  }

  /** @return {boolean} Bold state. */
  get b() {
    return !!(this.flags_ & BOLD);
  }
  /** @param {boolean} bold */
  set b(bold) {
    this.flags_ = bold ? this.flags_ | BOLD : this.flags_ & ~BOLD;
  }

  /** @return {boolean} Italic state. */
  get i() {
    return !!(this.flags_ & ITALIC);
  }
  /** @param {boolean} italic */
  set i(italic) {
    this.flags_ = italic ? this.flags_ | ITALIC : this.flags_ & ~ITALIC;
  }

  /** @return {boolean} Underline state. */
  get u() {
    return !!(this.flags_ & UNDERLINE);
  }
  /** @param {boolean} ul */
  set u(ul) {
    this.flags_ = ul ? this.flags_ | UNDERLINE : this.flags_ & ~UNDERLINE;
  }

  /** @return {boolean} Blink state. */
  get bl() {
    return !!(this.flags_ & BLINK);
  }
  /** @param {boolean} blink */
  set bl(blink) {
    this.flags_ = blink ? this.flags_ | BLINK : this.flags_ & ~BLINK;
  }

  /** @return {boolean} Reverse video state. */
  get rev() {
    return !!(this.flags_ & REVERSE);
  }
  /** @param {boolean} reverse */
  set rev(reverse) {
    this.flags_ = reverse ? this.flags_ | REVERSE : this.flags_ & ~REVERSE;
  }

  /** @return {number} Foreground color. */
  get fg() {
    return this.flags_ & FG;
  }
  /** @param {number} color */
  set fg(color) {
    this.flags_ = (this.flags_ & ~FG) | (color & FG);
  }

  /** @return {number} Background color. */
  get bg() {
    return (this.flags_ & BG) >>> 3;
  }
  /** @param {number} color */
  set bg(color) {
    this.flags_ = (this.flags_ & ~BG) | ((color & FG) << 3);
  }

  /** Template method. */
  updateCursor(/** number */ r, /** number */ c) {}
}

const FG = 1 | 2 | 4;
const BG = 8 | 16 | 32;
const BOLD = 64
const ITALIC = 128;
const UNDERLINE = 256;
const BLINK = 512;
const REVERSE = 1024;

/** @const */
Cursor.FG = FG;
/** @const */
Cursor.BG = BG;
/** @const */
Cursor.BOLD = BOLD;
/** @const */
Cursor.ITALIC = ITALIC;
/** @const */
Cursor.UNDERLINE = UNDERLINE;
/** @const */
Cursor.BLINK = BLINK;
/** @const */
Cursor.REVERSE = REVERSE;

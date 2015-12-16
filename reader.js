
/**
 * Reads from one or more DataViews, keeping track of position,
 * and allowing to backtrack once.
 */
export default class Reader {
  constructor() {
    /** @private @const {!Array<!DataView>} */
    this.views_ = []
    /** @private {number} */
    this.index_ = 0;
    /** @private {number} */
    this.pos_ = 0;
    /** @private {number} */
    this.lastPos_ = 0;
    // note: lastIndex_ is always 0
  }

  /** @return {number} The next byte, or -1 if at end. */
  next() {
    const view = this.currentView_();
    return view ? view.getUint8(this.pos_++) : -1;
  }

  /** @return {number} The next byte, or -1 if at end. */
  peek() {
    const view = this.currentView_();
    return view ? view.getUint8(this.pos_) : -1;
  }

  /** @return {string} The next char, or empty if at EOF. */
  nextChar() {
    const cp = this.nextCodepoint();
    return cp < 0 ? '' : String.fromCodePoint(cp);
  }

  /** @return {number} The next codepoint, or -1 if at end. */
  nextCodepoint() {
    let cur = this.next();
    if (cur < 0) return cur;
    let bit = 0x80;
    let width = 0;
    while (cur & bit) {
      cur = cur & ~bit;
      bit >>= 1;
      width++;
    }
    while (width-- > 1) {
      const cont = this.next();
      if (cont < 0) {
        return cont;
      }
      cur = (cur << 6) + (cont & 0x3f);
    }
    return cur;
  }

  /** @return {number} The digits, or -1 if none/eof. */
  readDigits() {
    const isDigit = (x => x >= 0x30 && x <= 0x39);
    let total = null;
    while (isDigit(this.peek())) {
      total = total * 10 + (this.next() - 0x30);
    }
    return total == null ? -1 : total;
  }

  /** @return {!Array<number>} Numbers read. */
  readNumbers() {
    const nums = [];
    for (;;) {
      const d = this.readDigits();
      if (d < 0) {
        // NOTE: we silently elide trailing semicolons, e.g. \e[1;2;H
        if (nums.length) console.log('trailing semicolon');
        return nums;
      }
      nums.push(d);
      if (this.peek() == 0x3b) { // semicolon
        this.next();
      } else {
        return nums;
      }
    }
  }

  /** @private @return {?DataView} */
  currentView_() {
    while (this.index_ < this.views_.length) {
      const view = this.views_[this.index_];
      if (this.pos_ < view.byteLength) {
        return view;
      }
      this.pos_ = 0;
      this.index_++;
    }
    return null;
  }

  /** @return {boolean} */
  eof() {
    return this.currentView_() != null;
  }

  add(/** !DataView */ view) {
    this.views_.push(view);
  }

  /** Saves the current position for backtracking. */
  save() {
    this.lastPos_ = this.pos_;
    if (this.index_ > 0) {
      this.views_.splice(0, this.index_);
      this.index_ = 0;
    }
  }

  /** Backtracks to the last saved position. */
  backtrack() {
    this.pos_ = this.lastPos_;
    this.index_ = 0;
  }
}

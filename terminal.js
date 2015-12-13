/**
 * @typedef {?{r: number, c: number, fg: number, bg: number,
 *             b: boolean, u: boolean, i: boolean, bl: boolean, rev: boolean}}
 */
const State = {};

/**
 * The terminal emulator.
 * TODO(sdh): provide a caching TtyRec wrapper that keeps track of all the \e[2]?
 * TODO(sdh): something to handle htime/cancelling
 * TODO(sdh): clever "previous frame" function for reversing?
 */
export default class Terminal {

  /**
   * @param {!Element} e
   */
  constructor(e) {
    /** @const {!Element} */
    this.element_ = e;
    /** @const {!State} */
    this.pos_ = {
      r: 0,
      c: 0,
      b: false,
      u: false,
      i: false,
      bl: false,
      rev: false,
      fg: 7,
      bg: 0,
    };
  }

  /** @return {number} The maximum number of rows we've ever seen. */
  elementRows_() {
    return this.element_.children.length;
  }

  move_(row, col) {
    // TODO(sdh): how to reverse?
    this.pos_.r = Math.max(0, row);
    this.pos_.c = Math.max(0, col);
  }

  relative_(dRow, dCol) {
    this.move_(this.pos_.r + dRow, this.pos_.c + dCol);
  }

  cursorPosition_(row, col) { this.move_((row || 0) - 1, (col || 0) - 1); }
  cursorUp_(count) { this.relative_(count || 1, 0); }
  cursorUp_(count) { this.relative_(count || 1, 0); }
  cursorDown_(count) { this.relative_(-(count || 1), 0); }
  cursorBackward_(count) { this.relative_(0, -(count || 1)); }
  cursorForward_(count) { this.relative_(0, count || 1); }
  backspace_() { this.cursorBackward_(); this.clear_(); }

  /**
   * Perform an "erase in display", "\e[#J".
   * @param {number} mode The mode parameter.
   * @private
   */
  eraseInDisplay_(mode) {
    if (mode == 1) { // erase from start to cursor
      // TODO(sdh): save the contents for reversing
      for (let i = 0; i < this.pos_.r && i < this.elementRows_(); i++) {
        this.element_.children[i].innerHTML = '';
      }
      const row = this.element_.children[this.pos_.r];
      for (let i = 0; i < this.pos_.c && row && i < row.children.length; i++) {
        this.clear(row.children[i]);
      }
    } else if (mode == 2) { // erase full screen
      // TODO(sdh): save the contents, AND don't bother saving anything
      //            after this for the reverse...
      this.element_.innerHTML = '';
    } else { // mode == 0: erase from cursor to end
      while (this.element_.children.length > this.pos_.r /* + 1 */) {
        this.element_.children[this.pos_.r /* + 1 */].remove();
      }
      const row = this.element_.children[this.pos_.r];
      while (row && row.children.length > this.pos_.c /* + 1 */) {
        row.children[this.pos_.c /* + 1 */].remove();
      }
    }
  }

  /**
   * Perform an "erase in line", "\e[#K".
   * @param {number} mode The mode parameter.
   * @private
   */
  eraseInLine_(mode) {
    const row = this.element_.children[this.pos_.r];
    if (!row) return;
    if (mode == 1) { // erase from start to cursor
      for (let i = 0; i < this.pos_.c && row && i < row.children.length; i++) {
        // TODO(sdh): save the contents
        this.clear(row.children[i]);
      }
    } else if (mode == 2) { // erase full line
      // TODO(sdh): save for later
      row.innerHTML = ''
    } else { // mode == 0: erase from cursor to end
      // TODO(sdh): save
      while (row && row.children.length > this.pos_.c /* + 1 */) {
        row.children[this.pos_.c /* + 1 */].remove();
      }
    }
  }

  /**
   * Sets the attributes.
   * @param {...number} var_args
   * @private
   */
  charAttrs_(var_args) {
    const $ = this.pos_;
    if (arguments.length == 0 || arguments.length == 1 && !arguments[0]) {
      $.b = $.i = $.u = $.bl = $.rev = false;
      $.fg = 7; $.bg = 0;
      return;
    }
    // Otherwise, parse the arguments
    for (let i = 0; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == 1) $.b = true;
      else if (c == 3) $.i = true;
      else if (c == 4) $.u = true;
      else if (c == 5) $.bl = true;
      else if (c == 7) $.rev = true;
      else if (c >= 30 && c <= 37) $.fg = c - 30;
      else if (c >= 40 && c <= 47) $.bg = c - 40;
      else if (c == 38 && arguments[i + 1] == 5) $.fg = arguments[i += 2];
      else if (c == 48 && arguments[i + 1] == 5) $.bg = arguments[i += 2];
      else this.log('Unknown attr: \\e[' + c + 'm');
    }
  }



  /** @param {string} text */
  log(text) {
    // TODO(sdh): show in a div
    console.log(text);
  }
}

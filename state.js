'use strict';

/**
 * Stores the state of the cursor, with bounds checking
 * on the setters.
 */
export default class State {
  /**
   * @param {number=} row
   * @param {number=} column
   * @param {number=} flags
   */
  constructor(row = 0, column = 0, flags = 0) {
    /** @private {number} Row index */
    this.row_ = row;
    /** @private {number} Column index */
    this.column_ = column;
    /** @private {number} Colors, boldness, etc */
    this.flags_ = flags;

    // TODO(sdh): add the element and chars directly here?!?
    this.stack_ = [];
    this.element_ = null;
    this.data_ = [];
  }

  /**
   * Min/max ranges are closed-open, upper bound is optional.
   * @param {number|?Array<number>=} rows Index or [min, max].
   * @param {number|?Array<number>=} cols Index or [min, max].
   * @return {!Array<!Array<string|number|undefined>>} The cleared data.
   */
  clear(rows = null, cols = null) {
    if (rows == null) rows = [0, this.data_.length];
    if (rows instanceof Array) {
      if (cols != null) throw new Error('cols is ignored if rows is array.');
      if (rows.length == 1) rows = [rows[0], this.data_.length];
      const nrows = rows[1] - rows[0];
      const cleared = []; cleared.length = nrows;
      while (this.data_.length < rows[0]) this.data_.push([]);
      const out = this.data_.splice(rows[0], nrows, ...cleared);
      while (out.size < nrows) out.push([]);
      if (this.element_) {
        for (let row of sliceChildren(this.element_, rows[0], nrows, 'div')) {
          resize(row, 0, 'span');
        }
      }
      return out;
    }

    const row = getOrEmpty(this.data_, Number(rows));
    if (cols == null) cols = [0, row.length];
    if (!(cols instanceof Array)) {
      cols = [cols, cols + 1];
    }

    if (cols.length == 1) cols = [cols[0], this.data_.length];
    const ncols = cols[1] - cols[0];
    const cleared = [];
    if (row.length > 2 * cols[1]) cleared.length = 2 * ncols;
    const out = row.splice(2 * cols[0], 2 * ncols, ...cleared);
    out.size = 2 * ncols;
    if (this.element_) {
      const rowElem = sliceChildren(this.element_, row, 1, 'div');
      for (let cell of sliceChildren(rowElem, cols[0], ncols, 'span')) {
        cell.className = '';
        cell.textContent = ' ';
      }
    }
    return out;
  }

  /**
   * If row/column are given, then cursor is not advanced.
   * @param {string|!Array<string|number|undefined>} chars
   * @return {!Array<string|number|undefined>} The overwritten data.
   */
  write(chars, row = null, col = null) {
    if (arguments.length == 1) {
      row = this.r;
      col = this.c;
      this.c += chars.length;
    }
    const rowData = getOrEmpty(this.data_, row);
    let out;
    if (chars instanceof Array) {
      if (rowData.length < 2 * col) rowData.length = 2 * col;
      out = rowData.splice(2 * col, chars.length, ...chars);
      out.length = chars.length;
    } else {
      out = rowData.slice(2 * col, 2 * chars.length);
      out.length = 2 * chars.length; // just in case it's too small
      for (let i = 0; i < chars.length; i++) {
        rowData[2 * (col + i)] = chars[i];
        rowData[2 * (col + i) + 1] = this.flags_;
      }
    }
    if (this.element_) {
      const rowElem = sliceChildren(this.element_, row, 1);
      const cells = sliceChildren(rowElem, col, out.length / 2, 'div');
      for (let i = 0; i < chars.length; i++) {
        setCell(cells[i], rowData[2 * i], rowData[2 * i + 1]);
      }
    }
    return out;
  }

  save(/** ?Array<number>= */ state = null) {
    if (!state) state = [this.row_, this.column_, this.flags_];
    this.stack_.push(...state);
  }
  /** @return {!Array<number>} */
  restore() {
    const state = [this.flags_, this.column_, this.row_];
    this.flags_ = this.stack_.pop();
    this.column_ = this.stack_.pop();
    this.row_ = this.stack_.pop();
    return state;
  }

  detach() {
    this.element_ = null;
  }

  attach(e) {
    this.element_ = e;
    const rowElems = resize(e, this.data_.length, 'div');
    for (let r = 0; r < this.data_.length; r++) {
      const rowElem = rowElems[r];
      const rowData = this.data_[r];
      const cells = resize(e, rowData.length / 2, 'span');
      for (let c = 0; c < cells.length; c++) {
        setCell(cells[c], rowData[2 * c], rowData[2 * c + 1]);
      }      
    }
  }
  

  // TODO(sdh): clone method? diff method that returns a
  // sequence of setters to change the state from A to B?

  /** @return {number} Row index. */
  get r() {
    return this.row_;
  }
  /** @param {number} row */
  set r(row) {
    this.row_ = Math.max(0, row);
  }

  /** @return {number} Column index. */
  get c() {
    return this.column_;
  }
  /** @param {number} column */
  set c(column) {
    this.column_ = Math.max(0, column);
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
}


const FG = 1 | 2 | 4;
const BG = 8 | 16 | 32;
const BOLD = 64
const ITALIC = 128;
const UNDERLINE = 256;
const BLINK = 512;
const REVERSE = 1024;


/** @return {!IArrayLike<!Element>} */
function resize(/** !Element */ elem, /** number */ len, /** string */ tag) {
  while (elem.children.length < len) {
    elem.appendChild(document.createElement(tag));
  }
  while (elem.children.length > len) {
    elem.children[len].remove();
  }
  return elem.children;
}

/** @return {!IArrayLike<!Element>} */
function sliceChildren(/** !Element */ elem,
    /** number */ start, /** number */ count, /** string */ tag) {
  while (elem.children.length < start + count) {
    elem.appendChild(document.createElement(tag));
  }
  return [].slice.call(elem.children, start, count);
}

/** @return {!Array<string|number|undefined>} */
function getOrEmpty(/** !Array<T> */ arr, /** number */ index) {
  while (arr.length <= index) arr.push([]);
  return arr[index];
}

function setCell(/** !Element */ elem, /** string */ txt, /** number */ flags) {
  if (txt.length > 1) txt = txt.substring(0, 1);
  elem.textContent = txt || ' ';
  elem.className = '';
  if (flags & BOLD) elem.classList.add('b');
  if (flags & ITALIC) elem.classList.add('i');
  if (flags & UNDERLINE) elem.classList.add('u');
  if (flags & BLINK) elem.classList.add('bl');
  if (flags & REVERSE) elem.classList.add('rev');
  elem.classList.add('fg' + (flags & FG));
  elem.classList.add('bg' + ((flags >>> 3) & FG));
}

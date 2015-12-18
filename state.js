import Cursor from './cursor';

/**
 * Stores the state of the cursor, with bounds checking
 * on the setters.
 */
export default class State extends Cursor {
  /**
   * @param {number=} row
   * @param {number=} column
   * @param {number=} flags
   */
  constructor(e, row = 0, column = 0, flags = /* Cursor.FG */ 7) {
    super(row, column, flags);

    // TODO(sdh): add the element and chars directly here?!?
    /** @private @const {!Element} */
    this.grid_ = getOrAdd(e, 'grid');
    /** @private @const {!Element} */
    this.cursor_ = getOrAdd(e, 'cursor');
    /** @private @const {!Array<!Array<number>>} */
    this.data_ = [];
    /** @private @const {!Array<!Array<?Element>>} */
    this.rows_ = [];
    /** @private {boolean} */
    this.playing_ = true;
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
      if (rows[1] <= rows[0]) return [];
      const nrows = rows[1] - rows[0];
      const cleared = []; cleared.length = nrows;
      for (let i = 0; i < nrows; i++) cleared[i] = [];
      while (this.data_.length < rows[0]) this.data_.push([]);
      const out = this.data_.splice(rows[0], nrows, ...cleared);
      while (out.size < nrows) out.push([]);
      if (this.playing_) {
        for (let row of this.rows_.slice(rows[0], rows[1])) {
          for (let cell of row) {
            cell.style.display = 'none';
          }
        }
      }
      return out;
    }

    const row = getOrEmpty(this.data_, Number(rows));
    if (cols == null) cols = [0, row.length];
    if (!(cols instanceof Array)) {
      cols = [cols, cols + 1];
    }

    if (cols.length == 1) cols = [cols[0], row.length / 2];
    if (cols[1] <= cols[0]) return [[]];
    const ncols = cols[1] - cols[0];
    const cleared = [];
    if (row.length > 2 * cols[1]) cleared.length = 2 * ncols;
    const out = row.splice(2 * cols[0], 2 * ncols, ...cleared);
    out.size = 2 * ncols;
    if (this.playing_) {
      const cells = this.rows_[rows] || [];
      for (let cell of cells.slice(cols[0], cols[1])) {
        cell.style.display = 'none';
      }
    }
    return [out];
  }

  /**
   * If row/column are given, then cursor is not advanced.
   * @param {string|!Array<string|number|undefined>} chars
   * @param {?number=} row
   * @param {?number=} col
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
    if (rowData.length < 2 * col) rowData.length = 2 * col;
    if (chars instanceof Array) {
      out = rowData.splice(2 * col, chars.length, ...chars);
      out.length = chars.length;
    } else {
      out = rowData.slice(2 * col, 2 * (col + chars.length));
      out.length = 2 * chars.length; // just in case it's too small
      for (let i = 0; i < chars.length; i++) {
        rowData[2 * (col + i)] = chars[i];
        rowData[2 * (col + i) + 1] = this.flags;
      }
    }
    if (this.playing_) {
      const cells = this.cells_(row, col, out.length / 2);
      for (let i = col; i < col + out.length / 2; i++) {
        const cell = cells[i - col];
        setCell(cell, rowData[2 * i], rowData[2 * i + 1]);
      }
    }
    return out;
  }

  pause() {
    this.playing_ = false;
  }

  play() {
    if (this.rows_.length < this.data_.length) {
      this.cells_(this.data_.length - 1, 0, 1);
    }
    for (let r = 0; r < this.rows_.length; r++) {
      const rowData = this.data_[r] || [];
      const row = this.rows_[r];
      if (row.length < rowData.length) {
        this.cells_(r, 0, rowData.length);
      }
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (rowData[2 * c]) {
          setCell(cell, rowData[2 * c], rowData[2 * c + 1]);
        } else {
          cell.style.display = 'none';
        }
      }      
    }
    this.playing_ = true;
  }

  cells_(/** number */ r, /** number */ c, /** number */ n) {
    while (this.rows_.length <= r) {
      const e = document.createElement('div');
      e.style.left = '0';
      e.style.top = (this.rows_.length * 17 + 1) + 'px';
      e.style.display = 'none';
      this.grid_.appendChild(e);
      this.rows_.push([e]);
    }
    const row = this.rows_[r];
    const next = this.rows_.length > r + 1 ? this.rows_[r + 1][0] : null;
    while (row.length < c + n) {
      const e = document.createElement('div');
      e.style.left = (row.length * 8) + 'px';
      e.style.top = (r * 17 + 1) + 'px';
      e.style.display = 'none';
      this.grid_.insertBefore(e, next);
      row.push(e);
    }
    return row.slice(c, c + n);
  }

  // TODO(sdh): clone method? diff method that returns a
  // sequence of setters to change the state from A to B?


  updateCursor(r, c) {
    if (this.cursor_) {
      this.cursor_.style.top = (r * 17 + 1) + 'px';
      this.cursor_.style.left = (c * 8) + 'px';
    }
  }
}


/** @return {!Element} Child div with the given class (possibly added). */
function getOrAdd(/** !Element */ e, /** string */ cls) {
  let child = e.querySelector('.' + cls);
  if (!child) {
    child = document.createElement('div');
    child.classList.add(cls);
    e.appendChild(child);
  }
  return child;
}

/**
 * @return {!Array<T>}
 * @template T
 */
function getOrEmpty(/** !Array<!Array<T>> */ arr, /** number */ index) {
  while (arr.length <= index) arr.push([]);
  return arr[index];
}

function setCell(/** !Element */ elem,
    /** string|number|undefined */ txt, /** string|number|undefined */ flags) {
  elem.style.display = 'block';
  if (txt && txt.length > 1) txt = txt.substring(0, 1);
  elem.textContent = txt ? String(txt) : ' ';
  flags = flags ? Number(flags) : 0;
  elem.className = '';
  if (flags & Cursor.BOLD) elem.classList.add('b');
  if (flags & Cursor.ITALIC) elem.classList.add('i');
  if (flags & Cursor.UNDERLINE) elem.classList.add('u');
  if (flags & Cursor.BLINK) elem.classList.add('bl');
  if (flags & Cursor.REVERSE) elem.classList.add('rev');
  elem.classList.add('fg' + (flags & Cursor.FG));
  elem.classList.add('bg' + ((flags >>> 3) & Cursor.FG));
}

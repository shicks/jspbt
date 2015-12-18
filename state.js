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
  constructor(row = 0, column = 0, flags = /* Cursor.FG */ 7) {
    super(row, column, flags);

    // TODO(sdh): add the element and chars directly here?!?
    /** @private {?Element} */
    this.grid_ = null;
    /** @private {?Element} */
    this.cursor_ = null;
    /** @private @const {!Array<!Array<number>>} */
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
      if (rows[1] <= rows[0]) return [];
      const nrows = rows[1] - rows[0];
      const cleared = []; cleared.length = nrows;
      for (let i = 0; i < nrows; i++) cleared[i] = [];
      while (this.data_.length < rows[0]) this.data_.push([]);
      const out = this.data_.splice(rows[0], nrows, ...cleared);
      while (out.size < nrows) out.push([]);
      if (this.grid_) {
        for (let row of sliceChildren(this.grid_, rows[0], rows[1], 'div')) {
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

    if (cols.length == 1) cols = [cols[0], row.length / 2];
    if (cols[1] <= cols[0]) return [[]];
    const ncols = cols[1] - cols[0];
    const cleared = [];
    if (row.length > 2 * cols[1]) cleared.length = 2 * ncols;
    const out = row.splice(2 * cols[0], 2 * ncols, ...cleared);
    out.size = 2 * ncols;
    if (this.grid_) {
      const rowElem =
          sliceChildren(this.grid_, rows, rows + 1, 'div')[0];
      for (let cell of sliceChildren(rowElem, cols[0], cols[1], 'span')) {
        cell.className = '';
        cell.textContent = ' ';
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
    if (this.grid_) {
      const rowElem = sliceChildren(this.grid_, row, row + 1, 'div')[0];
      const cells = sliceChildren(rowElem, col, col + out.length / 2, 'span');
      for (let i = col; i < col + out.length / 2; i++) {
        setCell(cells[i - col], rowData[2 * i], rowData[2 * i + 1]);
      }
    }
    return out;
  }

  detach() {
    this.grid_ = null;
    this.cursor_ = null;
  }

  attach(/** !Element */ e) {
    this.grid_ = getOrAdd(e, 'grid');
    this.cursor_ = getOrAdd(e, 'cursor');
    const rowElems = resize(this.grid_, this.data_.length, 'div');
    for (let r = 0; r < this.data_.length; r++) {
      const rowElem = rowElems[r];
      const rowData = this.data_[r];
      const cells = resize(rowElem, rowData.length / 2, 'span');
      for (let c = 0; c < cells.length; c++) {
        setCell(cells[c], rowData[2 * c], rowData[2 * c + 1]);
      }      
    }
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

/** @return {!Array<!Element>} */
function sliceChildren(/** !Element */ elem,
    /** number */ start, /** number */ end, /** string */ tag) {
  while (elem.children.length < end) {
    elem.appendChild(document.createElement(tag));
  }
  return [].slice.call(elem.children, start, end);
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

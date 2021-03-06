
import State from 'state';
import Reader from 'reader';

export default class Command {
  /** @return {string} */
  get ansi() { throw new AbstractMethod(); }

  apply(/** !State */ state) { throw new AbstractMethod(); }

  // NOTE: commands store their own undo information, and undo is only
  // guaranteed to work *after* a command has been successfully applied
  // at least once.

  undo(/** !State */ state) { throw new AbstractMethod(); }

  /** @return {boolean} */
  get keyframe() { return false; }

  /** @return {string} */
  get text() { return ''; }

  /** @return {?Command} */
  static parse(/** !Reader */ reader) {
    const chars = [];
    for (;;) {
      reader.save();
      const c = reader.nextCodepoint();
      if (c >= 0x20) { // batch printable chars
        chars.push(String.fromCharCode(c));
      } else if (c < 0 || chars.length) { // incomplete unicode
        reader.backtrack();
        return chars.length ? new Characters(chars.join('')) : null;
      } else if (c == 0x1b) { // esc
        const esc = reader.nextCodepoint();
        if (esc == 0x5b) { // '['
          return BracketPrefix.parse(reader);
        } else if (esc == 0x37) { // '7'
          return new SaveCursor();
        } else if (esc == 0x38) {
          return new RestoreCursor();
        } else if (esc < 0) {
          reader.backtrack();
          return null;
        } else {
          console.log('Bad escape: 0x1b 0x' + esc.toString(16));
          reader.backtrack();
          reader.next(); // ignore the escape so that we can make progress
          return new UnknownCommand('\x1b', '\\e\\x' + esc.toString(16));
        }
      } else if (c == 0x0a) {
        return new LineFeed();
      } else if (c == 0x0d) {
        return new CarriageReturn();
      } else if (c == 0x08) {
        return new Backspace();
      } else {
        // TODO(sdh): 0x7f -> Delete?
        console.log('Unknown non-printing char: ' + c);
        return new UnknownCommand(
            String.fromCharCode(c), '\\x' + c.toString(16));
      }
    }
  }
}



class IgnoredCommand extends Command {
  constructor(/** string */ ansi) {
    super();
    this.ansi_ = ansi;
  }
  get ansi() { return this.ansi_; }
  apply(s) {}
  undo(s) {}
  toString() {
    return 'IgnoredCommand{' + this.ansi_.replace('\x1b', '\\e') + '}';
  }
}


class UnknownCommand extends IgnoredCommand {
  constructor(/** string */ ansi, /** string */ message) {
    super(ansi);
    console.log(message);
  }
  toString() { return super.toString().replace('Ignored', 'Unknown'); }
}


class Characters extends Command {
  constructor(/** string */ chars) {
    super();
    /** @private @const {string} */
    this.chars_ = chars;
    /** @private {!Array<number|string|undefined>} */
    this.undo_ = [];
  }
  get ansi() { return this.chars_; }
  get text() { return this.chars_; }
  apply(s) {
    this.undo_ = s.write(this.chars_);
  }
  undo(s) {
    s.c -= this.chars_.length;
    s.write(this.undo_, s.r, s.c);
  }    
  toString() { return 'Characters{' + this.chars_ + '}'; }
}


class BracketPrefix extends Command {
  /** @override */
  get ansi() {
    // TODO(sdh): consider normalizing all params to u16?
    return '\x1b[' + this.params().join(';') + this.suffix();
  }

  /** @protected @return {!Array<number>} */
  params() { return []; }

  /** @protected @return {string} */
  suffix() { throw new AbstractMethod(); }


  static parse(reader) {
    // Read all the numeric arguments
    const nums = reader.readNumbers();
    const cmd = reader.nextChar();
    if (!cmd) {
      reader.backtrack();
      return null;
    }
    if (cmd == '?') { // weird mode setter: \e[?1049h or \e[?1049l
      const mode = reader.readNumbers();
      const setReset = reader.nextChar();
      const ansi = '\e[' + nums.join(';') + '?' + mode.join(';') + setReset;
      if (setReset == 'h' || setReset == 'l') {
        return new IgnoredCommand(ansi);
      } else {
        return new UnknownCommand(ansi, 'Expected h or l after \\e[?#');
      }
    } else if (cmd == 'H' || cmd == 'f') {
      return new CursorPosition(nums[0] || 0, nums[1] || 0);
    } else if (cmd == 'A') {
      return new CursorUp(nums[0] || 1);
    } else if (cmd == 'B') {
      return new CursorDown(nums[0] || 1);
    } else if (cmd == 'C') {
      return new CursorForward(nums[0] || 1);
    } else if (cmd == 'D') {
      return new CursorBackward(nums[0] || 1);
    } else if (cmd == 'J') {
      return nums[0] == 2 ? new EraseDisplayFull() :
          nums[0] == 1 ? new EraseDisplayStart() : new EraseDisplayEnd();
    } else if (cmd == 'K') {
      return nums[0] == 2 ? new EraseInLineFull() :
          nums[0] == 1 ? new EraseInLineStart() : new EraseInLineEnd();
    } else if (cmd == 'm') {
      return new CharAttrs(nums);
    } else {
      return new UnknownCommand('\e[' + nums.join(';') + cmd, 'unknown');
    }
  }
}


class CursorPosition extends BracketPrefix {
  constructor(/** number */ r, /** number */ c) {
    this.r_ = u16(r);
    this.c_ = u16(c);
    this.undo_ = null;
  }

  /** @override */ params() { return [this.r_, this.c_]; }
  /** @override */ suffix() { return 'H'; }

  /** @override */
  apply(s) {
    this.undo_ = [s.r, s.c];
    s.r = this.r_;
    s.c = this.c_;
  }

  /** @override */
  undo(s) {
    s.r = this.undo_[0];
    s.c = this.undo_[1];
  }

  toString() { return 'CursorPosition{' + this.r_ + ', ' + this.c_ + '}'; }
}

class LineFeed extends Command {
  constructor() { super(); }
  get ansi() { return '\n'; } // 0x0a
  apply(s) { s.r++; }
  undo(s) { s.r--; }
  toString() { return 'LineFeed'; }
}

class CarriageReturn extends Command {
  constructor() { super(); /** @private {number} */ this.undo_ = 0; }
  get ansi() { return '\r'; } // 0x0d
  apply(s) { this.undo_ = s.c; s.c = 0; }
  undo(s) { s.c = this.undo_; }
  toString() { return 'CarriageReturn'; }
}

class Backspace extends Command {
  constructor() { super(); }
  get ansi() { return '\x08'; }
  apply(s) { s.c--; }
  undo(s) { s.c++; }
  toString() { return 'Backspace'; }
}

class CursorRelative extends BracketPrefix {
  constructor(/** number */ count) {
    super();
    this.count_ = u16(count);
  }
  get count() { return this.count_; }
  params() { return this.count_ != 1 ? [this.count_] : []; }
  apply(s) { this.applyInternal(s, this.count_); }
  undo(s) { this.applyInternal(s, -this.count_); }

  /** @protected */
  applyInternal(/** !State */ s, /** number */ count) {
    throw new AbstractMethod();
  }
}

class CursorUp extends CursorRelative {
  constructor(/** number */ count) { super(count); }
  suffix() { return 'A'; }
  applyInternal(s, count) { s.r -= count; }
  toString() { return 'CursorUp{' + this.count + '}'; }
}

class CursorDown extends CursorRelative {
  constructor(/** number */ count) { super(count); }
  suffix() { return 'B'; }
  applyInternal(s, count) { s.r += count; }
  toString() { return 'CursorDown{' + this.count + '}'; }
}

class CursorBackward extends CursorRelative {
  constructor(/** number */ count) { super(count); }
  suffix() { return 'C'; }
  applyInternal(s, count) { s.c -= count; }
  toString() { return 'CursorBackward{' + this.count + '}'; }
}

class CursorForward extends CursorRelative {
  constructor(/** number */ count) { super(count); }
  suffix() { return 'D'; }
  applyInternal(s, count) { s.c += count; }
  toString() { return 'CursorForward{' + this.count + '}'; }
}


class CharAttrs extends BracketPrefix {
  constructor(/** !Array<number> */ args) {
    super();
    this.args_ = args.map(u16);
    let set = 0;
    let clear = 0xffff;
    function color(type, color) {
      if (type == State.BG) color <<= 3;
      set |= color;
      clear &= ~type;
    }
    for (let i = 0; i < args.length; i++) {
      const c = this.args_[i];
      if (c == 1) set |= State.BOLD;
      else if (c == 3) set |= State.ITALIC;
      else if (c == 4) set |= State.UNDERLINE;
      else if (c == 5) set |= State.BLINK;
      else if (c == 7) set |= State.REVERSE;
      else if (c >= 30 && c <= 37) color(State.FG, c - 30);
      else if (c >= 40 && c <= 47) color(State.BG, c - 40);
      else if (c == 38 && this.args_[i + 1] == 5) color(State.FG, this.args_[i += 2]);
      else if (c == 48 && this.args_[i + 1] == 5) color(State.BG, this.args_[i += 2]);
      // TODO(sdh): else log unknown CharAttr: `\\e[${c}m`
    }
    /** @private @const {number} OR in the high 16 bits, AND in the low 16. */
    this.mask_ = set ? set << 16 | clear : State.FG << 16;
    /** @private {number} */
    this.undo_ = 0;
  }
  params() { return this.args_; }
  apply(s) {
    this.undo_ = s.flags;
    s.flags = (s.flags & this.mask_) | (this.mask_ >>> 16);
  }
  undo(s) { s.flags = this.undo_; }
  toString() { return 'CharsAttr{' + this.args_.join(';') + ' => 0x' + this.mask_.toString(16) + '}'; }
}


class SaveCursor extends Command {
  constructor() { super(); }
  get ansi() { return '\x1b7'; }
  apply(s) { s.save(); }
  undo(s) { s.restore(); } // TODO(sdh): or just pop?
  toString() { return 'SaveCursor'; }
}


class RestoreCursor extends Command {
  constructor() {
    super();
    /** @private {!Array<number>} */
    this.undo_ = [];
  }
  get ansi() { return '\x1b8'; }
  apply(s) { this.undo_ = s.restore(); }
  undo(s) { s.save(this.undo_); }
  toString() { return 'RestoreCursor'; }
}


class Delete extends Command {
  constructor() {
    super();
    /** @private {!Array<string|number>} */
    this.undo_ = [];
  }
  get ansi() { return '\x7f'; }
  apply(s) {
    s.c--;
    this.undo_ = s.clear(s.r, s.c)[0];
  }
  undo(s) {
    s.write(this.undo_);
  }
  toString() { return 'Delete'; }
}


class EraseDisplay extends BracketPrefix {
  constructor() {
    super();
    /** @protected {!Array<!Array<string|number>>} */
    this.erased = [];
  }
  suffix() { return 'J'; }
}


class EraseDisplayFull extends EraseDisplay {
  constructor() { super(); }
  params() { return [2]; }
  apply(s) {
    this.erased = s.clear();
  }
  undo(s) {
    s.clear();
    for (let r = 0; r < this.erased.length; r++) {
      s.write(this.erased[r], r, 0);
    }
  }
  get keyframe() { return true; }
  toString() { return 'EraseDisplayFull'; }
}


class EraseDisplayStart extends EraseDisplay {
  constructor() { super(); }
  params() { return [1]; }
  apply(s) {
    this.erased = s.clear([0, s.r]);
    this.erased.push(s.clear(s.r, [0, s.c])[0]);
  }
  undo(s) {
    s.clear([0, s.r])
    for (let r = 0; r < this.erased.length; r++) {
      s.write(this.erased[r], r, 0);
    }
  }
  toString() { return 'EraseDisplayStart'; }
}


class EraseDisplayEnd extends EraseDisplay {
  constructor() { super(); }
  params() { return [0]; }
  apply(s) {
    this.erased = s.clear(s.r, [s.c])
    this.erased.push(...s.clear([s.r]));
  }
  undo(s) {
    s.clear([s.r + 1]);
    s.clear(s.r, [s.c]);
    for (let i = 0; i < this.erased.length; i++) {
      s.write(this.erased[i], s.r + i, i ? 0 : s.c);
    }
  }
  toString() { return 'EraseDisplayEnd'; }
}


class EraseInLine extends BracketPrefix {
  constructor() {
    super();
    /** @protected {!Array<string|number>} */
    this.erased = [];
  }
  suffix() { return 'K'; }
}


class EraseInLineFull extends EraseInLine {
  constructor() { super(); }
  params() { return [2]; }
  apply(s) { this.erased = s.clear(s.r)[0]; }
  undo(s) {
    s.clear(s.r);
    s.write(this.erased, s.r, 0);
  }
  toString() { return 'EraseInLineFull'; }
}


class EraseInLineStart extends EraseInLine {
  constructor() { super(); }
  params() { return [1]; }
  apply(s) { this.erased = s.clear(s.r, [0, s.c])[0]; }
  undo(s) { s.write(this.erased, s.r, 0); }
  toString() { return 'EraseInLineStart'; }
}


class EraseInLineEnd extends EraseInLine {
  constructor() { super(); }
  params() { return [0]; }
  apply(s) {
    this.erased = s.clear(s.r, [s.c])[0];
  }
  undo(s) {
    s.clear(s.r, [s.c]);
    s.write(this.erased, s.r, s.c);
  }
  toString() { return 'EraseInLineEnd'; }
}


/** @return {number} */
function u16(/** number */ x) {
  x = x >>> 0;
  if (x < 0) return 0;
  if (x > 65535) return 65535;
  return x;
}

class AbstractMethod extends Error {
  constructor(/** string= */ message = 'Method is abstract') {
    super(message);
  }
}

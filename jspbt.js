(function() {

// TODO(sdh): bz2 support: https://github.com/antimatter15/bzip2.js

/**
 * @typedef {{
 *   data: function(): DataView,
 *   time: function(): Date,
 *   delayMs: function(): number,
 *   frame: function(): number,
 *   setFrame: function(number),
 *   advance: function()
 * }}
 */
var TtyRec;

/**
 * @typedef {{
 *   write: function(DataView)
 * }}
 */
var Terminal;

/**
 * @typedef {{
 *   play: function(boolean),    // toggles play/pause
 *   speed: function(): number,  // returns the speed
 *   setSpeed: function(number),
 *   advance: function(number),  // advances a number of frames
 *   onframe: function()         // called on each frame
 * }}
 */
var Player;   

/**
 * @typedef {{
 *   r: number, c: number,       // row/column
 *   b: boolean, u: boolean, i: boolean, bl: boolean, rev: boolean,
 *   fg: number, bg: number
 * }}
 */
var TerminalState;

/**
 * @typedef {{
 *   r: number, c: number,
 *   cs: !Array<!Command>,
 *   lastCommand: (function(): ?Command),
 * }}
 */
var ReverseState;


/**
 * Models a TTYREC file.
 * @param {!ArrayBuffer} buffer
 * @return {!TtyRec}
 */
function ttyRec(arrayBuffer) {
  var view = new DataView(arrayBuffer);
  var pos = 0;
  var frame = 0;
  var framePositions = [0];

  function len(start) {
    if (start >= arrayBuffer.byteLength) return 0;
    return view.getUint32(start + 8, true);
  }

  function timeMs(start) {
    if (start >= arrayBuffer.byteLength) return 0;
    return view.getUint32(start, true) * 1000 +
        view.getUint32(start + 4, true) / 1000;
  }

  return {
    data: function() {
      if (pos >= arrayBuffer.byteLength) return new DataView(arrayBuffer, 0, 0);
      return new DataView(arrayBuffer, pos + 12, len(pos));
    },
    time: function() {
      return new Date(timeMs(pos));
    },
    delayMs: function() {
      var next = pos + 12 + len(pos);
      if (next >= view.byteLength) return 0;
      return Math.max(0, timeMs(next) - timeMs(pos));
    },
    frame: function() {
      return frame;
    },
    setFrame: function(frame) {
      while (frame >= framePositions.length) {
        var last = framePositions[framePositions.length - 1];
        framePositions.push(last + 12 + len(last));
      }
      pos = framePositions[frame];
    },
    advance: function() {
      pos = pos + 12 + len(pos);
    }
  };
}


/**
 * The TTYREC player.  Handles timing/play/pause, as well as rewind.
 * @param {!TtyRec} ttyRec
 * @param {!Terminal} terminal
 * @return {!Player}
 */
function player(ttyRec, terminal) {
  var speed = 1;
  var playing = false;
  var timeout = null;
  var waitedMs = 0;
  var nextFrameMs = 0;

  function transform(delay) {
    // TODO(sdh): more natural cap for delay?
    delay /= speed;
    if (delay > 2000) delay = 2000;
    return delay;
  }

  function advance(frames) {
    if (frames == null) frames = 1;
    if (timeout) clearTimeout(timeout);
    timeout = null;
    if (frames < 0) return; // TODO(sdh): support backtracking
    player.onframe();
    while (frames--) ttyRec.advance();
    terminal.write(ttyRec.data());
    waitedMs = 0;
    if (playing) {
      var delay = transform(ttyRec.delayMs());
      nextFrameMs = +new Date() + delay;
      timeout = setTimeout(advance, delay);
    }
  }

  var player = {
    play: function(play) {
      if (playing == play) return;
      playing = play;
      if (playing) {
        var delay = Math.max(transform(ttyRec.delayMs()) - waitedMs, 0);
        timeout = setTimeout(advance, delay);
      } else {
        // TODO(sdh): set waitedMs
      }
    },
    advance: advance,
    speed: function() { return speed; },
    setSpeed: function(newSpeed) {
      speed = newSpeed;
      // TODO(sdh): reset the timer, using the current amount waited...
    },
    onframe: function() {}
  };

  return player;
}



// need to get both char AND style...
function charAt_(el, $) {
  if (!el) return '';
  if (!el.children[$.r]) return '';
  if (!el.children[$.r][$.c]) return '';
  return el.children[$.r][$.c].textContent;
}

function clear_(el) {
  if (!el) {
    var row = e.children[$.r];
    if (!row) return;
    el = row.children[$.c];
    if (!el) return;
  }
  el.textContent = ' ';
  el.className = '';
}


// TODO(sdh): caching ttyRec wrapper that keeps track of all the \e[2J it sees
// Provides a "previous frame" function that redraws cleverly...?

// TODO(sdh): something to handle timer/cancelling

/** Represents a command. */
class Command {
  /** @param {string} ansi The bytes that represent this command. */
  constructor(ansi) { this.ansi = ansi; }

  /**
   * Applies the command to the state and element.
   * @param {!TerminalState} state
   * @param {!Element} element
   * @param {!Object} reverse TODO(sdh): figure out the fields
   */
  apply(state, element, reverse) { throw new AbstractMethod(); }

  /**
   * Parses a command from the data, returning it and updating the
   * index in the array.
   * @param {{d: !DataView, i: number}} buffer
   * @return {?Command}
   */
  static parse(buffer) {
    // TODO(sdh): delegate to other parse methods...
  }
}

/** Abstract command prefixed by \e[. */
Command.BracketPrefix = class extends Command {
  /**
   * @param {!Array<number>} numbers
   * @param {string} suffix
   */
  constructor(numbers, suffix) { super('\e[' + numbers.join(';') + suffix); }
};

/** Abstract base class for all move commands. */
Command.Move = class extends Command.BracketPrefix {
  /**
   * @param {!Array<number>} numbers
   * @param {string} suffix
   */
  constructor(numbers, suffix) { super(numbers, suffix); }
};

/** Sets an absolute cursor position, \e[<row>;<col>H.  Also f. */
Command.CursorPosition = class extends Command.Move {
  /**
   * @param {number} row
   * @param {number} col
   */
  constructor(row, col) {
    super([row, col], 'H');
    this.row = row;
    this.col = col;
  }

  /** @override */
  apply($, _, $$) {
    // Save the previous state.
    $$.r = $.r; $$.c = $.c;
    if ($$.lastCommand() instanceof Command.Move) $$.cs.pop();
    $$.cs.push(new Command.CursorPosition($.r, $.c));

    // And then actually move the cursor.
    $.r = Math.max(0, this.row);
    $.c = Math.max(0, this.col);
  }
};

/** Abstract, sets a relative cursor position. */
Command.MoveRelative = class extends Command.Move {
  constructor(count, suffix, dr, dc) {
    super(count != 1 ? [count] : [], suffix);
    this.count = count;
    this.dr = dr;
    this.dc = dc;
  }

  /** @override */
  apply($, _, $$) {
    // Save the previous state.
    $$.r -= this.dr; $$.c -= this.dc;
    if ($$.lastCommand() instanceof Command.Move) {
      $$.cs[$$.cs.length - 1] = new Command.CursorPosition($.r, $.c);
    } else {
      $$.cs.push(this.inverse());
    }

    // Actually move the cursor.
    $.r = Math.max(0, $.r + this.dr);
    $.c = Math.max(0, $.c + this.dc);
  }

  /** @return {!Command.MoveRelative} The inverse command. */
  inverse() { throw new AbstractMethod(); }
};

/** Moves the cursor up a specified number of rows. */
Command.CursorUp = class extends Command.CursorRelative {
  /** @param {number} count */
  constructor(count) { super(count, 'A', -count, 0); }
  /** @override */
  inverse() { return new Command.CursorDown(this.count); }
};

/** Moves the cursor down a specified number of rows. */
Command.CursorDown = class extends Command.CursorRelative {
  /** @param {number} count */
  constructor(count) { super(count, 'B', count, 0); }
  /** @override */
  inverse() { return new Command.CursorUp(this.count); }
};

/** Moves the cursor right a specified number of columns. */
Command.CursorForward = class extends Command.CursorRelative {
  /** @param {number} count */
  constructor(count) { super(count, 'C', 0, count); }
  /** @override */
  inverse() { return new Command.CursorBackward(this.count); }
};

/** Moves the cursor left a specified number of columns. */
Command.CursorBackward = class extends Command.CursorRelative {
  /** @param {number} count */
  constructor(count) { super(count, 'D', 0, -count); }
  /** @override */
  inverse() { return new Command.CursorForward(this.count); }
};

/** A backspace: moves the cursor left one column and clears it. */
Command.Backspace = class extends Command {
  constructor() { super('\007'); }
  /** @override */
  apply($, e, $$) {
    // Reverse by either printing the deleted character, or else
    // moving forward if there was nothing to delete.
    $$.c += 1;
    

    $.c -= 1;
    
  }
}


/**
 * Models the terminal.
 * @param {!Element} e
 * @return {!Terminal}
 */
function terminalEmulator(e) {

  // cursor position
  var $ = {
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

  var reverse = {
    r: 0,
    c: 0,
    bits: [],
  };

  function move(row, col) {
    reverse.r = $.r;
    reverse.c = $.c;
    if (/^\e\[[0-9;]+H$/.test(reverse.bits[reverse.bits.length - 1])) {
      reverse.bits.pop();
    }
    //reverse.bits.push(
    $.r = Math.max(0, row);
    $.c = Math.max(0, col);
    // TODO(sdh): Update the blinking cursor?
  }

  function cursorPosition(row, col) { move((row || 0) - 1, (col || 0) - 1); }
  function cursorUp(count) { move($.r - (count || 1), $.c); }
  function cursorDown(count) { move($.r + (count || 1), $.c); }
  function cursorBackward(count) { move($.r, $.c - (count || 1)); }
  function cursorForward(count) { move($.r, $.c + (count || 1)); }
  function backspace() { cursorBackward(); clear(); }

  function eraseInDisplay(mode) {
    switch (mode) {
    case 1:
      // erase from start to cursor
      for (var i = 0; i < $.r && i < e.children.length; i++) {
        e.children[i].innerHTML = '';
      }
      var row = e.children[$.r];
      for (i = 0; i < $.c && row && i < row.children.length; i++) {
        clear(row.children[i]);
      }
      break;
    case 2:
      // erase full screen
      e.innerHTML = '';
      break;
    default: // 0
      // erase from cursor to end of screen
      while (e.children.length > $.r /* + 1 */) {
        e.children[$.r /* + 1 */].remove();
      }
      var row = e.children[$.r];
      while (row && row.children.length > $.c /* + 1 */) {
        row.children[$.c /* + 1 */].remove();
      }
    }
  }

  function eraseInLine(mode) {
    var row = e.children[$.r];
    if (!row) return;
    switch (mode) {
    case 1:
      // erase from start to cursor
      for (var i = 0; i < $.c && row && i < row.children.length; i++) {
        clear(row.children[i]);
      }
      break;
    case 2:
      // erase full screen
      row.innerHTML = '';
      break;
    default: // 0
      // erase from cursor to end of screen
      while (row && row.children.length > $.c /* + 1 */) {
        row.children[$.c /* + 1 */].remove();
      }
    }
  }

  function charAttrs(var_args) {
    if (arguments.length == 0 || arguments.length == 1 && !arguments[0]) {
      $.b = $.i = $.u = $.bl = $.rev = false;
      $.fg = 7; $.bg = 0;
      return;
    }
    // parse arguments...
    //window.console.log('\\e[' + [].join.call(arguments, ';') + 'm');
    for (var i = 0; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == 1) $.b = true;
      else if (c == 3) $.i = true;
      else if (c == 4) $.u = true;
      else if (c == 5) $.bl = true;
      else if (c == 7) $.rev = true;
      else if (c >= 30 && c <= 37) $.fg = c - 30;
      else if (c >= 40 && c <= 47) $.bg = c - 40;
      else if (c == 38 && arguments[i + 1] == 5) $.fg = arguments[i += 2];
      else if (c == 48 && arguments[i + 1] == 5) $.bg = arguments[i += 2];
      else log('Unknown attr: \\e[' + c + 'm');
    }
  }

  var brk = {
    'H': cursorPosition,
    'A': cursorUp,
    'B': cursorDown,
    'C': cursorForward,
    'D': cursorBackward,
    'f': cursorPosition, // Force Cursor Position
    'J': eraseInDisplay,
    'K': eraseInLine,
    'm': charAttrs
  };

  function bracketEscape(view, i) {
    var any = false;
    var nums = [];
    var cur = 0;
    while (i < view.byteLength) {
      var cc = view.getUint8(++i);
      if (cc < 0x30 || cc > 0x3b || cc == 0x3a) { // 3a=:, 3b=;
        break;
      }
      any = true;
      if (cc == 0x3b) {
        nums.push(cur); cur = 0;
      } else {
        cur = 10 * cur + (cc - 0x30);
      }
    }
    if (any) nums.push(cur);
    var cmd = String.fromCharCode(view.getUint8(i));
    if (!brk[cmd]) {
      window.console.log('Unknown bracket escape: ' + cmd);
      log('Unknown bracket escape: ' + cmd);
    } else {
      brk[cmd].apply(null, nums);
    }
    return i;
  }

  var cursorStack = [];
  function saveCursor(data, i) {
    var state = {};
    for (key in $) { if ($.hasOwnProperty(key)) state[key] = $[key]; }
    cursorStack.push(state);
    return i;
  }
  function restoreCursor(data, i) {
    $ = cursorStack.pop();
    return i;
  }

  var esc = {
    '[': bracketEscape,
    '8': restoreCursor,
    '7': saveCursor
  };

  function clear(el) {
    if (!el) {
      var row = e.children[$.r];
      if (!row) return;
      el = row.children[$.c];
      if (!el) return;
    }
    el.textContent = ' ';
    el.className = '';
  }
  
  function emitChars(codes) {
    chars = String.fromCharCode.apply(null, codes);
    while (e.children.length <= $.r) {
      var row = document.createElement('div');
      row.innerHTML = '<span> </span>';
      e.appendChild(row);
    }
    row = e.children[$.r];
    
    while (row.children.length <= $.c + chars.length) {
      var col = document.createElement('span');
      clear(col);
      row.appendChild(col);
    }
    for (var i = 0; i < chars.length; i++) {
      var cell = row.children[$.c + i];
      cell.textContent = chars[i];
      cell.className = '';
      if ($.b) cell.classList.add('b');
      if ($.i) cell.classList.add('i');
      if ($.u) cell.classList.add('u');
      if ($.bl) cell.classList.add('bl');
      if ($.rev) cell.classList.add('rev');
      cell.classList.add('fg' + $.fg);
      cell.classList.add('bg' + $.bg);
    }
    $.c += chars.length;
  }

  function hexDump(data) {
    for (var j = 0; j < data.byteLength; j += 16) {
      var line = ''; var line2 = '';
      for (var k = j; k < j + 16 && k < data.byteLength; k++) {
        var ch = data.getUint8(k);
        line += ' ' + (ch < 16 ? '0' : '') + ch.toString(16);
        if (k == j + 8) line += ' ';
        line2 += (ch == 0x1b ? '\u2666' : ch == 0x08 ? '\u219c' :
                  ch == 0x0d || ch == 0x0a ? '\u2665' :
                  ch < 0x20 ? '\ufffd' :
                  ch < 0x7f ? String.fromCharCode(ch) : '\u2650');
      }
      while (line.length < 50) line = line + ' ';
      log(line + ' |' + line2);
    }
  }

  return {
    /** @param {DataView} data */
    write: function(data) {
      //hexDump(data); // Log the packet
      var i = 0;
      var chars = [];
      while (i < data.byteLength) {
        var cur = data.getUint8(i);
        var width = 0;
        var bit = 0x80;
        while (cur & bit) {
          cur = cur & ~bit;
          bit >>= 1;
          width++;          
        }
        while (width-- > 1) {
          var cont = data.getUint8(++i);
          cur = (cur << 6) + (cont & 0x3f);
        }
        if (cur == 0x1b) {
          emitChars(chars);
          var cmd = String.fromCharCode(data.getUint8(++i));
          if (!esc[cmd]) {
            window.console.log('Unknown escape: ' + cmd);
            log('Unknown escape: ' + cmd);
          } else {
            i = esc[cmd](data, i);
          }
          chars = [];
        } else if (cur == 0x0a) {
          emitChars(chars);
          $.r++;
          chars = [];
        } else if (cur == 0x0d) {
          emitChars(chars);
          $.c = 0;
          chars = [];
          // TODO(sdh): scroll?
        } else if (cur == 0x08) {
          emitChars(chars);
          cursorBackward();
          chars = [];
        } else if (cur < 0x20) {
          log('Unknown non-printing char: ' + cur + ' at ' + i);
        } else {
          chars.push(cur);
        }
        i++;
      }
      emitChars(chars);
    }
  };
};

// Basic UI

function updateFiles(e) {
  /** @type {FileList} */
  var files = e.target.files;
  var output = document.getElementById('selected');
  output.innerHTML = '<ul></ul>';
  for (var i = 0, f; f = files[i]; i++) {
    var name = document.createElement('strong');
    name.textContent = f.name;
    var info = document.createElement('span');
    info.textContent = [
      ' (', f.type || 'n/a', ') - ',
      f.size, ' bytes, last modified: ',
      f.lastModifiedDate ? f.lastModifiedDate.toLocaleDateString() : 'n/a'].
          join('');
    var item = document.createElement('li');
    item.appendChild(name);
    item.appendChild(info);
    output.firstChild.appendChild(item);
  }
}

function readLocalFiles() {
  var files = document.getElementById('files').files;
  var reader = new FileReader();
  document.getElementById('selected').remove(); // TODO(sdh): less violent
  reader.onload = function(e) { loadTtyRec(e.target.result); };
  reader.readAsArrayBuffer(files[0]);
}

document.getElementById('files').addEventListener('change', updateFiles);
document.getElementById('fetch').addEventListener('click', readLocalFiles);

// TODO(sdh): currently broken due to XSS protections - need a relay
function fetchUrl(url) {
  var xhr = new XMLHttpRequest();
  xhr.open('get', url);
  xhr.responseType = 'arraybuffer';
  xhr.onreadystatechange = function() {
    if (xhr.readyState != 4) return;
    loadTtyRec(xhr.response);
  }
  xhr.send();
}

function advanceFrame(file, terminal) {
  document.getElementById('log').innerHTML = '';
  file.advance();
  document.getElementById('time').textContent = file.time() + '';
  terminal.write(file.data());
}

function loadTtyRec(buf) {
  var terminal = terminalEmulator(document.getElementById('screen'));
  var file = ttyRec(buf);
  terminal.write(file.data());

  var p = player(file, terminal);
  p.onframe = function() {
    document.getElementById('time').textContent = file.time() + '';
  };

  document.getElementById('loadForm').style.display = 'none';
  document.getElementById('playForm').style.display = 'block';
  document.getElementById('next').addEventListener('click', function() {
    p.advance();
  });
  var playButton = document.getElementById('play');
  playButton.addEventListener('click', function() {
    var play = playButton.value == 'play';
    p.play(play);
    playButton.value = play ? 'pause' : 'play';
  });
  document.getElementById('speed').addEventListener('input', function(e) {
    var speed = Math.pow(10, e.target.value);
    p.setSpeed(speed);
    document.getElementById('speedDisplay').textContent = Math.floor(speed * 100) + '%';
  });
}

function log(text) {
  var record = document.createElement('div');
  record.textContent = text;
  document.getElementById('log').appendChild(record);
}

class AbstractMethod extends Error {
  constructor() {
    super('Abstract method');
  }
}

})();  // (function() {

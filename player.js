import Command from './command';
import State from './state';
import Reader from './reader';

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


// TODO(sdh): caching ttyRec wrapper that keeps track of all the \e[2J it sees
// Provides a "previous frame" function that redraws cleverly...?

// TODO(sdh): something to handle timer/cancelling

/**
 * Models the terminal.
 * @param {!Element} e
 * @return {!Terminal}
 */
function terminalEmulator(e) {

  var state = new State();
  state.attach(e);
  var reader = new Reader();

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

  function getU8(data, i) {
    if (i < 0) {
      return leftover[leftover.length + i];
    }
    var b = data.getUint8(i);
    leftover.push(b);
    return b;
  }

  return {
    /** @param {DataView} data */
    write: function(data) {
      //hexDump(data); // Log the packet
      reader.add(data);
      let command = Command.parse(reader);
      while (command != null) {
        command.apply(state);
        command = Command.parse(reader);
      }
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
  xhr.open('get', 'http://cors.io/?u=' + url);
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

var url = /\?url=(.*)/.exec(window.location.search);
if (url) {
  fetchUrl(url[1]);
}

})();  // (function() {

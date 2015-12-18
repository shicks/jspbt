import Command from './command';
import Frame from './frame';
import Reader from './reader';
import State from './state';

(function() {

// TODO(sdh): bz2 support: https://github.com/antimatter15/bzip2.js

/**
 * @typedef {{
 *   commands: function(): !Array<Command>,
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
 *   onframe: function(),         // called on each frame
 *   detach: function(),
 *   attach: function(),
 * }}
 */
var Player;   

/**
 * Models a TTYREC file.
 * @param {!ArrayBuffer} buf
 * @return {!TtyRec}
 */
function ttyRec(buf) {
  var frames = [];
  var frame = 0;

  var iter = Frame.parse(buf);

  function load() {
    while (frame >= frames.length) {
      var val = iter.next();
      if (val.done) {
        frame = frames.length;
        return false;
      }
      frames.push(val.value);
    }
    return true;
  }

  return {
    commands: function() {
      return load() ? frames[frame].commands : [];
    },
    time: function() {
      return new Date(frames[frame - !load()].startMs);
    },
    delayMs: function() {
      return load() ? frames[frame].durationMs : Infinity;
    },
    frame: function() {
      return frame;
    },
    setFrame: function(newFrame) {
      frame = newFrame;
    },
    advance: function() {
      frame++;
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
    while (frames < 0 && ttyRec.frame() > 0) {
      terminal.reverse(ttyRec.commands());
      ttyRec.setFrame(ttyRec.frame() - 1);
      frames++;
    }
    while (frames > 0) {
      ttyRec.advance();
      terminal.write(ttyRec.commands());
      frames--;
    }
    player.onframe();
    waitedMs = 0;
    if (playing) {
      var delay = transform(ttyRec.delayMs());
      nextFrameMs = +new Date() + delay;
      timeout = setTimeout(advance, delay);
      // TODO(sdh): auto-pause once we hit the end
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
    detach() {terminal.detach();},
    attach() {terminal.attach();},
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

  var state = new State(e);
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
    attach() { state.play(); },
    detach() { state.pause(); },

    write: function(/** !Array<!Command> */ cmds) {
      //hexDump(data); // Log the packet
      //console.log("---------------------New Frame---------------------");
      for (let cmd of cmds) {
        //console.log(String(cmd));
        cmd.apply(state);
      }
    },

    reverse: function(/** !Array<!Command> */ cmds) {
      for (let i = cmds.length - 1; i >= 0; i--) {
        cmds[i].undo(state);
      }
    },
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
  document.getElementById('time').textContent =
      file.frame() + ': ' + file.time();
  terminal.write(file.commands());
}

function loadTtyRec(buf) {
  var terminal = terminalEmulator(document.getElementById('screen'));
  var file = ttyRec(buf);
  terminal.write(file.commands());

  var p = player(file, terminal);
  p.onframe = function() {
    document.getElementById('time').textContent =
        file.frame() + ': ' + file.time();
  };

  document.getElementById('loadForm').style.display = 'none';
  document.getElementById('playForm').style.display = 'block';
  document.getElementById('next').addEventListener('click', function() {
    p.advance();
  });
  document.getElementById('prev').addEventListener('click', function() {
    p.advance(-1);
  });
  document.getElementById('next100').addEventListener('click', function() {
    // TODO(sdh): if frames are already loaded, then look for a keyframe?
    // TODO(sdh): add a "loaded" flag to Frame?

    // TODO(sdh): jumping can be very slow and interrupts the UI thread
    // significantly.  consider (1) preloading in the background,
    // (2) making jumps async - sort of a (target state is ...),
    // (3) use frame data to trade-off whether to detach or not
    // i.e. # of commands since a keyframe

    p.detach();
    p.advance(100);
    p.attach();
  });
  document.getElementById('prev100').addEventListener('click', function() {
    p.detach();
    p.advance(-100);
    p.attach();
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

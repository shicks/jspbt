# TODO

* pull out a superclass of State that just holds the
  cursor position
* each frame saves the initial cursor state at the start
* specialized subclass that doesn't keep track of actual
  data, but only watches whether a particular CellRange
  has been touched - use by filters to keep certain text
  up to date - don't bother redrawing if not changed.
* filters will get passed a frame and can manipulate it
  in various ways -> might change duration, or add commands, etc
    * replay existing commands from start cursor to see what happens

* Filters:
    * add a timestamp (probably minute only) to a given range
      (e.g. row 25, or whatever is beneath the bottom)
    * add a commentary in corner - can appear and disappear, change
        * key off time or frame id
        * to disappear, will need to store what's covered up.
    * shorten long gaps, add gaps, speed/slow, etc
    * delete text interruptions? (incremental changes afterward)
        * replay the commands with the different interstitial: pay
          attention to whether any chars actually changed, and if not
          then delete the command --> successive compression passes could
          then delete redundant cursor moves, canonicalize e.g.
          `[move,attr,move,attr]` into `[move..., attr...]` which we can
          then consolidate.
    * move text interruptions to column 80?
        * pattern-match on commands, e.g. repeated `Move(r++, c>50 | c==1)`
          followed by `EraseInLineEnd`, then text (with maybe colors but
          mostly letters/numbers and only a couple different colors per
          line)
* frames also store byte length, #commands, duration, keyframe, etc.
    * occasionally can make an "ad hoc" keyframe if too infrequent
* group frames into constant #, constant bytes, constant time
    * "summarize" by keeping a running "entropy" of words/phrases
    * display only the most interesting (so far) phrase in all
      the contained frames - first appearance will be interesting
      but will get boring later.  words should be `/\w+/`, so not
      walls/punctuation/etc.
    * drill down into frames, then groups of commands, etc
* switch to writing on a canvas? then we can snapshot some frames
  as pngs, say every minute/50kbytes or so?  or after at least
  half the screen has been updated (note: clearing for text is
  not so interesting - possibly check for colors? walls? edit
  distance to last non-text-only frame that was snapshotted?)

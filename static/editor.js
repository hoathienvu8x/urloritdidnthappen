/**
 * Editor prototype. Heavily inspired by the editor in Marcin Wichary's HTML5
 * slideshow.
 *
 * Author: ccalo@google.com (Chris Calo)
 */
goog.provide("ccalo");
goog.provide("ccalo.editor");

goog.require("goog.array");
goog.require("goog.dom");
goog.require("goog.dom.classes");
goog.require("goog.dom.selection");
goog.require("goog.events");
goog.require("goog.events.KeyCodes");
goog.require("goog.events.KeyHandler");
goog.require("goog.net.XhrIo");
goog.require("goog.style");
goog.require("goog.Uri");
goog.require("goog.Uri.QueryData");

ccalo.assert = function (object) {
  if (!object) {
    throw "Assertion failed: " + object;
  }
};

/**
 * Initializes the prototype by loading a document into the editor and setting
 * up event listeners.
 */
ccalo.editor.init = function () {
  var previewElement = goog.dom.getElementsByClass("editor-preview")[0];
  var editorElement = goog.dom.getElementsByClass("editor-doc")[0];

  this.preview = new ccalo.editor.Preview(previewElement);
  this.editor = new ccalo.editor.Editor(editorElement);

  // TODO(ccalo): publish a change event on ccalo.editor.Editor
  goog.events.listen(this.editor.getElement(), "keyup", this.handleKeyUp, false, this);

  this.editor.saveContent_ = document.getElementById('save-content');
  this.saveContentForm_ = document.getElementById('save-content-form');
  this.saveContentBtn_ = document.getElementById('save-content-btn');
  goog.events.listen(this.saveContentBtn_, "click", this.handleSaveContent_,
      false, this);
  this.editor.setText(this.editor.saveContent_.value);
  this.editor.saveState();
  this.updatePreview();
  //this.loadDoc();
};

ccalo.editor.handleSaveContent_ = function(e) {
  this.saveContentForm_.submit();
  /*
  if (this.saveContentKey_.value) {
    // XHR POST
  } else {
    this.saveContentForm_.submit();
  }
  */
};

ccalo.editor.loadDoc = function () {
  var name = this.getSourceName() || "default";
  var uri = "templates/" + name + ".html";
  this.editor.loadFromUrl(uri, goog.bind(this.handleHtmlLoad, this));
};

/**
 * Returns the name of the source document, parsed from the ?name= parameter in
 * the query string.
 */
ccalo.editor.getSourceName = function () {
  var uri = new goog.Uri(location);
  return uri.getQueryData().get("name", "").replace("../", "");
};

/**
 * Loads what's in the editor into the preview pane.
 */
ccalo.editor.updatePreview = function () {
  var content = this.editor.getText();
  this.preview.setContent(content);
};

ccalo.editor.handleHtmlLoad = function (e) {
  this.updatePreview();
};

ccalo.editor.handleKeyUp = function (e) {
  if (this.shouldSave) {
    this.editor.saveState();
  }
  this.shouldSave = true;
  this.updatePreview();
};


/**
 * A writable HTML page. Just a wrapper around an <iframe/>.
 */
ccalo.editor.Preview = function (element) {
  ccalo.assert(element.tagName.toLowerCase() == "iframe");
  this.element_ = element;
};

ccalo.editor.Preview.prototype.getDocument = function (element) {
  return this.element_.contentDocument;
};

ccalo.editor.Preview.prototype.setContent = function (content) {
  var writer = this.getDocument();

  writer.open();
  writer.write(content);
  writer.close();
};


/**
 * An HTML editor. Just a wrapper around a <textarea/>.
 */
ccalo.editor.Editor = function (element) {
  ccalo.assert(element.tagName.toLowerCase() == "textarea")
  this.element_ = element;
  this.history = new ccalo.editor.History();
  this.keyHandler_ = new goog.events.KeyHandler(element);

  goog.events.listen(this.keyHandler_, "key", this.handleKey, false, this);
};

/**
 * @enum
 */
ccalo.editor.Editor.WhiteSpace = {
  TWO_SPACES: "  ",
  TAB: "\t",
  NEW_LINE: "\n",
  SPACE_TAB:" \t",
  THREE_SPACES: "   "
};

ccalo.editor.Editor.prototype.getElement = function () {
  return this.element_;
};

ccalo.editor.Editor.prototype.getText = function () {
  return this.element_.value;
};

/**
 * Sets the text and wipes the current selection range.
 */
ccalo.editor.Editor.prototype.setText = function (text) {
  this.element_.value = text;
};

ccalo.editor.Editor.prototype.loadFromUrl = function (url, callback) {
  var handler = goog.bind(this.handleLoadFromUrl, this, callback);
  goog.net.XhrIo.send(url, handler);
};

ccalo.editor.Editor.prototype.handleLoadFromUrl = function (callback, e) {
  var xhr = e.target;
  this.setText(xhr.getResponseText());
  this.saveState();

  if (callback && goog.isFunction(callback)) {
    callback.call();
  };
};

ccalo.editor.Editor.prototype.handleKey = function (e) {
  switch (e.keyCode) {
    case goog.events.KeyCodes.TAB:
      if (e.shiftKey) {
        this.outdentSelection_();
      } else {
        this.indentSelection_();
      }
      e.preventDefault();
      break;
    case goog.events.KeyCodes.ENTER:
      this.newLine_();
      e.preventDefault();
      break;
    default:
      break;
  }
};

ccalo.editor.Editor.prototype.getSelectionStart = function (text) {
  return goog.dom.selection.getStart(this.element_);
};

ccalo.editor.Editor.prototype.getSelectionEnd = function (text) {
  return goog.dom.selection.getEnd(this.element_);
};

ccalo.editor.Editor.prototype.getLineFromPosition = function (position) {
  return new ccalo.editor.Line(this.element_, position);
};

ccalo.editor.Editor.prototype.getCurrentState = function () {
  var content = this.getText();
  this.saveContent_.value = content;  // elsigh
  var selectionStart = this.getSelectionStart();
  var selectionEnd = this.getSelectionEnd();
  return new ccalo.editor.State(content, selectionStart, selectionEnd);
};

/**
 * Adds a new entry to the history.
 */
ccalo.editor.Editor.prototype.saveState = function () {
  var state = this.getCurrentState();
  this.history.add(state);
};

ccalo.editor.Editor.prototype.loadState = function (state) {
  this.setText(state.getContent());
  goog.dom.selection.setStart(this.getElement(), state.getSelectionStart());
  goog.dom.selection.setEnd(this.getElement(), state.getSelectionEnd());
};

ccalo.editor.Editor.prototype.undo = function () {
  var state = this.history.back();
  this.loadState(state);
};

ccalo.editor.Editor.prototype.indentSelection_ = function () {
  var selectionStart = this.getSelectionStart();
  var line = this.getLineFromPosition(selectionStart);

  do {
    line.indent();
    line = line.getNextLine();
  } while (line && line.intersectsSelection());
};

ccalo.editor.Editor.prototype.outdentSelection_ = function () {
  var selectionStart = this.getSelectionStart();
  var line = this.getLineFromPosition(selectionStart);

  do {
    line.outdent();
    line = line.getNextLine();
  } while (line && line.intersectsSelection());
}

ccalo.editor.Editor.prototype.newLine_ = function () {
  var selectionStart = this.getSelectionStart();
  var selectionEnd = this.getSelectionEnd();
  var firstSelectionPoint = Math.min(selectionStart, selectionEnd);
  var firstLine = this.getLineFromPosition(firstSelectionPoint);
  var indentation = firstLine.getIndentation();

  var newText = ccalo.editor.Editor.WhiteSpace.NEW_LINE +
                indentation.replace(ccalo.editor.Editor.WhiteSpace.TAB,
                                    ccalo.editor.Editor.WhiteSpace.TWO_SPACES);
  var newCursorPosition = firstSelectionPoint + newText.length;

  goog.dom.selection.setText(this.getElement(), newText);
  goog.dom.selection.setCursorPosition(this.getElement(), newCursorPosition);
};


/**
 * A line of text in the code editor.
 */
ccalo.editor.Line = function (field, position) {
  this.field_ = field;
  this.setEndPointsFromPosition(position);
};

ccalo.editor.Line.prototype.setEndPointsFromPosition = function (position) {
  this.start_ = this.getFirstCharPos_(position);
  this.end_ = this.getLastCharPos_(position);
};

/**
 * Returns the starting position of the line that contains the provided
 * character postion.
 */
ccalo.editor.Line.prototype.getFirstCharPos_ = function (position) {
  var content = this.field_.value;
  var cursor = position - 1;

  do {
    if (ccalo.editor.Editor.WhiteSpace.NEW_LINE == content.charAt(cursor)) {
      return cursor + 1;
    }
    cursor--;
  } while (cursor > 0);
  return 0;
};

/**
 * Returns the ending position of the line that contains the provided
 * character postion.
 */
ccalo.editor.Line.prototype.getLastCharPos_ = function (position) {
  var content = this.field_.value;
  var cursor = position;

  do {
    if (ccalo.editor.Editor.WhiteSpace.NEW_LINE == content.charAt(cursor)) {
      return cursor;
    }
    cursor++;
  } while (cursor < content.length);
  return content.length;
};

/**
 * Returns the text of the entire line.
 */
ccalo.editor.Line.prototype.getText = function () {
  var content = this.field_.value;
  return content.slice(this.start_, this.end_);
};

/**
 * Sets the text of the entire line to a new string without disturbing the
 * user's selection.
 */
ccalo.editor.Line.prototype.setText = function (text) {
  var currentText = this.getText();
  var deltaChars = text.length - currentText.length;
  var lineStart = this.getStart();
  var selectionStart = goog.dom.selection.getStart(this.field_);
  var selectionEnd = goog.dom.selection.getEnd(this.field_);
  var newStart = (selectionStart >= lineStart) ?
                 selectionStart + deltaChars :
                 selectionStart;
  var newEnd = (selectionEnd >= lineStart) ?
               selectionEnd + deltaChars :
               selectionEnd;

  goog.dom.selection.setStart(this.field_, this.getStart());
  goog.dom.selection.setEnd(this.field_, this.getEnd());
  goog.dom.selection.setText(this.field_, text);

  goog.dom.selection.setStart(this.field_, newStart);
  goog.dom.selection.setEnd(this.field_, newEnd);

  this.setEndPointsFromPosition(this.getStart());
};

ccalo.editor.Line.prototype.getIndentation = function () {
  var regex = /^([ \t]*)/;
  var match = this.getText().match(regex);
  if (match) {
    return match[1];
  }
};

/**
 * Returns a Line object representing the line following this one. If this is
 * the last line, returns null.
 */
ccalo.editor.Line.prototype.getNextLine = function () {
  if (this.getEnd() == this.field_.value.length) {
    return null;
  } else {
    return new ccalo.editor.Line(this.field_, this.end_ + 1);
  }
};

ccalo.editor.Line.prototype.getStart = function () {
  return this.start_;
};

ccalo.editor.Line.prototype.getEnd = function () {
  return this.end_;
};

ccalo.editor.Line.prototype.intersectsSelection = function () {
  var selectionStart = goog.dom.selection.getStart(this.field_);
  var selectionEnd = goog.dom.selection.getEnd(this.field_);
  var selectionRange = new ccalo.editor.Range(selectionStart, selectionEnd);
  return selectionRange.intersects(this);
};

ccalo.editor.Line.prototype.indent = function () {
  this.setText(ccalo.editor.Editor.WhiteSpace.TWO_SPACES + this.getText());
};

/**
 * Outdents this line as long as it starts with one indentation comprised of
 * spaces and tabs, in any order.
 */
ccalo.editor.Line.prototype.outdent = function () {
  var currentText = this.getText();
  var newText = currentText;

  if (currentText.slice(0, 2) == ccalo.editor.Editor.WhiteSpace.TWO_SPACES) {
    newText = currentText.slice(2);
  } else if (currentText.slice(0, 1) == ccalo.editor.Editor.WhiteSpace.TAB_CHAR) {
    newText = currentText.slice(1);
  } else if (currentText.slice(0, 3) == ccalo.editor.Editor.WhiteSpace.SPACE_TAB) {
    newText = ccalo.editor.Editor.WhiteSpace.THREE_SPACES + currentText.slice(3);
  }

  if (newText != currentText) {
    this.setText(newText);
  }
}

/**
 * A number range. Used for calculating if two ranges intersect.
 */
ccalo.editor.Range = function (start, end) {
  this.start_ = Math.min(start, end);
  this.end_ = Math.max(start, end);
};

ccalo.editor.Range.prototype.getStart = function () {
  return this.start_;
};

ccalo.editor.Range.prototype.getEnd = function () {
  return this.end_;
};

ccalo.editor.Range.prototype.intersects = function (range) {
  if (this.getStart() > range.getEnd()) {
    return false;
  }
  if (this.getEnd() < range.getStart()) {
    return false;
  }
  return true;
};

/**
 * A class representing the history of the editor to enable undo. Stores a
 * collection of State objects.
 */
ccalo.editor.History = function () {
  this.stack_ = [];
  this.cursorPosition_ = null;
};

ccalo.editor.History.prototype.add = function (state) {
  this.deleteFuture_();
  this.stack_.push(state);
  this.incrementCursorPosition_();
};

ccalo.editor.History.prototype.back = function () {
  if (this.isEmpty()) {
    return null;
  } else {
    this.decrementCursorPosition_();
    return this.stack_[this.cursorPosition_];
  }
};

ccalo.editor.History.prototype.forward = function () {
  if (this.isEmpty()) {
    return null;
  } else {
    this.incrementCursorPosition_();
    return this.stack_[this.cursorPosition_];
  }
};

ccalo.editor.History.prototype.deleteFuture_ = function () {
  if (this.isEmpty()) {
    return;
  }
  this.stack_ = this.stack_.slice(0, this.cursorPosition_ + 1);
};

ccalo.editor.History.prototype.isEmpty = function () {
  return this.stack_.length == 0;
};

ccalo.editor.History.prototype.hasFuture = function () {
  if (this.isEmpty()) {
    return false;
  } else {
    var lastPosition = this.stack_.length - 1;
    return !(this.cursorPosition_ == lastPosition);
  }
};

ccalo.editor.History.prototype.hasPast = function () {
  if (this.isEmpty()) {
    return false;
  } else {
    var firstPosition = 0;
    return !(this.cursorPosition_ == firstPosition);
  }
};

ccalo.editor.History.prototype.incrementCursorPosition_ = function () {
  if (this.isEmpty()) {
    return;
  }
  if (this.hasFuture()) {
    this.cursorPosition_++;
  }
};

ccalo.editor.History.prototype.decrementCursorPosition_ = function () {
  if (this.isEmpty()) {
    return;
  }
  if (this.hasPast()) {
    this.cursorPosition_--;
  }
};


/**
 * A class representing the state of the editor. Stores both the content and
 * the selection.
 */
ccalo.editor.State = function (content, selectionStart, selectionEnd) {
  this.content_ = content;
  this.selectionStart_ = selectionStart;
  this.selectionEnd_ = selectionEnd;
};

ccalo.editor.State.prototype.getContent = function () {
  return this.content_;
};

ccalo.editor.State.prototype.getSelectionStart = function () {
  return this.selectionStart_;
};

ccalo.editor.State.prototype.getSelectionEnd = function () {
  return this.selectionEnd_;
};

ccalo.editor.init();

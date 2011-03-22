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
goog.require("goog.events.InputHandler")
goog.require("goog.net.XhrIo");
goog.require("goog.style");
goog.require("goog.Uri");
goog.require("goog.Uri.QueryData");
goog.require("goog.dom.ViewportSizeMonitor");

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
  var editorElement = goog.dom.getElement("editor-ace");

  ccalo.editor.preview = new ccalo.editor.Preview(previewElement);
  ccalo.editor.editor = new ccalo.editor.Editor(editorElement);

  ccalo.editor.editor.saveContent_ = document.getElementById('save-content');
  ccalo.editor.editor.setText(ccalo.editor.editor.saveContent_.value);

  ccalo.editor.editor.ace_.focus();
  ccalo.editor.editor.ace_.gotoLine(1);

  ccalo.editor.saveContentForm_ = document.getElementById('save-content-form');
  ccalo.editor.saveContentBtn_ = document.getElementById('save-content-btn');
  goog.events.listen(ccalo.editor.saveContentBtn_, "click",
      ccalo.editor.handleSaveContent_, false, ccalo.editor);

  ccalo.editor.updatePreview();

};

ccalo.editor.handleSaveContent_ = function(e) {
  this.saveContentForm_.submit();
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
  ccalo.editor.editor.saveContent_.value = content;
  this.preview.setContent(content);
};

ccalo.editor.handleHtmlLoad = function (e) {
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
 * An HTML editor.
 */
ccalo.editor.Editor = function (element) {
  element.setAttribute('class', 'editor-doc');
  var aceEditor = ace.edit('editor-ace');
  aceEditor.setTheme('ace/theme/twilight');
  aceEditor.getSession().setTabSize(2);
  aceEditor.getSession().setUseSoftTabs(true);

  var aceMode = require('ace/mode/html').Mode;
  aceEditor.getSession().setMode(new aceMode());

  aceEditor.getSession().on('change', function() {
      ccalo.editor.updatePreview();
  });
  document.getElementById('editor-ace').style.fontSize = '14px';
  document.getElementById('editor-ace').style.visibility = 'visible';
  this.ace_ = aceEditor;
};

ccalo.editor.Editor.prototype.getText = function () {
  return this.ace_.getSession().getValue();
};

/**
 * Sets the text and wipes the current selection range.
 */
ccalo.editor.Editor.prototype.setText = function (text) {
  return this.ace_.getSession().setValue(text);
};

ccalo.editor.Editor.prototype.loadFromUrl = function (url, callback) {
  var handler = goog.bind(this.handleLoadFromUrl, this, callback);
  goog.net.XhrIo.send(url, handler);
};

ccalo.editor.Editor.prototype.handleLoadFromUrl = function (callback, e) {
  var xhr = e.target;
  this.setText(xhr.getResponseText());

  if (callback && goog.isFunction(callback)) {
    callback.call();
  };
};

window.onload = function() {
  ccalo.editor.init();
};
/*
window['onBespinLoad'] = function() {
  ccalo.editor.init();
};
*/

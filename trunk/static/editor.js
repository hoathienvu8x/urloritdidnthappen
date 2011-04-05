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
goog.require("goog.dom.forms");
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

ccalo.XHR_HEADER = {'X-Requested-With': 'XMLHttpRequest'};

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
  ccalo.editor.saveContentTime_ = document.getElementById('save-content-ts');
  ccalo.editor.saveContentTitle_ =
      document.getElementById('save-content-title');

  // If we can "save" and not fork, set up auto-save behavior.
  if (ccalo.editor.saveContentBtn_) {
    goog.events.listen(ccalo.editor.saveContentBtn_, 'click',
        ccalo.editor.handleSaveContent_, false, ccalo.editor);
    ccalo.editor.saveContentBtn_.disabled = true;
    ccalo.editor.editor.autoSaveTimeout_ = undefined;
    ccalo.editor.editor.ace_.getSession().on('change',
        ccalo.editor.onFormDataChange_);
    ccalo.editor.saveContentTitle_.onchange = ccalo.editor.onFormDataChange_;
  }

  ccalo.editor.updatePreview();

};

ccalo.editor.onFormDataChange_ = function() {
  ccalo.editor.saveContentBtn_.disabled = false;
  if (ccalo.editor.editor.autoSaveTimeout_) {
    window.clearTimeout(ccalo.editor.editor.autoSaveTimeout_);
  }
  ccalo.editor.editor.autoSaveTimeout_ = window.setTimeout(function(){
    ccalo.editor.handleSaveContent_();
  }, 1000);
};

ccalo.editor.handleSaveContent_ = function(opt_e) {
  if (ccalo.editor.editor.autoSaveTimeout_) {
    window.clearTimeout(ccalo.editor.editor.autoSaveTimeout_);
  }
  ccalo.editor.saveContentBtn_.value = 'Saving ...';
  goog.net.XhrIo.send(
    ccalo.editor.saveContentForm_.action,
    ccalo.editor.editor.saveCallback_,
    ccalo.editor.saveContentForm_.method,
    goog.dom.forms.getFormDataString(ccalo.editor.saveContentForm_),
    ccalo.XHR_HEADER
  );
  if (opt_e) {
    opt_e.preventDefault();
  }
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


  // TODO(elsigh): Test if we're inside a script tag.

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
  window.console.log('content', content);
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
  aceEditor.setTheme('ace/theme/eclipse');
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

ccalo.editor.Editor.prototype.saveCallback_ = function(e) {
  var xhr = e.currentTarget;
  if (xhr.isSuccess()) {
    ccalo.editor.saveContentBtn_.value = 'Save';
    ccalo.editor.saveContentBtn_.disabled = true;

    ccalo.editor.saveContentTime_.innerHTML = 'Last saved: ' +
        (new Date()).toString();
    ccalo.editor.saveContentTime_.style.setProperty('-webkit-transition',
        'background 0s ease-in');
    ccalo.editor.saveContentTime_.style.background = '#999';
    window.setTimeout(function() {
      ccalo.editor.saveContentTime_.style.setProperty('-webkit-transition',
          'background 0.5s ease-in');
      ccalo.editor.saveContentTime_.style.background = '';
    }, 250);

  } else {
    alert('Crappity crap crap, saving is broken. Email ux-webdev@');
  }
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
  goog.net.XhrIo.send(url, handler, null, null, ccalo.XHR_HEADER);
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

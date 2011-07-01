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
 * @enum {string}
 */
ccalo.editor.Text = {
  SAVE: 'Save',
  SAVING: 'Save',
  REFRESH: 'Refresh (Ctrl+R)'
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
    goog.events.listen(window, 'keydown',
        ccalo.editor.handleKeyDown_, false, ccalo.editor);

    goog.events.listen(ccalo.editor.saveContentTitle_, 'blur',
        ccalo.editor.handleSaveContent_, false, ccalo.editor);
  }


  ccalo.editor.dealWithContent_();
  ccalo.editor.updatePreview();  // always do it initially.
};


/**
 * @param {goog.events.Event} e
 * @private
 */
ccalo.editor.handleKeyDown_ = function(e) {
  //window.console.log('keydown', e, e.charCode, e.ctrlKey, e.keyCode);

  // F5 or Ctrl + r
  if (e.keyCode == 116 || (e.ctrlKey && e.charCode == 18) ||
      (e.ctrlKey && e.keyCode == 82)) {
    ccalo.editor.updatePreview();
    e.preventDefault();
    e.stopPropagation();

  // Save
  } else if (e.ctrlKey && (e.charCode == 115 || e.keyCode == 83)) {
    ccalo.editor.handleSaveContent_();
    e.preventDefault();
    e.stopPropagation();
  }

};


ccalo.editor.dealWithContent_ = function() {
  var content = ccalo.editor.editor.getText();
  ccalo.editor.editor.saveContent_.value = content;

  var newBtnText;
  // auto update if no scripts on page.
  if (content.indexOf('<script') == -1) {
    newBtnText = ccalo.editor.Text.SAVE;
    ccalo.editor.autoUpdate = true;
    ccalo.editor.updatePreview();
  } else {
    ccalo.editor.autoUpdate = false;
    newBtnText = ccalo.editor.Text.REFRESH;
  }

  // There's no save button if someone needs to fork.
  if (ccalo.editor.saveContentBtn_) {
    ccalo.editor.saveContentBtn_.disabled = false;
    ccalo.editor.saveContentBtn_.value = newBtnText;
  }
};

ccalo.editor.onFormDataChange_ = function() {
  ccalo.editor.dealWithContent_();
  if (ccalo.editor.editor.autoSaveTimeout_) {
    window.clearTimeout(ccalo.editor.editor.autoSaveTimeout_);
  }
  ccalo.editor.editor.autoSaveTimeout_ = window.setTimeout(function(){
    ccalo.editor.handleSaveContent_();
  }, 2000);
};

ccalo.editor.handleSaveContent_ = function(opt_e) {
  if (ccalo.editor.editor.autoSaveTimeout_) {
    window.clearTimeout(ccalo.editor.editor.autoSaveTimeout_);
  }

  // We only have opt_e in the click scenario
  if (ccalo.editor.autoUpdate == false && opt_e) {
    ccalo.editor.updatePreview();
  }

  ccalo.editor.saveContentBtn_.value = ccalo.editor.Text.SAVING;

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
  goog.events.listen(this.getDocument().body, 'keydown',
      ccalo.editor.handleKeyDown_, false, ccalo.editor);
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

  document.getElementById('editor-ace').style.fontSize = '14px';
  document.getElementById('editor-ace').style.visibility = 'visible';

  /*
  canon.addCommand({
    name: "replace",
    bindKey: bindKey("Ctrl-R", "Command-Option-F"),
    exec: function(env, args, request) {
        var needle = prompt("Find:");
        if (!needle)
            return;
        var replacement = prompt("Replacement:");
        if (!replacement)
            return;
        env.editor.replace(replacement, {needle: needle});
    }
});
    */

  this.ace_ = aceEditor;
};


ccalo.editor.Editor.prototype.saveCallback_ = function(e) {
  var xhr = e.currentTarget;
  if (xhr.isSuccess()) {
    if (ccalo.editor.autoUpdate) {
      ccalo.editor.saveContentBtn_.value = ccalo.editor.Text.SAVE;
      ccalo.editor.saveContentBtn_.disabled = true;
    } else {
      ccalo.editor.saveContentBtn_.value = ccalo.editor.Text.REFRESH;
    }

    ccalo.editor.saveContentTime_.innerHTML = 'Last saved: ' +
        (new Date()).toString();
    ccalo.editor.saveContentTime_.style.setProperty('-webkit-transition',
        'background 0s ease-in');
    ccalo.editor.saveContentTime_.style.background = '#888';
    window.setTimeout(function() {
      ccalo.editor.saveContentTime_.style.setProperty('-webkit-transition',
          'background 0.3s ease-in');
      ccalo.editor.saveContentTime_.style.background = '';
    }, 500);

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

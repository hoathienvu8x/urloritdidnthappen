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
  var editorElement = goog.dom.getElementsByClass("editor-bespin")[0];

  ccalo.editor.preview = new ccalo.editor.Preview(previewElement);
  ccalo.editor.editor = new ccalo.editor.Editor(editorElement);

  ccalo.editor.editor.saveContent_ = document.getElementById('save-content');
  ccalo.editor.saveContentForm_ = document.getElementById('save-content-form');
  ccalo.editor.saveContentBtn_ = document.getElementById('save-content-btn');
  goog.events.listen(ccalo.editor.saveContentBtn_, "click",
      ccalo.editor.handleSaveContent_, false, ccalo.editor);

  ccalo.editor.menuButtonInit_();
  goog.dom.getElement('editor-load-template-url-btn').onclick = function(e) {
    var url = goog.dom.getElement('editor-load-template-url').value;
    if (url.indexOf('http://') == -1) {
      url = 'http://' + url;
    }
    url = '/proxy?url=' + encodeURIComponent(url);
    ccalo.editor.editor.loadFromUrl(
        url,
        goog.bind(ccalo.editor.handleHtmlLoad, ccalo.editor));
    var menuContainer = this.parentNode.parentNode;
    goog.dom.classes.toggle(menuContainer, 'menu-button-container-on');
  };
};

ccalo.editor.menuButtonInit_ = function() {
  var menuButtons = goog.dom.getElementsByTagNameAndClass(null,
      'menu-button');
  for (var i = 0, menuButton; menuButton = menuButtons[i]; i++) {
    menuButton.onclick = function() {
      var menu = goog.dom.getNextElementSibling(this);
      var menuContainer = this.parentNode;
      goog.dom.classes.toggle(menuContainer, 'menu-button-container-on');
      var menuItems = goog.dom.getElementsByTagNameAndClass('li',
          'menu-item', menu);
      for (var j = 0, menuItem; menuItem = menuItems[j]; j++) {
        menuItem.onclick = function() {
          var url = this.getAttribute('data-template-url');
          ccalo.editor.editor.loadFromUrl(url,
              goog.bind(ccalo.editor.handleHtmlLoad,
                        ccalo.editor));
          goog.dom.classes.toggle(menuContainer, 'menu-button-container-on');

        };
      }
    };
  }
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
 * An HTML editor. Just a wrapper around a <textarea/>.
 */
ccalo.editor.Editor = function (element) {
  // Use textarea if bespin doesn't work out.
  function fallback(reason) {
    ccalo.editor.Editor.prototype.getText = function () {
      return element['value'];
    };


    ccalo.editor.Editor.prototype.setText = function (text) {
      return element['value'] = text;
    };

    // Simulate Bespin's asynchronous promise (bespin.useBespin(...).then(...)).
    setTimeout(function () {
        element['value'] = ccalo.editor.editor.saveContent_.value;
        ccalo.editor.updatePreview();

        goog.events.listen(new goog.events.InputHandler(element),
            goog.events.InputHandler.EventType.INPUT, function() {
              ccalo.editor.updatePreview();
            });

        element.setAttribute('class', 'editor-doc');
        element.focus();
      }, 0);
  }

  try {
    var editor_ = this;

    // TODO(mikol): Maybe get externs working.
    bespin['useBespin'](element, {
      "settings":
      { "fontsize": 13
      , "tabstop": 2
      }
    })['then'](function(env) {
      editor_.bespin_ = env['editor'];
      editor_.bespin_['highlightline'] = true;
      editor_.bespin_['syntax'] = 'html';
      editor_.bespin_['value'] = ccalo.editor.editor.saveContent_.value;
      ccalo.editor.updatePreview();

      goog.events.listen(new goog.dom.ViewportSizeMonitor(),
          goog.events.EventType.RESIZE, goog.bind(env['dimensionsChanged'], env));

      editor_.bespin_['textChanged']['add'](function() {
          ccalo.editor.updatePreview();
        });

      editor_.bespin_['focus'] = true;
    }, function(error) {
      fallback(error);
    });
  } catch (ex) {
    fallback(ex);
  }
};

ccalo.editor.Editor.prototype.getText = function () {
  return this.bespin_['value'];
};

/**
 * Sets the text and wipes the current selection range.
 */
ccalo.editor.Editor.prototype.setText = function (text) {
  this.bespin_['value'] = text;
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

window['onBespinLoad'] = function() {
  ccalo.editor.init();
};

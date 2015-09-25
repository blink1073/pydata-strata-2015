/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use-strict';
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var phosphor_dockpanel_1 = require('phosphor-dockpanel');
var phosphor_tabs_1 = require('phosphor-tabs');
var phosphor_widget_1 = require('phosphor-widget');
var term_js_1 = require('term.js');
require('./index.css');
//import Size = phosphor.utility.Size;
//import SizePolicy = phosphor.widgets.SizePolicy;
/**
 * A widget which manages a terminal session.
 */
var TerminalWidget = (function (_super) {
    __extends(TerminalWidget, _super);
    /*
    * Construct a new terminal.
    */
    function TerminalWidget(ws_url, config) {
        var _this = this;
        _super.call(this);
        this.addClass('p-TerminalWidget');
        this._ws = new WebSocket(ws_url);
        this._config = config || { useStyle: true };
        this._term = new term_js_1.Terminal(this._config);
        this._term.open(this.node);
        this._term.on('data', function (data) {
            _this._ws.send(JSON.stringify(['stdin', data]));
        });
        this._ws.onmessage = function (event) {
            var json_msg = JSON.parse(event.data);
            switch (json_msg[0]) {
                case "stdout":
                    _this._term.write(json_msg[1]);
                    break;
                case "disconnect":
                    _this._term.write("\r\n\r\n[Finished... Term Session]\r\n");
                    break;
            }
        };
        // create a dummy terminal to get row/column size
        this._dummy_term = document.createElement('div');
        this._dummy_term.style.visibility = "hidden";
        var pre = document.createElement('pre');
        var span = document.createElement('span');
        pre.appendChild(span);
        // 24 rows
        pre.innerHTML = "<br><br><br><br><br><br><br><br><br><br><br><br>" +
            "<br><br><br><br><br><br><br><br><br><br><br><br>";
        // 1 row + 80 columns
        span.innerHTML = "012345678901234567890123456789" +
            "012345678901234567890123456789" +
            "01234567890123456789";
        this._dummy_term.appendChild(pre);
        this._term.element.appendChild(this._dummy_term);
        //this.verticalSizePolicy = SizePolicy.Minimum;
    }
    /**
     * Dispose of the resources held by the widget.
     */
    TerminalWidget.prototype.dispose = function () {
        this._term.destroy();
        this._ws = null;
        this._term = null;
        _super.prototype.dispose.call(this);
    };
    Object.defineProperty(TerminalWidget.prototype, "config", {
        get: function () {
            return this._config;
        },
        /**
         * Set the configuration of the terminal.
         */
        set: function (options) {
            if (options.useStyle) {
                this._term.insertStyle(this._term.document, this._term.colors[256], this._term.colors[257]);
            }
            else if (options.useStyle === false) {
                var sheetToBeRemoved = document.getElementById('term-style');
                if (sheetToBeRemoved) {
                    var sheetParent = sheetToBeRemoved.parentNode;
                    sheetParent.removeChild(sheetToBeRemoved);
                }
            }
            if (options.useStyle !== null) {
                // invalidate terminal pixel size
                this._term_row_height = 0;
            }
            for (var key in options) {
                this._term.options[key] = options[key];
            }
            this._config = options;
            // this.resize_term(this.width, this.height);
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Handle resizing the terminal itself.
     */
    TerminalWidget.prototype.resize_term = function (width, height) {
        if (!this._term_row_height) {
            this._term_row_height = this._dummy_term.offsetHeight / 25;
            this._term_col_width = this._dummy_term.offsetWidth / 80;
        }
        var rows = Math.max(2, Math.floor(height / this._term_row_height) - 2);
        var cols = Math.max(3, Math.floor(width / this._term_col_width) - 2);
        rows = this._config.rows || rows;
        cols = this._config.cols || cols;
        this._term.resize(cols, rows);
    };
    /**
     * Handle resize event.
     */
    TerminalWidget.prototype.onResize = function (msg) {
        this.resize_term(msg.width, msg.height);
    };
    return TerminalWidget;
})(phosphor_widget_1.Widget);
exports.TerminalWidget = TerminalWidget;
function createContent(title) {
    var widget = new phosphor_widget_1.Widget();
    widget.addClass('content');
    widget.addClass(title.toLowerCase());
    var tab = new phosphor_tabs_1.Tab(title);
    tab.closable = true;
    phosphor_dockpanel_1.DockPanel.setTab(widget, tab);
    return widget;
}
/**
 * A widget which hosts a CodeMirror editor.
 */
var CodeMirrorWidget = (function (_super) {
    __extends(CodeMirrorWidget, _super);
    function CodeMirrorWidget(config) {
        _super.call(this);
        this.addClass('CodeMirrorWidget');
        this._editor = CodeMirror(this.node, config);
    }
    Object.defineProperty(CodeMirrorWidget.prototype, "editor", {
        get: function () {
            return this._editor;
        },
        enumerable: true,
        configurable: true
    });
    CodeMirrorWidget.prototype.loadTarget = function (target) {
        var doc = this._editor.getDoc();
        var xhr = new XMLHttpRequest();
        xhr.open('GET', target);
        xhr.onreadystatechange = function () { return doc.setValue(xhr.responseText); };
        xhr.send();
    };
    CodeMirrorWidget.prototype.onAfterAttach = function (msg) {
        this._editor.refresh();
    };
    CodeMirrorWidget.prototype.onResize = function (msg) {
        if (msg.width < 0 || msg.height < 0) {
            this._editor.refresh();
        }
        else {
            this._editor.setSize(msg.width, msg.height);
        }
    };
    return CodeMirrorWidget;
})(phosphor_widget_1.Widget);
// class NotebookWidget extends Widget {
//   constructor() {
//     super();
//     var ipynb: any = {
//       "metadata": {
//         "name": ""
//       },
//       "nbformat": 3,
//       "nbformat_minor": 0,
//       "worksheets": [
//         {
//           "cells": [
//             {
//               "cell_type": "code",
//               "collapsed": false,
//               "input": [],
//               "language": "python",
//               "metadata": {},
//               "outputs": []
//             }
//           ],
//           "metadata": {}
//         }
//       ]
//     };
//     var nbk = new nb();
//     var notebook = nbk.parse(ipynb);
//     var rendered = notebook.render();
//     this.node.appendChild(rendered);
//   }
// }
var NotebookWidget = (function (_super) {
    __extends(NotebookWidget, _super);
    function NotebookWidget() {
        _super.call(this);
        this._frame = document.createElement('iframe');
        this._frame.setAttribute("src", "http://localhost:8888/tree");
        this._frame.setAttribute("frameborder", "0");
        this.node.appendChild(this._frame);
    }
    NotebookWidget.prototype.onAfterAttach = function (msg) {
        this._frame.refresh();
    };
    NotebookWidget.prototype.onResize = function (msg) {
        if (msg.width < 0 || msg.height < 0) {
            this._frame.refresh();
        }
        else {
            this._frame.style.width = msg.width;
            this._frame.style.height = msg.height;
        }
    };
    return NotebookWidget;
})(phosphor_widget_1.Widget);
function main() {
    // Codemirror tab
    //
    var cm = new CodeMirrorWidget({
        mode: 'text/javascript',
        lineNumbers: true,
        tabSize: 2,
    });
    var cmTab = new phosphor_tabs_1.Tab('Codemirror');
    phosphor_dockpanel_1.DockPanel.setTab(cm, cmTab);
    // Text file tab
    var text = new CodeMirrorWidget({
        lineNumbers: false,
        tabSize: 4
    });
    var textTab = new phosphor_tabs_1.Tab('Text File 1');
    phosphor_dockpanel_1.DockPanel.setTab(text, textTab);
    // Terminal tab
    //
    var protocol = (window.location.protocol.indexOf("https") === 0) ? "wss" : "ws";
    var wsUrl = protocol + "://" + window.location.host + "/websocket";
    var term = new TerminalWidget(wsUrl);
    var termTab = new phosphor_tabs_1.Tab('Terminal');
    phosphor_dockpanel_1.DockPanel.setTab(term, termTab);
    // Notebook tab
    //
    var notebook = new NotebookWidget();
    var nbTab = new phosphor_tabs_1.Tab('Notebook');
    phosphor_dockpanel_1.DockPanel.setTab(notebook, nbTab);
    // Dummy content
    //
    var r1 = createContent('Red');
    var r2 = createContent('Red');
    var r3 = createContent('Red');
    var b1 = createContent('Blue');
    var b2 = createContent('Blue');
    var b3 = createContent('Blue');
    var g1 = createContent('Green');
    var g2 = createContent('Green');
    var g3 = createContent('Green');
    var y1 = createContent('Yellow');
    var y2 = createContent('Yellow');
    var y3 = createContent('Yellow');
    var panel = new phosphor_dockpanel_1.DockPanel();
    panel.id = 'main';
    panel.addWidget(r1);
    panel.addWidget(cm, phosphor_dockpanel_1.DockPanel.SplitRight, r1);
    //panel.addWidget(b1, DockPanel.SplitRight, r1);
    panel.addWidget(term, phosphor_dockpanel_1.DockPanel.SplitBottom, b1);
    //panel.addWidget(y1, DockPanel.SplitBottom, b1);
    panel.addWidget(text, phosphor_dockpanel_1.DockPanel.SplitLeft, y1);
    // panel.addWidget(g1, DockPanel.SplitLeft, y1);
    panel.addWidget(notebook, phosphor_dockpanel_1.DockPanel.SplitBottom);
    // panel.addWidget(b2, DockPanel.SplitBottom);
    // panel.addWidget(y2, DockPanel.TabBefore, r1);
    // panel.addWidget(b3, DockPanel.TabBefore, y2);
    // panel.addWidget(g2, DockPanel.TabBefore, b2);
    // panel.addWidget(y3, DockPanel.TabBefore, g2);
    // panel.addWidget(g3, DockPanel.TabBefore, y3);
    // panel.addWidget(r2, DockPanel.TabBefore, b1);
    // panel.addWidget(r3, DockPanel.TabBefore, y1);
    phosphor_widget_1.attachWidget(panel, document.body);
    window.onresize = function () { return panel.update(); };
}
window.onload = main;

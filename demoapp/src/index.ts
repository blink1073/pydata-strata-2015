/*-----------------------------------------------------------------------------
| Copyright (c) 2014-2015, PhosphorJS Contributors
|
| Distributed under the terms of the BSD 3-Clause License.
|
| The full license is in the file LICENSE, distributed with this software.
|----------------------------------------------------------------------------*/
'use-strict';

import {
  DockPanel
} from 'phosphor-dockpanel';

import {
  Message
} from 'phosphor-messaging';

import {
Tab
} from 'phosphor-tabs';

import {
  ResizeMessage, Widget, attachWidget
} from 'phosphor-widget';

import {
  Terminal, ITerminalConfig
} from 'term.js';

import './index.css';


//import Size = phosphor.utility.Size;
//import SizePolicy = phosphor.widgets.SizePolicy;


/**
 * A widget which manages a terminal session.
 */
export
class TerminalWidget extends Widget {
/*
* Construct a new terminal.
*/
constructor(ws_url: string, config?: ITerminalConfig) {
  super();
  this.addClass('p-TerminalWidget');
  this._ws = new WebSocket(ws_url);
  this._config = config || { useStyle: true };

  this._term = new Terminal(this._config);
  this._term.open(this.node);

  this._term.on('data', (data: string) => {
    this._ws.send(JSON.stringify(['stdin', data]));
  });

  this._ws.onmessage = (event: MessageEvent) => {
    var json_msg = JSON.parse(event.data);
    switch (json_msg[0]) {
      case "stdout":
        this._term.write(json_msg[1]);
        break;
      case "disconnect":
        this._term.write("\r\n\r\n[Finished... Term Session]\r\n");
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
      "<br><br><br><br><br><br><br><br><br><br><br><br>"
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
  dispose(): void {
      this._term.destroy();
      this._ws = null;
      this._term = null;
      super.dispose();
  }

  get config(): ITerminalConfig {
      return this._config;
  }

  /**
   * Set the configuration of the terminal.
   */
  set config(options: ITerminalConfig) {
      if (options.useStyle) {
          this._term.insertStyle(this._term.document, this._term.colors[256],
              this._term.colors[257]);
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
          this._term.options[key] = (<any>options)[key];
      }

      this._config = options;
      // this.resize_term(this.width, this.height);
  }

  /**
   * Handle resizing the terminal itself.
   */
  protected resize_term(width: number, height: number): void {
      if (!this._term_row_height) {
          this._term_row_height = this._dummy_term.offsetHeight / 25;
          this._term_col_width = this._dummy_term.offsetWidth / 80;
      }

      var rows = Math.max(2, Math.floor(height / this._term_row_height) - 2);
      var cols = Math.max(3, Math.floor(width / this._term_col_width) - 2);

      rows = this._config.rows || rows;
      cols = this._config.cols || cols;

      this._term.resize(cols, rows);
  }

  /**
   * Handle resize event.
   */
  protected onResize(msg: ResizeMessage): void {
      this.resize_term(msg.width, msg.height);
  }

  // sizeHint(): Size {
  //     return new Size(512, 256);
  // }

  private _ws: WebSocket;
  private _term: any;
  private _dummy_term: HTMLElement;
  private _term_row_height: number;
  private _term_col_width: number;
  private _config: ITerminalConfig;
}


function createContent(title: string): Widget {
  var widget = new Widget();
  widget.addClass('content');
  widget.addClass(title.toLowerCase());

  var tab = new Tab(title);
  tab.closable = true;
  DockPanel.setTab(widget, tab);

  return widget;
}

/**
 * A widget which hosts a CodeMirror editor.
 */
class CodeMirrorWidget extends Widget {

    constructor(config?: CodeMirror.EditorConfiguration) {
        super();
        this.addClass('CodeMirrorWidget');
        this._editor = CodeMirror(this.node, config);
    }

    get editor(): CodeMirror.Editor {
        return this._editor;
    }

    loadTarget(target: string): void {
        var doc = this._editor.getDoc();
        var xhr = new XMLHttpRequest();
        xhr.open('GET', target);
        xhr.onreadystatechange = () => doc.setValue(xhr.responseText);
        xhr.send();
    }

    protected onAfterAttach(msg: Message): void {
        this._editor.refresh();
    }

    protected onResize(msg: ResizeMessage): void {
        if (msg.width < 0 || msg.height < 0) {
            this._editor.refresh();
        } else {
            this._editor.setSize(msg.width, msg.height);
        }
    }

    private _editor: CodeMirror.Editor;
}



function main(): void {

  // Codemirror tab
  //
  var cm = new CodeMirrorWidget({
    mode: 'text/javascript',
    lineNumbers: true,
    tabSize: 2,
  });
  var cmTab = new Tab('Codemirror');
  DockPanel.setTab(cm, cmTab);

  // Terminal tab
  //
  var protocol = (window.location.protocol.indexOf("https") === 0) ? "wss" : "ws";
  var wsUrl = protocol + "://" + window.location.host + "/websocket";
  var term = new TerminalWidget(wsUrl);
  var termTab = new Tab('Terminal');
  DockPanel.setTab(term, termTab);

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

  var panel = new DockPanel();
  panel.id = 'main';

  panel.addWidget(r1);

  panel.addWidget(cm, DockPanel.SplitRight, r1);
  //panel.addWidget(b1, DockPanel.SplitRight, r1);
  panel.addWidget(term, DockPanel.SplitBottom, b1);
  //panel.addWidget(y1, DockPanel.SplitBottom, b1);
  panel.addWidget(g1, DockPanel.SplitLeft, y1);

  panel.addWidget(b2, DockPanel.SplitBottom);

  panel.addWidget(y2, DockPanel.TabBefore, r1);
  panel.addWidget(b3, DockPanel.TabBefore, y2);
  panel.addWidget(g2, DockPanel.TabBefore, b2);
  panel.addWidget(y3, DockPanel.TabBefore, g2);
  panel.addWidget(g3, DockPanel.TabBefore, y3);
  panel.addWidget(r2, DockPanel.TabBefore, b1);
  panel.addWidget(r3, DockPanel.TabBefore, y1);

  attachWidget(panel, document.body);

  window.onresize = () => panel.update();
}

window.onload = main;

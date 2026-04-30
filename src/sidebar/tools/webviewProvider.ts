import * as vscode from "vscode";
import { createNonce } from "../shared/webview";
import {
  CMD_FLUTTER_CLEAN,
  CMD_PUB_GET,
  CMD_PUB_CACHE_REPAIR,
  CMD_FLUTTER_BUILD,
  CMD_FLUTTER_DOCTOR,
  CMD_DART_RESTART,
} from "./commands";

export class FlutterWiseToolsWebviewProvider
  implements vscode.WebviewViewProvider
{
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage((m) => {
      if (!m || !m.command) {
        return;
      }
      switch (m.command) {
        case "flutter.clean":
          void vscode.commands.executeCommand(CMD_FLUTTER_CLEAN);
          break;
        case "flutter.pub.get":
          void vscode.commands.executeCommand(CMD_PUB_GET);
          break;
        case "flutter.pub.cache.repair":
          void vscode.commands.executeCommand(CMD_PUB_CACHE_REPAIR);
          break;
        case "flutter.build":
          void vscode.commands.executeCommand(CMD_FLUTTER_BUILD);
          break;
        case "flutter.doctor":
          void vscode.commands.executeCommand(CMD_FLUTTER_DOCTOR);
          break;
        case "dart.restart":
          void vscode.commands.executeCommand(CMD_DART_RESTART);
          break;
      }
    });

    webviewView.webview.html = this.getHtml(webviewView.webview);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = createNonce();
    const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Flutter Wise Shortcuts</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-sideBar-background);
      --card: color-mix(in srgb, var(--vscode-editor-background) 72%, transparent);
      --border: color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
      --muted: var(--vscode-descriptionForeground);
      --text: var(--vscode-foreground);
      --accent: var(--vscode-button-background);
      --radius: 12px;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 12px; background: var(--bg); color: var(--text);
      font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
    }

    .panel { border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; display: grid; gap: 8px; }
    .title { margin: 0; font-size: 12px; text-transform: uppercase; color: var(--muted); }
    .row { display:flex; gap:8px; flex-direction:column }
    button { padding:8px 10px; border-radius:6px; border:1px solid color-mix(in srgb,var(--accent) 40%, transparent); background: color-mix(in srgb,var(--accent) 12%, transparent); color:var(--text); cursor:pointer; width:100%; text-align:left }
    .desc { margin:0; color:var(--muted); font-size:11px }
  </style>
</head>
<body>
  <section class="panel">
    <h3 class="title">Shortcuts</h3>
    <p class="desc">Run common Flutter commands quickly.</p>
    <div class="row">
      <button id="clean">flutter clean</button>
      <button id="pubget">flutter pub get</button>
      <button id="pubrepair">flutter pub cache repair</button>
      <button id="build">flutter build</button>
      <button id="doctor">flutter doctor</button>
      <button id="dartrestart">Dart: Restart Analysis Server</button>
    </div>
  </section>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('clean').addEventListener('click', () => {
      vscode.postMessage({ command: 'flutter.clean' });
    });
    document.getElementById('pubget').addEventListener('click', () => {
      vscode.postMessage({ command: 'flutter.pub.get' });
    });
    document.getElementById('pubrepair').addEventListener('click', () => {
      vscode.postMessage({ command: 'flutter.pub.cache.repair' });
    });
    document.getElementById('build').addEventListener('click', () => {
      vscode.postMessage({ command: 'flutter.build' });
    });
    document.getElementById('doctor').addEventListener('click', () => {
      vscode.postMessage({ command: 'flutter.doctor' });
    });
    document.getElementById('dartrestart').addEventListener('click', () => {
      vscode.postMessage({ command: 'dart.restart' });
    });
  </script>
</body>
</html>`;
  }
}

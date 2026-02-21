import * as vscode from "vscode";
import { createNonce } from "../shared/webview";

export class FlutterWiseToolsWebviewProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: false,
    };
    webviewView.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const nonce = createNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'nonce-${nonce}';"
  />
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

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      padding: 14px;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    .panel {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: linear-gradient(160deg, var(--card), transparent 86%);
      padding: 12px;
      display: grid;
      gap: 8px;
    }

    .title {
      margin: 0;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .item {
      border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
      border-radius: 10px;
      padding: 10px;
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      display: grid;
      gap: 4px;
    }

    .label {
      margin: 0;
      font-weight: 600;
      font-size: 12px;
    }

    .desc {
      margin: 0;
      color: var(--muted);
      font-size: 11px;
    }
  </style>
</head>
<body>
  <section class="panel">
    <h3 class="title">Shortcuts</h3>
    <article class="item">
      <p class="label">Shortcuts (coming soon)</p>
      <p class="desc">flutter clean, pub get, build, run...</p>
    </article>
  </section>
</body>
</html>`;
  }
}

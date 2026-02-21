import * as vscode from "vscode";
import { createNonce } from "../shared/webview";
import { actionToCommand } from "./commands";
import { FlutterWiseDevicesController } from "./controller";
import type { DevicesWebviewMessage } from "./types";

export class FlutterWiseDevicesWebviewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private view?: vscode.WebviewView;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly controller: FlutterWiseDevicesController) {
    this.subscriptions.push(
      this.controller.onDidChange(() => {
        void this.postState();
      }),
    );
  }

  dispose(): void {
    for (const disposable of this.subscriptions) {
      disposable.dispose();
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };
    webviewView.webview.html = this.getHtml();

    this.subscriptions.push(
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) {
          this.view = undefined;
        }
      }),
      webviewView.webview.onDidReceiveMessage((message: DevicesWebviewMessage) => {
        void this.onMessage(message);
      }),
    );

    void this.postState();
  }

  private async onMessage(message: DevicesWebviewMessage): Promise<void> {
    if (!this.view) {
      return;
    }

    if (message.type === "ready") {
      await this.postState();
      return;
    }

    if (message.type === "cancelQr") {
      this.controller.cancelQrPairing();
      return;
    }

    if (message.type === "action") {
      const commandId = actionToCommand[message.action];
      if (!commandId) {
        return;
      }

      await vscode.commands.executeCommand(commandId);
    }
  }

  private async postState(): Promise<void> {
    if (!this.view) {
      return;
    }

    const model = await this.controller.getViewModel();
    await this.view.webview.postMessage({
      type: "state",
      payload: model,
    });
  }

  private getHtml(): string {
    const nonce = createNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}' https://unpkg.com;"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Flutter Wise Devices</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-sideBar-background);
      --card: color-mix(in srgb, var(--vscode-editor-background) 76%, transparent);
      --border: color-mix(in srgb, var(--vscode-foreground) 16%, transparent);
      --muted: var(--vscode-descriptionForeground);
      --text: var(--vscode-foreground);
      --accent: var(--vscode-button-background);
      --accentText: var(--vscode-button-foreground);
      --radius: 12px;
      --ok: #2ea043;
      --warn: #d29922;
      --error: #f85149;
      --neutral: color-mix(in srgb, var(--vscode-foreground) 48%, transparent);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 14px;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.35;
    }

    #root {
      display: grid;
      gap: 12px;
      align-content: start;
    }

    .panel {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: linear-gradient(165deg, var(--card), transparent 85%);
      padding: 10px;
      display: grid;
      gap: 8px;
    }

    .panel-title {
      margin: 0;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      font-weight: 600;
    }

    .items {
      display: grid;
      gap: 6px;
    }

    .item {
      border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
      border-radius: 10px;
      padding: 8px 10px;
      background: color-mix(in srgb, var(--card) 70%, transparent);
      display: grid;
      gap: 2px;
    }

    .line {
      display: flex;
      gap: 8px;
      align-items: baseline;
      justify-content: space-between;
      min-width: 0;
    }

    .label {
      font-weight: 600;
      font-size: 12px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .desc {
      margin: 0;
      font-size: 11px;
      color: var(--muted);
      overflow-wrap: anywhere;
    }

    .tone {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      flex: 0 0 auto;
      margin-top: 4px;
    }

    .tone.ok { background: var(--ok); }
    .tone.warning { background: var(--warn); }
    .tone.error { background: var(--error); }
    .tone.neutral { background: var(--neutral); }

    .action {
      width: 100%;
      border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
      border-radius: 10px;
      background: color-mix(in srgb, var(--accent) 15%, transparent);
      color: var(--text);
      text-align: left;
      padding: 8px 10px;
      font: inherit;
      cursor: pointer;
      display: grid;
      gap: 2px;
    }

    .action:hover {
      background: color-mix(in srgb, var(--accent) 24%, transparent);
    }

    .action:focus-visible {
      outline: 1px solid var(--accent);
      outline-offset: 1px;
    }

    .action .label {
      color: var(--accentText);
      font-size: 12px;
    }

    .qr-wrap {
      display: grid;
      gap: 10px;
      border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
      border-radius: 10px;
      padding: 10px;
      background: color-mix(in srgb, var(--card) 75%, transparent);
    }

    .qr-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .back {
      border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
      border-radius: 8px;
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      color: var(--text);
      font: inherit;
      cursor: pointer;
      padding: 4px 8px;
    }

    .back:hover {
      background: color-mix(in srgb, var(--accent) 20%, transparent);
    }

    .qr-status {
      margin: 0;
      font-size: 11px;
      color: var(--muted);
    }

    .qr-box {
      width: 100%;
      background: white;
      border-radius: 10px;
      padding: 10px;
      display: grid;
      place-items: center;
      min-height: 232px;
    }

    .qr-target {
      width: 208px;
      height: 208px;
      display: grid;
      place-items: center;
    }

    .meta {
      display: grid;
      gap: 6px;
    }

    .meta-row {
      display: grid;
      gap: 2px;
    }

    .meta-label {
      font-size: 10px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .meta-value {
      font-family: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
      font-size: 11px;
      overflow-wrap: anywhere;
      user-select: all;
    }

    .empty {
      margin: 0;
      color: var(--muted);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <main id="root">
    <p class="empty">Loading device state...</p>
  </main>
  <script nonce="${nonce}" src="https://unpkg.com/qrcodejs@1.0.0/qrcode.min.js"></script>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById("root");

    function clearRoot() {
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }
    }

    function createToneDot(tone) {
      const dot = document.createElement("span");
      dot.className = "tone " + (tone || "neutral");
      return dot;
    }

    function appendMetaRow(parent, label, value) {
      const row = document.createElement("div");
      row.className = "meta-row";

      const metaLabel = document.createElement("span");
      metaLabel.className = "meta-label";
      metaLabel.textContent = label;
      row.appendChild(metaLabel);

      const metaValue = document.createElement("span");
      metaValue.className = "meta-value";
      metaValue.textContent = value || "";
      row.appendChild(metaValue);

      parent.appendChild(row);
    }

    function renderQrPairing(itemsRoot, qrPairing) {
      const wrap = document.createElement("article");
      wrap.className = "qr-wrap";

      const top = document.createElement("div");
      top.className = "qr-top";

      const back = document.createElement("button");
      back.type = "button";
      back.className = "back";
      back.dataset.event = "cancelQr";
      back.textContent = "← Back";
      top.appendChild(back);

      const status = document.createElement("p");
      status.className = "qr-status";
      status.textContent = qrPairing.statusMessage || "Waiting for QR scan...";
      top.appendChild(status);

      wrap.appendChild(top);

      const qrBox = document.createElement("div");
      qrBox.className = "qr-box";

      const qrTarget = document.createElement("div");
      qrTarget.className = "qr-target";
      qrBox.appendChild(qrTarget);
      wrap.appendChild(qrBox);

      const meta = document.createElement("div");
      meta.className = "meta";
      appendMetaRow(meta, "Service Name", qrPairing.pairServiceName || "");
      appendMetaRow(meta, "Pairing Code", qrPairing.pairCode || "");
      appendMetaRow(meta, "QR Payload", qrPairing.payload || "");
      wrap.appendChild(meta);

      itemsRoot.appendChild(wrap);

      try {
        if (!window.QRCode) {
          throw new Error("QRCode library unavailable");
        }

        qrTarget.innerHTML = "";
        new window.QRCode(qrTarget, {
          text: qrPairing.payload || "",
          width: 200,
          height: 200,
          correctLevel: window.QRCode.CorrectLevel.M,
        });
      } catch (_error) {
        qrTarget.textContent = "QR rendering unavailable.";
      }
    }

    function render(model) {
      clearRoot();

      const sections = Array.isArray(model && model.sections) ? model.sections : [];
      if (sections.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No data available.";
        root.appendChild(empty);
        return;
      }

      for (const section of sections) {
        const panel = document.createElement("section");
        panel.className = "panel";

        const title = document.createElement("h3");
        title.className = "panel-title";
        title.textContent = section.title || "Section";
        panel.appendChild(title);

        const items = document.createElement("div");
        items.className = "items";

        const isConnectionSection = section.title === "Connection";
        const qrPairing = isConnectionSection ? model.qrPairing : undefined;

        if (qrPairing) {
          renderQrPairing(items, qrPairing);
        } else {
          for (const item of section.items || []) {
            if (item.kind === "action" && item.actionId) {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "action";
              button.dataset.action = item.actionId;

              const label = document.createElement("span");
              label.className = "label";
              label.textContent = item.label || "Action";
              button.appendChild(label);

              if (item.description) {
                const desc = document.createElement("span");
                desc.className = "desc";
                desc.textContent = item.description;
                button.appendChild(desc);
              }

              items.appendChild(button);
              continue;
            }

            const row = document.createElement("article");
            row.className = "item";

            const line = document.createElement("div");
            line.className = "line";

            const labelWrap = document.createElement("div");
            labelWrap.style.display = "flex";
            labelWrap.style.alignItems = "center";
            labelWrap.style.gap = "8px";

            labelWrap.appendChild(createToneDot(item.tone));

            const label = document.createElement("span");
            label.className = "label";
            label.textContent = item.label || "Item";
            labelWrap.appendChild(label);

            line.appendChild(labelWrap);
            row.appendChild(line);

            if (item.description) {
              const desc = document.createElement("p");
              desc.className = "desc";
              desc.textContent = item.description;
              row.appendChild(desc);
            }

            items.appendChild(row);
          }
        }

        panel.appendChild(items);
        root.appendChild(panel);
      }
    }

    root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const cancelButton = target.closest("button[data-event='cancelQr']");
      if (cancelButton instanceof HTMLButtonElement) {
        vscode.postMessage({ type: "cancelQr" });
        return;
      }

      const actionButton = target.closest("button[data-action]");
      if (!(actionButton instanceof HTMLButtonElement)) {
        return;
      }

      const action = actionButton.dataset.action;
      if (!action) {
        return;
      }

      vscode.postMessage({
        type: "action",
        action,
      });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || message.type !== "state") {
        return;
      }

      render(message.payload || {});
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
  }
}

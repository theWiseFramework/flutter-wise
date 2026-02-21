import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { resolveFlutterPath } from "../../core/flutterPath";
import { commandExists, execCmd } from "../../core/exec";
import { createNonce } from "../shared/webview";

type CreateProjectPayload = {
  name: string;
  folder: string;
  appId?: string;
  platforms: string[];
  extraArgs?: string;
};

type NewProjectMessage =
  | { type: "ready" }
  | { type: "pickFolder" }
  | { type: "createProject"; payload: CreateProjectPayload };

const VALID_PROJECT_NAME = /^[a-z][a-z0-9_]*$/;
const VALID_APP_ID_PART = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const ALL_PLATFORMS = [
  "android",
  "ios",
  "web",
  "linux",
  "macos",
  "windows",
] as const;

export class FlutterWiseNewProjectWebviewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  private view?: vscode.WebviewView;
  private busy = false;
  private readonly output = vscode.window.createOutputChannel(
    "Flutter Wise: New Project",
  );
  private readonly subscriptions: vscode.Disposable[] = [this.output];

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
      webviewView.webview.onDidReceiveMessage((message: NewProjectMessage) => {
        void this.onMessage(message);
      }),
    );

    void this.postInitState();
  }

  private async onMessage(message: NewProjectMessage): Promise<void> {
    if (!this.view) {
      return;
    }

    if (message.type === "ready") {
      await this.postInitState();
      return;
    }

    if (message.type === "pickFolder") {
      await this.pickFolder();
      return;
    }

    if (message.type === "createProject") {
      await this.createProject(message.payload);
    }
  }

  private async postInitState(): Promise<void> {
    if (!this.view) {
      return;
    }

    const defaultFolder =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.env.HOME ?? "";

    await this.view.webview.postMessage({
      type: "init",
      payload: {
        defaultFolder,
      },
    });
  }

  private async pickFolder(): Promise<void> {
    if (!this.view) {
      return;
    }

    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select project parent folder",
    });

    if (!selected || selected.length === 0) {
      return;
    }

    await this.view.webview.postMessage({
      type: "setFolder",
      payload: {
        folder: selected[0].fsPath,
      },
    });
  }

  private async createProject(payload: CreateProjectPayload): Promise<void> {
    if (this.busy) {
      return;
    }

    const name = payload.name.trim();
    const folder = payload.folder.trim();
    const appId = payload.appId?.trim() ?? "";
    const extraArgs = payload.extraArgs?.trim() ?? "";

    if (!name) {
      this.postError("Project name is required.");
      return;
    }

    if (!VALID_PROJECT_NAME.test(name)) {
      this.postError(
        "Project name must start with a lowercase letter and use only lowercase letters, numbers, and underscores.",
      );
      return;
    }

    if (!folder) {
      this.postError("Parent folder is required.");
      return;
    }

    const platforms = payload.platforms.filter((platform): platform is string =>
      ALL_PLATFORMS.includes(platform as (typeof ALL_PLATFORMS)[number]),
    );

    let org: string | undefined;
    let derivedProjectName: string | undefined;

    if (appId) {
      const idParts = appId.split(".").filter((part) => part.length > 0);
      if (idParts.length < 2 || idParts.some((part) => !VALID_APP_ID_PART.test(part))) {
        this.postError(
          "App ID must be in reverse-domain format (example: com.example.my_app).",
        );
        return;
      }

      org = idParts.slice(0, -1).join(".");
      derivedProjectName = idParts[idParts.length - 1];

      if (!derivedProjectName || !VALID_PROJECT_NAME.test(derivedProjectName)) {
        this.postError(
          "The last segment of App ID must be a valid Dart package name (example: my_app).",
        );
        return;
      }
    }

    try {
      const folderStat = await fs.stat(folder);
      if (!folderStat.isDirectory()) {
        this.postError("Selected parent path is not a folder.");
        return;
      }
    } catch {
      this.postError("Selected parent folder does not exist.");
      return;
    }

    const targetPath = path.join(folder, name);
    try {
      await fs.access(targetPath);
      this.postError("Target folder already exists. Choose another name or folder.");
      return;
    } catch {
      // expected when folder does not yet exist
    }

    const flutter = await resolveFlutterPath();
    const flutterInstalled = await commandExists(flutter);
    if (!flutterInstalled) {
      this.postError(
        'Flutter SDK was not found. Ensure "flutter" is available in PATH or configured in VS Code settings.',
      );
      return;
    }

    const args: string[] = ["create"];

    if (platforms.length > 0) {
      args.push("--platforms", platforms.join(","));
    }

    if (org) {
      args.push("--org", org);
    }

    if (derivedProjectName && derivedProjectName !== name) {
      args.push("--project-name", derivedProjectName);
    }

    const parsedExtraArgs = this.parseExtraArgs(extraArgs);
    if (!parsedExtraArgs.ok) {
      this.postError(parsedExtraArgs.error);
      return;
    }

    args.push(...parsedExtraArgs.args, targetPath);

    this.busy = true;
    await this.postBusy(true);

    this.output.clear();
    this.output.appendLine(`$ ${flutter} ${args.join(" ")}`);

    try {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Flutter Wise: Creating new Flutter project",
          cancellable: false,
        },
        async () => execCmd(flutter, args, folder),
      );

      if (result.stdout.trim()) {
        this.output.appendLine(result.stdout.trim());
      }
      if (result.stderr.trim()) {
        this.output.appendLine(result.stderr.trim());
      }

      if (result.code !== 0) {
        this.output.show(true);
        this.postError(
          `Flutter create failed. Check output for details (exit code ${result.code}).`,
        );
        return;
      }

      this.postSuccess(`Project created at ${targetPath}`);
      await vscode.commands.executeCommand(
        "vscode.openFolder",
        vscode.Uri.file(targetPath),
        true,
      );
    } finally {
      this.busy = false;
      await this.postBusy(false);
    }
  }

  private parseExtraArgs(
    input: string,
  ): { ok: true; args: string[] } | { ok: false; error: string } {
    if (!input) {
      return { ok: true, args: [] };
    }

    const tokens: string[] = [];
    let current = "";
    let quote: '"' | "'" | null = null;
    let escaped = false;

    for (const char of input) {
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (quote) {
        if (char === quote) {
          quote = null;
        } else {
          current += char;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (/\s/.test(char)) {
        if (current.length > 0) {
          tokens.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (escaped || quote) {
      return {
        ok: false,
        error: "Optional args contain unclosed quotes or escape sequences.",
      };
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return { ok: true, args: tokens };
  }

  private postError(message: string): void {
    void this.view?.webview.postMessage({
      type: "error",
      payload: { message },
    });
    vscode.window.showErrorMessage(message);
  }

  private postSuccess(message: string): void {
    void this.view?.webview.postMessage({
      type: "success",
      payload: { message },
    });
  }

  private async postBusy(isBusy: boolean): Promise<void> {
    await this.view?.webview.postMessage({
      type: "busy",
      payload: { isBusy },
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
    content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Flutter Wise New Project</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-sideBar-background);
      --card: color-mix(in srgb, var(--vscode-editor-background) 74%, transparent);
      --border: color-mix(in srgb, var(--vscode-foreground) 18%, transparent);
      --muted: var(--vscode-descriptionForeground);
      --text: var(--vscode-foreground);
      --accent: var(--vscode-button-background);
      --accentText: var(--vscode-button-foreground);
      --danger: var(--vscode-errorForeground);
      --ok: #2ea043;
      --radius: 12px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.35;
      padding: 12px;
    }

    .panel {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: linear-gradient(160deg, var(--card), transparent 86%);
      padding: 12px;
      display: grid;
      gap: 10px;
    }

    .title {
      margin: 0;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      font-weight: 600;
    }

    .row {
      display: grid;
      gap: 6px;
    }

    .label {
      font-size: 11px;
      color: var(--muted);
      margin: 0;
    }

    input[type="text"] {
      width: 100%;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--card) 80%, transparent);
      color: var(--text);
      border-radius: 8px;
      font: inherit;
      padding: 7px 8px;
    }

    input[type="text"]:focus-visible {
      outline: 1px solid var(--accent);
      outline-offset: 1px;
    }

    .folder-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 6px;
    }

    .ghost {
      border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
      border-radius: 8px;
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      color: var(--text);
      padding: 6px 9px;
      font: inherit;
      cursor: pointer;
      white-space: nowrap;
    }

    .ghost:hover {
      background: color-mix(in srgb, var(--accent) 20%, transparent);
    }

    .platforms {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
      border-radius: 10px;
      padding: 8px;
      background: color-mix(in srgb, var(--card) 72%, transparent);
    }

    .platform {
      display: flex;
      gap: 6px;
      align-items: center;
      font-size: 11px;
    }

    .actions {
      display: grid;
      gap: 8px;
    }

    .create {
      border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
      border-radius: 10px;
      background: color-mix(in srgb, var(--accent) 24%, transparent);
      color: var(--accentText);
      font: inherit;
      font-weight: 600;
      padding: 8px 10px;
      cursor: pointer;
    }

    .create:hover {
      background: color-mix(in srgb, var(--accent) 34%, transparent);
    }

    .create:disabled,
    .ghost:disabled,
    input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .hint {
      margin: 0;
      font-size: 10px;
      color: var(--muted);
    }

    .message {
      margin: 0;
      font-size: 11px;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid transparent;
      display: none;
    }

    .message.error {
      display: block;
      color: var(--danger);
      border-color: color-mix(in srgb, var(--danger) 45%, transparent);
      background: color-mix(in srgb, var(--danger) 12%, transparent);
    }

    .message.success {
      display: block;
      color: var(--ok);
      border-color: color-mix(in srgb, var(--ok) 50%, transparent);
      background: color-mix(in srgb, var(--ok) 10%, transparent);
    }
  </style>
</head>
<body>
  <form id="form" class="panel">
    <h3 class="title">New Flutter Project</h3>

    <div class="row">
      <p class="label">Name</p>
      <input id="name" type="text" placeholder="my_app" required />
    </div>

    <div class="row">
      <p class="label">Parent Folder</p>
      <div class="folder-row">
        <input id="folder" type="text" placeholder="/path/to/projects" required />
        <button id="browse" type="button" class="ghost">Browse</button>
      </div>
    </div>

    <div class="row">
      <p class="label">App ID (optional)</p>
      <input id="appId" type="text" placeholder="com.example.my_app" />
      <p class="hint">If provided, this controls --org and package id suffix.</p>
    </div>

    <div class="row">
      <p class="label">Target Platforms</p>
      <div class="platforms">
        <label class="platform"><input type="checkbox" value="android" checked /> Android</label>
        <label class="platform"><input type="checkbox" value="ios" checked /> iOS</label>
        <label class="platform"><input type="checkbox" value="web" checked /> Web</label>
        <label class="platform"><input type="checkbox" value="linux" checked /> Linux</label>
        <label class="platform"><input type="checkbox" value="macos" checked /> macOS</label>
        <label class="platform"><input type="checkbox" value="windows" checked /> Windows</label>
      </div>
    </div>

    <div class="row">
      <p class="label">Optional Args</p>
      <input id="extraArgs" type="text" placeholder="--template app --empty" />
      <p class="hint">Extra args are appended to flutter create.</p>
    </div>

    <p id="message" class="message"></p>

    <div class="actions">
      <button id="create" class="create" type="submit">Create Project</button>
    </div>
  </form>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const form = document.getElementById("form");
    const nameInput = document.getElementById("name");
    const folderInput = document.getElementById("folder");
    const appIdInput = document.getElementById("appId");
    const extraArgsInput = document.getElementById("extraArgs");
    const browseButton = document.getElementById("browse");
    const createButton = document.getElementById("create");
    const messageEl = document.getElementById("message");

    function setBusy(isBusy) {
      for (const input of form.querySelectorAll("input")) {
        input.disabled = isBusy;
      }
      browseButton.disabled = isBusy;
      createButton.disabled = isBusy;
      createButton.textContent = isBusy ? "Creating..." : "Create Project";
    }

    function setMessage(type, text) {
      messageEl.className = "message";
      messageEl.textContent = "";

      if (!type || !text) {
        return;
      }

      messageEl.classList.add(type);
      messageEl.textContent = text;
    }

    browseButton.addEventListener("click", () => {
      vscode.postMessage({ type: "pickFolder" });
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const platforms = [];
      for (const checkbox of form.querySelectorAll('.platforms input[type="checkbox"]')) {
        if (checkbox.checked) {
          platforms.push(checkbox.value);
        }
      }

      setMessage();
      vscode.postMessage({
        type: "createProject",
        payload: {
          name: nameInput.value,
          folder: folderInput.value,
          appId: appIdInput.value,
          platforms,
          extraArgs: extraArgsInput.value,
        },
      });
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message) {
        return;
      }

      if (message.type === "init") {
        if (!folderInput.value) {
          folderInput.value = message.payload?.defaultFolder || "";
        }
        if (!nameInput.value) {
          nameInput.value = "my_app";
        }
        return;
      }

      if (message.type === "setFolder") {
        folderInput.value = message.payload?.folder || "";
        return;
      }

      if (message.type === "busy") {
        setBusy(Boolean(message.payload?.isBusy));
        return;
      }

      if (message.type === "error") {
        setMessage("error", message.payload?.message || "Failed.");
        return;
      }

      if (message.type === "success") {
        setMessage("success", message.payload?.message || "Done.");
      }
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
  }
}

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { resolveFlutterPath } from "../../core/flutterPath";
import { commandExists, execCmd } from "../../core/exec";
import { createNonce } from "../shared/webview";

type TemplateValue =
  | "app"
  | "module"
  | "package"
  | "plugin"
  | "plugin_ffi";

type AndroidLanguage = "kotlin" | "java";
type IosLanguage = "swift" | "objc";

type CreateProjectPayload = {
  folder: string;
  folderName: string;
  projectName?: string;
  description?: string;
  appId?: string;
  emptyProject?: boolean;
  template?: TemplateValue;
  androidLanguage?: AndroidLanguage;
  iosLanguage?: IosLanguage;
  platforms: string[];
  extraArgs?: string;
};

type NewProjectMessage =
  | { type: "ready" }
  | { type: "pickFolder" }
  | { type: "createProject"; payload: CreateProjectPayload };

const VALID_PROJECT_NAME = /^[a-z][a-z0-9_]*$/;
const VALID_APP_ID_PART = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const TEMPLATE_OPTIONS = [
  "app",
  "module",
  "package",
  "plugin",
  "plugin_ffi",
] as const;
const ALL_PLATFORMS = [
  "android",
  "ios",
  "web",
  "linux",
  "macos",
  "windows",
] as const;
const ANDROID_LANG_OPTIONS = ["kotlin", "java"] as const;
const IOS_LANG_OPTIONS = ["swift", "objc"] as const;

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

    const folder = payload.folder.trim();
    const folderName = payload.folderName.trim();
    const explicitProjectName = payload.projectName?.trim() ?? "";
    const description = payload.description?.trim() ?? "";
    const appId = payload.appId?.trim() ?? "";
    const emptyProject = Boolean(payload.emptyProject);
    const template = payload.template ?? "app";
    const androidLanguage = payload.androidLanguage?.trim() ?? "";
    const iosLanguage = payload.iosLanguage?.trim() ?? "";
    const extraArgs = payload.extraArgs?.trim() ?? "";

    if (!folder) {
      this.postError("Parent folder is required.");
      return;
    }

    if (!folderName) {
      this.postError("Folder name is required.");
      return;
    }

    if (
      folderName.includes("/") ||
      folderName.includes("\\") ||
      folderName === "." ||
      folderName === ".."
    ) {
      this.postError("Folder name must be a single folder segment.");
      return;
    }

    let org: string | undefined;
    let projectNameFromAppId: string | undefined;

    if (appId) {
      const idParts = appId.split(".").filter((part) => part.length > 0);
      if (
        idParts.length < 2 ||
        idParts.some((part) => !VALID_APP_ID_PART.test(part))
      ) {
        this.postError(
          "App ID must be in reverse-domain format (example: com.example.my_app).",
        );
        return;
      }

      org = idParts.slice(0, -1).join(".");
      projectNameFromAppId = idParts[idParts.length - 1];

      if (!VALID_PROJECT_NAME.test(projectNameFromAppId)) {
        this.postError(
          "The last segment of App ID must be a valid Dart package name (example: my_app).",
        );
        return;
      }
    }

    if (explicitProjectName && !VALID_PROJECT_NAME.test(explicitProjectName)) {
      this.postError(
        "Project Name must start with a lowercase letter and use only lowercase letters, numbers, and underscores.",
      );
      return;
    }

    if (
      explicitProjectName &&
      projectNameFromAppId &&
      explicitProjectName !== projectNameFromAppId
    ) {
      this.postError(
        "Project Name must match the last segment of App ID because Flutter derives app id from org + project name.",
      );
      return;
    }

    let resolvedProjectName = explicitProjectName || projectNameFromAppId || "";
    if (!resolvedProjectName) {
      if (!VALID_PROJECT_NAME.test(folderName)) {
        this.postError(
          "Folder name is not a valid Dart package name. Provide Project Name explicitly.",
        );
        return;
      }

      resolvedProjectName = folderName;
    }

    if (!TEMPLATE_OPTIONS.includes(template)) {
      this.postError("Selected template is invalid.");
      return;
    }

    const supportsPlatforms = template !== "package" && template !== "module";
    const supportsAndroidLanguage = template !== "plugin_ffi";

    if (
      androidLanguage &&
      !ANDROID_LANG_OPTIONS.includes(androidLanguage as AndroidLanguage)
    ) {
      this.postError("android-language must be kotlin or java.");
      return;
    }

    if (iosLanguage && !IOS_LANG_OPTIONS.includes(iosLanguage as IosLanguage)) {
      this.postError("ios-language must be swift or objc.");
      return;
    }

    const selectedPlatforms = payload.platforms.filter((platform): platform is string =>
      ALL_PLATFORMS.includes(platform as (typeof ALL_PLATFORMS)[number]),
    );
    const platforms = supportsPlatforms ? selectedPlatforms : [];

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

    const targetPath = path.join(folder, folderName);
    try {
      await fs.access(targetPath);
      this.postError("Target folder already exists. Choose another folder name.");
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

    if (description) {
      args.push("--description", description);
    }

    if (org) {
      args.push("--org", org);
    }

    if (resolvedProjectName !== folderName) {
      args.push("--project-name", resolvedProjectName);
    }

    if (supportsAndroidLanguage && androidLanguage) {
      args.push("--android-language", androidLanguage);
    }

    if (iosLanguage) {
      args.push("--ios-language", iosLanguage);
    }

    if (emptyProject) {
      args.push("--empty");
    } else if (template !== "app") {
      args.push("--template", template);
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

    input[type="text"],
    select {
      width: 100%;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--card) 80%, transparent);
      color: var(--text);
      border-radius: 8px;
      font: inherit;
      padding: 7px 8px;
    }

    input[type="text"]:focus-visible,
    select:focus-visible {
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

    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
      border-radius: 10px;
      padding: 8px;
      background: color-mix(in srgb, var(--card) 72%, transparent);
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
    input:disabled,
    select:disabled {
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
      <p class="label">Parent Folder</p>
      <div class="folder-row">
        <input id="folder" type="text" placeholder="/path/to/projects" required />
        <button id="browse" type="button" class="ghost">Browse</button>
      </div>
    </div>

    <div class="row">
      <p class="label">Folder Name</p>
      <input id="folderName" type="text" placeholder="my_app_folder" required />
    </div>

    <div class="row">
      <p class="label">Project Name (optional)</p>
      <input id="projectName" type="text" placeholder="my_app" />
      <p class="hint">Dart package name. Needed when folder name is not a valid package name.</p>
    </div>

    <div class="row">
      <p class="label">Description (optional)</p>
      <input id="description" type="text" placeholder="A new Flutter project." />
    </div>

    <div class="row">
      <p class="label">App ID (optional)</p>
      <input id="appId" type="text" placeholder="com.example.my_app" />
      <p class="hint">Maps to --org + package suffix. If Project Name is set, it must match App ID suffix.</p>
    </div>

    <div class="row">
      <p class="label">Target Platforms</p>
      <div id="platforms" class="platforms">
        <label class="platform"><input type="checkbox" value="android" checked /> Android</label>
        <label class="platform"><input type="checkbox" value="ios" checked /> iOS</label>
        <label class="platform"><input type="checkbox" value="web" checked /> Web</label>
        <label class="platform"><input type="checkbox" value="linux" checked /> Linux</label>
        <label class="platform"><input type="checkbox" value="macos" checked /> macOS</label>
        <label class="platform"><input type="checkbox" value="windows" checked /> Windows</label>
      </div>
      <p id="platformsHint" class="hint"></p>
    </div>

    <div class="row">
      <p class="label">Empty Project</p>
      <label class="check"><input id="emptyProject" type="checkbox" /> Use --empty and disable template</label>
    </div>

    <div class="row">
      <p class="label">Template (optional)</p>
      <select id="template">
        <option value="app" selected>app (default)</option>
        <option value="module">module</option>
        <option value="package">package</option>
        <option value="plugin">plugin</option>
        <option value="plugin_ffi">plugin_ffi</option>
      </select>
    </div>

    <div class="row">
      <p class="label">android-language (optional)</p>
      <select id="androidLanguage">
        <option value="">default</option>
        <option value="kotlin">kotlin</option>
        <option value="java">java</option>
      </select>
      <p id="androidLangHint" class="hint"></p>
    </div>

    <div class="row">
      <p class="label">ios-language (optional)</p>
      <select id="iosLanguage">
        <option value="">default</option>
        <option value="swift">swift</option>
        <option value="objc">objc</option>
      </select>
    </div>

    <div class="row">
      <p class="label">Optional Args</p>
      <input id="extraArgs" type="text" placeholder="--sample=counter" />
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
    const folderInput = document.getElementById("folder");
    const folderNameInput = document.getElementById("folderName");
    const projectNameInput = document.getElementById("projectName");
    const descriptionInput = document.getElementById("description");
    const appIdInput = document.getElementById("appId");
    const emptyProjectInput = document.getElementById("emptyProject");
    const templateSelect = document.getElementById("template");
    const platformsContainer = document.getElementById("platforms");
    const platformsHint = document.getElementById("platformsHint");
    const platformCheckboxes = Array.from(form.querySelectorAll('.platforms input[type="checkbox"]'));
    const androidLanguageSelect = document.getElementById("androidLanguage");
    const androidLangHint = document.getElementById("androidLangHint");
    const iosLanguageSelect = document.getElementById("iosLanguage");
    const extraArgsInput = document.getElementById("extraArgs");
    const browseButton = document.getElementById("browse");
    const createButton = document.getElementById("create");
    const messageEl = document.getElementById("message");

    function syncTemplateConstraints() {
      const template = templateSelect.value;
      const supportsPlatforms = template !== "package" && template !== "module";
      const supportsAndroidLanguage = template !== "plugin_ffi";

      for (const checkbox of platformCheckboxes) {
        checkbox.disabled = !supportsPlatforms;
      }
      platformsContainer.style.opacity = supportsPlatforms ? "1" : "0.6";
      platformsHint.textContent = supportsPlatforms
        ? ""
        : 'The "--platforms" option is not supported for template "package" or "module".';

      androidLanguageSelect.disabled = !supportsAndroidLanguage;
      if (!supportsAndroidLanguage) {
        androidLanguageSelect.value = "";
      }
      androidLangHint.textContent = supportsAndroidLanguage
        ? ""
        : 'The "android-language" option is ignored for template "plugin_ffi".';
    }

    function syncEmptyState() {
      const emptyChecked = Boolean(emptyProjectInput.checked);
      templateSelect.disabled = emptyChecked;
      if (emptyChecked) {
        templateSelect.value = "app";
      }
      syncTemplateConstraints();
    }

    function setBusy(isBusy) {
      for (const input of form.querySelectorAll("input, select")) {
        input.disabled = isBusy;
      }
      browseButton.disabled = isBusy;
      createButton.disabled = isBusy;
      createButton.textContent = isBusy ? "Creating..." : "Create Project";

      if (!isBusy) {
        syncEmptyState();
      }
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

    emptyProjectInput.addEventListener("change", () => {
      syncEmptyState();
    });
    templateSelect.addEventListener("change", () => {
      syncTemplateConstraints();
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
          folder: folderInput.value,
          folderName: folderNameInput.value,
          projectName: projectNameInput.value,
          description: descriptionInput.value,
          appId: appIdInput.value,
          emptyProject: emptyProjectInput.checked,
          template: templateSelect.value,
          androidLanguage: androidLanguageSelect.value,
          iosLanguage: iosLanguageSelect.value,
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
        if (!folderNameInput.value) {
          folderNameInput.value = "my_app";
        }
        syncEmptyState();
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

    syncEmptyState();
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
  }
}

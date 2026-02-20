import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { commandExists, execCmd, showToolMissing } from "../core/exec";
import { resolveAdbPath } from "../core/adbPath";

type Node =
  | { kind: "group"; label: string; icon: vscode.ThemeIcon; children: Node[] }
  | {
      kind: "action";
      label: string;
      description?: string;
      icon: vscode.ThemeIcon;
      command?: vscode.Command;
      contextValue?: string;
    };

type AdbDevice = {
  serial: string;
  state: string;
  model?: string;
  details?: string;
};

type MdnsService = {
  instance: string;
  serviceType: string;
  endpoint: string;
};

const CMD_REFRESH = "flutterWise.devices.refresh";
const CMD_CONNECT = "flutterWise.devices.connect";
const CMD_CONNECT_IP = "flutterWise.devices.connect.ip";
const CMD_CONNECT_QR = "flutterWise.devices.connect.qr";
const CMD_CONNECT_PAIR = "flutterWise.devices.connect.pair";

type ConnectMethod = "ip" | "qr" | "pair";

const ADB_TLS_PAIRING_SERVICE = "_adb-tls-pairing._tcp";
const ADB_TLS_CONNECT_SERVICE = "_adb-tls-connect._tcp";
const QR_SCAN_TIMEOUT_MS = 90_000;
const CONNECT_DISCOVERY_TIMEOUT_MS = 20_000;

export class FlutterWiseDevicesProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChangeTreeData = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: Node): vscode.TreeItem {
    if (element.kind === "group") {
      const item = new vscode.TreeItem(
        element.label,
        element.children.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None,
      );
      item.iconPath = element.icon;
      return item;
    }

    const item = new vscode.TreeItem(element.label);
    item.description = element.description;
    item.iconPath = element.icon;
    item.command = element.command;
    item.contextValue = element.contextValue;
    return item;
  }

  async getChildren(element?: Node): Promise<Node[]> {
    if (element?.kind === "group") {
      return element.children;
    }

    return this.buildRootNodes();
  }

  refresh() {
    this._onDidChangeTreeData.fire(undefined);
  }

  async promptConnectMethod(): Promise<void> {
    const adbReady = await this.ensureAdbReady(true);
    if (!adbReady) {
      return;
    }

    const method = await vscode.window.showQuickPick<
      vscode.QuickPickItem & { method: ConnectMethod }
    >(
      [
        {
          label: "Connect by IP address",
          description: "Run adb connect <host:port>",
          method: "ip",
        },
        {
          label: "Connect by QR code",
          description: "Show QR code for Android Wireless debugging",
          method: "qr",
        },
        {
          label: "Connect by pairing code",
          description: "Run adb pair <host:port> <code>",
          method: "pair",
        },
      ],
      {
        title: "Connect Android Device",
        placeHolder: "Choose connection method",
      },
    );

    if (!method) {
      return;
    }

    switch (method.method) {
      case "ip":
        await this.connectByIpAddress();
        break;
      case "qr":
        await this.connectByQrCode();
        break;
      case "pair":
        await this.connectByPairingCode();
        break;
      default:
        break;
    }

    this.refresh();
  }

  async connectByIpAddress(): Promise<void> {
    if (!(await this.ensureAdbReady(true))) {
      return;
    }

    const endpoint = await vscode.window.showInputBox({
      title: "Connect Device by IP",
      prompt: "Enter device endpoint (example: 192.168.1.17:5555)",
      validateInput: (value) => {
        if (!value.trim()) {
          return "Endpoint is required";
        }
        return null;
      },
    });
    if (!endpoint) {
      return;
    }

    await this.runAdbConnect(endpoint.trim());
  }

  async connectByPairingCode(): Promise<void> {
    if (!(await this.ensureAdbReady(true))) {
      return;
    }

    const pairEndpoint = await vscode.window.showInputBox({
      title: "Pair Device",
      prompt: "Enter pairing endpoint (example: 192.168.1.17:42115)",
      validateInput: (value) => {
        if (!value.trim()) {
          return "Pairing endpoint is required";
        }
        return null;
      },
    });
    if (!pairEndpoint) {
      return;
    }

    const pairingCode = await vscode.window.showInputBox({
      title: "Pair Device",
      prompt: "Enter pairing code from Android wireless debugging screen",
      password: true,
      validateInput: (value) => {
        if (!value.trim()) {
          return "Pairing code is required";
        }
        return null;
      },
    });
    if (!pairingCode) {
      return;
    }

    const adb = await resolveAdbPath();

    const pairResult = await execCmd(adb!, [
      "pair",
      pairEndpoint.trim(),
      pairingCode.trim(),
    ]);
    if (pairResult.code !== 0) {
      const reason =
        this.cleanOutput(pairResult.stderr) ||
        this.cleanOutput(pairResult.stdout);
      vscode.window.showErrorMessage(
        `adb pair failed${reason ? `: ${reason}` : ""}`,
      );
      return;
    }

    const pairOutput =
      this.cleanOutput(pairResult.stdout) || "Pairing succeeded.";
    vscode.window.showInformationMessage(pairOutput);

    const suggestedHost = pairEndpoint.trim().split(":")[0];
    const connectEndpoint = await vscode.window.showInputBox({
      title: "Connect Device",
      prompt: "Enter connect endpoint (example: 192.168.1.17:5555)",
      value: suggestedHost ? `${suggestedHost}:5555` : "",
      validateInput: (value) => {
        if (!value.trim()) {
          return "Connect endpoint is required";
        }
        return null;
      },
    });
    if (!connectEndpoint) {
      return;
    }

    await this.runAdbConnect(connectEndpoint.trim());
  }

  async connectByQrCode(): Promise<void> {
    if (!(await this.ensureAdbReady(true))) {
      return;
    }

    const adb = await resolveAdbPath();
    const pairServiceName = `studio-${this.randomFromAlphabet(8, "abcdefghijklmnopqrstuvwxyz0123456789")}`;
    const pairCode = this.randomFromAlphabet(12, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    const payload = `WIFI:T:ADB;S:${pairServiceName};P:${pairCode};;`;
    this.showQrPairingPanel(payload, pairServiceName, pairCode);

    const knownConnectEndpoints = new Set(
      (await this.listMdnsServices(adb!))
        .filter((service) =>
          service.serviceType.includes(ADB_TLS_CONNECT_SERVICE),
        )
        .map((service) => service.endpoint),
    );

    const pairingEndpoint = await vscode.window.withProgress<string | undefined>(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Flutter Wise: Waiting for QR scan",
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({
          message:
            "Scan the QR code from Android Wireless debugging to start pairing.",
        });
        return this.waitForPairingEndpoint(
          adb!,
          pairServiceName,
          QR_SCAN_TIMEOUT_MS,
          token,
          progress,
        );
      },
    );
    if (!pairingEndpoint) {
      vscode.window.showWarningMessage(
        "QR pairing timed out. Scan the QR code again and retry.",
      );
      return;
    }

    const pairResult = await execCmd(adb!, [
      "pair",
      pairingEndpoint,
      pairCode,
    ]);
    if (pairResult.code !== 0) {
      const reason =
        this.cleanOutput(pairResult.stderr) ||
        this.cleanOutput(pairResult.stdout);
      vscode.window.showErrorMessage(
        `adb pair failed${reason ? `: ${reason}` : ""}`,
      );
      return;
    }

    const pairOutput =
      this.cleanOutput(pairResult.stdout) || "Pairing succeeded.";
    vscode.window.showInformationMessage(pairOutput);

    const connectEndpoint = await this.waitForConnectEndpoint(
      adb!,
      knownConnectEndpoints,
      CONNECT_DISCOVERY_TIMEOUT_MS,
    );
    if (!connectEndpoint) {
      vscode.window.showInformationMessage(
        "Device paired. If it is not connected yet, tap Refresh or use Connect by IP.",
      );
      this.refresh();
      return;
    }

    await this.runAdbConnect(connectEndpoint);
    this.refresh();
  }

  private async buildRootNodes(): Promise<Node[]> {
    const adb = await resolveAdbPath();
    const adbExists = await commandExists(adb!);
    if (!adbExists) {
      return [
        {
          kind: "group",
          label: "ADB Status",
          icon: new vscode.ThemeIcon("warning"),
          children: [
            {
              kind: "action",
              label: "adb not found in PATH",
              description: "Install Android platform-tools",
              icon: new vscode.ThemeIcon("error"),
            },
          ],
        },
      ];
    }

    const startServer = await execCmd(adb!, ["start-server"]);
    const devicesResult = await execCmd(adb!, ["devices", "-l"]);
    const adbOk = startServer.code === 0 && devicesResult.code === 0;
    const devices = adbOk ? this.parseAdbDevices(devicesResult.stdout) : [];

    return [
      {
        kind: "group",
        label: "ADB Status",
        icon: new vscode.ThemeIcon(adbOk ? "pass-filled" : "error"),
        children: [
          {
            kind: "action",
            label: adbOk ? "adb ready" : "adb failed",
            description: adbOk
              ? "Server reachable"
              : this.cleanOutput(startServer.stderr) ||
                this.cleanOutput(devicesResult.stderr) ||
                "Check adb setup and retry",
            icon: new vscode.ThemeIcon(adbOk ? "check" : "error"),
          },
        ],
      },
      {
        kind: "group",
        label: "Connected Devices",
        icon: new vscode.ThemeIcon("device-mobile"),
        children:
          devices.length > 0
            ? devices.map<Node>((device) => ({
                kind: "action",
                label: device.model ?? device.serial,
                description: device.details
                  ? `${device.state} · ${device.details}`
                  : device.state,
                icon: new vscode.ThemeIcon(
                  device.state === "device" ? "vm-active" : "warning",
                ),
              }))
            : [
                {
                  kind: "action",
                  label: "No connected devices",
                  description: "Enable USB debugging or wireless debugging",
                  icon: new vscode.ThemeIcon("circle-slash"),
                },
              ],
      },
      {
        kind: "group",
        label: "Connection",
        icon: new vscode.ThemeIcon("plug"),
        children: [
          {
            kind: "action",
            label: "Connect Device…",
            description: "IP address, QR code, or pairing code",
            icon: new vscode.ThemeIcon("add"),
            command: {
              command: CMD_CONNECT,
              title: "Connect Device",
            },
          },
          {
            kind: "action",
            label: "Connect by IP",
            icon: new vscode.ThemeIcon("globe"),
            command: {
              command: CMD_CONNECT_IP,
              title: "Connect by IP",
            },
          },
          {
            kind: "action",
            label: "Connect by QR",
            icon: new vscode.ThemeIcon("symbol-event"),
            command: {
              command: CMD_CONNECT_QR,
              title: "Connect by QR",
            },
          },
          {
            kind: "action",
            label: "Connect by Pairing Code",
            icon: new vscode.ThemeIcon("key"),
            command: {
              command: CMD_CONNECT_PAIR,
              title: "Connect by Pairing Code",
            },
          },
          {
            kind: "action",
            label: "Refresh",
            icon: new vscode.ThemeIcon("refresh"),
            command: {
              command: CMD_REFRESH,
              title: "Refresh Devices",
            },
          },
        ],
      },
    ];
  }

  private parseAdbDevices(stdout: string): AdbDevice[] {
    const devices: AdbDevice[] = [];

    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("List of devices attached")) {
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 2) {
        continue;
      }

      const serial = parts[0];
      const state = parts[1];

      // Everything after state is key:value pairs
      const kvParts = parts.slice(2);

      const kv: Record<string, string> = {};
      for (const part of kvParts) {
        const [key, value] = part.split(":");
        if (key && value) {
          kv[key] = value;
        }
      }

      devices.push({
        serial,
        state,
        model: kv["model"] ?? undefined,
        details: kvParts.join(" ") || undefined,
      });
    }

    return devices;
  }

  private async waitForPairingEndpoint(
    adb: string,
    pairServiceName: string,
    timeoutMs: number,
    token: vscode.CancellationToken,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<string | undefined> {
    const startedAt = Date.now();
    let lastProgress = 0;

    while (Date.now() - startedAt < timeoutMs) {
      if (token.isCancellationRequested) {
        return undefined;
      }

      const elapsed = Date.now() - startedAt;
      const percent = Math.min(99, Math.floor((elapsed / timeoutMs) * 100));
      if (percent > lastProgress) {
        progress.report({
          increment: percent - lastProgress,
          message: `Waiting for phone scan... ${Math.ceil((timeoutMs - elapsed) / 1000)}s`,
        });
        lastProgress = percent;
      }

      const services = await this.listMdnsServices(adb);
      const pairingService = services.find(
        (service) =>
          service.instance === pairServiceName &&
          service.serviceType.includes(ADB_TLS_PAIRING_SERVICE),
      );
      if (pairingService) {
        return pairingService.endpoint;
      }

      await this.sleep(1000);
    }

    return undefined;
  }

  private async waitForConnectEndpoint(
    adb: string,
    knownConnectEndpoints: Set<string>,
    timeoutMs: number,
  ): Promise<string | undefined> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const services = await this.listMdnsServices(adb);
      const connectServices = services.filter((service) =>
        service.serviceType.includes(ADB_TLS_CONNECT_SERVICE),
      );

      const fresh = connectServices.find(
        (service) => !knownConnectEndpoints.has(service.endpoint),
      );
      if (fresh) {
        return fresh.endpoint;
      }

      await this.sleep(1000);
    }

    const finalServices = await this.listMdnsServices(adb);
    const finalConnectServices = finalServices.filter((service) =>
      service.serviceType.includes(ADB_TLS_CONNECT_SERVICE),
    );
    if (finalConnectServices.length === 1) {
      return finalConnectServices[0].endpoint;
    }

    return undefined;
  }

  private async listMdnsServices(adb: string): Promise<MdnsService[]> {
    const result = await execCmd(adb, ["mdns", "services"]);
    if (result.code !== 0) {
      return [];
    }

    return this.parseMdnsServices(result.stdout);
  }

  private parseMdnsServices(stdout: string): MdnsService[] {
    const services: MdnsService[] = [];

    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 3) {
        continue;
      }

      const [instance, serviceType, endpoint] = parts;
      if (!instance || !serviceType || !endpoint) {
        continue;
      }

      services.push({ instance, serviceType, endpoint });
    }

    return services;
  }

  private showQrPairingPanel(
    payload: string,
    pairServiceName: string,
    pairCode: string,
  ): void {
    const panel = vscode.window.createWebviewPanel(
      "flutterWiseQrPairing",
      "Flutter Wise: Scan QR to Pair",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    panel.webview.html = this.getQrPairingHtml(payload, pairServiceName, pairCode);
  }

  private getQrPairingHtml(
    payload: string,
    pairServiceName: string,
    pairCode: string,
  ): string {
    const nonce = this.createNonce();
    const escapedPayload = this.escapeHtml(payload);
    const escapedPairService = this.escapeHtml(pairServiceName);
    const escapedPairCode = this.escapeHtml(pairCode);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}' https://unpkg.com;"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pair Device with QR</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      padding: 20px;
      display: grid;
      gap: 14px;
      justify-items: center;
    }
    #qrcode {
      width: 288px;
      min-height: 288px;
      background: white;
      border-radius: 12px;
      display: grid;
      place-items: center;
      padding: 14px;
      box-sizing: border-box;
    }
    #status {
      margin: 0;
      text-align: center;
      opacity: 0.9;
    }
    .meta {
      width: min(560px, 100%);
      border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
      border-radius: 10px;
      padding: 12px;
      box-sizing: border-box;
      display: grid;
      gap: 8px;
    }
    .label {
      opacity: 0.75;
      font-size: 12px;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      word-break: break-all;
      user-select: all;
    }
  </style>
</head>
<body>
  <h2>Scan To Pair Device</h2>
  <div id="qrcode"></div>
  <p id="status">Preparing QR code...</p>
  <div class="meta">
    <div><span class="label">Service Name:</span> <code>${escapedPairService}</code></div>
    <div><span class="label">Pairing Code:</span> <code>${escapedPairCode}</code></div>
    <div><span class="label">QR Payload:</span> <code>${escapedPayload}</code></div>
  </div>
  <script nonce="${nonce}" src="https://unpkg.com/qrcodejs@1.0.0/qrcode.min.js"></script>
  <script nonce="${nonce}">
    const payload = ${JSON.stringify(payload)};
    const root = document.getElementById("qrcode");
    const status = document.getElementById("status");

    function setMessage(text) {
      if (status) {
        status.textContent = text;
      }
    }

    try {
      if (!window.QRCode) {
        throw new Error("QRCode library unavailable");
      }

      new window.QRCode(root, {
        text: payload,
        width: 260,
        height: 260,
        correctLevel: window.QRCode.CorrectLevel.M,
      });
      setMessage("Open Android Wireless debugging and scan this QR code.");
    } catch (error) {
      if (root) {
        root.innerHTML = "<strong>QR generation failed.</strong>";
      }
      setMessage("QR code could not be rendered. Use pairing code connection.");
    }
  </script>
</body>
</html>`;
  }

  private randomFromAlphabet(length: number, alphabet: string): string {
    const bytes = randomBytes(length);
    let result = "";

    for (let i = 0; i < length; i += 1) {
      result += alphabet[bytes[i] % alphabet.length];
    }

    return result;
  }

  private createNonce(): string {
    return randomBytes(16).toString("base64");
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async ensureAdbReady(showErrors: boolean): Promise<boolean> {
    const adb = await resolveAdbPath();
    const adbExists = await commandExists(adb!);
    if (!adbExists) {
      if (showErrors) {
        showToolMissing("adb");
      }
      return false;
    }

    const server = await execCmd(adb!, ["start-server"]);
    if (server.code !== 0) {
      if (showErrors) {
        const reason =
          this.cleanOutput(server.stderr) || this.cleanOutput(server.stdout);
        vscode.window.showErrorMessage(
          `Failed to start adb server${reason ? `: ${reason}` : ""}`,
        );
      }
      return false;
    }

    return true;
  }

  private async runAdbConnect(endpoint: string): Promise<void> {
    const adb = await resolveAdbPath();
    const result = await execCmd(adb!, ["connect", endpoint]);
    const output =
      this.cleanOutput(result.stdout) || this.cleanOutput(result.stderr);

    if (result.code !== 0) {
      vscode.window.showErrorMessage(
        `adb connect failed${output ? `: ${output}` : ""}`,
      );
      return;
    }

    vscode.window.showInformationMessage(output || `Connected to ${endpoint}.`);
  }

  private cleanOutput(value: string): string {
    return value.trim().replace(/\s+/g, " ");
  }
}

export function registerDevicesCommands(
  provider: FlutterWiseDevicesProvider,
): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand(CMD_REFRESH, () => provider.refresh()),
    vscode.commands.registerCommand(CMD_CONNECT, () =>
      provider.promptConnectMethod(),
    ),
    vscode.commands.registerCommand(CMD_CONNECT_IP, () =>
      provider.connectByIpAddress(),
    ),
    vscode.commands.registerCommand(CMD_CONNECT_QR, () =>
      provider.connectByQrCode(),
    ),
    vscode.commands.registerCommand(CMD_CONNECT_PAIR, () =>
      provider.connectByPairingCode(),
    ),
  ];
}
